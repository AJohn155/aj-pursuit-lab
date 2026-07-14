// Cumulative time-delta vs distance, first selection = reference (SPEC §5.2).
//
// Density-normalization toggle (owner request 2026-07 round 5, item 3): scale each
// selection's elapsed times to the reference air density before differencing — the same
// convention as Progression's "Normalized time" (equivalentTimeAtRefDensity, a
// multiplicative steady-state factor, so it applies uniformly to the whole series). Rides
// at different venues/densities then compare on fitness+aero rather than air.

import { useState } from 'react'
import { equivalentTimeAtRefDensity } from '../../engine/index'
import Chart from '../../components/Chart'
import { buildDistanceTimeSeries, gapCharts, type CompareItem } from './compare'
import { T } from '../../components/EditableText'

export default function GapChart({
  items,
  referenceAirDensity,
}: {
  items: CompareItem[]
  referenceAirDensity: number
}) {
  const [normalizeDensity, setNormalizeDensity] = useState(false)
  if (items.length < 2) return null

  const series = items.map((it) => {
    const s = buildDistanceTimeSeries(it.full, { officialSplits: it.officialSplits, lapLengthM: it.lapLengthM })
    if (!normalizeDensity || it.rho == null) return s
    // equivalentTimeAtRefDensity is time × densityScaleSteady(ρref, ρ) — a pure scale, so
    // dividing an arbitrary time by the total and re-multiplying is exact; apply it to
    // every sample of the series.
    const k = equivalentTimeAtRefDensity(1, it.rho, referenceAirDensity)
    return { distM: s.distM, elapsedS: s.elapsedS.map((t) => t * k) }
  })
  const gaps = gapCharts(series)
  const anchored = items.filter((it) => (it.officialSplits?.length ?? 0) >= 2).length
  const missingRho = normalizeDensity ? items.filter((it) => it.rho == null).length : 0

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <T as="h2" className="text-sm font-semibold text-slate-900" id="compare.gapchart.gap-chart" d="Gap chart" />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={normalizeDensity}
            onChange={(e) => setNormalizeDensity(e.target.checked)}
          />
          Normalize times to ρ {referenceAirDensity.toFixed(3)} kg/m³
        </label>
      </div>
      <p className="mb-2 text-xs text-slate-500">
        Time behind/ahead of the reference ({items[0].label}) at each point on the track. Negative = ahead.
        {normalizeDensity &&
          ` Times are density-normalized (same convention as Progression's "Normalized time") — gaps show fitness+aero, not air.`}
        {missingRho > 0 && ` ${missingRho} selection(s) have no density and stay unnormalized.`}
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
