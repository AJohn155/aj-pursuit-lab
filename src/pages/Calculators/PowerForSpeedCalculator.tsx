// Power-for-speed calculator (SPEC §5.8): P(v) per CdA, flat-equation vs full-track-model
// toggle, rendered as the owner's spreadsheet-style graded color grid. 2026-07 item 8:
// every input persists in localStorage (with a Reset button), and each speed row can show
// its 250 m lap time and race time (self-entered start lap), toggleable. 2026-07 round 4
// items 1–2: the race-time distance is editable (like the Watts-saved calculator), a
// W/CdA column (watts per m² of CdA at a reference CdA — the owner's 2000–3000 benchmark
// metric) can be toggled on, and the heat gradient's center point is adjustable below the
// table.

import { useEffect, useState } from 'react'
import { effectiveCrr, makeTrack } from '../../engine/index'
import { KPH_TO_MS, powerForSpeedFlat, powerForSpeedTrack } from '../../engine/calculators'
import type { Settings, Venue } from '../../store/types'
import { heatColor, heatT } from './heat'
import { formatMinSec } from './schedule'
import { T } from '../../components/EditableText'

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
const STORAGE_KEY = 'pursuitlab.powerForSpeed.v1'
const LAP_M = 250

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
  raceDistance: string
  showWPerCda: boolean
  wPerCdaRef: string
  gradientCenter: string
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
    raceDistance: '4000',
    showWPerCda: false,
    wPerCdaRef: '0.190',
    gradientCenter: '',
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

/**
 * heatT with a movable center: values at `center` map to 0.5 (the gradient's yellow),
 * below-center compresses into [0, 0.5] against min, above-center into [0.5, 1] against
 * max. Falls back to plain min/max mapping when the center isn't inside (min, max).
 */
function heatTCentered(value: number, min: number, max: number, center: number | null): number {
  if (center == null || !(center > min && center < max)) return heatT(value, min, max)
  return value <= center ? 0.5 * ((value - min) / (center - min)) : 0.5 + 0.5 * ((value - center) / (max - center))
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
  const raceDistanceM = Number(state.raceDistance)
  const raceDistanceValid = Number.isFinite(raceDistanceM) && raceDistanceM > LAP_M
  const wPerCdaRef = Number(state.wPerCdaRef)
  const wPerCdaRefValid = Number.isFinite(wPerCdaRef) && wPerCdaRef > 0

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
  const centerRaw = Number(state.gradientCenter)
  const gradientCenter = state.gradientCenter.trim() !== '' && Number.isFinite(centerRaw) ? centerRaw : null

  const raceDistLabel = raceDistanceValid
    ? raceDistanceM % 1000 === 0
      ? `${raceDistanceM / 1000} km`
      : `${raceDistanceM} m`
    : 'Race'

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
          Race time column
        </label>
        {state.show4kTime && (
          <>
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              Distance (m)
              <input
                type="number"
                step="250"
                value={state.raceDistance}
                onChange={(e) => set('raceDistance', e.target.value)}
                className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
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
          </>
        )}
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={state.showWPerCda} onChange={(e) => set('showWPerCda', e.target.checked)} />
          W/CdA column
        </label>
        {state.showWPerCda && (
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            at CdA (m²)
            <input
              type="number"
              step="0.001"
              value={state.wPerCdaRef}
              onChange={(e) => set('wPerCdaRef', e.target.value)}
              className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
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
                {state.show4kTime && (
                  <th className="px-2 py-1.5 text-right font-medium text-slate-600">{raceDistLabel} time</th>
                )}
                {state.showWPerCda && <th className="px-2 py-1.5 text-right font-medium text-slate-600">W/CdA</th>}
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
                const usesStartLap = Number.isFinite(startLapS) && startLapS > 0
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
                        {!raceDistanceValid
                          ? '—'
                          : usesStartLap
                            ? formatMinSec(startLapS + (raceDistanceM - LAP_M) / vMs)
                            : formatMinSec(raceDistanceM / vMs)}
                      </td>
                    )}
                    {state.showWPerCda && (
                      <td className="border-t border-slate-100 bg-violet-50 px-2 py-1 text-right font-mono text-slate-700">
                        {wPerCdaRefValid ? (powerAt(kph, wPerCdaRef) / wPerCdaRef).toFixed(0) : '—'}
                      </td>
                    )}
                    {cells[r].map((w, c) => (
                      <td
                        key={c}
                        className="border-t border-white px-2 py-1 text-right font-mono text-slate-900"
                        style={{ backgroundColor: heatColor(heatTCentered(w, min, max, gradientCenter)) }}
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
      {valid && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            Gradient center (W)
            <input
              type="number"
              step="5"
              value={state.gradientCenter}
              onChange={(e) => set('gradientCenter', e.target.value)}
              placeholder={`auto (${((min + max) / 2).toFixed(0)})`}
              className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <span className="text-xs text-slate-400">
            The wattage that maps to the gradient's yellow midpoint — blank centers it between the grid's min and max.
          </span>
        </div>
      )}
      <T as="p" className="text-xs text-slate-500" id="calculators.powerforspeedcalculator.watts-to-hold-each-speed" d="Watts to hold each speed at each CdA — green = easier, red = harder. Inputs persist on this device; Reset restores the defaults. Race time = start lap + remaining distance at that speed (start lap covers the first 250 m). W/CdA = required power at the reference CdA divided by that CdA — the owner's watts-per-aero benchmark, typically 2000–3000." />
    </div>
  )
}
