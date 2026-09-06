# VoltSentry — agent instructions

Read by Claude Code, Antigravity, Cursor and Codex. This is the shared constitution
for all three developers' AI agents. Keep it under 12,000 characters (Antigravity's
per-rules-file cap).

**Spec:** `CONTEXT.md` is the binding specification. Read it before writing code.
**Plan:** `PLAN.md` is the hour-by-hour schedule. Read it to know what hour you are in.

---

## What this is

An inline OCPP 1.6-J security proxy for EV charging networks, plus a simulated charger
fleet, a red-team CLI and a live NOC dashboard. 48-hour hackathon build, localhost only.

---

## Hard ownership boundaries

| Folder | Owner | Everyone else |
| :--- | :--- | :--- |
| `proxy/`, `tests/test_rules.py`, `tests/test_ml.py`, `tests/test_ocpp.py` | Person 1 | read-only |
| `simulator/`, `cli/`, `tests/test_battery.py` | Person 2 | read-only |
| `dashboard/` | Person 3 | read-only |
| `shared/schemas.py`, `CONTEXT.md`, `requirements.txt` | all three | **frozen** |

**Rule for agents: never create, edit, delete or move a file outside your owner's folder.**
If a task appears to need a change in someone else's folder, stop and report it to the user
as a cross-boundary request. Do not make the edit and do not work around it by duplicating
the file. Reading other folders for context is fine and encouraged.

`shared/schemas.py` is frozen. If your task seems to require a schema change, that is a
signal you have misread `CONTEXT.md` §6. Re-read it. If the schema genuinely is wrong,
stop and report — it needs all three humans to agree.

---

## Non-negotiable constants

- Ports: CSMS `9000`, proxy OCPP ingress `8000`, dashboard feed `8100`, twin control `9100`, UI `3000`.
- Dashboard transport is the browser's **native `WebSocket`**. Socket.io is banned — the
  Python side is raw `websockets` and the two protocols do not interoperate.
- `IsolationForest(n_estimators=100, contamination=0.02, random_state=42)`. The seed is
  load-bearing for demo reproducibility. Never remove it.
- ML feature vector order, never reordered:
  `[power_kw, soc, dp_dt, duration_sec, energy_residual_kwh]`
- ML alert threshold: `ml_score > 0.65`. Normalisation formula is pinned in `CONTEXT.md` §5.B.
- OCPP frames are JSON **arrays**, not objects:
  `[2, id, action, payload]` / `[3, id, payload]` / `[4, id, code, desc, details]`.
- Station identity comes from the URL path `/ocpp/{cpid}`, never from a payload field.
- `MeterValues` sampled values are **strings** on the wire. Cast on the Python side.

---

## Commands

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest -q                       # run before every commit that touches Python

python -m simulator.csms        # terminal 1, :9000
python -m proxy.main            # terminal 2, :8000 ingress + :8100 feed
python -m simulator.twin        # terminal 3, fleet + control :9100
python -m cli.attack            # terminal 4, red-team TUI
cd dashboard && npm run dev     # terminal 5, :3000
```

Start order matters: CSMS, then proxy, then twin. The proxy dials upstream at handshake.

---

## Working style

- Everything runs on localhost. There is no cloud, no auth, no TLS, no database. Do not add any.
- Write the test first for anything in `rules.py`, `ml_engine.py`, `battery.py` or `ocpp.py`.
  Those four are pure logic and cheap to test. Everything else is I/O — test it by running it.
- Prefer small focused files over one large module. `main.py` should be transport only;
  detection logic lives in `rules.py` and `ml_engine.py`.
- Every process prints to stdout with a `[proxy]` / `[twin]` / `[csms]` prefix. Judges will
  see these terminals. Keep the output readable, not a debug firehose.
- No new third-party dependencies without asking. `requirements.txt` is pinned deliberately.
- Do not add features not in `CONTEXT.md`. This is a 48-hour build; scope creep is the
  primary failure mode, not missing polish.

## Git

- Branch policy: **everyone commits to `main`.** Folder ownership makes this safe.
  No feature branches, no PRs — the review overhead does not pay for itself at this timescale.
- `git pull --rebase` before every push.
- Commit at least once an hour. Never leave work uncommitted for more than 60 minutes.
- Do not commit: `.venv/`, `node_modules/`, `logs/*.jsonl`, or any `.agents/rules/99-*.md`.
- Never `git push --force` to `main`.
- Never run `git clean -fdx` — it will eat other people's untracked scratch work.
