"""Fit the Tier-2 IsolationForest on a real charging dataset + benchmark it.

    python -m proxy.train_tier2 --data <path> [--name ACN-Caltech] [--capacity 75]
        [--hz 1] [--start-frac 0.2] [--seed 42] [--out proxy/models/tier2.pkl]

Loads sessions, splits deterministically, fits on honest train vectors (augmented
with the synthetic CC-CV baseline for a stable forest), saves the model, and writes
`proxy/tier2_report.md` with dataset provenance, an EDA summary, an explicit
real-vs-synthesised section, and the benchmark table (forest vs a CUSUM baseline).
Every number is computed from the run (honest-stats rule).
"""

from __future__ import annotations

import argparse
import statistics
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from proxy import datasets
from proxy.ml_engine import ML_ALERT_THRESHOLD, cusum_residual, fit_tier2, generate_baseline

DEFAULT_OUT = Path(__file__).resolve().parent / "models" / "tier2.pkl"
REPORT_PATH = Path(__file__).resolve().parent / "tier2_report.md"
WARMUP = 2                      # samples 1-2 are not scored (0-based: skip index < 2)
CUSUM_K, CUSUM_H = 0.5, 5.0     # slack / threshold for the residual CUSUM baseline


def split_sessions(sessions, seed: int, test_frac: float = 0.3):
    """Deterministic train/test split: sort by id, seeded permutation."""
    ordered = sorted(sessions, key=lambda s: s.session_id)
    rng = np.random.default_rng(seed)
    perm = rng.permutation(len(ordered))
    n_test = max(1, int(round(len(ordered) * test_frac)))
    test_idx = set(perm[:n_test].tolist())
    train = [ordered[i] for i in range(len(ordered)) if i not in test_idx]
    test = [ordered[i] for i in range(len(ordered)) if i in test_idx]
    return train, test


def _first_fire(model, vectors, from_index: int = 0):
    """First index >= max(from_index, WARMUP) whose score crosses the threshold."""
    start = max(from_index, WARMUP)
    for i in range(start, len(vectors)):
        if model.score(list(vectors[i])) > ML_ALERT_THRESHOLD:
            return i
    return None


def run_benchmark(sessions, seed: int = 42, start_frac: float = 0.2, hz: float = 1.0) -> dict:
    """Fit on train, evaluate on test; return the summary metric dict."""
    train, test = split_sessions(sessions, seed)

    honest_train = [v for s in train for v in datasets.session_to_vectors(s, seed=seed, hz=hz)]
    X = np.vstack([np.asarray(honest_train, dtype=float), generate_baseline()])
    model = fit_tier2(X, seed=seed)

    # false positives on untouched real test sessions
    fp = 0
    for s in test:
        vecs = datasets.session_to_vectors(s, seed=seed, hz=hz)
        if _first_fire(model, vecs, 0) is not None:
            fp += 1
    fpr = fp / len(test) if test else 0.0

    dt = 1.0 / hz
    recalls: dict = {}
    latencies: list = []
    cusum_recalls: dict = {}
    cusum_latencies: list = []
    for kind in ("meter_spoof", "subtle_drift"):
        hits = 0
        clat: list = []
        chits = 0
        for s in test:
            series = datasets.build_series(s, kind, start_frac=start_frac, seed=seed, hz=hz)
            fire = _first_fire(model, series.vectors, series.start_index)
            if fire is not None:
                hits += 1
                latencies.append((fire - series.start_index) * dt)
            alarm, _ = cusum_residual(series.residual, k=CUSUM_K, h=CUSUM_H)
            if alarm is not None and alarm >= series.start_index:
                chits += 1
                clat.append((alarm - series.start_index) * dt)
        recalls[kind] = hits / len(test) if test else 0.0
        cusum_recalls[kind] = chits / len(test) if test else 0.0
        cusum_latencies.extend(clat)

    def _p90(xs):
        if not xs:
            return 0.0
        return float(np.percentile(np.asarray(xs, dtype=float), 90))

    return {
        "n_train": len(train),
        "n_test": len(test),
        "false_positive_rate": round(fpr, 4),
        "recall_meter_spoof": round(recalls["meter_spoof"], 4),
        "recall_subtle_drift": round(recalls["subtle_drift"], 4),
        "latency_median_sec": round(statistics.median(latencies), 2) if latencies else 0.0,
        "latency_p90_sec": round(_p90(latencies), 2),
        "cusum_recall_meter_spoof": round(cusum_recalls["meter_spoof"], 4),
        "cusum_recall_subtle_drift": round(cusum_recalls["subtle_drift"], 4),
        "cusum_latency_median_sec": round(statistics.median(cusum_latencies), 2) if cusum_latencies else 0.0,
    }


