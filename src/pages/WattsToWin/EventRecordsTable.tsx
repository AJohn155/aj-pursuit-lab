// Per-event records table (SPEC §5.4): for each of my rides at this event, per winner —
// my time, gap, watts-to-match, ΔCdA-to-match — plus a "time at +10/+20/+30 W" mini-table.
//
// Watts/CdA-to-match reuse solveScenarioUnknown('power'|'cdA', winnerTimeS, resolvedBaseline)
// — the same solve-for-anything machinery the Adjuster exposes directly (SPEC §4.11
// "Watts-to-Win = solve power for winner's time at rider's parameters; also report the
// ΔCdA alternative"). The +N W mini-table scales the ride's real power schedule
// (powerScale) so pacing shape is preserved and the average shifts by exactly N watts.

import { useMemo } from 'react'
import { analyzeStoredRide } from '../../store/analyzeStoredRide'
import { resolveScenario, runScenario, solveScenarioUnknown } from '../../store/scenario'
import type { ResolvedScenario } from '../../store/scenario'
import type { Event, Ride, Settings, Venue } from '../../store/types'

const POWER_STEPS_W = [10, 20, 30]

interface RideRow {
  ride: Ride
  resolvedBaseline: ResolvedScenario | null
  error: string | null
}

function buildRideRow(ride: Ride, venues: Venue[], settings: Settings): RideRow {
  const venue = venues.find((v) => v.id === ride.venueId)
  if (!venue) return { ride, resolvedBaseline: null, error: 'venue no longer exists' }
  if (!ride.fitFileB64) return { ride, resolvedBaseline: null, error: 'no .fit file attached' }
  try {
    const full = analyzeStoredRide(ride, venue, settings)
    const resolvedBaseline = resolveScenario({ ride, venue, full }, {}, settings, venues)
    return { ride, resolvedBaseline, error: null }
  } catch (e) {
    return { ride, resolvedBaseline: null, error: e instanceof Error ? e.message : String(e) }
  }
}

function trySolve(key: 'power' | 'cdA', targetTimeS: number, resolved: ResolvedScenario): number | null {
  try {
    return solveScenarioUnknown(key, targetTimeS, resolved)
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
      {rows.map(({ ride, resolvedBaseline, error }) => (
        <section key={ride.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            {ride.eventName || 'Untitled ride'} — {ride.date} · {ride.officialTimeS.toFixed(3)}s
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
                      <th className="px-3 py-2 font-medium">Watts to match</th>
                      <th className="px-3 py-2 font-medium">ΔCdA to match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {event.winners.map((w, i) => {
                      const gap = ride.officialTimeS - w.timeS
                      const solvedPower = trySolve('power', w.timeS, resolvedBaseline)
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
                            {solvedPower != null ? `${solvedPower.toFixed(0)} W` : '—'}
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
