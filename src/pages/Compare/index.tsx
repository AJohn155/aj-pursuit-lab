// Compare (SPEC §5.2): pick 2+ rides, compare gap/lap-split/CdA/W′bal/speed-position charts,
// plus a progression view of any metric vs date across all rides.
//
// Pinned scenarios (SPEC §3.4/§5.2 "and/or pinned scenarios") aren't selectable here yet —
// Scenario CRUD is P6 (Adjuster), so no scenario can exist with a `result` to compare
// against. Selection is rides-only until that lands; the ride-only shape below (CompareItem)
// doesn't preclude adding scenario-derived items later.

import { useMemo, useState } from 'react'
import { dataStore } from '../../store/DataStore'
import { analyzeStoredRide } from '../../store/analyzeStoredRide'
import { SETTINGS_ID } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import CdaOverlayChart from './CdaOverlayChart'
import { colorFor, type CompareItem } from './compare'
import GapChart from './GapChart'
import LapSplitChart from './LapSplitChart'
import Progression from './Progression'
import RideSelector from './RideSelector'
import SpeedPositionOverlayChart from './SpeedPositionOverlayChart'
import WBalOverlayChart from './WBalOverlayChart'

export default function Compare() {
  const rides = useCollection(dataStore.rides)
  const venues = useCollection(dataStore.venues)
  const settingsRows = useCollection(dataStore.settings)
  const settings = settingsRows.find((s) => s.id === SETTINGS_ID)

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const { items, errors } = useMemo(() => {
    const items: CompareItem[] = []
    const errors: string[] = []
    if (!settings) return { items, errors }
    selectedIds.forEach((id, i) => {
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
          id: ride.id,
          label: `${ride.eventName || 'Untitled ride'} (${ride.date})`,
          color: colorFor(i),
          full,
        })
      } catch (e) {
        errors.push(`${ride.eventName || 'Ride'}: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
    return { items, errors }
  }, [selectedIds, rides, venues, settings])

  const firstVenue = items.length > 0 ? venues.find((v) => v.id === rides.find((r) => r.id === items[0].id)?.venueId) : undefined

  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Compare</h1>

      {rides.length === 0 ? (
        <p className="text-sm text-slate-500">No rides yet — upload rides on the Rides tab first.</p>
      ) : (
        <>
          <RideSelector rides={rides} venues={venues} selectedIds={selectedIds} onChange={setSelectedIds} />

          {errors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          )}

          {items.length < 2 ? (
            <p className="text-sm text-slate-500">Select at least 2 analyzable rides to see comparison charts.</p>
          ) : (
            <>
              <GapChart items={items} />
              <LapSplitChart items={items} />
              <CdaOverlayChart items={items} />
              <WBalOverlayChart items={items} />
              <SpeedPositionOverlayChart items={items} lapLengthM={firstVenue?.lapLengthM ?? 250} />
            </>
          )}
        </>
      )}

      <Progression rides={rides} venues={venues} rawSettings={settings} />
    </div>
  )
}
