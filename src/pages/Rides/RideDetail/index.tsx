// Ride detail (SPEC §5.1): traces, lap table, per-lap CdA + trendline, rolling CdA, start
// panel, W′bal curve, speed-vs-position overlay, quality panel. (The accel/decel summary
// was removed on owner request, 2026-07 round 4 item 6.)
//
// The compact `ride.analysis` (§4.15 AnalysisResult) is cached for lists/records; this page
// needs the richer per-second diagnostics (traces, overlay, rolling CdA, W′bal curve) that
// aren't persisted, so it re-derives everything fresh from the stored raw .fit bytes each
// time it loads (§3.3 "recomputed on demand") using CURRENT Settings/Venue. That means a
// setting changed after this ride was saved (e.g. Crr, CP/W′) is reflected here immediately
// — intentional, since "on demand" implies the latest inputs, not what was true at save
// time. The cached summary (and hence the rides list) only updates when the owner
// explicitly clicks "Save recomputed analysis", so an idle view can never silently overwrite
// data mid-sync.

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ENGINE_VERSION } from '../../../engine/constants'
import type { FullRideAnalysis } from '../../../engine/ingest'
import { dataStore } from '../../../store/DataStore'
import { analyzeStoredRide } from '../../../store/analyzeStoredRide'
import { resolveRideDensity } from '../../../store/density'
import { SETTINGS_ID, withSettingsDefaults } from '../../../store/types'
import { useCollection } from '../../../store/useCollection'
import CdaCharts from './CdaCharts'
import EditRidePanel from './EditRidePanel'
import LapTable from './LapTable'
import OverlayChart from './OverlayChart'
import QualityPanel from './QualityPanel'
import RideSummary from './RideSummary'
import StartPanel from './StartPanel'
import Traces from './Traces'
import WBalChart from './WBalChart'

export default function RideDetail() {
  const { id } = useParams<{ id: string }>()
  const rides = useCollection(dataStore.rides)
  const venues = useCollection(dataStore.venues)
  const settingsRows = useCollection(dataStore.settings)
  const settings = settingsRows.find((s) => s.id === SETTINGS_ID)

  const ride = rides.find((r) => r.id === id)
  const venue = ride ? venues.find((v) => v.id === ride.venueId) : undefined

  const analysis = useMemo((): { data: FullRideAnalysis } | { error: string } | null => {
    if (!ride || !venue || !settings) return null
    if (!ride.fitFileB64) return { error: 'No .fit file attached to this ride — nothing to analyze yet.' }
    try {
      return { data: analyzeStoredRide(ride, venue, settings) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [ride, venue, settings])

  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)

  if (!ride) return <p className="text-sm text-slate-500">Loading ride…</p>
  if (!venue) return <p className="text-sm text-red-700">This ride's venue no longer exists.</p>
  if (!settings || !analysis) return <p className="text-sm text-slate-500">Loading…</p>
  if ('error' in analysis) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">{ride.eventName || 'Ride'}</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {analysis.error}
        </div>
        {ride.analysis && <QualityPanel score={ride.analysis.qualityScore} badge="yellow" flags={ride.analysis.qualityFlags} />}
      </div>
    )
  }

  const { data: full } = analysis
  const stale = ride.analysisVersion !== ENGINE_VERSION
  // Rebind narrowed to a plain `Ride` — inside the closure below, TS would otherwise widen
  // the captured `ride` back to `Ride | undefined` since narrowing doesn't cross function
  // boundaries.
  const confirmedRide = ride

  // The physics parameters this ride's analysis actually used (owner request 2026-07
  // round 4, item 7) — per-ride values when present, global defaults otherwise.
  const sDefaults = withSettingsDefaults(settings)
  const density = resolveRideDensity(ride, sDefaults)
  const paramsLine = [
    `ρ ${density.rho.toFixed(4)}${density.densityKnown ? '' : ' (reference default)'}`,
    `mass ${ride.systemMassKg} kg`,
    `Crr ${ride.tyreCrr ?? sDefaults.tyreCrr}${ride.tyreCrr == null ? ' (global)' : ''}`,
    `η ${ride.mechEfficiency ?? sDefaults.mechEfficiency}${ride.mechEfficiency == null ? ' (global)' : ''}`,
    `rollout ${ride.rolloutM ?? sDefaults.rolloutM} m${ride.rolloutM == null ? ' (global)' : ''}`,
    ...(ride.speedSource === 'cadence' ? ['speed from cadence × gear (broken speed channel)'] : []),
  ].join(' · ')

  async function handleSaveRecomputed() {
    await dataStore.rides.put({
      ...confirmedRide,
      analysis: full.analysisResult,
      analysisVersion: ENGINE_VERSION,
      updatedAt: new Date().toISOString(),
    })
    setSaved(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{ride.eventName || 'Ride'}</h1>
          <p className="text-sm text-slate-500">
            {ride.date}
            {ride.startTime ? ` ${ride.startTime}` : ''} · {venue.name} · {ride.round}
          </p>
          <p className="text-xs text-slate-400">{paramsLine}</p>
        </div>
        <div className="flex items-center gap-3">
          {stale && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              Cached analysis is from an older engine version
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {editing ? 'Close edit' : 'Edit details'}
          </button>
          <Link
            to={`/calculators?tab=cadence&chainring=${ride.gear.chainring}&cog=${ride.gear.cog}`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cadence for {ride.gear.chainring}×{ride.gear.cog}
          </Link>
          <button
            type="button"
            onClick={() => void handleSaveRecomputed()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {saved ? 'Saved' : 'Save recomputed analysis'}
          </button>
        </div>
      </div>

      {editing && <EditRidePanel ride={ride} venues={venues} onDone={() => setEditing(false)} />}

      <RideSummary ride={ride} full={full} />
      <Traces t={full.base.timeline.t} v={full.base.timeline.v} p={full.base.timeline.p} cad={full.base.timeline.cad} t0={full.base.detection.t0} />
      <LapTable laps={full.analysisResult.laps} officialSplits={ride.officialSplits} construction={full.base.laps} />
      <CdaCharts laps={full.analysisResult.laps} rolling={full.rolling} />
      <StartPanel startMetrics={full.analysisResult.startMetrics} />
      <WBalChart curve={full.wBalCurve} />
      <OverlayChart overlay={full.overlay} geometry={full.geometry} lapLengthM={venue.lapLengthM} />
      <QualityPanel score={full.quality.score} badge={full.quality.badge} flags={full.quality.flags} />
    </div>
  )
}
