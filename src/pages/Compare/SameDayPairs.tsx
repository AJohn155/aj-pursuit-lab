// Same-day recovery view (owner request 2026-07 round 8): quali → final pairs ridden on
// the same date, compared round-over-round — what did the earlier ride cost? Uses only the
// cached AnalysisResult (no re-analysis), so it renders instantly for every pair.

import { equivalentTimeAtRefDensity } from '../../engine/index'
import type { AnalysisResult } from '../../engine/ingest'
import { resolveRideDensity } from '../../store/density'
import { rideDateTimeKey, withSettingsDefaults, type Ride, type Settings, type Venue } from '../../store/types'
import { T } from '../../components/EditableText'

const STEADY_FIRST_LAP = 3

interface RoundStats {
  ride: Ride
  normalizedTimeS: number
  powerExclLap1: number | null
  cda: number | null
  startTo95: number | null
  /** Mean second-half steady-lap time minus first-half — positive = faded. */
  fadeSPerLap: number | null
}

function fadeSPerLap(analysis: AnalysisResult | undefined): number | null {
  const steady = (analysis?.laps ?? []).slice(STEADY_FIRST_LAP - 1).filter((l) => Number.isFinite(l.timeS))
  if (steady.length < 4) return null
  const times = steady.map((l) => l.timeS)
  const half = Math.floor(times.length / 2)
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
  return mean(times.slice(half)) - mean(times.slice(0, half))
}

/** Hours between two rides' start times on the same date; null when either lacks one. */
function hoursBetween(a: Ride, b: Ride): number | null {
  if (!a.startTime || !b.startTime) return null
  const [ah, am] = a.startTime.split(':').map(Number)
  const [bh, bm] = b.startTime.split(':').map(Number)
  if (![ah, am, bh, bm].every(Number.isFinite)) return null
  return (bh * 60 + bm - (ah * 60 + am)) / 60
}

export default function SameDayPairs({
  rides,
  venues,
  rawSettings,
}: {
  rides: Ride[]
  venues: Venue[]
  rawSettings: Settings
}) {
  const settings = withSettingsDefaults(rawSettings)

  const byDate = new Map<string, Ride[]>()
  for (const r of rides) {
    const list = byDate.get(r.date) ?? []
    list.push(r)
    byDate.set(r.date, list)
  }
  const days = [...byDate.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({
      date,
      rides: [...list].sort((a, b) => rideDateTimeKey(a).localeCompare(rideDateTimeKey(b))),
    }))

  if (days.length === 0) return null

  const stats = (ride: Ride): RoundStats => {
    const { rho } = resolveRideDensity(ride, settings, venues.find((v) => v.id === ride.venueId))
    const a = ride.analysis
    return {
      ride,
      normalizedTimeS: equivalentTimeAtRefDensity(ride.officialTimeS, rho, settings.referenceAirDensity),
      powerExclLap1: a?.avgPowerExclLap1W ?? null,
      cda: a?.cdaRace ?? null,
      startTo95: a?.startMetrics.timeTo95PctCruise ?? null,
      fadeSPerLap: fadeSPerLap(a),
    }
  }
  const venueName = (id: string) => venues.find((v) => v.id === id)?.name ?? '—'

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="text-sm font-semibold text-slate-900" id="compare.samedaypairs.same-day-rounds" d="Same-day rounds (recovery view)" />
      <T as="p" className="mb-3 text-xs text-slate-500" id="compare.samedaypairs.caption" d="Days with 2+ rides, round over round — what the earlier effort cost. Deltas are later round minus earlier. Fade = second-half steady laps vs first-half, s/lap. All numbers come from each ride's saved analysis." />
      <div className="space-y-4">
        {days.map(({ date, rides: dayRides }) => {
          const rounds = dayRides.map(stats)
          return (
            <div key={date} className="rounded-lg border border-slate-100 p-3">
              <p className="mb-2 text-sm font-medium text-slate-800">
                {date} · {venueName(dayRides[0].venueId)}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Round</th>
                      <th className="py-1 pr-3 font-medium">Time</th>
                      <th className="py-1 pr-3 font-medium">Norm. time</th>
                      <th className="py-1 pr-3 font-medium">W excl. L1</th>
                      <th className="py-1 pr-3 font-medium">CdA</th>
                      <th className="py-1 pr-3 font-medium">Start→95%</th>
                      <th className="py-1 pr-3 font-medium">Fade (s/lap)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rounds.map((r, i) => {
                      const prev = i > 0 ? rounds[i - 1] : null
                      const gapH = prev ? hoursBetween(prev.ride, r.ride) : null
                      const delta = (cur: number | null, before: number | null, digits: number, unit: string) => {
                        if (cur == null || before == null) return null
                        const d = cur - before
                        return `${d >= 0 ? '+' : ''}${d.toFixed(digits)}${unit}`
                      }
                      return (
                        <tr key={r.ride.id} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3">
                            <span className="font-medium text-slate-800">{r.ride.eventName || r.ride.round}</span>
                            <span className="ml-1 text-xs text-slate-400">
                              {r.ride.startTime ?? ''}
                              {gapH != null && ` (+${gapH.toFixed(1)} h)`}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600">
                            {r.ride.officialTimeS.toFixed(3)}s
                            {prev && (
                              <span className="block text-xs text-slate-400">
                                {delta(r.ride.officialTimeS, prev.ride.officialTimeS, 3, 's')}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600">
                            {r.normalizedTimeS.toFixed(3)}s
                            {prev && (
                              <span className="block text-xs text-slate-400">
                                {delta(r.normalizedTimeS, prev.normalizedTimeS, 3, 's')}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600">
                            {r.powerExclLap1 != null ? `${r.powerExclLap1.toFixed(0)} W` : '—'}
                            {prev && <span className="block text-xs text-slate-400">{delta(r.powerExclLap1, prev.powerExclLap1, 0, ' W')}</span>}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600">
                            {r.cda != null ? r.cda.toFixed(4) : '—'}
                            {prev && <span className="block text-xs text-slate-400">{delta(r.cda, prev.cda, 4, '')}</span>}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600">
                            {r.startTo95 != null ? `${r.startTo95.toFixed(1)}s` : '—'}
                            {prev && <span className="block text-xs text-slate-400">{delta(r.startTo95, prev.startTo95, 1, 's')}</span>}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600">
                            {r.fadeSPerLap != null ? `${r.fadeSPerLap >= 0 ? '+' : ''}${r.fadeSPerLap.toFixed(2)}` : '—'}
                            {prev && <span className="block text-xs text-slate-400">{delta(r.fadeSPerLap, prev.fadeSPerLap, 2, '')}</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
