// Lap splits grouped bars (SPEC §5.2).

import Chart from '../../components/Chart'
import type { CompareItem } from './compare'

export default function LapSplitChart({ items }: { items: CompareItem[] }) {
  const maxLaps = Math.max(...items.map((it) => it.full.analysisResult.laps.length), 0)
  const lapNumbers = Array.from({ length: maxLaps }, (_, i) => i + 1)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Lap splits</h2>
      <Chart
        ariaLabel="Lap split times grouped by lap number, one bar series per ride"
        data={items.map((it) => ({
          type: 'bar',
          x: lapNumbers,
          y: it.full.analysisResult.laps.map((l) => l.timeS),
          name: it.label,
          marker: { color: it.color },
        }))}
        layout={{ barmode: 'group', xaxis: { title: { text: 'Lap' }, dtick: 1 }, yaxis: { title: { text: 's' } } }}
        height={320}
      />
    </section>
  )
}
