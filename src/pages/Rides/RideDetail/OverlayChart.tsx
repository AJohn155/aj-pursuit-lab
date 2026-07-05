// Speed-vs-position-in-lap overlay: all laps superimposed (SPEC §5.1) — shows where in the
// corner speed peaks/dies.
//
// Owner requests 2026-07: (a) lap colors follow one continuous light→dark gradient so the
// shade alone tells you early vs late in the ride, no legend needed; (b) positions are
// re-anchored onto track coordinates via the ride's fitted lap-line phase (§4.8
// GeometryFit.phaseOffsetM) so 0 = start of a straight and the shaded bands = the bends —
// this also makes different rides' overlays comparable despite each ride's own
// start-datum anchoring error (the §4.7.3 gap; see PROGRESS 2026-07).

import type { LapPositionSeries } from '../../../engine/ingest'
import type { GeometryFit } from '../../../engine/ingest'
import Chart from '../../../components/Chart'
import { alignPosM, bendShapes, lapGradientColor, splitAtWraps } from './overlayHelpers'

export default function OverlayChart({
  overlay,
  geometry,
  lapLengthM,
}: {
  overlay: LapPositionSeries[]
  geometry: GeometryFit | null
  lapLengthM: number
}) {
  const phase = geometry?.phaseOffsetM ?? 0
  const lapCount = overlay.length

  const data = overlay.flatMap((lap) => {
    const aligned = lap.posM.map((s) => alignPosM(s, phase, lapLengthM))
    const order = aligned.map((_, i) => i).sort((a, b) => aligned[a] - aligned[b])
    const posSorted = order.map((i) => aligned[i])
    const spdSorted = order.map((i) => lap.speedMs[i])
    const color = lapGradientColor(lap.lap, lapCount)
    return splitAtWraps(posSorted, spdSorted).map((part, pi) => ({
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: part.x,
      y: part.y,
      name: `Lap ${lap.lap}`,
      legendgroup: `lap${lap.lap}`,
      showlegend: pi === 0,
      opacity: 0.85,
      line: { width: 1.25, color },
    }))
  })

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Speed vs. position in lap</h2>
      <Chart
        ariaLabel="Speed versus position within the lap, one line per lap, light-to-dark by lap number, bends shaded"
        data={data}
        layout={{
          xaxis: { title: { text: 'Position on track (m, 0 = start of straight)' }, range: [0, lapLengthM] },
          yaxis: { title: { text: 'm/s' } },
          shapes: geometry ? bendShapes(geometry.straightLengthM, lapLengthM) : [],
          showlegend: false,
        }}
        height={320}
      />
      <p className="mt-1 text-xs text-slate-400">
        Light → dark = lap 1 → lap {lapCount}. Shaded bands are the bends (fitted geometry); wheel speed
        should peak in the bends because the lean lengthens the wheel path. Positions are aligned to the
        track via this ride&apos;s fitted lap-line phase
        {geometry ? ` (${geometry.phaseOffsetM.toFixed(0)} m)` : ' (no fit available)'} — each ride&apos;s own
        start-datum anchor carries a ±10–30 m uncertainty until §4.7.3 oscillation anchoring lands.
      </p>
    </section>
  )
}
