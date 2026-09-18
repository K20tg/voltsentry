"use client";

/**
 * useSyntheticFleet — scale the fleet past the live backend for demo/rendering.
 *
 * The twin runs a fixed set of real stations (CP-01…CP-08). To show what the
 * console looks like at 16/24/32/48 bays, we synthesise telemetry for the extra
 * stations so the 3D twin, the 2D grid and the overview all render fully.
 *
 * HONESTY CONTRACT — this is a security tool:
 *   - Real stations pass through untouched; their telemetry is the live feed.
 *   - Synthetic stations are returned in `simIds`. Every surface that renders
 *     them must badge them SIM. They are never presented as measured data.
 *   - Synthetic stations never fabricate a threat or an ML alert above the
 *     0.65 line — inventing an "attack" the proxy never saw would be a lie. They
 *     sit in the healthy band and simply animate.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { StationStatus, TelemetryEvent } from "./types";

const ML_THRESHOLD = 0.65;

export function stationId(i: number): string {
  return `CP-${String(i + 1).padStart(2, "0")}`;
}

/** Deterministic per-station phase so each sim bay animates differently. */
function seed(i: number): number {
  return (Math.sin(i * 12.9898) * 43758.5453) % 1;
}

function synthTelemetry(i: number, tSec: number): TelemetryEvent {
  const ph = seed(i) * Math.PI * 2;
  // A slow CC→CV style SoC ramp that wraps, so bays are at different fills.
  const soc = 20 + ((tSec * 0.6 + seed(i) * 100) % 70);
  // Power tapers as SoC climbs past the 80% knee (mirrors the real battery).
  const base = soc > 80 ? 60 * (1 - (soc - 80) / 20) : 118;
  const power = Math.max(4, base + Math.sin(tSec * 0.5 + ph) * 6);
  const energy = ((tSec * 0.03 + seed(i) * 40) % 60) + 2;
  // Healthy band only — sim bays never cross the alert line.
  const ml = 0.12 + (Math.sin(tSec * 0.3 + ph) + 1) * 0.12; // ~0.12–0.36
  const status: StationStatus = soc > 97 ? "Finishing" : "Charging";

  return {
    event: "telemetry",
    station_id: stationId(i),
    transaction_id: 9000 + i,
    ts: Date.now() / 1000,
    power_kw: power,
    soc,
    dp_dt: Math.cos(tSec * 0.5 + ph) * 2,
    duration_sec: (tSec + seed(i) * 300) % 1800,
    energy_register_kwh: energy,
    energy_residual_kwh: 0.02 + seed(i) * 0.05, // tiny, honest residual
    status,
    ml_score: Math.min(ml, ML_THRESHOLD - 0.05),
  };
}

export interface SyntheticFleet {
  /** Live stations merged with synthesised ones, keyed by station id. */
  stations: Record<string, TelemetryEvent>;
  /** Ordered ids CP-01…CP-{count}. */
  stationIds: string[];
  /** Subset of stationIds that are synthesised (badge these SIM). */
  simIds: Set<string>;
  /** True once any synthetic bay exists. */
  hasSim: boolean;
}

/**
 * @param liveStations  the real feed (from useFeed)
 * @param liveIds       ids that have a real backend socket (CP-01…CP-08)
 * @param count         desired total fleet size
 */
export function useSyntheticFleet(
  liveStations: Record<string, TelemetryEvent>,
  liveIds: string[],
  count: number
): SyntheticFleet {
  const [tick, setTick] = useState(0);
  const started = useRef(Date.now());

  const liveCount = liveIds.length;
  const needsSim = count > liveCount;

  // Only run the 1 Hz synthesis clock when there are sim bays to animate.
  useEffect(() => {
    if (!needsSim) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [needsSim]);

  return useMemo(() => {
    const ids: string[] = [];
    const simIds = new Set<string>();
    const stations: Record<string, TelemetryEvent> = {};
    const tSec = (Date.now() - started.current) / 1000;

    for (let i = 0; i < count; i++) {
      const id = stationId(i);
      ids.push(id);
      if (i < liveCount) {
        // Real station — pass the live feed through (may be undefined until the
        // first frame arrives, exactly as the rest of the UI already handles).
        if (liveStations[id]) stations[id] = liveStations[id];
      } else {
        simIds.add(id);
        stations[id] = synthTelemetry(i, tSec);
      }
    }

    return { stations, stationIds: ids, simIds, hasSim: simIds.size > 0 };
    // `tick` drives the 1 Hz refresh; liveStations drives real updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStations, liveCount, count, tick]);
}
