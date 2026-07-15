// Ride metadata form (SPEC §5.1 upload flow, step 3): venue, gear, density or T/P/RH, kit
// tags, notes, flags. Submitting runs the full P3/P4 analysis pipeline and saves the ride.

import { useState } from 'react'
import type { FormEvent } from 'react'
import { airDensity as computeAirDensity, effectiveCrr, makeTrack } from '../../engine/index'
import type { RiderParams } from '../../engine/index'
import { ENGINE_VERSION } from '../../engine/constants'
import { analyzeRideFull, caughtRiderExcludedLaps, defaultCatchExclusionRange, fitStartDate } from '../../engine/ingest'
import { parseSplitsText } from './splits'
import KitPicker from '../../components/KitPicker'
import { dataStore } from '../../store/DataStore'
import { bytesToBase64, FIT_FILE_B64_MAX_BYTES } from '../../store/encoding'
import { SETTINGS_ID, withSettingsDefaults, type Ride, type Settings, type Venue } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import type { DetectionConfirmResult } from './DetectionConfirm'
import { T } from '../../components/EditableText'

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

  // Prefill the date from the file's own first timestamp (owner request 2026-07 item 11);
  // FIT timestamps are UTC, so this is a prefill the owner can correct, not authoritative.
  const [date, setDate] = useState(
    () => fitStartDate(detection.fitBytes)?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  )
  // Same-day ordering tiebreaker (owner request 2026-07 round 4, item 4): prefill from the
  // file's first timestamp, rendered in the device's local zone — editable like the date.
  const [startTime, setStartTime] = useState(() => {
    const d = fitStartDate(detection.fitBytes)
    return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''
  })
  const [eventName, setEventName] = useState('')
  const [round, setRound] = useState<Ride['round']>('qualifying')
  const [venueId, setVenueId] = useState('')
  // Prefill from the detection step's cadence-speed choice when the speed channel was
  // broken (round 5): the reconstruction there used these values, so they must carry over.
  const [chainring, setChainring] = useState(detection.speedFromCadence?.chainring ?? 65)
  const [cog, setCog] = useState(detection.speedFromCadence?.cog ?? 15)
  const [densityMode, setDensityMode] = useState<'direct' | 'tprh' | 'unknown'>('direct')
  const [airDensity, setAirDensity] = useState('')
  const [tempC, setTempC] = useState('')
  const [pressureHPa, setPressureHPa] = useState('')
  const [humidityPct, setHumidityPct] = useState('')
  const [systemMassKg, setSystemMassKg] = useState<number | ''>(settings.systemMassKg)
  // Per-ride physics params (owner request 2026-07 round 4, item 7): prefilled from the
  // globals, saved onto the ride so each ride carries (and can later edit) its own values.
  const [tyreCrr, setTyreCrr] = useState(String(settings.tyreCrr))
  const [mechEfficiency, setMechEfficiency] = useState(String(settings.mechEfficiency))
  const [rolloutM, setRolloutM] = useState(String(detection.speedFromCadence?.rolloutM ?? settings.rolloutM))
  const [kit, setKit] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [caughtRider, setCaughtRider] = useState(false)
  const [caughtAtLap, setCaughtAtLap] = useState('')
  // Exclusion range for the catch (round 8): prefilled from the catch position (−2 → +1),
  // editable. Re-prefilled whenever the catch position changes.
  const [caughtFrom, setCaughtFrom] = useState('')
  const [caughtTo, setCaughtTo] = useState('')
  const [interrupted, setInterrupted] = useState(false)

  function handleCaughtAtLapChange(value: string) {
    setCaughtAtLap(value)
    const def = defaultCatchExclusionRange(Number.parseFloat(value))
    setCaughtFrom(def ? String(def.fromLap) : '')
    setCaughtTo(def ? String(def.toLap) : '')
  }
  const [result, setResult] = useState('')
  const [officialTimeS, setOfficialTimeS] = useState(String(detection.officialTimeS))
  const [splitsText, setSplitsText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedSplits = parseSplitsText(splitsText)

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
    if (parsedSplits.error) {
      setError(`Official splits: ${parsedSplits.error}`)
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
    const tyreCrrVal = Number.parseFloat(tyreCrr)
    const mechEfficiencyVal = Number.parseFloat(mechEfficiency)
    const rolloutVal = Number.parseFloat(rolloutM)
    if (!(tyreCrrVal > 0) || !(mechEfficiencyVal > 0 && mechEfficiencyVal <= 1) || !(rolloutVal > 0)) {
      setError('Tyre Crr, mech. efficiency (0–1], and rollout must be positive numbers.')
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
    const track = makeTrack(venue.lapLengthM, venue.bendRadiusM)
    const params: RiderParams = {
      massKg,
      rotatingMassEqKg: settings.rotatingMassEqKg,
      crrEff: effectiveCrr(tyreCrrVal, venue.surfaceFactor),
      mechEfficiency: mechEfficiencyVal,
      comHeightM: settings.comHeightM,
    }
    const cpW = { cp: settings.cpW, wPrimeJ: settings.wPrimeJ }

    setSaving(true)
    try {
      const full = analyzeRideFull(detection.fitBytes, {
        officialTimeS: official,
        officialSplits: parsedSplits.splits.length > 0 ? parsedSplits.splits : undefined,
        rho,
        params,
        track,
        cpW,
        densityKnown,
        // The form's CURRENT gear/rollout drive the reconstruction (the owner may have
        // corrected them since the detection step), not the detection-step snapshot.
        speedFromCadence: detection.speedFromCadence
          ? { chainring, cog, rolloutM: rolloutVal }
          : undefined,
        excludeCdaLaps:
          caughtRider && Number.isFinite(caughtAtLapVal)
            ? caughtRiderExcludedLaps(caughtAtLapVal as number, caughtFromVal, caughtToVal)
            : undefined,
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

      const ride: Ride = {
        id: newRideId(),
        createdAt: now,
        updatedAt: now,
        date,
        startTime: startTime || undefined,
        venueId: venue.id,
        eventName,
        round,
        officialTimeS: official,
        officialSplits: parsedSplits.splits,
        gear: { chainring, cog },
        airDensity: airDensityVal,
        tempC: tempCVal,
        pressureHPa: pressureHPaVal,
        humidityPct: humidityPctVal,
        systemMassKg: massKg,
        tyreCrr: tyreCrrVal,
        mechEfficiency: mechEfficiencyVal,
        rolloutM: rolloutVal,
        speedSource: detection.speedFromCadence ? 'cadence' : undefined,
        kit,
        notes,
        flags: { outdoor: !venue.indoor, caughtRider, interrupted },
        caughtAtLap: caughtRider ? caughtAtLapVal : undefined,
        caughtExcludeFromLap: caughtRider ? caughtFromVal : undefined,
        caughtExcludeToLap: caughtRider ? caughtToVal : undefined,
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
      <T as="h2" className="text-sm font-semibold text-slate-900" id="rides.metadataform.ride-details" d="Ride details" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={labelTextClass}>Date &amp; start time</span>
          <div className="mt-1 flex gap-1">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="block w-32 rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <span className="mt-0.5 block text-xs text-slate-500">
            Time orders same-day rides; prefilled from the file (local zone).
          </span>
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

      <fieldset className="space-y-2">
        <legend className={labelTextClass}>Ride physics parameters</legend>
        <T as="p" className="text-xs text-slate-500" id="rides.metadataform.prefilled-from-the-global-defaults" d="Prefilled from the global defaults in Settings; saved onto this ride and editable per ride later. Mass, Crr, and efficiency feed this ride's analysis; rollout feeds cadence." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={labelClass}>
            <span className="text-xs text-slate-500">System mass (kg)</span>
            <input
              type="number"
              step="0.1"
              value={systemMassKg}
              onChange={(e) => setSystemMassKg(e.target.value === '' ? '' : Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">Tyre Crr</span>
            <input type="number" step="0.0001" value={tyreCrr} onChange={(e) => setTyreCrr(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">Mech. efficiency</span>
            <input type="number" step="0.001" value={mechEfficiency} onChange={(e) => setMechEfficiency(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            <span className="text-xs text-slate-500">Rollout (m)</span>
            <input type="number" step="0.001" value={rolloutM} onChange={(e) => setRolloutM(e.target.value)} className={inputClass} />
          </label>
        </div>
      </fieldset>

      <label className={labelClass}>
        <span className={labelTextClass}>Official lap splits (optional)</span>
        <textarea
          value={splitsText}
          onChange={(e) => setSplitsText(e.target.value)}
          rows={2}
          placeholder="Paste 16 lap times — per-lap or cumulative, spaces/commas/newlines all fine"
          className={inputClass}
        />
        {splitsText.trim() !== '' && !parsedSplits.error && (
          <span className="mt-0.5 block text-xs text-slate-500">
            Parsed {parsedSplits.splits.length} lap(s), total{' '}
            {parsedSplits.splits.reduce((s, x) => s + x, 0).toFixed(3)} s
          </span>
        )}
        {parsedSplits.error && <span className="mt-0.5 block text-xs text-red-600">{parsedSplits.error}</span>}
      </label>

      <fieldset className="space-y-1">
        <legend className={labelTextClass}>Kit</legend>
        <KitPicker value={kit} onChange={setKit} />
      </fieldset>

      <label className={labelClass}>
        <span className={labelTextClass}>Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} />
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
              default 2 before → 1 after the catch; drives the “CdA excl. catch” companion (the full
              laps 3–15 CdA is still reported)
            </span>
          </span>
        )}
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
