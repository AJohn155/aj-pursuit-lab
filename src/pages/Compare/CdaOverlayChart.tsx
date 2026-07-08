// Per-lap CdA overlay across selected rides (SPEC §5.2).

import Chart from '../../components/Chart'
import type { CompareItem } from './compare'
import { T } from '../../components/EditableText'

export default function CdaOverlayChart({ items }: { items: CompareItem[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="mb-2 text-sm font-semibold text-slate-900" id="compare.cdaoverlaychart.per-lap-cda-overlay" d="Per-lap CdA overlay" />
      <Chart
        ariaLabel="Per-lap CdA overlaid across the selected rides"
        data={items.map((it) => ({
          type: 'scatter',
          mode: 'lines+markers',
          x: it.full.analysisResult.laps.map((_, i) => i + 1),
          y: it.full.analysisResult.laps.map((l) => l.cda),
          name: it.label,
          line: { color: it.color },
        }))}
        layout={{ xaxis: { title: { text: 'Lap' }, dtick: 1 }, yaxis: { title: { text: 'CdA (m²)' } } }}
        height={300}
      />
    </section>
  )
}
