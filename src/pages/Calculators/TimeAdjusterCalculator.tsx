// Time adjuster calculator (SPEC §5.8): two environment blocks (T/P/RH → ρ via §4.2),
// lap-time vector in, adjusted out, with a colored Δ column (owner request 2026-07 item
// 17). The former "full-sim mode" (re-simulating a stored ride at the target density) was
// removed at the owner's request — its flow didn't make sense inside a lap-time-vector
// calculator; the Adjuster's density override is the right home for that question.

import { useMemo, useState } from 'react'
import { airDensity } from '../../engine/atmosphere'
import { adjustLapTimesFastByDensity } from '../../engine/calculators'
import { formatMinSec } from './schedule'

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

export default function TimeAdjusterCalculator() {
  const [rideEnv, setRideEnv] = useState<EnvBlockState>(DEFAULT_ENV)
  const [targetEnv, setTargetEnv] = useState<EnvBlockState>({ ...DEFAULT_ENV, rho: '1.172' })
  const [lapTimesInput, setLapTimesInput] = useState('21.5 14.9 14.9 14.9 14.9 14.9 14.9 14.9 14.9 14.9 14.9 14.9 14.9 14.9 14.9 14.9')

  const rhoRide = resolveRho(rideEnv)
  const rhoTarget = resolveRho(targetEnv)

  const lapTimesS = lapTimesInput
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)

  const adjusted = useMemo(() => {
    if (!Number.isFinite(rhoRide) || !Number.isFinite(rhoTarget) || lapTimesS.length === 0) return null
    return adjustLapTimesFastByDensity(lapTimesS, rhoRide, rhoTarget, lapTimesInput.trim().split(/[,\s]+/).length > 1)
  }, [rhoRide, rhoTarget, lapTimesInput, lapTimesS])

  const totalIn = lapTimesS.reduce((s, x) => s + x, 0)
  const totalOut = adjusted ? adjusted.reduce((s, x) => s + x, 0) : 0
  const totalDelta = totalOut - totalIn

  const deltaClass = (d: number) => (d < -0.0005 ? 'text-green-700' : d > 0.0005 ? 'text-red-700' : 'text-slate-500')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <EnvBlockForm label="Ride environment" value={rideEnv} onChange={setRideEnv} />
        <EnvBlockForm label="Target environment" value={targetEnv} onChange={setTargetEnv} />
      </div>

      <label className="block text-sm">
        <span className="font-medium text-slate-700">Lap times (s), comma or space separated</span>
        <input
          value={lapTimesInput}
          onChange={(e) => setLapTimesInput(e.target.value)}
          className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 font-mono text-sm"
        />
      </label>

      {adjusted && (
        <>
          <div className="flex flex-wrap gap-6 text-sm text-slate-700">
            <div>
              <span className="text-slate-500">Input total: </span>
              <span className="font-mono font-semibold">{totalIn.toFixed(2)} s</span>
              <span className="ml-1 font-mono text-slate-500">({formatMinSec(totalIn)})</span>
            </div>
            <div>
              <span className="text-slate-500">Adjusted total: </span>
              <span className="font-mono font-semibold">{totalOut.toFixed(2)} s</span>
              <span className="ml-1 font-mono text-slate-500">({formatMinSec(totalOut)})</span>
            </div>
            <div className={`font-mono font-semibold ${deltaClass(totalDelta)}`}>
              {totalDelta >= 0 ? '+' : ''}
              {totalDelta.toFixed(2)} s
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">Lap</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">Input (s)</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">Adjusted (s)</th>
                  <th className="px-3 py-2 text-right font-medium text-slate-600">Δ (s)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lapTimesS.map((lt, i) => {
                  const d = adjusted[i] - lt
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-900">{i + 1}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{lt.toFixed(3)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-900">{adjusted[i].toFixed(4)}</td>
                      <td className={`px-3 py-2 text-right font-mono font-medium ${deltaClass(d)}`}>
                        {d >= 0 ? '+' : ''}
                        {d.toFixed(4)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
