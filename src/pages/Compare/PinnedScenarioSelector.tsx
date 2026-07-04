// Pinned scenario picker for Compare (SPEC §3.4/§5.2: "pinned scenarios appear as ghost
// lines in progression/compare charts"). Same ordered-array selection model as
// RideSelector — the two share one `selectedIds` array so a scenario can be the reference
// too, prefixed `scenario:` vs `ride:` to disambiguate the two collections.

import type { Scenario } from '../../store/types'
import { colorFor } from './compare'

export default function PinnedScenarioSelector({
  scenarios,
  selectedIds,
  onChange,
}: {
  scenarios: Scenario[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const pinned = scenarios.filter((s) => s.pinned)
  if (pinned.length === 0) return null

  function toggle(key: string) {
    if (selectedIds.includes(key)) onChange(selectedIds.filter((x) => x !== key))
    else onChange([...selectedIds, key])
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Pinned scenarios</h2>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-100">
        <table className="w-full min-w-[420px] text-left text-sm">
          <tbody>
            {pinned.map((scenario) => {
              const key = `scenario:${scenario.id}`
              const idx = selectedIds.indexOf(key)
              const selected = idx >= 0
              return (
                <tr
                  key={scenario.id}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${selected ? 'bg-slate-50' : ''}`}
                  onClick={() => toggle(key)}
                >
                  <td className="w-8 px-3 py-2">
                    <input type="checkbox" checked={selected} readOnly className="h-4 w-4" />
                  </td>
                  <td className="w-8 px-1 py-2">
                    {selected && <span className="inline-block h-3 w-3 rounded-full" style={{ background: colorFor(idx) }} />}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-900">{scenario.name}</span>
                    <span className="ml-2 text-xs text-slate-500">{scenario.result?.note}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {scenario.result ? `${scenario.result.predictedTimeS.toFixed(3)}s` : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {selected ? (idx === 0 ? 'Reference' : `#${idx + 1}`) : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
