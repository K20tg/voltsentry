"""VoltSentry proxy — asyncio transport + fanout.

  * OCPP ingress   accept ws://localhost:8000/ocpp/{cpid}, relay to CSMS :9000
  * dashboard feed fan out schema events on ws://localhost:8100/feed

Transport only. Per-frame detection is delegated to pipeline.py; judgement to
rules.py; memory to state.py (BRIEF.md). This is the H5 relay — it detects,
logs and broadcasts ThreatEvents but does not yet sever or drop (quarantine is
H6, real telemetry emission H7).
"""

from __future__ import annotations

import asyncio
import time

import websockets
from websockets.client import connect
from websockets.server import serve

from shared.schemas import StationStatus, TelemetryEvent
from proxy import pipeline, rules
from proxy.state import ProxyState

INGRESS_HOST, INGRESS_PORT = "localhost", 8000
CSMS_HOST, CSMS_PORT = "localhost", 9000
FEED_HOST, FEED_PORT = "localhost", 8100
OCPP_SUBPROTOCOL = "ocpp1.6"

# Process-wide shared state: one registry for the whole fleet (R3 is fleet-wide,
# the txn registry spans stations) and one oscillation window.
STATE = ProxyState()
OSCILLATION = rules.OscillationDetector()


class FeedHub:
    """Connected dashboard sockets + a broadcast coroutine."""

    def __init__(self) -> None:
        self._clients: set = set()

    def add(self, ws) -> None:
        self._clients.add(ws)

    def discard(self, ws) -> None:
        self._clients.discard(ws)

    async def broadcast(self, event) -> None:
        # Always serialise via the schema model — never hand-build the dict.
        if not self._clients:
            return
        payload = event.model_dump_json()
        await asyncio.gather(
            *(c.send(payload) for c in list(self._clients)),
            return_exceptions=True,
        )


FEED = FeedHub()


def _cpid_from_path(path: str) -> str | None:
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 2 and parts[0] == "ocpp":
        return parts[1]
    return None


async def _pump_upstream(charger, csms, cpid: str) -> None:
    async for raw in charger:
        print(f"[proxy] {cpid} ->csms {raw}", flush=True)
        await pipeline.inspect_upstream(STATE, OSCILLATION, cpid, raw, FEED.broadcast)
        await csms.send(raw)


async def _pump_downstream(csms, charger, cpid: str) -> None:
    async for raw in csms:
        print(f"[proxy] {cpid} ->cp   {raw}", flush=True)
        pipeline.inspect_downstream(STATE, cpid, raw)
        await charger.send(raw)


async def _handle_charger(charger) -> None:
    cpid = _cpid_from_path(charger.path)
    if cpid is None:
        await charger.close(code=1008, reason="expected /ocpp/{cpid}")
        return

    # R4 — reject a second handshake for a station that already has a live socket.
    shadow = rules.check_session_unique(STATE, cpid)
    if shadow is not None:
        await pipeline.raise_threat(cpid, shadow, None, FEED.broadcast)
        await charger.close(code=4001, reason="duplicate session")
        return

    STATE.reset_session(cpid)  # a new socket is always a new session
    STATE.register_connection(cpid)
    upstream_uri = f"ws://{CSMS_HOST}:{CSMS_PORT}/ocpp/{cpid}"
    print(f"[proxy] {cpid} connected; dialing upstream {upstream_uri}", flush=True)
    try:
        async with connect(upstream_uri, subprotocols=[OCPP_SUBPROTOCOL]) as csms:
            # Tear down as soon as EITHER side closes. gather() would wait for
            # both, so a charger hang-up would leave the downstream pump parked
            # on the CSMS socket, the handler never reaching its finally — the
            # station would stay registered and its reconnect would trip R4.
            pumps = [
                asyncio.create_task(_pump_upstream(charger, csms, cpid)),
                asyncio.create_task(_pump_downstream(csms, charger, cpid)),
            ]
            done, pending = await asyncio.wait(pumps, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in done:
                exc = task.exception()
                if exc is not None and not isinstance(exc, websockets.ConnectionClosed):
                    raise exc
    except OSError as exc:
        print(f"[proxy] {cpid} upstream dial failed: {exc}", flush=True)
        await charger.close(code=1011, reason="upstream unavailable")
    except websockets.ConnectionClosed:
        print(f"[proxy] {cpid} connection closed", flush=True)
    finally:
        STATE.unregister_connection(cpid)


async def _handle_feed(ws) -> None:
    # A dashboard client: we only broadcast to it; inbound frames are ignored.
    print("[proxy] dashboard client connected on :8100/feed", flush=True)
    FEED.add(ws)
    try:
        await ws.wait_closed()
    finally:
        FEED.discard(ws)
        print("[proxy] dashboard client disconnected", flush=True)


async def _synthetic_ticker() -> None:
    # P1.3 scaffolding: a synthetic TelemetryEvent/sec so Person 3 has a live
    # feed before the twin exists. Replaced by real telemetry at H7.
    soc, t0 = 20.0, time.time()
    while True:
        await asyncio.sleep(1.0)
        soc = min(100.0, soc + 0.5)
        power = 120.0 if soc < 80.0 else max(10.0, 120.0 * (100.0 - soc) / 20.0)
        await FEED.broadcast(
            TelemetryEvent(
                station_id="CP-01",
                transaction_id=1041,
                ts=time.time(),
                power_kw=power,
                soc=soc,
                dp_dt=0.0,
                duration_sec=time.time() - t0,
                energy_register_kwh=0.0,
                energy_residual_kwh=0.0,
                status=StationStatus.CHARGING,
            )
        )


async def main() -> None:
    async with serve(_handle_charger, INGRESS_HOST, INGRESS_PORT, subprotocols=[OCPP_SUBPROTOCOL]), \
            serve(_handle_feed, FEED_HOST, FEED_PORT):
        print(f"[proxy] OCPP ingress ws://{INGRESS_HOST}:{INGRESS_PORT}/ocpp/{{cpid}}", flush=True)
        print(f"[proxy] dashboard feed ws://{FEED_HOST}:{FEED_PORT}/feed", flush=True)
        await _synthetic_ticker()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("[proxy] shutting down", flush=True)
