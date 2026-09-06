"""Tests for proxy.rules — Tier-1 deterministic checks (CONTEXT.md §5.B).

Rules are pure functions over state + frame. Trip conditions are pinned in the
CONTEXT.md §5.B table; these tests encode that table exactly.
"""

from shared.schemas import StationStatus

from proxy.rules import (
    OscillationDetector,
    ThreatThrottle,
    check_physics,
    check_session_unique,
    check_state_order,
    is_oscillation_transition,
    should_quarantine,
    throttle_key,
)
from proxy.state import ProxyState


# ---------------------------------------------------------------- R2 physics
# power_kw > 150.0, OR power_kw > 60.0 while soc > 80.0 (CV taper), OR power_kw < 0

def test_r2_normal_charging_passes():
    assert check_physics(power_kw=120.0, soc=45.0) is None


def test_r2_over_150_kw_trips():
    v = check_physics(power_kw=155.0, soc=40.0)
    assert v is not None and v.rule_id == "R2_PHYSICS"


def test_r2_high_power_at_high_soc_trips_cv_taper():
    # 90 kW while SoC 85% violates the CV taper (should be < 60 kW up there).
    v = check_physics(power_kw=90.0, soc=85.0)
    assert v is not None and v.rule_id == "R2_PHYSICS"


def test_r2_moderate_power_at_high_soc_passes():
    # 55 kW at SoC 85% is within the CV taper band.
    assert check_physics(power_kw=55.0, soc=85.0) is None


def test_r2_negative_power_trips():
    v = check_physics(power_kw=-5.0, soc=50.0)
    assert v is not None and v.rule_id == "R2_PHYSICS"


# ------------------------------------------------------------- R1 state order
# MeterValues / StopTransaction with no live Authorize->StartTransaction trips.

def test_r1_metervalues_without_session_trips():
    state = ProxyState()
    st = state.station("CP-01")
    v = check_state_order(st, "MeterValues")
    assert v is not None and v.rule_id == "R1_STATE_ORDER"


def test_r1_metervalues_with_live_session_passes():
    state = ProxyState()
    state.apply_authorize("CP-01")
    state.apply_start_transaction("CP-01", 1041)
    st = state.station("CP-01")
    assert check_state_order(st, "MeterValues") is None


def test_r1_stop_without_session_trips():
    state = ProxyState()
    st = state.station("CP-02")
    v = check_state_order(st, "StopTransaction")
    assert v is not None and v.rule_id == "R1_STATE_ORDER"


# ---------------------------------------------------------- R4 session unique
# Second handshake for a cpid with a live session trips.

def test_r4_first_connection_passes():
    state = ProxyState()
    assert check_session_unique(state, "CP-03") is None


def test_r4_duplicate_live_connection_trips():
    state = ProxyState()
    assert state.register_connection("CP-03")  # first socket
    v = check_session_unique(state, "CP-03")
    assert v is not None and v.rule_id == "R4_SESSION_UNIQUE"


# ------------------------------------------------------------ R3 oscillation
# >= 6 Start/Stop transitions fleet-wide in a 10 s window (fake clock).

def test_r3_five_transitions_in_window_pass():
    det = OscillationDetector()
    for i in range(5):
        det.record_transition(ts=float(i))
    assert det.check(now=4.0) is None


def test_r3_six_transitions_in_window_trip():
    det = OscillationDetector()
    for i in range(6):
        det.record_transition(ts=float(i))
    v = det.check(now=5.0)
    assert v is not None and v.rule_id == "R3_OSCILLATION"


def test_r3_old_transitions_outside_window_are_pruned():
    det = OscillationDetector()
    for i in range(6):
        det.record_transition(ts=float(i))  # events at t=0..5
    # At t=20, all six are older than the 10 s window -> no trip.
    assert det.check(now=20.0) is None


# Which frames count as an oscillation transition. A fleet of 8 stations booting
# fires 8 StartTransactions inside the 10 s window; if those counted, R3 would
# trip on normal startup before any attack. Only a *re-start* (a station that
# just stopped) is part of an oscillation cycle.

