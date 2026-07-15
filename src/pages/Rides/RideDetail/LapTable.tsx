// Lap table (SPEC §5.1): split, official split, CdA, line height, W — plus the total
// extra distance the line heights imply (owner request 2026-07: "show extra meters
// traveled total"). Line height covers the interior laps 3–15 only, and the displayed
// total clamps at 0 (riding under the black line is impossible; a negative measurement is
// a calibration/rollout residual and is said out loud rather than shown as real).

import type { LapConstruction, LapResult } from '../../../engine/ingest'
import { T } from '../../../components/EditableText'

const LINE_HEIGHT_DEGENERATE_SPREAD_M = 0.001

export default function LapTable({
  laps,
  officialSplits,
  construction,
}: {
  laps: LapResult[]
  officialSplits: number[]
  construction: LapConstruction
}) {
  const heights = laps.map((l) => l.lineHeightM).filter(Number.isFinite)
  const heightSpread = heights.length > 0 ? Math.max(...heights) - Math.min(...heights) : 0
  const rawExtraM = construction.extraDistanceM
  const totalExtraM = Math.max(0, rawExtraM)
  const officialAnchored = construction.lineHeightFromOfficialSplits

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
              <th className="px-2 py-1.5 font-medium">CdA</th>
              <th className="px-2 py-1.5 font-medium">Line height</th>
              <th className="px-2 py-1.5 font-medium">W</th>
            </tr>
          </thead>
          <tbody>
            {laps.map((lap, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-1.5 text-slate-600">{i + 1}</td>
                <td className="px-2 py-1.5 text-slate-600">{lap.timeS.toFixed(3)}s</td>
                <td className="px-2 py-1.5 text-slate-600">
                  {officialSplits[i] != null ? `${officialSplits[i].toFixed(3)}s` : '—'}
                </td>
                <td className="px-2 py-1.5 text-slate-600">
                  {Number.isFinite(lap.cda) ? lap.cda.toFixed(4) : '—'}
                </td>
                <td className="px-2 py-1.5 text-slate-600">
                  {Number.isFinite(lap.lineHeightM) ? `${lap.lineHeightM.toFixed(3)}m` : '—'}
                </td>
                <td className="px-2 py-1.5 text-slate-600">{lap.avgP.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600">
        <T
          as="span"
          id="rides.ridedetail.laptable.total-extra-distance"
          d="Total extra distance vs. the datum line (laps 3–15): {total} m."
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
          d="Laps 1–2 and the last lap are excluded — their boundaries carry too much start/finish uncertainty to interpret as line height."
        />
      </p>
      {officialAnchored ? (
        <T as="p" className="text-xs text-slate-400" id="rides.ridedetail.laptable.per-lap-values-are-anchored" d="Per-lap values are anchored on your official splits. Individual laps still carry ~±0.5 m of boundary noise (adjacent laps anti-correlate) — the average and total above are the robust numbers, since boundary errors cancel in the sum." />
      ) : (
        heightSpread < LINE_HEIGHT_DEGENERATE_SPREAD_M && (
          <T as="p" className="text-xs text-slate-400" id="rides.ridedetail.laptable.line-height-is-nearly-identical" d="Line height is nearly identical across laps because without official splits, lap boundaries come from the whole-race calibration factor, which forces each lap&apos;s raw distance to the same value by construction. Add official splits (Edit details) to get genuinely per-lap values." />
        )
      )}
    </section>
  )
}
