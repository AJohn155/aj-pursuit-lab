// Speed-vs-position-in-lap overlay: all laps superimposed (SPEC §5.1) — shows where in the
// corner speed peaks/dies.

import type { LapPositionSeries } from '../../../engine/ingest'
import Chart from '../../../components/Chart'

export default function OverlayChart({ overlay }: { overlay: LapPositionSeries[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Speed vs. position in lap</h2>
      <Chart
        ariaLabel="Speed versus position within the lap, one line per lap, superimposed"
        data={overlay.map((lap) => ({
          type: 'scatter',
          mode: 'lines',
          x: lap.posM,
          y: lap.speedMs,
          name: `Lap ${lap.lap}`,
          opacity: 0.75,
          line: { width: 1.25 },
        }))}
        layout={{ xaxis: { title: { text: 'Position in lap (m)' } }, yaxis: { title: { text: 'm/s' } } }}
        height={320}
      />
    </section>
  )
}
