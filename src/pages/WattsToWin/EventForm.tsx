// Event create/edit form (SPEC §3.5/§5.4): name, date, venue, winners per round, and which
// of my rides belong to this event.

import { useState } from 'react'
import type { FormEvent } from 'react'
import { BADGE_CLASSES, qualityBadgeForScore } from '../Rides/format'
import { parseSplitsText } from '../Rides/splits'
import type { Event, Ride, Venue } from '../../store/types'
import { T } from '../../components/EditableText'

/**
 * Optional per-winner lap splits (owner request 2026-07 round 10): 16 entries unlock the
 * gap-vs-distance chart against this winner. Accepts the same per-lap/cumulative paste
 * formats as ride splits.
 */
function WinnerSplitsInput({
  winner,
  onChange,
}: {
  winner: Event['winners'][number]
  onChange: (splits: number[] | undefined) => void
}) {
  const [text, setText] = useState(winner.splits?.map((s) => s.toFixed(3)).join(' ') ?? '')
  const parsed = parseSplitsText(text)
  return (
    <label className="block">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const p = parseSplitsText(e.target.value)
          onChange(!p.error && p.splits.length > 0 ? p.splits : undefined)
        }}
        rows={1}
        placeholder="winner's lap splits (optional) — 16 laps unlock the gap-by-distance chart"
        className="block w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
      />
      {text.trim() !== '' && !parsed.error && (
        <span className="mt-0.5 block text-xs text-slate-500">
          Parsed {parsed.splits.length} lap(s), total {parsed.splits.reduce((s, x) => s + x, 0).toFixed(3)} s
          {parsed.splits.length !== 16 && ' — 16 needed for the gap chart'}
        </span>
      )}
      {parsed.error && <span className="mt-0.5 block text-xs text-red-600">{parsed.error}</span>}
    </label>
  )
}

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
      // Strip undefined `splits` keys — Firestore rejects undefined field values.
      winners: winners
        .filter((w) => w.name.trim() !== '')
        .map((w) =>
          w.splits && w.splits.length > 0
            ? { round: w.round, name: w.name, timeS: w.timeS, splits: w.splits }
            : { round: w.round, name: w.name, timeS: w.timeS },
        ),
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
          <div key={i} className="space-y-1 rounded-lg border border-slate-100 p-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_1fr_auto]">
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
            <WinnerSplitsInput winner={w} onChange={(splits) => updateWinner(i, { splits })} />
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
          {rides.length === 0 && <T as="p" className="text-xs text-slate-500" id="wattstowin.eventform.no-rides-yet" d="No rides yet." />}
          {rides.map((r) => (
            <label key={r.id} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" checked={myRideIds.includes(r.id)} onChange={() => toggleRide(r.id)} />
              {r.eventName || 'Untitled ride'} — {r.date} ({r.officialTimeS.toFixed(3)}s)
              {r.analysis && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${BADGE_CLASSES[qualityBadgeForScore(r.analysis.qualityScore)]}`}
                >
                  {Math.round(r.analysis.qualityScore)}
                </span>
              )}
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
