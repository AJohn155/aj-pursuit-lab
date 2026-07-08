// Per-lap CdA with drift trendline, and rolling CdA (SPEC §5.1 / §4.9). The trendline is
// fit over the steady window (laps 3+) — the standing-start laps' CdA is not physically
// meaningful (see cda.ts) and would otherwise dominate the fit.
//
// Owner request 2026-07: the per-lap axis is scaled to the steady laps' spread (not down
// to 0) so bar-height granularity is visible; standing-start laps whose CdA falls outside
// that band clip at the edge by design.

import type { LapResult } from '../../../engine/ingest'
import type { RollingCdaPoint } from '../../../engine/index'
import Chart from '../../../components/Chart'
import { linearTrend } from './trend'
import { T } from '../../../components/EditableText'

const STEADY_FIRST_LAP = 3

export default function CdaCharts({ laps, rolling }: { laps: LapResult[]; rolling: RollingCdaPoint[] }) {
  const lapNumbers = laps.map((_, i) => i + 1)
  const cdaValues = laps.map((l) => l.cda)

  const steadyIdx = lapNumbers
    .map((n, i) => ({ n, cda: cdaValues[i] }))
    .filter((p) => p.n >= STEADY_FIRST_LAP && Number.isFinite(p.cda))
  const trend =
    steadyIdx.length >= 2 ? linearTrend(steadyIdx.map((p) => p.n), steadyIdx.map((p) => p.cda)) : null

  // Y-range from the steady laps only, padded — lap 1–2 values are dominated by the
  // standing-start energy imbalance and would otherwise flatten the interesting spread.
  const steadyVals = steadyIdx.map((p) => p.cda)
  const lo = steadyVals.length > 0 ? Math.min(...steadyVals) : 0.15
  const hi = steadyVals.length > 0 ? Math.max(...steadyVals) : 0.25
  const pad = Math.max(0.004, (hi - lo) * 0.25)

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <T as="h2" className="text-sm font-semibold text-slate-900" id="rides.ridedetail.cdacharts.per-lap-cda" d="Per-lap CdA" />
        <Chart
          ariaLabel="CdA per lap with a drift trendline over the steady window, axis scaled to the steady spread"
          data={[
            { type: 'bar', x: lapNumbers, y: cdaValues, marker: { color: '#8b5cf6' }, name: 'CdA' },
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
                    line: { color: '#ec4899', dash: 'dash' as const },
                    name: 'Trend (laps 3+)',
                  },
                ]
              : []),
          ]}
          layout={{
            xaxis: { title: { text: 'Lap' } },
            yaxis: { title: { text: 'm²' }, range: [lo - pad, hi + pad] },
          }}
          height={260}
        />
        <T as="p" className="mt-1 text-xs text-slate-400" id="rides.ridedetail.cdacharts.axis-is-scaled-to-the" d="Axis is scaled to the steady laps (3+); laps 1–2 usually clip — their single-lap energy balance is dominated by the standing start and isn&apos;t a real CdA. The headline CdA uses laps 3–16 only." />
      </div>
      <div>
        <T as="h2" className="text-sm font-semibold text-slate-900" id="rides.ridedetail.cdacharts.rolling-cda-2-lap-window" d="Rolling CdA (2-lap window)" />
        <Chart
          ariaLabel="Rolling CdA over a centered 2-lap window stepped a quarter lap at a time"
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
        <T as="p" className="mt-1 text-xs text-slate-400" id="rides.ridedetail.cdacharts.the-same-energy-balance-cda" d="The same energy-balance CdA computed over a sliding 2-lap window (stepped ¼ lap), then smoothed over ±½ lap of window centers; windows overlapping the standing-start lap are dropped (their balance has no start-energy term, so they aren't a real CdA). A within-race drift diagnostic — the headline CdA (laps 3–16 in one balance) is the number to trust." />
      </div>
    </section>
  )
}
