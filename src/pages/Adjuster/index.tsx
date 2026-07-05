// Adjuster (SPEC §5.3): baseline selector + overrides, live predicted time + lap splits +
// overlay vs baseline, save/pin/edit/delete scenarios.

import { useMemo, useState } from 'react'
import { dataStore } from '../../store/DataStore'
import { resolveScenario, resolveScenarioBaseline, runScenario } from '../../store/scenario'
import type { ResolvedScenario, ScenarioBaseline, SolveKey } from '../../store/scenario'
import { SETTINGS_ID, withSettingsDefaults, type Scenario } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import OverrideForm from './OverrideForm'
import type { OverrideFormState } from './OverrideForm'
import ResultPanel from './ResultPanel'
import SavedScenarios from './SavedScenarios'
import SolveForAnything from './SolveForAnything'

function newScenarioId(): string {
  return `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const DEFAULT_STATE: OverrideFormState = {
  baselineRef: 'blank',
  cdaInput: '',
  crrInput: '',
  massInput: '',
  densityInput: '',
  venueOverride: '',
  chainring: 65,
  cog: 15,
  powerMode: 'schedule',
  powerScalePct: '100',
  constantPowerInput: '450',
}

function buildOverrides(state: OverrideFormState): Scenario['overrides'] {
  const o: Scenario['overrides'] = {}
  if (state.cdaInput !== '') o.cdA = Number(state.cdaInput)
  if (state.crrInput !== '') o.crr = Number(state.crrInput)
  if (state.massInput !== '') o.massKg = Number(state.massInput)
  if (state.densityInput !== '') o.airDensity = Number(state.densityInput)
  if (state.venueOverride) o.venueId = state.venueOverride
  o.gear = { chainring: state.chainring, cog: state.cog }
  const isBlank = state.baselineRef === 'blank'
  if (isBlank || state.powerMode === 'constant') {
    if (state.constantPowerInput !== '') o.avgPowerW = Number(state.constantPowerInput)
  } else if (state.powerScalePct !== '' && state.powerScalePct !== '100') {
    o.powerScale = Number(state.powerScalePct) / 100
  }
  return o
}

function describeOverrides(overrides: Scenario['overrides'], baselineSnapshot: ResolvedScenario): string {
  const parts: string[] = []
  if (overrides.cdA != null) parts.push(`CdA ${baselineSnapshot.cdaM2.toFixed(4)}→${overrides.cdA.toFixed(4)}`)
  if (overrides.crr != null) parts.push(`Crr override ${overrides.crr.toFixed(5)}`)
  if (overrides.massKg != null) parts.push(`mass ${overrides.massKg.toFixed(1)} kg`)
  if (overrides.airDensity != null) parts.push(`ρ ${overrides.airDensity.toFixed(4)}`)
  if (overrides.venueId) parts.push(`venue: ${overrides.venueId}`)
  if (overrides.avgPowerW != null) parts.push(`constant ${overrides.avgPowerW.toFixed(0)} W`)
  else if (overrides.powerScale != null) parts.push(`power ×${overrides.powerScale.toFixed(2)}`)
  return parts.length > 0 ? parts.join('; ') : 'No overrides (baseline as-is)'
}

export default function Adjuster() {
  const rides = useCollection(dataStore.rides)
  const venues = useCollection(dataStore.venues)
  const scenarios = useCollection(dataStore.scenarios)
  const settingsRows = useCollection(dataStore.settings)
  const rawSettings = settingsRows.find((s) => s.id === SETTINGS_ID)

  const [state, setState] = useState<OverrideFormState>(DEFAULT_STATE)
  const [scenarioName, setScenarioName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingMeta, setEditingMeta] = useState<{ createdAt: string; pinned: boolean } | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  function handleChange<K extends keyof OverrideFormState>(key: K, value: OverrideFormState[K]) {
    setState((s) => ({ ...s, [key]: value }))
    setSaveMessage(null)
  }

  const settings = rawSettings ? withSettingsDefaults(rawSettings) : undefined

  const baselineResolution: ScenarioBaseline | { error: string } | null = useMemo(() => {
    if (!settings) return null
    return resolveScenarioBaseline(state.baselineRef, rides, venues, settings)
  }, [state.baselineRef, rides, venues, settings])

  // `baselineResolution` can be the string 'blank' — `in` throws on a primitive, so the
  // error case must be checked as an object first.
  const baselineError =
    baselineResolution && typeof baselineResolution === 'object' && 'error' in baselineResolution
      ? baselineResolution.error
      : null
  const baseline: ScenarioBaseline | null = baselineResolution && !baselineError ? (baselineResolution as ScenarioBaseline) : null

  const overrides = useMemo(() => buildOverrides(state), [state])

  const baselineSnapshot: ResolvedScenario | null = useMemo(() => {
    if (!baseline || !settings) return null
    return resolveScenario(baseline, {}, settings, venues)
  }, [baseline, settings, venues])

  const resolved: ResolvedScenario | null = useMemo(() => {
    if (!baseline || !settings) return null
    return resolveScenario(baseline, overrides, settings, venues)
  }, [baseline, overrides, settings, venues])

  const run = useMemo(() => (resolved ? runScenario(resolved) : null), [resolved])
  const baselineRun = useMemo(() => (baselineSnapshot ? runScenario(baselineSnapshot) : null), [baselineSnapshot])

  function handleApplySolved(key: SolveKey, value: number) {
    switch (key) {
      case 'power':
        setState((s) => ({ ...s, powerMode: 'constant', constantPowerInput: value.toFixed(1) }))
        break
      case 'cdA':
        setState((s) => ({ ...s, cdaInput: value.toFixed(4) }))
        break
      case 'crr':
        setState((s) => ({ ...s, crrInput: value.toFixed(5) }))
        break
      case 'massKg':
        setState((s) => ({ ...s, massInput: value.toFixed(1) }))
        break
      case 'rho':
        setState((s) => ({ ...s, densityInput: value.toFixed(4) }))
        break
    }
    setSaveMessage(null)
  }

  async function handleSave() {
    if (!resolved || !run) return
    const now = new Date().toISOString()
    const scenario: Scenario = {
      id: editingId ?? newScenarioId(),
      createdAt: editingMeta?.createdAt ?? now,
      updatedAt: now,
      name: scenarioName || 'Untitled scenario',
      baseline: state.baselineRef,
      overrides,
      result: {
        predictedTimeS: run.predictedTimeS,
        lapSplits: run.lapSplits,
        note: describeOverrides(overrides, baselineSnapshot ?? resolved),
      },
      pinned: editingMeta?.pinned ?? false,
    }
    await dataStore.scenarios.put(scenario)
    setEditingId(scenario.id)
    setEditingMeta({ createdAt: scenario.createdAt, pinned: scenario.pinned })
    setSaveMessage(editingId ? 'Updated.' : 'Saved.')
  }

  function handleNewScenario() {
    setState(DEFAULT_STATE)
    setScenarioName('')
    setEditingId(null)
    setEditingMeta(null)
    setSaveMessage(null)
  }

  function handleLoad(scenario: Scenario) {
    const o = scenario.overrides
    const isBlank = scenario.baseline === 'blank'
    setState({
      baselineRef: scenario.baseline,
      cdaInput: o.cdA != null ? String(o.cdA) : '',
      crrInput: o.crr != null ? String(o.crr) : '',
      massInput: o.massKg != null ? String(o.massKg) : '',
      densityInput: o.airDensity != null ? String(o.airDensity) : '',
      venueOverride: o.venueId ?? '',
      chainring: o.gear?.chainring ?? 65,
      cog: o.gear?.cog ?? 15,
      powerMode: !isBlank && o.avgPowerW == null ? 'schedule' : 'constant',
      powerScalePct: o.powerScale != null ? String(o.powerScale * 100) : '100',
      constantPowerInput: o.avgPowerW != null ? String(o.avgPowerW) : '450',
    })
    setScenarioName(scenario.name)
    setEditingId(scenario.id)
    setEditingMeta({ createdAt: scenario.createdAt, pinned: scenario.pinned })
    setSaveMessage(null)
  }

  async function handleDelete(id: string) {
    const target = scenarios.find((s) => s.id === id)
    if (!window.confirm(`Delete scenario “${target?.name || 'Untitled'}”? This can't be undone.`)) return
    await dataStore.scenarios.delete(id)
    if (editingId === id) handleNewScenario()
  }

  async function handleTogglePin(scenario: Scenario) {
    await dataStore.scenarios.put({ ...scenario, pinned: !scenario.pinned, updatedAt: new Date().toISOString() })
  }

  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Adjuster</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder="Scenario name (e.g. quali −0.010 CdA)"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm sm:w-64"
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!run}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {editingId ? 'Update scenario' : 'Save scenario'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={handleNewScenario}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              New
            </button>
          )}
          {saveMessage && <span className="text-xs text-green-700">{saveMessage}</span>}
        </div>
      </div>

      {baselineError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{baselineError}</div>
      )}

      <OverrideForm
        {...state}
        rides={rides}
        venues={venues}
        baselineSnapshot={baselineSnapshot}
        onChange={handleChange}
      />

      {resolved && run && baselineRun && baseline && (
        <ResultPanel baseline={baseline} resolved={resolved} run={run} baselineRun={baselineRun} />
      )}

      <SolveForAnything resolved={resolved} currentPredictedTimeS={run?.predictedTimeS ?? null} onApply={handleApplySolved} />

      <SavedScenarios
        scenarios={scenarios}
        rides={rides}
        onLoad={handleLoad}
        onDelete={(id) => void handleDelete(id)}
        onTogglePin={(s) => void handleTogglePin(s)}
      />
    </div>
  )
}
