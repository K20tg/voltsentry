# VoltSentry

**An inline OCPP 1.6-J security proxy for EV charging networks**, plus a simulated
charger fleet, a red-team CLI, and a live NOC dashboard. Localhost-only, zero cloud,
zero paid dependencies — built for the CodeToCreate hackathon (VIT Vellore).

VoltSentry sits transparently on the transport layer between charge points (OCPP
clients) and the Central Management System (CSMS). It relays clean traffic untouched
and runs a dual-tier detection engine over every WebSocket frame, quarantining
compromised stations before they reach the backend or destabilise the grid.

> The binding spec is [`CONTEXT.md`](CONTEXT.md); the shared agent constitution and
> folder-ownership rules are in [`AGENTS.md`](AGENTS.md).

---

## Architecture at a glance

| Process | Command | Listens | Talks to |
| :--- | :--- | :--- | :--- |
| Mock CSMS | `python -m simulator.csms` | `:9000` | — |
| VoltSentry proxy | `python -m proxy.main` | `:8000` ingress, `:8100` feed | CSMS `:9000` |
| Charger fleet twin | `python -m simulator.twin` | control `:9100` | proxy `:8000` |
| Red-team CLI | `python -m cli.attack` | — | twin `:9100` |
| NOC dashboard | `npm run dev` (in `dashboard/`) | `:3000` | proxy `:8100` |

Chargers connect to `ws://localhost:8000/ocpp/{cpid}`; the proxy parses the station id
from the URL path and dials the matching upstream CSMS socket.

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+** (for the dashboard)

---

## Setup

```bash
# Python side (proxy, simulator, CLI)
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Dashboard (Next.js)
cd dashboard
npm install
```

---

## Run order (matters)

Start **CSMS → proxy → twin**, each in its own terminal — the proxy dials upstream at
handshake, so the CSMS must be up first.

```bash
# T1
python -m simulator.csms          # :9000
# T2
python -m proxy.main              # :8000 ingress, :8100 dashboard feed
# T3
python -m simulator.twin          # fleet -> :8000, control :9100
# T4  (optional — drives the demo attacks)
python -m cli.attack              # red-team TUI
# T5
cd dashboard && npm run dev       # http://localhost:3000
```

---

## Dashboard

- **`/`** — a scroll-driven story landing that explains the product section by section,
  ending in a CTA into the live NOC console.
- **NOC console** — station grid, live fleet power chart, transformer-load gauge, threat
  timeline, and one-click forensic JSON export. Runs against a recorded fixture
  (`Demo Replay Mode`) or a live proxy feed (`Live Charger Stream`).
- **`/globe`** — a 3D interactive globe of real EV charging hubs from
  [OpenChargeMap](https://openchargemap.org). Drag to orbit, scroll to zoom, hover a
  node for its power profile.

### OpenChargeMap API key (for the globe)

The globe works out of the box with a small bundled sample dataset. For the live global
network, add a free key:

1. Get a key at <https://openchargemap.org/site/profile/applications>.
2. In `dashboard/`, copy `.env.local.example` → `.env.local` and set
   `NEXT_PUBLIC_OPENCHARGEMAP_API_KEY=your_key`.
3. Restart `npm run dev`.

---

## Detection engine

**Tier 1 — deterministic rules** (`proxy/rules.py`), pure functions run per frame:

| Rule | Trips when |
| :--- | :--- |
| `R1_STATE_ORDER` | `MeterValues`/`StopTransaction` with no live `Authorize → StartTransaction` |
| `R2_PHYSICS` | `power > 150 kW`, or `> 60 kW` while `SoC > 80%` (CV taper), or negative power |
| `R3_OSCILLATION` | ≥ 6 start/stop transitions fleet-wide in a 10 s window |
| `R4_SESSION_UNIQUE` | a second handshake for a station that already has a live socket |
| `R5_TXN_INTEGRITY` | a `MeterValues.transactionId` that is unknown or owned by another station |

On a forged-data rule (R2/R5) the proxy drops the frame, sends
`ChangeAvailability{Inoperative}` downstream, and closes the socket (`4001`) on the ack.

**Tier 2 — behavioural ML** (`proxy/ml_engine.py`): derives a 5-dimensional session
feature vector `[power_kw, soc, dp_dt, duration_sec, energy_residual_kwh]` intended for
an Isolation Forest alerting past `ml_score > 0.65`. The `energy_residual` term
(`register − ∫ reported_power·dt`) is the drift tell.

> **Status note:** the feature layer runs in the live proxy today; the Isolation Forest
> fit + scoring is the next build step, so the live path currently emits `ml_score = 0.0`
> and the demo replays recorded scores. Copy in the UI reflects this honestly.

Measured Tier-1 cost is **~9 µs mean per frame** (median ~8 µs, p99 < 25 µs, over 200k
frames) — no upstream round-trip.

---

## Tests

```bash
pytest -q          # pure-logic tests for rules, ml, ocpp, battery
```

The Python detection logic (`rules.py`, `ml_engine.py`, `ocpp.py`) and the twin battery
maths are test-first; transport is verified by running the stack.

---

## Repository layout

```
proxy/        asyncio relay + detection engine (rules, ml_engine, ocpp, state, pipeline)
simulator/    mock CSMS, cyber-physical charger twin, CC-CV battery model
cli/          red-team attack TUI
dashboard/    Next.js 14 NOC dashboard + story landing + globe
shared/       frozen data contract (schemas.py)
tests/        pytest suites
```

Folder ownership and contribution rules: see [`AGENTS.md`](AGENTS.md).
