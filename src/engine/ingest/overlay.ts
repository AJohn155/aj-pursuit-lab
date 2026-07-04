// Speed-vs-position-in-lap overlay, SPEC §5.1: "all laps superimposed; shows where in the
// corner speed peaks/dies". One series per lap, sorted by position for clean line plotting.

import type { LapConstruction, Timeline } from './types'
import { interpAt } from './util'

export interface LapPositionSeries {
  /** 1-based lap number. */
  lap: number
  posM: number[]
  /** COM datum speed, m/s (v_com = c·v_wheel; consistent with the CdA — see cda.ts). */
  speedMs: number[]
}

export function lapSpeedVsPositionSeries(
  tl: Timeline,
  laps: LapConstruction,
  lapLengthM: number,
): LapPositionSeries[] {
  const { t, v, d } = tl
  const c = laps.calibrationInterior
  const d0 = laps.d0
  const L = lapLengthM
  const out: LapPositionSeries[] = []

  for (let ln = 0; ln < laps.lapBoundaryTimes.length - 1; ln++) {
    const a = laps.lapBoundaryTimes[ln]
    const b = laps.lapBoundaryTimes[ln + 1]
    if (Number.isNaN(a) || Number.isNaN(b)) continue

    const points: { s: number; v: number }[] = []
    for (let tt = Math.ceil(a); tt < b; tt++) {
      const s = (((c * (interpAt(t, d, tt) - d0)) % L) + L) % L
      points.push({ s, v: c * interpAt(t, v, tt) })
    }
    points.sort((p, q) => p.s - q.s)
    out.push({ lap: ln + 1, posM: points.map((p) => p.s), speedMs: points.map((p) => p.v) })
  }
  return out
}
