// Lap construction and calibration, SPEC §4.7.
//
// Two calibration factors, both = datum distance ÷ raw wheel distance (rollout is measured,
// so the ratio captures how much farther the wheel rolled than the 250 m datum line —
// lean path + line height):
//  - calibrationRace: anchors the 16 laps to the official finish. dCal = c·(dRaw−d0), lap
//    boundaries at n·250 m. Derived from the raw wheel distance over the official-time
//    window, consistent with the §4.5.5 start→0 / finish→officialTimeS alignment.
//  - calibrationInterior (the reported factor c, gate 3): from an interior window of exactly
//    14 laps (§4.7.4). This is what converts wheel speed to COM datum speed for the steady
//    CdA (v_com = c·v_wheel; see cda.ts for why kV is not applied again).

import type { BoundaryVCom } from '../cda'
import type { Sample, TrackModel } from '../types'
import type { Detection, LapConstruction, Timeline } from './types'
import { crossingTime, interpAt } from './util'

/** Individual-pursuit race distance, m — the datum every lap plan divides up. */
const RACE_DISTANCE_M = 4000

/** Fallback lap count for the catch-exclusion helpers when no venue is in hand (the 250 m
 * track the app was built around). Callers that know the venue pass `lapsForTrack` instead —
 * on a 333 m track the count is 12 and an unpassed default would clamp ranges too wide. */
export const DEFAULT_LAP_COUNT = 16

/** Laps in a 4 km race at this venue's lap length: 16 at 250 m, 12 at 333.33 m. */
export function lapsForTrack(lapLengthM: number): number {
  return Math.round(RACE_DISTANCE_M / lapLengthM)
}

/** First 1-based lap included in line-height reporting (owner convention 2026-07): laps 1–2
 * carry the standing-start anchor, and the final lap carries the finish surge, so both ends
 * are too uncertain to read as line height. */
const LINE_HEIGHT_FIRST_LAP = 3

/**
 * The lap plan for a venue (owner report 2026-08-16). This module used to hardcode a
 * 250 m / 16-lap track, so a 4 km race on the 333.33 m Colorado Springs venue was carved
 * into 16 fake 250 m laps while `expectedLapCount` — which does read the venue — correctly
 * said 12. Everything is now derived from the track.
 *
 * On a 250 m track this reproduces the old constants exactly (16 laps, 14 interior, line
 * height over laps 3–15), so existing rides are numerically unchanged.
 */
export interface LapPlan {
  lapLengthM: number
  nLaps: number
  interiorLaps: number
  lineHeightFirstLap: number
  lineHeightLastLap: number
}

export function lapPlan(track: TrackModel): LapPlan {
  const lapLengthM = track.lapLengthM
  const nLaps = Math.round(RACE_DISTANCE_M / lapLengthM)
  return {
    lapLengthM,
    nLaps,
    // The interior calibration window drops the first and last lap.
    interiorLaps: nLaps - 2,
    lineHeightFirstLap: LINE_HEIGHT_FIRST_LAP,
    // Laps 3–15 of 16; on the 12-lap 333 m track that generalises to 3–11 (owner choice
    // 2026-08-16, the direct analogue: drop the two start laps and the finish lap).
    lineHeightLastLap: nLaps - 1,
  }
}

/** Laps a constructed race actually has — the boundary list already encodes it. */
function lapCountOf(laps: LapConstruction): number {
  return laps.lapBoundaryTimes.length - 1
}
/** Official splits are only trusted for anchoring when they sum to the official time. */
const SPLITS_SUM_TOLERANCE_S = 2.0

