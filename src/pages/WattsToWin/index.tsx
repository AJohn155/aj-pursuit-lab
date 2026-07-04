// Watts to Win (SPEC §5.4): event records CRUD + per-event watts/ΔCdA-to-match table.

import { useState } from 'react'
import { dataStore } from '../../store/DataStore'
import { SETTINGS_ID, withSettingsDefaults, type Event } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import EventForm from './EventForm'
import EventRecordsTable from './EventRecordsTable'

export default function WattsToWin() {
  const events = useCollection(dataStore.events)
  const rides = useCollection(dataStore.rides)
  const venues = useCollection(dataStore.venues)
  const settingsRows = useCollection(dataStore.settings)
  const rawSettings = settingsRows.find((s) => s.id === SETTINGS_ID)

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Event | null | 'new'>(null)

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null

  async function handleSave(event: Event) {
    await dataStore.events.put(event)
    setEditing(null)
    setSelectedEventId(event.id)
  }

  async function handleDelete(id: string) {
    await dataStore.events.delete(id)
    if (selectedEventId === id) setSelectedEventId(null)
  }

  if (!rawSettings) return <p className="text-sm text-slate-500">Loading…</p>
  const settings = withSettingsDefaults(rawSettings)

  if (editing) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Watts to Win</h1>
        <EventForm
          venues={venues}
          rides={rides}
          editing={editing === 'new' ? null : editing}
          onSave={(e) => void handleSave(e)}
          onCancel={() => setEditing(null)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Watts to Win</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          + New event
        </button>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-slate-500">No events yet — add one to start tracking watts-to-win.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {[...events]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelectedEventId(e.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  selectedEventId === e.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {e.name || 'Untitled event'} ({e.date})
              </button>
            ))}
        </div>
      )}

      {selectedEvent && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">{selectedEvent.name}</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(selectedEvent)}
                className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(selectedEvent.id)}
                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </div>
          <EventRecordsTable event={selectedEvent} rides={rides} venues={venues} settings={settings} />
        </div>
      )}
    </div>
  )
}
