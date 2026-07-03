import { dataStore } from '../../store/DataStore'
import type { GeometrySource, Venue } from '../../store/types'
import { useCollection } from '../../store/useCollection'

function residualFor(v: Venue): number {
  return v.lapLengthM - (2 * v.straightLengthM + 2 * Math.PI * v.bendRadiusM)
}

function newVenueId(): string {
  return `venue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function VenueRow({ venue }: { venue: Venue }) {
  async function save(patch: Partial<Venue>) {
    await dataStore.venues.put({ ...venue, ...patch, updatedAt: new Date().toISOString() })
  }

  // Editing lapLengthM or bendRadiusM recomputes straightLengthM (the dependent
  // field) so the constraint lapLengthM = 2*straight + 2*pi*bendR closes to a
  // zero residual immediately, per SPEC §3.2.
  function handleLapOrBendChange(field: 'lapLengthM' | 'bendRadiusM', value: number) {
    const next = { ...venue, [field]: value }
    const straightLengthM = (next.lapLengthM - 2 * Math.PI * next.bendRadiusM) / 2
    save({ [field]: value, straightLengthM })
  }

  const residual = residualFor(venue)

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Name</span>
          <input
            defaultValue={venue.name}
            onBlur={(e) => save({ name: e.target.value })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">City</span>
          <input
            defaultValue={venue.city}
            onBlur={(e) => save({ city: e.target.value })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Country</span>
          <input
            defaultValue={venue.country}
            onBlur={(e) => save({ country: e.target.value })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Lap length (m)</span>
          <input
            type="number"
            step="0.01"
            defaultValue={venue.lapLengthM}
            onBlur={(e) => handleLapOrBendChange('lapLengthM', Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Bend radius (m)</span>
          <input
            type="number"
            step="0.01"
            defaultValue={venue.bendRadiusM}
            onBlur={(e) => handleLapOrBendChange('bendRadiusM', Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Straight length (m)</span>
          <input
            type="number"
            step="0.01"
            defaultValue={venue.straightLengthM}
            onBlur={(e) => save({ straightLengthM: Number(e.target.value) })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
          />
          <span className="mt-0.5 block text-xs text-slate-500">
            Residual: {residual.toFixed(2)} m
          </span>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Banking (deg)</span>
          <input
            type="number"
            step="0.1"
            defaultValue={venue.bankingDeg}
            onBlur={(e) => save({ bankingDeg: Number(e.target.value) })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Altitude (m)</span>
          <input
            type="number"
            step="1"
            defaultValue={venue.altitudeM}
            onBlur={(e) => save({ altitudeM: Number(e.target.value) })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Surface factor</span>
          <input
            type="number"
            step="0.01"
            defaultValue={venue.surfaceFactor}
            onBlur={(e) => save({ surfaceFactor: Number(e.target.value) })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={venue.indoor}
            onChange={(e) => save({ indoor: e.target.checked })}
          />
          <span className="font-medium text-slate-700">Indoor</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Geometry source</span>
          <select
            defaultValue={venue.geometrySource}
            onChange={(e) => save({ geometrySource: e.target.value as GeometrySource })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
          >
            <option value="published">published</option>
            <option value="fitted">fitted</option>
            <option value="user">user</option>
          </select>
          {venue.fittedBendRadiusM !== undefined && (
            <span className="mt-0.5 block text-xs text-slate-500">
              Fitted bend radius: {venue.fittedBendRadiusM.toFixed(2)} m
            </span>
          )}
        </label>

        <label className="block text-sm sm:col-span-2 lg:col-span-3">
          <span className="font-medium text-slate-700">Notes</span>
          <input
            defaultValue={venue.notes}
            onBlur={(e) => save({ notes: e.target.value })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => dataStore.venues.delete(venue.id)}
        className="mt-3 text-xs font-medium text-red-600 hover:underline"
      >
        Delete venue
      </button>
    </div>
  )
}

export default function VenueManager() {
  const venues = useCollection(dataStore.venues)

  async function addVenue() {
    const now = new Date().toISOString()
    await dataStore.venues.put({
      id: newVenueId(),
      createdAt: now,
      updatedAt: now,
      name: 'New venue',
      city: '',
      country: '',
      lapLengthM: 250,
      bendRadiusM: 23,
      straightLengthM: (250 - 2 * Math.PI * 23) / 2,
      bankingDeg: 0,
      indoor: true,
      altitudeM: 0,
      surfaceFactor: 1.0,
      geometrySource: 'user',
      notes: '',
    })
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Venues</h2>
        <button
          type="button"
          onClick={addVenue}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Add venue
        </button>
      </div>
      <div className="space-y-3">
        {venues
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((v) => (
            <VenueRow key={v.id} venue={v} />
          ))}
      </div>
    </section>
  )
}