def _eda(sessions) -> dict:
    energies = [s.energy_kwh for s in sessions]
    durations = [s.duration_sec / 60.0 for s in sessions]  # minutes
    peaks = []
    for s in sessions:
        series = datasets.build_series(s, "clean", seed=42)
        peaks.append(float(series.true_power.max()))
    connects = [s.connect_ts for s in sessions if s.connect_ts is not None]
    date_range = ("n/a", "n/a")
    span_days = 1
    if connects:
        lo = datetime.fromtimestamp(min(connects), tz=timezone.utc)
        hi = datetime.fromtimestamp(max(connects), tz=timezone.utc)
        date_range = (lo.strftime("%Y-%m-%d"), hi.strftime("%Y-%m-%d"))
        span_days = max(1, (hi.date() - lo.date()).days + 1)
    return {
        "count": len(sessions),
        "date_range": date_range,
        "sessions_per_day": round(len(sessions) / span_days, 2),
        "kwh_mean": round(statistics.mean(energies), 2),
        "kwh_min": round(min(energies), 2),
        "kwh_max": round(max(energies), 2),
        "dur_mean_min": round(statistics.mean(durations), 1),
        "dur_min": round(min(durations), 1),
        "dur_max": round(max(durations), 1),
        "peak_mean_kw": round(statistics.mean(peaks), 1),
        "peak_max_kw": round(max(peaks), 1),
    }


