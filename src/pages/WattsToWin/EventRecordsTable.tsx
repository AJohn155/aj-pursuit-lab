// Per-event records table (SPEC §5.4): for each of my rides at this event, per winner —
// my time, gap, watts-to-beat, ΔCdA-to-match — plus a "time at +10/+20/+30 W" mini-table.
//
// Watts-to-beat (owner convention 2026-07): hold the ride's ACTUAL start lap fixed and
// solve the settle power ("power excluding lap 1", engine/startsplit.ts) that beats the
// winner's time, reported as +X W over the ride's actual power-excl-lap-1. ΔCdA-to-match
// still reuses solveScenarioUnknown('cdA', ...) (§4.11). The +N W mini-table scales the
// ride's real power schedule (powerScale) so pacing shape is preserved.

import { useMemo } from 'react'
import { solveSettlePowerForTime } from '../../engine/startsplit'
import { analyzeStoredRide } from '../../store/analyzeStoredRide'
import { resolveScenario, runScenario, solveScenarioUnknown } from '../../store/scenario'
import type { ResolvedScenario } from '../../store/scenario'
import { BADGE_CLASSES, displayPowerExclLap1, qualityBadgeForScore } from '../Rides/format'
import type { Event, Ride, Settings, Venue } from '../../store/types'

const POWER_STEPS_W = [10, 20, 30]

interface RideRow {
  ride: Ride
  resolvedBaseline: ResolvedScenario | null
  /** The ride's actual first-lap time — official split when present, else constructed. */
  startLapS: number | null
  /** The ride's actual "power excluding lap 1" (recorded convention). */
  actualExclLap1W: number | null
  error: string | null
}

function buildRideRow(ride: Ride, venues: Venue[], settings: Settings): RideRow {
  const venue = venues.find((v) => v.id === ride.venueId)
  if (!venue) return { ride, resolvedBaseline: null, startLapS: null, actualExclLap1W: null, error: 'venue no longer exists' }
  if (!ride.fitFileB64) return { ride, resolvedBaseline: null, startLapS: null, actualExclLap1W: null, error: 'no .fit file attached' }
  try {
    const full = analyzeStoredRide(ride, venue, settings)
    const resolvedBaseline = resolveScenario({ ride, venue, full }, {}, settings, venues)
    const startLapS = ride.officialSplits[0] ?? full.analysisResult.laps[0]?.timeS ?? null
    const actualExclLap1W = displayPowerExclLap1(full.analysisResult)
    return { ride, resolvedBaseline, startLapS, actualExclLap1W, error: null }
  } catch (e) {
    return { ride, resolvedBaseline: null, startLapS: null, actualExclLap1W: null, error: e instanceof Error ? e.message : String(e) }
  }
}

function trySolve(key: 'power' | 'cdA', targetTimeS: number, resolved: ResolvedScenario): number | null {
  try {
    return solveScenarioUnknown(key, targetTimeS, resolved)
  } catch {
    return null
  }
}

/** Settle power to BEAT the winner (finish 0.1 s inside their time) with the ride's own
 * start lap held fixed. */
function trySolveSettleToBeat(winnerTimeS: number, startLapS: number, resolved: ResolvedScenario): number | null {
  try {
    return solveSettlePowerForTime(winnerTimeS - 0.1, startLapS, {
      cdaM2: resolved.cdaM2,
      rho: resolved.rho,
      params: resolved.params,
      track: resolved.track,
    })
  } catch {
    return null
  }
}

export default function EventRecordsTable({
  event,
  rides,
  venues,
  settings,
}: {
  event: Event
  rides: Ride[]
  venues: Venue[]
  settings: Settings
}) {
  const rows = useMemo(
    () => event.myRideIds.map((id) => rides.find((r) => r.id === id)).filter((r): r is Ride => !!r).map((r) => buildRideRow(r, venues, settings)),
    [event.myRideIds, rides, venues, settings],
  )

  if (event.winners.length === 0) {
    return <p className="text-sm text-slate-500">Add at least one winner to this event to see records.</p>
  }
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">Link one of your rides to this event to see records.</p>
  }

  return (
    <div className="space-y-6">
      {rows.map(({ ride, resolvedBaseline, startLapS, actualExclLap1W, error }) => (
        <section key={ride.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            {ride.eventName || 'Untitled ride'} — {ride.date} · {ride.officialTimeS.toFixed(3)}s
            {ride.analysis && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASSES[qualityBadgeForScore(ride.analysis.qualityScore)]}`}
              >
                {Math.round(ride.analysis.qualityScore)}
              </span>
            )}
          </h3>
          {error && <p className="text-sm text-red-700">Can't analyze this ride: {error}</p>}
          {resolvedBaseline && (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Round / winner</th>
                      <th className="px-3 py-2 font-medium">Winner time</th>
                      <th className="px-3 py-2 font-medium">Gap</th>
                      <th className="px-3 py-2 font-medium">Watts to beat (same start lap)</th>
                      <th className="px-3 py-2 font-medium">ΔCdA to match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {event.winners.map((w, i) => {
                      const gap = ride.officialTimeS - w.timeS
                      const solvedSettle =
                        startLapS != null ? trySolveSettleToBeat(w.timeS, startLapS, resolvedBaseline) : null
                      const deltaW =
                        solvedSettle != null && actualExclLap1W != null ? solvedSettle - actualExclLap1W : null
                      const solvedCda = trySolve('cdA', w.timeS, resolvedBaseline)
                      return (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 text-slate-800">
                            {w.round} — {w.name}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{w.timeS.toFixed(3)}s</td>
                          <td className={`px-3 py-2 font-medium ${gap > 0 ? 'text-red-700' : 'text-green-700'}`}>
                            {gap > 0 ? '+' : ''}
                            {gap.toFixed(3)}s
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {deltaW != null ? (
                              <>
                                <span className={`font-semibold ${deltaW > 0 ? 'text-red-700' : 'text-green-700'}`}>
                                  {deltaW > 0 ? '+' : ''}
                                  {deltaW.toFixed(0)} W
                                </span>{' '}
                                <span className="text-xs text-slate-400">({solvedSettle!.toFixed(0)} W settle)</span>
                              </>
                            ) : solvedSettle != null ? (
                              `${solvedSettle.toFixed(0)} W settle`
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {solvedCda != null ? `${(solvedCda - resolvedBaseline.cdaM2).toFixed(4)} m²` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3">
                <h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">Time at +N W (pacing shape preserved)</h4>
                <div className="grid grid-cols-3 gap-3 sm:w-96">
                  {POWER_STEPS_W.map((deltaW) => (
                    <TimeAtPowerStep key={deltaW} deltaW={deltaW} resolvedBaseline={resolvedBaseline} />
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  )
}

function TimeAtPowerStep({ deltaW, resolvedBaseline }: { deltaW: number; resolvedBaseline: ResolvedScenario }) {
  const scale = (resolvedBaseline.baselineAvgPowerW + deltaW) / resolvedBaseline.baselineAvgPowerW
  const run = runScenario({ ...resolvedBaseline, power: scalePower(resolvedBaseline.power, scale) })
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
      <p className="text-xs text-slate-500">+{deltaW} W</p>
      <p className="text-sm font-semibold text-slate-800">{run.predictedTimeS.toFixed(2)}s</p>
    </div>
  )
}

function scalePower(power: ResolvedScenario['power'], scale: number): ResolvedScenario['power'] {
  return typeof power === 'function' ? (t: number, s: number) => scale * power(t, s) : power * scale
}
