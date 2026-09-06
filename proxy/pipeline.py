"""Per-frame detection pipeline: parse -> update state -> run rules -> emit.

Sits between raw transport (main.py) and the pure logic (ocpp/state/rules). It
holds no sockets and no globals: main.py passes in the shared ProxyState, the
OscillationDetector and an async `broadcast` callback, which keeps this glue
unit-testable and main.py transport-only (BRIEF.md).

H5 behaviour: detect, log and broadcast ThreatEvents. It does not yet sever or
drop the offending frame — active quarantine is H6.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Awaitable, Callable, Optional

from shared.schemas import ThreatEvent
from proxy import ocpp, rules
from proxy.state import ProxyState

Broadcast = Callable[[ThreatEvent], Awaitable[None]]

INCIDENTS_LOG = Path(__file__).resolve().parent.parent / "logs" / "incidents.jsonl"

# One threat per station per rule per cooldown window, so a sustained attack
# does not bury the dashboard timeline or the forensic log.
THROTTLE = rules.ThreatThrottle()


def build_threat(cpid: str, violation: rules.RuleViolation, raw_frame: Optional[str]) -> ThreatEvent:
    """Turn a RuleViolation into a Tier-1 ThreatEvent (never a hand-built dict)."""
    return ThreatEvent(
        station_id=cpid,
        ts=time.time(),
        tier=1,
        rule_id=violation.rule_id,
        severity=violation.severity,
        reason=violation.reason,
        action_taken="logged",
        raw_frame=raw_frame,
    )


def _log_incident(event: ThreatEvent) -> None:
    INCIDENTS_LOG.parent.mkdir(exist_ok=True)
    with INCIDENTS_LOG.open("a", encoding="utf-8") as fh:
        fh.write(event.model_dump_json() + "\n")


async def raise_threat(
    cpid: str,
    violation: rules.RuleViolation,
    raw_frame: Optional[str],
    broadcast: Broadcast,
) -> None:
    key = rules.throttle_key(cpid, violation.rule_id)
    if not THROTTLE.should_emit(key, violation.rule_id, time.time()):
        return
    event = build_threat(cpid, violation, raw_frame)
    print(f"[proxy] THREAT {cpid} {violation.rule_id}: {violation.reason}", flush=True)
    _log_incident(event)
    await broadcast(event)


async def inspect_upstream(
    state: ProxyState,
    oscillation: rules.OscillationDetector,
    cpid: str,
    raw: str,
    broadcast: Broadcast,
) -> None:
    """Run Tier-1 rules on a charger->CSMS frame and advance session state."""
    try:
        frame = ocpp.parse_frame(raw)
    except ValueError as exc:
        print(f"[proxy] {cpid} unparseable frame: {exc}", flush=True)
        return

    if frame.message_type_id != ocpp.CALL:
        return  # only CALLs from a charger carry something to score

    state.note_pending(cpid, frame.unique_id, frame.action)
    action = frame.action
    station = state.station(cpid)

    if action == "Authorize":
        state.apply_authorize(cpid)
    elif action == "MeterValues":
        for violation in (
            rules.check_state_order(station, action),
            rules.check_txn_integrity(state, cpid, (frame.payload or {}).get("transactionId")),
        ):
            if violation:
                await raise_threat(cpid, violation, raw, broadcast)
        mv = ocpp.extract_meter_values(frame.payload or {})
        phys = rules.check_physics(mv["power_kw"], mv["soc"])
        if phys:
            await raise_threat(cpid, phys, raw, broadcast)
    elif action in ("StartTransaction", "StopTransaction"):
        # Decide before mutating state: apply_stop_transaction moves the station
        # to FINISHING, which is exactly what marks a later Start as a re-start.
        counts = rules.is_oscillation_transition(action, station.status)
        if action == "StopTransaction":
            order = rules.check_state_order(station, action)
            if order:
                await raise_threat(cpid, order, raw, broadcast)
            state.apply_stop_transaction(cpid)
        if counts:
            now = time.time()
            oscillation.record_transition(now)
            osc = oscillation.check(now)
            if osc:
                await raise_threat(cpid, osc, raw, broadcast)


def inspect_downstream(state: ProxyState, cpid: str, raw: str) -> None:
    """Catch a StartTransaction CALLRESULT and link its returned transactionId."""
    try:
        frame = ocpp.parse_frame(raw)
    except ValueError:
        return
    if frame.message_type_id != ocpp.CALLRESULT:
        return
    action = state.resolve_pending(cpid, frame.unique_id)
    if action == "StartTransaction":
        txn = (frame.payload or {}).get("transactionId")
        if isinstance(txn, int):
            state.apply_start_transaction(cpid, txn)
