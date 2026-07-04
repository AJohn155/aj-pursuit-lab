// Rides list (SPEC §5.1): table of all rides — date, event, venue, time, normalized time,
// avg W, CdA, quality badge, kit tags — sortable, linking to ride detail.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { equivalentTimeAtRefDensity } from '../../engine/index'
import { dataStore } from '../../store/DataStore'
import { resolveRideDensity } from '../../store/density'
import { SETTINGS_ID, type Ride } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import { BADGE_CLASSES, qualityBadgeForScore, weightedAvgPower } from './format'

type SortKey = 'date' | 'timeS' | 'normalizedTimeS' | 'avgW' | 'cda' | 'quality'

function buildRow(ride: Ride, venueName: string, referenceAirDensity: number, settings: Parameters<typeof resolveRideDensity>[1]) {
  const { rho } = resolveRideDensity(ride, settings)
  const normalizedTimeS = equivalentTimeAtRefDensity(ride.officialTimeS, rho, referenceAirDensity)
  const avgW = ride.analysis ? weightedAvgPower(ride.analysis.laps) : (ride.manualAvgPowerW ?? null)
  const cda = ride.analysis?.cdaRace ?? null
  const quality = ride.analysis?.qualityScore ?? null
  return { ride, venueName, normalizedTimeS, avgW, cda, quality }
}

export default function RidesList() {
  const rides = useCollection(dataStore.rides)
  const venues = useCollection(dataStore.venues)
  const settingsRows = useCollection(dataStore.settings)
  const settings = settingsRows.find((s) => s.id === SETTINGS_ID)

  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortAsc, setSortAsc] = useState(false)
  const [filter, setFilter] = useState('')

  const rows = useMemo(() => {
    if (!settings) return []
    const venueName = (id: string) => venues.find((v) => v.id === id)?.name ?? '—'
    const built = rides.map((r) => buildRow(r, venueName(r.venueId), settings.referenceAirDensity, settings))
    const term = filter.trim().toLowerCase()
    const filtered = term
      ? built.filter(
          (r) =>
            r.ride.eventName.toLowerCase().includes(term) ||
            r.venueName.toLowerCase().includes(term) ||
            r.ride.kit.some((k) => k.toLowerCase().includes(term)),
        )
      : built
    const dir = sortAsc ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'date':
          return dir * a.ride.date.localeCompare(b.ride.date)
        case 'timeS':
          return dir * (a.ride.officialTimeS - b.ride.officialTimeS)
        case 'normalizedTimeS':
          return dir * (a.normalizedTimeS - b.normalizedTimeS)
        case 'avgW':
          return dir * ((a.avgW ?? -Infinity) - (b.avgW ?? -Infinity))
        case 'cda':
          return dir * ((a.cda ?? -Infinity) - (b.cda ?? -Infinity))
        case 'quality':
          return dir * ((a.quality ?? -Infinity) - (b.quality ?? -Infinity))
        default:
          return 0
      }
    })
  }, [rides, venues, settings, filter, sortKey, sortAsc])

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((a) => !a)
    else {
      setSortKey(key)
      setSortAsc(key === 'date' ? false : true)
    }
  }

  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>
  if (rides.length === 0) {
    return <p className="text-sm text-slate-500">No rides yet — upload a .fit file below to add the first one.</p>
  }

  const headers: { key: SortKey; label: string }[] = [
    { key: 'date', label: 'Date' },
    { key: 'timeS', label: 'Time' },
    { key: 'normalizedTimeS', label: 'Norm. time' },
    { key: 'avgW', label: 'Avg W' },
    { key: 'cda', label: 'CdA' },
    { key: 'quality', label: 'Quality' },
  ]

  return (
    <div className="space-y-3">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by event, venue, or kit…"
        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm sm:w-72"
      />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Event / Venue</th>
              {headers.map((h) => (
                <th key={h.key} className="cursor-pointer px-3 py-2 font-medium" onClick={() => toggleSort(h.key)}>
                  {h.label}
                  {sortKey === h.key ? (sortAsc ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Kit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ride, venueName, normalizedTimeS, avgW, cda, quality }) => (
              <tr key={ride.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link to={`/rides/${ride.id}`} className="font-medium text-slate-900 hover:underline">
                    {ride.eventName || 'Untitled ride'}
                  </Link>
                  <p className="text-xs text-slate-500">{venueName}</p>
                </td>
                <td className="px-3 py-2 text-slate-600">{ride.date}</td>
                <td className="px-3 py-2 text-slate-600">{ride.officialTimeS.toFixed(3)}s</td>
                <td className="px-3 py-2 text-slate-600">{normalizedTimeS.toFixed(3)}s</td>
                <td className="px-3 py-2 text-slate-600">{avgW != null ? `${avgW.toFixed(0)} W` : '—'}</td>
                <td className="px-3 py-2 text-slate-600">{cda != null ? cda.toFixed(4) : '—'}</td>
                <td className="px-3 py-2">
                  {quality != null ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[qualityBadgeForScore(quality)]}`}
                    >
                      {quality.toFixed(0)}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{ride.kit.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
