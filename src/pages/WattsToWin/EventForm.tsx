// Event create/edit form (SPEC §3.5/§5.4): name, date, venue, winners per round, and which
// of my rides belong to this event.

import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Event, Ride, Venue } from '../../store/types'

function newEventId(): string {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
const labelClass = 'block text-sm'
const labelTextClass = 'font-medium text-slate-700'

export default function EventForm({
  venues,
  rides,
  editing,
  onSave,
  onCancel,
}: {
  venues: Venue[]
  rides: Ride[]
  editing: Event | null
  onSave: (event: Event) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [date, setDate] = useState(editing?.date ?? new Date().toISOString().slice(0, 10))
  const [venueId, setVenueId] = useState(editing?.venueId ?? venues[0]?.id ?? '')
  const [winners, setWinners] = useState<Event['winners']>(editing?.winners ?? [{ round: 'final', name: '', timeS: 0 }])
  const [myRideIds, setMyRideIds] = useState<string[]>(editing?.myRideIds ?? [])

  function updateWinner(i: number, patch: Partial<Event['winners'][number]>) {
    setWinners((w) => w.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }

  function addWinner() {
    setWinners((w) => [...w, { round: 'qualifying', name: '', timeS: 0 }])
  }

  function removeWinner(i: number) {
    setWinners((w) => w.filter((_, idx) => idx !== i))
  }

  function toggleRide(id: string) {
    setMyRideIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!venueId) return
    const now = new Date().toISOString()
    onSave({
      id: editing?.id ?? newEventId(),
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
      name,
      date,
      venueId,
      winners: winners.filter((w) => w.name.trim() !== ''),
      myRideIds,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{editing ? 'Edit event' : 'New event'}</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className={labelClass}>
          <span className={labelTextClass}>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="2025 Worlds" className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
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
      </div>

      <fieldset className="space-y-2">
        <legend className={labelTextClass}>Winners</legend>
        {winners.map((w, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_1fr_auto]">
            <input
              value={w.round}
              onChange={(e) => updateWinner(i, { round: e.target.value })}
              placeholder="round (final)"
              className={inputClass}
            />
            <input
              value={w.name}
              onChange={(e) => updateWinner(i, { name: e.target.value })}
              placeholder="winner name"
              className={inputClass}
            />
            <input
              type="number"
              step="0.001"
              value={w.timeS}
              onChange={(e) => updateWinner(i, { timeS: Number(e.target.value) })}
              placeholder="time (s)"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => removeWinner(i)}
              className="rounded-lg border border-red-200 px-2 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addWinner}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          + Add winner
        </button>
      </fieldset>

      <fieldset>
        <legend className={labelTextClass}>My rides at this event</legend>
        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-100 p-2">
          {rides.length === 0 && <p className="text-xs text-slate-500">No rides yet.</p>}
          {rides.map((r) => (
            <label key={r.id} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" checked={myRideIds.includes(r.id)} onChange={() => toggleRide(r.id)} />
              {r.eventName || 'Untitled ride'} — {r.date} ({r.officialTimeS.toFixed(3)}s)
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
          Save event
        </button>
      </div>
    </form>
  )
}
