// CdA savings calculator (SPEC §5.8 "Watts saved (aero)", rebuilt 2026-07 to the owner's
// sheet: configurable speeds × CdA counts, air density, start lap and DISTANCE, with a
// race-time column per speed row and a watts ⇄ time-saved toggle (time saved needs a
// baseline CdA to anchor the constant-power speed change; watts saved is
// distance-independent).

import { useState } from 'react'
import { KPH_TO_MS, timeSavedForCdaReduction, wattsSavedAero } from '../../engine/calculators'
import type { Settings } from '../../store/types'
import { T } from '../../components/EditableText'
import { heatColor, heatT } from './heat'
import { formatMinSec } from './schedule'

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
const LAP_M = 250

export default function WattsSavedCalculator({ settings }: { settings: Settings }) {
  const [rhoInput, setRhoInput] = useState(String(settings.referenceAirDensity))
  const [speedMinInput, setSpeedMinInput] = useState('57')
  const [speedMaxInput, setSpeedMaxInput] = useState('68')
  const [speedStepInput, setSpeedStepInput] = useState('0.5')
  const [maxCountsInput, setMaxCountsInput] = useState('15')
  const [startLapInput, setStartLapInput] = useState('21')
  const [distanceInput, setDistanceInput] = useState('4000')
  const [mode, setMode] = useState<'watts' | 'time'>('watts')
  const [baselineCdaInput, setBaselineCdaInput] = useState('0.190')

  const rho = Number(rhoInput)
  const speedMin = Number(speedMinInput)
  const speedMax = Number(speedMaxInput)
  const speedStep = Number(speedStepInput)
  const maxCounts = Math.min(30, Math.max(1, Math.round(Number(maxCountsInput) || 0)))
  const startLapS = Number(startLapInput)
  const distanceM = Number(distanceInput)
  const baselineCda = Number(baselineCdaInput)

  const speedsKph: number[] = []
  if (Number.isFinite(speedMin) && Number.isFinite(speedMax) && speedStep >= 0.1) {
    for (let v = speedMin; v <= speedMax + 1e-9 && speedsKph.length < 100; v += speedStep) speedsKph.push(v)
  }
  const countsList = Array.from({ length: maxCounts }, (_, i) => i + 1)

  const valid =
    Number.isFinite(rho) && rho > 0 && speedsKph.length > 0 && Number.isFinite(distanceM) && distanceM > LAP_M &&
    (mode === 'watts' || (Number.isFinite(baselineCda) && baselineCda > maxCounts / 1000))

  const cellValue = (kph: number, counts: number): number => {
    const vMs = kph * KPH_TO_MS
    if (mode === 'watts') return wattsSavedAero(vMs, counts, rho)
    return timeSavedForCdaReduction(
      vMs,
      counts,
      rho,
      settings.systemMassKg,
      settings.tyreCrr,
      settings.mechEfficiency,
      baselineCda,
      distanceM,
      Number.isFinite(startLapS) && startLapS > 0 ? LAP_M : 0,
    )
  }

  const cells = valid ? speedsKph.map((kph) => countsList.map((c) => cellValue(kph, c))) : []
  const flat = cells.flat()
  const min = flat.length > 0 ? Math.min(...flat) : 0
  const max = flat.length > 0 ? Math.max(...flat) : 1

  const raceTime = (kph: number): string => {
    const vMs = kph * KPH_TO_MS
    const usesStartLap = Number.isFinite(startLapS) && startLapS > 0
    const t = (usesStartLap ? startLapS : 0) + (distanceM - (usesStartLap ? LAP_M : 0)) / vMs
    return formatMinSec(t)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Air density ρ (kg/m³)</span>
          <input type="number" step="0.001" value={rhoInput} onChange={(e) => setRhoInput(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Start lap (s, 0 = none)</span>
          <input type="number" step="0.1" value={startLapInput} onChange={(e) => setStartLapInput(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Distance (m)</span>
          <input type="number" step="250" value={distanceInput} onChange={(e) => setDistanceInput(e.target.value)} className={inputClass} />
          <span className="mt-0.5 block text-xs text-slate-400">4000 = IP · 40000 = TT · ~55000 = hour</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">CdA counts (max)</span>
          <input type="number" step="1" value={maxCountsInput} onChange={(e) => setMaxCountsInput(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Speed range (km/h)</span>
          <div className="mt-1 flex gap-1">
            <input type="number" step="0.5" value={speedMinInput} onChange={(e) => setSpeedMinInput(e.target.value)} className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
            <input type="number" step="0.5" value={speedMaxInput} onChange={(e) => setSpeedMaxInput(e.target.value)} className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Step (km/h)</span>
          <input type="number" step="0.1" value={speedStepInput} onChange={(e) => setSpeedStepInput(e.target.value)} className={inputClass} />
        </label>
        <fieldset className="block text-sm">
          <span className="font-medium text-slate-700">Cells show</span>
          <div className="mt-1.5 flex gap-3 text-sm text-slate-600">
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === 'watts'} onChange={() => setMode('watts')} />
              Watts saved
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === 'time'} onChange={() => setMode('time')} />
              Time saved (s)
            </label>
          </div>
        </fieldset>
        {mode === 'time' && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Baseline CdA (m²)</span>
            <input type="number" step="0.001" value={baselineCdaInput} onChange={(e) => setBaselineCdaInput(e.target.value)} className={inputClass} />
          </label>
        )}
      </div>

      {valid && (
        <div className="max-h-[36rem] overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="px-2 py-1.5 text-right font-medium text-slate-600">Speed (km/h)</th>
                {countsList.map((c) => (
                  <th key={c} className="px-2 py-1.5 text-right font-medium text-slate-600">
                    {c}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right font-medium text-slate-600">Race time</th>
              </tr>
            </thead>
            <tbody>
              {speedsKph.map((kph, r) => (
                <tr key={r}>
                  <td className="border-t border-slate-100 px-2 py-1 text-right font-mono font-medium text-slate-700">
                    {kph.toFixed(1)}
                  </td>
                  {cells[r].map((val, c) => (
                    <td
                      key={c}
                      className="border-t border-white px-2 py-1 text-right font-mono text-slate-900"
                      style={{ backgroundColor: heatColor(1 - heatT(val, min, max)) }}
                    >
                      {val.toFixed(1)}
                    </td>
                  ))}
                  <td className="border-t border-slate-100 bg-orange-50 px-2 py-1 text-right font-mono text-slate-700">
                    {raceTime(kph)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        <T
          as="span"
          id="calculators.wattssaved.caption-base"
          d="Columns = CdA change in counts (1 count = 0.001 m²), green = bigger saving."
        />{' '}
        {mode === 'watts' ? (
          <T as="span" id="calculators.wattssaved.caption-watts" d="Watts saved = ½·ΔCdA·ρ·v³ (distance-independent)." />
        ) : (
          <T
            as="span"
            id="calculators.wattssaved.caption-time"
            d="Time saved holds power constant at the baseline CdA and re-solves the speed at the reduced CdA over the remaining distance (start lap unchanged)."
          />
        )}{' '}
        <T as="span" id="calculators.wattssaved.caption-racetime" d="Race time = start lap + remaining distance at that speed." />
      </p>
    </div>
  )
}
