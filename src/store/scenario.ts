// Scenario physics (SPEC §3.4, §4.11, §5.3, §5.5): resolving a baseline (ride or blank) +
// overrides into concrete simulate() inputs, running the forward sim, solving in reverse
// for any one unknown, and adapting a scenario's simulated trajectory into the same shape
// Compare's charts already consume (so pinned scenarios can appear there — SPEC §5.2/§3.4
// "pinned scenarios appear as ghost lines in progression/compare charts" — without any of
// the five chart components needing to know a "ride" and a "scenario" are different things).

import type { RollingCdaPoint } from '../engine/cda'
import { cdaRolling } from '../engine/cda'
import { effectiveCrr } from '../engine/params'
import { settleSpeedForPower } from '../engine/startsplit'
import { makeTrack } from '../engine/track'
import {
  solveCdaForTime,
  solveCrrForTime,
  solveMassForTime,
  solvePowerForTime,
  solveRhoForTime,
} from '../engine/solve'
import type { SolveBase } from '../engine/solve'
import { simulate } from '../engine/simulate'
import type { PowerInput, SimResult } from '../engine/simulate'
import type { RiderParams, Sample, TrackModel } from '../engine/types'
import { wPrimeBalance } from '../engine/wprime'
import { assessQuality, computeAccelDecel, interpAt, lapSpeedVsPositionSeries, mean } from '../engine/ingest'
import type {
  AnalysisResult,
  Detection,
  FullRideAnalysis,
  LapConstruction,
  LapPositionSeries,
  LapResult,
  RideAnalysis,
  Timeline,
  WBalPoint,
} from '../engine/ingest'
import { analyzeStoredRide } from './analyzeStoredRide'
import { resolveRideDensity } from './density'
import type { Ride, Scenario, Settings, Venue } from './types'

/** A ride, already analyzed, usable as a scenario baseline. */
export interface ScenarioBaselineRide {
  ride: Ride
  venue: Venue
  full: FullRideAnalysis
}

/**
 * Turns a persisted Scenario's `baseline` field (a rideId or 'blank', SPEC §3.4) back into
 * a runnable baseline — shared by the Adjuster (loading a saved scenario back into the
 * form) and Compare (running a pinned scenario for the chart adapter above).
 */
