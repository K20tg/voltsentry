import json
import pytest
from shared.schemas import AttackTrigger, AttackType
from simulator.battery import Battery
from simulator.twin import FleetManager, StationTwin


# ==============================================================================
# Pure Battery Model Tests
# ==============================================================================

def test_soc_monotonic():
    """Assert SoC is monotonically increasing during charging."""
    battery = Battery(initial_soc=10.0)
    last_soc = battery.soc

    while battery.soc < 100.0:
        power_kw, soc, energy_kwh = battery.tick(1.0)
        assert soc >= last_soc, f"SoC decreased from {last_soc} to {soc}"
        last_soc = soc

    assert battery.soc == 100.0


def test_power_never_exceeds_150kw():
    """Assert power never exceeds 150 kW limit under any configuration."""
    battery = Battery(initial_soc=0.0, max_power_kw=200.0)
    while battery.soc < 100.0:
        power_kw, soc, energy_kwh = battery.tick(1.0)
        assert power_kw <= 150.0, f"Power {power_kw} kW exceeded 150 kW cap"


def test_cv_taper_power_at_95_soc_below_60kw():
    """Assert power at 95% SoC is below 60 kW (CV taper phase)."""
    battery = Battery(initial_soc=94.5)

    while battery.soc < 95.0:
        battery.tick(1.0)

    power_kw, soc, _ = battery.tick(1.0)
    assert soc >= 95.0
    assert power_kw < 60.0, f"Power at {soc}% SoC was {power_kw} kW, expected < 60 kW"


def test_energy_accumulation():
    """Assert cumulative kWh is tracked accurately."""
    battery = Battery(initial_soc=20.0, max_power_kw=120.0)
    initial_energy = battery.energy_kwh

    power_kw, soc, energy_kwh = battery.tick(3600.0)  # 1 hour
    expected_energy = initial_energy + 120.0
    assert pytest.approx(energy_kwh, rel=1e-3) == expected_energy


def test_battery_edge_cases():
    """Assert battery handles 100% initial SoC and zero dt gracefully."""
    battery = Battery(initial_soc=100.0)
    power, soc, energy = battery.tick(10.0)
    assert power == 0.0
    assert soc == 100.0
    assert energy == 0.0

    battery_zero_dt = Battery(initial_soc=50.0)
    power, soc, energy = battery_zero_dt.tick(0.0)
    assert soc == 50.0
    assert energy == 0.0


# ==============================================================================
# Fleet Manager & Attack Trigger Unit Tests
# ==============================================================================

def test_fleet_manager_initialization():
    """Verify fleet manager creates 8 stations with staggered SoCs and start delays."""
    fleet = FleetManager(base_url="ws://localhost:8000", station_count=8)
    assert len(fleet.stations) == 8

    # Verify stations are CP-01 through CP-08
    station_ids = list(fleet.stations.keys())
    assert station_ids == [f"CP-{i:02d}" for i in range(1, 9)]

    # Check staggered initial SoCs
    socs = [s.initial_soc for s in fleet.stations.values()]
    assert len(set(socs)) > 1  # Not all identical


def test_fleet_manager_meter_spoof_trigger():
    """Verify Meter Spoof attack trigger targets named station."""
    fleet = FleetManager(base_url="ws://localhost:8000", station_count=8)
    trigger = AttackTrigger(attack_type=AttackType.METER_SPOOF, station_id="CP-03")

    ack = fleet.apply_trigger(trigger)
    assert ack.ok is True
    assert fleet.stations["CP-03"].mode == "meter_spoof"
    assert fleet.stations["CP-01"].mode == "clean"


def test_fleet_manager_oscillate_trigger():
    """Verify Fleet Oscillate attack trigger toggles all stations when station_id is None."""
    fleet = FleetManager(base_url="ws://localhost:8000", station_count=8)
    trigger = AttackTrigger(attack_type=AttackType.FLEET_OSCILLATE, station_id=None)

    ack = fleet.apply_trigger(trigger)
    assert ack.ok is True
    for s in fleet.stations.values():
        assert s.mode == "oscillate"


def test_fleet_manager_subtle_drift_trigger():
    """Verify Subtle Drift attack trigger sets drift mode and resets ticks."""
    fleet = FleetManager(base_url="ws://localhost:8000", station_count=8)
    station = fleet.stations["CP-02"]
    station.drift_ticks = 25

    trigger = AttackTrigger(attack_type=AttackType.SUBTLE_DRIFT, station_id="CP-02")
    ack = fleet.apply_trigger(trigger)
    assert ack.ok is True
    assert station.mode == "drift"
    assert station.drift_ticks == 0


def test_fleet_manager_reset_trigger():
    """Verify Reset returns all stations to clean mode and clears quarantine."""
    fleet = FleetManager(base_url="ws://localhost:8000", station_count=8)
    fleet.stations["CP-01"].mode = "oscillate"
    fleet.stations["CP-02"].mode = "drift"
    fleet.stations["CP-03"].mode = "meter_spoof"
    fleet.stations["CP-03"].is_quarantined = True

    trigger = AttackTrigger(attack_type=AttackType.RESET)
    ack = fleet.apply_trigger(trigger)
    assert ack.ok is True

    for s in fleet.stations.values():
        assert s.mode == "clean"
        assert s.drift_ticks == 0
        assert s.is_quarantined is False


def test_subtle_drift_math():
    """Verify drift compounds at 2% per tick and reaches target decay in ~40 ticks."""
    power = 120.0
    for _ in range(40):
        power *= 0.98
    # After 40 ticks, power should decay smoothly to between 50 and 55 kW
    assert 50.0 < power < 55.0


# ==============================================================================
# Inbound CALL Handling Tests ([FIX-6])
# ==============================================================================

@pytest.mark.asyncio
async def test_station_twin_inbound_change_availability():
    """Assert StationTwin handles inbound ChangeAvailability CALL and replies with CALLRESULT."""
    station = StationTwin("CP-01", "ws://localhost:8000")

    sent_messages = []
    class DummyWS:
        async def send(self, data):
            sent_messages.append(data)

    station.ws = DummyWS()

    # 1. Inoperative -> Quarantines station
    await station._handle_inbound_call(
        "uuid-123", "ChangeAvailability", {"connectorId": 1, "type": "Inoperative"}
    )
    assert station.is_quarantined is True
    assert len(sent_messages) == 1
    res1 = json.loads(sent_messages[0])
    assert res1 == [3, "uuid-123", {"status": "Accepted"}]

    # 2. Operative -> Clears quarantine
    await station._handle_inbound_call(
        "uuid-124", "ChangeAvailability", {"connectorId": 1, "type": "Operative"}
    )
    assert station.is_quarantined is False
    assert len(sent_messages) == 2
    res2 = json.loads(sent_messages[1])
    assert res2 == [3, "uuid-124", {"status": "Accepted"}]


@pytest.mark.asyncio
async def test_station_twin_inbound_reset():
    """Assert StationTwin handles inbound Reset CALL, resets state, and replies with CALLRESULT."""
    station = StationTwin("CP-01", "ws://localhost:8000")
    station.mode = "meter_spoof"
    station.is_quarantined = True
    station.drift_ticks = 15

    sent_messages = []
    class DummyWS:
        async def send(self, data):
            sent_messages.append(data)

    station.ws = DummyWS()

    await station._handle_inbound_call("uuid-999", "Reset", {"type": "Soft"})
    assert station.mode == "clean"
    assert station.is_quarantined is False
    assert station.drift_ticks == 0
    assert len(sent_messages) == 1
    res = json.loads(sent_messages[0])
    assert res == [3, "uuid-999", {"status": "Accepted"}]