export function constructLaps(
  tl: Timeline,
  detection: Detection,
  officialTimeS: number,
  track: TrackModel,
  officialSplits?: number[],
): LapConstruction {
  const { t, d } = tl
  const { t0, d0 } = detection
  const { lapLengthM: LAP_M, nLaps: N_LAPS, interiorLaps: INTERIOR_LAPS, lineHeightLastLap } = lapPlan(track)

  // Whole-race calibration anchored to the official finish.
  const dRawFull = interpAt(t, d, t0 + officialTimeS) - d0
  const calibrationRace = (N_LAPS * LAP_M) / dRawFull

  // N lap-line crossings at datum n·L (converted back to raw distance via calibration).
  const lapBoundaryTimes: number[] = [t0]
  for (let ln = 1; ln <= N_LAPS; ln++) {
    const targetRaw = (ln * LAP_M) / calibrationRace + d0
    const tc = crossingTime(t, d, targetRaw)
    lapBoundaryTimes.push(tc ?? Number.NaN)
  }
  const lapCount = lapBoundaryTimes.slice(1).filter((x) => !Number.isNaN(x)).length

  // Interior calibration factor over laps 2..N−1 → boundaries index 1..N−1.
  const dRaw14 =
    interpAt(t, d, lapBoundaryTimes[N_LAPS - 1]) - interpAt(t, d, lapBoundaryTimes[1])
  const calibrationInterior = (INTERIOR_LAPS * LAP_M) / dRaw14

  // Per-lap line height: (raw lap distance − datum) / 2π, using the rollout-true factor
  // c* = 1 (SPEC §4.7.4). Reported for the interior laps 3–15 only (owner convention
  // 2026-07): the start anchor and finish surge make laps 1–2/16 boundary distances too
  // uncertain to interpret as line height.
  //
  // Preferred anchoring (§4.7.4 "prefer official-split-anchored laps"): when trusted
  // official per-lap splits exist, lap-line TIMES are t0 + official cumulative — an
  // interior window bounded at near-equal speeds is first-order insensitive to a t0
  // error (both edges shift together), unlike the whole-race window where a ±1 s t0
  // error is a full ±16.5 m of raw distance. This also makes per-lap line heights
  // genuinely independent per lap. Without splits, the single calibration-derived
  // estimate is repeated across the interior laps (same value by construction).
  const splitsUsable =
    officialSplits != null &&
    officialSplits.length === N_LAPS &&
    officialSplits.every((s) => Number.isFinite(s) && s > 0) &&
    Math.abs(officialSplits.reduce((a, b) => a + b, 0) - officialTimeS) <= SPLITS_SUM_TOLERANCE_S

  const lineHeightsM: number[] = []
  if (splitsUsable) {
    const cum: number[] = [0]
    let acc = 0
    for (const s of officialSplits) {
      acc += s
      cum.push(acc)
    }
    for (let ln = 0; ln < N_LAPS; ln++) {
      if (ln + 1 < LINE_HEIGHT_FIRST_LAP || ln + 1 > lineHeightLastLap) {
        lineHeightsM.push(Number.NaN)
        continue
      }
      const dAtStart = interpAt(t, d, t0 + cum[ln])
      const dAtEnd = interpAt(t, d, t0 + cum[ln + 1])
      lineHeightsM.push((dAtEnd - dAtStart - LAP_M) / (2 * Math.PI))
    }
  } else {
    for (let ln = 0; ln < N_LAPS; ln++) {
      if (ln + 1 < LINE_HEIGHT_FIRST_LAP || ln + 1 > lineHeightLastLap) {
        lineHeightsM.push(Number.NaN)
        continue
      }
      const dAtStart = interpAt(t, d, lapBoundaryTimes[ln])
      const dAtEnd = interpAt(t, d, lapBoundaryTimes[ln + 1])
      lineHeightsM.push((dAtEnd - dAtStart - LAP_M) / (2 * Math.PI))
    }
  }

  const interior = lineHeightsM.filter((h) => Number.isFinite(h))
  const avgLineHeightM = interior.length > 0 ? interior.reduce((a, b) => a + b, 0) / interior.length : Number.NaN
  const extraDistanceM = interior.reduce((a, h) => a + 2 * Math.PI * h, 0)

  return {
    calibrationRace,
    calibrationInterior,
    d0,
    lapBoundaryTimes,
    lapCount,
    lineHeightsM,
    avgLineHeightM,
    extraDistanceM,
    lineHeightFromOfficialSplits: splitsUsable,
  }
}

