// Per-event records table (SPEC §5.4): for each of my rides at this event, per winner —
// my time, gap, watts-to-beat, ΔCdA-to-match — plus a "time at +10/+20/+30 W" mini-table.
//
// Watts-to-beat (owner convention 2026-07, fixed round 4 item 14): hold the ride's ACTUAL
// start lap fixed and solve the settle power that beats the winner's time; the +X W is vs
// the settle power at which the same model reproduces MY OWN official time (model-to-model
// — see watts.ts), so an identical time reads ~0 W instead of inheriting the model's
// reproduction bias. ΔCdA-to-match still reuses solveScenarioUnknown('cdA', ...) (§4.11).
// The +N W mini-table scales the ride's real power schedule (powerScale) so pacing shape
// is preserved.

import { useMemo } from 'react'
import { runScenario, solveScenarioUnknown } from '../../store/scenario'
import type { ResolvedScenario } from '../../store/scenario'
import { BADGE_CLASSES, qualityBadgeForScore } from '../Rides/format'
import type { Event, Ride, Settings, Venue } from '../../store/types'
import { buildRideModel, wattsToBeat } from './watts'
import WinnerGapChart from './WinnerGapChart'
import type { RideModel } from './watts'
import { T } from '../../components/EditableText'

const POWER_STEPS_W = [10, 20, 30]

function trySolveCda(targetTimeS: number, resolved: ResolvedScenario): number | null {
  try {
    return solveScenarioUnknown('cdA', targetTimeS, resolved)
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
    () =>
      event.myRideIds
        .map((id) => rides.find((r) => r.id === id))
        .filter((r): r is Ride => !!r)
        .map((r) => ({ ride: r, result: buildRideModel(r, venues, settings) })),
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
      {rows.map(({ ride, result }) => (
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
          {'error' in result ? (
            <p className="text-sm text-red-700">Can't analyze this ride: {result.error}</p>
          ) : (
            <RideRecords model={result.model} event={event} />
          )}
        </section>
      ))}
    </div>
  )
}

function RideRecords({ model, event }: { model: RideModel; event: Event }) {
  const { ride, resolved } = model
  return (
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
              const beat = wattsToBeat(w.timeS, model)
              const solvedCda = trySolveCda(w.timeS, resolved)
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
                    {beat != null ? (
                      <>
                        <span className={`font-semibold ${beat.deltaW > 0.5 ? 'text-red-700' : 'text-green-700'}`}>
                          {beat.deltaW > 0 ? '+' : ''}
                          {beat.deltaW.toFixed(0)} W
                        </span>{' '}
                        <span className="text-xs text-slate-400">({beat.settleW.toFixed(0)} W settle)</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {solvedCda != null ? `${(solvedCda - resolved.cdaM2).toFixed(4)} m²` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <T
        as="p"
        className="mt-1 text-xs text-slate-400"
        id="wattstowin.eventrecordstable.model-to-model-note"
        d="+X W is model-to-model: the settle power to beat the winner minus the settle power at which the same model reproduces this ride's own official time ({settle}) — so an identical time reads ~0 W."
        vars={{
          settle: `${model.modelSettleW.toFixed(0)} W${model.actualExclLap1W != null ? `; recorded power excl. lap 1 was ${model.actualExclLap1W.toFixed(0)} W` : ''}`,
        }}
      />

      <div className="mt-3">
        <T as="h4" className="mb-1 text-xs font-semibold uppercase text-slate-500" id="wattstowin.eventrecordstable.time-at-n-w-pacing" d="Time at +N W (pacing shape preserved)" />
        <div className="grid grid-cols-3 gap-3 sm:w-96">
          {POWER_STEPS_W.map((deltaW) => (
            <TimeAtPowerStep key={deltaW} deltaW={deltaW} resolvedBaseline={resolved} />
          ))}
        </div>
      </div>

      <WinnerGapChart model={model} event={event} />
    </>
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
