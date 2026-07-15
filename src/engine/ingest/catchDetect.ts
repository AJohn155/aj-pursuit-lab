// Caught-rider signature detection (owner request 2026-07 round 10).
//
// Catching an opponent leaves a characteristic mark on the rolling CdA: a DIP below the
// preceding baseline as the closing rider spends the final ~1.5 laps in the other rider's
// draft, then a SURGE above baseline through the pass (off the racing line, dirty air,
// and usually a power spike). The owner's Pan Am quali (catch at lap 7.5): baseline
// ~0.173, dip to 0.1704 centred ~lap 8.5, then a climb to ~0.185. This detector flags
// that shape so the app can ask "did you catch a rider around lap X?" instead of relying
// on the flag being remembered at upload. Display-only heuristic — it never changes an
// analysis by itself.

import type { RollingCdaPoint } from '../cda'

export interface CatchSignature {
  /** Suggested catch position, laps from the start (0.5 steps). */
  suggestedLap: number
  /** Rolling CdA at the dip. */
  dipCdaM2: number
  /** Median rolling CdA over the pre-dip baseline window. */
  baselineCdaM2: number
  /** Rolling CdA at the post-dip peak. */
  surgeCdaM2: number
}

/** Minimum dip below baseline (m²). The owner's real catch dipped 0.0025; the Worlds
 * quali's ordinary mid-race wobble reaches 0.0015 — the threshold sits between them. */
const MIN_DIP_M2 = 0.002
/** Minimum rise from dip to post-dip peak (m²), within the surge window below. */
const MIN_SURGE_FROM_DIP_M2 = 0.006
/** The surge must land FAST — a pass is over in a lap. A slow multi-lap climb after a
 * mid-race low is ordinary fatigue drift (the Worlds quali fixture's shape), not a catch. */
const SURGE_WINDOW_LAPS = 1.5
/** The surge must genuinely overshoot the pre-dip baseline, not merely recover to it —
 * this is what separates a catch from ordinary within-ride wobble. */
const MIN_SURGE_OVER_BASELINE_M2 = 0.003

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/**
 * Scan a ride's rolling-CdA series (already edge-smoothed + triangularly smoothed) for a
 * dip-then-surge. Returns the strongest candidate or null. `suggestedLap` corrects for the
 * rolling window's lag: the 2-lap centred window bottoms out ~1 lap after the actual
 * catch (verified on the Pan Am quali: dip centre lap 8.5, real catch 7.5).
 */
export function detectCatchSignature(
  rolling: RollingCdaPoint[],
  lapLengthM: number,
): CatchSignature | null {
  if (rolling.length < 8) return null
  const L = lapLengthM
  let best: (CatchSignature & { score: number }) | null = null

  for (let i = 1; i < rolling.length - 1; i++) {
    const c = rolling[i].centerDistM
    const v = rolling[i].cdaM2
    // Local minimum only.
    if (!(v <= rolling[i - 1].cdaM2 && v <= rolling[i + 1].cdaM2)) continue

    const baselinePts = rolling
      .filter((p) => p.centerDistM >= c - 2.5 * L && p.centerDistM <= c - 0.75 * L)
      .map((p) => p.cdaM2)
    if (baselinePts.length < 3) continue
    const baseline = median(baselinePts)

    const surgePts = rolling
      .filter((p) => p.centerDistM > c && p.centerDistM <= c + SURGE_WINDOW_LAPS * L)
      .map((p) => p.cdaM2)
    if (surgePts.length < 3) continue
    const surge = Math.max(...surgePts)

    const dipDepth = baseline - v
    const surgeFromDip = surge - v
    const surgeOverBaseline = surge - baseline
    if (dipDepth < MIN_DIP_M2 || surgeFromDip < MIN_SURGE_FROM_DIP_M2 || surgeOverBaseline < MIN_SURGE_OVER_BASELINE_M2)
      continue

    const score = dipDepth + surgeFromDip
    if (best == null || score > best.score) {
      const rawLap = c / L - 1 // window-lag correction (see docstring)
      const suggestedLap = Math.min(14, Math.max(2, Math.round(rawLap * 2) / 2))
      best = { suggestedLap, dipCdaM2: v, baselineCdaM2: baseline, surgeCdaM2: surge, score }
    }
  }

  if (best == null) return null
  return {
    suggestedLap: best.suggestedLap,
    dipCdaM2: best.dipCdaM2,
    baselineCdaM2: best.baselineCdaM2,
    surgeCdaM2: best.surgeCdaM2,
  }
}
