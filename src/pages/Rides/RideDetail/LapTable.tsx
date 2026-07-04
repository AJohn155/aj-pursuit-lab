// Lap table (SPEC §5.1): split, official split, CdA, line height, W.

import type { LapResult } from '../../../engine/ingest'

const LINE_HEIGHT_DEGENERATE_SPREAD_M = 0.001

export default function LapTable({ laps, officialSplits }: { laps: LapResult[]; officialSplits: number[] }) {
  const heights = laps.map((l) => l.lineHeightM)
  const heightSpread = Math.max(...heights) - Math.min(...heights)

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Lap table</h2>
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
                <td className="px-2 py-1.5 text-slate-600">{lap.lineHeightM.toFixed(3)}m</td>
                <td className="px-2 py-1.5 text-slate-600">{lap.avgP.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {heightSpread < LINE_HEIGHT_DEGENERATE_SPREAD_M && (
        <p className="text-xs text-slate-400">
          Line height is nearly identical across laps because lap boundaries are currently
          placed using the whole-race calibration factor, which forces each lap's raw
          distance to the same value by construction. Genuine per-lap variation needs
          boundaries anchored independently of that calibration (§4.7.3 oscillation-peak
          detection, not yet implemented) — this column will show real drift once that
          lands.
        </p>
      )}
    </section>
  )
}
