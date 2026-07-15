// Inline edit mode for a ride's title/subtitle fields and metadata (owner request 2026-07
// item 18): event name, date + start time, round, result, venue, kit, notes, official
// splits — plus the ride's own physics parameters (round 4 item 7: mass, air density, tyre
// Crr, mech efficiency, rollout). Saving re-runs the analysis with the edited values when a
// .fit file is attached, so the cached summary (rides list, totals) stays consistent with
// what the detail page derives.

import { useState } from 'react'
import type { FormEvent } from 'react'
import KitPicker from '../../../components/KitPicker'
import { ENGINE_VERSION } from '../../../engine/constants'
import { defaultCatchExclusionRange } from '../../../engine/ingest'
import { dataStore } from '../../../store/DataStore'
import { analyzeStoredRide } from '../../../store/analyzeStoredRide'
import { resolveRideDensity } from '../../../store/density'
import { SETTINGS_ID, withSettingsDefaults, type Ride, type Settings, type Venue } from '../../../store/types'
import { useCollection } from '../../../store/useCollection'
import { parseSplitsText } from '../splits'
import { T } from '../../../components/EditableText'

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
const labelClass = 'block text-sm'
const labelTextClass = 'font-medium text-slate-700'

interface EditRidePanelProps {
  ride: Ride
  venues: Venue[]
  onDone: () => void
}

/**
 * Gates on settings being loaded before mounting the real form — the physics-parameter
 * fields read the global defaults in their useState initializers, which run once on mount;
 * useCollection starts empty, so mounting immediately would freeze Crr/η/rollout as blank
 * (the exact mount-timing bug MetadataForm documents).
 */
export default function EditRidePanel(props: EditRidePanelProps) {
  const settingsRows = useCollection(dataStore.settings)
  const rawSettings = settingsRows.find((s) => s.id === SETTINGS_ID)
  if (!rawSettings) return <p className="text-sm text-slate-500">Loading settings…</p>
  return <EditRidePanelInner {...props} settings={withSettingsDefaults(rawSettings)} />
}

