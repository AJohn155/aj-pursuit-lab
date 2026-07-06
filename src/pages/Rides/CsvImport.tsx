// CSV import wizard (SPEC §3.6): paste or upload the owner's historical spreadsheet,
// preview the column mapping, create rides without .fit files (attached later by matching
// on date). "1k/2k/3k cumulative" isn't mapped — the Ride schema has no slot for cumulative
// splits, only per-lap `officialSplits` (§3.3); the per-lap split columns cover that need.

import { useMemo, useState } from 'react'
import { dataStore } from '../../store/DataStore'
import type { Ride } from '../../store/types'
import { useCollection } from '../../store/useCollection'
import { csvToRecords, detectOwnerSheet, matchVenueName, normalizeDateString, parseCsv, parseGear, parseTimeToSeconds } from './csv'

const NONE = ''

interface Mapping {
  event: string
  date: string
  venue: string
  airDensity: string
  gear: string
  finishTime: string
  avgPower: string
  notes: string
  lapSplitCols: string[]
}

const EMPTY_MAPPING: Mapping = {
  event: NONE,
  date: NONE,
  venue: NONE,
  airDensity: NONE,
  gear: NONE,
  finishTime: NONE,
  avgPower: NONE,
  notes: NONE,
  lapSplitCols: [],
}

