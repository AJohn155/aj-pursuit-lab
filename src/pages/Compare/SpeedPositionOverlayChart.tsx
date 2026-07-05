// Speed-vs-position overlay across selected rides (SPEC §5.2). Unlike RideDetail's
// per-ride, per-lap overlay (16 lines for one ride), this shows one averaged line per ride
// (over the steady laps) so multiple rides stay readable on one chart.

import Chart from '../../components/Chart'
import { bendShapes } from '../Rides/RideDetail/overlayHelpers'
import { speedPositionAverage, type CompareItem } from './compare'

export default function SpeedPositionOverlayChart({
  items,
  lapLengthM,
}: {
  items: CompareItem[]
  lapLengthM: number
}) {
  const refGeometry = items.find((it) => it.full.geometry)?.full.geometry ?? null
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Speed vs. position overlay</h2>
      <p className="mb-2 text-xs text-slate-500">
        Averaged over each ride&apos;s steady laps (3+). Each ride is re-anchored onto track coordinates
        via its own fitted lap-line phase (0 = start of a straight, shaded bands = bends), so the
        corner peaks should line up across rides.
      </p>
      <Chart
        ariaLabel="Average speed versus position on track, one line per ride, phase-aligned, bends shaded"
        data={items.map((it) => {
          const lastLap = Math.max(3, Math.min(15, it.full.base.laps.lapCount - 1))
          const avg = speedPositionAverage(
            it.full.overlay,
            lapLengthM,
            lastLap,
            it.full.geometry?.phaseOffsetM ?? 0,
          )
          return {
            type: 'scatter',
            mode: 'lines',
            x: avg.posM,
            y: avg.speedMs,
            name: it.label,
            line: { color: it.color },
          }
        })}
        layout={{
          xaxis: { title: { text: 'Position on track (m, 0 = start of straight)' }, range: [0, lapLengthM] },
          yaxis: { title: { text: 'm/s' } },
          shapes: refGeometry ? bendShapes(refGeometry.straightLengthM, lapLengthM) : [],
        }}
        height={300}
      />
    </section>
  )
}
