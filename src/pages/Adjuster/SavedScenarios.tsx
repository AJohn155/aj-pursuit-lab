// Saved scenarios list (SPEC §5.3): edit (load back into the form)/delete/pin. Pinned
// scenarios are what Compare picks up (SPEC §3.4 "pinned scenarios appear as ghost lines
// in progression/compare charts").

import type { Ride, Scenario } from '../../store/types'

export default function SavedScenarios({
  scenarios,
  rides,
  onLoad,
  onDelete,
  onTogglePin,
}: {
  scenarios: Scenario[]
  rides: Ride[]
  onLoad: (scenario: Scenario) => void
  onDelete: (id: string) => void
  onTogglePin: (scenario: Scenario) => void
}) {
  if (scenarios.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Saved scenarios</h2>
        <p className="text-sm text-slate-500">None yet — save one above.</p>
      </section>
    )
  }

  const baselineLabel = (baseline: string) =>
    baseline === 'blank' ? 'Blank' : (rides.find((r) => r.id === baseline)?.eventName ?? 'Untitled ride') || 'Untitled ride'

  const sorted = [...scenarios].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Saved scenarios</h2>
      <div className="overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Baseline</th>
              <th className="px-3 py-2 font-medium">Predicted</th>
              <th className="px-3 py-2 font-medium">Pinned</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.result?.note}</p>
                </td>
                <td className="px-3 py-2 text-slate-600">{baselineLabel(s.baseline)}</td>
                <td className="px-3 py-2 text-slate-600">
                  {s.result ? `${s.result.predictedTimeS.toFixed(3)}s` : '—'}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onTogglePin(s)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.pinned ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {s.pinned ? 'Pinned' : 'Pin'}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onLoad(s)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(s.id)}
                      className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
