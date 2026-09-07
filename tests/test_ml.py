"""Tests for proxy.ml_engine — the Tier-2 feature vector (CONTEXT.md §5.B).

The IsolationForest itself is H11 work. What is testable now is the pure
derivation of the 5-dim session feature vector from raw MeterValues samples,
including the two contract corners that bite on camera:
  * dp_dt cold start  (FIX-10): 0.0 on the first sample of a session
  * energy_residual   (FIX-9): register - integral(reported power); ~0 when
    honest, climbing when power is under-reported (meter_spoof / drift)
"""

from proxy.ml_engine import (
    FEATURE_ORDER,
    Tier2Model,
    compute_session_features,
    generate_baseline,
)


def _first(**over):
    """A first-sample call (no prior state) with sensible defaults."""
    base = dict(
        power_kw=120.0,
        soc=20.0,
        energy_register_kwh=0.0,
        ts=1000.0,
        prev_ts=None,
        prev_power_kw=None,
        energy_integral_kwh=0.0,
        session_start_ts=1000.0,
        sample_count=0,
    )
    base.update(over)
    return compute_session_features(**base)


def test_feature_order_is_frozen():
    assert FEATURE_ORDER == [
        "power_kw",
        "soc",
        "dp_dt",
        "duration_sec",
        "energy_residual_kwh",
    ]


def test_first_sample_has_zero_dp_dt():
    f = _first()
    assert f.dp_dt == 0.0
    assert f.duration_sec == 0.0
    assert f.sample_count == 1


def test_as_vector_matches_feature_order():
    f = _first(power_kw=110.0, soc=42.0)
    assert f.as_vector() == [f.power_kw, f.soc, f.dp_dt, f.duration_sec, f.energy_residual_kwh]


def test_dp_dt_is_power_delta_over_time_delta():
    # 100 kW -> 130 kW across 2 s => +15 kW/s
    f = compute_session_features(
        power_kw=130.0, soc=25.0, energy_register_kwh=0.1, ts=1002.0,
        prev_ts=1000.0, prev_power_kw=100.0, energy_integral_kwh=0.0,
        session_start_ts=1000.0, sample_count=1,
    )
    assert f.dp_dt == 15.0
    assert f.duration_sec == 2.0


def test_honest_session_residual_near_zero():
    # 120 kW held for one hour: the register (120 kWh) matches the integral of
    # reported power, so the residual sits on its N(0, 0.05) baseline.
    f = compute_session_features(
        power_kw=120.0, soc=80.0, energy_register_kwh=120.0, ts=3600.0,
        prev_ts=0.0, prev_power_kw=120.0, energy_integral_kwh=0.0,
        session_start_ts=0.0, sample_count=1,
    )
    assert abs(f.energy_residual_kwh) < 0.05


def test_under_reported_power_makes_residual_climb():
    # meter_spoof: reports 5 kW while the register still reflects true ~120 kWh.
    f = compute_session_features(
        power_kw=5.0, soc=50.0, energy_register_kwh=120.0, ts=3600.0,
        prev_ts=0.0, prev_power_kw=5.0, energy_integral_kwh=0.0,
        session_start_ts=0.0, sample_count=1,
    )
    assert f.energy_residual_kwh > 100.0


def test_integral_accumulates_across_samples():
    # Feeding the returned integral back in should keep growing it.
    f1 = compute_session_features(
        power_kw=120.0, soc=30.0, energy_register_kwh=0.033, ts=1.0,
        prev_ts=0.0, prev_power_kw=120.0, energy_integral_kwh=0.0,
        session_start_ts=0.0, sample_count=1,
    )
    f2 = compute_session_features(
        power_kw=120.0, soc=31.0, energy_register_kwh=0.066, ts=2.0,
        prev_ts=1.0, prev_power_kw=120.0,
        energy_integral_kwh=f1.energy_integral_kwh,
        session_start_ts=0.0, sample_count=f1.sample_count,
    )
    assert f2.energy_integral_kwh > f1.energy_integral_kwh > 0.0
    assert f2.sample_count == 3  # started at 1, two more samples counted


# ---- Tier-2 IsolationForest scorer (CONTEXT.md §5.B, plan H11) -------------


def test_baseline_generator_shape_is_1000x5():
    # The synthetic CC-CV baseline is 1000 vectors in the frozen 5-dim order.
    X = generate_baseline()
    assert X.shape == (1000, len(FEATURE_ORDER))


def test_baseline_is_deterministic():
    # random_state=42 is load-bearing for demo reproducibility (AGENTS.md).
    import numpy as np

    assert np.array_equal(generate_baseline(), generate_baseline())


def test_clean_cc_vector_scores_below_0_2():
    # A textbook constant-current sample sits deep in the baseline -> low score.
    model = Tier2Model()
    clean = [120.0, 45.0, 0.0, 600.0, 0.0]  # honest CC, residual ~0
    assert model.score(clean) < 0.2


def test_drifted_vector_scores_above_0_65():
    # subtle_drift (CONTEXT §5.D): a −2%/tick compounding power under-report. That
    # drifts BOTH axes off the baseline — reported power sags low-for-SoC while the
    # energy residual climbs (the register still reflects true energy). This is the
    # money-demo assertion (plan H13): ML fires with no rule.
    model = Tier2Model()
    drifted = [65.5, 30.0, -0.4, 600.0, 27.3]  # ~30 ticks into the drift
    assert model.score(drifted) > 0.65


def test_score_is_clipped_to_unit_interval():
    model = Tier2Model()
    for vec in ([120.0, 45.0, 0.0, 600.0, 0.0], [500.0, 200.0, 50.0, 9000.0, 99.0]):
        s = model.score(vec)
        assert 0.0 <= s <= 1.0


def test_model_is_deterministic_across_instances():
    # Two independently constructed models must agree (pinned seed + normaliser).
    a, b = Tier2Model(), Tier2Model()
    vec = [65.5, 30.0, -0.4, 600.0, 27.3]
    assert a.score(vec) == b.score(vec)
