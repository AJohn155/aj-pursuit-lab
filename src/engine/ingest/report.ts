// Analysis result assembly, SPEC §4.15, plus the quality-badge wiring, SPEC §4.16.
//
// analyzeRide() (analyze.ts) is the tested, gated core: detection, calibration, cdaRace
// (steady window), start energy, sim reproduction. analyzeRideFull() wraps it with the P4
// additions — per-lap breakdown over ALL 16 laps, W′bal per lap, accel/decel, the
// speed-vs-position overlay, rolling CdA, peak-speed phase, and the quality badge — and
// assembles the compact §4.15 AnalysisResult for persistence (Ride.analysis).
//
// The richer per-second data (timeline, overlay, rolling) is NOT part of AnalysisResult
// and is not persisted — SPEC §3.3 documents `analysis` as "cached engine output,
// recomputed on demand", so the ride-detail page re-derives the rich data fresh from the
// stored raw .fit bytes each time; only the compact summary is cached for lists/records.

import { cdaRolling, energyBalanceCda } from '../cda'
import type { RollingCdaPoint } from '../cda'
import { ENGINE_VERSION } from '../constants'
import { wPrimeBalance } from '../wprime'
import { computeAccelDecel } from './accel'
import type { AccelDecel } from './accel'
import { analyzeRide } from './analyze'
import type { AnalyzeOptions, RideAnalysis } from './analyze'
import { peakSpeedPhaseDeg, steadyLapSpeedProfiles } from './geometry'
import { lapSampleGroups, raceSampleSeries } from './laps'
import { lapSpeedVsPositionSeries } from './overlay'
import type { LapPositionSeries } from './overlay'
import { assessQuality } from './quality'
import type { QualityBadge, QualityFlag } from './quality'
import { interpAt } from './util'

export interface CpWInput {
  cp: number
  wPrimeJ: number
}

/** One lap's summary row, SPEC §4.15 exact field names. */
export interface LapResult {
  timeS: number
  dist: number
  cda: number
  lineHeightM: number
  avgP: number
  avgV: number
  avgCad: number
  wPrimeEnd: number
}

/** SPEC §4.15 AnalysisResult — the compact, persisted shape (Ride.analysis). */
export interface AnalysisResult {
  detection: { t0: number; tEnd: number; confirmed: boolean }
  laps: LapResult[]
  cdaRace: number
  ci: number
  startMetrics: { energyJ: number; timeTo95PctCruise: number; peakPower: number }
  accelDecel: AccelDecel
  peakSpeedPhaseDeg: number
  qualityFlags: QualityFlag[]
  qualityScore: number
  engineVersion: string
}

export interface AnalyzeFullOptions extends AnalyzeOptions {
  cpW: CpWInput
  /** True when air density came from a measurement (direct or T/P/RH), not a default (§4.16). */
  densityKnown: boolean
}

/** One point of the continuous W′bal trajectory (SPEC §5.1 "W′bal curve"). */
export interface WBalPoint {
  /** Elapsed race time (s, relative to t0). */
  tS: number
  wBalJ: number
}

/** Everything the ride-detail page needs: the compact result plus rich diagnostics. */
export interface FullRideAnalysis {
  base: RideAnalysis
  overlay: LapPositionSeries[]
  rolling: RollingCdaPoint[]
  wBalCurve: WBalPoint[]
  quality: { score: number; badge: QualityBadge; flags: QualityFlag[] }
  analysisResult: AnalysisResult
}

const PEAK_PHASE_BINS = 36
/** Steady window start (1-based lap), matching analyzeRide's default cdaRace window (§4.9). */
const CRUISE_FIRST_LAP = 3

