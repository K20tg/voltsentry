"""Tier-2 behavioural model (CONTEXT.md §5.B).

Two layers, both pure logic (no I/O):

  * the **feature vector** — derivation of the frozen 5-dim session vector from
    raw MeterValues (`compute_session_features`);
  * the **IsolationForest scorer** — a synthetic CC-CV baseline, the pinned
    forest, and the pinned score normalisation (`Tier2Model`, `generate_baseline`).

Feature order is frozen and never reordered (CONTEXT.md / AGENTS.md):
    [power_kw, soc, dp_dt, duration_sec, energy_residual_kwh]
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

import numpy as np
from sklearn.ensemble import IsolationForest

FEATURE_ORDER = ["power_kw", "soc", "dp_dt", "duration_sec", "energy_residual_kwh"]

# Pinned model hyperparameters (CONTEXT.md §5.B / AGENTS.md). The seed is
# load-bearing for demo reproducibility — never remove it.
N_ESTIMATORS = 100
CONTAMINATION = 0.02
RANDOM_STATE = 42
BASELINE_N = 1000

# CV taper knee — the SoC at which honest CC-CV charging leaves constant current
# (mirrors rules.py's R2 envelope; kept local to avoid a rules<-state<-ml cycle).
CV_TAPER_SOC = 80.0

# Alert threshold on the normalised score (CONTEXT.md §5.B).
ML_ALERT_THRESHOLD = 0.65


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


def generate_baseline(n: int = BASELINE_N, seed: int = RANDOM_STATE) -> np.ndarray:
    """Synthesize `n` honest CC-CV feature vectors (CONTEXT.md §5.B, plan H11).

    No labelled data and no training loop: the baseline *is* the physics. A clean
    session holds constant current (~120 kW) to 80% SoC, then tapers exponentially
    toward 100%, with dp_dt near zero and the energy residual on its N(0, 0.05)
    baseline (FIX-9). Deterministic given `seed` so the fitted forest — and the
    "0.65" threshold — mean the same thing every boot.

    Returns an (n, 5) array in the frozen FEATURE_ORDER.
    """
    rng = np.random.default_rng(seed)
    soc = rng.uniform(5.0, 100.0, n)

    # Power: flat CC below the CV knee, exponential taper above it.
    cc = soc <= CV_TAPER_SOC
    power = np.where(
        cc,
        120.0 + rng.normal(0.0, 2.0, n),
        120.0 * np.exp(-(soc - CV_TAPER_SOC) / 7.0) + rng.normal(0.0, 1.0, n),
    )
    power = np.clip(power, 0.0, None)

    # dp_dt: ~0 during CC, gently negative during the taper.
    dp_dt = np.where(cc, rng.normal(0.0, 0.3, n), rng.normal(-0.4, 0.3, n))

    duration = rng.uniform(0.0, 3600.0, n)
    residual = rng.normal(0.0, 0.05, n)

    return np.column_stack([power, soc, dp_dt, duration, residual])


class Tier2Model:
    """IsolationForest scorer with the pinned normalisation (CONTEXT.md §5.B).

    `decision_function` returns *higher = more normal* on an unbounded raw scale,
    so a bare threshold means nothing across processes. Normalisation is pinned
    at fit time against the baseline:

        d      = clf.decision_function(X_train)
        d_max  = d.max()
        d_min  = percentile(d, 0.5)
        score  = clip((d_max - clf.decision_function(x)) / (d_max - d_min), 0, 1)

    Deterministic given random_state=42. Alert when score > 0.65.
    """

    def __init__(self) -> None:
        X = generate_baseline()
        self.clf = IsolationForest(
            n_estimators=N_ESTIMATORS,
            contamination=CONTAMINATION,
            random_state=RANDOM_STATE,
        ).fit(X)
        d = self.clf.decision_function(X)
        self._d_max = float(d.max())
        self._d_min = float(np.percentile(d, 0.5))
        # Degenerate baseline (all-equal scores) — avoid a zero-width divide.
        self._span = max(self._d_max - self._d_min, 1e-9)

    def score(self, vector: Sequence[float]) -> float:
        """Normalised anomaly score in [0, 1]; > 0.65 is an alert."""
        raw = float(self.clf.decision_function([list(vector)])[0])
        return float(np.clip((self._d_max - raw) / self._span, 0.0, 1.0))
