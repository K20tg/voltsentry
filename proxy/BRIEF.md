# Person 1 — `/proxy`

You own the security proxy. You are the only person who writes Python in this folder.

## Your files

| File | Responsibility |
| :--- | :--- |
| `ocpp.py` | frame parse/serialise, `MeterValues` extraction. Pure functions, no I/O. |
| `state.py` | per-station FSM, transaction registry, quarantine set, pending-call map |
| `rules.py` | R1–R5 deterministic checks. Pure functions taking state + frame. |
| `ml_engine.py` | Isolation Forest: synthetic baseline, fit, pinned score normalisation |
| `main.py` | asyncio transport only — accept `:8000`, relay to `:9000`, fan out on `:8100` |

Keep detection logic out of `main.py`. If `main.py` grows past ~200 lines you have put
something in the wrong file.

## What you consume
- OCPP frames from Person 2's twin, shaped exactly as `CONTEXT.md` §6.2.
- Nothing else. You never import from `simulator/`.

## What you produce
- `TelemetryEvent`, `ThreatEvent`, `GridEvent` on `ws://localhost:8100/feed`, one JSON
  object per message, exactly matching `shared/schemas.py`.
- `logs/incidents.jsonl`, one JSON object per line.

Person 3 is building against a fixture file that mirrors these models. If you emit a
field they do not expect, their UI breaks silently. If in doubt, dump the model with
`.model_dump_json()` and never hand-build the dict.

## Gotchas that will cost you an hour each
- A `CALLRESULT` `[3, id, payload]` does not carry the action name. Keep
  `pending: dict[str, str]` mapping `uniqueId -> action` per connection, or you cannot
  correlate `StartTransaction` to its returned `transactionId`.
- `ChangeAvailability` is a CSMS→ChargePoint call. On quarantine you send it *downstream*
  to the charger, wait for its `CALLRESULT`, then close with code `4001`.
- `dp_dt` is undefined on the first `MeterValues` of a session. Contract: `0.0`, and do not
  score samples 1–2 (`ml_score = 0.0`). Skip this and every session start throws a false
  positive during the demo.
- `IsolationForest.decision_function` returns higher = more normal, on an unbounded scale.
  Use the normalisation pinned in `CONTEXT.md` §5.B or "0.65" means nothing.
- Parse `cpid` from the handshake path before any frame arrives. Do not wait for
  `BootNotification`.

## Order of work
Relay first, rules second, ML last. A dumb working relay at Hour 2 unblocks the whole team;
a perfect rule engine with no transport unblocks nobody.
