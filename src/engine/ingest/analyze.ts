// Top-level ride analysis pipeline (SPEC §4.4→§4.10, §4.15) and forward-sim reproduction.

import { cdaRace } from '../cda'
import { simulate } from '../simulate'
import type { RiderParams, TrackModel } from '../types'
import { detectRace } from './detect'
import { parseFitRecords } from './fit'
import { constructLaps, lapBoundaryVComs, lapSampleGroups } from './laps'
import { developmentM, reconstructSpeedFromCadence } from './speedFallback'
import { reconstructStart } from './start'
import { buildTimeline } from './timeline'
import type { Detection, LapConstruction, ReproResult, StartMetrics, Timeline } from './types'
import { interpAt } from './util'

export interface AnalyzeOptions {
  officialTimeS: number
  /** Official per-lap splits, when known — used to anchor interior lap boundaries for the
   * line-height estimate (§4.7.4 "prefer official-split-anchored laps"). */
  officialSplits?: number[]
  /** Air density ρ (kg/m³). */
  rho: number
  params: RiderParams
  track: TrackModel
  /**
   * When set, the file's speed/distance channels are DISCARDED and reconstructed from
   * cadence × development (rollout × chainring/cog) before any analysis — the fallback for
   * files whose speed channel is broken/aliased (see speedFallback.ts). Fixed gear, so the
   * reconstruction is exact up to integer-rpm rounding.
   */
  speedFromCadence?: { chainring: number; cog: number; rolloutM: number }
  /**
   * 1-based laps around a caught rider (caughtRiderExcludedLaps), whose energy balance
   * reflects draft + passing line rather than the rider's own aero. Since round 8 these no
   * longer change `cdaRaceM2` (the full-window number stays the app-wide value); they
   * produce the `cdaExcl` companion estimate reported alongside it.
   */
  excludeCdaLaps?: number[]
}

export interface RideAnalysis {
  timeline: Timeline
  detection: Detection
  laps: LapConstruction
  /** cdaRace over the FULL steady window (laps 3–15, no catch exclusions), m². */
  cdaRaceM2: number
  cdaCi95: number
  cdaPerLapM2: number[]
  /** The 1-based laps of the full steady window (3–15, minus data gaps only). */
  cdaWindowLaps: number[]
  /**
   * The catch-excluded CdA (owner request 2026-07 round 8): the same balance with the
   * caught-rider laps removed. Present only when exclusions were requested. The full
   * number stays the app-wide `cdaRaceM2`; this is the "your own aero" companion shown
   * alongside it on caught rides.
   */
  cdaExcl?: { cdaM2: number; ci95: number; windowLaps: number[] }
  startMetrics: StartMetrics
  reproduction: ReproResult
}

/** Steady CdA window, 1-based (owner convention 2026-07 round 7): laps 3–15. Laps 1–2 are
 * standing-start; lap 16 is excluded because its END boundary sits at t0 + officialTime —
 * it inherits the FULL start-anchor error (±1 s typical; up to ~2.5 s on missing-start
 * files), and an error there lands in the post-line coast-down where the balance misreads
 * deceleration as drag. Forensics on the quali fixture (missing start): recorded power
 * collapses 271→85→32 W over the 3 s BEFORE the constructed boundary while speed falls
 * 16.4→14.8 m/s — the boundary is ~2–3 s past the true line, and lap-16 CdA moves
 * +0.028 m² per +1 s of boundary error (vs ±0.019 symmetric for an interior lap). The
 * final fixture (clean start, pedaled through the line) shows a normal lap 16 either way.
 * Same reasoning as the line-height interior convention. Round 6 briefly kept lap 16 on a
 * sim-reproduction argument; that repro shares the same t0 anchor, so it couldn't
 * arbitrate — see PROGRESS 2026-07-13/14. */
const STEADY_FIRST_LAP = 3
const STEADY_LAST_LAP = 15
const MIN_VALID_POWER_W = 100
const RACE_DISTANCE_M = 4000

