// Ride summary (owner request 2026-07 round 5, item 1): the headline numbers — including
// the ride CdA, which previously never appeared on the detail page — in one card, plus the
// owner's OWN notes about the ride (round 12: the auto-written narrative is gone — he'd
// rather describe the ride himself; notes edit inline and save on blur). Everything
// numeric is derived from the fresh FullRideAnalysis, so it always matches the charts
// below (never the stale cache).

import { useState } from 'react'
import type { FullRideAnalysis } from '../../../engine/ingest'
import { dataStore } from '../../../store/DataStore'
import type { Ride } from '../../../store/types'
import { T } from '../../../components/EditableText'

const RACE_DISTANCE_M = 4000

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
      label: 'Peak 5 s power',
      value: Number.isFinite(r.peak5sPowerW ?? Number.NaN) ? `${(r.peak5sPowerW as number).toFixed(0)} W` : '—',
      hint: `1 s peak ${r.startMetrics.peakPower.toFixed(0)} W`,
    },
    {
      label: 'Start to 95% cruise',
      value: `${r.startMetrics.timeTo95PctCruise.toFixed(1)} s`,
    },
    {
      label: 'Extra distance',
      value:
        ride.speedSource === 'cadence' || !Number.isFinite(full.base.laps.extraDistanceM)
          ? '—'
          : `${Math.max(0, full.base.laps.extraDistanceM).toFixed(1)} m`,
      hint: 'vs the 3,250 m datum, laps 3–15',
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
      <RideNotes ride={ride} />
      <T as="p" className="mt-1 text-xs text-slate-400" id="rides.ridedetail.summary.convention-note" d="Power conventions: “avg power” averages recorded samples (SRM-style, the app-wide convention); “excl. lap 1” averages from the lap-2 line to the finish. CdA is the single energy balance over laps 3–15 — the app-wide number. On caught rides, “CdA excl. catch” removes the exclusion-range laps (editable in Edit details): the clean estimate of your own aero. Lap 16 is excluded like line height: its end boundary inherits the start-anchor timing error, and an error there lands in the post-line coast-down, which the balance misreads as drag." />
    </section>
  )
}

/**
 * The owner's own description of the ride (round 12, replacing the auto-generated
 * narrative). Backed by `Ride.notes` — the same field as Edit details — edited inline:
 * click to open a textarea, blur saves. Saving only touches the ride doc (notes never
 * affect analysis), so the cached summary is left exactly as it was.
 */
function RideNotes({ ride }: { ride: Ride }) {
  const [editing, setEditing] = useState(false)

  async function save(value: string) {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed === ride.notes) return
    await dataStore.rides.put({ ...ride, notes: trimmed, updatedAt: new Date().toISOString() })
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        defaultValue={ride.notes}
        onBlur={(e) => void save(e.target.value)}
        rows={4}
        placeholder="How did this ride go? Conditions, tactics, equipment, how it felt…"
        className="mt-3 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed text-slate-700"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to edit — these are your ride notes (also editable in Edit details)"
      className="mt-3 block w-full rounded-lg border border-transparent px-0 text-left text-sm leading-relaxed hover:border-slate-200 hover:bg-slate-50 hover:px-3 hover:py-2"
    >
      {ride.notes ? (
        <span className="whitespace-pre-wrap text-slate-600">{ride.notes}</span>
      ) : (
        <span className="italic text-slate-400">
          Add your own notes about this ride — conditions, tactics, how it felt… (click to write)
        </span>
      )}
    </button>
  )
}
