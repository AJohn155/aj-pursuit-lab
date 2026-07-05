// Watts-saved (aero) calculator (SPEC §5.8): ΔP = 0.5·(counts/1000)·ρ·v³ grid, speed rows
// × counts columns. 1 count = 0.001 m² CdA.

import { useState } from 'react'
import { KPH_TO_MS, wattsSavedGrid } from '../../engine/calculators'
import type { Settings } from '../../store/types'

const SPEED_STEP_KPH = 5
const SPEED_MIN_KPH = 40
const SPEED_MAX_KPH = 70

export default function WattsSavedCalculator({ settings }: { settings: Settings }) {
  const [rhoInput, setRhoInput] = useState(String(settings.referenceAirDensity))
  const [countsInput, setCountsInput] = useState('1, 2, 3, 5, 10')

  const rho = Number(rhoInput)
  const countsList = countsInput
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)

  const speedsKph: number[] = []
  for (let v = SPEED_MIN_KPH; v <= SPEED_MAX_KPH; v += SPEED_STEP_KPH) speedsKph.push(v)
  const speedsMs = speedsKph.map((kph) => kph * KPH_TO_MS)

  const valid = Number.isFinite(rho) && rho > 0 && countsList.length > 0
  const grid = valid ? wattsSavedGrid(speedsMs, countsList, rho) : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Air density ρ (kg/m³)</span>
          <input
            type="number"
            step="0.001"
            value={rhoInput}
            onChange={(e) => setRhoInput(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Counts (1 count = 0.001 m² CdA)</span>
          <input
            value={countsInput}
            onChange={(e) => setCountsInput(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
      </div>

      {grid && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-right font-medium text-slate-600">Speed (km/h)</th>
                {countsList.map((c, i) => (
                  <th key={i} className="px-3 py-2 text-right font-medium text-slate-600">
                    {c} counts
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grid.speedsMs.map((_, r) => (
                <tr key={r}>
                  <td className="px-3 py-2 text-right font-mono text-slate-700">{speedsKph[r]}</td>
                  {grid.cells[r].map((dp, c) => (
                    <td key={c} className="px-3 py-2 text-right font-mono text-slate-800">
                      {dp.toFixed(2)} W
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
