// Pure comparison math (SPEC §5.2). Kept out of the React tree so it's unit-testable like
// the engine. Not itself part of src/engine (it consumes FullRideAnalysis, a store-adjacent
// shape), but has no DOM dependency.

import type { FullRideAnalysis, LapPositionSeries } from '../../engine/ingest'
import { interpAt } from '../../engine/ingest'

/** Distinct line colors, cycled if more rides are selected than colors — re-tuned to the
 * 2026-07 reference palette (violet/cyan/mint family first) while staying tellable apart. */
export const COMPARE_COLORS = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#6366f1', '#84cc16']

export function colorFor(index: number): string {
  return COMPARE_COLORS[index % COMPARE_COLORS.length]
}

/** One selected ride or pinned scenario, fully analyzed, ready for any of the Compare
 * charts — a scenario's `full` is a synthetic FullRideAnalysis built by
 * `scenarioToFullAnalysis` (store/scenario.ts) from its simulated trajectory, shaped
 * identically to a real ride's so no chart component needs to know the difference. */
export interface CompareItem {
  id: string
  label: string
  color: string
  full: FullRideAnalysis
  lapLengthM: number
  /** The ride's official per-lap splits, when it has them — the gap chart anchors its
   * elapsed times on these (owner request 2026-07). Absent for scenarios. */
  officialSplits?: number[]
  /** Air density this selection's times happened at (ride: resolved ρ; scenario: sim ρ) —
   * feeds the gap chart's density-normalization toggle (owner request 2026-07 round 5). */
  rho?: number
}

/** Cumulative calibrated (datum) distance vs elapsed race time, 1 Hz, whole race. */
export interface DistanceTimeSeries {
  distM: number[]
  elapsedS: number[]
}

/**
 * Builds a monotonic distance→elapsed-time series for the gap chart, mirroring
 * `raceSampleSeries` (engine/ingest/laps.ts) but keeping elapsed time instead of discarding
 * it — that function only returns cumulative distance per sample.
 *
 * When the ride carries official per-lap splits, the series is re-anchored onto them
 * (owner request 2026-07): within each lap the reconstructed timeline still provides the
 * shape, but it's affinely stretched so the elapsed time at every lap line equals the
 * official cumulative split. Lap 1 in particular is otherwise polluted by the ±1 s
 * start-anchor detection residual; with splits present, the gap at any lap line is exactly
 * the official-time gap.
 */
export function buildDistanceTimeSeries(
  full: FullRideAnalysis,
  opts: { officialSplits?: number[]; lapLengthM?: number } = {},
): DistanceTimeSeries {
  const { timeline, laps, detection } = full.base
  const { t, d } = timeline
  const c = laps.calibrationInterior
  const d0 = laps.d0
  const a = laps.lapBoundaryTimes[0]
  const b = laps.lapBoundaryTimes[laps.lapBoundaryTimes.length - 1]
  const distM: number[] = []
  const elapsedS: number[] = []
  if (Number.isNaN(a) || Number.isNaN(b)) return { distM, elapsedS }
  for (let tt = Math.ceil(a); tt <= b; tt++) {
    distM.push(c * (interpAt(t, d, tt) - d0))
    elapsedS.push(tt - detection.t0)
  }
  const series = { distM, elapsedS }

  const splits = opts.officialSplits
  if (!splits || splits.length < 2 || splits.some((s) => !Number.isFinite(s) || s <= 0)) return series
  const L = opts.lapLengthM ?? 250

  const official: number[] = [0]
  let acc = 0
  for (const s of splits) {
    acc += s
    official.push(acc)
  }
  // Reconstructed elapsed time at each lap line; bail out (unanchored) if the
  // reconstruction is degenerate rather than divide by a non-positive span.
  const recon = official.map((_, i) => timeAtDistance(series, i * L))
  for (let i = 1; i < recon.length; i++) {
    if (!(recon[i] > recon[i - 1])) return series
  }

  const remapped = elapsedS.map((tt, i) => {
    const lap = Math.max(0, Math.min(splits.length - 1, Math.floor(distM[i] / L)))
    const scale = (official[lap + 1] - official[lap]) / (recon[lap + 1] - recon[lap])
    return official[lap] + (tt - recon[lap]) * scale
  })
  return { distM, elapsedS: remapped }
}

