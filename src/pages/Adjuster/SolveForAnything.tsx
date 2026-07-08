// Solve for anything (SPEC §4.11): given the current scenario's other parameters fixed,
// bisect for the one field that would hit a target time. "Apply" writes the solved value
// back into the matching override field, so a solve naturally becomes a new scenario.

import { useState } from 'react'
import { SOLVE_KEY_LABELS, solveScenarioUnknown } from '../../store/scenario'
import type { ResolvedScenario, SolveKey } from '../../store/scenario'
import { T } from '../../components/EditableText'

const SOLVE_KEYS: SolveKey[] = ['power', 'cdA', 'crr', 'massKg', 'rho']

export default function SolveForAnything({
  resolved,
  currentPredictedTimeS,
  onApply,
}: {
  resolved: ResolvedScenario | null
  currentPredictedTimeS: number | null
  onApply: (key: SolveKey, value: number) => void
}) {
  const [key, setKey] = useState<SolveKey>('power')
  const [targetTimeInput, setTargetTimeInput] = useState('')
  const [solved, setSolved] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleSolve() {
    setError(null)
    setSolved(null)
    if (!resolved) return
    const target = Number.parseFloat(targetTimeInput)
    if (!Number.isFinite(target) || target <= 0) {
      setError('Enter a positive target time.')
      return
    }
    try {
      setSolved(solveScenarioUnknown(key, target, resolved))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="text-sm font-semibold text-slate-900" id="adjuster.solveforanything.solve-for-anything" d="Solve for anything" />
      <T as="p" className="text-xs text-slate-500" id="adjuster.solveforanything.holding-everything-else-at-the" d="Holding everything else at the current scenario's values, solve for the field that hits a target time." />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">
          <span className="mb-1 block">Solve for</span>
          <select
            value={key}
            onChange={(e) => {
              setKey(e.target.value as SolveKey)
              setSolved(null)
            }}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            {SOLVE_KEYS.map((k) => (
              <option key={k} value={k}>
                {SOLVE_KEY_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-600">
          <span className="mb-1 block">Target time (s)</span>
          <input
            type="number"
            step="0.001"
            value={targetTimeInput}
            onChange={(e) => setTargetTimeInput(e.target.value)}
            placeholder={currentPredictedTimeS ? currentPredictedTimeS.toFixed(3) : ''}
            className="w-36 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={handleSolve}
          disabled={!resolved}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Solve
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {solved != null && (
        <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-sm">
            <span className="font-medium text-slate-700">{SOLVE_KEY_LABELS[key]}:</span>{' '}
            <span className="font-semibold text-slate-900">{solved.toFixed(key === 'cdA' || key === 'rho' ? 4 : key === 'crr' ? 5 : 1)}</span>
          </p>
          <button
            type="button"
            onClick={() => onApply(key, solved)}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Apply to override
          </button>
        </div>
      )}
    </section>
  )
}
