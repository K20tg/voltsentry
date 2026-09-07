# VoltSentry Tier-2 training report

*Generated 2026-09-07 06:45 UTC — every figure below is computed from this run.*

## Dataset

- **Name:** VoltSentry recorded feed (replay.jsonl)
- **File:** `C:/Users/jaira/Downloads/replay.jsonl`
- **Sessions loaded:** 8  (train 6 / test 2)
- **Date range actually used:** 2025-09-06 → 2025-09-06  (~8.0 sessions/day)
- **Provenance fields detected:** power, soc
- **Sampling:** 1 Hz · **assumed pack capacity:** 75 kWh · **seed:** 42

## EDA summary

| metric | value |
| :-- | :-- |
| delivered energy (kWh) | mean 4.89, min 0.31, max 7.21 |
| session duration (min) | mean 3.0, min 3.0, max 3.0 |
| peak power (kW) | mean 118.0, max 149.9 |

## What is real vs synthesised / approximated

- **Delivered energy + duration:** real, taken from the dataset.
- **Per-timestep power:** real profile (dataset carries one)
- **SoC:** real series from the dataset.
- **Energy-residual honest baseline:** modelled as additive noise ~ N(0, 0.05) on the register — an **assumed** noise model.
- **Attacks:** `meter_spoof` (reports 5.0 kW) and `subtle_drift` (×0.98^k per tick) are synthesised to match `simulator/twin.py` exactly; the register always accumulates true energy.

## Model

- `IsolationForest(n_estimators=100, contamination=0.02, random_state=42)`, fitted on honest train
  vectors augmented with a 1000-vector synthetic CC-CV baseline for forest stability.
- Score normalisation pinned at fit time (CONTEXT.md §5.B); alert threshold `ml_score > 0.65`.
- Warm-up: the first two samples of a session are not scored.
- Saved to `C:\Users\jaira\OneDrive\Desktop\voltsentry\proxy\models\tier2.pkl`.

## Benchmark (test set)

| metric | Isolation Forest | CUSUM (residual) |
| :-- | :-- | :-- |
| false-positive rate (honest sessions) | 0.5 | — |
| recall — meter_spoof | 1.0 | 1.0 |
| recall — subtle_drift | 1.0 | 1.0 |
| detection latency — median (s) | 2.5 | 47.0 |
| detection latency — p90 (s) | 5.7 | — |

CUSUM (`k=0.5`, `h=5.0`) is an **offline** comparison on the same residual signal; it is
not wired into the live feed (the dashboard schema is frozen and carries no CUSUM statistic).

**Benchmark caveats (honest-stats).** This capture holds 8 sessions, so the held-out
test set is n=2 and the false-positive rate is coarse-grained (one honest session
flips it by 0.5). The **shipped** model in `tier2.pkl` is
fitted on all 8 honest sessions plus the synthetic baseline, so the live proxy is not
scored against stations it never saw; a larger real corpus (e.g. full ACN-Data) would tighten every
figure above.

## Reproduce

```bash
python -m proxy.train_tier2 --data C:/Users/jaira/Downloads/replay.jsonl --name "VoltSentry recorded feed (replay.jsonl)" --capacity 75 --seed 42
```
