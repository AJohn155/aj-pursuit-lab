// Race-detection confirm screen (SPEC §4.5 / §5.1). Drop a .fit → parse → detect → show the
// speed trace with draggable start/finish handles + official-time field → one-click confirm.
// The downstream metadata form + save/analyze is P4; this is the detection step of P3.

import { useState } from 'react'
import SpeedTrace from '../../components/SpeedTrace'
import { buildTimeline, detectRace, parseFitRecords } from '../../engine/ingest'
import type { Detection, Timeline } from '../../engine/ingest'

interface Loaded {
  timeline: Timeline
  detection: Detection
  fileName: string
}

export default function DetectionConfirm() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [officialTimeS, setOfficialTimeS] = useState('')
  const [startT, setStartT] = useState(0)
  const [finishT, setFinishT] = useState(0)
  const [confirmed, setConfirmed] = useState(false)

  async function handleFile(file: File) {
    setError(null)
    setConfirmed(false)
    try {
      const buf = new Uint8Array(await file.arrayBuffer())
      const timeline = buildTimeline(parseFitRecords(buf))
      const detection = detectRace(timeline)
      setLoaded({ timeline, detection, fileName: file.name })
      setStartT(detection.t0)
      setFinishT(detection.tFinish)
      setOfficialTimeS(detection.detectedDurationS.toFixed(3))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLoaded(null)
    }
  }

  const duration = finishT - startT
  const official = Number.parseFloat(officialTimeS)
  const delta = Number.isFinite(official) && official > 0 ? duration - official : null
  const withinTol = delta != null && Math.abs(delta) <= 2.5

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) void handleFile(f)
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 hover:border-slate-400"
      >
        <input
          type="file"
          accept=".fit"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
        <span className="font-medium text-slate-700">Drop a .fit file</span>
        <span>or click to choose — parses and detects the race in your browser</span>
      </label>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not read this file: {error}
        </div>
      )}

      {loaded && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-800">{loaded.fileName}</p>
            <span className="text-xs text-slate-500">
              {loaded.timeline.t.length}s segment · {loaded.timeline.dropoutSeconds}s dropout
            </span>
          </div>

          <SpeedTrace
            t={loaded.timeline.t}
            v={loaded.timeline.v}
            startT={startT}
            finishT={finishT}
            onChangeStart={(tt) => setStartT(Math.min(tt, finishT - 1))}
            onChangeFinish={(tt) => setFinishT(Math.max(tt, startT + 1))}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Detected start" value={`${startT.toFixed(1)}s`} />
            <Stat label="Detected finish" value={`${finishT.toFixed(1)}s`} />
            <Stat label="Duration" value={`${duration.toFixed(3)}s`} />
            <Stat
              label="Start"
              value={loaded.detection.missingStart ? 'missing (mid-start)' : `v≈${loaded.detection.startVComMs.toFixed(1)} m/s`}
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-600">
              <span className="mb-1 block">Official time (s)</span>
              <input
                type="number"
                step="0.001"
                value={officialTimeS}
                onChange={(e) => setOfficialTimeS(e.target.value)}
                className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            {delta != null && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  withinTol ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {delta >= 0 ? '+' : ''}
                {delta.toFixed(2)}s vs official {withinTol ? '· within 2.5s' : '· check handles'}
              </span>
            )}
            <button
              type="button"
              onClick={() => setConfirmed(true)}
              className="ml-auto rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Confirm detection
            </button>
          </div>

          {confirmed && (
            <p className="text-sm text-green-700">
              Detection confirmed at start {startT.toFixed(1)}s / finish {finishT.toFixed(1)}s.
              Metadata entry &amp; save/analyze come in P4.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  )
}
