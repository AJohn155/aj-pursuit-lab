// Baseline selector + override controls (SPEC §5.3): CdA, power or power %, Crr, mass,
// density, venue, gear. Each numeric override field is blank by default (meaning "use the
// baseline value", shown as its placeholder) — typing a value is what makes it an override.

import type { ResolvedScenario } from '../../store/scenario'
import type { Ride, Venue } from '../../store/types'

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
const labelClass = 'block text-sm'
const labelTextClass = 'font-medium text-slate-700'

export type PowerMode = 'schedule' | 'constant'

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

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Baseline &amp; overrides</h2>

      <label className={labelClass}>
        <span className={labelTextClass}>Baseline</span>
        <select
          value={props.baselineRef}
          onChange={(e) => onChange('baselineRef', e.target.value)}
          className={inputClass}
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
              checked={props.powerMode === 'schedule'}
              onChange={() => onChange('powerMode', 'schedule')}
            />
            Scale real pacing (%)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={isBlank || props.powerMode === 'constant'}
              onChange={() => onChange('powerMode', 'constant')}
            />
            Constant target (W)
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
          <label className={labelClass}>
            <span className="text-xs text-slate-500">
              {baselineSnapshot ? `Baseline avg ≈ ${baselineSnapshot.baselineAvgPowerW.toFixed(0)} W` : 'Flat power target'}
            </span>
            <input
              type="number"
              step="1"
              value={props.constantPowerInput}
              onChange={(e) => onChange('constantPowerInput', e.target.value)}
              className={inputClass}
            />
          </label>
        )}
      </fieldset>
    </section>
  )
}
