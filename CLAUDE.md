# Claude Code — VoltSentry

@AGENTS.md
@CONTEXT.md

I own `proxy/` and its tests. Read `proxy/BRIEF.md` for my scope.

Everything in `AGENTS.md` applies. Two additions specific to this session:

- When implementing a task from `PLAN.md`, use the `superpowers:test-driven-development`
  skill for `rules.py`, `ml_engine.py` and `ocpp.py`. They are pure functions and the
  test-first loop is faster than debugging them through a live socket.
- Before claiming anything works, actually run it. `pytest -q` for logic, and for the
  relay, start the CSMS and connect a real client. "Should work" is not evidence.
