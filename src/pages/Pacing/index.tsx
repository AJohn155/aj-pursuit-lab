// Pacing (SPEC §5.6): ghost builder + optimality analysis, both keyed off an environment
// baseline (ride or blank) that supplies CdA/ρ/mass/track — the same baseline concept
// Adjuster uses.

import { useMemo, useState } from 'react'
import { dataStore } from '../../store/DataStore'
import { resolveScenario, resolveScenarioBaseline } from '../../store/scenario'
import type { ResolvedScenario, ScenarioBaseline } from '../../store/scenario'
import { SETTINGS_ID, withSettingsDefaults } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import GhostBuilder from './GhostBuilder'
import OptimalityPanel from './OptimalityPanel'

export default function Pacing() {
  const rides = useCollection(dataStore.rides)
  const venues = useCollection(dataStore.venues)
  const settingsRows = useCollection(dataStore.settings)
  const rawSettings = settingsRows.find((s) => s.id === SETTINGS_ID)
  const settings = rawSettings ? withSettingsDefaults(rawSettings) : undefined

  const [baselineRef, setBaselineRef] = useState<string | 'blank'>('blank')

  const baselineResolution: ScenarioBaseline | { error: string } | null = useMemo(() => {
    if (!settings) return null
    return resolveScenarioBaseline(baselineRef, rides, venues, settings)
  }, [baselineRef, rides, venues, settings])

  const baselineError =
    baselineResolution && typeof baselineResolution === 'object' && 'error' in baselineResolution
      ? baselineResolution.error
      : null
  const baseline: ScenarioBaseline | null =
    baselineResolution && !baselineError ? (baselineResolution as ScenarioBaseline) : null

  const environment: ResolvedScenario | null = useMemo(() => {
    if (!baseline || !settings) return null
    return resolveScenario(baseline, {}, settings, venues)
  }, [baseline, settings, venues])

  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Pacing</h1>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm sm:w-96">
          <span className="font-medium text-slate-700">Environment (CdA / ρ / mass / track source)</span>
          <select
            value={baselineRef}
            onChange={(e) => setBaselineRef(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
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
      </section>

      {baselineError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{baselineError}</div>
      )}

      <GhostBuilder environment={environment} rides={rides} venues={venues} settings={settings} />

      <OptimalityPanel
        resolved={baselineRef !== 'blank' ? environment : null}
        defaultCp={settings.cpW}
        defaultWPrimeJ={settings.wPrimeJ}
      />
    </div>
  )
}
