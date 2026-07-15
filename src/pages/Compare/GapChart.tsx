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
  // "Set as reference" (round 8): any selection can be the gap baseline — no more
  // unchecking/rechecking to reorder. Falls back to the first item when the chosen
  // reference is deselected.
  const [referenceId, setReferenceId] = useState<string | null>(null)
  if (items.length < 2) return null
  const refIndex = Math.max(0, items.findIndex((it) => it.id === referenceId))
  const refItem = items[refIndex]

  const series = items.map((it) => {
    const s = buildDistanceTimeSeries(it.full, { officialSplits: it.officialSplits, lapLengthM: it.lapLengthM })
    if (!normalizeDensity || it.rho == null) return s
    // equivalentTimeAtRefDensity is time × densityScaleSteady(ρref, ρ) — a pure scale, so
    // dividing an arbitrary time by the total and re-multiplying is exact; apply it to
    // every sample of the series.
    const k = equivalentTimeAtRefDensity(1, it.rho, referenceAirDensity)
    return { distM: s.distM, elapsedS: s.elapsedS.map((t) => t * k) }
  })
  const gaps = gapCharts(series, refIndex)
  const anchored = items.filter((it) => (it.officialSplits?.length ?? 0) >= 2).length
  const missingRho = normalizeDensity ? items.filter((it) => it.rho == null).length : 0

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <T as="h2" className="text-sm font-semibold text-slate-900" id="compare.gapchart.gap-chart" d="Gap chart" />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Reference
            <select
              value={refItem.id}
              onChange={(e) => setReferenceId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={normalizeDensity}
              onChange={(e) => setNormalizeDensity(e.target.checked)}
            />
            Normalize times to ρ {referenceAirDensity.toFixed(3)} kg/m³
          </label>
        </div>
      </div>
      <p className="mb-2 text-xs text-slate-500">
        <T
          as="span"
          id="compare.gapchart.caption-base"
          d="Time behind/ahead of the reference ({ref}) at each point on the track. Negative = ahead."
          vars={{ ref: refItem.label }}
        />
        {normalizeDensity && (
          <>
            {' '}
            <T
              as="span"
              id="compare.gapchart.caption-normalized"
              d="Times are density-normalized (same convention as Progression's “Normalized time”) — gaps show fitness+aero, not air."
            />
          </>
        )}
        {missingRho > 0 && (
          <>
            {' '}
            <T
              as="span"
              id="compare.gapchart.caption-missing-rho"
              d="{n} selection(s) have no density and stay unnormalized."
              vars={{ n: missingRho }}
            />
          </>
        )}
        {anchored > 0 && (
          <>
            {' '}
            <T
              as="span"
              id="compare.gapchart.caption-anchored"
              d="{anchored}/{total} selections are anchored on official lap splits (lap-line gaps are exactly the official gaps)."
              vars={{ anchored, total: items.length }}
            />
          </>
        )}
        {anchored < items.length && (
          <>
            {' '}
            <T
              as="span"
              id="compare.gapchart.caption-unanchored"
              d="Rides without official splits use the reconstructed timeline (±1 s start-anchor uncertainty, mostly in lap 1) — add splits via “Edit details” on the ride."
            />
          </>
        )}
      </p>
      <Chart
        ariaLabel="Cumulative time delta versus distance, relative to the reference ride"
        data={items.map((it, i) => ({
          type: 'scatter',
          mode: 'lines',
          x: gaps[i].distM,
          y: gaps[i].gapS,
          name: it.label,
          line: { color: it.color, width: i === refIndex ? 1.5 : 2, dash: i === refIndex ? 'dot' : 'solid' },
        }))}
        layout={{ xaxis: { title: { text: 'Distance (m)' } }, yaxis: { title: { text: 'Gap (s)' } } }}
        height={320}
      />
    </section>
  )
}