/** Linear-interpolates elapsed time at an arbitrary cumulative distance. Clamps to ends. */
export function timeAtDistance(series: DistanceTimeSeries, distM: number): number {
  const { distM: xs, elapsedS: ys } = series
  if (xs.length === 0) return Number.NaN
  if (distM <= xs[0]) return ys[0]
  if (distM >= xs[xs.length - 1]) return ys[ys.length - 1]
  for (let i = 1; i < xs.length; i++) {
    if (xs[i - 1] <= distM && xs[i] >= distM) {
      const span = xs[i] - xs[i - 1]
      const frac = span === 0 ? 0 : (distM - xs[i - 1]) / span
      return ys[i - 1] + frac * (ys[i] - ys[i - 1])
    }
  }
  return ys[ys.length - 1]
}

const GAP_GRID_STEP_M = 20
const RACE_DISTANCE_M = 4000

/** One ride's gap curve: elapsed-time delta vs the reference (first selected) ride. */
export interface GapSeries {
  distM: number[]
  gapS: number[]
}

/** Cumulative time-delta vs distance, first ride = reference (SPEC §5.2 gap chart). */
export function gapCharts(seriesList: DistanceTimeSeries[]): GapSeries[] {
  if (seriesList.length === 0) return []
  const grid: number[] = []
  for (let d = 0; d <= RACE_DISTANCE_M; d += GAP_GRID_STEP_M) grid.push(d)
  const reference = seriesList[0]
  const refTimes = grid.map((d) => timeAtDistance(reference, d))
  return seriesList.map((series) => ({
    distM: grid,
    gapS: grid.map((d, i) => timeAtDistance(series, d) - refTimes[i]),
  }))
}

const SPEED_POS_BINS = 40

/** One ride's average speed-vs-position-in-lap, binned across a steady lap range. */
export interface SpeedPositionAverage {
  posM: number[]
  speedMs: number[]
}

/**
 * Averages the per-lap speed-vs-position series (already computed per ride, SPEC §5.1's
 * per-ride overlay) across a steady lap window into position bins, so Compare can show one
 * representative line per ride rather than 16 lines per ride. Binned rather than a raw
 * per-second overlay because different rides' laps don't share position samples.
 *
 * `phaseOffsetM` (the ride's fitted §4.8 lap-line phase) re-anchors positions onto track
 * coordinates (0 = start of a straight) before binning, so different rides' bends line up
 * with each other despite each ride's own start-datum anchoring error (§4.7.3 gap).
 */
export function speedPositionAverage(
  overlay: LapPositionSeries[],
  lapLengthM: number,
  lastLap: number,
  phaseOffsetM = 0,
): SpeedPositionAverage {
  const firstLap = 3
  const sums = new Array<number>(SPEED_POS_BINS).fill(0)
  const counts = new Array<number>(SPEED_POS_BINS).fill(0)
  const binWidth = lapLengthM / SPEED_POS_BINS
  for (const lap of overlay) {
    if (lap.lap < firstLap || lap.lap > lastLap) continue
    for (let i = 0; i < lap.posM.length; i++) {
      const aligned = (((lap.posM[i] - phaseOffsetM) % lapLengthM) + lapLengthM) % lapLengthM
      const bin = Math.min(SPEED_POS_BINS - 1, Math.floor(aligned / binWidth))
      sums[bin] += lap.speedMs[i]
      counts[bin]++
    }
  }
  const posM: number[] = []
  const speedMs: number[] = []
  for (let i = 0; i < SPEED_POS_BINS; i++) {
    if (counts[i] === 0) continue
    posM.push((i + 0.5) * binWidth)
    speedMs.push(sums[i] / counts[i])
  }
  return { posM, speedMs }
}
