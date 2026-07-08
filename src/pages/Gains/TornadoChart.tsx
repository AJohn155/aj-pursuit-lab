// Tornado chart + table of Δtime per perturbation (SPEC §5.5), with a seconds ⇄
// watts-equivalent unit toggle.

import Chart from '../../components/Chart'
import type { GainsRow } from './gains'
import { T } from '../../components/EditableText'

export default function TornadoChart({ rows, unit }: { rows: GainsRow[]; unit: 'seconds' | 'watts' }) {
  // Plotly draws horizontal bar categories bottom-to-top; reverse so the biggest gain
  // (already sorted first by computeGainsRows) reads at the top.
  const ordered = [...rows].reverse()
  const values = ordered.map((r) => (unit === 'seconds' ? r.deltaTimeS : r.wattsEquivalent))

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="text-sm font-semibold text-slate-900" id="gains.tornadochart.marginal-gains" d="Marginal gains" />
      <Chart
        ariaLabel={`Tornado chart of time gained per perturbation, in ${unit === 'seconds' ? 'seconds' : 'watts-equivalent'}`}
        data={[
          {
            type: 'bar',
            orientation: 'h',
            x: values,
            y: ordered.map((r) => r.label),
            marker: { color: values.map((v) => (v >= 0 ? '#16a34a' : '#dc2626')) },
          },
        ]}
        layout={{
          xaxis: { title: { text: unit === 'seconds' ? 'Δ time (s), faster →' : 'Watts-equivalent, more →' } },
          margin: { l: 110, r: 16, t: 24, b: 40 },
        }}
        height={280}
      />
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Perturbation</th>
              <th className="px-3 py-2 font-medium">Δ time (s)</th>
              <th className="px-3 py-2 font-medium">Watts-equivalent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 text-slate-800">{r.label}</td>
                <td className="px-3 py-2 text-slate-600">{r.deltaTimeS.toFixed(2)}</td>
                <td className="px-3 py-2 text-slate-600">{r.wattsEquivalent.toFixed(1)} W</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
