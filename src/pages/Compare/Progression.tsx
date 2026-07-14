// Progression view (SPEC §5.2): any metric vs date across all rides, kit tags on hover,
// outdoor rides hollow and excluded from the trendline by default (toggle).

import { useMemo, useState } from 'react'
import { equivalentTimeAtRefDensity } from '../../engine/index'
import { resolveRideDensity } from '../../store/density'
import { rideDateTimeKey, withSettingsDefaults, type Ride, type Settings, type Venue } from '../../store/types'
import Chart from '../../components/Chart'
import { linearTrend } from '../Rides/RideDetail/trend'
import { displayAvgPower, displayPowerExclLap1 } from '../Rides/format'
import { T } from '../../components/EditableText'

type MetricKey = 'timeS' | 'normalizedTimeS' | 'cda' | 'avgW' | 'powerExclLap1' | 'startTimeS' | 'lineHeightM'

const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: 'timeS', label: 'Finish time', unit: 's' },
  { key: 'normalizedTimeS', label: 'Normalized time', unit: 's' },
  { key: 'cda', label: 'CdA', unit: 'm²' },
  { key: 'avgW', label: 'Avg power (recorded)', unit: 'W' },
  { key: 'powerExclLap1', label: 'Power excl. lap 1', unit: 'W' },
  { key: 'startTimeS', label: 'Start time (to 95% cruise)', unit: 's' },
  { key: 'lineHeightM', label: 'Avg line height (laps 3–15)', unit: 'm' },
]

interface Point {
  ride: Ride
  date: string
  /** date + start-time sort key (rideDateTimeKey) — orders same-day rides. */
  dateTime: string
  value: number | null
  outdoor: boolean
  kit: string[]
  eventName: string
}

function metricValue(ride: Ride, key: MetricKey, referenceAirDensity: number, settings: Settings): number | null {
  switch (key) {
    case 'timeS':
      return ride.officialTimeS
    case 'normalizedTimeS': {
      const { rho } = resolveRideDensity(ride, settings)
      return equivalentTimeAtRefDensity(ride.officialTimeS, rho, referenceAirDensity)
    }
    case 'cda':
      return ride.analysis?.cdaRace ?? null
    case 'avgW':
      return ride.analysis ? displayAvgPower(ride.analysis) : (ride.manualAvgPowerW ?? null)
    case 'powerExclLap1':
      return ride.analysis ? displayPowerExclLap1(ride.analysis) : null
    case 'startTimeS':
      return ride.analysis?.startMetrics.timeTo95PctCruise ?? null
    case 'lineHeightM': {
      if (!ride.analysis) return null
      // Interior laps (3–15) only — laps 1–2/16 are NaN by convention (engine ≥0.4.0);
      // pre-0.4.0 caches still carry all-16 finite values, which the filter passes through.
      const finite = ride.analysis.laps.map((l) => l.lineHeightM).filter(Number.isFinite)
      return finite.length > 0 ? finite.reduce((s, h) => s + h, 0) / finite.length : null
    }
  }
}

/**
 * Short per-point label for the chart (owner request 2026-07 round 5, item 4). Event name
 * truncated so labels stay small; the full name remains on hover.
 */
function shortLabel(eventName: string): string {
  const s = eventName.trim() || 'ride'
  return s.length > 14 ? `${s.slice(0, 13)}…` : s
}

/**
 * Greedy non-overlap label placement: points sorted by x get their label above by default;
 * when a point sits close to the previous LABELED point in x, the label flips to the
 * opposite side of the previous one (and to the right as a third option) so neighbouring
 * labels don't stack on each other or on the marker run between them.
 */
function labelPositions(xs: number[], ys: number[]): string[] {
  const positions: string[] = []
  const n = xs.length
  if (n === 0) return positions
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const closeX = Math.max(1, (xMax - xMin) / 12)
  let prevPos = 'bottom center'
  for (let i = 0; i < n; i++) {
    let pos = 'top center'
    if (i > 0 && xs[i] - xs[i - 1] < closeX) {
      pos = prevPos === 'top center' ? 'bottom center' : 'top center'
      // Three-in-a-row pileup (e.g. same-day quali + final + another): push sideways.
      if (i > 1 && xs[i] - xs[i - 2] < closeX && Math.abs(ys[i] - ys[i - 1]) < Math.abs(ys[i] - ys[i - 2])) {
        pos = 'middle right'
      }
    }
    positions.push(pos)
    prevPos = pos
  }
  return positions
}

