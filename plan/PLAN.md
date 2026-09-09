# VoltSentry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a demo-able inline OCPP security proxy with dual-tier threat detection, a
cyber-physical charger twin, a red-team CLI and a live NOC dashboard, inside the CodeToCreate
48-hour window.

**Architecture:** Three processes on localhost speaking OCPP 1.6-J over WebSockets. A reverse proxy
sits between a simulated charger fleet and a mock CSMS, scoring every frame against deterministic
rules and an Isolation Forest, and fanning results out to a Next.js dashboard over a second socket.

**Tech Stack:** Python 3.11 (`asyncio`, `websockets`, `pydantic` v2, `scikit-learn`, `numpy`,
`rich`), Next.js 14 + Tailwind + Recharts.

**Spec:** `CONTEXT.md` (v2). Spec is binding; this plan argues from it.

## Global Constraints

- Ports are fixed: CSMS `9000`, proxy ingress `8000`, dashboard feed `8100`, twin control `9100`, UI `3000`.
- `shared/schemas.py` is frozen at Hour 1. Changes require all three owners present.
- Dashboard transport is a **native browser `WebSocket`**. Socket.io is banned.
- `IsolationForest(n_estimators=100, contamination=0.02, random_state=42)` — seed is load-bearing for demo reproducibility.
- ML alert threshold is `ml_score > 0.65`. Score normalisation formula is pinned in CONTEXT.md §5.B.
- Feature vector order is `[power_kw, soc, dp_dt, duration_sec, energy_residual_kwh]` and never changes.
- OCPP frames are JSON **arrays**, `[2, id, action, payload]` / `[3, id, payload]` / `[4, id, code, desc, details]`.
- Station ID comes from the URL path `/ocpp/{cpid}`, never from the payload.
- Every process writes to stdout with a `[proxy]` / `[twin]` / `[csms]` prefix. Judges will see these terminals.
- Commit to `main` at least once per hour. Nobody works uncommitted for more than 60 minutes.

---

## Ownership

| | Person 1 | Person 2 | Person 3 |
| :--- | :--- | :--- | :--- |
| Owns | `proxy/`, `tests/test_rules.py`, `tests/test_ml.py` | `simulator/`, `cli/`, `tests/test_battery.py` | `dashboard/` |
| Never touches | `simulator/`, `dashboard/` | `proxy/`, `dashboard/` | anything Python |
| Shared, frozen | `shared/schemas.py`, `CONTEXT.md`, `requirements.txt` | | |

---

# Hour 0–2 in detail (Sun 15:00 – 17:00)

## Hour 0 (15:00 – 15:30) — all three, together, one screen

Do not split up yet. Thirty minutes of shared setup saves six hours of merge pain.

- [ ] **Step 1: Repo + skeleton.** One person creates the GitHub repo `voltsentry`, pushes the
  folder tree from CONTEXT.md §7 with empty `__init__.py` files and a `.gitignore`
  (`__pycache__/`, `.venv/`, `node_modules/`, `.next/`, `logs/*.jsonl`).
- [ ] **Step 2: Paste `shared/schemas.py`** verbatim from CONTEXT.md §6.1. Commit as
  `chore: freeze shared contract`. **This commit is never amended.**
- [ ] **Step 3: `requirements.txt`**, pinned:
  ```
  websockets==12.0
  pydantic==2.9.2
  scikit-learn==1.5.2
  numpy==2.1.1
  rich==13.9.2
  click==8.1.7
  pytest==8.3.3
  pytest-asyncio==0.24.0
  ```
- [ ] **Step 4: Everyone runs it once.** All three do `python -c "from shared.schemas import
  TelemetryEvent; print(TelemetryEvent.model_json_schema())"`. If it fails on anyone's machine, fix
  it now, not at 2 AM.
- [ ] **Step 5: Read CONTEXT.md §6 aloud.** Specifically the OCPP array framing and the
  `MeterValues` nesting. Every silent disagreement about wire format costs an hour later.
- [ ] **Step 6: Agree the branch policy.** Folder ownership on `main`, pull-before-push, no PRs.
  Feature branches are the wrong tool at this timescale.

## Hour 0.5–2 — split

### Person 1 — `/proxy`

- [ ] **P1.1 (15:30):** `proxy/ocpp.py` — pure functions, no I/O.
  `parse_frame(raw: str) -> OCPPFrame`, `serialise_call(action, payload) -> str`,
  `extract_meter_values(payload) -> dict` returning `{power_kw, energy_register_kwh, soc}`.
  Write `tests/test_ocpp.py` first with one good `MeterValues` frame and one malformed frame.
- [ ] **P1.2 (16:00):** `proxy/main.py` — dumb relay only. Accept on `:8000/ocpp/{cpid}`, parse
  `cpid` from path, dial `ws://localhost:9000/ocpp/{cpid}`, pump bytes both ways, print every frame.
  **No rules yet.** Target: a frame from a `wscat` client reaches a stub CSMS and back.