def write_report(path, data_path, name, sessions, bench, hz, capacity, seed, out_path) -> None:
    eda = _eda(sessions)
    any_real_power = any(s.power_profile for s in sessions)
    any_real_soc = any(s.soc_profile for s in sessions)
    cols = sorted({k for s in sessions for k in s.provenance.keys()}) or ["(defaults)"]
    lo, hi = eda["date_range"]

    md = f"""# VoltSentry Tier-2 training report

*Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} — every figure below is computed from this run.*

## Dataset

- **Name:** {name}
- **File:** `{data_path}`
- **Sessions loaded:** {eda['count']}  (train {bench['n_train']} / test {bench['n_test']})
- **Date range actually used:** {lo} → {hi}  (~{eda['sessions_per_day']} sessions/day)
- **Provenance fields detected:** {', '.join(cols)}
- **Sampling:** {hz:g} Hz · **assumed pack capacity:** {capacity:g} kWh · **seed:** {seed}

## EDA summary

| metric | value |
| :-- | :-- |
| delivered energy (kWh) | mean {eda['kwh_mean']}, min {eda['kwh_min']}, max {eda['kwh_max']} |
| session duration (min) | mean {eda['dur_mean_min']}, min {eda['dur_min']}, max {eda['dur_max']} |
| peak power (kW) | mean {eda['peak_mean_kw']}, max {eda['peak_max_kw']} |

## What is real vs synthesised / approximated

- **Delivered energy + duration:** real, taken from the dataset.
- **Per-timestep power:** {'real profile (dataset carries one)' if any_real_power else 'CC-CV shape **synthesized** and scaled so its integral equals delivered energy — energy + duration are real, only the within-session shape is assumed.'}
- **SoC:** {'real series from the dataset.' if any_real_soc else 'approximated as 100 · cumulative_energy / capacity (nominal {} kWh) — **approximated**.'.format(int(capacity))}
- **Energy-residual honest baseline:** modelled as additive noise ~ N(0, {datasets.RESIDUAL_NOISE_STD}) on the register — an **assumed** noise model.
- **Attacks:** `meter_spoof` (reports 5.0 kW) and `subtle_drift` (×0.98^k per tick) are synthesised to match `simulator/twin.py` exactly; the register always accumulates true energy.

## Model

- `IsolationForest(n_estimators=100, contamination=0.02, random_state={seed})`, fitted on honest train
  vectors augmented with a 1000-vector synthetic CC-CV baseline for forest stability.
- Score normalisation pinned at fit time (CONTEXT.md §5.B); alert threshold `ml_score > {ML_ALERT_THRESHOLD}`.
- Warm-up: the first two samples of a session are not scored.
- Saved to `{out_path}`.

## Benchmark (test set)

| metric | Isolation Forest | CUSUM (residual) |
| :-- | :-- | :-- |
| false-positive rate (honest sessions) | {bench['false_positive_rate']} | — |
| recall — meter_spoof | {bench['recall_meter_spoof']} | {bench['cusum_recall_meter_spoof']} |
| recall — subtle_drift | {bench['recall_subtle_drift']} | {bench['cusum_recall_subtle_drift']} |
| detection latency — median (s) | {bench['latency_median_sec']} | {bench['cusum_latency_median_sec']} |
| detection latency — p90 (s) | {bench['latency_p90_sec']} | — |

CUSUM (`k={CUSUM_K}`, `h={CUSUM_H}`) is an **offline** comparison on the same residual signal; it is
not wired into the live feed (the dashboard schema is frozen and carries no CUSUM statistic).

**Benchmark caveats (honest-stats).** This capture holds {eda['count']} sessions, so the held-out
test set is n={bench['n_test']} and the false-positive rate is coarse-grained (one honest session
flips it by {round(1.0 / max(bench['n_test'], 1), 2)}). The **shipped** model in `tier2.pkl` is
fitted on all {eda['count']} honest sessions plus the synthetic baseline, so the live proxy is not
scored against stations it never saw; a larger real corpus (e.g. full ACN-Data) would tighten every
figure above.

## Reproduce

```bash
python -m proxy.train_tier2 --data {data_path} --name "{name}" --capacity {capacity:g} --seed {seed}
```
"""
    Path(path).write_text(md, encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description="Fit + benchmark the VoltSentry Tier-2 model")
    ap.add_argument("--data", required=True, help="path to .csv/.json/.jsonl dataset")
    ap.add_argument("--name", default="EV charging dataset")
    ap.add_argument("--capacity", type=float, default=datasets.DEFAULT_CAPACITY_KWH)
    ap.add_argument("--hz", type=float, default=datasets.DEFAULT_HZ)
    ap.add_argument("--start-frac", type=float, default=datasets.DEFAULT_START_FRAC)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()

    print(f"[train] loading {args.data}", flush=True)
    sessions = datasets.load_sessions(args.data, capacity=args.capacity)
    print(f"[train] {len(sessions)} sessions loaded", flush=True)

    bench = run_benchmark(sessions, seed=args.seed, start_frac=args.start_frac, hz=args.hz)

    # Fit the shipping model on ALL honest sessions (+baseline) and save it.
    honest = [v for s in sessions for v in datasets.session_to_vectors(s, seed=args.seed, hz=args.hz)]
    X = np.vstack([np.asarray(honest, dtype=float), generate_baseline()])
    model = fit_tier2(X, seed=args.seed)
    model.save(args.out)
    print(f"[train] model saved to {args.out}", flush=True)

    write_report(REPORT_PATH, args.data, args.name, sessions, bench, args.hz, args.capacity, args.seed, args.out)
    print(f"[train] report written to {REPORT_PATH}", flush=True)

    print("\n=== Tier-2 benchmark ===", flush=True)
    for key, val in bench.items():
        print(f"  {key:28s} {val}", flush=True)


if __name__ == "__main__":
    main()
