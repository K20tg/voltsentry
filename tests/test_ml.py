"""Tests for proxy.ml_engine — the Tier-2 feature vector (CONTEXT.md §5.B).

The IsolationForest itself is H11 work. What is testable now is the pure
derivation of the 5-dim session feature vector from raw MeterValues samples,
including the two contract corners that bite on camera:
  * dp_dt cold start  (FIX-10): 0.0 on the first sample of a session
  * energy_residual   (FIX-9): register - integral(reported power); ~0 when
    honest, climbing when power is under-reported (meter_spoof / drift)
"""

import numpy as np

from proxy.ml_engine import (
    FEATURE_ORDER,
    Tier2Model,
    compute_session_features,
    cusum_residual,
    fit_tier2,
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


# ---- Tier-2 IsolationForest scorer (CONTEXT.md §5.B) ----------------------
#
# The model is now fitted on a training set X (real dataset vectors, optionally
# augmented with the synthetic CC-CV baseline for a stable forest). `fit_tier2`
# fits the pinned IsolationForest and freezes the score normalisation.


def _baseline_model():
    """A model fitted on the synthetic CC-CV baseline (stable, deterministic)."""
    return fit_tier2(generate_baseline())


def test_baseline_generator_shape_is_1000x5():
    X = generate_baseline()
    assert X.shape == (1000, len(FEATURE_ORDER))


def test_baseline_is_deterministic():
    # random_state=42 is load-bearing for demo reproducibility (AGENTS.md).
    assert np.array_equal(generate_baseline(), generate_baseline())


def test_clean_cc_vector_scores_below_0_2():
    model = _baseline_model()
    clean = [120.0, 45.0, 0.0, 600.0, 0.0]  # honest CC, residual ~0
    assert model.score(clean) < 0.2


def test_drifted_vector_scores_above_0_65():
    # subtle_drift (CONTEXT §5.D): a −2%/tick compounding power under-report drifts
    # BOTH axes — reported power sags low-for-SoC while the residual climbs. Money
    # demo (plan H13): ML fires with no rule.
    model = _baseline_model()
    drifted = [65.5, 30.0, -0.4, 600.0, 27.3]
    assert model.score(drifted) > 0.65


def test_score_is_clipped_to_unit_interval():
    model = _baseline_model()
    for vec in ([120.0, 45.0, 0.0, 600.0, 0.0], [500.0, 200.0, 50.0, 9000.0, 99.0]):
        assert 0.0 <= model.score(vec) <= 1.0


def test_model_is_deterministic_across_fits():
    a, b = _baseline_model(), _baseline_model()
    vec = [65.5, 30.0, -0.4, 600.0, 27.3]
    assert a.score(vec) == b.score(vec)


def test_model_save_load_round_trips(tmp_path):
    model = _baseline_model()
    p = tmp_path / "tier2.pkl"
    model.save(p)
    reloaded = Tier2Model.load(p)
    vec = [65.5, 30.0, -0.4, 600.0, 27.3]
    assert reloaded.score(vec) == model.score(vec)


# ---- CUSUM residual detector (offline comparison only) --------------------


def test_cusum_fires_on_climbing_residual():
    # A residual that ramps up should trip CUSUM; a flat one should not.
    ramp = np.linspace(0.0, 20.0, 40)
    idx, series = cusum_residual(ramp, k=0.5, h=5.0)
    assert idx is not None and idx < len(ramp)
    assert len(series) == len(ramp)


def test_cusum_quiet_on_flat_residual(seed=42):
    rng = np.random.default_rng(seed)
    flat = rng.normal(0.0, 0.05, 60)
    idx, _ = cusum_residual(flat, k=0.5, h=5.0)
    assert idx is None


# ---- dataset loader + attack synthesis (proxy.datasets) -------------------


import proxy.datasets as datasets  # noqa: E402

FIXTURE = "tests/fixtures/sample_sessions.csv"


def test_loader_parses_fixture_types_and_duration():
    sessions = datasets.load_sessions(FIXTURE)
    assert len(sessions) == 15
    s = {x.session_id: x for x in sessions}["S-002"]
    assert isinstance(s.energy_kwh, float) and s.energy_kwh == 9.7
    assert isinstance(s.station_id, str) and s.station_id == "CA-302"
    # 07:15 -> 08:05 GMT == 50 minutes == 3000 s
    assert s.duration_sec == 3000.0


def test_rfc1123_and_duration_timestamps_parse():
    from proxy.datasets import parse_time_seconds

    a = parse_time_seconds("Wed, 01 May 2019 07:00:00 GMT")
    b = parse_time_seconds("Wed, 01 May 2019 09:30:00 GMT")
    assert b - a == 9000.0  # 2.5 h
    assert parse_time_seconds("01:30:00") == 5400.0  # hh:mm:ss duration


def test_session_to_vectors_shape_and_warmup():
    sessions = datasets.load_sessions(FIXTURE)
    vecs = datasets.session_to_vectors(sessions[0], seed=42)
    assert len(vecs) > 3
    assert all(len(v) == len(FEATURE_ORDER) for v in vecs)
    # dp_dt is 0.0 on sample 1 (cold start)
    assert vecs[0][FEATURE_ORDER.index("dp_dt")] == 0.0


def test_meter_spoof_reports_five_kw():
    sessions = datasets.load_sessions(FIXTURE)
    series = datasets.build_series(sessions[2], "meter_spoof", start_frac=0.2, seed=42)
    after = series.reported_power[series.start_index:]
    assert np.allclose(after, 5.0)


def test_subtle_drift_factor_is_0_98_power_k():
    sessions = datasets.load_sessions(FIXTURE)
    series = datasets.build_series(sessions[2], "subtle_drift", start_frac=0.2, seed=42)
    i = series.start_index
    # matches simulator/twin.py: drift_ticks pre-increments, so k starts at 1.
    for j in range(5):
        expected = series.true_power[i + j] * (0.98 ** (j + 1))
        assert abs(series.reported_power[i + j] - expected) < 1e-9


def test_meter_spoof_residual_grows_and_scores_high():
    sessions = datasets.load_sessions(FIXTURE)
    # Augment the small fixture baseline with synthetic CC-CV for a stable forest.
    honest = np.array(
        [v for s in sessions for v in datasets.session_to_vectors(s, seed=42)]
    )
    X = np.vstack([honest, generate_baseline()])
    model = fit_tier2(X)
    spoof = np.array(datasets.apply_attack(sessions[2], "meter_spoof", start_frac=0.2, seed=42))
    resid = spoof[:, FEATURE_ORDER.index("energy_residual_kwh")]
    start = int(len(resid) * 0.2)
    # residual climbs monotonically IN EXPECTATION once the spoof begins — the
    # N(0,0.05) register-noise model breaks strict step monotonicity, so assert
    # the trend: a positive linear slope and a clear net rise over the window.
    post = resid[start:]
    slope = float(np.polyfit(np.arange(len(post)), post, 1)[0])
    assert slope > 0
    assert resid[start + 30] - resid[start + 1] > 0.2
    # and scores past 0.65 within 30 samples of the attack start
    scored = [model.score(list(v)) for v in spoof[start + 2 : start + 32]]
    assert max(scored) > 0.65


def test_late_subtle_drift_vector_scores_high():
    sessions = datasets.load_sessions(FIXTURE)
    honest = np.array(
        [v for s in sessions for v in datasets.session_to_vectors(s, seed=42)]
    )
    model = fit_tier2(np.vstack([honest, generate_baseline()]))
    drift = np.array(datasets.apply_attack(sessions[6], "subtle_drift", start_frac=0.2, seed=42))
    # a late-session drifted sample is well past the threshold
    assert model.score(list(drift[-1])) > 0.65


# ---- benchmark smoke test -------------------------------------------------


def test_benchmark_smoke_returns_expected_keys():
    from proxy.train_tier2 import run_benchmark

    sessions = datasets.load_sessions(FIXTURE)
    result = run_benchmark(sessions, seed=42, start_frac=0.2)
    for key in (
        "false_positive_rate",
        "recall_meter_spoof",
        "recall_subtle_drift",
        "latency_median_sec",
        "latency_p90_sec",
        "cusum_recall_meter_spoof",
        "cusum_recall_subtle_drift",
    ):
        assert key in result