- [ ] **P1.3 (16:40):** dashboard fanout on `:8100/feed` — a `set` of connected browser sockets and
  a `broadcast(event: BaseModel)` coroutine. Emit a synthetic `TelemetryEvent` every second so
  Person 3 has something live to hit before the twin exists.

**Hour 2 exit criteria:** a byte relayed 8000→9000 and back, and something ticking on 8100.

### Person 2 — `/simulator` + `/cli`

- [ ] **P2.1 (15:30):** `simulator/battery.py` — pure CC-CV maths, zero I/O.
  `class Battery: def tick(self, dt: float) -> tuple[power_kw, soc, energy_kwh]`.
  Constant current at 120 kW to 80% SoC, then exponential taper to 100%. Write
  `tests/test_battery.py` first: asserts SoC is monotonic, power never exceeds 150 kW, power at
  SoC 95% is below 60 kW.
- [ ] **P2.2 (16:00):** `simulator/csms.py` — mock CSMS on `:9000`. Accepts any `/ocpp/{cpid}`,
  answers `BootNotification` / `Authorize` / `StartTransaction` (returns an incrementing
  `transactionId`) / `MeterValues` / `StopTransaction` with valid `CALLRESULT` frames. ~80 lines.
- [ ] **P2.3 (16:40):** `simulator/twin.py` — one station only for now. Connects to `:8000`, walks
  the full session FSM, emits `MeterValues` at 1 Hz using `battery.py` and the exact nested payload
  from CONTEXT.md §6.2.

**Hour 2 exit criteria:** one virtual charger completes an honest session end-to-end through P1's
relay into the mock CSMS.

### Person 3 — `/dashboard`

- [ ] **P3.1 (15:30):** `npx create-next-app@14 dashboard --ts --tailwind --app`. Strip the
  boilerplate page to a black background and a title bar.
- [ ] **P3.2 (16:00):** hand-write `dashboard/fixtures/replay.jsonl` — ~60 lines of
  `TelemetryEvent` / `ThreatEvent` / `GridEvent` JSON matching the frozen schema, including one
  Tier-1 threat and one Tier-2 threat. **This is the unblock.** Build the entire UI against this
  file; connect the real socket at Hour 8.
- [ ] **P3.3 (16:20):** `lib/useFeed.ts` — a hook with two sources behind one interface:
  `useFeed({ source: "fixture" | "live" })`. Live mode opens `ws://localhost:8100/feed` with 2 s
  reconnect backoff. Fixture mode replays the JSONL at 1 Hz.
- [ ] **P3.4 (16:40):** station grid — 8 cards, each with `station_id`, status pill, power number,
  SoC bar. Colour by status. No charts yet.

**Hour 2 exit criteria:** eight cards animating off the fixture file, in the dark theme, in a
browser.

---

# Full hour-by-hour

Working blocks derived from the event schedule. ~29 usable hours.

## Block A — Sun 15:00–20:00 (H0–H5)

| Hour | P1 proxy | P2 sim/cli | P3 dashboard |
| :--- | :--- | :--- | :--- |
| **H0** 15:00 | shared setup — all three (above) | | |
| **H1** 16:00 | `ocpp.py` + relay skeleton | `battery.py` + `csms.py` | Next.js scaffold + fixtures |
| **H2** 17:00 | fanout on `:8100` | `twin.py` single station | station grid off fixtures |
| **H3** 18:00 | `state.py` — per-station FSM, txn registry | fleet of 8, staggered starts | Recharts power chart |
| **H4** 19:00 | `rules.py` R1, R2 + tests | control channel `:9100` | SoC bars + transformer gauge |
| **H5** 19:30 | R3, R4 wired into relay | `attack.py` skeleton, keys 1–4 | threat badge component |

**20:00 dinner — hard stop. Commit everything first.**

## Block B — Sun 21:00–Mon 01:00 (H6–H9) → **ELIMINATORY REVIEW at 01:00**

| Hour | P1 | P2 | P3 |
| :--- | :--- | :--- | :--- |
| **H6** 21:00 | quarantine path + `ChangeAvailability` downstream | twin handles inbound CALLs, replies CALLRESULT | switch `useFeed` to `live`, hit real `:8100` |
| **H7** 22:00 | emit real `TelemetryEvent` / `ThreatEvent` / `GridEvent` | `meter_spoof` + `fleet_oscillate` modes | audio alert + reconnect hardening |
| **H8** 23:00 | **INTEGRATION FREEZE — all three at one desk.** End-to-end: fleet charges, press `1`, dashboard turns red. | | |
| **H9** 00:00 | rehearse the 4-min demo twice. Write the 3-slide deck. Fix only what breaks the demo. | | |

**H8 is the most important hour of the hackathon.** Nothing that isn't wired end-to-end by 23:00
gets built at all. If a component is behind, cut its scope — do not push integration later.

