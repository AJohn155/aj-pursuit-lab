// Cumulative time-delta vs distance, first selection = reference (SPEC §5.2).

import Chart from '../../components/Chart'
import { buildDistanceTimeSeries, gapCharts, type CompareItem } from './compare'

export default function GapChart({ items }: { items: CompareItem[] }) {
  if (items.length < 2) return null
  const series = items.map((it) => buildDistanceTimeSeries(it.full))
  const gaps = gapCharts(series)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Gap chart</h2>
      <p className="mb-2 text-xs text-slate-500">
        Time behind/ahead of the reference ({items[0].label}) at each point on the track. Negative = ahead.
      </p>
      <Chart
        ariaLabel="Cumulative time delta versus distance, relative to the reference ride"
        data={items.map((it, i) => ({
          type: 'scatter',
          mode: 'lines',
          x: gaps[i].distM,
          y: gaps[i].gapS,
          name: it.label,
          line: { color: it.color, width: i === 0 ? 1.5 : 2, dash: i === 0 ? 'dot' : 'solid' },
        }))}
        layout={{ xaxis: { title: { text: 'Distance (m)' } }, yaxis: { title: { text: 'Gap (s)' } } }}
        height={320}
      />
    </section>
  )
}
