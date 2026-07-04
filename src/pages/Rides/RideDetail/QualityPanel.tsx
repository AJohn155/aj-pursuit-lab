// Quality panel (SPEC §4.16 / §5.1): badge + score + specific flags.

import type { QualityBadge, QualityFlag } from '../../../engine/ingest'
import { BADGE_CLASSES } from '../format'

export default function QualityPanel({
  score,
  badge,
  flags,
}: {
  score: number
  badge: QualityBadge
  flags: QualityFlag[]
}) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Data quality</h2>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${BADGE_CLASSES[badge]}`}>
          {score.toFixed(0)} / 100
        </span>
      </div>
      {flags.length === 0 ? (
        <p className="text-sm text-slate-500">No quality issues detected.</p>
      ) : (
        <ul className="space-y-1 text-sm text-slate-600">
          {flags.map((f) => (
            <li key={f.code} className="flex justify-between gap-3">
              <span>{f.message}</span>
              <span className="shrink-0 text-slate-400">−{f.deduction.toFixed(0)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
