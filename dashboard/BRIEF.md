# Person 3 — `/dashboard`

You own the NOC dashboard. You write no Python.

Next.js 14 (app router) + Tailwind + Recharts + the browser's native `WebSocket`.
**Socket.io is banned** — the server is raw Python `websockets` and will not speak it.

## Your unblock: build against fixtures from hour one

Hand-write `dashboard/fixtures/replay.jsonl` — roughly 60 lines of JSON matching
`TelemetryEvent`, `ThreatEvent` and `GridEvent` in `shared/schemas.py`, including at least
one tier-1 threat and one tier-2 threat with a climbing `ml_score`.

`lib/useFeed.ts` exposes one interface over two sources:

```ts
useFeed({ source: "fixture" | "live" })
```

Fixture mode replays the JSONL at 1 Hz. Live mode opens `ws://localhost:8100/feed`.
Build the entire UI on `fixture` and flip to `live` at Hour 6. You are never blocked on
Person 1, and when you do connect, a schema mismatch fails loudly instead of silently.

## Components, in build order
1. Station grid — 8 cards: `station_id`, status pill, power number, SoC bar
2. Power chart — Recharts line, multi-series, rolling 60 s window
3. Transformer gauge — `total_load_kw` against 500 kVA, `headroom_pct`
4. Threat badges — 🔴 `RULE VIOLATION · R2_PHYSICS` for `tier: 1`,
   🟡 `ML ANOMALY 0.84` for `tier: 2`. Show `reason` on the card.
5. Threat timeline — scrolling list of `ThreatEvent`s
6. Forensic export — download the accumulated events as JSON

## Demo-critical details, do not skip
- **Reconnect with 2 s backoff.** The socket will drop when a laptop sleeps or Person 1
  restarts the proxy. Without this your screen is dead at the worst moment.
- **Audio must be gated behind a click.** Browsers block autoplay. Put a "Start monitoring"
  button on first load; that click unlocks `public/audio/alert.mp3`.
- **Rate-limit the alert sound** to one per 10 seconds or `fleet_oscillate` produces a siren.
- Dark theme, high contrast, large numbers. A judge is reading this from two metres away
  on a projector, not from your laptop.
- Handle the empty state. Before the twin connects there is no data, and "NaN kW" on the
  projector is worse than "awaiting telemetry".

## Boundary
You read `shared/schemas.py` to know the field names. You never edit it, and you never
edit anything in `proxy/` or `simulator/`. If a field you need is missing, say so out loud —
it is a three-person decision.
