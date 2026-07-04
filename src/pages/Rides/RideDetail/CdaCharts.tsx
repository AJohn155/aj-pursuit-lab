// Per-lap CdA with drift trendline, and rolling CdA (SPEC §5.1 / §4.9). The trendline is
// fit over the steady window (laps 3+) — the standing-start laps' CdA is not physically
// meaningful (see cda.ts) and would otherwise dominate the fit.

import type { LapResult } from '../../../engine/ingest'
import type { RollingCdaPoint } from '../../../engine/index'
import Chart from '../../../components/Chart'
import { linearTrend } from './trend'

const STEADY_FIRST_LAP = 3

export default function CdaCharts({ laps, rolling }: { laps: LapResult[]; rolling: RollingCdaPoint[] }) {
  const lapNumbers = laps.map((_, i) => i + 1)
  const cdaValues = laps.map((l) => l.cda)

  const steadyIdx = lapNumbers
    .map((n, i) => ({ n, cda: cdaValues[i] }))
    .filter((p) => p.n >= STEADY_FIRST_LAP && Number.isFinite(p.cda))
  const trend =
    steadyIdx.length >= 2 ? linearTrend(steadyIdx.map((p) => p.n), steadyIdx.map((p) => p.cda)) : null

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Per-lap CdA</h2>
        <Chart
          ariaLabel="CdA per lap with a drift trendline over the steady window"
          data={[
            { type: 'bar', x: lapNumbers, y: cdaValues, marker: { color: '#2563eb' }, name: 'CdA' },
            ...(trend
              ? [
                  {
                    type: 'scatter' as const,
                    mode: 'lines' as const,
                    x: [STEADY_FIRST_LAP, lapNumbers.at(-1) ?? STEADY_FIRST_LAP],
                    y: [
                      trend.intercept + trend.slope * STEADY_FIRST_LAP,
                      trend.intercept + trend.slope * (lapNumbers.at(-1) ?? STEADY_FIRST_LAP),
                    ],
                    line: { color: '#dc2626', dash: 'dash' as const },
                    name: 'Trend (laps 3+)',
                  },
                ]
              : []),
          ]}
          layout={{ xaxis: { title: { text: 'Lap' } }, yaxis: { title: { text: 'm²' } } }}
          height={260}
        />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Rolling CdA (display only)</h2>
        <Chart
          ariaLabel="Rolling CdA over a centered 1-lap window stepped a quarter lap at a time"
          data={[
            {
              type: 'scatter',
              mode: 'lines',
              x: rolling.map((p) => p.centerDistM),
              y: rolling.map((p) => p.cdaM2),
              line: { color: '#7c3aed' },
              name: 'Rolling CdA',
            },
          ]}
          layout={{ xaxis: { title: { text: 'Distance (m)' } }, yaxis: { title: { text: 'm²' } } }}
          height={220}
        />
      </div>
    </section>
  )
}
