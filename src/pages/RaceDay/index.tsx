// Race Day (SPEC §5.7): venue + environment + gear + goal → required lap schedule, steady
// power, cadence per lap, density readout. Big-type, phone-friendly card layout; "save as
// scenario".

import { useMemo, useState } from 'react'
import { airDensity } from '../../engine/atmosphere'
import { dataStore } from '../../store/DataStore'
import { SETTINGS_ID, withSettingsDefaults, type Scenario } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import { computeRaceDayPlan } from './raceday'
import type { RaceDayGoal, RaceDayStart } from './raceday'
import { T } from '../../components/EditableText'

// Same nominal starting-guess CdA as a blank Adjuster scenario (store/scenario.ts) —
// used only when no analyzed ride exists yet to suggest a better default.
const FALLBACK_CDA_M2 = 0.19

function newScenarioId(): string {
  return `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
const labelClass = 'block text-sm'
const labelTextClass = 'font-medium text-slate-700'

export default function RaceDay() {
  const rides = useCollection(dataStore.rides)
  const venues = useCollection(dataStore.venues)
  const settingsRows = useCollection(dataStore.settings)
  const rawSettings = settingsRows.find((s) => s.id === SETTINGS_ID)
  const settings = rawSettings ? withSettingsDefaults(rawSettings) : undefined

  const bestCda = useMemo(() => {
    const values = rides.map((r) => r.analysis?.cdaRace).filter((v): v is number => v != null && Number.isFinite(v))
    return values.length > 0 ? Math.min(...values) : FALLBACK_CDA_M2
  }, [rides])

  const [venueId, setVenueId] = useState('')
  const [densityMode, setDensityMode] = useState<'direct' | 'tprh'>('direct')
  const [densityInput, setDensityInput] = useState('1.15')
  const [tempC, setTempC] = useState('20')
  const [pressureHPa, setPressureHPa] = useState('1013')
  const [humidityPct, setHumidityPct] = useState('50')
  const [chainring, setChainring] = useState(65)
  const [cog, setCog] = useState(15)
  const [cdaInput, setCdaInput] = useState('')
  const [massInput, setMassInput] = useState('')
  const [goalMode, setGoalMode] = useState<'time' | 'power'>('time')
  const [goalTimeInput, setGoalTimeInput] = useState('245')
  const [goalPowerInput, setGoalPowerInput] = useState('450')
  const [startMode, setStartMode] = useState<'split' | 'template'>('split')
  const [startLapInput, setStartLapInput] = useState('21.5')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const venue = venues.find((v) => v.id === venueId) ?? venues[0]

  const rho =
    densityMode === 'direct'
      ? Number(densityInput)
      : airDensity(Number(tempC), Number(pressureHPa), Number(humidityPct))

  const cdaM2 = cdaInput !== '' ? Number(cdaInput) : bestCda
  const massKg = massInput !== '' ? Number(massInput) : (settings?.systemMassKg ?? 100)

  const goal: RaceDayGoal | null = useMemo(() => {
    if (goalMode === 'time') {
      const t = Number(goalTimeInput)
      return Number.isFinite(t) && t > 0 ? { kind: 'time', targetTimeS: t } : null
    }
    const p = Number(goalPowerInput)
    return Number.isFinite(p) && p > 0 ? { kind: 'power', powerW: p } : null
  }, [goalMode, goalTimeInput, goalPowerInput])

  const start: RaceDayStart | null = useMemo(() => {
    if (startMode === 'template') return { kind: 'template' }
    const s = Number(startLapInput)
    return Number.isFinite(s) && s > 0 ? { kind: 'split', startLapS: s } : null
  }, [startMode, startLapInput])

  const plan = useMemo(() => {
    if (!settings || !venue || !goal || !start || !Number.isFinite(rho) || rho <= 0) return null
    try {
      return computeRaceDayPlan({
        venue,
        rho,
        massKg,
        cdaM2,
        crrTyre: settings.tyreCrr,
        rotatingMassEqKg: settings.rotatingMassEqKg,
        mechEfficiency: settings.mechEfficiency,
        comHeightM: settings.comHeightM,
        rolloutM: settings.rolloutM,
        gear: { chainring, cog },
        goal,
        start,
      })
    } catch {
      return null
    }
  }, [settings, venue, goal, start, rho, massKg, cdaM2, chainring, cog])

  async function handleSaveAsScenario() {
    if (!plan || !venue) return
    const now = new Date().toISOString()
    const scenario: Scenario = {
      id: newScenarioId(),
      createdAt: now,
      updatedAt: now,
      name: `Race day plan — ${venue.name} — ${goal?.kind === 'time' ? `${goalTimeInput}s` : `${goalPowerInput}W`}`,
      baseline: 'blank',
      overrides: {
        avgPowerW: plan.steadyW,
        venueId: venue.id,
        airDensity: rho,
        massKg,
        cdA: cdaM2,
        gear: { chainring, cog },
        ...(startMode === 'split' ? { startLapS: Number(startLapInput) } : {}),
      },
      result: {
        predictedTimeS: plan.predictedTimeS,
        lapSplits: plan.lapTimes.reduce<number[]>((acc, lt) => [...acc, (acc[acc.length - 1] ?? 0) + lt], []),
        note:
          startMode === 'split'
            ? `Race Day plan — start ${startLapInput} s + settle ${plan.steadyW.toFixed(0)} W.`
            : 'Race Day plan — flat-power equivalent of the shown start-ramp schedule (Adjuster/Scenario overrides have no template-shape field).',
      },
      pinned: false,
    }
    await dataStore.scenarios.put(scenario)
    setSaveMessage('Saved as scenario — see it in Adjuster.')
  }

  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>
  if (venues.length === 0) return <p className="text-sm text-slate-500">Add a venue in Settings first.</p>

  return (
    <div className="space-y-4">
      <T as="h1" className="text-2xl font-semibold text-slate-900" id="raceday.index.race-day" d="Race Day" />

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className={labelClass}>
          <span className={labelTextClass}>Venue</span>
          <select value={venue?.id ?? ''} onChange={(e) => setVenueId(e.target.value)} className={inputClass}>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className={labelTextClass}>Environment</legend>
          <div className="flex gap-4 text-sm text-slate-600">
            {(['direct', 'tprh'] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-1">
                <input type="radio" checked={densityMode === mode} onChange={() => setDensityMode(mode)} />
                {mode === 'direct' ? 'Measured ρ' : 'T / P / RH'}
              </label>
            ))}
          </div>
          {densityMode === 'direct' ? (
            <label className={labelClass}>
              <span className="text-xs text-slate-500">Air density (kg/m³)</span>
              <input
                type="number"
                step="0.001"
                value={densityInput}
                onChange={(e) => setDensityInput(e.target.value)}
                className={inputClass}
              />
            </label>
          ) : (
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
          <p className="text-xs text-slate-500">ρ = {Number.isFinite(rho) ? rho.toFixed(4) : '—'} kg/m³</p>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <fieldset className="grid grid-cols-2 gap-2">
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
          <label className={labelClass}>
            <span className={labelTextClass}>CdA (m²)</span>
            <input
              type="number"
              step="0.001"
              value={cdaInput}
              onChange={(e) => setCdaInput(e.target.value)}
              placeholder={bestCda.toFixed(4)}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>System mass (kg)</span>
            <input
              type="number"
              step="0.1"
              value={massInput}
              onChange={(e) => setMassInput(e.target.value)}
              placeholder={String(settings.systemMassKg)}
              className={inputClass}
            />
          </label>
        </div>

        <fieldset className="space-y-2 rounded-lg bg-slate-50 p-3">
          <legend className={labelTextClass}>Start lap</legend>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <label className="flex items-center gap-1">
              <input type="radio" checked={startMode === 'split'} onChange={() => setStartMode('split')} />
              Expected start split (s)
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={startMode === 'template'} onChange={() => setStartMode('template')} />
              Simulated start ramp
            </label>
          </div>
          {startMode === 'split' && (
            <label className={labelClass}>
              <span className="text-xs text-slate-500">
                Lap 1 time — the rest of the race rides "power excluding lap 1" from at-speed
              </span>
              <input
                type="number"
                step="0.1"
                value={startLapInput}
                onChange={(e) => setStartLapInput(e.target.value)}
                className={inputClass}
              />
            </label>
          )}
        </fieldset>

        <fieldset className="space-y-2 rounded-lg bg-slate-50 p-3">
          <legend className={labelTextClass}>Goal</legend>
          <div className="flex gap-4 text-sm text-slate-600">
            <label className="flex items-center gap-1">
              <input type="radio" checked={goalMode === 'time'} onChange={() => setGoalMode('time')} />
              Target time (s)
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={goalMode === 'power'} onChange={() => setGoalMode('power')} />
              Target power (W)
            </label>
          </div>
          {goalMode === 'time' ? (
            <input
              type="number"
              step="0.1"
              value={goalTimeInput}
              onChange={(e) => setGoalTimeInput(e.target.value)}
              className={inputClass}
            />
          ) : (
            <input
              type="number"
              step="1"
              value={goalPowerInput}
              onChange={(e) => setGoalPowerInput(e.target.value)}
              className={inputClass}
            />
          )}
        </fieldset>
      </section>

      {plan && venue && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-4 text-center">
              <div className="text-xs uppercase tracking-wide text-slate-500">Required steady power</div>
              <div className="text-3xl font-bold text-slate-900">{plan.steadyW.toFixed(0)} W</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-4 text-center">
              <div className="text-xs uppercase tracking-wide text-slate-500">Predicted time</div>
              <div className="text-3xl font-bold text-slate-900">{plan.predictedTimeS.toFixed(2)} s</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-4 text-center">
              <div className="text-xs uppercase tracking-wide text-slate-500">Density</div>
              <div className="text-3xl font-bold text-slate-900">{rho.toFixed(3)}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Lap</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">Time (s)</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">Cadence (rpm)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plan.lapTimes.map((lt, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-slate-900">Lap {i + 1}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-800">{lt.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-800">{plan.cadenceRpm[i].toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSaveAsScenario()}
              className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Save as scenario
            </button>
            {saveMessage && <span className="text-xs text-green-700">{saveMessage}</span>}
          </div>
          <T
            as="p"
            className="text-xs text-slate-500"
            id="raceday.save-as-scenario-note"
            d="“Save as scenario” stores the flat-power equivalent of this start-ramp schedule (Scenario overrides have no template-shape field) — its own predicted time in Adjuster may differ slightly from the plan above."
          />
        </section>
      )}
    </div>
  )
}
