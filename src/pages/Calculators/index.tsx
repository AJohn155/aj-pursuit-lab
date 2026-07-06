// Calculators (SPEC §5.8): Cadence, Power for speed, Watts saved (aero), Time adjuster —
// ports of the owner's spreadsheets, sharing the P2 engine math (engine/calculators.ts).

import { useSearchParams } from 'react-router-dom'
import { dataStore } from '../../store/DataStore'
import { SETTINGS_ID, withSettingsDefaults } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import Gains from '../Gains'
import CadenceCalculator from './CadenceCalculator'
import PowerForSpeedCalculator from './PowerForSpeedCalculator'
import ScheduleBuilderCalculator from './ScheduleBuilderCalculator'
import TimeAdjusterCalculator from './TimeAdjusterCalculator'
import WattsSavedCalculator from './WattsSavedCalculator'

const TABS = [
  { key: 'cadence', label: 'Cadence' },
  { key: 'schedule', label: 'Schedule builder' },
  { key: 'power-for-speed', label: 'Power for speed' },
  { key: 'watts-saved', label: 'Watts saved' },
  { key: 'time-adjuster', label: 'Time adjuster' },
  { key: 'gains', label: 'Gains' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function Calculators() {
  const venues = useCollection(dataStore.venues)
  const settingsRows = useCollection(dataStore.settings)
  const rawSettings = settingsRows.find((s) => s.id === SETTINGS_ID)
  const settings = rawSettings ? withSettingsDefaults(rawSettings) : undefined

  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') as TabKey) ?? 'cadence'

  function setTab(next: TabKey) {
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    setSearchParams(params)
  }

  if (!settings) return <p className="text-sm text-slate-500">Loading…</p>
  if (venues.length === 0) return <p className="text-sm text-slate-500">Add a venue in Settings first.</p>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Calculators</h1>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === t.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {tab === 'cadence' && <CadenceCalculator settings={settings} venues={venues} />}
        {tab === 'schedule' && <ScheduleBuilderCalculator />}
        {tab === 'power-for-speed' && <PowerForSpeedCalculator settings={settings} venues={venues} />}
        {tab === 'watts-saved' && <WattsSavedCalculator settings={settings} />}
        {tab === 'time-adjuster' && <TimeAdjusterCalculator />}
        {tab === 'gains' && <Gains embedded />}
      </div>
    </div>
  )
}