export default function Progression({ rides, venues, rawSettings }: { rides: Ride[]; venues: Venue[]; rawSettings: Settings }) {
  const [metric, setMetric] = useState<MetricKey>('normalizedTimeS')
  const [includeOutdoor, setIncludeOutdoor] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  // Rides deselected from the chart+trend (owner request 2026-07 round 5, item 4).
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(new Set())

  const settings = withSettingsDefaults(rawSettings)

  const allPoints = useMemo((): Point[] => {
    return rides
      .map((ride) => {
        const venue = venues.find((v) => v.id === ride.venueId)
        return {
          ride,
          date: ride.date,
          dateTime: rideDateTimeKey(ride),
          value: metricValue(ride, metric, settings.referenceAirDensity, settings),
          outdoor: venue ? !venue.indoor : false,
          kit: ride.kit,
          eventName: ride.eventName || 'Untitled ride',
        }
      })
      .filter((p) => p.value != null)
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
  }, [rides, venues, metric, settings])

  const points = allPoints.filter((p) => !excludedIds.has(p.ride.id))
  const trendPoints = points.filter((p) => includeOutdoor || !p.outdoor)
  const trend =
    trendPoints.length >= 2
      ? linearTrend(
          trendPoints.map((p) => Date.parse(p.date)),
          trendPoints.map((p) => p.value as number),
        )
      : null

  const metricInfo = METRICS.find((m) => m.key === metric)!

  if (rides.length === 0) return null

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <T as="h2" className="text-sm font-semibold text-slate-900" id="compare.progression.progression" d="Progression" />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={includeOutdoor} onChange={(e) => setIncludeOutdoor(e.target.checked)} />
            Include outdoor rides in trendline
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
            Labels
          </label>
        </div>
      </div>
      {allPoints.length > 0 && (
        <details className="mb-2 text-xs text-slate-600" open={excludedIds.size > 0}>
          <summary className="cursor-pointer select-none">
            Rides in chart ({points.length}/{allPoints.length})
            {excludedIds.size > 0 && ` — ${excludedIds.size} deselected`}
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {allPoints.map((p) => (
              <label key={p.ride.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!excludedIds.has(p.ride.id)}
                  onChange={(e) => {
                    const next = new Set(excludedIds)
                    if (e.target.checked) next.delete(p.ride.id)
                    else next.add(p.ride.id)
                    setExcludedIds(next)
                  }}
                />
                {p.eventName} ({p.date})
              </label>
            ))}
          </div>
        </details>
      )}
      {points.length === 0 ? (
        <p className="text-sm text-slate-500">No rides have this metric yet.</p>
      ) : (
        <Chart
          ariaLabel={`${metricInfo.label} versus date across all rides; hollow markers are outdoor rides`}
          data={[
            {
              type: 'scatter',
              mode: showLabels ? 'text+markers' : 'markers',
              x: points.map((p) => p.date),
              y: points.map((p) => p.value as number),
              text: showLabels ? points.map((p) => shortLabel(p.eventName)) : undefined,
              // Plotly accepts a per-point textposition array at runtime; the type only
              // admits the scalar form, hence the cast.
              textposition: showLabels
                ? (labelPositions(
                    points.map((p) => Date.parse(p.dateTime)),
                    points.map((p) => p.value as number),
                  ) as unknown as 'top center')
                : undefined,
              textfont: { size: 9, color: '#94a3b8' },
              hovertext: points.map((p) => `${p.eventName}${p.kit.length ? `<br>Kit: ${p.kit.join(', ')}` : ''}`),
              hovertemplate: '%{x}<br>%{y}<br>%{hovertext}<extra></extra>',
              marker: {
                size: 9,
                color: points.map((p) => (p.outdoor ? 'rgba(0,0,0,0)' : '#2563eb')),
                line: { color: '#2563eb', width: 1.5 },
              },
              name: metricInfo.label,
            },
            ...(trend
              ? [
                  {
                    type: 'scatter' as const,
                    mode: 'lines' as const,
                    x: [trendPoints[0].date, trendPoints[trendPoints.length - 1].date],
                    y: [
                      trend.intercept + trend.slope * Date.parse(trendPoints[0].date),
                      trend.intercept + trend.slope * Date.parse(trendPoints[trendPoints.length - 1].date),
                    ],
                    line: { color: '#dc2626', dash: 'dash' as const },
                    name: 'Trend',
                  },
                ]
              : []),
          ]}
          layout={{
            // Same-day rides (e.g. a quali and final) give Plotly's date axis a zero
            // range to auto-tick, which without an explicit format zooms to sub-second
            // labels. tickformat keeps it readable regardless of how many rides share a day.
            xaxis: { title: { text: 'Date' }, type: 'date', tickformat: '%Y-%m-%d' },
            yaxis: { title: { text: metricInfo.unit } },
          }}
          height={340}
        />
      )}
    </section>
  )
}
