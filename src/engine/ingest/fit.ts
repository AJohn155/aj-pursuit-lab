// FIT parsing adapter, SPEC §4.4 / §2. Isolates the `fit-file-parser` dependency so the
// rest of the engine stays library-free. Pure (no DOM): the parser works on bytes, so this
// is importable in Node (tests) and the browser (upload flow) alike.

import FitParser from 'fit-file-parser'
import type { FitRecord } from './types'

/** The subset of a decoded FIT record we consume. fit-file-parser types records loosely. */
interface RawRecord {
  elapsed_time?: number
  timestamp?: Date
  power?: number
  speed?: number
  distance?: number
  cadence?: number
  temperature?: number
}

/**
 * First record's wall-clock timestamp, or null if the file carries none — used to
 * auto-prefill the ride date on upload (owner request 2026-07, item 11). FIT timestamps
 * are UTC; a late-evening race can land on the next UTC day, so this is a prefill, not
 * authoritative.
 */
export function fitStartDate(content: ArrayBuffer | Uint8Array): Date | null {
  const parser = new FitParser({
    speedUnit: 'm/s',
    lengthUnit: 'm',
    temperatureUnit: 'celsius',
    elapsedRecordField: true,
    mode: 'list',
    force: true,
  })
  let ts: Date | null = null
  parser.parse(content as ArrayBuffer, (err, data) => {
    if (err) return
    const records = (data?.records ?? []) as unknown as RawRecord[]
    ts = records.find((r) => r.timestamp instanceof Date)?.timestamp ?? null
  })
  return ts
}

/**
 * Parse a `.fit` file into record-level samples (SPEC §4.4). Extracts timestamp/elapsed,
 * power, wheel speed, distance, cadence, temperature. Records without speed+distance
 * (non-`record` messages) are dropped. Synchronous — fit-file-parser invokes its callback
 * inline.
 */
export function parseFitRecords(content: ArrayBuffer | Uint8Array): FitRecord[] {
  const parser = new FitParser({
    speedUnit: 'm/s',
    lengthUnit: 'm',
    temperatureUnit: 'celsius',
    elapsedRecordField: true,
    mode: 'list',
    force: true,
  })

  let out: FitRecord[] | undefined
  let parseError: string | undefined
  // The parse API takes ArrayBuffer | Buffer; a Uint8Array (incl. Node Buffer) works at
  // runtime. Cast at this single boundary rather than leaking `any` further.
  parser.parse(content as ArrayBuffer, (err, data) => {
    if (err) {
      parseError = err
      return
    }
    const records = ((data?.records ?? []) as unknown as RawRecord[]).filter(
      (r) => r.speed != null && r.distance != null,
    )
    const firstTs = records[0]?.timestamp?.getTime() ?? 0
    out = records.map((r) => ({
      t:
        r.elapsed_time != null
          ? r.elapsed_time
          : ((r.timestamp?.getTime() ?? firstTs) - firstTs) / 1000,
      powerW: r.power ?? 0,
      speedMs: r.speed ?? 0,
      distanceM: r.distance ?? 0,
      cadenceRpm: r.cadence,
      temperatureC: r.temperature,
    }))
  })

  if (parseError) throw new Error(`FIT parse failed: ${parseError}`)
  if (!out || out.length === 0) throw new Error('FIT parse produced no usable records')
  return out
}