/**
 * Half-lap boundary crossing times (datum n·L/2), SPEC §4.7.2 — deferred at P3/P4,
 * built here for §5.9's fastest-half-lap record. Mirrors the full-lap crossings above at
 * twice the resolution, using the same whole-race calibration (calibrationRace) and d0 so
 * every full-lap boundary is also exactly a half-lap boundary (index 2n).
 */
export function constructHalfLaps(
  tl: Timeline,
  detection: Detection,
  laps: LapConstruction,
  track: TrackModel,
): number[] {
  const { t, d } = tl
  const { t0 } = detection
  const LAP_M = track.lapLengthM
  const N_HALF_LAPS = lapCountOf(laps) * 2
  const boundaries: number[] = [t0]
  for (let hn = 1; hn <= N_HALF_LAPS; hn++) {
    const targetRaw = (hn * (LAP_M / 2)) / laps.calibrationRace + laps.d0
    const tc = crossingTime(t, d, targetRaw)
    boundaries.push(tc ?? Number.NaN)
  }
  return boundaries
}

/** Successive differences of half-lap boundary times — the 32 half-lap durations. */
export function halfLapTimes(halfLapBoundaryTimes: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < halfLapBoundaryTimes.length; i++) {
    const d = halfLapBoundaryTimes[i] - halfLapBoundaryTimes[i - 1]
    out.push(Number.isNaN(d) ? Number.NaN : d)
  }
  return out
}

/**
 * Build energy-balance Sample groups, one array per lap. Speed is the COM datum speed
 * v_com = c·v_wheel (c = interior calibration); position-in-lap s comes from the calibrated
 * distance. dt = 1 s (the timeline is 1 Hz). These feed §4.9 CdA directly.
 */
export function lapSampleGroups(
  tl: Timeline,
  laps: LapConstruction,
  track: TrackModel,
): Sample[][] {
  const { t, v, p, d } = tl
  const c = laps.calibrationInterior
  const d0 = laps.d0
  const L = track.lapLengthM
  const groups: Sample[][] = []

  for (let ln = 0; ln < lapCountOf(laps); ln++) {
    const a = laps.lapBoundaryTimes[ln]
    const b = laps.lapBoundaryTimes[ln + 1]
    if (Number.isNaN(a) || Number.isNaN(b)) {
      groups.push([])
      continue
    }
    const samples: Sample[] = []
    for (let tt = Math.ceil(a); tt < b; tt++) {
      const vWheel = interpAt(t, v, tt)
      const dCal = c * (interpAt(t, d, tt) - d0)
      const sInLap = ((dCal % L) + L) % L
      samples.push({ dt: 1, powerW: interpAt(t, p, tt), vCom: c * vWheel, s: sInLap })
    }
    groups.push(samples)
  }
  return groups
}

/**
 * Exact COM speed at each lap's true boundary times (the lap-line crossings), one
 * {start,end} pair per constructed lap, NaN where a boundary is missing. Feeds the ΔKE
 * boundary override in §4.9 CdA (see CdaInput.vComStartOverrideMs): the first/last
 * integer-second samples of a lap group sit up to ±1 s onto the within-lap speed
 * oscillation's slope — the same side every lap — which systematically biased every
 * per-lap CdA high (owner report 2026-07 round 5, item 1).
 */
export function lapBoundaryVComs(tl: Timeline, laps: LapConstruction): BoundaryVCom[] {
  const { t, v } = tl
  const c = laps.calibrationInterior
  const at = (bt: number): number => (Number.isNaN(bt) ? Number.NaN : c * interpAt(t, v, bt))
  const out: BoundaryVCom[] = []
  for (let ln = 0; ln < laps.lapBoundaryTimes.length - 1; ln++) {
    out.push({ startMs: at(laps.lapBoundaryTimes[ln]), endMs: at(laps.lapBoundaryTimes[ln + 1]) })
  }
  return out
}

