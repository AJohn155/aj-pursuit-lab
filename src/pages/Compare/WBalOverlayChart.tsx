// W′bal overlay across selected rides (SPEC §5.2 / §4.13).

import Chart from '../../components/Chart'
import type { CompareItem } from './compare'
import { T } from '../../components/EditableText'

export default function WBalOverlayChart({ items }: { items: CompareItem[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="mb-2 text-sm font-semibold text-slate-900" id="compare.wbaloverlaychart.w-balance-overlay" d="W′ balance overlay" />
      <Chart
        ariaLabel="W prime balance over race time, overlaid across the selected rides"
        data={items.map((it) => ({
          type: 'scatter',
          mode: 'lines',
          x: it.full.wBalCurve.map((p) => p.tS),
          y: it.full.wBalCurve.map((p) => p.wBalJ / 1000),
          name: it.label,
          line: { color: it.color },
        }))}
        layout={{
          xaxis: { title: { text: 's' } },
          yaxis: { title: { text: 'kJ' } },
          shapes: [{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0, y1: 0, line: { color: '#94a3b8', dash: 'dot' } }],
        }}
        height={300}
      />
    </section>
  )
}
