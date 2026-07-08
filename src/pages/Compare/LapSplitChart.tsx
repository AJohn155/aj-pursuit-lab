// Lap splits grouped bars (SPEC §5.2).

import Chart from '../../components/Chart'
import type { CompareItem } from './compare'
import { T } from '../../components/EditableText'

export default function LapSplitChart({ items }: { items: CompareItem[] }) {
  const maxLaps = Math.max(...items.map((it) => it.full.analysisResult.laps.length), 0)
  const lapNumbers = Array.from({ length: maxLaps }, (_, i) => i + 1)

  // Scale to the data, not down to 0 — the interesting spread is a few tenths on a ~14 s
  // split and disappears against a zero baseline (owner request 2026-07).
  const allSplits = items.flatMap((it) => it.full.analysisResult.laps.map((l) => l.timeS)).filter(Number.isFinite)
  const lo = allSplits.length > 0 ? Math.min(...allSplits) : 0
  const hi = allSplits.length > 0 ? Math.max(...allSplits) : 1
  const pad = Math.max(0.2, (hi - lo) * 0.08)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="mb-2 text-sm font-semibold text-slate-900" id="compare.lapsplitchart.lap-splits" d="Lap splits" />
      <Chart
        ariaLabel="Lap split times grouped by lap number, one bar series per ride, axis scaled to the data"
        data={items.map((it) => ({
          type: 'bar',
          x: lapNumbers,
          y: it.full.analysisResult.laps.map((l) => l.timeS),
          name: it.label,
          marker: { color: it.color },
        }))}
        layout={{
          barmode: 'group',
          xaxis: { title: { text: 'Lap' }, dtick: 1 },
          yaxis: { title: { text: 's' }, range: [lo - pad, hi + pad] },
        }}
        height={320}
      />
    </section>
  )
}
