// Baseline selector + override controls (SPEC §5.3): CdA, power or power %, Crr, mass,
// density, venue, gear. Each numeric override field is blank by default (meaning "use the
// baseline value", shown as its placeholder) — typing a value is what makes it an override.
// 2026-07 round 4: the "constant target (W)" power mode is gone (owner item 11 — a pursuit
// always has a start lap, so flat-power-from-standstill answered no real question); a
// selected ride now shows all its baseline values up front (item 10).

import type { ResolvedScenario } from '../../store/scenario'
import { compareRidesNewestFirst } from '../../store/types'
import type { Ride, Venue } from '../../store/types'
import { BADGE_CLASSES, displayPowerExclLap1, qualityBadgeForScore } from '../Rides/format'
import { T } from '../../components/EditableText'

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
const labelClass = 'block text-sm'
const labelTextClass = 'font-medium text-slate-700'

export type PowerMode = 'schedule' | 'startSplit'

export interface OverrideFormState {
  baselineRef: string | 'blank'
  cdaInput: string
  crrInput: string
  massInput: string
  densityInput: string
  venueOverride: string
  chainring: number
  cog: number
  powerMode: PowerMode
  powerScalePct: string
  constantPowerInput: string
  startLapInput: string
}

export interface OverrideFormProps extends OverrideFormState {
  rides: Ride[]
  venues: Venue[]
  baselineSnapshot: ResolvedScenario | null
  onChange: <K extends keyof OverrideFormState>(key: K, value: OverrideFormState[K]) => void
}

