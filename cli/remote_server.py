"""Phone-based red-team remote for VoltSentry — LAN relay to the twin control channel.

The twin binds its control channel on 127.0.0.1 only, so a phone on WiFi cannot
reach it. This relay runs on the laptop and bridges the gap:

  * serves the mobile UI (cli/remote.html) on 0.0.0.0:8090 over one websockets.serve
  * a phone's WebSocket button press -> an AttackTrigger to the twin (:9100), ack relayed back
  * session_shadow (which the twin cannot self-inflict) is executed by the relay itself:
    it opens a duplicate socket to the proxy ingress with a live cpid and reports the reject

Stdlib + `websockets` only. No change to simulator/twin.py. Trusted demo network only:
it binds all interfaces with no authentication.
"""

from __future__ import annotations

import asyncio
import json
import socket
import time
import uuid
from http import HTTPStatus
from pathlib import Path
from typing import Optional

import websockets

from shared.schemas import AttackTrigger, AttackType, ControlAck

# ---- config ----------------------------------------------------------------
BIND_HOST = "0.0.0.0"
PORT = 8090
TWIN_CONTROL_URL = "ws://localhost:9100/control"
PROXY_INGRESS = "ws://localhost:8000"

CONTROL_TIMEOUT_SEC = 5.0
SHADOW_TIMEOUT_SEC = 4.0

HTML_PATH = Path(__file__).resolve().parent / "remote.html"

# Attacks forwarded to the twin as an AttackTrigger. session_shadow is handled
# by the relay itself (the twin cannot open a rogue socket against the proxy).
_FORWARDED = {
    "meter_spoof": AttackType.METER_SPOOF,
    "fleet_oscillate": AttackType.FLEET_OSCILLATE,
    "subtle_drift": AttackType.SUBTLE_DRIFT,
    "reset": AttackType.RESET,
}


# ---- static file serving (HTTP) -------------------------------------------
async def serve_static(path: str, request_headers):
    """Serve the UI for plain GETs; let WebSocket upgrades fall through.

    websockets calls this before the WS handshake. Returning None proceeds with
    the upgrade; returning a (status, headers, body) triple short-circuits with
    an HTTP response.
    """
    # A WebSocket upgrade carries the Upgrade header — let it proceed to handler.
    if request_headers.get("Upgrade", "").lower() == "websocket":
        return None

    route = path.split("?", 1)[0]
    if route in ("/", "/index.html"):
        try:
            body = HTML_PATH.read_bytes()
        except OSError as exc:
            return (HTTPStatus.INTERNAL_SERVER_ERROR, [], f"{exc}".encode())
        headers = [
            ("Content-Type", "text/html; charset=utf-8"),
            ("Content-Length", str(len(body))),
            ("Cache-Control", "no-store"),
        ]
        return (HTTPStatus.OK, headers, body)

    return (HTTPStatus.NOT_FOUND, [("Content-Type", "text/plain")], b"not found")


# ---- attack dispatch -------------------------------------------------------
async def _forward_to_twin(trigger: AttackTrigger) -> ControlAck:
    """Open a short-lived client socket to the twin, send one trigger, read one ack."""
    try:
        async with websockets.connect(TWIN_CONTROL_URL) as ws:
            await ws.send(trigger.model_dump_json())
            raw = await asyncio.wait_for(ws.recv(), timeout=CONTROL_TIMEOUT_SEC)
            return ControlAck.model_validate(json.loads(raw))
    except Exception as exc:  # noqa: BLE001 — surface any failure to the phone
        return ControlAck(ok=False, detail=f"twin control channel unreachable: {exc}")


def _call(action: str, payload: dict) -> str:
    return json.dumps([2, uuid.uuid4().hex[:8], action, payload])


async def _run_session_shadow(station_id: str) -> ControlAck:
    """Open a duplicate socket to the proxy with a live cpid; expect an R4 reject.

    The proxy trips R4_SESSION_UNIQUE at the handshake and closes ~4001. We push a
    BootNotification -> Authorize -> StartTransaction anyway and report the close.
    """
    cpid = station_id or "CP-01"
    url = f"{PROXY_INGRESS}/ocpp/{cpid}"
    try:
        async with websockets.connect(url) as ws:
            for action, payload in (
                ("BootNotification", {"chargePointVendor": "AttackerShadow", "chargePointModel": "EvilTwin-v1"}),
                ("Authorize", {"idTag": "SHADOW"}),
                ("StartTransaction", {"connectorId": 1, "idTag": "SHADOW", "meterStart": 0, "timestamp": "2026-09-07T00:00:00Z"}),
            ):
                await ws.send(_call(action, payload))
                await asyncio.wait_for(ws.recv(), timeout=SHADOW_TIMEOUT_SEC)
        return ControlAck(
            ok=True,
            detail=f"shadow socket to {cpid} was accepted (proxy did not reject — check R4)",
        )
    except websockets.ConnectionClosed as exc:
        rejected = exc.code in (4001, 1008) or exc.code >= 4000
        detail = f"proxy closed the shadow socket (code {exc.code} {exc.reason or 'R4_SESSION_UNIQUE'})"
        return ControlAck(ok=rejected, detail=detail)
    except Exception as exc:  # noqa: BLE001
        return ControlAck(ok=False, detail=f"shadow attack error: {exc}")


async def _dispatch(attack: str, station_id: Optional[str]) -> ControlAck:
    if attack == "session_shadow":
        return await _run_session_shadow(station_id or "CP-01")
    kind = _FORWARDED.get(attack)
    if kind is None:
        return ControlAck(ok=False, detail=f"unknown attack '{attack}'")
    # reset is fleet-wide; others carry an optional target (None => fleet).
    trigger = AttackTrigger(attack_type=kind, station_id=None if kind is AttackType.RESET else station_id)
    return await _forward_to_twin(trigger)


# ---- websocket handler (phone <-> relay) ----------------------------------
async def handler(ws) -> None:
    peer = getattr(ws, "remote_address", ("?",))[0]
    print(f"[remote] phone connected from {peer}", flush=True)
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
                if msg.get("cmd") != "trigger":
                    raise ValueError("expected cmd=trigger")
                attack = str(msg.get("attack", ""))
                station_id = msg.get("station_id")
                print(f"[remote] trigger {attack} target={station_id or 'fleet'}", flush=True)
                ack = await _dispatch(attack, station_id)
                reply = {"ok": ack.ok, "detail": ack.detail, "attack": attack, "ts": time.time()}
            except Exception as exc:  # never crash the handler on a bad message
                reply = {"ok": False, "detail": f"bad request: {exc}", "attack": "", "ts": time.time()}
            await ws.send(json.dumps(reply))
    except websockets.ConnectionClosed:
        pass
    finally:
        print(f"[remote] phone disconnected ({peer})", flush=True)


# ---- startup ---------------------------------------------------------------
def _lan_ip() -> str:
    """Best-effort LAN IP without sending packets (UDP connect just sets a route)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


async def main() -> None:
    ip = _lan_ip()
    async with websockets.serve(handler, BIND_HOST, PORT, process_request=serve_static):
        print(f"[remote] red-team relay serving on http://{ip}:{PORT}", flush=True)
        print(f"[remote] open this on your phone (same WiFi):  http://{ip}:{PORT}", flush=True)
        print("[remote] SECURITY: binds 0.0.0.0 with NO auth — trusted demo network only.", flush=True)
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("[remote] shutting down", flush=True)
