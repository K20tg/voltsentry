"""VoltSentry proxy — asyncio transport + fanout.

  * OCPP ingress   accept ws://localhost:8000/ocpp/{cpid}, relay to CSMS :9000
  * dashboard feed fan out schema events on ws://localhost:8100/feed

Transport only. Per-frame detection is delegated to pipeline.py; judgement to
rules.py; memory to state.py (BRIEF.md). H6/H7 relay: it detects, emits real
TelemetryEvent + GridEvent on the feed, and actively quarantines a compromised
station (ChangeAvailability downstream, then close 4001 on the ack).
"""

from __future__ import annotations

import asyncio
import time

import websockets
from websockets.client import connect
from websockets.server import serve

from shared.schemas import GridEvent
from proxy import ocpp, pipeline, rules
from proxy.state import ProxyState

INGRESS_HOST, INGRESS_PORT = "localhost", 8000
CSMS_HOST, CSMS_PORT = "localhost", 9000
FEED_HOST, FEED_PORT = "localhost", 8100
OCPP_SUBPROTOCOL = "ocpp1.6"

# The shared 500 kVA transformer (CONTEXT.md §5.C). Treated as kW at unity PF
# for the headroom figure. Matches GridEvent.transformer_capacity_kva's default.
TRANSFORMER_CAPACITY_KVA = 500.0
GRID_TICK_SEC = 1.0
QUARANTINE_ACK_TIMEOUT_SEC = 3.0  # close anyway if the charger never acks

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


async def _quarantine_deadline(charger, cpid: str) -> None:
    """Close a quarantined charger even if it never acks the ChangeAvailability.

    BRIEF: without this the quarantine would hang mid-demo if the twin doesn't
    reply. Harmless if the ack path already closed — close() is idempotent.
    """
    await asyncio.sleep(QUARANTINE_ACK_TIMEOUT_SEC)
    if cpid in STATE.quarantine_ack_pending:
        STATE.quarantine_ack_pending.pop(cpid, None)
        print(f"[proxy] {cpid} quarantine ack timed out; closing 4001", flush=True)
        await charger.close(code=4001, reason="quarantined")


async def _pump_upstream(charger, csms, cpid: str) -> None:
    async for raw in charger:
        verdict = await pipeline.inspect_upstream(STATE, OSCILLATION, cpid, raw, FEED.broadcast)
        if verdict.start_quarantine:
            ca = ocpp.serialise_call(
                "ChangeAvailability",
                {"connectorId": 1, "type": "Inoperative"},
                unique_id=verdict.change_availability_uid,
            )
            print(f"[proxy] {cpid} QUARANTINE -> ChangeAvailability(Inoperative)", flush=True)
            await charger.send(ca)
            asyncio.create_task(_quarantine_deadline(charger, cpid))
            continue  # drop the offending frame
        if verdict.close:
            print(f"[proxy] {cpid} quarantine ack received; closing 4001", flush=True)
            await charger.close(code=4001, reason="quarantined")
            return
        if verdict.forward:
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

    STATE.reset_session(cpid)       # a new socket is always a new session
    STATE.clear_quarantine(cpid)    # reconnect un-quarantines (CONTEXT [FIX-7])
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


async def _grid_ticker() -> None:
    # Emit the transformer aggregate once a second (CONTEXT.md §5.C, [FIX-12]).
    # Real per-station telemetry is event-driven off MeterValues in the pipeline.
    while True:
        await asyncio.sleep(GRID_TICK_SEC)
        total_load_kw, active = STATE.grid_snapshot()
        headroom = max(0.0, (TRANSFORMER_CAPACITY_KVA - total_load_kw) / TRANSFORMER_CAPACITY_KVA * 100.0)
        await FEED.broadcast(
            GridEvent(
                ts=time.time(),
                total_load_kw=round(total_load_kw, 2),
                transformer_capacity_kva=TRANSFORMER_CAPACITY_KVA,
                headroom_pct=round(headroom, 1),
                active_stations=active,
            )
        )


async def main() -> None:
    async with serve(_handle_charger, INGRESS_HOST, INGRESS_PORT, subprotocols=[OCPP_SUBPROTOCOL]), \
            serve(_handle_feed, FEED_HOST, FEED_PORT):
        print(f"[proxy] OCPP ingress ws://{INGRESS_HOST}:{INGRESS_PORT}/ocpp/{{cpid}}", flush=True)
        print(f"[proxy] dashboard feed ws://{FEED_HOST}:{FEED_PORT}/feed", flush=True)
        await _grid_ticker()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("[proxy] shutting down", flush=True)