export default function OverrideForm(props: OverrideFormProps) {
  const { rides, venues, baselineSnapshot, onChange } = props
  const isBlank = props.baselineRef === 'blank'
  const selectedRide = !isBlank ? rides.find((r) => r.id === props.baselineRef) : undefined

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="text-sm font-semibold text-slate-900" id="adjuster.overrideform.baseline-overrides" d="Baseline &amp; overrides" />

      <label className={labelClass}>
        <span className={labelTextClass}>Baseline</span>
        <select
          value={props.baselineRef}
          onChange={(e) => onChange('baselineRef', e.target.value)}
          className={inputClass}
        >
          <option value="blank">Blank (nominal starting guess)</option>
          {[...rides]
            .sort(compareRidesNewestFirst)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.eventName || 'Untitled ride'} — {r.date}
                {r.startTime ? ` ${r.startTime}` : ''}
              </option>
            ))}
        </select>
        {selectedRide?.analysis && (
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[qualityBadgeForScore(selectedRide.analysis.qualityScore)]}`}
          >
            Quality {Math.round(selectedRide.analysis.qualityScore)}
          </span>
        )}
      </label>

      {selectedRide && baselineSnapshot && (
        <BaselineValues ride={selectedRide} snapshot={baselineSnapshot} />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={labelTextClass}>CdA (m²)</span>
          <input
            type="number"
            step="0.001"
            value={props.cdaInput}
            onChange={(e) => onChange('cdaInput', e.target.value)}
            placeholder={baselineSnapshot ? baselineSnapshot.cdaM2.toFixed(4) : ''}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Crr (tyre, pre-surface-factor)</span>
          <input
            type="number"
            step="0.0001"
            value={props.crrInput}
            onChange={(e) => onChange('crrInput', e.target.value)}
            placeholder="0.0014"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>System mass (kg)</span>
          <input
            type="number"
            step="0.1"
            value={props.massInput}
            onChange={(e) => onChange('massInput', e.target.value)}
            placeholder={baselineSnapshot ? String(baselineSnapshot.params.massKg) : ''}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Air density (kg/m³)</span>
          <input
            type="number"
            step="0.001"
            value={props.densityInput}
            onChange={(e) => onChange('densityInput', e.target.value)}
            placeholder={baselineSnapshot ? baselineSnapshot.rho.toFixed(4) : ''}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Venue</span>
          <select
            value={props.venueOverride}
            onChange={(e) => onChange('venueOverride', e.target.value)}
            className={inputClass}
          >
            <option value="">
              {baselineSnapshot ? `Baseline (${baselineSnapshot.venue.name})` : 'Baseline venue'}
            </option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="grid grid-cols-2 gap-2">
          <label className={labelClass}>
            <span className={labelTextClass}>Chainring</span>
            <input
              type="number"
              value={props.chainring}
              onChange={(e) => onChange('chainring', Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Cog</span>
            <input
              type="number"
              value={props.cog}
              onChange={(e) => onChange('cog', Number(e.target.value))}
              className={inputClass}
            />
          </label>
        </fieldset>
      </div>

      <fieldset className="space-y-2 rounded-lg bg-slate-50 p-3">
        <legend className={labelTextClass}>Power</legend>
        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              disabled={isBlank}
              checked={!isBlank && props.powerMode === 'schedule'}
              onChange={() => onChange('powerMode', 'schedule')}
            />
            Scale real pacing (%)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={isBlank || props.powerMode === 'startSplit'}
              onChange={() => onChange('powerMode', 'startSplit')}
            />
            Start split + settle power
          </label>
        </div>
        {!isBlank && props.powerMode === 'schedule' ? (
          <label className={labelClass}>
            <span className="text-xs text-slate-500">
              % of the ride's real recorded power at every instant (100 = unchanged)
            </span>
            <input
              type="number"
              step="1"
              value={props.powerScalePct}
              onChange={(e) => onChange('powerScalePct', e.target.value)}
              className={inputClass}
            />
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className="text-xs text-slate-500">Expected start lap (s)</span>
              <input
                type="number"
                step="0.1"
                value={props.startLapInput}
                onChange={(e) => onChange('startLapInput', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              <span className="text-xs text-slate-500">Power excluding lap 1 (W) — ridden from at-speed</span>
              <input
                type="number"
                step="1"
                value={props.constantPowerInput}
                onChange={(e) => onChange('constantPowerInput', e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        )}
      </fieldset>
    </section>
  )
}

/**
 * Everything the selected baseline ride brings to the table (owner request 2026-07 round 4,
 * item 10) — the comparison point for each override field as it's changed.
 */
function BaselineValues({ ride, snapshot }: { ride: Ride; snapshot: ResolvedScenario }) {
  const exclLap1 = displayPowerExclLap1(ride.analysis)
  const startLap = ride.officialSplits[0] ?? ride.analysis?.laps[0]?.timeS
  const entries: { label: string; value: string }[] = [
    { label: 'Official time', value: `${ride.officialTimeS.toFixed(3)}s` },
    { label: 'CdA', value: `${snapshot.cdaM2.toFixed(4)} m²` },
    { label: 'Avg power (recorded)', value: `${snapshot.baselineAvgPowerW.toFixed(0)} W` },
    { label: 'Power excl. lap 1', value: exclLap1 != null ? `${exclLap1.toFixed(0)} W` : '—' },
    { label: 'Start lap', value: startLap != null ? `${startLap.toFixed(2)}s` : '—' },
    { label: 'System mass', value: `${snapshot.params.massKg} kg` },
    { label: 'Air density ρ', value: `${snapshot.rho.toFixed(4)} kg/m³` },
    { label: 'Crr (effective)', value: snapshot.params.crrEff.toFixed(5) },
    { label: 'Venue', value: snapshot.venue.name },
    { label: 'Gear', value: `${ride.gear.chainring}×${ride.gear.cog}` },
  ]
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <T as="p" className="mb-2 text-xs font-semibold uppercase text-slate-500" id="adjuster.overrideform.baseline-ride-values" d="Baseline ride values" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        {entries.map((e) => (
          <div key={e.label}>
            <p className="text-xs text-slate-500">{e.label}</p>
            <p className="text-sm font-medium text-slate-800">{e.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
