// Race-detection confirm screen (SPEC §4.5 / §5.1). Drop a .fit → parse → detect → show the
// speed trace with draggable start/finish handles + official-time field → one-click confirm.
// Confirming hands the raw file bytes + confirmed official time up to the parent upload
// flow, which continues to the metadata form (§5.1).
//
// Broken speed channel (owner request 2026-07 round 5): some SRM files carry an aliased,
// useless speed channel while cadence and power are clean. When the speed/cadence ratio is
// unstable (it's a constant on a fixed gear), this screen offers — per the owner's choice,
// asked, not silent — to reconstruct speed & distance from cadence × development; the
// preview trace, detection, and everything downstream then use the reconstruction.

import { useMemo, useState } from 'react'
import SpeedTrace from '../../components/SpeedTrace'
import {
  assessSpeedChannel,
  buildTimeline,
  detectRace,
  developmentM,
  parseFitRecords,
  reconstructSpeedFromCadence,
} from '../../engine/ingest'
import type { Detection, FitRecord, Timeline } from '../../engine/ingest'
import { dataStore } from '../../store/DataStore'
import { SETTINGS_ID, withSettingsDefaults } from '../../store/types'
import { useCollection } from '../../store/useCollection'

interface Loaded {
  records: FitRecord[]
  speedBroken: boolean
  ratioSpread: number
  fileName: string
  fitBytes: Uint8Array
}

export interface DetectionConfirmResult {
  fitBytes: Uint8Array
  fileName: string
  officialTimeS: number
  /** Set when the owner chose cadence-derived speed for a broken speed channel — the
   * gear/rollout used for the preview, prefilled into the metadata form and persisted as
   * the ride's own values. */
  speedFromCadence?: { chainring: number; cog: number; rolloutM: number }
}

export default function DetectionConfirm({ onConfirm }: { onConfirm: (result: DetectionConfirmResult) => void }) {
  const settingsRows = useCollection(dataStore.settings)
  const rawSettings = settingsRows.find((s) => s.id === SETTINGS_ID)
  const settings = rawSettings ? withSettingsDefaults(rawSettings) : undefined

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [officialTimeS, setOfficialTimeS] = useState('')
  const [startT, setStartT] = useState(0)
  const [finishT, setFinishT] = useState(0)
  const [useCadenceSpeed, setUseCadenceSpeed] = useState(false)
  const [chainring, setChainring] = useState(settings?.gearInventory[0]?.chainring ?? 60)
  const [cog, setCog] = useState(settings?.gearInventory[0]?.cog ?? 14)
  const [rolloutM, setRolloutM] = useState(String(settings?.rolloutM ?? 2.09))

  // Preview timeline + detection, recomputed live when the cadence-speed choice or its
  // gear inputs change — cheap (few hundred records) and keeps the trace honest.
  const preview = useMemo((): { timeline: Timeline; detection: Detection } | null => {
    if (!loaded) return null
    const rollout = Number.parseFloat(rolloutM)
    const records =
      useCadenceSpeed && rollout > 0 && chainring > 0 && cog > 0
        ? reconstructSpeedFromCadence(loaded.records, developmentM(rollout, chainring, cog))
        : loaded.records
    try {
      const timeline = buildTimeline(records)
      return { timeline, detection: detectRace(timeline) }
    } catch {
      return null
    }
  }, [loaded, useCadenceSpeed, chainring, cog, rolloutM])

  function applyDetection(det: Detection) {
    setStartT(det.t0)
    setFinishT(det.tFinish)
    setOfficialTimeS(det.detectedDurationS.toFixed(3))
  }

  async function handleFile(file: File) {
    setError(null)
    try {
      const fitBytes = new Uint8Array(await file.arrayBuffer())
      const records = parseFitRecords(fitBytes)
      const assessment = assessSpeedChannel(records)
      const next: Loaded = {
        records,
        speedBroken: assessment.broken,
        ratioSpread: assessment.ratioSpread,
        fileName: file.name,
        fitBytes,
      }
      setLoaded(next)
      setUseCadenceSpeed(assessment.broken)
      // Re-prefill gear/rollout from settings on each new file — settings load async, so
      // the useState initializers may have run before they arrived (MetadataForm's
      // mount-timing gotcha), and a new file means a fresh reconstruction anyway.
      const ring = settings?.gearInventory[0]?.chainring ?? chainring
      const cogT = settings?.gearInventory[0]?.cog ?? cog
      const rollout = settings?.rolloutM ?? (Number.parseFloat(rolloutM) || 2.09)
      setChainring(ring)
      setCog(cogT)
      setRolloutM(String(rollout))
      const timeline = buildTimeline(
        assessment.broken ? reconstructSpeedFromCadence(records, developmentM(rollout, ring, cogT)) : records,
      )
      applyDetection(detectRace(timeline))
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

      {loaded && loaded.speedBroken && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p>
            <span className="font-semibold">This file's speed channel looks broken</span> — speed
            disagrees with cadence sample-to-sample (spread {(loaded.ratioSpread * 100).toFixed(0)}%
            where a fixed gear should be constant), so speed and distance can't be trusted. Power and
            cadence look fine.
          </p>
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={useCadenceSpeed}
              onChange={(e) => setUseCadenceSpeed(e.target.checked)}
            />
            Reconstruct speed &amp; distance from cadence × gear (recommended)
          </label>
          {useCadenceSpeed && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs">
                <span className="mb-0.5 block">Chainring</span>
                <input
                  type="number"
                  value={chainring}
                  onChange={(e) => setChainring(Number(e.target.value))}
                  className="w-20 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="mb-0.5 block">Cog</span>
                <input
                  type="number"
                  value={cog}
                  onChange={(e) => setCog(Number(e.target.value))}
                  className="w-20 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="mb-0.5 block">Rollout (m)</span>
                <input
                  type="number"
                  step="0.001"
                  value={rolloutM}
                  onChange={(e) => setRolloutM(e.target.value)}
                  className="w-24 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => preview && applyDetection(preview.detection)}
                className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium hover:bg-amber-100"
              >
                Re-detect with these values
              </button>
              <span className="text-xs">
                Get the gear right — reconstructed speed scales with rollout × ring/cog. It's saved
                onto the ride and editable later.
              </span>
            </div>
          )}
        </div>
      )}

      {loaded && preview && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-800">{loaded.fileName}</p>
            <span className="text-xs text-slate-500">
              {preview.timeline.t.length}s segment · {preview.timeline.dropoutSeconds}s dropout
              {preview.timeline.recordIntervalS > 1 && ` · ${preview.timeline.recordIntervalS}s recording interval`}
              {useCadenceSpeed && ' · cadence-derived speed'}
            </span>
          </div>

          <SpeedTrace
            t={preview.timeline.t}
            v={preview.timeline.v}
            p={preview.timeline.p}
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
              value={
                preview.detection.missingStart
                  ? 'missing (mid-start)'
                  : `v≈${preview.detection.startVComMs.toFixed(1)} m/s`
              }
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
              disabled={!Number.isFinite(official) || official <= 0}
              onClick={() =>
                onConfirm({
                  fitBytes: loaded.fitBytes,
                  fileName: loaded.fileName,
                  officialTimeS: official,
                  speedFromCadence:
                    useCadenceSpeed && Number.parseFloat(rolloutM) > 0
                      ? { chainring, cog, rolloutM: Number.parseFloat(rolloutM) }
                      : undefined,
                })
              }
              className="ml-auto rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Confirm detection
            </button>
          </div>
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
