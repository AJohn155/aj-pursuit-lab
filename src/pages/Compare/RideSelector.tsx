// Ride picker for Compare (SPEC §5.2): "Pick 2+ rides ... first selection = reference".
// Selection order matters (drives which ride is the gap-chart reference), so this is an
// ordered array rather than a Set — checking a box appends to the end, unchecking removes.

import type { Ride, Venue } from '../../store/types'
import { colorFor } from './compare'

export default function RideSelector({
  rides,
  venues,
  selectedIds,
  onChange,
}: {
  rides: Ride[]
  venues: Venue[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const venueName = (id: string) => venues.find((v) => v.id === id)?.name ?? '—'
  const sorted = [...rides].sort((a, b) => b.date.localeCompare(a.date))

  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id))
    else onChange([...selectedIds, id])
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Rides to compare</h2>
      <p className="mb-3 text-xs text-slate-500">
        Pick 2 or more. The first ride checked is the reference for the gap chart.
      </p>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-100">
        <table className="w-full min-w-[520px] text-left text-sm">
          <tbody>
            {sorted.map((ride) => {
              const key = `ride:${ride.id}`
              const idx = selectedIds.indexOf(key)
              const selected = idx >= 0
              return (
                <tr
                  key={ride.id}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${selected ? 'bg-slate-50' : ''}`}
                  onClick={() => toggle(key)}
                >
                  <td className="w-8 px-3 py-2">
                    <input type="checkbox" checked={selected} readOnly className="h-4 w-4" />
                  </td>
                  <td className="w-8 px-1 py-2">
                    {selected && <span className="inline-block h-3 w-3 rounded-full" style={{ background: colorFor(idx) }} />}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-900">{ride.eventName || 'Untitled ride'}</span>
                    <span className="ml-2 text-xs text-slate-500">{venueName(ride.venueId)}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{ride.date}</td>
                  <td className="px-3 py-2 text-slate-600">{ride.officialTimeS.toFixed(3)}s</td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {selected ? (idx === 0 ? 'Reference' : `#${idx + 1}`) : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
