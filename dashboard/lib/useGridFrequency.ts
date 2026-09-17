"use client";

/**
 * useGridFrequency — substation frequency ticker.
 *
 * IMPORTANT: the backend does not publish a frequency. GridEvent carries load,
 * capacity and headroom only (shared/schemas.py). This hook *models* frequency
 * from the real load signal rather than inventing a number: on a real grid,
 * frequency droops as demand rises against available generation, so we hang a
 * small droop term off the measured transformer headroom and add bounded noise
 * for the sub-cycle jitter a real PMU would show.
 *
 * Anything rendering this must label it as modelled, not measured.
 */

import { useEffect, useRef, useState } from "react";
import type { GridEvent } from "./types";

const NOMINAL_HZ = 50.0;
/** Hard envelope — the ticker never wanders outside nominal ±0.02 Hz. */
const MAX_DEVIATION = 0.02;
const TICK_MS = 1000;

export interface GridFrequency {
  /** Modelled frequency in Hz, within NOMINAL ± 0.02. */
  hz: number;
  /** Signed deviation from 50.00 Hz. */
  deviation: number;
  /** True while |deviation| is in the upper half of the envelope. */
  strained: boolean;
}

export function useGridFrequency(grid: GridEvent | null): GridFrequency {
  const [hz, setHz] = useState(NOMINAL_HZ);

  // Mirror load into a ref so the interval never needs re-creating.
  const headroomRef = useRef(100);
  useEffect(() => {
    if (grid) headroomRef.current = grid.headroom_pct;
  }, [grid]);

  useEffect(() => {
    const id = setInterval(() => {
      const headroom = Math.min(Math.max(headroomRef.current, 0), 100);
      // Loaded transformer (low headroom) pulls frequency down; an idle one
      // sits at nominal. Droop is capped at 60% of the envelope so noise has
      // room to move without clipping.
      const droop = ((100 - headroom) / 100) * MAX_DEVIATION * 0.6;
      const noise = (Math.random() - 0.5) * MAX_DEVIATION * 0.8;

      const raw = NOMINAL_HZ - droop + noise;
      const clamped = Math.min(
        NOMINAL_HZ + MAX_DEVIATION,
        Math.max(NOMINAL_HZ - MAX_DEVIATION, raw)
      );
      setHz(clamped);
    }, TICK_MS);

    return () => clearInterval(id);
  }, []);

  const deviation = hz - NOMINAL_HZ;
  return {
    hz,
    deviation,
    strained: Math.abs(deviation) > MAX_DEVIATION * 0.5,
  };
}
