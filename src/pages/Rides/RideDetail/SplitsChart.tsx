// Lap-split scatter (owner request 2026-07 round 12): each lap's time vs lap number, so the
// pacing shape — where you went faster or slower — is visible at a glance. Uses the
// OFFICIAL splits when the ride has them; otherwise the analysis's own per-lap times, said
// so in the caption. A vertical marker shows where a rider was caught.

import type { LapResult } from '../../../engine/ingest'
import Chart from '../../../components/Chart'
import { catchLineLayout } from './catchLine'
import { T } from '../../../components/EditableText'

export default function SplitsChart({
  officialSplits,
  laps,
  catchLap,
}: {
  officialSplits: number[]
  laps: LapResult[]
  /** Where a rider was caught, in laps from the start (e.g. 7.5); undefined = no catch. */
  catchLap?: number
}) {
  const useOfficial = officialSplits.length > 0
  const values = useOfficial ? officialSplits : laps.map((l) => l.timeS)
  if (values.length === 0) return null
  const lapNumbers = values.map((_, i) => i + 1)
  const catchLayout = catchLap != null && Number.isFinite(catchLap) ? catchLineLayout(catchLap) : null

  // Lap 1 includes the standing start, so it sits far above every other lap and, if the y-axis
  // auto-scales to fit it, squashes laps 2+ into a thin band. Center the axis on laps 2 onward
  // (owner request 2026-07) for real granularity there; lap 1 can run off the top.
  const rest = values.slice(1)
  const yRange = rest.length > 0
    ? (() => {
        const lo = Math.min(...rest)
        const hi = Math.max(...rest)
        const pad = Math.max((hi - lo) * 0.15, 0.05)
        return [lo - pad, hi + pad] as [number, number]
      })()
    : undefined

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="mb-2 text-sm font-semibold text-slate-900" id="rides.ridedetail.splitschart.lap-splits" d="Lap splits" />
      <Chart
        ariaLabel="Lap split time versus lap number, showing the pacing shape across the race"
        data={[
          {
            type: 'scatter',
            mode: 'lines+markers',
            x: lapNumbers,
            y: values,
            line: { color: '#2563eb' },
            marker: { size: 7, color: '#2563eb' },
            name: useOfficial ? 'Official split' : 'Lap time',
            hovertemplate: 'Lap %{x}<br>%{y:.3f}s<extra></extra>',
          },
        ]}
        layout={{
          xaxis: { title: { text: 'Lap' }, dtick: 1 },
          yaxis: { title: { text: 'Split (s)' }, ...(yRange ? { range: yRange } : {}) },
          ...(catchLayout ?? {}),
        }}
        height={260}
      />
      {useOfficial ? (
        <T as="p" className="mt-1 text-xs text-slate-400" id="rides.ridedetail.splitschart.caption-official" d="Official lap splits — lower is faster. Lap 1 includes the standing start, so it always sits well above the rest." />
      ) : (
        <T as="p" className="mt-1 text-xs text-slate-400" id="rides.ridedetail.splitschart.caption-detected" d="Detected lap times (no official splits entered — add them in Edit details for exact values). Lower is faster; lap 1 includes the standing start." />
      )}
    </section>
  )
}
