# Person 2 — `/simulator` and `/cli`

You own the cyber-physical twin, the mock CSMS and the red-team CLI.

## Your files

| File | Responsibility |
| :--- | :--- |
| `battery.py` | CC-CV maths. Pure, no I/O, no sockets. Unit-tested. |
| `twin.py` | fleet of 8 WebSocket clients, session FSM, compromise modes, control server `:9100` |
| `csms.py` | mock CSMS on `:9000`, answers every OCPP action with a valid `CALLRESULT` |
| `../cli/attack.py` | `rich`/`click` TUI, keys 1–4 and `r` |

## The one thing v1 of the spec got wrong

`attack.py` is a **remote control for the twin**, not a man-in-the-middle. It cannot touch
the twin↔proxy socket — it is a separate process. It sends an `AttackTrigger` over
`ws://localhost:9100/control`; the twin flips the named station's `mode` and starts emitting
hostile frames itself.

The one exception is `session_shadow`, which opens its own second socket straight to
`:8000` reusing a live `chargePointId`. That is the real attack, so do it for real.

## Compromise modes on each station
- `clean` — honest CC-CV
- `meter_spoof` — report 5 kW while the battery actually draws ~120 kW; energy register
  keeps accumulating from the true power, so the residual explodes
- `oscillate` — Start/Stop the transaction at 1 Hz
- `drift` — under-report power by a compounding 2% per tick; register still accumulates truth

`drift` is the demo's money shot. Tune the rate so the proxy's ML score crosses 0.65 in
roughly 40 seconds. Not 5 seconds — that looks scripted. Not 5 minutes — judges leave.

## Gotchas
- The twin must handle **inbound** CALLs. When the proxy quarantines a station it sends
  `ChangeAvailability` downstream and waits for a `CALLRESULT`. If you do not reply, the
  proxy hangs mid-demo.
- Emit `MeterValues` in exactly the nested shape in `CONTEXT.md` §6.2. Sampled values are
  strings. Person 1's parser is written against that shape and nothing else.
- Stagger session start times across the 8 stations or every chart moves in lockstep and
  looks fake.
- `reset` must genuinely return every station to `clean` and reconnect it. The demo fires
  four attacks back to back.

## Order of work
`battery.py` and `csms.py` first — they unblock Person 1's relay test. `twin.py` with one
station before eight. Attacks last.
