// Ride summary (owner request 2026-07 round 5, item 1): the headline numbers — including
// the ride CdA, which previously never appeared on the detail page — in one card, plus a
// short auto-written narrative of how the ride unfolded. Everything is derived from the
// fresh FullRideAnalysis, so it always matches the charts below (never the stale cache).

import type { FullRideAnalysis } from '../../../engine/ingest'
import type { Ride } from '../../../store/types'
import { T } from '../../../components/EditableText'

const RACE_DISTANCE_M = 4000
const STEADY_FIRST_LAP = 3

/** "laps 3–15", or "laps 3–15 excl. 7–9" when the window has caught-rider holes. */
function describeWindow(windowLaps: number[]): string {
  if (windowLaps.length === 0) return 'steady laps'
  const lo = windowLaps[0]
  const hi = windowLaps[windowLaps.length - 1]
  const missing: number[] = []
  for (let n = lo; n <= hi; n++) if (!windowLaps.includes(n)) missing.push(n)
  const base = `laps ${lo}–${hi}`
  if (missing.length === 0) return base
  const runLabel =
    missing.length === 1 ? `${missing[0]}` : `${missing[0]}–${missing[missing.length - 1]}`
  return `${base} excl. ${runLabel}`
}

export default function RideSummary({ ride, full }: { ride: Ride; full: FullRideAnalysis }) {
  const r = full.analysisResult
  const avgSpeedKmh = (RACE_DISTANCE_M / ride.officialTimeS) * 3.6
  const windowText = describeWindow(full.base.cdaWindowLaps)

  const stats: { label: string; value: string; hint?: string }[] = [
    { label: 'Official time', value: `${ride.officialTimeS.toFixed(3)} s` },
    { label: 'Avg speed', value: `${avgSpeedKmh.toFixed(2)} km/h` },
    {
      label: `CdA (${windowText})`,
      value: `${r.cdaRace.toFixed(4)} m²`,
      hint: `± ${r.ci.toFixed(4)} (95% CI)${r.cdaExclCatch != null ? ' · full window incl. catch laps' : ''}`,
    },
    ...(r.cdaExclCatch != null
      ? [
          {
            label: `CdA excl. catch (${describeWindow(r.cdaExclCatchLaps ?? [])})`,
            value: `${r.cdaExclCatch.toFixed(4)} m²`,
            hint: `± ${(r.cdaExclCatchCi ?? 0).toFixed(4)} — your own aero, draft/pass laps removed`,
          },
        ]
      : []),
    {
      label: 'Avg power',
      value: Number.isFinite(r.avgPowerRecordedW ?? Number.NaN) ? `${(r.avgPowerRecordedW as number).toFixed(0)} W` : '—',
      hint: 'recorded samples (SRM-style)',
    },
    {
      label: 'Power excl. lap 1',
      value: Number.isFinite(r.avgPowerExclLap1W ?? Number.NaN) ? `${(r.avgPowerExclLap1W as number).toFixed(0)} W` : '—',
    },
    {
      label: 'Start to 95% cruise',
      value: `${r.startMetrics.timeTo95PctCruise.toFixed(1)} s`,
      hint: `peak ${r.startMetrics.peakPower.toFixed(0)} W`,
    },
    {
      label: 'Avg line height',
      value: Number.isFinite(full.base.laps.avgLineHeightM) ? `${full.base.laps.avgLineHeightM.toFixed(2)} m` : '—',
      hint: 'laps 3–15',
    },
    { label: 'Data quality', value: `${Math.round(full.quality.score)}/100` },
  ]

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="mb-2 text-sm font-semibold text-slate-900" id="rides.ridedetail.summary.ride-summary" d="Ride summary" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-sm font-semibold text-slate-900">{s.value}</p>
            {s.hint && <p className="text-[11px] text-slate-400">{s.hint}</p>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{narrative(ride, full)}</p>
      <T as="p" className="mt-1 text-xs text-slate-400" id="rides.ridedetail.summary.convention-note" d="Power conventions: “avg power” averages recorded samples (SRM-style, the app-wide convention); “excl. lap 1” averages from the lap-2 line to the finish. CdA is the single energy balance over laps 3–15 — the app-wide number. On caught rides, “CdA excl. catch” removes the exclusion-range laps (editable in Edit details): the clean estimate of your own aero. Lap 16 is excluded like line height: its end boundary inherits the start-anchor timing error, and an error there lands in the post-line coast-down, which the balance misreads as drag." />
    </section>
  )
}

/**
 * Deterministic prose from the analysis numbers — a narrative, not a metric dump: the
 * start, where the ride settled, how it faded (or didn't), and where the speed went.
 */
function narrative(ride: Ride, full: FullRideAnalysis): string {
  const r = full.analysisResult
  const laps = r.laps
  const parts: string[] = []

  if (laps.length > 0 && Number.isFinite(laps[0].timeS)) {
    parts.push(
      `Off the start, lap 1 took ${laps[0].timeS.toFixed(1)} s (peak ${r.startMetrics.peakPower.toFixed(0)} W, at 95% of cruise speed in ${r.startMetrics.timeTo95PctCruise.toFixed(1)} s).`,
    )
  }

  const steady = laps.slice(STEADY_FIRST_LAP - 1).filter((l) => Number.isFinite(l.timeS))
  if (steady.length >= 4) {
    const times = steady.map((l) => l.timeS)
    const best = Math.min(...times)
    const worst = Math.max(...times)
    const bestLap = laps.findIndex((l) => l.timeS === best) + 1
    const worstLap = laps.findIndex((l) => l.timeS === worst) + 1
    const firstHalf = times.slice(0, Math.floor(times.length / 2))
    const secondHalf = times.slice(Math.floor(times.length / 2))
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
    const fadePerLap = mean(secondHalf) - mean(firstHalf)
    const settleW = r.avgPowerExclLap1W
    parts.push(
      `From lap ${STEADY_FIRST_LAP} the ride settled${Number.isFinite(settleW ?? Number.NaN) ? ` around ${(settleW as number).toFixed(0)} W` : ''}, with steady laps between ${best.toFixed(1)} s (lap ${bestLap}) and ${worst.toFixed(1)} s (lap ${worstLap}).`,
    )
    if (Math.abs(fadePerLap) < 0.1) {
      parts.push('Pacing was even — the second half held the first half’s lap times.')
    } else if (fadePerLap > 0) {
      parts.push(
        `The back half faded by ${fadePerLap.toFixed(2)} s per lap versus the front half (${(fadePerLap * secondHalf.length).toFixed(1)} s total).`,
      )
    } else {
      parts.push(`A negative split — the back half was ${Math.abs(fadePerLap).toFixed(2)} s per lap faster.`)
    }
  }

  const wEnd = laps.at(-1)?.wPrimeEnd
  if (wEnd != null && Number.isFinite(wEnd)) {
    if (wEnd <= 2000) parts.push('W′ was effectively emptied at the line.')
    else parts.push(`~${(wEnd / 1000).toFixed(1)} kJ of W′ was left at the line.`)
  }

  const catchNote =
    r.cdaExclCatch != null && ride.caughtAtLap != null
      ? `; excluding the laps around the lap-${ride.caughtAtLap} catch (draft + passing line aren't your own aero), it reads ${r.cdaExclCatch.toFixed(4)}`
      : ''
  parts.push(
    `Total CdA ${r.cdaRace.toFixed(4)} ± ${r.ci.toFixed(4)} m²${catchNote}${ride.speedSource === 'cadence' ? ' (speed reconstructed from cadence × gear — treat aero numbers with care)' : ''}.`,
  )

  return parts.join(' ')
}
