// At-a-glance summary of every saved event (owner request 2026-07 item 5): my best linked
// time vs the winner's best per event, and how the gap to the winner trends across events.

import Chart from '../../components/Chart'
import type { Event, Ride } from '../../store/types'
import { T } from '../../components/EditableText'

interface SummaryRow {
  event: Event
  date: string
  winnerBestS: number | null
  myBestS: number | null
  gapS: number | null
}

function buildRows(events: Event[], rides: Ride[]): SummaryRow[] {
  return [...events]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((event) => {
      const winnerTimes = event.winners.map((w) => w.timeS).filter((t) => Number.isFinite(t) && t > 0)
      const myTimes = event.myRideIds
        .map((id) => rides.find((r) => r.id === id)?.officialTimeS)
        .filter((t): t is number => t != null && Number.isFinite(t))
      const winnerBestS = winnerTimes.length > 0 ? Math.min(...winnerTimes) : null
      const myBestS = myTimes.length > 0 ? Math.min(...myTimes) : null
      return {
        event,
        date: event.date,
        winnerBestS,
        myBestS,
        gapS: winnerBestS != null && myBestS != null ? myBestS - winnerBestS : null,
      }
    })
}

export default function EventsSummary({ events, rides }: { events: Event[]; rides: Ride[] }) {
  const rows = buildRows(events, rides)
  const plotRows = rows.filter((r) => r.myBestS != null && r.winnerBestS != null)
  if (rows.length < 1) return null

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="text-sm font-semibold text-slate-900" id="wattstowin.eventssummary.all-events-at-a-glance" d="All events at a glance" />
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Event</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">My best</th>
              <th className="px-3 py-2 font-medium">Winner</th>
              <th className="px-3 py-2 font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.event.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium text-slate-800">{r.event.name || 'Untitled event'}</td>
                <td className="px-3 py-2 text-slate-600">{r.date}</td>
                <td className="px-3 py-2 text-slate-600">{r.myBestS != null ? `${r.myBestS.toFixed(3)}s` : '—'}</td>
                <td className="px-3 py-2 text-slate-600">
                  {r.winnerBestS != null ? `${r.winnerBestS.toFixed(3)}s` : '—'}
                </td>
                <td
                  className={`px-3 py-2 font-medium ${
                    r.gapS == null ? 'text-slate-400' : r.gapS > 0 ? 'text-red-700' : 'text-green-700'
                  }`}
                >
                  {r.gapS != null ? `${r.gapS > 0 ? '+' : ''}${r.gapS.toFixed(3)}s` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {plotRows.length >= 2 && (
        <Chart
          ariaLabel="My best time and the winner's time per event over time, with the gap to the winner"
          data={[
            {
              type: 'scatter',
              mode: 'lines+markers',
              x: plotRows.map((r) => r.date),
              y: plotRows.map((r) => r.myBestS),
              name: 'My best',
              line: { color: '#7c3aed' },
            },
            {
              type: 'scatter',
              mode: 'lines+markers',
              x: plotRows.map((r) => r.date),
              y: plotRows.map((r) => r.winnerBestS),
              name: 'Winner',
              line: { color: '#0ea5e9', dash: 'dot' },
            },
            {
              type: 'bar',
              x: plotRows.map((r) => r.date),
              y: plotRows.map((r) => r.gapS),
              name: 'Gap to winner (s)',
              yaxis: 'y2',
              marker: { color: 'rgba(236, 72, 153, 0.45)' },
            },
          ]}
          layout={{
            xaxis: { type: 'date', tickformat: '%Y-%m-%d', domain: [0, 0.94] },
            yaxis: { title: { text: 'Time (s)' } },
            yaxis2: { overlaying: 'y', side: 'right', title: { text: 'Gap (s)' }, showgrid: false, rangemode: 'tozero' },
            barmode: 'overlay',
          }}
          height={300}
        />
      )}
    </section>
  )
}
