// Records (SPEC §5.9): auto-computed bests across all analyzed rides, each linking back
// to its ride. Kept pure and unit-tested like Compare's/Gains' page-level glue.

import { constructHalfLaps, halfLapTimes, type FullRideAnalysis } from '../../engine/ingest'
import { equivalentTimeAtRefDensity } from '../../engine/index'
import { resolveRideDensity } from '../../store/density'
import type { Ride, Settings, Venue } from '../../store/types'

/** Per-ride numbers a record can be drawn from. `full` is null when the ride has no .fit
 * file (CSV-imported) or fails to (re)analyze — only the fit-independent stats still
 * contribute in that case, mirroring Progression's graceful degradation for such rides. */
export interface RideRecordStats {
  ride: Ride
  venue: Venue
  normalizedTimeS: number
  fastestLapS: number | null
  fastestHalfLapS: number | null
  firstLapS: number | null
  cum1kS: number | null
  cum2kS: number | null
  cum3kS: number | null
  cdaRace: number | null
  avgLineHeightM: number | null
}

const LAP_M = 250
const N_LAPS = 16

/** Cumulative time to reach `nLaps` laps in, from the persisted per-lap breakdown. */
function cumulativeTimeAtLap(laps: { timeS: number }[], nLaps: number): number | null {
  if (laps.length < nLaps) return null
  let sum = 0
  for (let i = 0; i < nLaps; i++) sum += laps[i].timeS
  return sum
}

/** Builds one ride's record-eligible stats. `full`, if supplied, is a fresh recompute
 * (analyzeStoredRide) — only used for the fixed-250 m-track half-lap construction, which
 * isn't part of the compact persisted AnalysisResult. Falls back to the persisted
 * `ride.analysis` for everything else so a ride still contributes even if a full
 * recompute isn't available. */
export function buildRideRecordStats(
  ride: Ride,
  venue: Venue,
  settings: Settings,
  full: FullRideAnalysis | null,
): RideRecordStats {
  const { rho } = resolveRideDensity(ride, settings)
  const normalizedTimeS = equivalentTimeAtRefDensity(ride.officialTimeS, rho, settings.referenceAirDensity)

  const analysis = full?.analysisResult ?? ride.analysis ?? null
  const laps = analysis?.laps ?? []

  let fastestHalfLapS: number | null = null
  // Half-lap construction assumes the fixed 250 m/16-lap datum the rest of the ingest
  // pipeline is built around (laps.ts) — only meaningful there, like the rest of §4.7.
  if (full && venue.lapLengthM === LAP_M) {
    const boundaries = constructHalfLaps(full.base.timeline, full.base.detection, full.base.laps)
    const halves = halfLapTimes(boundaries).filter((h) => Number.isFinite(h))
    if (halves.length > 0) fastestHalfLapS = Math.min(...halves)
  }

  const lapTimes = laps.map((l) => l.timeS).filter((t) => Number.isFinite(t))

  return {
    ride,
    venue,
    normalizedTimeS,
    fastestLapS: lapTimes.length > 0 ? Math.min(...lapTimes) : null,
    fastestHalfLapS,
    firstLapS: laps.length > 0 && Number.isFinite(laps[0].timeS) ? laps[0].timeS : null,
    cum1kS: cumulativeTimeAtLap(laps, N_LAPS / 4),
    cum2kS: cumulativeTimeAtLap(laps, N_LAPS / 2),
    cum3kS: cumulativeTimeAtLap(laps, (3 * N_LAPS) / 4),
    cdaRace: analysis && Number.isFinite(analysis.cdaRace) ? analysis.cdaRace : null,
    avgLineHeightM:
      laps.length > 0
        ? laps.reduce((s, l) => s + l.lineHeightM, 0) / laps.length
        : null,
  }
}

export interface RecordEntry {
  key: string
  label: string
  valueLabel: string
  ride: Ride
  detail?: string
}

function best(
  stats: RideRecordStats[],
  pick: (s: RideRecordStats) => number | null,
  format: (v: number) => string,
  key: string,
  label: string,
  detail?: (s: RideRecordStats) => string,
): RecordEntry | null {
  let bestStat: RideRecordStats | null = null
  let bestVal = Number.POSITIVE_INFINITY
  for (const s of stats) {
    const v = pick(s)
    if (v == null || !Number.isFinite(v)) continue
    if (v < bestVal) {
      bestVal = v
      bestStat = s
    }
  }
  if (!bestStat) return null
  return {
    key,
    label,
    valueLabel: format(bestVal),
    ride: bestStat.ride,
    detail: detail?.(bestStat),
  }
}

function bestByAbs(
  stats: RideRecordStats[],
  pick: (s: RideRecordStats) => number | null,
  format: (v: number) => string,
  key: string,
  label: string,
): RecordEntry | null {
  let bestStat: RideRecordStats | null = null
  let bestVal = 0
  let bestAbs = Number.POSITIVE_INFINITY
  for (const s of stats) {
    const v = pick(s)
    if (v == null || !Number.isFinite(v)) continue
    if (Math.abs(v) < bestAbs) {
      bestAbs = Math.abs(v)
      bestVal = v
      bestStat = s
    }
  }
  if (!bestStat) return null
  return { key, label, valueLabel: format(bestVal), ride: bestStat.ride }
}

const s3 = (v: number) => `${v.toFixed(3)}s`

/** SPEC §5.9's named records, best-first not implied — order matches the spec's list. */
export function computeRecords(stats: RideRecordStats[]): RecordEntry[] {
  const eventLabel = (s: RideRecordStats) => `${s.ride.eventName || 'Untitled ride'} — ${s.ride.date}`
  return [
    best(stats, (s) => s.fastestLapS, s3, 'fastestLap', 'Fastest lap', eventLabel),
    best(stats, (s) => s.fastestHalfLapS, s3, 'fastestHalfLap', 'Fastest half-lap', eventLabel),
    best(stats, (s) => s.firstLapS, s3, 'fastestFirstLap', 'Fastest first lap', eventLabel),
    best(stats, (s) => s.cum1kS, s3, 'fastest1k', 'Fastest 1k', eventLabel),
    best(stats, (s) => s.cum2kS, s3, 'fastest2k', 'Fastest 2k', eventLabel),
    best(stats, (s) => s.cum3kS, s3, 'fastest3k', 'Fastest 3k', eventLabel),
    best(stats, (s) => s.ride.officialTimeS, s3, 'fastest4k', 'Fastest 4k (finish time)', eventLabel),
    best(stats, (s) => s.normalizedTimeS, s3, 'bestNormalizedTime', 'Best normalized time', eventLabel),
    best(stats, (s) => s.cdaRace, (v) => `${v.toFixed(4)} m²`, 'bestCda', 'Best CdA', eventLabel),
    bestByAbs(stats, (s) => s.avgLineHeightM, (v) => `${v.toFixed(3)} m`, 'bestLineQuality', 'Best line quality'),
  ].filter((r): r is RecordEntry => r != null)
}