export function analyzeRideFull(content: ArrayBuffer | Uint8Array, opts: AnalyzeFullOptions): FullRideAnalysis {
  const base = analyzeRide(content, opts)
  const { timeline, detection, laps } = base
  const track = opts.track
  const expectedLapCount = Math.round(4000 / track.lapLengthM)
  const c = laps.calibrationInterior

  // W′bal across the whole race, sampled at each lap boundary (§4.13 applied to this ride).
  const wStart = Math.max(detection.t0, timeline.t[0])
  const wEnd = laps.lapBoundaryTimes[laps.lapBoundaryTimes.length - 1]
  const wPower: number[] = []
  for (let tt = Math.ceil(wStart); tt <= Math.floor(wEnd); tt++) {
    wPower.push(interpAt(timeline.t, timeline.p, tt))
  }
  const wBal =
    wPower.length > 0 ? wPrimeBalance({ power: wPower, dt: 1, cp: opts.cpW.cp, wPrime: opts.cpW.wPrimeJ }) : []
  function wPrimeAt(time: number): number {
    if (wBal.length === 0) return opts.cpW.wPrimeJ
    const idx = Math.round(time - Math.ceil(wStart))
    return wBal[Math.max(0, Math.min(wBal.length - 1, idx))]
  }
  const wBalCurve: WBalPoint[] = wBal.map((wBalJ, i) => ({ tS: Math.ceil(wStart) + i - detection.t0, wBalJ }))

  function meanOverLap(arr: number[], a: number, b: number, scale = 1): number {
    let sum = 0
    let n = 0
    for (let tt = Math.ceil(a); tt < b; tt++) {
      sum += scale * interpAt(timeline.t, arr, tt)
      n++
    }
    return n > 0 ? sum / n : Number.NaN
  }

  // Per-lap breakdown over ALL constructed laps (not just the steady window) — the lap
  // table shows every lap, including the standing-start laps where CdA is unreliable.
  const groups = lapSampleGroups(timeline, laps, track)
  const lapResults: LapResult[] = []
  for (let ln = 0; ln < laps.lapBoundaryTimes.length - 1; ln++) {
    const a = laps.lapBoundaryTimes[ln]
    const b = laps.lapBoundaryTimes[ln + 1]
    if (Number.isNaN(a) || Number.isNaN(b)) continue
    const group = groups[ln]
    const cda =
      group.length >= 2
        ? energyBalanceCda({ samples: group, rho: opts.rho, params: opts.params, track }).cdaM2
        : Number.NaN
    lapResults.push({
      timeS: b - a,
      dist: track.lapLengthM,
      cda,
      lineHeightM: laps.lineHeightsM[ln],
      avgP: meanOverLap(timeline.p, a, b),
      avgV: meanOverLap(timeline.v, a, b, c),
      avgCad: meanOverLap(timeline.cad, a, b),
      wPrimeEnd: wPrimeAt(b),
    })
  }

  // Start-panel metrics beyond startEnergyJ (§4.15 startMetrics.timeTo95PctCruise/peakPower
  // — spec names these fields but not their derivation). Documented choice: "cruise speed"
  // = the mean COM speed over the steady window (laps 3..N); time-to-95%-cruise walks
  // forward from t0 to the first sample reaching that threshold; peakPower is the highest
  // power recorded during that acceleration phase.
  const steadyLaps = lapResults.slice(CRUISE_FIRST_LAP - 1).filter((l) => Number.isFinite(l.avgV))
  const cruiseVComMs =
    steadyLaps.length > 0 ? steadyLaps.reduce((s, l) => s + l.avgV, 0) / steadyLaps.length : 0
  const searchStart = Math.max(detection.t0, timeline.t[0])
  const searchEnd = timeline.t[timeline.t.length - 1]
  let cruiseReachedAt = searchEnd
  for (let tt = Math.ceil(searchStart); tt <= searchEnd; tt++) {
    if (c * interpAt(timeline.t, timeline.v, tt) >= 0.95 * cruiseVComMs) {
      cruiseReachedAt = tt
      break
    }
  }
  const timeTo95PctCruise = cruiseReachedAt - detection.t0
  let peakPower = 0
  for (let tt = Math.ceil(searchStart); tt <= cruiseReachedAt; tt++) {
    peakPower = Math.max(peakPower, interpAt(timeline.t, timeline.p, tt))
  }

  const accelDecel = computeAccelDecel(timeline, laps)
  const overlay = lapSpeedVsPositionSeries(timeline, laps, track.lapLengthM)

  const series = raceSampleSeries(timeline, laps, track)
  const rolling = cdaRolling(
    series.map((s) => s.sample),
    series.map((s) => s.distCumM),
    opts.rho,
    opts.params,
    track,
  )

  const fullLapProfiles = steadyLapSpeedProfiles(timeline, laps, track.lapLengthM, PEAK_PHASE_BINS, {
    firstLap: 1,
    lastLap: expectedLapCount,
  })
  const avgProfile = new Array(PEAK_PHASE_BINS).fill(0)
  if (fullLapProfiles.length > 0) {
    for (const p of fullLapProfiles) {
      for (let i = 0; i < PEAK_PHASE_BINS; i++) avgProfile[i] += p[i] / fullLapProfiles.length
    }
  }
  const peakPhase = peakSpeedPhaseDeg(avgProfile, track.lapLengthM, track.bendRadiusM)

  const quality = assessQuality({
    dropoutSeconds: timeline.dropoutSeconds,
    interpolatedFraction: timeline.interpolatedFraction,
    officialDeltaS: detection.officialDeltaS,
    calibrationFactor: laps.calibrationInterior,
    detectedLapCount: laps.lapCount,
    expectedLapCount,
    cdaM2: base.cdaRaceM2,
    densityKnown: opts.densityKnown,
  })

  const analysisResult: AnalysisResult = {
    detection: { t0: detection.t0, tEnd: detection.tFinish, confirmed: true },
    laps: lapResults,
    cdaRace: base.cdaRaceM2,
    ci: base.cdaCi95,
    startMetrics: {
      energyJ: base.startMetrics.startEnergyJ,
      timeTo95PctCruise,
      peakPower,
    },
    accelDecel,
    peakSpeedPhaseDeg: peakPhase,
    qualityFlags: quality.flags,
    qualityScore: quality.score,
    engineVersion: ENGINE_VERSION,
  }

  return {
    base,
    overlay,
    rolling,
    wBalCurve,
    quality: { score: quality.score, badge: quality.badge, flags: quality.flags },
    analysisResult,
  }
}