/**
 * Default lap range to exclude from the steady CdA window when another rider was caught
 * (owner convention 2026-07 round 8): 2 laps before the catch to 1 lap after — the
 * approach is ridden in the other rider's growing draft (CdA reads low; his Pan Am data
 * shows the slide starting ~1.5 laps out) and the pass comes off the racing line (CdA
 * reads high). Every lap whose span intersects (catchLap − 2, catchLap + 1) is excluded —
 * a catch at lap 7.5 excludes laps 6–9. The range is a per-ride editable field
 * (Ride.caughtExcludeFromLap/ToLap); this is only its prefill. 1-based inclusive, clamped
 * to [1, lapCount]; null when the catch position is unusable.
 */
export function defaultCatchExclusionRange(
  caughtAtLap: number,
  lapCount = DEFAULT_LAP_COUNT,
): { fromLap: number; toLap: number } | null {
  if (!Number.isFinite(caughtAtLap) || caughtAtLap <= 0) return null
  // Lap n spans (n−1, n) in lap units; first lap intersecting (catch−2, ·) and last lap
  // intersecting (·, catch+1).
  const fromLap = Math.max(1, Math.floor(caughtAtLap - 2) + 1)
  const toLap = Math.min(lapCount, Math.ceil(caughtAtLap + 1))
  return fromLap <= toLap ? { fromLap, toLap } : null
}

/** Expand an inclusive 1-based lap range into the lap-number list the engine consumes. */
export function lapRangeToLaps(fromLap: number, toLap: number, lapCount = DEFAULT_LAP_COUNT): number[] {
  const out: number[] = []
  for (let n = Math.max(1, Math.round(fromLap)); n <= Math.min(lapCount, Math.round(toLap)); n++) out.push(n)
  return out
}

/**
 * Laps to exclude for a caught rider given the ride's (possibly owner-edited) range, or
 * the default range derived from the catch position.
 */
export function caughtRiderExcludedLaps(
  caughtAtLap: number,
  fromLap?: number,
  toLap?: number,
  lapCount = DEFAULT_LAP_COUNT,
): number[] {
  if (fromLap != null && toLap != null && Number.isFinite(fromLap) && Number.isFinite(toLap)) {
    return lapRangeToLaps(fromLap, toLap, lapCount)
  }
  const def = defaultCatchExclusionRange(caughtAtLap, lapCount)
  return def ? lapRangeToLaps(def.fromLap, def.toLap, lapCount) : []
}

/** A Sample plus its cumulative calibrated (datum) distance from the race start, m. */
export interface DistancedSample {
  sample: Sample
  distCumM: number
}

/**
 * Flat, time-ordered Sample series across the whole constructed race (lap 1 → lap 16),
 * each paired with its cumulative datum distance from the start line. Used for analyses
 * that need a continuous distance axis rather than per-lap grouping — e.g. rolling CdA
 * (§4.9 `cdaRolling`) and the speed-vs-position overlay.
 */
export function raceSampleSeries(tl: Timeline, laps: LapConstruction, track: TrackModel): DistancedSample[] {
  const { t, v, p, d } = tl
  const c = laps.calibrationInterior
  const d0 = laps.d0
  const L = track.lapLengthM
  const a = laps.lapBoundaryTimes[0]
  const b = laps.lapBoundaryTimes[lapCountOf(laps)]
  if (Number.isNaN(a) || Number.isNaN(b)) return []

  const out: DistancedSample[] = []
  for (let tt = Math.ceil(a); tt < b; tt++) {
    const vWheel = interpAt(t, v, tt)
    const distCumM = c * (interpAt(t, d, tt) - d0)
    const sInLap = ((distCumM % L) + L) % L
    out.push({
      sample: { dt: 1, powerW: interpAt(t, p, tt), vCom: c * vWheel, s: sInLap },
      distCumM,
    })
  }
  return out
}
