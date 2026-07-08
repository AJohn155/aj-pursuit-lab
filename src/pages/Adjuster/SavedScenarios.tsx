// Saved scenarios list (SPEC §5.3): view (read-only overview, no form churn), load back
// into the form for iteration (update in place or save-as-new — owner request 2026-07
// round 4, item 12), delete, pin. Pinned scenarios are what Compare picks up (SPEC §3.4
// "pinned scenarios appear as ghost lines in progression/compare charts").

import { useState } from 'react'
import type { Ride, Scenario } from '../../store/types'
import { T } from '../../components/EditableText'

const OVERRIDE_LABELS: Record<string, string> = {
  cdA: 'CdA (m²)',
  avgPowerW: 'Settle power (W)',
  powerScale: 'Power scale',
  crr: 'Crr',
  massKg: 'Mass (kg)',
  airDensity: 'Air density (kg/m³)',
  venueId: 'Venue',
  startLapS: 'Start lap (s)',
}

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
  const [viewingId, setViewingId] = useState<string | null>(null)

  if (scenarios.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <T as="h2" className="mb-1 text-sm font-semibold text-slate-900" id="adjuster.savedscenarios.saved-scenarios" d="Saved scenarios" />
        <p className="text-sm text-slate-500">None yet — save one above.</p>
      </section>
    )
  }

  const baselineLabel = (baseline: string) => {
    if (baseline === 'blank') return 'Blank'
    const ride = rides.find((r) => r.id === baseline)
    if (!ride) return 'Deleted ride'
    return `${ride.eventName || 'Untitled ride'} — ${ride.date} (${ride.officialTimeS.toFixed(3)}s)`
  }

  const sorted = [...scenarios].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="mb-2 text-sm font-semibold text-slate-900" id="adjuster.savedscenarios.saved-scenarios-2" d="Saved scenarios" />
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
              <ScenarioRow
                key={s.id}
                scenario={s}
                baselineLabel={baselineLabel(s.baseline)}
                viewing={viewingId === s.id}
                onToggleView={() => setViewingId((v) => (v === s.id ? null : s.id))}
                onLoad={() => onLoad(s)}
                onDelete={() => onDelete(s.id)}
                onTogglePin={() => onTogglePin(s)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <T as="p" className="mt-2 text-xs text-slate-400" id="adjuster.savedscenarios.view-shows-a-scenario-without" d="View shows a scenario without touching the form; Load pulls it into the form, where you can Update it in place or Save-as-new to keep iterations." />
    </section>
  )
}

function ScenarioRow({
  scenario: s,
  baselineLabel,
  viewing,
  onToggleView,
  onLoad,
  onDelete,
  onTogglePin,
}: {
  scenario: Scenario
  baselineLabel: string
  viewing: boolean
  onToggleView: () => void
  onLoad: () => void
  onDelete: () => void
  onTogglePin: () => void
}) {
  const overrideEntries = Object.entries(s.overrides).filter(([k, v]) => v != null && k !== 'gear')

  return (
    <>
      <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
        <td className="px-3 py-2">
          <p className="font-medium text-slate-900">{s.name}</p>
          <p className="text-xs text-slate-500">{s.result?.note}</p>
        </td>
        <td className="px-3 py-2 text-slate-600">{baselineLabel}</td>
        <td className="px-3 py-2 text-slate-600">{s.result ? `${s.result.predictedTimeS.toFixed(3)}s` : '—'}</td>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={onTogglePin}
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
              onClick={onToggleView}
              className={`rounded-lg border px-2 py-1 text-xs font-medium ${
                viewing ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {viewing ? 'Hide' : 'View'}
            </button>
            <button
              type="button"
              onClick={onLoad}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Load
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </td>
      </tr>
      {viewing && (
        <tr className="border-b border-slate-100 bg-slate-50/60 last:border-0">
          <td colSpan={5} className="px-3 py-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              <Detail label="Baseline" value={baselineLabel} />
              <Detail label="Predicted time" value={s.result ? `${s.result.predictedTimeS.toFixed(3)}s` : '—'} />
              <Detail
                label="Gear"
                value={s.overrides.gear ? `${s.overrides.gear.chainring}×${s.overrides.gear.cog}` : '—'}
              />
              <Detail label="Last saved" value={s.updatedAt.slice(0, 16).replace('T', ' ')} />
              {overrideEntries.length === 0 ? (
                <Detail label="Overrides" value="None (baseline as-is)" />
              ) : (
                overrideEntries.map(([k, v]) => (
                  <Detail
                    key={k}
                    label={OVERRIDE_LABELS[k] ?? k}
                    value={typeof v === 'number' ? String(v) : String(v)}
                  />
                ))
              )}
            </div>
            {s.result && s.result.lapSplits.length > 0 && (
              <div className="mt-3">
                <T as="p" className="mb-1 text-xs font-semibold uppercase text-slate-500" id="adjuster.savedscenarios.predicted-lap-splits" d="Predicted lap splits" />
                <p className="font-mono text-xs text-slate-600">
                  {s.result.lapSplits.map((x) => x.toFixed(2)).join(' · ')}
                </p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  )
}