/** Full pipeline from raw bytes to a ride analysis. */
export function analyzeRide(content: ArrayBuffer | Uint8Array, opts: AnalyzeOptions): RideAnalysis {
  let records = parseFitRecords(content)
  if (opts.speedFromCadence) {
    const { rolloutM, chainring, cog } = opts.speedFromCadence
    records = reconstructSpeedFromCadence(records, developmentM(rolloutM, chainring, cog))
  }
  const timeline = buildTimeline(records)
  const detection = detectRace(timeline, opts.officialTimeS)
  const laps = constructLaps(timeline, detection, opts.officialTimeS, opts.officialSplits)

  const groups = lapSampleGroups(timeline, laps, opts.track)
  // Exact COM speeds at each lap's true boundary times, for the ΔKE terms — the first/last
  // integer-second samples sit up to ±1 s onto the within-lap speed slope, the same side
  // every lap, which biased every per-lap CdA high (2026-07 round 5 item 1). Kept aligned
  // with the groups by filtering both on the same predicate.
  const allBounds = lapBoundaryVComs(timeline, laps)
  const windowFor = (excludedLaps: Set<number>) => {
    const keep = groups.map(
      (g, ln) =>
        ln + 1 >= STEADY_FIRST_LAP && ln + 1 <= STEADY_LAST_LAP && !excludedLaps.has(ln + 1) && g.length > 0,
    )
    return {
      steady: groups.filter((_, ln) => keep[ln]),
      boundaryVComs: allBounds.filter((_, ln) => keep[ln]),
      windowLaps: keep.flatMap((k, ln) => (k ? [ln + 1] : [])),
    }
  }

  // Full window: the app-wide cdaRace, no catch exclusions.
  const fullWin = windowFor(new Set())
  const cda = cdaRace(fullWin.steady, opts.rho, opts.params, opts.track, fullWin.boundaryVComs)

  // Catch-excluded companion (owner round 8): both numbers are reported side by side —
  // full = what the race actually cost aerodynamically, excluded = your own aero with the
  // draft/pass laps removed.
  let cdaExcl: RideAnalysis['cdaExcl']
  if (opts.excludeCdaLaps != null && opts.excludeCdaLaps.length > 0) {
    const exclWin = windowFor(new Set(opts.excludeCdaLaps))
    if (exclWin.steady.length >= 2 && exclWin.windowLaps.length < fullWin.windowLaps.length) {
      const r = cdaRace(exclWin.steady, opts.rho, opts.params, opts.track, exclWin.boundaryVComs)
      cdaExcl = { cdaM2: r.cdaRace, ci95: r.ci95, windowLaps: exclWin.windowLaps }
    }
  }

  const startMetrics = reconstructStart(timeline, detection, laps, opts.params, opts.rho, cda.cdaRace)
  const reproduction = reproduceTime(timeline, detection, laps, cda.cdaRace, opts)

  return {
    timeline,
    detection,
    laps,
    cdaRaceM2: cda.cdaRace,
    cdaCi95: cda.ci95,
    cdaPerLapM2: cda.perLap,
    cdaWindowLaps: fullWin.windowLaps,
    cdaExcl,
    startMetrics,
    reproduction,
  }
}

/**
 * Forward-sim reproduction (SPEC §4.10 validation / gate 5). The standing-start power is
 * under-recorded (the meter reads ~0 while the rider is already accelerating hard off the
 * gate), so simulating from a dead stop with the raw power starves the acceleration. We
 * instead take the measured (real) elapsed time up to the first valid-power sample, then
 * simulate the remaining datum distance from that point with the measured power — where the
 * power series is trustworthy. Speeds are COM datum speeds (v_com = c·v_wheel), consistent
 * with the CdA.
 */
export function reproduceTime(
  timeline: Timeline,
  detection: Detection,
  laps: LapConstruction,
  cdaM2: number,
  opts: AnalyzeOptions,
): ReproResult {
  const { t, v, p, d } = timeline
  const c = laps.calibrationInterior
  const { d0, t0, firstMotionIdx } = detection

  let firstPowerIdx = firstMotionIdx
  while (firstPowerIdx < p.length - 1 && p[firstPowerIdx] < MIN_VALID_POWER_W) firstPowerIdx++

  const startTimeS = t[firstPowerIdx] - t0
  const datumCoveredM = c * (d[firstPowerIdx] - d0)
  const startTimeElapsed = t[firstPowerIdx]

  const sim = simulate({
    power: (tt) => Math.max(0, interpAt(t, p, startTimeElapsed + tt)),
    cdaM2,
    rho: opts.rho,
    params: opts.params,
    track: opts.track,
    distanceM: RACE_DISTANCE_M - datumCoveredM,
    v0: c * v[firstPowerIdx],
  })

  const simTimeS = startTimeS + sim.finishTimeS
  return { simTimeS, officialTimeS: opts.officialTimeS, deltaS: simTimeS - opts.officialTimeS }
}
