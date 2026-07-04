// Accel/decel summary, SPEC §4.15 `accelDecel {sAccel,sDecel,byLap}`.
//
// The spec names the fields but not the classification rule. This uses the sign of the
// per-second COM speed derivative with a small deadband, so measurement noise on a truly
// steady effort isn't classified as accel/decel — a documented judgment call.

import type { LapConstruction, Timeline } from './types'
import { interpAt } from './util'

const DEADBAND_MS = 0.02

export interface AccelDecelByLap {
  /** 1-based lap number. */
  lap: number
  sAccel: number
  sDecel: number
}

export interface AccelDecel {
  sAccel: number
  sDecel: number
  byLap: AccelDecelByLap[]
}

export function computeAccelDecel(tl: Timeline, laps: LapConstruction): AccelDecel {
  const { t, v } = tl
  const c = laps.calibrationInterior
  let sAccel = 0
  let sDecel = 0
  const byLap: AccelDecelByLap[] = []

  for (let ln = 0; ln < laps.lapBoundaryTimes.length - 1; ln++) {
    const a = laps.lapBoundaryTimes[ln]
    const b = laps.lapBoundaryTimes[ln + 1]
    if (Number.isNaN(a) || Number.isNaN(b)) continue

    let lapAccel = 0
    let lapDecel = 0
    for (let tt = Math.ceil(a) + 1; tt < b; tt++) {
      const dv = c * (interpAt(t, v, tt) - interpAt(t, v, tt - 1))
      if (dv > DEADBAND_MS) lapAccel++
      else if (dv < -DEADBAND_MS) lapDecel++
    }
    sAccel += lapAccel
    sDecel += lapDecel
    byLap.push({ lap: ln + 1, sAccel: lapAccel, sDecel: lapDecel })
  }
  return { sAccel, sDecel, byLap }
}