function EditRidePanelInner({
  ride,
  venues,
  onDone,
  settings,
}: EditRidePanelProps & { settings: Settings }) {
  const [eventName, setEventName] = useState(ride.eventName)
  const [date, setDate] = useState(ride.date)
  const [startTime, setStartTime] = useState(ride.startTime ?? '')
  const [round, setRound] = useState<Ride['round']>(ride.round)
  const [result, setResult] = useState(ride.result ?? '')
  const [venueId, setVenueId] = useState(ride.venueId)
  const [kit, setKit] = useState<string[]>(ride.kit)
  const [notes, setNotes] = useState(ride.notes)
  const [splitsText, setSplitsText] = useState(ride.officialSplits.map((s) => s.toFixed(3)).join(' '))
  const [massInput, setMassInput] = useState(String(ride.systemMassKg))
  // Effective density shown (measured, T/P/RH-derived, or the reference fallback); editing
  // it stores a direct per-ride airDensity, which takes priority over T/P/RH.
  const [rhoInput, setRhoInput] = useState(() =>
    resolveRideDensity(ride, settings, venues.find((v) => v.id === ride.venueId)).rho.toFixed(4),
  )
  const [crrInput, setCrrInput] = useState(String(ride.tyreCrr ?? settings.tyreCrr))
  const [etaInput, setEtaInput] = useState(String(ride.mechEfficiency ?? settings.mechEfficiency))
  const [rolloutInput, setRolloutInput] = useState(String(ride.rolloutM ?? settings.rolloutM))
  // Ride flags (round 6: these were not editable after upload — the owner couldn't fix a
  // missed "caught rider" tick). Outdoor stays venue-derived, so only these two are shown.
  const [caughtRider, setCaughtRider] = useState(ride.flags.caughtRider)
  const [caughtAtLap, setCaughtAtLap] = useState(ride.caughtAtLap != null ? String(ride.caughtAtLap) : '')
  // Exclusion range (round 8): the ride's own saved range, else the default for its catch.
  const [caughtFrom, setCaughtFrom] = useState(() => {
    if (ride.caughtExcludeFromLap != null) return String(ride.caughtExcludeFromLap)
    const def = ride.caughtAtLap != null ? defaultCatchExclusionRange(ride.caughtAtLap) : null
    return def ? String(def.fromLap) : ''
  })
  const [caughtTo, setCaughtTo] = useState(() => {
    if (ride.caughtExcludeToLap != null) return String(ride.caughtExcludeToLap)
    const def = ride.caughtAtLap != null ? defaultCatchExclusionRange(ride.caughtAtLap) : null
    return def ? String(def.toLap) : ''
  })
  const [interrupted, setInterrupted] = useState(ride.flags.interrupted)

  function handleCaughtAtLapChange(value: string) {
    setCaughtAtLap(value)
    const def = defaultCatchExclusionRange(Number.parseFloat(value))
    setCaughtFrom(def ? String(def.fromLap) : '')
    setCaughtTo(def ? String(def.toLap) : '')
  }
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
    const mass = Number.parseFloat(massInput)
    const rho = Number.parseFloat(rhoInput)
    const crr = Number.parseFloat(crrInput)
    const eta = Number.parseFloat(etaInput)
    const rollout = Number.parseFloat(rolloutInput)
    if (!(mass > 0) || !(rho > 0) || !(crr > 0) || !(eta > 0 && eta <= 1) || !(rollout > 0)) {
      setError('Mass, air density, Crr, efficiency (0–1], and rollout must all be positive numbers.')
      return
    }
    const caughtAtLapVal = caughtAtLap.trim() === '' ? undefined : Number.parseFloat(caughtAtLap)
    if (caughtRider && caughtAtLapVal != null && !(caughtAtLapVal > 0 && caughtAtLapVal <= 16)) {
      setError('“Caught at lap” must be between 0 and 16 (e.g. 7.5), or left blank.')
      return
    }
    const caughtFromVal = caughtFrom.trim() === '' ? undefined : Number.parseInt(caughtFrom, 10)
    const caughtToVal = caughtTo.trim() === '' ? undefined : Number.parseInt(caughtTo, 10)
    if (
      caughtRider &&
      caughtAtLapVal != null &&
      caughtFromVal != null &&
      caughtToVal != null &&
      !(caughtFromVal >= 1 && caughtToVal <= 16 && caughtFromVal <= caughtToVal)
    ) {
      setError('Catch exclusion range must satisfy 1 ≤ from ≤ to ≤ 16.')
      return
    }

    const updated: Ride = {
      ...ride,
      eventName,
      date,
      startTime: startTime || undefined,
      round,
      result: result || undefined,
      venueId,
      kit,
      notes,
      officialSplits: parsedSplits.splits,
      systemMassKg: mass,
      airDensity: rho,
      tyreCrr: crr,
      mechEfficiency: eta,
      rolloutM: rollout,
      flags: { outdoor: !venue.indoor, caughtRider, interrupted },
      caughtAtLap: caughtRider ? caughtAtLapVal : undefined,
      caughtExcludeFromLap: caughtRider ? caughtFromVal : undefined,
      caughtExcludeToLap: caughtRider ? caughtToVal : undefined,
      updatedAt: new Date().toISOString(),
    }

    setSaving(true)
    try {
      // Physics inputs may have changed — refresh the cached summary in the same save so
      // the rides list / totals never show numbers derived from the old parameters.
      if (updated.fitFileB64) {
        const full = analyzeStoredRide(updated, venue, settings)
        updated.analysis = full.analysisResult
        updated.analysisVersion = ENGINE_VERSION
      }
      await dataStore.rides.put(updated)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <T as="h2" className="text-sm font-semibold text-slate-900" id="rides.ridedetail.editridepanel.edit-ride-details" d="Edit ride details" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={labelTextClass}>Title (event)</span>
          <input value={eventName} onChange={(e) => setEventName(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Date &amp; start time</span>
          <div className="mt-1 flex gap-1">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="block w-32 rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <span className="mt-0.5 block text-xs text-slate-500">Time orders same-day rides.</span>
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
      </div>

      <fieldset className="space-y-2">
        <legend className={labelTextClass}>Ride physics parameters</legend>
        <T as="p" className="text-xs text-slate-500" id="rides.ridedetail.editridepanel.this-ride-s-own-values" d="This ride's own values — saving re-runs the analysis with them. Global Settings only provide defaults for new rides." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <label className={labelClass}>
            <span className="text-xs text-slate-500">System mass (kg)</span>
            <input type="number" step="0.1" value={massInput} onChange={(e) => setMassInput(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">Air density (kg/m³)</span>
            <input type="number" step="0.001" value={rhoInput} onChange={(e) => setRhoInput(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">Tyre Crr</span>
            <input type="number" step="0.0001" value={crrInput} onChange={(e) => setCrrInput(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">Mech. efficiency</span>
            <input type="number" step="0.001" value={etaInput} onChange={(e) => setEtaInput(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">Rollout (m)</span>
            <input type="number" step="0.001" value={rolloutInput} onChange={(e) => setRolloutInput(e.target.value)} className={inputClass} />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className={labelTextClass}>Kit</legend>
        <KitPicker value={kit} onChange={setKit} />
      </fieldset>

      <label className={labelClass}>
        <span className={labelTextClass}>Official lap splits</span>
        <textarea value={splitsText} onChange={(e) => setSplitsText(e.target.value)} rows={2} className={inputClass} />
        {parsedSplits.error && <span className="mt-0.5 block text-xs text-red-600">{parsedSplits.error}</span>}
      </label>
      <fieldset className="flex flex-wrap items-center gap-6 text-sm text-slate-600">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={caughtRider} onChange={(e) => setCaughtRider(e.target.checked)} />
          Caught rider
        </label>
        {caughtRider && (
          <span className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              at lap
              <input
                type="number"
                step="0.25"
                min="1"
                max="16"
                value={caughtAtLap}
                onChange={(e) => handleCaughtAtLapChange(e.target.value)}
                placeholder="7.5"
                className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-2">
              exclude laps
              <input
                type="number"
                step="1"
                min="1"
                max="16"
                value={caughtFrom}
                onChange={(e) => setCaughtFrom(e.target.value)}
                className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              –
              <input
                type="number"
                step="1"
                min="1"
                max="16"
                value={caughtTo}
                onChange={(e) => setCaughtTo(e.target.value)}
                className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <span className="text-xs text-slate-500">
              default 2 before → 1 after; drives “CdA excl. catch” (full CdA stays reported) — saving
              re-analyzes
            </span>
          </span>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={interrupted} onChange={(e) => setInterrupted(e.target.checked)} />
          Interrupted
        </label>
      </fieldset>
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
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {saving ? 'Saving & re-analyzing…' : 'Save details'}
        </button>
      </div>
    </form>
  )
}
