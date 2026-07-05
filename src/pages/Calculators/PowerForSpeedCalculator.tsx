// Power-for-speed calculator (SPEC §5.8): P(v) per CdA, flat-equation vs full-track-model
// toggle. Rendered as the owner's spreadsheet-style graded color grid (speeds × CdA →
// watts, green = easier, red = harder) with every physics input editable (owner request
// 2026-07 item 17), replacing the earlier line chart.

import { useState } from 'react'
import { effectiveCrr, makeTrack } from '../../engine/index'
import { KPH_TO_MS, powerForSpeedFlat, powerForSpeedTrack } from '../../engine/calculators'
import type { Settings, Venue } from '../../store/types'
import { heatColor, heatT } from './heat'

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'

export default function PowerForSpeedCalculator({ settings, venues }: { settings: Settings; venues: Venue[] }) {
  const [cdaListInput, setCdaListInput] = useState('0.212, 0.196, 0.190, 0.184, 0.178, 0.172, 0.166, 0.160')
  const [rhoInput, setRhoInput] = useState(String(settings.referenceAirDensity))
  const [massInput, setMassInput] = useState(String(settings.systemMassKg))
  const [crrInput, setCrrInput] = useState(String(settings.tyreCrr))
  const [etaInput, setEtaInput] = useState(String(settings.mechEfficiency))
  const [speedMinInput, setSpeedMinInput] = useState('53')
  const [speedMaxInput, setSpeedMaxInput] = useState('70')
  const [speedStepInput, setSpeedStepInput] = useState('0.5')
  const [mode, setMode] = useState<'flat' | 'track'>('flat')
  const [venueId, setVenueId] = useState(venues[0]?.id ?? '')

  const cdaList = cdaListInput
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)
  const rho = Number(rhoInput)
  const massKg = Number(massInput)
  const crr = Number(crrInput)
  const eta = Number(etaInput)
  const venue = venues.find((v) => v.id === venueId) ?? venues[0]
  const track = venue ? makeTrack(venue.lapLengthM, venue.bendRadiusM) : null
  const crrEff = effectiveCrr(crr, venue?.surfaceFactor ?? 1)

  const speedMin = Number(speedMinInput)
  const speedMax = Number(speedMaxInput)
  const speedStep = Number(speedStepInput)
  const speedsKph: number[] = []
  if (Number.isFinite(speedMin) && Number.isFinite(speedMax) && speedStep > 0.01) {
    for (let v = speedMin; v <= speedMax + 1e-9 && speedsKph.length < 200; v += speedStep) speedsKph.push(v)
  }

  const valid =
    Number.isFinite(rho) && rho > 0 && Number.isFinite(massKg) && massKg > 0 && Number.isFinite(crr) && crr > 0 &&
    Number.isFinite(eta) && eta > 0 && eta <= 1 && cdaList.length > 0 && speedsKph.length > 0

  const powerAt = (kph: number, cda: number): number => {
    const vMs = kph * KPH_TO_MS
    return mode === 'flat' || !track
      ? powerForSpeedFlat(vMs, cda, rho, massKg, crr, eta)
      : powerForSpeedTrack(vMs, cda, rho, massKg, crrEff, eta, track)
  }

  const cells = valid ? speedsKph.map((kph) => cdaList.map((cda) => powerAt(kph, cda))) : []
  const flat = cells.flat()
  const min = flat.length > 0 ? Math.min(...flat) : 0
  const max = flat.length > 0 ? Math.max(...flat) : 1

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="col-span-2 block text-sm">
          <span className="font-medium text-slate-700">CdA list (m², comma-separated)</span>
          <input value={cdaListInput} onChange={(e) => setCdaListInput(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Air density ρ (kg/m³)</span>
          <input type="number" step="0.001" value={rhoInput} onChange={(e) => setRhoInput(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">System mass (kg)</span>
          <input type="number" step="0.1" value={massInput} onChange={(e) => setMassInput(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Crr</span>
          <input type="number" step="0.0001" value={crrInput} onChange={(e) => setCrrInput(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Mech. efficiency</span>
          <input type="number" step="0.01" value={etaInput} onChange={(e) => setEtaInput(e.target.value)} className={inputClass} />
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
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Mode</legend>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <label className="flex items-center gap-1">
            <input type="radio" checked={mode === 'flat'} onChange={() => setMode('flat')} />
            Flat equation
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={mode === 'track'} onChange={() => setMode('track')} />
            Full track model
          </label>
          {mode === 'track' && (
            <select
              value={venue?.id ?? ''}
              onChange={(e) => setVenueId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </fieldset>

      {valid && (
        <div className="max-h-[36rem] overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="px-2 py-1.5 text-right font-medium text-slate-600">Speed (km/h)</th>
                {cdaList.map((cda, i) => (
                  <th key={i} className="px-2 py-1.5 text-right font-medium text-slate-600">
                    {cda.toFixed(3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {speedsKph.map((kph, r) => (
                <tr key={r}>
                  <td className="border-t border-slate-100 px-2 py-1 text-right font-mono font-medium text-slate-700">
                    {kph.toFixed(1)}
                  </td>
                  {cells[r].map((w, c) => (
                    <td
                      key={c}
                      className="border-t border-white px-2 py-1 text-right font-mono text-slate-900"
                      style={{ backgroundColor: heatColor(heatT(w, min, max)) }}
                    >
                      {w.toFixed(1)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Watts to hold each speed at each CdA — green = easier, red = harder. Flat equation: P = (½·CdA·ρ·v³ +
        m·g·Crr·v)/η; full track model adds the corner-weighted rolling term for the chosen venue.
      </p>
    </div>
  )
}
