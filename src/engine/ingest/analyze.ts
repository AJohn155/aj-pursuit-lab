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
   * 1-based laps to drop from the steady CdA window (owner request 2026-07 round 6) —
   * e.g. the laps around catching another rider (caughtRiderExcludedLaps), whose energy
   * balance reflects draft + passing line rather than the rider's own aero. The per-lap
   * table still reports them; only cdaRace/CI skip them.
   */
  excludeCdaLaps?: number[]
}

export interface RideAnalysis {
  timeline: Timeline
  detection: Detection
  laps: LapConstruction
  /** cdaRace over the steady window (laps 3–16 minus any exclusions), m². */
  cdaRaceM2: number
  cdaCi95: number
  cdaPerLapM2: number[]
  /** The 1-based laps the steady CdA window actually used (3–16 minus exclusions/gaps). */
  cdaWindowLaps: number[]
  startMetrics: StartMetrics
  reproduction: ReproResult
}

/** Steady CdA window, 1-based (§4.9): laps 3–16. A laps 3–15 window was TRIED and rejected
 * (owner question 2026-07 round 6): on the quali fixture it halves the CI (lap 16 reads
 * 0.2096 vs ~0.167 scatter) but breaks the §7.5 sim-reproduction gate (delta −0.88 s →
 * −1.91 s) — lap 16's high CdA sits on the ride's real fatigue-drift trend, so excluding
 * it biases the headline low against the ride it must reproduce. Unlike line height
 * (a boundary-geometry quantity), the last lap's aero is mostly signal. */
const STEADY_FIRST_LAP = 3
const STEADY_LAST_LAP = 16
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
  const excluded = new Set(opts.excludeCdaLaps ?? [])
  const keep = groups.map(
    (g, ln) =>
      ln + 1 >= STEADY_FIRST_LAP && ln + 1 <= STEADY_LAST_LAP && !excluded.has(ln + 1) && g.length > 0,
  )
  const steady = groups.filter((_, ln) => keep[ln])
  const boundaryVComs = allBounds.filter((_, ln) => keep[ln])
  const cdaWindowLaps = keep.flatMap((k, ln) => (k ? [ln + 1] : []))
  const cda = cdaRace(steady, opts.rho, opts.params, opts.track, boundaryVComs)

  const startMetrics = reconstructStart(timeline, detection, laps, opts.params, opts.rho, cda.cdaRace)
  const reproduction = reproduceTime(timeline, detection, laps, cda.cdaRace, opts)

  return {
    timeline,
    detection,
    laps,
    cdaRaceM2: cda.cdaRace,
    cdaCi95: cda.ci95,
    cdaPerLapM2: cda.perLap,
    cdaWindowLaps,
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
