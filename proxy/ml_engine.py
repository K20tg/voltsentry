"""Tier-2 behavioural model (CONTEXT.md §5.B) — feature layer.

This module currently owns only the **feature vector**: the pure derivation of
the 5-dim session vector from raw MeterValues. The IsolationForest fit + pinned
score normalisation is H11 and will be added here later, consuming exactly this
vector.

Feature order is frozen and never reordered (CONTEXT.md / AGENTS.md):
    [power_kw, soc, dp_dt, duration_sec, energy_residual_kwh]
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

FEATURE_ORDER = ["power_kw", "soc", "dp_dt", "duration_sec", "energy_residual_kwh"]


@dataclass
class SessionFeatures:
    """One scored sample's features plus the accumulators to carry forward."""

    power_kw: float
    soc: float
    dp_dt: float
    duration_sec: float
    energy_residual_kwh: float
    # carried forward into the next sample (not part of the ML vector)
    energy_integral_kwh: float
    sample_count: int

    def as_vector(self) -> list[float]:
        """The 5-dim vector in the frozen FEATURE_ORDER."""
        return [self.power_kw, self.soc, self.dp_dt, self.duration_sec, self.energy_residual_kwh]


def compute_session_features(
    *,
    power_kw: float,
    soc: float,
    energy_register_kwh: float,
    ts: float,
    prev_ts: Optional[float],
    prev_power_kw: Optional[float],
    energy_integral_kwh: float,
    session_start_ts: Optional[float],
    sample_count: int,
) -> SessionFeatures:
    """Derive the feature vector for one MeterValues sample. Pure.

    * dp_dt is 0.0 on the first sample of a session (prev_ts is None) — FIX-10.
    * energy_residual = reported register - integral(reported power dt) — FIX-9.
      The integral accumulates the *reported* instantaneous power, so when a
      station under-reports power while its register keeps climbing on the truth,
      the residual grows monotonically and the forest fires.
    """
    if prev_ts is None:
        dt = 0.0
        dp_dt = 0.0
    else:
        dt = max(0.0, ts - prev_ts)
        dp_dt = 0.0 if dt == 0.0 else (power_kw - (prev_power_kw or 0.0)) / dt

    new_integral = energy_integral_kwh + power_kw * (dt / 3600.0)
    residual = energy_register_kwh - new_integral
    duration = 0.0 if session_start_ts is None else max(0.0, ts - session_start_ts)

    return SessionFeatures(
        power_kw=power_kw,
        soc=soc,
        dp_dt=dp_dt,
        duration_sec=duration,
        energy_residual_kwh=residual,
        energy_integral_kwh=new_integral,
        sample_count=sample_count + 1,
    )
