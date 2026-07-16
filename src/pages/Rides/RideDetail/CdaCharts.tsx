// Per-lap CdA with drift trendline, and rolling CdA (SPEC §5.1 / §4.9). The trendline is
// fit over the steady window (the laps the headline CdA actually used) — standing-start
// laps' CdA is not physically meaningful (see cda.ts) and would otherwise dominate the fit.
//
// Owner request 2026-07: the per-lap axis is scaled to the steady laps' spread (not down
// to 0) so bar-height granularity is visible; standing-start laps whose CdA falls outside
// that band clip at the edge by design. Round 6: laps excluded for a caught rider are
// drawn grey and skipped by the trend; the rolling chart shades the ±1-lap catch band.

import type { LapResult } from '../../../engine/ingest'
import type { RollingCdaPoint } from '../../../engine/index'
import Chart from '../../../components/Chart'
import { catchLineLayout } from './catchLine'
import { linearTrend } from './trend'
import { T } from '../../../components/EditableText'

export default function CdaCharts({
  laps,
  rolling,
  windowLaps,
  catchLap,
  lapLengthM = 250,
}: {
  laps: LapResult[]
  rolling: RollingCdaPoint[]
  /** 1-based laps the headline CdA window used (steady laps minus caught-rider holes). */
  windowLaps: number[]
  /** Where another rider was caught, in laps from the start (e.g. 7.5) — shades the rolling chart. */
  catchLap?: number
  lapLengthM?: number
}) {
  const lapNumbers = laps.map((_, i) => i + 1)
  const cdaValues = laps.map((l) => l.cda)
  const inWindow = new Set(windowLaps)

  const steadyIdx = lapNumbers
    .map((n, i) => ({ n, cda: cdaValues[i] }))
    .filter((p) => inWindow.has(p.n) && Number.isFinite(p.cda))
  const trend =
    steadyIdx.length >= 2 ? linearTrend(steadyIdx.map((p) => p.n), steadyIdx.map((p) => p.cda)) : null
  const trendX0 = steadyIdx[0]?.n ?? 3
  const trendX1 = steadyIdx.at(-1)?.n ?? 15

  // Y-range from the window laps only, padded — lap 1–2 (and excluded/final-lap) values
  // would otherwise flatten the interesting spread.
  const steadyVals = steadyIdx.map((p) => p.cda)
  const lo = steadyVals.length > 0 ? Math.min(...steadyVals) : 0.15
  const hi = steadyVals.length > 0 ? Math.max(...steadyVals) : 0.25
  const pad = Math.max(0.004, (hi - lo) * 0.25)

  const catchBand =
    catchLap != null && Number.isFinite(catchLap)
      ? { x0: Math.max(0, (catchLap - 1) * lapLengthM), x1: (catchLap + 1) * lapLengthM }
      : null

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <T as="h2" className="text-sm font-semibold text-slate-900" id="rides.ridedetail.cdacharts.per-lap-cda" d="Per-lap CdA" />
        <Chart
          ariaLabel="CdA per lap with a drift trendline over the steady window, axis scaled to the steady spread"
          data={[
            {
              type: 'bar',
              x: lapNumbers,
              y: cdaValues,
              // Window laps violet; laps outside the headline window (start, final lap,
              // caught-rider exclusions) grey — they're context, not the aero estimate.
              marker: { color: lapNumbers.map((n) => (inWindow.has(n) ? '#8b5cf6' : '#cbd5e1')) },
              name: 'CdA',
            },
            ...(trend
              ? [
                  {
                    type: 'scatter' as const,
                    mode: 'lines' as const,
                    x: [trendX0, trendX1],
                    y: [trend.intercept + trend.slope * trendX0, trend.intercept + trend.slope * trendX1],
                    line: { color: '#ec4899', dash: 'dash' as const },
                    name: 'Trend (CdA window)',
                  },
                ]
              : []),
          ]}
          layout={{
            xaxis: { title: { text: 'Lap' } },
            yaxis: { title: { text: 'm²' }, range: [lo - pad, hi + pad] },
            ...(catchLap != null && Number.isFinite(catchLap) ? catchLineLayout(catchLap) : {}),
          }}
          height={260}
        />
        <T as="p" className="mt-1 text-xs text-slate-400" id="rides.ridedetail.cdacharts.axis-is-scaled-to-the" d="Axis is scaled to the headline window's laps; grey bars are outside the window — laps 1–2 (standing start, usually clipping the axis), lap 16 (its end boundary inherits the start-anchor timing error and can include post-line coast-down), and any caught-rider exclusions. The headline CdA and trendline use the violet laps only." />
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
          layout={{
            xaxis: { title: { text: 'Distance (m)' } },
            yaxis: { title: { text: 'm²' } },
            ...(catchBand
              ? {
                  shapes: [
                    {
                      type: 'rect' as const,
                      xref: 'x' as const,
                      yref: 'paper' as const,
                      x0: catchBand.x0,
                      x1: catchBand.x1,
                      y0: 0,
                      y1: 1,
                      fillcolor: 'rgba(245, 158, 11, 0.12)',
                      line: { width: 0 },
                    },
                  ],
                  annotations: [
                    {
                      xref: 'x' as const,
                      yref: 'paper' as const,
                      x: (catchBand.x0 + catchBand.x1) / 2,
                      y: 1,
                      yanchor: 'bottom' as const,
                      text: 'caught rider',
                      showarrow: false,
                      font: { size: 10, color: '#b45309' },
                    },
                  ],
                }
              : {}),
          }}
          height={220}
        />
        <T as="p" className="mt-1 text-xs text-slate-400" id="rides.ridedetail.cdacharts.the-same-energy-balance-cda" d="The same energy-balance CdA computed over a sliding 2-lap window (stepped ¼ lap), then smoothed over ±½ lap of window centers; windows overlapping the standing-start lap are dropped (their balance has no start-energy term, so they aren't a real CdA). A within-race drift diagnostic — the headline CdA (steady window in one balance) is the number to trust. Any shaded band marks a caught rider: windows overlapping it read draft + passing line, not your own aero." />
      </div>
    </section>
  )
}
