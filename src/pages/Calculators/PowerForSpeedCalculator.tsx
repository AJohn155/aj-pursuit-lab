// Power-for-speed calculator (SPEC §5.8): P(v) per CdA, flat-equation vs full-track-model
// toggle, rendered as the owner's spreadsheet-style graded color grid. 2026-07 item 8:
// every input persists in localStorage (with a Reset button), and each speed row can show
// its 250 m lap time and 4 km race time (self-entered start lap), toggleable.

import { useEffect, useState } from 'react'
import { effectiveCrr, makeTrack } from '../../engine/index'
import { KPH_TO_MS, powerForSpeedFlat, powerForSpeedTrack } from '../../engine/calculators'
import type { Settings, Venue } from '../../store/types'
import { heatColor, heatT } from './heat'
import { formatMinSec } from './schedule'

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
const STORAGE_KEY = 'pursuitlab.powerForSpeed.v1'

interface PfsState {
  cdaList: string
  rho: string
  mass: string
  crr: string
  eta: string
  speedMin: string
  speedMax: string
  speedStep: string
  mode: 'flat' | 'track'
  venueId: string
  showLapTime: boolean
  show4kTime: boolean
  startLap: string
}

function defaults(settings: Settings): PfsState {
  return {
    cdaList: '0.212, 0.196, 0.190, 0.184, 0.178, 0.172, 0.166, 0.160',
    rho: String(settings.referenceAirDensity),
    mass: String(settings.systemMassKg),
    crr: String(settings.tyreCrr),
    eta: String(settings.mechEfficiency),
    speedMin: '53',
    speedMax: '70',
    speedStep: '0.5',
    mode: 'flat',
    venueId: '',
    showLapTime: false,
    show4kTime: false,
    startLap: '21',
  }
}

function loadState(settings: Settings): PfsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaults(settings), ...(JSON.parse(raw) as Partial<PfsState>) }
  } catch {
    // corrupted storage → fall through to defaults
  }
  return defaults(settings)
}

export default function PowerForSpeedCalculator({ settings, venues }: { settings: Settings; venues: Venue[] }) {
  const [state, setState] = useState<PfsState>(() => loadState(settings))

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // storage full/unavailable — persistence is best-effort
    }
  }, [state])

  const set = <K extends keyof PfsState>(key: K, value: PfsState[K]) => setState((s) => ({ ...s, [key]: value }))

  const cdaList = state.cdaList
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)
  const rho = Number(state.rho)
  const massKg = Number(state.mass)
  const crr = Number(state.crr)
  const eta = Number(state.eta)
  const venue = venues.find((v) => v.id === state.venueId) ?? venues[0]
  const track = venue ? makeTrack(venue.lapLengthM, venue.bendRadiusM) : null
  const crrEff = effectiveCrr(crr, venue?.surfaceFactor ?? 1)
  const startLapS = Number(state.startLap)

  const speedMin = Number(state.speedMin)
  const speedMax = Number(state.speedMax)
  const speedStep = Number(state.speedStep)
  const speedsKph: number[] = []
  if (Number.isFinite(speedMin) && Number.isFinite(speedMax) && speedStep > 0.01) {
    for (let v = speedMin; v <= speedMax + 1e-9 && speedsKph.length < 200; v += speedStep) speedsKph.push(v)
  }

  const valid =
    Number.isFinite(rho) && rho > 0 && Number.isFinite(massKg) && massKg > 0 && Number.isFinite(crr) && crr > 0 &&
    Number.isFinite(eta) && eta > 0 && eta <= 1 && cdaList.length > 0 && speedsKph.length > 0

  const powerAt = (kph: number, cda: number): number => {
    const vMs = kph * KPH_TO_MS
    return state.mode === 'flat' || !track
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
          <input value={state.cdaList} onChange={(e) => set('cdaList', e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Air density ρ (kg/m³)</span>
          <input type="number" step="0.001" value={state.rho} onChange={(e) => set('rho', e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">System mass (kg)</span>
          <input type="number" step="0.1" value={state.mass} onChange={(e) => set('mass', e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Crr</span>
          <input type="number" step="0.0001" value={state.crr} onChange={(e) => set('crr', e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Mech. efficiency</span>
          <input type="number" step="0.01" value={state.eta} onChange={(e) => set('eta', e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Speed range (km/h)</span>
          <div className="mt-1 flex gap-1">
            <input type="number" step="0.5" value={state.speedMin} onChange={(e) => set('speedMin', e.target.value)} className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
            <input type="number" step="0.5" value={state.speedMax} onChange={(e) => set('speedMax', e.target.value)} className="block w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Step (km/h)</span>
          <input type="number" step="0.1" value={state.speedStep} onChange={(e) => set('speedStep', e.target.value)} className={inputClass} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <fieldset className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <label className="flex items-center gap-1">
            <input type="radio" checked={state.mode === 'flat'} onChange={() => set('mode', 'flat')} />
            Flat equation
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={state.mode === 'track'} onChange={() => set('mode', 'track')} />
            Full track model
          </label>
          {state.mode === 'track' && (
            <select
              value={venue?.id ?? ''}
              onChange={(e) => set('venueId', e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </fieldset>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={state.showLapTime} onChange={(e) => set('showLapTime', e.target.checked)} />
          250 m lap column
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={state.show4kTime} onChange={(e) => set('show4kTime', e.target.checked)} />
          4 km time column
        </label>
        {state.show4kTime && (
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            Start lap (s)
            <input
              type="number"
              step="0.1"
              value={state.startLap}
              onChange={(e) => set('startLap', e.target.value)}
              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => setState(defaults(settings))}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Reset to defaults
        </button>
      </div>

      {valid && (
        <div className="max-h-[36rem] overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="px-2 py-1.5 text-right font-medium text-slate-600">Speed (km/h)</th>
                {state.showLapTime && <th className="px-2 py-1.5 text-right font-medium text-slate-600">250 m lap</th>}
                {state.show4kTime && <th className="px-2 py-1.5 text-right font-medium text-slate-600">4 km time</th>}
                {cdaList.map((cda, i) => (
                  <th key={i} className="px-2 py-1.5 text-right font-medium text-slate-600">
                    {cda.toFixed(3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {speedsKph.map((kph, r) => {
                const vMs = kph * KPH_TO_MS
                return (
                  <tr key={r}>
                    <td className="border-t border-slate-100 px-2 py-1 text-right font-mono font-medium text-slate-700">
                      {kph.toFixed(1)}
                    </td>
                    {state.showLapTime && (
                      <td className="border-t border-slate-100 bg-blue-50/60 px-2 py-1 text-right font-mono text-slate-700">
                        {(250 / vMs).toFixed(2)}
                      </td>
                    )}
                    {state.show4kTime && (
                      <td className="border-t border-slate-100 bg-orange-50 px-2 py-1 text-right font-mono text-slate-700">
                        {Number.isFinite(startLapS) && startLapS > 0
                          ? formatMinSec(startLapS + 3750 / vMs)
                          : formatMinSec(4000 / vMs)}
                      </td>
                    )}
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Watts to hold each speed at each CdA — green = easier, red = harder. Inputs persist on this
        device; Reset restores the defaults. 4 km time = start lap + remaining 3750 m at that speed.
      </p>
    </div>
  )
}
