// Records (SPEC §5.9): auto-computed bests across all analyzed rides, each linking to its
// ride. Indoor-only filter default on.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { analyzeStoredRide } from '../../store/analyzeStoredRide'
import { dataStore } from '../../store/DataStore'
import { SETTINGS_ID, withSettingsDefaults } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import { BADGE_CLASSES, qualityBadgeForScore } from '../Rides/format'
import { buildRideRecordStats, computeRecords } from './records'
import type { RideRecordStats } from './records'

export default function Records() {
  const rides = useCollection(dataStore.rides)
  const venues = useCollection(dataStore.venues)
  const settingsRows = useCollection(dataStore.settings)
  const rawSettings = settingsRows.find((s) => s.id === SETTINGS_ID)

  const [indoorOnly, setIndoorOnly] = useState(true)

  const settings = rawSettings ? withSettingsDefaults(rawSettings) : undefined

  const stats: RideRecordStats[] = useMemo(() => {
    if (!settings) return []
    const eligible = rides.filter((r) => {
      const venue = venues.find((v) => v.id === r.venueId)
      if (!venue) return false
      return indoorOnly ? venue.indoor : true
    })
    const out: RideRecordStats[] = []
    for (const ride of eligible) {
      const venue = venues.find((v) => v.id === ride.venueId)
      if (!venue) continue
      // Recompute fresh where possible (needed for half-lap data, not part of the compact
      // persisted AnalysisResult) — falls back to the cached ride.analysis on failure or a
      // fit-less (CSV-imported) ride, same "still contributes what it can" pattern as
      // Progression's fit-less rides.
      let full = null
      if (ride.fitFileB64) {
        try {
          full = analyzeStoredRide(ride, venue, settings)
        } catch {
          full = null
        }
      }
      out.push(buildRideRecordStats(ride, venue, settings, full))
    }
    return out
  }, [rides, venues, settings, indoorOnly])

  const records = useMemo(() => computeRecords(stats), [stats])

  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Records</h1>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={indoorOnly} onChange={(e) => setIndoorOnly(e.target.checked)} />
          Indoor only
        </label>
      </div>

      {rides.length === 0 ? (
        <p className="text-sm text-slate-500">No rides yet — upload or import one to start tracking records.</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-slate-500">No eligible rides for any record yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Record</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Value</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Ride</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.key}>
                  <td className="px-4 py-2 font-medium text-slate-900">{r.label}</td>
                  <td className="px-4 py-2 font-mono text-slate-900">{r.valueLabel}</td>
                  <td className="px-4 py-2">
                    <Link to={`/rides/${r.ride.id}`} className="text-slate-600 hover:underline">
                      {r.detail ?? `${r.ride.eventName || 'Untitled ride'} — ${r.ride.date}`}
                    </Link>
                    {r.ride.analysis && (
                      <span
                        className={`ml-2 rounded-full px-1.5 py-0.5 text-xs font-medium ${BADGE_CLASSES[qualityBadgeForScore(r.ride.analysis.qualityScore)]}`}
                      >
                        {Math.round(r.ride.analysis.qualityScore)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
