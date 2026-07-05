// Power-for-speed calculator (SPEC §5.8): interactive P(v) per CdA list; flat-equation vs
// full-track-model mode toggle.

import { useState } from 'react'
import Chart from '../../components/Chart'
import { effectiveCrr, makeTrack } from '../../engine/index'
import { KPH_TO_MS, powerForSpeedFlat, powerForSpeedTrack } from '../../engine/calculators'
import type { Settings, Venue } from '../../store/types'

const CDA_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706']
const SPEED_RANGE_KPH = { min: 40, max: 70, step: 1 }

export default function PowerForSpeedCalculator({ settings, venues }: { settings: Settings; venues: Venue[] }) {
  const [cdaListInput, setCdaListInput] = useState('0.17, 0.19, 0.21, 0.23')
  const [rhoInput, setRhoInput] = useState(String(settings.referenceAirDensity))
  const [massInput, setMassInput] = useState(String(settings.systemMassKg))
  const [mode, setMode] = useState<'flat' | 'track'>('flat')
  const [venueId, setVenueId] = useState(venues[0]?.id ?? '')

  const cdaList = cdaListInput
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)
  const rho = Number(rhoInput)
  const massKg = Number(massInput)
  const venue = venues.find((v) => v.id === venueId) ?? venues[0]
  const track = venue ? makeTrack(venue.lapLengthM, venue.bendRadiusM) : null
  const crrEff = effectiveCrr(settings.tyreCrr, venue?.surfaceFactor ?? 1)

  const speedsKph: number[] = []
  for (let v = SPEED_RANGE_KPH.min; v <= SPEED_RANGE_KPH.max; v += SPEED_RANGE_KPH.step) speedsKph.push(v)

  const valid = Number.isFinite(rho) && rho > 0 && Number.isFinite(massKg) && massKg > 0 && cdaList.length > 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">CdA list (m², comma-separated)</span>
          <input
            value={cdaListInput}
            onChange={(e) => setCdaListInput(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
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
          <span className="font-medium text-slate-700">System mass (kg)</span>
          <input
            type="number"
            step="0.1"
            value={massInput}
            onChange={(e) => setMassInput(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
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
        <Chart
          ariaLabel="Power required versus speed, one line per CdA"
          data={cdaList.map((cda, i) => ({
            type: 'scatter',
            mode: 'lines',
            x: speedsKph,
            y: speedsKph.map((kph) => {
              const vMs = kph * KPH_TO_MS
              return mode === 'flat' || !track
                ? powerForSpeedFlat(vMs, cda, rho, massKg, settings.tyreCrr, settings.mechEfficiency)
                : powerForSpeedTrack(vMs, cda, rho, massKg, crrEff, settings.mechEfficiency, track)
            }),
            name: `CdA ${cda.toFixed(3)}`,
            line: { color: CDA_COLORS[i % CDA_COLORS.length], width: 2 },
          }))}
          layout={{ xaxis: { title: { text: 'Speed (km/h)' } }, yaxis: { title: { text: 'Power (W)' } } }}
        />
      )}
    </div>
  )
}
