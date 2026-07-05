// Inline edit mode for a ride's title/subtitle fields and metadata (owner request 2026-07
// item 18): event name, date, round, result, venue, kit, notes, official splits. Saves via
// a normal put (updatedAt bumped), so it syncs like any other edit.

import { useState } from 'react'
import type { FormEvent } from 'react'
import { dataStore } from '../../../store/DataStore'
import type { Ride, Venue } from '../../../store/types'
import { parseSplitsText } from '../splits'

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
const labelClass = 'block text-sm'
const labelTextClass = 'font-medium text-slate-700'

export default function EditRidePanel({
  ride,
  venues,
  onDone,
}: {
  ride: Ride
  venues: Venue[]
  onDone: () => void
}) {
  const [eventName, setEventName] = useState(ride.eventName)
  const [date, setDate] = useState(ride.date)
  const [round, setRound] = useState<Ride['round']>(ride.round)
  const [result, setResult] = useState(ride.result ?? '')
  const [venueId, setVenueId] = useState(ride.venueId)
  const [kitText, setKitText] = useState(ride.kit.join(', '))
  const [notes, setNotes] = useState(ride.notes)
  const [splitsText, setSplitsText] = useState(ride.officialSplits.map((s) => s.toFixed(3)).join(' '))
  const [error, setError] = useState<string | null>(null)

  const parsedSplits = parseSplitsText(splitsText)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (parsedSplits.error) {
      setError(`Official splits: ${parsedSplits.error}`)
      return
    }
    const venue = venues.find((v) => v.id === venueId)
    if (!venue) {
      setError('Choose a venue.')
      return
    }
    await dataStore.rides.put({
      ...ride,
      eventName,
      date,
      round,
      result: result || undefined,
      venueId,
      kit: kitText
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      notes,
      officialSplits: parsedSplits.splits,
      flags: { ...ride.flags, outdoor: !venue.indoor },
      updatedAt: new Date().toISOString(),
    })
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Edit ride details</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={labelTextClass}>Title (event)</span>
          <input value={eventName} onChange={(e) => setEventName(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Round</span>
          <select value={round} onChange={(e) => setRound(e.target.value as Ride['round'])} className={inputClass}>
            <option value="qualifying">Qualifying</option>
            <option value="final">Final</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Result</span>
          <input value={result} onChange={(e) => setResult(e.target.value)} placeholder="1st" className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Venue</span>
          <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className={inputClass}>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Kit tags (comma-separated)</span>
          <input value={kitText} onChange={(e) => setKitText(e.target.value)} className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>
        <span className={labelTextClass}>Official lap splits</span>
        <textarea value={splitsText} onChange={(e) => setSplitsText(e.target.value)} rows={2} className={inputClass} />
        {parsedSplits.error && <span className="mt-0.5 block text-xs text-red-600">{parsedSplits.error}</span>}
      </label>
      <label className={labelClass}>
        <span className={labelTextClass}>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Save details
        </button>
      </div>
    </form>
  )
}
