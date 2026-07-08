// Cadence calculator (SPEC §5.8): editable gear inventory, rollout from settings, grid
// lap-time (13.0–17.0 s step 0.1) × gear → cadence; venue-aware lap length; highlights the
// matching gear column when opened from a ride (?chainring=&cog=).

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cadenceGrid } from '../../engine/calculators'
import type { Gear } from '../../engine/calculators'
import { dataStore } from '../../store/DataStore'
import type { Settings, Venue } from '../../store/types'
import { T } from '../../components/EditableText'

export default function CadenceCalculator({ settings, venues }: { settings: Settings; venues: Venue[] }) {
  const [venueId, setVenueId] = useState(venues[0]?.id ?? '')
  const [searchParams] = useSearchParams()
  const highlightChainring = Number(searchParams.get('chainring'))
  const highlightCog = Number(searchParams.get('cog'))

  const venue = venues.find((v) => v.id === venueId) ?? venues[0]
  const gears = settings.gearInventory

  async function updateGears(next: Gear[]) {
    await dataStore.settings.put({ ...settings, gearInventory: next, updatedAt: new Date().toISOString() })
  }

  function handleGearChange(i: number, key: keyof Gear, value: number) {
    void updateGears(gears.map((g, idx) => (idx === i ? { ...g, [key]: value } : g)))
  }

  function handleAddGear() {
    void updateGears([...gears, { chainring: 60, cog: 15 }])
  }

  function handleRemoveGear(i: number) {
    void updateGears(gears.filter((_, idx) => idx !== i))
  }

  if (!venue) return <p className="text-sm text-slate-500">Add a venue in Settings first.</p>

  const grid = cadenceGrid(gears, venue.lapLengthM, settings.rolloutM)

  return (
    <div className="space-y-4">
      <label className="block text-sm sm:w-64">
        <span className="font-medium text-slate-700">Venue (lap length)</span>
        <select
          value={venue.id}
          onChange={(e) => setVenueId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.lapLengthM} m)
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <T as="h3" className="text-sm font-semibold text-slate-900" id="calculators.cadencecalculator.gear-inventory" d="Gear inventory" />
        <div className="flex flex-wrap gap-2">
          {gears.map((g, i) => (
            <div key={i} className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-sm">
              <input
                type="number"
                value={g.chainring}
                onChange={(e) => handleGearChange(i, 'chainring', Number(e.target.value))}
                className="w-12 rounded border border-slate-200 px-1 text-right"
              />
              <span className="text-slate-400">×</span>
              <input
                type="number"
                value={g.cog}
                onChange={(e) => handleGearChange(i, 'cog', Number(e.target.value))}
                className="w-12 rounded border border-slate-200 px-1 text-right"
              />
              <button type="button" onClick={() => handleRemoveGear(i)} className="ml-1 text-slate-400 hover:text-red-600">
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleAddGear}
            className="rounded-lg border border-dashed border-slate-300 px-3 py-1 text-sm text-slate-500 hover:bg-slate-50"
          >
            + Add gear
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-xs">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <th className="px-2 py-1 text-right font-medium text-slate-600">Lap time (s)</th>
              {gears.map((g, i) => (
                <th
                  key={i}
                  className={`px-2 py-1 text-right font-medium ${
                    g.chainring === highlightChainring && g.cog === highlightCog ? 'bg-amber-100 text-amber-900' : 'text-slate-600'
                  }`}
                >
                  {g.chainring}×{g.cog}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {grid.lapTimesS.map((lt, r) => (
              <tr key={r}>
                <td className="px-2 py-1 text-right font-mono text-slate-700">{lt.toFixed(1)}</td>
                {grid.cells[r].map((rpm, c) => (
                  <td
                    key={c}
                    className={`px-2 py-1 text-right font-mono ${
                      gears[c].chainring === highlightChainring && gears[c].cog === highlightCog
                        ? 'bg-amber-50 text-amber-900'
                        : 'text-slate-800'
                    }`}
                  >
                    {rpm.toFixed(1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
