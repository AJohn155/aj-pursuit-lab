// Compare (SPEC §5.2): pick 2+ rides and/or pinned scenarios, compare
// gap/lap-split/CdA/W′bal/speed-position charts, plus a progression view of any metric vs
// date across all rides.

import { useMemo, useState } from 'react'
import { dataStore } from '../../store/DataStore'
import { analyzeStoredRide } from '../../store/analyzeStoredRide'
import { resolveScenario, resolveScenarioBaseline, runScenario, scenarioToFullAnalysis } from '../../store/scenario'
import { SETTINGS_ID, withSettingsDefaults } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import CdaOverlayChart from './CdaOverlayChart'
import { colorFor, type CompareItem } from './compare'
import GapChart from './GapChart'
import LapSplitChart from './LapSplitChart'
import PinnedScenarioSelector from './PinnedScenarioSelector'
import Progression from './Progression'
import RideSelector from './RideSelector'
import SpeedPositionOverlayChart from './SpeedPositionOverlayChart'
import WBalOverlayChart from './WBalOverlayChart'

export default function Compare() {
  const rides = useCollection(dataStore.rides)
  const venues = useCollection(dataStore.venues)
  const scenarios = useCollection(dataStore.scenarios)
  const settingsRows = useCollection(dataStore.settings)
  const rawSettings = settingsRows.find((s) => s.id === SETTINGS_ID)

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const { items, errors } = useMemo(() => {
    const items: CompareItem[] = []
    const errors: string[] = []
    if (!rawSettings) return { items, errors }
    const settings = withSettingsDefaults(rawSettings)

    selectedIds.forEach((key, i) => {
      const [kind, id] = key.split(/:(.+)/)

      if (kind === 'ride') {
        const ride = rides.find((r) => r.id === id)
        if (!ride) return
        const venue = venues.find((v) => v.id === ride.venueId)
        if (!venue) {
          errors.push(`${ride.eventName || 'Ride'}: venue no longer exists.`)
          return
        }
        if (!ride.fitFileB64) {
          errors.push(`${ride.eventName || 'Ride'}: no .fit file attached — nothing to chart.`)
          return
        }
        try {
          const full = analyzeStoredRide(ride, venue, settings)
          items.push({
            id: key,
            label: `${ride.eventName || 'Untitled ride'} (${ride.date})`,
            color: colorFor(i),
            full,
            lapLengthM: venue.lapLengthM,
            officialSplits: ride.officialSplits,
          })
        } catch (e) {
          errors.push(`${ride.eventName || 'Ride'}: ${e instanceof Error ? e.message : String(e)}`)
        }
        return
      }

      if (kind === 'scenario') {
        const scenario = scenarios.find((s) => s.id === id)
        if (!scenario) return
        const baseline = resolveScenarioBaseline(scenario.baseline, rides, venues, settings)
        // `baseline` can be the string 'blank' — `in` throws on a primitive, so check
        // for the error object shape first.
        if (typeof baseline === 'object' && baseline !== null && 'error' in baseline) {
          errors.push(`${scenario.name}: ${baseline.error}`)
          return
        }
        try {
          const resolved = resolveScenario(baseline, scenario.overrides, settings, venues)
          const run = runScenario(resolved)
          const full = scenarioToFullAnalysis(run, resolved, { cp: settings.cpW, wPrimeJ: settings.wPrimeJ })
          items.push({
            id: key,
            label: `${scenario.name} (scenario)`,
            color: colorFor(i),
            full,
            lapLengthM: resolved.track.lapLengthM,
          })
        } catch (e) {
          errors.push(`${scenario.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    })
    return { items, errors }
  }, [selectedIds, rides, venues, scenarios, rawSettings])

  if (!rawSettings) return <p className="text-sm text-slate-500">Loading…</p>
  const settings = withSettingsDefaults(rawSettings)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Compare</h1>

      {rides.length === 0 ? (
        <p className="text-sm text-slate-500">No rides yet — upload rides on the Rides tab first.</p>
      ) : (
        <>
          <RideSelector rides={rides} venues={venues} selectedIds={selectedIds} onChange={setSelectedIds} />
          <PinnedScenarioSelector scenarios={scenarios} selectedIds={selectedIds} onChange={setSelectedIds} />

          {errors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          )}

          {items.length < 2 ? (
            <p className="text-sm text-slate-500">Select at least 2 analyzable rides or pinned scenarios to see comparison charts.</p>
          ) : (
            <>
              <GapChart items={items} />
              <LapSplitChart items={items} />
              <CdaOverlayChart items={items} />
              <WBalOverlayChart items={items} />
              <SpeedPositionOverlayChart items={items} lapLengthM={items[0]?.lapLengthM ?? 250} />
            </>
          )}
        </>
      )}

      <Progression rides={rides} venues={venues} rawSettings={settings} />
    </div>
  )
}
