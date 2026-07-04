import { useState } from 'react'
import { dataStore } from '../../store/DataStore'
import { useCollection } from '../../store/useCollection'
import CsvImport from './CsvImport'
import RidesList from './RidesList'
import UploadFlow from './UploadFlow'

export default function Rides() {
  const rides = useCollection(dataStore.rides)
  // `rides` starts empty and fills in asynchronously (useCollection's live query), so a
  // useState initializer keyed on rides.length would freeze on the pre-load "empty" value.
  // null = "no explicit user choice yet" — derive the default fresh each render instead.
  const [userToggle, setUserToggle] = useState<boolean | null>(null)
  const showAdd = userToggle ?? rides.length === 0
  const [mode, setMode] = useState<'fit' | 'csv'>('fit')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Rides</h1>
        <button
          type="button"
          onClick={() => setUserToggle(!showAdd)}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          {showAdd ? 'Close' : 'Add a ride'}
        </button>
      </div>

      <RidesList />

      {showAdd && (
        <div className="space-y-3">
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setMode('fit')}
              className={`rounded-lg px-3 py-1.5 font-medium ${mode === 'fit' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'}`}
            >
              Upload .fit
            </button>
            <button
              type="button"
              onClick={() => setMode('csv')}
              className={`rounded-lg px-3 py-1.5 font-medium ${mode === 'csv' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'}`}
            >
              Import CSV
            </button>
          </div>
          {mode === 'fit' ? <UploadFlow /> : <CsvImport />}
        </div>
      )}
    </div>
  )
}
