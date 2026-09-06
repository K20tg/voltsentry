"""VoltSentry shared data contract.

FROZEN AT HOUR 1. Do not edit without all three owners physically present.
Every field here is consumed by at least two of the three processes; a silent
rename costs an integration hour you do not have.
"""

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class StationStatus(str, Enum):
    AVAILABLE = "Available"
    PREPARING = "Preparing"
    CHARGING = "Charging"
    FINISHING = "Finishing"
    QUARANTINED = "Quarantined"
    OFFLINE = "Offline"


class AttackType(str, Enum):
    METER_SPOOF = "meter_spoof"
    FLEET_OSCILLATE = "fleet_oscillate"
    SESSION_SHADOW = "session_shadow"
    SUBTLE_DRIFT = "subtle_drift"
    RESET = "reset"


# --------------------------------------------------------------------------
# Dashboard feed  --  ws://localhost:8100/feed
# Every frame on this socket is exactly one of the three models below,
# discriminated by the literal `event` field. The dashboard switches on it.
# --------------------------------------------------------------------------


class TelemetryEvent(BaseModel):
    event: Literal["telemetry"] = "telemetry"
    station_id: str                       # "CP-04" == OCPP chargePointId
    transaction_id: Optional[int] = None
    ts: float                             # proxy receive clock, unix epoch seconds
    power_kw: float
    soc: float = Field(ge=0.0, le=100.0)
    dp_dt: float                          # kW/s; 0.0 on the first sample of a session
    duration_sec: float
    energy_register_kwh: float            # meter's cumulative register, as reported
    energy_residual_kwh: float            # register - integral(reported power dt)
    status: StationStatus
    ml_score: float = Field(default=0.0, ge=0.0, le=1.0)


class ThreatEvent(BaseModel):
    event: Literal["threat"] = "threat"
    station_id: str
    ts: float
    tier: Literal[1, 2]
    rule_id: Optional[str] = None         # "R2_PHYSICS" etc, tier 1 only
    ml_score: Optional[float] = None      # tier 2 only
    severity: Literal["low", "medium", "high"]
    reason: str                           # human-readable, rendered on the badge
    action_taken: Literal["logged", "frame_dropped", "quarantined"]
    raw_frame: Optional[str] = None       # forensic copy of the offending frame


class GridEvent(BaseModel):
    event: Literal["grid"] = "grid"
    ts: float
    total_load_kw: float
    transformer_capacity_kva: float = 500.0
    headroom_pct: float
    active_stations: int


# --------------------------------------------------------------------------
# Twin control channel  --  ws://localhost:9100/control
# The red-team CLI drives the twin through this. It does NOT touch the
# twin<->proxy socket; see CONTEXT.md [FIX-4].
# --------------------------------------------------------------------------


class AttackTrigger(BaseModel):
    attack_type: AttackType
    station_id: Optional[str] = None      # None => fleet-wide
    params: dict = Field(default_factory=dict)


class ControlAck(BaseModel):
    ok: bool
    detail: str = ""
