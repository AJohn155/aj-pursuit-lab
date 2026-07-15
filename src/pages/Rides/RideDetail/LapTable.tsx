// Lap table (SPEC §5.1): split, official split, Δ vs official, CdA, W — plus the TOTAL
// extra distance vs the 3,250 m interior datum (laps 3–15). Per-lap line height was
// removed on owner request (2026-07 round 10 — the per-lap values never behaved as
// expected; boundary noise dominates them, and on cadence-reconstructed rides they only
// measured the gear guess). The total telescopes over the interior boundaries, so it's
// the robust number and the only one shown; it clamps at 0 (riding under the black line
// is impossible; a negative measurement is a calibration/rollout residual, said out loud).

import type { LapConstruction, LapResult } from '../../../engine/ingest'
import { T } from '../../../components/EditableText'

export default function LapTable({
  laps,
  officialSplits,
  construction,
  windowLaps,
  speedFromCadence = false,
}: {
  laps: LapResult[]
  officialSplits: number[]
  construction: LapConstruction
  /** 1-based laps in the headline CdA window (minus catch exclusions) — rows outside it
   * grey their CdA, matching the chart. */
  windowLaps: number[]
  /** True when speed/distance were reconstructed from cadence — the extra-distance total
   * is then a gear-guess artefact and is suppressed. */
  speedFromCadence?: boolean
}) {
  const rawExtraM = construction.extraDistanceM
  const totalExtraM = Math.max(0, rawExtraM)
  const inWindow = new Set(windowLaps)
  const hasOfficial = officialSplits.length > 0

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="text-sm font-semibold text-slate-900" id="rides.ridedetail.laptable.lap-table" d="Lap table" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-medium">Lap</th>
              <th className="px-2 py-1.5 font-medium">Split</th>
              <th className="px-2 py-1.5 font-medium">Official split</th>
              {hasOfficial && <th className="px-2 py-1.5 font-medium">Δ vs official</th>}
              <th className="px-2 py-1.5 font-medium">CdA</th>
              <th className="px-2 py-1.5 font-medium">W</th>
            </tr>
          </thead>
          <tbody>
            {laps.map((lap, i) => {
              const official = officialSplits[i]
              const delta = official != null && Number.isFinite(lap.timeS) ? lap.timeS - official : null
              const windowed = inWindow.has(i + 1)
              return (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-1.5 text-slate-600">{i + 1}</td>
                  <td className="px-2 py-1.5 text-slate-600">{lap.timeS.toFixed(3)}s</td>
                  <td className="px-2 py-1.5 text-slate-600">
                    {official != null ? `${official.toFixed(3)}s` : '—'}
                  </td>
                  {hasOfficial && (
                    <td className="px-2 py-1.5 text-slate-500">
                      {delta != null ? `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(3)}s` : '—'}
                    </td>
                  )}
                  <td
                    className={`px-2 py-1.5 ${windowed ? 'text-slate-600' : 'text-slate-300'}`}
                    title={windowed ? undefined : 'Outside the headline CdA window (start laps, final lap, or caught-rider exclusion)'}
                  >
                    {Number.isFinite(lap.cda) ? lap.cda.toFixed(4) : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-slate-600">{lap.avgP.toFixed(0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {speedFromCadence ? (
        <T
          as="p"
          className="text-xs text-slate-400"
          id="rides.ridedetail.laptable.extra-distance-cadence"
          d="Extra distance vs. the 3,250 m datum isn't reported for this ride — speed and distance are reconstructed from cadence × gear, so the wheel-distance signal it needs doesn't exist here."
        />
      ) : (
        <p className="text-xs text-slate-600">
          <T
            as="span"
            id="rides.ridedetail.laptable.total-extra-distance"
            d="Extra distance ridden vs. the 3,250 m datum (laps 3–15): {total} m."
            vars={{ total: totalExtraM.toFixed(1) }}
          />
          {rawExtraM < 0 && (
            <>
              {' '}
              <T
                as="span"
                className="text-slate-400"
                id="rides.ridedetail.laptable.clamped-note"
                d="(measured {raw} m — clamped to 0; a negative reading is a calibration/rollout residual, not riding under the black line)"
                vars={{ raw: rawExtraM.toFixed(1) }}
              />
            </>
          )}{' '}
          <T
            as="span"
            id="rides.ridedetail.laptable.laps-excluded-note"
            d="Laps 1–2 and lap 16 are excluded — their boundaries carry too much start/finish uncertainty."
          />
        </p>
      )}
    </section>
  )
}
