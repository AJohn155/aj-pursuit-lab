// Ghost builder (SPEC §5.6): target time → schedule (even or owner-shaped template) →
// overlay vs any ride.

import { useMemo, useState } from 'react'
import Chart from '../../components/Chart'
import { analyzeStoredRide } from '../../store/analyzeStoredRide'
import type { ResolvedScenario } from '../../store/scenario'
import type { Ride, Settings, Venue } from '../../store/types'
import { buildDistanceTimeSeries, gapCharts } from '../Compare/compare'
import { ghostDistanceTimeSeries, solveGhostSchedule } from './pacing'
import type { GhostSchedule, GhostScheduleKind } from './pacing'

export default function GhostBuilder({
  environment,
  rides,
  venues,
  settings,
}: {
  environment: ResolvedScenario | null
  rides: Ride[]
  venues: Venue[]
  settings: Settings
}) {
  const [targetTimeInput, setTargetTimeInput] = useState('245')
  const [kind, setKind] = useState<GhostScheduleKind>('startSplit')
  const [startLapInput, setStartLapInput] = useState('21.5')
  const [overlayRideId, setOverlayRideId] = useState('')

  const targetTimeS = Number(targetTimeInput)
  const startLapS = Number(startLapInput)

  const { schedule, error }: { schedule: GhostSchedule | null; error: string | null } = useMemo(() => {
    if (!environment || !Number.isFinite(targetTimeS) || targetTimeS <= 0) return { schedule: null, error: null }
    if (kind === 'startSplit' && (!Number.isFinite(startLapS) || startLapS <= 0)) return { schedule: null, error: null }
    try {
      return {
        schedule: solveGhostSchedule(
          kind,
          targetTimeS,
          {
            cdaM2: environment.cdaM2,
            rho: environment.rho,
            params: environment.params,
            track: environment.track,
          },
          undefined,
          startLapS,
        ),
        error: null,
      }
    } catch (e) {
      return { schedule: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [environment, targetTimeS, kind, startLapS])

  const overlayRide = rides.find((r) => r.id === overlayRideId) ?? null

  const overlaySeries = useMemo(() => {
    if (!overlayRide || !overlayRide.fitFileB64 || !schedule) return null
    const rideVenue = venues.find((v) => v.id === overlayRide.venueId)
    if (!rideVenue) return null
    try {
      const full = analyzeStoredRide(overlayRide, rideVenue, settings)
      return buildDistanceTimeSeries(full, {
        officialSplits: overlayRide.officialSplits,
        lapLengthM: rideVenue.lapLengthM,
      })
    } catch {
      return null
    }
  }, [overlayRide, schedule, venues, settings])

  const ghostSeries = schedule ? ghostDistanceTimeSeries(schedule) : null
  const gaps = ghostSeries && overlaySeries ? gapCharts([ghostSeries, overlaySeries]) : null

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Ghost builder</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Target time (s)</span>
          <input
            type="number"
            step="0.1"
            value={targetTimeInput}
            onChange={(e) => setTargetTimeInput(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Schedule</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as GhostScheduleKind)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="startSplit">Start split + settle power</option>
            <option value="template">Owner-shaped start ramp</option>
            <option value="even">Even (flat power)</option>
          </select>
        </label>
        {kind === 'startSplit' && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Expected start lap (s)</span>
            <input
              type="number"
              step="0.1"
              value={startLapInput}
              onChange={(e) => setStartLapInput(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Overlay vs ride</span>
          <select
            value={overlayRideId}
            onChange={(e) => setOverlayRideId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">None</option>
            {[...rides]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.eventName || 'Untitled ride'} — {r.date}
                </option>
              ))}
          </select>
        </label>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {schedule && (
        <div className="flex flex-wrap gap-6 text-sm text-slate-700">
          <div>
            <span className="text-slate-500">{schedule.startLapS != null ? 'Settle power (excl. lap 1): ' : 'Steady power: '}</span>
            <span className="font-mono font-medium">{schedule.steadyW.toFixed(0)} W</span>
          </div>
          <div>
            <span className="text-slate-500">Predicted finish: </span>
            <span className="font-mono font-medium">{schedule.predictedTimeS.toFixed(3)} s</span>
          </div>
        </div>
      )}

      {schedule && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead>
              <tr>
                {schedule.lapTimes.map((_, i) => (
                  <th key={i} className="px-2 py-1 text-right font-medium text-slate-500">
                    L{i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {schedule.lapTimes.map((lt, i) => (
                  <td key={i} className="px-2 py-1 text-right font-mono text-slate-800">
                    {lt.toFixed(2)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {gaps && overlayRide && (
        <Chart
          ariaLabel={`Gap versus the ${targetTimeInput}s ghost schedule for ${overlayRide.eventName || 'the selected ride'}`}
          data={[
            {
              type: 'scatter',
              mode: 'lines',
              x: gaps[1].distM,
              y: gaps[1].gapS,
              name: overlayRide.eventName || overlayRide.date,
              line: { color: '#2563eb', width: 2 },
            },
          ]}
          layout={{
            xaxis: { title: { text: 'Distance (m)' } },
            yaxis: { title: { text: 'Gap vs ghost (s) — positive = behind' } },
          }}
        />
      )}
    </section>
  )
}
