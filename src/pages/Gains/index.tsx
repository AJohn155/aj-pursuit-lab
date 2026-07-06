// Gains (SPEC §5.5): baseline ride/scenario selector, tornado chart + table of the five
// fixed perturbations, unit toggle, and the isochrone chart with rides plotted as points.

import { useMemo, useState } from 'react'
import { analyzeStoredRide } from '../../store/analyzeStoredRide'
import { resolveScenario, resolveScenarioBaseline } from '../../store/scenario'
import type { ResolvedScenario } from '../../store/scenario'
import { dataStore } from '../../store/DataStore'
import { SETTINGS_ID, withSettingsDefaults } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import { BADGE_CLASSES, displayAvgPower, qualityBadgeForScore } from '../Rides/format'
import { buildIsochroneGrid, computeGainsRows } from './gains'
import type { RidePoint } from './gains'
import IsochroneChart from './IsochroneChart'
import TornadoChart from './TornadoChart'

export default function Gains({ embedded = false }: { embedded?: boolean }) {
  const rides = useCollection(dataStore.rides)
  const venues = useCollection(dataStore.venues)
  const scenarios = useCollection(dataStore.scenarios)
  const settingsRows = useCollection(dataStore.settings)
  const rawSettings = settingsRows.find((s) => s.id === SETTINGS_ID)

  const [baselineKey, setBaselineKey] = useState('')
  const [unit, setUnit] = useState<'seconds' | 'watts'>('seconds')

  const settings = rawSettings ? withSettingsDefaults(rawSettings) : undefined

  const { baseline, error } = useMemo((): { baseline: ResolvedScenario | null; error: string | null } => {
    if (!settings || !baselineKey) return { baseline: null, error: null }
    const [kind, id] = baselineKey.split(/:(.+)/)
    if (kind === 'ride') {
      const ride = rides.find((r) => r.id === id)
      const venue = ride && venues.find((v) => v.id === ride.venueId)
      if (!ride || !venue) return { baseline: null, error: 'Ride or venue not found.' }
      if (!ride.fitFileB64) return { baseline: null, error: 'This ride has no .fit file to analyze.' }
      try {
        const full = analyzeStoredRide(ride, venue, settings)
        return { baseline: resolveScenario({ ride, venue, full }, {}, settings, venues), error: null }
      } catch (e) {
        return { baseline: null, error: e instanceof Error ? e.message : String(e) }
      }
    }
    if (kind === 'scenario') {
      const scenario = scenarios.find((s) => s.id === id)
      if (!scenario) return { baseline: null, error: 'Scenario not found.' }
      const resolvedBase = resolveScenarioBaseline(scenario.baseline, rides, venues, settings)
      if (typeof resolvedBase === 'object' && resolvedBase !== null && 'error' in resolvedBase) {
        return { baseline: null, error: resolvedBase.error }
      }
      return { baseline: resolveScenario(resolvedBase, scenario.overrides, settings, venues), error: null }
    }
    return { baseline: null, error: null }
  }, [baselineKey, rides, venues, scenarios, settings])

  const rows = useMemo(() => (baseline ? computeGainsRows(baseline) : []), [baseline])

  const ridePoints: RidePoint[] = useMemo(
    () =>
      rides
        .filter((r) => r.analysis)
        .map((r) => {
          const avgPowerW = displayAvgPower(r.analysis!)
          return avgPowerW != null ? { label: r.eventName || r.date, cdaM2: r.analysis!.cdaRace, avgPowerW } : null
        })
        .filter((p): p is RidePoint => p != null),
    [rides],
  )

  const grid = useMemo(() => (baseline ? buildIsochroneGrid(baseline, ridePoints) : null), [baseline, ridePoints])

  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      {!embedded && <h1 className="text-2xl font-semibold text-slate-900">Gains</h1>}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Baseline (ride or pinned scenario)</span>
          <select
            value={baselineKey}
            onChange={(e) => setBaselineKey(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm sm:w-96"
          >
            <option value="">Choose a baseline…</option>
            <optgroup label="Rides">
              {[...rides]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((r) => (
                  <option key={r.id} value={`ride:${r.id}`}>
                    {r.eventName || 'Untitled ride'} — {r.date}
                  </option>
                ))}
            </optgroup>
            {scenarios.some((s) => s.pinned) && (
              <optgroup label="Pinned scenarios">
                {scenarios
                  .filter((s) => s.pinned)
                  .map((s) => (
                    <option key={s.id} value={`scenario:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
          {baselineKey.startsWith('ride:') &&
            (() => {
              const r = rides.find((x) => `ride:${x.id}` === baselineKey)
              return r?.analysis ? (
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[qualityBadgeForScore(r.analysis.qualityScore)]}`}
                >
                  Quality {Math.round(r.analysis.qualityScore)}
                </span>
              ) : null
            })()}
        </label>
      </section>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {!baselineKey && !error && (
        <p className="text-sm text-slate-500">
          Pick a baseline above to see the marginal-gains tornado chart and isochrone grid.
        </p>
      )}

      {baseline && rows.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-700">Units:</span>
            <button
              type="button"
              onClick={() => setUnit('seconds')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${unit === 'seconds' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              Seconds
            </button>
            <button
              type="button"
              onClick={() => setUnit('watts')}
              className={`rounded-full px-3 py-1 text-xs font-medium ${unit === 'watts' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              Watts-equivalent
            </button>
          </div>
          <TornadoChart rows={rows} unit={unit} />
          {grid && <IsochroneChart grid={grid} ridePoints={ridePoints} />}
        </>
      )}
    </div>
  )
}
