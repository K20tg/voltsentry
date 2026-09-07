"""Per-frame detection pipeline: parse -> update state -> score -> emit + verdict.

Sits between raw transport (main.py) and the pure logic (ocpp/state/rules/
ml_engine). It holds no sockets: main.py passes in the shared ProxyState, the
OscillationDetector and an async `broadcast` callback, and acts on the returned
Verdict. That keeps this glue unit-testable and main.py transport-only (BRIEF).

H6/H7 behaviour:
  * emit a real TelemetryEvent per MeterValues (feature vector from ml_engine)
  * on a forged-data rule, arm active quarantine: the offending frame is dropped
    and main.py sends ChangeAvailability downstream, then closes 4001 on the ack
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional

from shared.schemas import StationStatus, TelemetryEvent, ThreatEvent
from proxy import ml_engine, ocpp, rules
from proxy.state import ProxyState

# Tier-2 behavioural model, loaded once at import from the trained artifact
# (fit on a real dataset by proxy/train_tier2.py). If the pickle is absent the
# proxy still runs — ml_score just stays 0.0. Cold start: the first two samples
# of a session are not scored, so a session start never false-positives on
# camera (FIX-10 / BRIEF).
MODEL_PATH = Path(__file__).resolve().parent / "models" / "tier2.pkl"
ML_COLD_START_SAMPLES = 2
ML_RULE_ID = "ML_ANOMALY"

try:
    ML_MODEL = ml_engine.Tier2Model.load(MODEL_PATH)
except Exception:
    ML_MODEL = None
    print("[proxy] Tier-2 model not found, ml_score stays 0.0", flush=True)

# broadcast takes any feed schema model (Telemetry / Threat / Grid).
Broadcast = Callable[[Any], Awaitable[None]]

INCIDENTS_LOG = Path(__file__).resolve().parent.parent / "logs" / "incidents.jsonl"

# One threat per station per rule per cooldown window, so a sustained attack
# does not bury the dashboard timeline or the forensic log.
THROTTLE = rules.ThreatThrottle()


@dataclass
class Verdict:
    """What transport should do with the frame just inspected."""

    forward: bool = True                    # relay it upstream to the CSMS?
    start_quarantine: bool = False          # send ChangeAvailability downstream
    change_availability_uid: Optional[str] = None
    close: bool = False                     # close the charger socket with 4001


def build_threat(
    cpid: str, violation: rules.RuleViolation, raw_frame: Optional[str], action_taken: str
) -> ThreatEvent:
    """Turn a RuleViolation into a Tier-1 ThreatEvent (never a hand-built dict)."""
    return ThreatEvent(
        station_id=cpid,
        ts=time.time(),
        tier=1,
        rule_id=violation.rule_id,
        severity=violation.severity,
        reason=violation.reason,
        action_taken=action_taken,
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
    action_taken: str = "logged",
) -> None:
    key = rules.throttle_key(cpid, violation.rule_id)
    if not THROTTLE.should_emit(key, violation.rule_id, time.time()):
        return
    event = build_threat(cpid, violation, raw_frame, action_taken)
    print(f"[proxy] THREAT {cpid} {violation.rule_id} ({action_taken}): {violation.reason}", flush=True)
    _log_incident(event)
    await broadcast(event)


def _score_sample(feats) -> float:
    """Tier-2 score for one sample, honouring the cold-start contract.

    dp_dt is undefined on sample 1 and noisy on sample 2, so samples 1–2 score
    0.0 (BRIEF / FIX-10). From sample 3 on, the fitted forest scores the frozen
    5-dim vector; the residual feature is what climbs on a spoof/drift.
    """
    if feats.sample_count <= ML_COLD_START_SAMPLES or ML_MODEL is None:
        return 0.0
    return ML_MODEL.score(feats.as_vector())


async def _raise_ml_threat(cpid: str, ml_score: float, raw: str, broadcast: Broadcast) -> None:
    """Emit a throttled Tier-2 ThreatEvent (the yellow ML badge, plan H13)."""
    if not THROTTLE.should_emit(cpid, ML_RULE_ID, time.time()):
        return
    event = ThreatEvent(
        station_id=cpid,
        ts=time.time(),
        tier=2,
        ml_score=round(ml_score, 3),
        severity="medium",
        reason=f"behavioural anomaly (ML {ml_score:.2f})",
        action_taken="logged",
        raw_frame=raw,
    )
    print(f"[proxy] THREAT {cpid} {ML_RULE_ID} (logged): ML score {ml_score:.2f}", flush=True)
    _log_incident(event)
    await broadcast(event)


async def _emit_telemetry(
    state: ProxyState, cpid: str, mv: dict, raw: str, broadcast: Broadcast
):
    """Fold a MeterValues into state, score it, and broadcast a TelemetryEvent.

    Returns the SessionFeatures so the Tier-1 pass can judge the energy residual
    (R6) off the same accumulators, rather than integrating the session twice.
    """
    station = state.station(cpid)
    feats = station.record_meter_sample(
        power_kw=mv["power_kw"],
        soc=mv["soc"],
        energy_register_kwh=mv["energy_register_kwh"],
        ts=time.time(),
    )
    ml_score = _score_sample(feats)
    try:
        event = TelemetryEvent(
            station_id=cpid,
            transaction_id=station.transaction_id,
            ts=time.time(),
            power_kw=feats.power_kw,
            soc=min(100.0, max(0.0, feats.soc)),  # schema bounds; a spoof may lie
            dp_dt=feats.dp_dt,
            duration_sec=feats.duration_sec,
            energy_register_kwh=mv["energy_register_kwh"],
            energy_residual_kwh=feats.energy_residual_kwh,
            status=station.status,
            ml_score=ml_score,
        )
    except Exception as exc:  # never let one bad frame kill the feed
        print(f"[proxy] {cpid} telemetry build failed: {exc}", flush=True)
        return feats
    await broadcast(event)
    if ml_score > ml_engine.ML_ALERT_THRESHOLD:
        await _raise_ml_threat(cpid, ml_score, raw, broadcast)
    return feats


async def inspect_upstream(
    state: ProxyState,
    oscillation: rules.OscillationDetector,
    cpid: str,
    raw: str,
    broadcast: Broadcast,
) -> Verdict:
    """Score a charger->CSMS frame, emit telemetry/threats, return a Verdict."""
    # Mid-quarantine: drop everything, and close once the ChangeAvailability ack
    # comes back from the charger.
    pending_uid = state.quarantine_ack_pending.get(cpid)
    if pending_uid is not None:
        try:
            frame = ocpp.parse_frame(raw)
        except ValueError:
            return Verdict(forward=False)
        if frame.message_type_id == ocpp.CALLRESULT and frame.unique_id == pending_uid:
            state.quarantine_ack_pending.pop(cpid, None)
            return Verdict(forward=False, close=True)
        return Verdict(forward=False)

    try:
        frame = ocpp.parse_frame(raw)
    except ValueError as exc:
        print(f"[proxy] {cpid} unparseable frame: {exc}", flush=True)
        return Verdict(forward=True)  # stay a transparent relay for junk we can't read

    if frame.message_type_id != ocpp.CALL:
        return Verdict(forward=True)

    state.note_pending(cpid, frame.unique_id, frame.action)
    action = frame.action
    station = state.station(cpid)

    if action == "Authorize":
        state.apply_authorize(cpid)
    elif action == "MeterValues":
        mv = ocpp.extract_meter_values(frame.payload or {})
        feats = await _emit_telemetry(state, cpid, mv, raw, broadcast)

        quarantine_uid: Optional[str] = None
        violations = [
            rules.check_state_order(station, action),
            rules.check_txn_integrity(state, cpid, (frame.payload or {}).get("transactionId")),
            rules.check_physics(mv["power_kw"], mv["soc"]),
            rules.check_meter_fraud(feats.energy_residual_kwh, feats.residual_rate_kwh_per_sec),
        ]
        for violation in violations:
            if not violation:
                continue
            quarantine = rules.should_quarantine(violation.rule_id)
            await raise_threat(
                cpid, violation, raw, broadcast,
                action_taken="quarantined" if quarantine else "logged",
            )
            if quarantine and quarantine_uid is None:
                quarantine_uid = uuid.uuid4().hex
                state.quarantine(cpid)
                state.quarantine_ack_pending[cpid] = quarantine_uid

        if quarantine_uid is not None:
            return Verdict(forward=False, start_quarantine=True, change_availability_uid=quarantine_uid)
    elif action in ("StartTransaction", "StopTransaction"):
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

    return Verdict(forward=True)


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
