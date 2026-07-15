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
import { fitVenueGeometry, peakSpeedPhaseDeg, steadyLapSpeedProfiles } from './geometry'
import type { GeometryFit } from './geometry'
import { lapBoundaryVComs, lapSampleGroups, raceSampleSeries } from './laps'
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
  /** Mean power over recorded samples, from the first trustworthy reading (≥100 W) to the
   * finish — the SRM/head-unit convention, and the app-wide display convention (owner
   * request 2026-07: never average the un-recorded start's zeros). W. Absent on pre-0.4.0
   * caches. */
  avgPowerRecordedW?: number
  /** Mean power from the lap-2 line to the finish (the owner's "Power excluding lap 1"). W.
   * Absent on pre-0.4.0 caches. */
  avgPowerExclLap1W?: number
  /** Total extra wheel distance implied by line heights over laps 3–15, m (see
   * LapConstruction.extraDistanceM). Absent on pre-0.4.0 caches. */
  extraDistanceM?: number
  /** Catch-excluded CdA companion (owner request 2026-07 round 8): the steady-window
   * balance with the caught-rider laps removed — "your own aero", shown alongside the
   * full `cdaRace` on caught rides. Absent when the ride has no catch exclusions or on
   * pre-0.8.0 caches. */
  cdaExclCatch?: number
  /** 95 % CI half-width of `cdaExclCatch`. */
  cdaExclCatchCi?: number
  /** The 1-based laps `cdaExclCatch` used (its window description in the UI). */
  cdaExclCatchLaps?: number[]
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
  /**
   * §4.8 geometry fit for THIS ride's steady laps — charts use `phaseOffsetM` to re-anchor
   * position-in-lap onto track coordinates (0 = start of a straight), so overlays from
   * different rides line up with each other and with the bends, regardless of each ride's
   * own start-datum anchoring error (the §4.7.3 gap). Null when the fit isn't possible
   * (degenerate data, or a synthetic scenario whose positions are already exact).
   */
  geometry: GeometryFit | null
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
  // ΔKE boundary speeds are interpolated at the true lap-line times (see lapBoundaryVComs)
  // — the sample-edge default is phase-locked to the lap line and biased every lap high.
  const groups = lapSampleGroups(timeline, laps, track)
  const bounds = lapBoundaryVComs(timeline, laps)
  const lapResults: LapResult[] = []
  for (let ln = 0; ln < laps.lapBoundaryTimes.length - 1; ln++) {
    const a = laps.lapBoundaryTimes[ln]
    const b = laps.lapBoundaryTimes[ln + 1]
    if (Number.isNaN(a) || Number.isNaN(b)) continue
    const group = groups[ln]
    const cda =
      group.length >= 2
        ? energyBalanceCda({
            samples: group,
            rho: opts.rho,
            params: opts.params,
            track,
            vComStartOverrideMs: Number.isFinite(bounds[ln]?.startMs) ? bounds[ln].startMs : undefined,
            vComEndOverrideMs: Number.isFinite(bounds[ln]?.endMs) ? bounds[ln].endMs : undefined,
          }).cdaM2
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
  // Owner-requested (2026-07): a 2-lap window instead of §4.9's 1-lap — the 1-lap window
  // was too spiky to read; this is the display-only diagnostic, so the change is purely
  // presentational (cdaRace and the per-lap CdA are untouched). Round 4 item 5: still too
  // spiky — the points themselves now get a triangular smooth (radius 2 ≈ ±½ lap of
  // centers) on top of the window-edge ΔKE smoothing.
  const rolling = cdaRolling(
    series.map((s) => s.sample),
    series.map((s) => s.distCumM),
    opts.rho,
    opts.params,
    track,
    2 * track.lapLengthM,
    track.lapLengthM / 4,
    2,
    // Windows overlapping lap 1 have no start-energy term in their balance, so their
    // "CdA" is inflated by the standing start — the tall left-edge hump the owner read as
    // spikes. Same reasoning as the per-lap chart clipping laps 1–2.
  ).filter((p) => p.centerDistM - track.lapLengthM >= track.lapLengthM)

  const geometry: GeometryFit | null = (() => {
    try {
      const steadyProfiles = steadyLapSpeedProfiles(timeline, laps, track.lapLengthM)
      return fitVenueGeometry(steadyProfiles, track.lapLengthM, { comHeightM: opts.params.comHeightM })
    } catch {
      return null
    }
  })()

  // Steady laps only (3–15, the module default) — the standing-start ramp contaminated the
  // full-race average this used before 0.4.0 (deferred P4-review item, folded into this
  // version bump).
  const steadyPhaseProfiles = steadyLapSpeedProfiles(timeline, laps, track.lapLengthM, PEAK_PHASE_BINS)
  const avgProfile = new Array(PEAK_PHASE_BINS).fill(0)
  if (steadyPhaseProfiles.length > 0) {
    for (const p of steadyPhaseProfiles) {
      for (let i = 0; i < PEAK_PHASE_BINS; i++) avgProfile[i] += p[i] / steadyPhaseProfiles.length
    }
  }
  const peakPhase = peakSpeedPhaseDeg(avgProfile, track.lapLengthM, track.bendRadiusM)

  // App-wide power conventions (owner request 2026-07): recorded-samples average (from the
  // first ≥100 W reading — the SRM/head-unit number) and "power excluding lap 1".
  const raceStart = Math.max(detection.t0, timeline.t[0])
  const raceEnd = laps.lapBoundaryTimes[laps.lapBoundaryTimes.length - 1]
  let firstPowerT = Math.ceil(raceStart)
  while (firstPowerT < raceEnd && interpAt(timeline.t, timeline.p, firstPowerT) < 100) firstPowerT++
  const avgPowerRecordedW = meanOverLap(timeline.p, firstPowerT, raceEnd)
  const avgPowerExclLap1W = Number.isNaN(laps.lapBoundaryTimes[1])
    ? Number.NaN
    : meanOverLap(timeline.p, laps.lapBoundaryTimes[1], raceEnd)

  // §4.16 scores "dropout seconds in race" — count interpolated samples inside the
  // detected race window only, not across the whole timeline segment. The final fixture's
  // segment carries ~23 s of gaps from standing at the gate BEFORE the start; those must
  // not dock a race whose in-window recording is clean. (timeline.dropoutSeconds remains
  // the segment-wide stat, still reported by gate 1.)
  let raceDropoutSeconds = 0
  let raceSampleCount = 0
  for (let i = 0; i < timeline.t.length; i++) {
    const tt = timeline.t[i]
    if (tt >= detection.t0 && tt <= detection.tFinish) {
      raceSampleCount++
      if (timeline.interpolated[i]) raceDropoutSeconds++
    }
  }

  const quality = assessQuality({
    dropoutSeconds: raceDropoutSeconds,
    interpolatedFraction: raceSampleCount > 0 ? raceDropoutSeconds / raceSampleCount : 0,
    officialDeltaS: detection.officialDeltaS,
    calibrationFactor: laps.calibrationInterior,
    detectedLapCount: laps.lapCount,
    expectedLapCount,
    cdaM2: base.cdaRaceM2,
    densityKnown: opts.densityKnown,
    speedFromCadence: opts.speedFromCadence != null,
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
    avgPowerRecordedW,
    avgPowerExclLap1W,
    extraDistanceM: laps.extraDistanceM,
    ...(base.cdaExcl
      ? {
          cdaExclCatch: base.cdaExcl.cdaM2,
          cdaExclCatchCi: base.cdaExcl.ci95,
          cdaExclCatchLaps: base.cdaExcl.windowLaps,
        }
      : {}),
  }

  return {
    base,
    overlay,
    rolling,
    wBalCurve,
    quality: { score: quality.score, badge: quality.badge, flags: quality.flags },
    analysisResult,
    geometry,
  }
}