**01:00 review — minimum viable story:** fleet charging live on screen, one attack pressed, one red
badge, one quarantined station. That alone survives the cut. ML is *not* required yet.

## Block C — Mon 01:00–06:00 (H10–H14), post-review

| Hour | Focus |
| :--- | :--- |
| **H10** 01:30 | triage judge feedback into a kill-list. Cut ruthlessly. |
| **H11** 02:00 | P1: `ml_engine.py` — synthetic baseline generator (1000 CC-CV vectors), fit, pinned normalisation, `tests/test_ml.py` asserting a clean vector scores <0.2 and a drifted vector >0.65 |
| **H12** 03:00 | P1: wire ML into the relay, `ml_score` on every `TelemetryEvent`. P2: `subtle_drift` mode. P3: yellow ML badge + score sparkline |
| **H13** 04:00 | **the money demo:** press `4`, watch score climb past 0.65 with no rule firing. Tune drift rate until it takes ~40 s — not 5 s, not 5 min |
| **H14** 05:00 | `session_shadow` (P2 opens a real duplicate socket), R5 txn integrity, `reset` command end-to-end |

**06:00 sleep — actually sleep. Two hours.**

## Block D — Mon 08:00–13:00 (H15–H19)

| Hour | Focus |
| :--- | :--- |
| **H15** 08:00 | full 4-attack run-through cold, from `pip install`. Note every crash. |
| **H16** 09:00 | fix the crash list. No new features. |
| **H17** 10:00 | forensic log export + `logs/incidents.jsonl` formatting |
| **H18** 11:00 | dashboard polish: transformer gauge animation, threat timeline panel, empty states |
| **H19** 12:00 | write `README.md` — architecture diagram, run order, the 4 threat vectors |

**13:00 lunch.**

## Block E — Mon 14:00–20:00 (H20–H25)

| Hour | Focus |
| :--- | :--- |
| **H20** 14:00 | latency measurement — instrument the relay, prove `<1 ms` added overhead, put the number on a slide |
| **H21** 15:00 | **freeze features.** Anything not working now is cut. |
| **H22** 16:00 | pitch deck: problem, why cloud CSMS fails, architecture, dual-tier, live demo, metrics |
| **H23** 17:00 | rehearse the demo three times, timed, with someone playing judge |
| **H24** 18:00 | failure drills: what if the socket drops mid-pitch? Practise the recovery. Record a backup screen capture of a clean run. |
| **H25** 19:00 | buffer / the one feature you regret cutting |

**20:00 dinner. 21:00 final review prep.**

## Block F — Mon 21:00–Tue 01:00 → **PROTOTYPE EVALUATION at 01:00**

| Hour | Focus |
| :--- | :--- |
| **H26** 21:00 | full cold-boot rehearsal on the *presenting* laptop, on the *venue* network |
| **H27** 22:00 | deck finalised, speaker notes written, roles assigned (who talks, who drives, who presses keys) |
| **H28** 23:00 | rehearse twice more. Time it. Cut anything over 4 minutes. |
| **H29** 00:00 | tag `v1.0`, push, verify a fresh `git clone` runs |

## Block G — Tue 01:00–06:00

Post-evaluation fixes only. **Do not start anything new.** Sleep 06:00–09:00.

## Tue 09:00 — Final pitches

Backup video ready. Terminals pre-opened. Browser at 100% zoom, dark mode, notifications off.

---

## Risk register

| Risk | Trigger | Mitigation |
| :--- | :--- | :--- |
| **ML never fires on `subtle_drift`** | H13 | `energy_residual_kwh` feature (CONTEXT `[FIX-9]`). If it still won't fire by 04:00, cut Tier-2 to a rule-based drift detector and rename the badge. Do not spend 3 hours tuning a forest. |
| **Integration slips past H8** | H8 | Hard-stop rule: at 23:00 all three sit at one desk regardless of what's unfinished. |
| **Browser blocks autoplay audio** | demo | Gate the first `.mp3` behind a "Start monitoring" button click. |
| **Socket drops during the pitch** | demo | 2 s reconnect + a recorded backup video. |
| **Schema drift between P1 and P3** | H6 | The fixture file is generated *from* `schemas.py`, so a mismatch fails at parse time in dev, not on stage. |
| **Everyone edits `main.py`** | any | Folder ownership. No exceptions. |

---

## Self-review against the spec

Spec coverage check: §5.A proxy → H1–H7. §5.B Tier-1 → H4–H5, Tier-2 → H11–H13. §5.C twin →
H1–H3, inbound CALLs → H6, transformer → H4/H7. §5.D CLI → H5, all four attacks by H14. §5.E
dashboard → H1–H7 + H18. §9 demo script → rehearsed H9, H23, H28.

Known gaps accepted: no TLS on any socket (out of scope, localhost demo), no persistence beyond
JSONL, no authentication on the control channel (it is a demo attack tool, not a product).
