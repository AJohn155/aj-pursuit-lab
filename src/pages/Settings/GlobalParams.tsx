import { useState } from 'react'
import { dataStore } from '../../store/DataStore'
import { DEFAULT_SETTINGS_VALUES, SETTINGS_ID, withSettingsDefaults, type Settings } from '../../store/types'
import { useCollection } from '../../store/useCollection'

const FIELDS: {
  key: keyof typeof DEFAULT_SETTINGS_VALUES
  label: string
  provenance: string
  step: string
}[] = [
  {
    key: 'rolloutM',
    label: 'Rollout (m)',
    provenance: 'Wheel circumference, meters. One canonical value.',
    step: '0.001',
  },
  {
    key: 'systemMassKg',
    label: 'System mass (kg)',
    provenance: 'Rider + bike + kit default.',
    step: '0.1',
  },
  {
    key: 'tyreCrr',
    label: 'Tyre Crr',
    provenance: 'Drum-measured, Vittoria Pista Speed @ ~110 psi.',
    step: '0.0001',
  },
  {
    key: 'mechEfficiency',
    label: 'Mechanical efficiency',
    provenance: 'Drivetrain efficiency (η) used in energy-balance and simulation.',
    step: '0.001',
  },
  {
    key: 'comHeightM',
    label: 'COM height (m)',
    provenance: 'Rider center-of-mass height above track when upright (for lean geometry).',
    step: '0.01',
  },
  {
    key: 'rotatingMassEqKg',
    label: 'Rotating mass eq. (kg)',
    provenance: 'Added to mass for KE/acceleration terms only.',
    step: '0.1',
  },
  {
    key: 'referenceAirDensity',
    label: 'Reference air density',
    provenance: "Matches the owner's historical normalization convention.",
    step: '0.001',
  },
  {
    key: 'cpW',
    label: 'Critical power (W)',
    provenance:
      'A real fit (§4.13) needs power-duration points at several different lengths; with only ~4 min pursuit efforts on file, set this manually until mixed-duration history exists.',
    step: '1',
  },
  {
    key: 'wPrimeJ',
    label: "W′ (J)",
    provenance: 'Anaerobic work capacity above CP. Same manual-until-fittable caveat as CP.',
    step: '500',
  },
]

export default function GlobalParams() {
  const rows = useCollection(dataStore.settings)
  const settings = rows.find((s) => s.id === SETTINGS_ID)

  if (!settings) {
    return <p className="text-sm text-slate-500">Loading settings…</p>
  }

  // Keying by updatedAt remounts the form (resetting the draft) whenever the
  // authoritative doc changes underneath it — e.g. an incoming sync from
  // another device — without syncing state via an effect. withSettingsDefaults
  // backfills fields added after this doc was created (see store/types.ts).
  return <GlobalParamsForm key={settings.updatedAt} settings={withSettingsDefaults(settings)} />
}

function GlobalParamsForm({ settings }: { settings: Settings }) {
  const [draft, setDraft] = useState<Settings>(settings)

  function handleChange(key: keyof typeof DEFAULT_SETTINGS_VALUES, value: string) {
    const num = Number(value)
    setDraft((prev) => (prev ? { ...prev, [key]: Number.isNaN(num) ? 0 : num } : prev))
  }

  async function handleBlur() {
    if (!draft) return
    await dataStore.settings.put({ ...draft, updatedAt: new Date().toISOString() })
  }

  return (
    <section className="rounded-lg border border-slate-200 p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Global parameters</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-sm">
            <span className="font-medium text-slate-700">{f.label}</span>
            <input
              type="number"
              step={f.step}
              value={draft[f.key]}
              onChange={(e) => handleChange(f.key, e.target.value)}
              onBlur={handleBlur}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
            />
            <span className="mt-0.5 block text-xs text-slate-500">{f.provenance}</span>
          </label>
        ))}
      </div>
    </section>
  )
}