def test_r3_stop_transaction_always_counts():
    assert is_oscillation_transition("StopTransaction", StationStatus.CHARGING) is True


def test_r3_restart_after_stop_counts():
    # oscillate does Stop -> Start; the station sits in FINISHING when it restarts.
    assert is_oscillation_transition("StartTransaction", StationStatus.FINISHING) is True


def test_r3_first_start_of_a_session_does_not_count():
    # Normal fleet startup: Authorize (-> Preparing) then the session's first Start.
    assert is_oscillation_transition("StartTransaction", StationStatus.PREPARING) is False
    assert is_oscillation_transition("StartTransaction", StationStatus.AVAILABLE) is False


def test_r3_metervalues_is_not_a_transition():
    assert is_oscillation_transition("MeterValues", StationStatus.CHARGING) is False


# ------------------------------------------------------------ threat throttle
# An ongoing attack trips its rule on every frame. Without a cooldown the
# oscillate demo emits ~145 identical R3 events in 9 s, burying the dashboard
# timeline and the forensic log. One badge per station per rule per window.

def test_throttle_allows_first_threat():
    t = ThreatThrottle()
    assert t.should_emit("CP-03", "R3_OSCILLATION", now=100.0) is True


def test_throttle_suppresses_immediate_repeat():
    t = ThreatThrottle()
    t.should_emit("CP-03", "R3_OSCILLATION", now=100.0)
    assert t.should_emit("CP-03", "R3_OSCILLATION", now=100.5) is False


def test_throttle_allows_again_after_cooldown():
    t = ThreatThrottle()
    t.should_emit("CP-03", "R3_OSCILLATION", now=100.0)
    assert t.should_emit("CP-03", "R3_OSCILLATION", now=100.0 + t.COOLDOWN_SEC) is True


def test_throttle_is_per_station_and_per_rule():
    t = ThreatThrottle()
    t.should_emit("CP-03", "R2_PHYSICS", now=100.0)
    # a different station is throttled independently
    assert t.should_emit("CP-04", "R2_PHYSICS", now=100.1) is True
    # so is a different rule on the same station
    assert t.should_emit("CP-03", "R1_STATE_ORDER", now=100.1) is True


# R3 is defined fleet-wide (CONTEXT.md §5.B), so it must collapse to ONE badge
# per window, not one per station — an 8-station oscillate otherwise emits 8.

def test_throttle_key_is_fleet_wide_for_r3():
    assert throttle_key("CP-03", "R3_OSCILLATION") == throttle_key("CP-04", "R3_OSCILLATION")


def test_throttle_key_is_per_station_for_station_scoped_rules():
    assert throttle_key("CP-03", "R2_PHYSICS") != throttle_key("CP-04", "R2_PHYSICS")


def test_fleet_wide_r3_emits_once_across_stations():
    t = ThreatThrottle()
    assert t.should_emit(throttle_key("CP-03", "R3_OSCILLATION"), "R3_OSCILLATION", now=100.0) is True
    # a second station tripping the same fleet-wide rule is suppressed
    assert t.should_emit(throttle_key("CP-04", "R3_OSCILLATION"), "R3_OSCILLATION", now=100.1) is False


# ---------------------------------------------------------- quarantine policy
# A forged-data rule severs the station (drop frame + ChangeAvailability + 4001).
# A fleet-wide or transient rule alerts only — quarantining on R3 would sever all
# 8 stations on an oscillate, and R4 is already rejected at the handshake.

def test_quarantine_on_forged_data_rules():
    assert should_quarantine("R2_PHYSICS") is True
    assert should_quarantine("R5_TXN_INTEGRITY") is True


def test_no_quarantine_on_fleetwide_or_transient_rules():
    assert should_quarantine("R3_OSCILLATION") is False
    assert should_quarantine("R1_STATE_ORDER") is False
    assert should_quarantine("R4_SESSION_UNIQUE") is False
