// Gap-by-distance vs the winner (owner request 2026-07 round 10): when a winner's 16 lap
// splits are entered on the event, plot my elapsed time minus theirs at every point on the
// track — "where did they take those seconds" instead of just the finish-line total. My
// side uses the ride's reconstructed (and official-split-anchored, when available)
// distance-time series; the winner's side is piecewise-linear between their lap lines —
// exact at every 250 m line, interpolated within laps.

import Chart from '../../components/Chart'
import { buildDistanceTimeSeries, timeAtDistance } from '../Compare/compare'
import type { DistanceTimeSeries } from '../Compare/compare'
import type { Event } from '../../store/types'
import type { RideModel } from './watts'
import { T } from '../../components/EditableText'

const GRID_STEP_M = 20
const WINNER_COLORS = ['#dc2626', '#ea580c', '#ca8a04']

export default function WinnerGapChart({ model, event }: { model: RideModel; event: Event }) {
  const withSplits = event.winners.filter((w) => (w.splits?.length ?? 0) === 16)
  if (withSplits.length === 0) return null

  const L = model.resolved.track.lapLengthM
  const raceM = 16 * L
  const mySeries = buildDistanceTimeSeries(model.full, {
    officialSplits: model.ride.officialSplits.length > 0 ? model.ride.officialSplits : undefined,
    lapLengthM: L,
  })
  if (mySeries.distM.length === 0) return null

  const grid: number[] = []
  for (let d = 0; d <= raceM; d += GRID_STEP_M) grid.push(d)

  const traces = withSplits.map((w, i) => {
    const cum: number[] = [0]
    let acc = 0
    for (const s of w.splits as number[]) {
      acc += s
      cum.push(acc)
    }
    const winnerSeries: DistanceTimeSeries = {
      distM: cum.map((_, k) => k * L),
      elapsedS: cum,
    }
    return {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: grid,
      y: grid.map((d) => timeAtDistance(mySeries, d) - timeAtDistance(winnerSeries, d)),
      name: `${w.name} (${w.round}, ${w.timeS.toFixed(3)}s)`,
      line: { color: WINNER_COLORS[i % WINNER_COLORS.length] },
    }
  })

  return (
    <div className="mt-3">
      <T
        as="h4"
        className="mb-1 text-xs font-semibold uppercase text-slate-500"
        id="wattstowin.winnergapchart.title"
        d="Gap to winner by distance"
      />
      <Chart
        ariaLabel="My elapsed time minus the winner's at each distance; positive = behind"
        data={traces}
        layout={{
          xaxis: { title: { text: 'Distance (m)' }, range: [0, raceM] },
          yaxis: { title: { text: 'Gap (s), positive = behind' } },
          shapes: [
            { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0, y1: 0, line: { color: '#94a3b8', dash: 'dot' } },
          ],
        }}
        height={260}
      />
      <T
        as="p"
        className="mt-1 text-xs text-slate-400"
        id="wattstowin.winnergapchart.caption"
        d="My time minus the winner's at each point (positive = behind). The winner's curve is exact at every lap line and linear within laps; my curve comes from the ride's reconstructed timeline{anchored}."
        vars={{
          anchored:
            model.ride.officialSplits.length > 0
              ? ', anchored on my official splits'
              : ' (±1 s start-anchor uncertainty, mostly lap 1 — add my splits via Edit details to anchor it)',
        }}
      />
    </div>
  )
}
