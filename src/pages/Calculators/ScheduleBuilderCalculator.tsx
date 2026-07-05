// Schedule Builder (owner request 2026-07 item 17): port of the sheet section below
// "Schedule Builder" on the Cadence Calculator tab — either type each target lap time, or
// enter a target first lap + subsequent lap target; the table shows cumulative time and
// km splits, with the overall time up top.

import { useState } from 'react'
import { buildSchedule, formatMinSec, scheduleFromFirstAndSettle } from './schedule'

const N_LAPS = 16
const LAP_M = 250

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm'

export default function ScheduleBuilderCalculator() {
  const [mode, setMode] = useState<'perLap' | 'firstSettle'>('firstSettle')
  const [firstLapInput, setFirstLapInput] = useState('21.5')
  const [settleInput, setSettleInput] = useState('14.9')
  const [perLapInputs, setPerLapInputs] = useState<string[]>(() => [
    '21.5',
    ...Array.from({ length: N_LAPS - 1 }, () => '14.9'),
  ])

  const lapTimes =
    mode === 'firstSettle'
      ? scheduleFromFirstAndSettle(Number(firstLapInput), Number(settleInput), N_LAPS)
      : perLapInputs.map(Number)

  const valid = lapTimes.every((t) => Number.isFinite(t) && t > 0)
  const rows = valid ? buildSchedule(lapTimes, LAP_M) : []
  const total = rows.length > 0 ? rows[rows.length - 1].cumTimeS : 0

  function setPerLap(i: number, value: string) {
    setPerLapInputs((prev) => prev.map((v, idx) => (idx === i ? value : v)))
  }

  function copyFromGenerated() {
    setPerLapInputs(lapTimes.map((t) => String(t)))
    setMode('perLap')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">Mode</legend>
          <div className="flex gap-4 text-sm text-slate-600">
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === 'firstSettle'} onChange={() => setMode('firstSettle')} />
              First lap + subsequent
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === 'perLap'} onChange={() => setMode('perLap')} />
              Type each lap
            </label>
          </div>
        </fieldset>
        {mode === 'firstSettle' && (
          <>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Target first lap (s)</span>
              <input
                type="number"
                step="0.1"
                value={firstLapInput}
                onChange={(e) => setFirstLapInput(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Subsequent target laps (s)</span>
              <input
                type="number"
                step="0.1"
                value={settleInput}
                onChange={(e) => setSettleInput(e.target.value)}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              onClick={copyFromGenerated}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Copy to per-lap for tweaking
            </button>
          </>
        )}
      </div>

      {valid && (
        <div className="flex flex-wrap gap-6 text-sm text-slate-700">
          <div>
            <span className="text-slate-500">Overall: </span>
            <span className="font-mono text-lg font-semibold">{total.toFixed(1)} s</span>
            <span className="ml-2 font-mono text-slate-500">({formatMinSec(total)})</span>
          </div>
          <div>
            <span className="text-slate-500">Avg non-start lap: </span>
            <span className="font-mono font-medium">
              {rows.length > 1 ? (rows.slice(1).reduce((s, r) => s + r.lapTimeS, 0) / (rows.length - 1)).toFixed(2) : '—'} s
            </span>
          </div>
        </div>
      )}

      <div className="max-h-[32rem] overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Distance</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Lap time (s)</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Time</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Km split</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: N_LAPS }, (_, i) => {
              const row = rows[i]
              return (
                <tr key={i} className={row?.kmSplitS != null ? 'bg-blue-50/50' : undefined}>
                  <td className="px-3 py-1.5 text-slate-700">{(i + 1) * LAP_M} m</td>
                  <td className="px-3 py-1.5 text-right">
                    {mode === 'perLap' ? (
                      <input
                        type="number"
                        step="0.1"
                        value={perLapInputs[i]}
                        onChange={(e) => setPerLap(i, e.target.value)}
                        className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right font-mono text-sm"
                      />
                    ) : (
                      <span className="font-mono text-slate-800">{lapTimes[i]?.toFixed(1) ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-slate-800">
                    {row ? formatMinSec(row.cumTimeS) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-slate-800">
                    {row?.kmSplitS != null ? row.kmSplitS.toFixed(1) : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!valid && <p className="text-sm text-red-600">All lap times must be positive numbers.</p>}
    </div>
  )
}
