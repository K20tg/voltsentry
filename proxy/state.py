"""Per-station session state and cross-station registries — pure logic, no I/O.

This is the memory the rule engine reads. The relay (main.py) applies observed
frames to this state and asks rules.py to judge them.

What lives here (BRIEF.md):
  * per-station FSM  — enough to answer "is there a live Authorize->StartTransaction?"
  * transaction registry — transactionId -> owning cpid (R5)
  * connection registry — which cpids have a live socket (R4)
  * quarantine set — cpids the proxy has severed
  * pending-call map — uniqueId -> action, so a CALLRESULT can be correlated back
    to the CALL that produced it (a CALLRESULT does not carry the action name)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from shared.schemas import StationStatus


@dataclass
class StationState:
    """Everything the proxy knows about one charge point."""

    cpid: str
    status: StationStatus = StationStatus.AVAILABLE
    authorized: bool = False
    transaction_id: Optional[int] = None

    # uniqueId -> action, for correlating CALLRESULT back to its CALL.
    pending: dict[str, str] = field(default_factory=dict)

    # Telemetry / ML accumulators (populated later, kept here so one object
    # carries a station's whole story).
    session_start_ts: Optional[float] = None
    last_ts: Optional[float] = None
    last_power_kw: Optional[float] = None
    energy_integral_kwh: float = 0.0
    sample_count: int = 0

    @property
    def session_live(self) -> bool:
        """True once Authorize -> StartTransaction has completed and not stopped."""
        return self.authorized and self.transaction_id is not None


class ProxyState:
    """All station state plus the cross-station registries the rules need."""

    def __init__(self) -> None:
        self.stations: dict[str, StationState] = {}
        self.txn_owner: dict[int, str] = {}       # transactionId -> cpid  (R5)
        self.live_connections: set[str] = set()   # cpids with an open socket (R4)
        self.quarantined: set[str] = set()

    # ---- station lookup -------------------------------------------------
    def station(self, cpid: str) -> StationState:
        st = self.stations.get(cpid)
        if st is None:
            st = StationState(cpid=cpid)
            self.stations[cpid] = st
        return st

    def reset_session(self, cpid: str) -> None:
        """Clear a station's session FSM. A new socket is always a new session.

        Without this the proxy keeps FSM state across a reconnect, so a station
        that reconnects mid-transaction (after an attack, or a dropped socket)
        would trip R1 on every frame until it happened to re-authorise.
        """
        st = self.station(cpid)
        if st.transaction_id is not None:
            self.txn_owner.pop(st.transaction_id, None)
        st.authorized = False
        st.transaction_id = None
        st.status = StationStatus.AVAILABLE
        st.pending.clear()
        st.session_start_ts = None
        st.last_ts = None
        st.last_power_kw = None
        st.energy_integral_kwh = 0.0
        st.sample_count = 0

    # ---- connection registry (R4) --------------------------------------
    def register_connection(self, cpid: str) -> bool:
        """Register a new socket for cpid. Returns False if one is already live."""
        if cpid in self.live_connections:
            return False
        self.live_connections.add(cpid)
        return True

    def unregister_connection(self, cpid: str) -> None:
        self.live_connections.discard(cpid)

    # ---- pending-call map ----------------------------------------------
    def note_pending(self, cpid: str, unique_id: str, action: str) -> None:
        self.station(cpid).pending[unique_id] = action

    def resolve_pending(self, cpid: str, unique_id: str) -> Optional[str]:
        """Pop and return the action a CALLRESULT's uniqueId corresponds to."""
        return self.station(cpid).pending.pop(unique_id, None)

    # ---- FSM transitions ------------------------------------------------
    def apply_authorize(self, cpid: str) -> None:
        st = self.station(cpid)
        st.authorized = True
        st.status = StationStatus.PREPARING

    def apply_start_transaction(self, cpid: str, transaction_id: int) -> None:
        """Link a returned transactionId to its station (from the CALLRESULT)."""
        st = self.station(cpid)
        st.transaction_id = transaction_id
        st.status = StationStatus.CHARGING
        self.txn_owner[transaction_id] = cpid

    def apply_stop_transaction(self, cpid: str) -> None:
        st = self.station(cpid)
        if st.transaction_id is not None:
            self.txn_owner.pop(st.transaction_id, None)
        st.transaction_id = None
        st.authorized = False
        st.status = StationStatus.FINISHING

    # ---- quarantine -----------------------------------------------------
    def quarantine(self, cpid: str) -> None:
        self.quarantined.add(cpid)
        self.station(cpid).status = StationStatus.QUARANTINED

    def is_quarantined(self, cpid: str) -> bool:
        return cpid in self.quarantined

    def clear_quarantine(self, cpid: Optional[str] = None) -> None:
        """Clear one station, or all when cpid is None (attack.py reset)."""
        if cpid is None:
            self.quarantined.clear()
        else:
            self.quarantined.discard(cpid)