export function resolveScenarioBaseline(
  baselineRef: string | 'blank',
  rides: Ride[],
  venues: Venue[],
  settings: Settings,
): ScenarioBaseline | { error: string } {
  if (baselineRef === 'blank') return 'blank'
  const ride = rides.find((r) => r.id === baselineRef)
  if (!ride) return { error: 'Baseline ride no longer exists.' }
  const venue = venues.find((v) => v.id === ride.venueId)
  if (!venue) return { error: "Baseline ride's venue no longer exists." }
  if (!ride.fitFileB64) return { error: 'Baseline ride has no .fit file to analyze.' }
  try {
    const full = analyzeStoredRide(ride, venue, settings)
    return { ride, venue, full }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export type ScenarioBaseline = ScenarioBaselineRide | 'blank'

// A "blank" baseline has no ride to derive CdA/power/mass from — these are a documented
// starting guess the override fields immediately make concrete (SPEC §5.3 baseline
// "ride or blank"); bisect(unbracketed target) or a nonsensical predicted time both make
// it obvious to the user when they need adjusting.
const BLANK_CDA_M2 = 0.19
const BLANK_AVG_POWER_W = 450
const BLANK_GEAR = { chainring: 65, cog: 15 }

/** Mean power over a lap breakdown, time-weighted by lap duration. Mirrors RidesList's
 * weightedAvgPower (pages/Rides/format.ts) — duplicated rather than imported so the store
 * layer doesn't reach into src/pages. */
function weightedAvgPower(laps: { timeS: number; avgP: number }[]): number | null {
  const valid = laps.filter((l) => Number.isFinite(l.avgP))
  if (valid.length === 0) return null
  const totalTime = valid.reduce((s, l) => s + l.timeS, 0)
  if (totalTime <= 0) return null
  return valid.reduce((s, l) => s + l.avgP * l.timeS, 0) / totalTime
}

export interface ResolvedScenario {
  venue: Venue
  track: TrackModel
  cdaM2: number
  params: RiderParams
  rho: number
  power: PowerInput
  gear: { chainring: number; cog: number }
  /** The baseline's own average power, W — informational (e.g. for a % override's caption). */
  baselineAvgPowerW: number
  /**
   * Real elapsed time (s) already spent, before `power`'s schedule takes over, that
   * `simulate()` doesn't model (see below) — added back on top of the sim's own finish
   * time. 0 for a blank baseline or a constant-power override (no real recording to
   * anchor to).
   */
  headStartS: number
  /** COM speed to start `simulate()` from. 0.5 (§4.10 default) unless a real schedule's
   * head start supplies a measured value. */
  v0: number
  /** Datum distance for `simulate()` to cover — 4000 minus whatever `headStartS` already
   * covered. */
  distanceM: number
  /** How far into lap 1 the sim already starts (m) — 4000 − distanceM. Keeps simulate()'s
   * lap-line crossings on true datum multiples of L even though distanceM isn't one
   * itself (SPEC §4.10's `lapPhaseOffsetM`). */
  lapPhaseOffsetM: number
}

/** §4.10/§4.6: the SRM under-reads while the rider is still accelerating off the gate, so
 * feeding a real ride's raw recorded power into simulate() from a standing v0=0.5 start
 * starves the acceleration and runs several seconds slow (verified: ~6 s on the quali
 * fixture) — exactly the problem `reproduceTime` (analyze.ts, gate 5) already solves by
 * skipping ahead to the first sample with a trustworthy power reading and starting the sim
 * from there with the real elapsed time/distance/speed already "in the bank". Scenarios
 * that use a ride's real power schedule adopt the same technique so predicted times are
 * anchored to reality; a constant-power override or a blank baseline has no such recording
 * to anchor to; §4.10's plain 0.5 m/s start stands for both of those. */
const MIN_VALID_POWER_W = 100
const RACE_DISTANCE_M = 4000

/**
 * Resolves a baseline + overrides (SPEC §3.4 Scenario.overrides) into everything
 * simulate()/solve() need. Gear is stored/reported but doesn't feed the physics (SPEC's
 * engine has no drivetrain model — cadence is a consequence of gear+speed, not an input).
 */
export function resolveScenario(
  baseline: ScenarioBaseline,
  overrides: Scenario['overrides'],
  settings: Settings,
  venues: Venue[],
): ResolvedScenario {
  const fallbackVenue = venues[0]
  if (!fallbackVenue) throw new Error('No venues exist to run a scenario against.')

  let baseCdaM2: number
  let baseAvgPowerW: number
  let baseCrrTyre: number
  let baseMechEfficiency: number
  let baseMassKg: number
  let baseRho: number
  let baseVenue: Venue
  let baseGear: { chainring: number; cog: number }
  // The baseline ride's own measured power(t) schedule (elapsed seconds SINCE
  // firstPowerIdx → W; see the head-start note above), preserved so a scale override
  // keeps the rider's real pacing shape rather than flattening it to a constant.
  let ridePower: ((tt: number) => number) | null = null
  let headStartS = 0
  let v0 = 0.5
  let distanceM = RACE_DISTANCE_M

  if (baseline === 'blank') {
    baseCdaM2 = BLANK_CDA_M2
    baseAvgPowerW = BLANK_AVG_POWER_W
    baseCrrTyre = settings.tyreCrr
    baseMechEfficiency = settings.mechEfficiency
    baseMassKg = settings.systemMassKg
    baseRho = settings.referenceAirDensity
    baseVenue = fallbackVenue
    baseGear = BLANK_GEAR
  } else {
    const { ride, venue, full } = baseline
    const { rho } = resolveRideDensity(ride, settings)
    baseCdaM2 = full.analysisResult.cdaRace
    // Recorded-samples convention app-wide (owner request 2026-07): a fresh analysis always
    // carries avgPowerRecordedW; the lap-average fallback only fires on synthetic inputs.
    baseAvgPowerW =
      (Number.isFinite(full.analysisResult.avgPowerRecordedW ?? Number.NaN)
        ? full.analysisResult.avgPowerRecordedW
        : null) ??
      weightedAvgPower(full.analysisResult.laps) ??
      BLANK_AVG_POWER_W
    // Per-ride physics overrides (2026-07 round 4, item 7) follow the same resolution as
    // analyzeStoredRide, so the scenario baseline matches the ride's own analysis.
    baseCrrTyre = ride.tyreCrr ?? settings.tyreCrr
    baseMechEfficiency = ride.mechEfficiency ?? settings.mechEfficiency
    baseMassKg = ride.systemMassKg
    baseRho = rho
    baseVenue = venue
    baseGear = ride.gear

    const { t, v, p, d } = full.base.timeline
    const { t0, d0, firstMotionIdx } = full.base.detection
    const c = full.base.laps.calibrationInterior
    let firstPowerIdx = firstMotionIdx
    while (firstPowerIdx < p.length - 1 && p[firstPowerIdx] < MIN_VALID_POWER_W) firstPowerIdx++
    const startTimeElapsed = t[firstPowerIdx]
    headStartS = startTimeElapsed - t0
    v0 = c * v[firstPowerIdx]
    distanceM = RACE_DISTANCE_M - c * (d[firstPowerIdx] - d0)
    ridePower = (tt: number) => Math.max(0, interpAt(t, p, startTimeElapsed + tt))
  }

  const venue = overrides.venueId ? (venues.find((v) => v.id === overrides.venueId) ?? baseVenue) : baseVenue
  const track = makeTrack(venue.lapLengthM, venue.bendRadiusM)
  const cdaM2 = overrides.cdA ?? baseCdaM2
  const massKg = overrides.massKg ?? baseMassKg
  const rho = overrides.airDensity ?? baseRho
  const crrEff = effectiveCrr(overrides.crr ?? baseCrrTyre, venue.surfaceFactor)
  const params: RiderParams = {
    massKg,
    rotatingMassEqKg: settings.rotatingMassEqKg,
    crrEff,
    mechEfficiency: baseMechEfficiency,
    comHeightM: settings.comHeightM,
  }
  const gear = overrides.gear ?? baseGear

  let power: PowerInput
  if (overrides.avgPowerW != null && overrides.startLapS != null) {
    // Start-split model (owner item 12, 2026-07): lap 1 is exactly the entered split, and
    // the remaining laps ride at flat avgPowerW starting from the settle speed that power
    // holds on this track. Reuses the head-start plumbing: headStartS = the start split,
    // distanceM = the remaining laps, and the lap-phase offset lands the lap-1 line at the
    // sim's own t=0.
    power = overrides.avgPowerW
    headStartS = overrides.startLapS
    v0 = settleSpeedForPower(overrides.avgPowerW, { cdaM2, rho, params, track })
    distanceM = RACE_DISTANCE_M - track.lapLengthM
  } else if (overrides.avgPowerW != null) {
    // A flat constant-power target replaces the real pacing shape entirely — "what if I
    // held a steady N watts" is a genuinely different question from "what if I rode my
    // real race N% harder everywhere". The head start itself is a historical fact about
    // the baseline ride's actual recorded acceleration (or its absence, for 'blank'),
    // independent of what power model is applied afterward, so headStartS/v0/distanceM
    // (already set above, per baseline) are left as they are.
    power = overrides.avgPowerW
  } else {
    const scale = overrides.powerScale ?? 1
    power = ridePower ? ((tt: number) => scale * (ridePower as (tt: number) => number)(tt)) : baseAvgPowerW * scale
  }

  return {
    venue,
    track,
    cdaM2,
    params,
    rho,
    power,
    gear,
    baselineAvgPowerW: baseAvgPowerW,
    headStartS,
    v0,
    distanceM,
    lapPhaseOffsetM: RACE_DISTANCE_M - distanceM,
  }
}

export interface ScenarioRunResult {
  predictedTimeS: number
  lapSplits: number[]
  lapTimes: number[]
  sim: SimResult
}

/**
 * Runs the forward simulator (SPEC §4.10) over a resolved scenario, prepending
 * `headStartS` back on top (see the head-start note above) — `sim.lapSplits` and
 * `.finishTimeS` are relative to that point, not the true start line, so every reported
 * time gets it added back; lap 1 absorbs the head start (it physically happened during
 * lap 1), laps 2+ are the sim's own successive lap times unchanged.
 */
export function runScenario(resolved: ResolvedScenario): ScenarioRunResult {
  const sim = simulate({
    power: resolved.power,
    cdaM2: resolved.cdaM2,
    rho: resolved.rho,
    params: resolved.params,
    track: resolved.track,
    distanceM: resolved.distanceM,
    v0: resolved.v0,
    lapPhaseOffsetM: resolved.lapPhaseOffsetM,
  })
  const lapSplits = sim.lapSplits.map((s) => resolved.headStartS + s)
  const lapTimes = lapSplits.map((split, i) => (i === 0 ? split : split - lapSplits[i - 1]))
  return { predictedTimeS: resolved.headStartS + sim.finishTimeS, lapSplits, lapTimes, sim }
}

export type SolveKey = 'power' | 'cdA' | 'crr' | 'massKg' | 'rho'

export const SOLVE_KEY_LABELS: Record<SolveKey, string> = {
  power: 'Power (W)',
  cdA: 'CdA (m²)',
  crr: 'Crr (effective)',
  massKg: 'Mass (kg)',
  rho: 'Air density (kg/m³)',
}

/**
 * Solve-for-anything (SPEC §4.11): given a resolved scenario (everything except the
 * chosen unknown) and a target time, bisect for the one field that would produce it.
 * The unknown's own value in `resolved` is irrelevant — each solve*ForTime overrides
 * exactly that field internally. `bisect` only ever sees `simulate().finishTimeS`, which
 * excludes `headStartS` (see runScenario), so it's subtracted from the target here —
 * this is what keeps the round trip exact: solving for the time `runScenario` itself
 * just predicted recovers the original input.
 */
export function solveScenarioUnknown(key: SolveKey, targetTimeS: number, resolved: ResolvedScenario): number {
  const base: SolveBase = {
    power: resolved.power,
    cdaM2: resolved.cdaM2,
    rho: resolved.rho,
    params: resolved.params,
    track: resolved.track,
    distanceM: resolved.distanceM,
    v0: resolved.v0,
    lapPhaseOffsetM: resolved.lapPhaseOffsetM,
  }
  const simTargetS = targetTimeS - resolved.headStartS
  switch (key) {
    case 'power':
      return solvePowerForTime(simTargetS, base)
    case 'cdA':
      return solveCdaForTime(simTargetS, base)
    case 'crr':
      return solveCrrForTime(simTargetS, base)
    case 'massKg':
      return solveMassForTime(simTargetS, base)
    case 'rho':
      return solveRhoForTime(simTargetS, base)
  }
}

/**
 * Watts-equivalent for a time gain (SPEC §5.5 unit toggle "seconds ⇄ watts-equivalent"):
 * the constant-power increase over the baseline that would have produced the same faster
 * time, holding CdA/crr/mass/rho at the baseline's values. Uses the baseline's own
 * average power as the bisection anchor rather than the scenario's (possibly very
 * different) power, since "watts-equivalent" is meant to answer "how many more watts,
 * all else baseline, would this be worth".
 */
export function wattsEquivalentForTimeGain(fasterTimeS: number, resolved: ResolvedScenario): number {
  const base: SolveBase = {
    power: resolved.baselineAvgPowerW,
    cdaM2: resolved.cdaM2,
    rho: resolved.rho,
    params: resolved.params,
    track: resolved.track,
    distanceM: resolved.distanceM,
    v0: resolved.v0,
    lapPhaseOffsetM: resolved.lapPhaseOffsetM,
  }
  const bracket: [number, number] = [
    Math.max(50, resolved.baselineAvgPowerW - 200),
    resolved.baselineAvgPowerW + 300,
  ]
  const solvedPower = solvePowerForTime(fasterTimeS - resolved.headStartS, base, bracket)
  return solvedPower - resolved.baselineAvgPowerW
}

// ---------------------------------------------------------------------------------
// Compare adapter: turns a scenario's simulated trajectory into a FullRideAnalysis so
// the five existing Compare charts (which only read `full.base.{timeline,laps,detection}`,
// `full.analysisResult.laps`, `full.wBalCurve`, and `full.overlay` — never `full.rolling`
// or `full.quality`) work on a scenario exactly like a real ride, with no chart-side
// branching. A scenario has no measurement noise and an exactly-known CdA (it's the input,
// not a fit), so `analysisResult.cdaRace`/per-lap `cda` are set directly to `cdaM2` rather
// than re-deriving it via the energy balance.
// ---------------------------------------------------------------------------------

/** The forward sim's fixed step (SPEC §4.10); resampling below assumes this exact value —
 * scenarios always call simulate() at its default dt, never overridden. */
const SIM_DT = 0.1

function resampleSimTo1Hz(samples: SimResult['samples']): { t: number[]; v: number[]; p: number[]; d: number[] } {
  const lastT = samples[samples.length - 1]?.t ?? 0
  const nSec = Math.floor(lastT)
  const t: number[] = []
  const v: number[] = []
  const p: number[] = []
  const d: number[] = []
  for (let sec = 0; sec <= nSec; sec++) {
    const idx = sec / SIM_DT
    const i0 = Math.min(samples.length - 1, Math.floor(idx))
    const i1 = Math.min(samples.length - 1, i0 + 1)
    const frac = idx - i0
    t.push(sec)
    v.push(samples[i0].v + frac * (samples[i1].v - samples[i0].v))
    p.push(samples[i0].p + frac * (samples[i1].p - samples[i0].p))
    d.push(samples[i0].s + frac * (samples[i1].s - samples[i0].s))
  }
  return { t, v, p, d }
}

function meanOverLap(arr: number[], a: number, b: number): number {
  let sum = 0
  let n = 0
  // Clamped to 0: `a` can be negative for lap 1 (its boundary is `-headStartS`, before the
  // synthetic timeline's own t=0 — see scenarioToFullAnalysis) and there's no per-second
  // data for that head-start prefix to average in.
  for (let tt = Math.max(0, Math.ceil(a)); tt < b && tt < arr.length; tt++) {
    sum += arr[tt]
    n++
  }
  return n > 0 ? sum / n : 0
}

function wBalAt(time: number, wBal: number[]): number {
  if (wBal.length === 0) return 0
  const idx = Math.max(0, Math.min(wBal.length - 1, Math.round(time)))
  return wBal[idx]
}

export function scenarioToFullAnalysis(
  run: ScenarioRunResult,
  resolved: ResolvedScenario,
  cpW: { cp: number; wPrimeJ: number },
): FullRideAnalysis {
  const { sim } = run
  const nLaps = sim.lapSplits.length
  const track = resolved.track

  const { t, v, p, d: dRaw } = resampleSimTo1Hz(sim.samples)
  // `sim.samples[i].s` is 0-based from wherever the sim itself started (after the head
  // start) — shift back onto the true datum (0 at the true start line) so downstream
  // distance-vs-time (Compare's gap chart) and position-in-lap (the overlay chart) are
  // both correct, not just the lap-crossing *times* the lapPhaseOffsetM fix above handles.
  const d = dRaw.map((x) => x + resolved.lapPhaseOffsetM)
  const timeline: Timeline = {
    t,
    v,
    p,
    d,
    cad: t.map(() => 0),
    interpolated: t.map(() => false),
    dropoutSeconds: 0,
    interpolatedFraction: 0,
    segmentCount: 1,
    segmentSpanS: t[t.length - 1] ?? 0,
    recordIntervalS: 1,
  }

  // Lap 1's boundary is `-headStartS`, before the synthetic timeline's own t=0 — mirrors
  // how a real "missing start" ride's t0 is also negative/extrapolated before its first
  // recorded sample (detect.ts). This is what lets lap 1 correctly absorb the head-start
  // time in every downstream computation that already knows how to handle it (interpAt
  // clamps for tt<0; meanOverLap above is clamped explicitly).
  const laps: LapConstruction = {
    calibrationRace: 1,
    calibrationInterior: 1,
    d0: 0,
    lapBoundaryTimes: [-resolved.headStartS, ...sim.lapSplits],
    lapCount: nLaps,
    lineHeightsM: sim.lapSplits.map(() => 0),
    avgLineHeightM: 0,
    extraDistanceM: 0,
    lineHeightFromOfficialSplits: false,
  }

  const detection: Detection = {
    t0: -resolved.headStartS,
    tFinish: sim.finishTimeS,
    detectedDurationS: run.predictedTimeS,
    missingStart: resolved.headStartS > 0,
    startVComMs: resolved.v0,
    firstMotionIdx: 0,
    raceWindow: { startIdx: 0, endIdx: sim.samples.length - 1 },
    raceMeanPowerW: sim.samples.length > 0 ? mean(sim.samples.map((s) => s.p)) : 0,
    d0: 0,
  }

  const wBal = t.length > 0 ? wPrimeBalance({ power: p, dt: 1, cp: cpW.cp, wPrime: cpW.wPrimeJ }) : []
  const wBalCurve: WBalPoint[] = wBal.map((wBalJ, i) => ({ tS: resolved.headStartS + t[i], wBalJ }))

  const lapResults: LapResult[] = []
  for (let ln = 0; ln < nLaps; ln++) {
    const a = laps.lapBoundaryTimes[ln]
    const b = laps.lapBoundaryTimes[ln + 1]
    lapResults.push({
      timeS: b - a,
      dist: track.lapLengthM,
      cda: resolved.cdaM2,
      lineHeightM: 0,
      avgP: meanOverLap(p, a, b),
      avgV: meanOverLap(v, a, b),
      avgCad: 0,
      wPrimeEnd: wBalAt(b, wBal),
    })
  }

  const accelDecel = computeAccelDecel(timeline, laps)
  const overlay: LapPositionSeries[] = lapSpeedVsPositionSeries(timeline, laps, track.lapLengthM)

  // Cheap rolling-CdA reconstruction (only used if something later reads `.rolling`; no
  // Compare chart does today) — reuses cdaRolling directly since calibrationInterior=1.
  const seriesSamples: Sample[] = []
  const seriesDist: number[] = []
  const L = track.lapLengthM
  for (let i = 0; i < d.length; i++) {
    seriesSamples.push({ dt: 1, powerW: p[i], vCom: v[i], s: ((d[i] % L) + L) % L })
    seriesDist.push(d[i])
  }
  const rolling: RollingCdaPoint[] = seriesSamples.length > 1 ? cdaRolling(seriesSamples, seriesDist, resolved.rho, resolved.params, track) : []

  const quality = assessQuality({
    dropoutSeconds: 0,
    interpolatedFraction: 0,
    calibrationFactor: 1,
    detectedLapCount: nLaps,
    expectedLapCount: nLaps,
    cdaM2: resolved.cdaM2,
    densityKnown: true,
  })

  const analysisResult: AnalysisResult = {
    detection: { t0: -resolved.headStartS, tEnd: sim.finishTimeS, confirmed: true },
    laps: lapResults,
    cdaRace: resolved.cdaM2,
    ci: 0,
    startMetrics: { energyJ: 0, timeTo95PctCruise: 0, peakPower: sim.samples.length > 0 ? Math.max(...sim.samples.map((s) => s.p)) : 0 },
    accelDecel,
    peakSpeedPhaseDeg: 0,
    qualityFlags: quality.flags,
    qualityScore: quality.score,
    engineVersion: 'scenario-sim',
    // A simulated scenario has no un-recorded start prefix, so both conventions coincide
    // with the plain means over the simulated laps.
    avgPowerRecordedW: detection.raceMeanPowerW,
    avgPowerExclLap1W:
      lapResults.length > 1
        ? lapResults.slice(1).reduce((s, l) => s + l.avgP * l.timeS, 0) /
          lapResults.slice(1).reduce((s, l) => s + l.timeS, 0)
        : detection.raceMeanPowerW,
    extraDistanceM: 0,
  }

  const base: RideAnalysis = {
    timeline,
    detection,
    laps,
    cdaRaceM2: resolved.cdaM2,
    cdaCi95: 0,
    cdaPerLapM2: lapResults.map((l) => l.cda),
    startMetrics: { startEnergyJ: 0, timeToFirstPowerS: 0, firstPowerVComMs: detection.startVComMs },
    reproduction: { simTimeS: run.predictedTimeS, officialTimeS: run.predictedTimeS, deltaS: 0 },
  }

  return {
    base,
    overlay,
    rolling,
    wBalCurve,
    quality: { score: quality.score, badge: quality.badge, flags: quality.flags },
    analysisResult,
    // A scenario's positions are exact by construction (simulated on the track model), so
    // there's no start-datum phase error to correct for — charts skip re-anchoring.
    geometry: null,
  }
}
