// Time adjuster calculator (SPEC §5.8): two environment blocks (T/P/RH → ρ via §4.2),
// lap-time vector in, adjusted out; fast mode default, full-sim mode toggle.

import { useMemo, useState } from 'react'
import { airDensity } from '../../engine/atmosphere'
import { simulate } from '../../engine/simulate'
import { adjustLapTimesFastByDensity } from '../../engine/calculators'
import { resolveScenario, resolveScenarioBaseline } from '../../store/scenario'
import type { ScenarioBaseline } from '../../store/scenario'
import type { Ride, Settings, Venue } from '../../store/types'

interface EnvBlockState {
  mode: 'direct' | 'tprh'
  rho: string
  tempC: string
  pressureHPa: string
  humidityPct: string
}

const DEFAULT_ENV: EnvBlockState = { mode: 'direct', rho: '1.15', tempC: '20', pressureHPa: '1013', humidityPct: '50' }

function resolveRho(env: EnvBlockState): number {
  if (env.mode === 'direct') return Number(env.rho)
  return airDensity(Number(env.tempC), Number(env.pressureHPa), Number(env.humidityPct))
}

function EnvBlockForm({
  label,
  value,
  onChange,
}: {
  label: string
  value: EnvBlockState
  onChange: (next: EnvBlockState) => void
}) {
  const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">{label}</legend>
      <div className="flex gap-4 text-sm text-slate-600">
        <label className="flex items-center gap-1">
          <input type="radio" checked={value.mode === 'direct'} onChange={() => onChange({ ...value, mode: 'direct' })} />
          Measured ρ
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={value.mode === 'tprh'} onChange={() => onChange({ ...value, mode: 'tprh' })} />
          T / P / RH
        </label>
      </div>
      {value.mode === 'direct' ? (
        <label className="block text-sm">
          <span className="text-xs text-slate-500">Air density (kg/m³)</span>
          <input
            type="number"
            step="0.001"
            value={value.rho}
            onChange={(e) => onChange({ ...value, rho: e.target.value })}
            className={inputClass}
          />
        </label>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-sm">
            <span className="text-xs text-slate-500">Temp (°C)</span>
            <input
              type="number"
              value={value.tempC}
              onChange={(e) => onChange({ ...value, tempC: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-500">Pressure (hPa)</span>
            <input
              type="number"
              value={value.pressureHPa}
              onChange={(e) => onChange({ ...value, pressureHPa: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-slate-500">Humidity (%)</span>
            <input
              type="number"
              value={value.humidityPct}
              onChange={(e) => onChange({ ...value, humidityPct: e.target.value })}
              className={inputClass}
            />
          </label>
        </div>
      )}
      <p className="text-xs text-slate-500">ρ = {resolveRho(value).toFixed(4)} kg/m³</p>
    </fieldset>
  )
}

export default function TimeAdjusterCalculator({
  rides,
  venues,
  settings,
}: {
  rides: Ride[]
  venues: Venue[]
  settings: Settings
}) {
  const [rideEnv, setRideEnv] = useState<EnvBlockState>(DEFAULT_ENV)
  const [targetEnv, setTargetEnv] = useState<EnvBlockState>({ ...DEFAULT_ENV, rho: String(settings.referenceAirDensity) })
  const [lapTimesInput, setLapTimesInput] = useState('15.6')
  const [fullMode, setFullMode] = useState(false)
  const [baselineRef, setBaselineRef] = useState<string | 'blank'>('blank')

  const rhoRide = resolveRho(rideEnv)
  const rhoTarget = resolveRho(targetEnv)

  const lapTimesS = lapTimesInput
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)

  const adjustedFast = useMemo(() => {
    if (!Number.isFinite(rhoRide) || !Number.isFinite(rhoTarget) || lapTimesS.length === 0) return null
    return adjustLapTimesFastByDensity(lapTimesS, rhoRide, rhoTarget, lapTimesInput.trim().split(/[,\s]+/).length > 1)
  }, [rhoRide, rhoTarget, lapTimesInput, lapTimesS])

  const baselineResolution: ScenarioBaseline | { error: string } | null = fullMode
    ? resolveScenarioBaseline(baselineRef, rides, venues, settings)
    : null
  const baselineError =
    baselineResolution && typeof baselineResolution === 'object' && 'error' in baselineResolution
      ? baselineResolution.error
      : null

  const fullResult = useMemo(() => {
    if (!fullMode || !baselineResolution || baselineError) return null
    const resolved = resolveScenario(baselineResolution as ScenarioBaseline, {}, settings, venues)
    const sim = simulate({
      power: resolved.power,
      cdaM2: resolved.cdaM2,
      rho: rhoTarget,
      params: resolved.params,
      track: resolved.track,
      distanceM: resolved.distanceM,
      v0: resolved.v0,
      lapPhaseOffsetM: resolved.lapPhaseOffsetM,
    })
    return resolved.headStartS + sim.finishTimeS
  }, [fullMode, baselineResolution, baselineError, rhoTarget, settings, venues])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <EnvBlockForm label="Ride environment" value={rideEnv} onChange={setRideEnv} />
        <EnvBlockForm label="Target environment" value={targetEnv} onChange={setTargetEnv} />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={fullMode} onChange={(e) => setFullMode(e.target.checked)} />
        Full-sim mode (re-simulate a real ride's power at the target density, instead of scaling a lap-time vector)
      </label>

      {!fullMode && (
        <>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Lap times (s), comma or space separated</span>
            <input
              value={lapTimesInput}
              onChange={(e) => setLapTimesInput(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          {adjustedFast && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Lap</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">Input (s)</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">Adjusted (s)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lapTimesS.map((lt, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-900">{i + 1}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{lt.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-900">{adjustedFast[i].toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {fullMode && (
        <div className="space-y-3">
          <label className="block text-sm sm:w-96">
            <span className="font-medium text-slate-700">Ride to re-simulate</span>
            <select
              value={baselineRef}
              onChange={(e) => setBaselineRef(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="blank">Blank (nominal starting guess)</option>
              {[...rides]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.eventName || 'Untitled ride'} — {r.date}
                  </option>
                ))}
            </select>
          </label>
          {baselineError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{baselineError}</div>
          )}
          {fullResult != null && (
            <div className="rounded-lg bg-slate-50 p-4 text-center">
              <div className="text-xs uppercase tracking-wide text-slate-500">Re-simulated time at target ρ</div>
              <div className="text-3xl font-bold text-slate-900">{fullResult.toFixed(3)} s</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
