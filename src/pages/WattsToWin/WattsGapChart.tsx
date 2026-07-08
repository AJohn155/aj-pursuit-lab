// Gap to winner in WATTS across events (owner request 2026-07 round 4, item 13): for each
// linked ride at each event, the extra settle watts needed to beat the event's best winner
// (same model-to-model convention as the records table — watts.ts), plotted over event
// date. Checkboxes pick which rides appear.

import { useMemo, useState } from 'react'
import Chart from '../../components/Chart'
import type { Event, Ride, Settings, Venue } from '../../store/types'
import { buildRideModel, wattsToBeat } from './watts'
import { T } from '../../components/EditableText'

interface GapPoint {
  key: string
  date: string
  eventName: string
  rideLabel: string
  deltaW: number
  gapS: number
}

export default function WattsGapChart({
  events,
  rides,
  venues,
  settings,
}: {
  events: Event[]
  rides: Ride[]
  venues: Venue[]
  settings: Settings
}) {
  const points = useMemo((): GapPoint[] => {
    const out: GapPoint[] = []
    for (const event of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
      const winnerTimes = event.winners.map((w) => w.timeS).filter((t) => Number.isFinite(t) && t > 0)
      if (winnerTimes.length === 0) continue
      const winnerBestS = Math.min(...winnerTimes)
      for (const rideId of event.myRideIds) {
        const ride = rides.find((r) => r.id === rideId)
        if (!ride) continue
        const built = buildRideModel(ride, venues, settings)
        if ('error' in built) continue
        const beat = wattsToBeat(winnerBestS, built.model)
        if (!beat) continue
        out.push({
          key: `${event.id}:${ride.id}`,
          date: event.date,
          eventName: event.name || 'Untitled event',
          rideLabel: `${ride.eventName || 'Untitled ride'} (${ride.officialTimeS.toFixed(3)}s)`,
          deltaW: beat.deltaW,
          gapS: ride.officialTimeS - winnerBestS,
        })
      }
    }
    return out
  }, [events, rides, venues, settings])

  // Default: everything shown; unchecking hides. Stored as an exclusion set so newly
  // added rides/events appear without needing to be re-checked.
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  if (points.length === 0) return null
  const shown = points.filter((p) => !hidden.has(p.key))

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="text-sm font-semibold text-slate-900" id="wattstowin.wattsgapchart.gap-to-winner-in-watts" d="Gap to winner in watts" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        {points.map((p) => (
          <label key={p.key} className="flex items-center gap-1.5">
            <input type="checkbox" checked={!hidden.has(p.key)} onChange={() => toggle(p.key)} />
            {p.eventName}: {p.rideLabel}
          </label>
        ))}
      </div>
      {shown.length > 0 && (
        <Chart
          ariaLabel="Extra settle watts needed to beat each event's best winner, per ride, over time"
          data={[
            {
              type: 'scatter',
              mode: 'lines+markers',
              x: shown.map((p) => p.date),
              y: shown.map((p) => p.deltaW),
              text: shown.map((p) => `${p.eventName}<br>${p.rideLabel}<br>gap ${p.gapS >= 0 ? '+' : ''}${p.gapS.toFixed(3)}s`),
              hovertemplate: '%{text}<br><b>%{y:.0f} W</b><extra></extra>',
              name: 'Watts to beat winner',
              marker: { size: 9, color: '#7c3aed' },
              line: { color: '#c4b5fd', dash: 'dot' },
            },
          ]}
          layout={{
            xaxis: { type: 'date', tickformat: '%Y-%m-%d' },
            yaxis: { title: { text: 'Extra settle watts to beat winner' }, zeroline: true },
            shapes: [{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0, y1: 0, line: { color: '#94a3b8', dash: 'dot' } }],
          }}
          height={280}
        />
      )}
      <T as="p" className="text-xs text-slate-400" id="wattstowin.wattsgapchart.extra-settle-watts-same-start" d="Extra settle watts (same start lap as ridden, model-to-model — see the records table) to beat each event's best winner time. 0 = you'd have won on the day." />
    </section>
  )
}
