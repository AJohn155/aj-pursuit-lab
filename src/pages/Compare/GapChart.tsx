// Cumulative time-delta vs distance, first selection = reference (SPEC §5.2).

import Chart from '../../components/Chart'
import { buildDistanceTimeSeries, gapCharts, type CompareItem } from './compare'
import { T } from '../../components/EditableText'

export default function GapChart({ items }: { items: CompareItem[] }) {
  if (items.length < 2) return null
  const series = items.map((it) =>
    buildDistanceTimeSeries(it.full, { officialSplits: it.officialSplits, lapLengthM: it.lapLengthM }),
  )
  const gaps = gapCharts(series)
  const anchored = items.filter((it) => (it.officialSplits?.length ?? 0) >= 2).length

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="mb-1 text-sm font-semibold text-slate-900" id="compare.gapchart.gap-chart" d="Gap chart" />
      <p className="mb-2 text-xs text-slate-500">
        Time behind/ahead of the reference ({items[0].label}) at each point on the track. Negative = ahead.
        {anchored > 0 &&
          ` ${anchored}/${items.length} selections are anchored on official lap splits (lap-line gaps are exactly the official gaps).`}
        {anchored < items.length &&
          ' Rides without official splits use the reconstructed timeline (±1 s start-anchor uncertainty, mostly in lap 1) — add splits via "Edit details" on the ride.'}
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