function newRideId(): string {
  return `ride-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function CsvImport() {
  const venues = useCollection(dataStore.venues)
  const [csvText, setCsvText] = useState('')
  const [parsed, setParsed] = useState<{ headers: string[]; records: Record<string, string>[] } | null>(null)
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING)
  const [autoDetected, setAutoDetected] = useState(false)
  const [summary, setSummary] = useState<{ created: number; skipped: { row: number; reason: string }[] } | null>(
    null,
  )

  function handleParse() {
    setSummary(null)
    const { headers, records } = csvToRecords(parseCsv(csvText))
    setParsed({ headers, records })
    // Owner-sheet layout (Event/Date/Location/…/Lap 1..16/Comments) is recognized and the
    // whole mapping prefilled — pasting straight from the history sheet needs zero clicks.
    const owner = detectOwnerSheet(headers)
    setAutoDetected(owner != null)
    setMapping(
      owner
        ? {
            event: owner.event,
            date: owner.date,
            venue: owner.location,
            airDensity: owner.airDensity,
            gear: owner.gearing,
            finishTime: owner.overallTime,
            avgPower: owner.avgPower,
            notes: owner.notes,
            lapSplitCols: owner.lapCols,
          }
        : EMPTY_MAPPING,
    )
  }

  async function handleFile(file: File) {
    setCsvText(await file.text())
    setParsed(null)
  }

  function toggleLapSplitCol(col: string) {
    setMapping((m) => ({
      ...m,
      lapSplitCols: m.lapSplitCols.includes(col) ? m.lapSplitCols.filter((c) => c !== col) : [...m.lapSplitCols, col],
    }))
  }

  function buildRide(record: Record<string, string>, rowIndex: number): { ride: Ride } | { error: string } {
    const dateRaw = mapping.date ? record[mapping.date]?.trim() : ''
    if (!dateRaw) return { error: `row ${rowIndex}: missing date` }
    const dateVal = normalizeDateString(dateRaw)
    if (!dateVal) return { error: `row ${rowIndex}: unrecognized date "${dateRaw}"` }

    const finishRaw = mapping.finishTime ? record[mapping.finishTime] : ''
    const officialTimeS = finishRaw ? parseTimeToSeconds(finishRaw) : null
    if (officialTimeS == null) return { error: `row ${rowIndex}: unparseable finish time "${finishRaw}"` }

    const venueName = mapping.venue ? record[mapping.venue]?.trim() : ''
    const venue = venueName ? matchVenueName(venueName, venues) : undefined
    if (venueName && !venue) return { error: `row ${rowIndex}: venue "${venueName}" not found` }
    if (!venue) return { error: `row ${rowIndex}: no venue mapped or matched` }

    const gearRaw = mapping.gear ? record[mapping.gear] : ''
    const gear = (gearRaw && parseGear(gearRaw)) || { chainring: 0, cog: 0 }

    const officialSplits = mapping.lapSplitCols
      .map((col) => parseTimeToSeconds(record[col] ?? ''))
      .filter((v): v is number => v != null)

    const avgPowerRaw = mapping.avgPower ? Number.parseFloat(record[mapping.avgPower] ?? '') : Number.NaN
    const airDensityRaw = mapping.airDensity ? Number.parseFloat(record[mapping.airDensity] ?? '') : Number.NaN

    const now = new Date().toISOString()
    const ride: Ride = {
      id: newRideId(),
      createdAt: now,
      updatedAt: now,
      date: dateVal,
      venueId: venue.id,
      eventName: mapping.event ? (record[mapping.event]?.trim() ?? '') : '',
      round: 'other',
      officialTimeS,
      officialSplits,
      gear,
      airDensity: Number.isFinite(airDensityRaw) && airDensityRaw > 0 ? airDensityRaw : undefined,
      systemMassKg: 100,
      manualAvgPowerW: Number.isFinite(avgPowerRaw) ? avgPowerRaw : undefined,
      kit: [],
      notes: mapping.notes ? (record[mapping.notes] ?? '') : '',
      flags: { outdoor: !venue.indoor, caughtRider: false, interrupted: false },
      analysisVersion: '',
    }
    return { ride }
  }

  async function handleImport() {
    if (!parsed) return
    const skipped: { row: number; reason: string }[] = []
    let created = 0
    for (let i = 0; i < parsed.records.length; i++) {
      const result = buildRide(parsed.records[i], i + 2) // +2: header row + 1-based
      if ('error' in result) {
        skipped.push({ row: i + 2, reason: result.error })
        continue
      }
      await dataStore.rides.put(result.ride)
      created++
    }
    setSummary({ created, skipped })
  }

  const preview = useMemo(() => (parsed ? parsed.records.slice(0, 5) : []), [parsed])
  const selectClass = 'rounded-md border border-slate-300 px-2 py-1 text-sm'

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Import from CSV</h2>

      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) void handleFile(f)
        }}
        className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center text-sm text-slate-500 hover:border-slate-400"
      >
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
        Drop a CSV file, or paste below
      </label>

      <textarea
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        rows={6}
        placeholder="date,venue,gear,finish,lap1,lap2,..."
        className="w-full rounded-md border border-slate-300 px-2 py-1 font-mono text-xs"
      />

      <button
        type="button"
        onClick={handleParse}
        disabled={!csvText.trim()}
        className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Parse
      </button>

      {parsed && (
        <div className="space-y-4">
          {autoDetected && (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              Recognized the IP history sheet layout — every column below was mapped automatically
              (Event, Date, Location, Air density, Gearing, Overall time, Lap 1–16, Comments). Adjust
              anything that looks off, then import.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(
              [
                ['event', 'Event'],
                ['date', 'Date'],
                ['venue', 'Venue / location'],
                ['airDensity', 'Air density'],
                ['gear', 'Gear'],
                ['finishTime', 'Finish time'],
                ['avgPower', 'Avg power'],
                ['notes', 'Notes / kit'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="font-medium text-slate-700">{label}</span>
                <select
                  value={mapping[key]}
                  onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                  className={`mt-1 block w-full ${selectClass}`}
                >
                  <option value={NONE}>— none —</option>
                  {/* Index keys + blank-header filtering: the owner sheet has empty spacer
                      columns, and duplicate ''-keys made React spam duplicate-key errors. */}
                  {parsed.headers.map((h, hi) =>
                    h.trim() === '' ? null : (
                      <option key={hi} value={h}>
                        {h}
                      </option>
                    ),
                  )}
                </select>
              </label>
            ))}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">
              Per-lap split columns (check, in order — first lap is the start time)
            </p>
            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              {parsed.headers.map((h, hi) =>
                h.trim() === '' ? null : (
                  <label key={hi} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={mapping.lapSplitCols.includes(h)}
                      onChange={() => toggleLapSplitCol(h)}
                    />
                    {h}
                    {mapping.lapSplitCols.includes(h) && (
                      <span className="text-xs text-slate-400">#{mapping.lapSplitCols.indexOf(h) + 1}</span>
                    )}
                  </label>
                ),
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <p className="mb-1 text-sm font-medium text-slate-700">Preview (first {preview.length} rows)</p>
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-2 py-1">Date</th>
                  <th className="px-2 py-1">Venue match</th>
                  <th className="px-2 py-1">Gear</th>
                  <th className="px-2 py-1">Finish (s)</th>
                  <th className="px-2 py-1">Laps</th>
                  <th className="px-2 py-1">Avg W</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((rec, i) => {
                  const result = buildRide(rec, i + 2)
                  return (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      {'error' in result ? (
                        <td colSpan={6} className="px-2 py-1 text-red-600">
                          {result.error}
                        </td>
                      ) : (
                        <>
                          <td className="px-2 py-1">{result.ride.date}</td>
                          <td className="px-2 py-1">{venues.find((v) => v.id === result.ride.venueId)?.name}</td>
                          <td className="px-2 py-1">
                            {result.ride.gear.chainring}×{result.ride.gear.cog}
                          </td>
                          <td className="px-2 py-1">{result.ride.officialTimeS.toFixed(3)}</td>
                          <td className="px-2 py-1">{result.ride.officialSplits.length}</td>
                          <td className="px-2 py-1">{result.ride.manualAvgPowerW ?? '—'}</td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => void handleImport()}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Import {parsed.records.length} row{parsed.records.length === 1 ? '' : 's'}
          </button>

          {summary && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-800">Created {summary.created} ride(s).</p>
              {summary.skipped.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-red-700">
                  {summary.skipped.map((s, i) => (
                    <li key={i}>{s.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
