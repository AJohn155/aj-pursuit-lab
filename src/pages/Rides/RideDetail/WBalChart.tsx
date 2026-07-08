// W′bal curve (SPEC §4.13 / §5.1).

import type { WBalPoint } from '../../../engine/ingest'
import Chart from '../../../components/Chart'
import { T } from '../../../components/EditableText'

export default function WBalChart({ curve }: { curve: WBalPoint[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="mb-2 text-sm font-semibold text-slate-900" id="rides.ridedetail.wbalchart.w-balance" d="W′ balance" />
      <Chart
        ariaLabel="W prime balance over the race, kilojoules; a negative value means the anaerobic tank was over-drawn"
        data={[
          {
            type: 'scatter',
            mode: 'lines',
            x: curve.map((p) => p.tS),
            y: curve.map((p) => p.wBalJ / 1000),
            line: { color: '#0ea5e9' },
            name: "W'bal",
            fill: 'tozeroy',
            fillcolor: 'rgba(14, 165, 233, 0.08)',
          },
        ]}
        layout={{
          xaxis: { title: { text: 's' } },
          yaxis: { title: { text: 'kJ' } },
          shapes: [{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0, y1: 0, line: { color: '#94a3b8', dash: 'dot' } }],
        }}
        height={240}
      />
    </section>
  )
}
