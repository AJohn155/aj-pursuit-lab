// Ride metadata form (SPEC §5.1 upload flow, step 3): venue, gear, density or T/P/RH, kit
// tags, notes, flags. Submitting runs the full P3/P4 analysis pipeline and saves the ride.

import { useState } from 'react'
import type { FormEvent } from 'react'
import { airDensity as computeAirDensity, effectiveCrr, makeTrack } from '../../engine/index'
import type { RiderParams } from '../../engine/index'
import { ENGINE_VERSION } from '../../engine/constants'
import { analyzeRideFull } from '../../engine/ingest'
import { dataStore } from '../../store/DataStore'
import { bytesToBase64, FIT_FILE_B64_MAX_BYTES } from '../../store/encoding'
import { SETTINGS_ID, withSettingsDefaults, type Ride, type Settings, type Venue } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import type { DetectionConfirmResult } from './DetectionConfirm'

function newRideId(): string {
  return `ride-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
const labelClass = 'block text-sm'
const labelTextClass = 'font-medium text-slate-700'

interface MetadataFormProps {
  detection: DetectionConfirmResult
  onSaved: (rideId: string) => void
  onCancel: () => void
}

/**
 * Waits for settings to load before mounting the real form. The mass-default field reads
 * `settings.systemMassKg` only in its useState initializer, which runs once on mount — if
 * the form mounted before settings arrived (useCollection starts empty and fills in
 * asynchronously), that initializer would forever see `undefined` and the field would
 * stay blank. Gating the mount on `settings` being loaded (the same fix GlobalParams uses)
 * guarantees the initializer sees the real default.
 */
export default function MetadataForm(props: MetadataFormProps) {
  const settingsRows = useCollection(dataStore.settings)
  const settings = settingsRows.find((s) => s.id === SETTINGS_ID)

  if (!settings) {
    return <p className="text-sm text-slate-500">Loading settings…</p>
  }
  // Backfill fields added after this doc was created (e.g. cpW/wPrimeJ on a P1-era doc)
  // so the analysis never sees undefined physics inputs (see store/types.ts).
  return <MetadataFormInner {...props} settings={withSettingsDefaults(settings)} />
}

function MetadataFormInner({
  detection,
  onSaved,
  onCancel,
  settings,
}: MetadataFormProps & { settings: Settings }) {
  const venues = useCollection(dataStore.venues)

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [eventName, setEventName] = useState('')
  const [round, setRound] = useState<Ride['round']>('qualifying')
  const [venueId, setVenueId] = useState('')
  const [chainring, setChainring] = useState(65)
  const [cog, setCog] = useState(15)
  const [densityMode, setDensityMode] = useState<'direct' | 'tprh' | 'unknown'>('direct')
  const [airDensity, setAirDensity] = useState('')
  const [tempC, setTempC] = useState('')
  const [pressureHPa, setPressureHPa] = useState('')
  const [humidityPct, setHumidityPct] = useState('')
  const [systemMassKg, setSystemMassKg] = useState<number | ''>(settings.systemMassKg)
  const [kitText, setKitText] = useState('')
  const [notes, setNotes] = useState('')
  const [caughtRider, setCaughtRider] = useState(false)
  const [interrupted, setInterrupted] = useState(false)
  const [result, setResult] = useState('')
  const [officialTimeS, setOfficialTimeS] = useState(String(detection.officialTimeS))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const venue: Venue | undefined = venues.find((v) => v.id === venueId)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!venue) {
      setError('Choose a venue.')
      return
    }
    const official = Number.parseFloat(officialTimeS)
    if (!Number.isFinite(official) || official <= 0) {
      setError('Official time must be a positive number.')
      return
    }

    let rho: number
    let densityKnown: boolean
    let tempCVal: number | undefined
    let pressureHPaVal: number | undefined
    let humidityPctVal: number | undefined
    let airDensityVal: number | undefined

    if (densityMode === 'direct') {
      const parsed = Number.parseFloat(airDensity)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Enter a positive air density, or switch to T/P/RH or Unknown.')
        return
      }
      rho = parsed
      densityKnown = true
      airDensityVal = parsed
    } else if (densityMode === 'tprh') {
      const t = Number.parseFloat(tempC)
      const p = Number.parseFloat(pressureHPa)
      const h = Number.parseFloat(humidityPct)
      if (![t, p, h].every(Number.isFinite)) {
        setError('Enter temperature, pressure, and humidity, or switch to Direct or Unknown.')
        return
      }
      rho = computeAirDensity(t, p, h)
      densityKnown = true
      tempCVal = t
      pressureHPaVal = p
      humidityPctVal = h
    } else {
      rho = settings.referenceAirDensity
      densityKnown = false
    }

    const massKg = systemMassKg === '' ? settings.systemMassKg : systemMassKg
    const track = makeTrack(venue.lapLengthM, venue.bendRadiusM)
    const params: RiderParams = {
      massKg,
      rotatingMassEqKg: settings.rotatingMassEqKg,
      crrEff: effectiveCrr(settings.tyreCrr, venue.surfaceFactor),
      mechEfficiency: settings.mechEfficiency,
      comHeightM: settings.comHeightM,
    }
    const cpW = { cp: settings.cpW, wPrimeJ: settings.wPrimeJ }

    setSaving(true)
    try {
      const full = analyzeRideFull(detection.fitBytes, {
        officialTimeS: official,
        rho,
        params,
        track,
        cpW,
        densityKnown,
      })

      const fitFileB64 = bytesToBase64(detection.fitBytes)
      if (fitFileB64.length > FIT_FILE_B64_MAX_BYTES) {
        setError(
          `This file encodes to ${(fitFileB64.length / 1000).toFixed(0)} KB, over the ${FIT_FILE_B64_MAX_BYTES / 1000} KB guard (Firestore 1 MB doc limit) — the ride was not saved.`,
        )
        setSaving(false)
        return
      }

      const now = new Date().toISOString()
      const kit = kitText
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)

      const ride: Ride = {
        id: newRideId(),
        createdAt: now,
        updatedAt: now,
        date,
        venueId: venue.id,
        eventName,
        round,
        officialTimeS: official,
        officialSplits: [],
        gear: { chainring, cog },
        airDensity: airDensityVal,
        tempC: tempCVal,
        pressureHPa: pressureHPaVal,
        humidityPct: humidityPctVal,
        systemMassKg: massKg,
        kit,
        notes,
        flags: { outdoor: !venue.indoor, caughtRider, interrupted },
        result: result || undefined,
        fitFileB64,
        analysis: full.analysisResult,
        analysisVersion: ENGINE_VERSION,
      }

      await dataStore.rides.put(ride)
      onSaved(ride.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Ride details</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={labelTextClass}>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Event</span>
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="2025 Worlds"
            className={inputClass}
          />
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
            <option value="">Choose a venue…</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {venue && (
            <span className="mt-0.5 block text-xs text-slate-500">
              {venue.lapLengthM} m lap · {venue.indoor ? 'indoor' : 'outdoor'}
            </span>
          )}
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Official time (s)</span>
          <input
            type="number"
            step="0.001"
            value={officialTimeS}
            onChange={(e) => setOfficialTimeS(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <fieldset className="grid grid-cols-2 gap-4">
        <label className={labelClass}>
          <span className={labelTextClass}>Chainring</span>
          <input
            type="number"
            value={chainring}
            onChange={(e) => setChainring(Number(e.target.value))}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Cog</span>
          <input type="number" value={cog} onChange={(e) => setCog(Number(e.target.value))} className={inputClass} />
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={labelTextClass}>Air density</legend>
        <div className="flex gap-4 text-sm text-slate-600">
          {(['direct', 'tprh', 'unknown'] as const).map((mode) => (
            <label key={mode} className="flex items-center gap-1">
              <input type="radio" checked={densityMode === mode} onChange={() => setDensityMode(mode)} />
              {mode === 'direct' ? 'Measured ρ' : mode === 'tprh' ? 'T / P / RH' : "Don't know"}
            </label>
          ))}
        </div>
        {densityMode === 'direct' && (
          <label className={labelClass}>
            <span className="text-xs text-slate-500">Air density (kg/m³)</span>
            <input
              type="number"
              step="0.001"
              value={airDensity}
              onChange={(e) => setAirDensity(e.target.value)}
              className={inputClass}
            />
          </label>
        )}
        {densityMode === 'tprh' && (
          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              <span className="text-xs text-slate-500">Temp (°C)</span>
              <input type="number" value={tempC} onChange={(e) => setTempC(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              <span className="text-xs text-slate-500">Pressure (hPa)</span>
              <input
                type="number"
                value={pressureHPa}
                onChange={(e) => setPressureHPa(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              <span className="text-xs text-slate-500">Humidity (%)</span>
              <input
                type="number"
                value={humidityPct}
                onChange={(e) => setHumidityPct(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        )}
        {densityMode === 'unknown' && (
          <p className="text-xs text-amber-700">
            Falls back to the reference density in Settings; the quality badge will flag it as
            defaulted.
          </p>
        )}
      </fieldset>

      <label className={labelClass}>
        <span className={labelTextClass}>System mass (kg)</span>
        <input
          type="number"
          step="0.1"
          value={systemMassKg}
          onChange={(e) => setSystemMassKg(e.target.value === '' ? '' : Number(e.target.value))}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        <span className={labelTextClass}>Kit tags (comma-separated)</span>
        <input
          value={kitText}
          onChange={(e) => setKitText(e.target.value)}
          placeholder="suit, helmet, socks"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        <span className={labelTextClass}>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} />
      </label>

      <fieldset className="flex gap-6 text-sm text-slate-600">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={caughtRider} onChange={(e) => setCaughtRider(e.target.checked)} />
          Caught rider
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={interrupted} onChange={(e) => setInterrupted(e.target.checked)} />
          Interrupted
        </label>
      </fieldset>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {saving ? 'Analyzing…' : 'Save & analyze'}
        </button>
      </div>
    </form>
  )
}
