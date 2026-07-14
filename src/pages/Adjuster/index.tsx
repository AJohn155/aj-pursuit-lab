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
import { T } from '../../components/EditableText'

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
  // A blank baseline has no real pacing to scale, and the flat "constant target (W)" mode
  // was removed (owner request 2026-07 round 4, item 11) — start split + settle power is
  // the only sensible default.
  powerMode: 'startSplit',
  powerScalePct: '100',
  constantPowerInput: '450',
  startLapInput: '21.5',
}

/** A field only becomes an override once it holds a positive finite number — typing the
 * "0" of "0.17" (owner bug report 2026-07 round 7: the page went blank) must keep the
 * baseline value, not simulate zero drag. */
function positive(input: string): number | undefined {
  if (input === '') return undefined
  const v = Number(input)
  return Number.isFinite(v) && v > 0 ? v : undefined
}

function buildOverrides(state: OverrideFormState): Scenario['overrides'] {
  // Keys are only ever set to defined values (never explicit undefined) — Firestore sync
  // rejects undefined fields on saved scenarios.
  const o: Scenario['overrides'] = {}
  const cdA = positive(state.cdaInput)
  if (cdA != null) o.cdA = cdA
  const crr = positive(state.crrInput)
  if (crr != null) o.crr = crr
  const massKg = positive(state.massInput)
  if (massKg != null) o.massKg = massKg
  const airDensity = positive(state.densityInput)
  if (airDensity != null) o.airDensity = airDensity
  if (state.venueOverride) o.venueId = state.venueOverride
  if (state.chainring > 0 && state.cog > 0) o.gear = { chainring: state.chainring, cog: state.cog }
  const isBlank = state.baselineRef === 'blank'
  // Blank baselines are always start-split (no recording to scale); the UI enforces this
  // but the state can lag a baseline switch by one event.
  if (state.powerMode === 'startSplit' || isBlank) {
    const avgPowerW = positive(state.constantPowerInput)
    if (avgPowerW != null) o.avgPowerW = avgPowerW
    const startLapS = positive(state.startLapInput)
    if (startLapS != null) o.startLapS = startLapS
  } else if (state.powerScalePct !== '' && state.powerScalePct !== '100') {
    const scale = positive(state.powerScalePct)
    if (scale != null) o.powerScale = scale / 100
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
  if (overrides.avgPowerW != null && overrides.startLapS != null)
    parts.push(`start ${overrides.startLapS.toFixed(1)} s + settle ${overrides.avgPowerW.toFixed(0)} W`)
  else if (overrides.avgPowerW != null) parts.push(`constant ${overrides.avgPowerW.toFixed(0)} W (legacy)`)
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
    setState((s) => {
      const next = { ...s, [key]: value }
      // Switching to a blank baseline while in schedule mode: there's no recording to
      // scale, so fall to the start-split model.
      if (key === 'baselineRef' && value === 'blank' && next.powerMode === 'schedule') next.powerMode = 'startSplit'
      return next
    })
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

  // The live simulation runs on every keystroke — a value the guards above didn't
  // anticipate must degrade to "no prediction", never take down the whole page (owner bug
  // report 2026-07 round 7: typing in the CdA field blanked the app).
  const { resolved, run, simError } = useMemo((): {
    resolved: ResolvedScenario | null
    run: ReturnType<typeof runScenario> | null
    simError: string | null
  } => {
    if (!baseline || !settings) return { resolved: null, run: null, simError: null }
    try {
      const resolved = resolveScenario(baseline, overrides, settings, venues)
      return { resolved, run: runScenario(resolved), simError: null }
    } catch (e) {
      return { resolved: null, run: null, simError: e instanceof Error ? e.message : String(e) }
    }
  }, [baseline, overrides, settings, venues])

  const baselineRun = useMemo(() => {
    if (!baselineSnapshot) return null
    try {
      return runScenario(baselineSnapshot)
    } catch {
      return null
    }
  }, [baselineSnapshot])

  function handleApplySolved(key: SolveKey, value: number) {
    switch (key) {
      case 'power':
        // Constant mode is gone (round 4 item 11) — a solved power lands in the start-split
        // model's settle-power field, keeping the current expected start lap.
        setState((s) => ({ ...s, powerMode: 'startSplit', constantPowerInput: value.toFixed(1) }))
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

  /**
   * `asNew` forks the loaded scenario into a fresh one (owner request 2026-07 round 4,
   * item 12: load → tweak → either update in place or save an iteration).
   */
  async function handleSave(asNew = false) {
    if (!resolved || !run) return
    const now = new Date().toISOString()
    const updating = editingId != null && !asNew
    let name = scenarioName || 'Untitled scenario'
    // Forking without renaming first would leave two identically-named scenarios — mark
    // the fork so they're tellable apart in the list.
    if (asNew && editingId != null && scenarios.find((s) => s.id === editingId)?.name === name) name = `${name} (copy)`
    const scenario: Scenario = {
      id: updating ? editingId : newScenarioId(),
      createdAt: updating ? (editingMeta?.createdAt ?? now) : now,
      updatedAt: now,
      name,
      baseline: state.baselineRef,
      overrides,
      result: {
        predictedTimeS: run.predictedTimeS,
        lapSplits: run.lapSplits,
        note: describeOverrides(overrides, baselineSnapshot ?? resolved),
      },
      pinned: updating ? (editingMeta?.pinned ?? false) : false,
    }
    await dataStore.scenarios.put(scenario)
    setEditingId(scenario.id)
    setEditingMeta({ createdAt: scenario.createdAt, pinned: scenario.pinned })
    setScenarioName(scenario.name)
    setSaveMessage(updating ? 'Updated.' : 'Saved.')
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
      // Constant mode is gone (round 4 item 11): a legacy constant-power scenario
      // (avgPowerW without startLapS) loads as start-split with the default start lap —
      // its stored result is untouched until re-saved.
      powerMode: !isBlank && o.avgPowerW == null ? 'schedule' : 'startSplit',
      powerScalePct: o.powerScale != null ? String(o.powerScale * 100) : '100',
      constantPowerInput: o.avgPowerW != null ? String(o.avgPowerW) : '450',
      startLapInput: o.startLapS != null ? String(o.startLapS) : '21.5',
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
        <T as="h1" className="text-2xl font-semibold text-slate-900" id="adjuster.index.adjuster" d="Adjuster" />
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
              onClick={() => void handleSave(true)}
              disabled={!run}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              Save as new
            </button>
          )}
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
      {simError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          These values can't be simulated yet ({simError}) — finish typing or correct the field; the
          prediction resumes automatically.
        </div>
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
