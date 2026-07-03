// Lap construction and calibration, SPEC §4.7.
//
// Two calibration factors, both = datum distance ÷ raw wheel distance (rollout is measured,
// so the ratio captures how much farther the wheel rolled than the 250 m datum line —
// lean path + line height):
//  - calibrationRace: anchors the 16 laps to the official finish. dCal = c·(dRaw−d0), lap
//    boundaries at n·250 m. Derived from the raw wheel distance over the official-time
//    window, consistent with the §4.5.5 start→0 / finish→officialTimeS alignment.
//  - calibrationInterior (the reported factor c, gate 3): from an interior window of exactly
//    14 laps (§4.7.4). This is what converts wheel speed to COM datum speed for the steady
//    CdA (v_com = c·v_wheel; see cda.ts for why kV is not applied again).

import type { Sample, TrackModel } from '../types'
import type { Detection, LapConstruction, Timeline } from './types'
import { crossingTime, interpAt } from './util'

const LAP_M = 250
const N_LAPS = 16
const INTERIOR_LAPS = 14

export function constructLaps(
  tl: Timeline,
  detection: Detection,
  officialTimeS: number,
): LapConstruction {
  const { t, d } = tl
  const { t0, d0 } = detection

  // Whole-race calibration anchored to the official finish.
  const dRawFull = interpAt(t, d, t0 + officialTimeS) - d0
  const calibrationRace = (N_LAPS * LAP_M) / dRawFull

  // 16 lap-line crossings at datum n·250 m (converted back to raw distance via calibration).
  const lapBoundaryTimes: number[] = [t0]
  for (let ln = 1; ln <= N_LAPS; ln++) {
    const targetRaw = (ln * LAP_M) / calibrationRace + d0
    const tc = crossingTime(t, d, targetRaw)
    lapBoundaryTimes.push(tc ?? Number.NaN)
  }
  const lapCount = lapBoundaryTimes.slice(1).filter((x) => !Number.isNaN(x)).length

  // Interior 14-lap calibration factor (laps 2..15 → boundaries index 1..15).
  const dRaw14 = interpAt(t, d, lapBoundaryTimes[15]) - interpAt(t, d, lapBoundaryTimes[1])
  const calibrationInterior = (INTERIOR_LAPS * LAP_M) / dRaw14

  // Per-lap line height: (raw lap distance − datum) / 2π, using the rollout-true factor
  // c* = 1 (SPEC §4.7.4). Reported only; not used in the CdA. Can be slightly negative when
  // the wheel rolled marginally under the datum (rollout/measurement noise).
  const lineHeightsM: number[] = []
  for (let ln = 0; ln < N_LAPS; ln++) {
    const rawLap =
      interpAt(t, d, lapBoundaryTimes[ln + 1]) - interpAt(t, d, lapBoundaryTimes[ln])
    lineHeightsM.push((rawLap - LAP_M) / (2 * Math.PI))
  }
  const avgLineHeightM = lineHeightsM.reduce((a, b) => a + b, 0) / lineHeightsM.length

  return {
    calibrationRace,
    calibrationInterior,
    d0,
    lapBoundaryTimes,
    lapCount,
    lineHeightsM,
    avgLineHeightM,
  }
}

/**
 * Build energy-balance Sample groups, one array per lap. Speed is the COM datum speed
 * v_com = c·v_wheel (c = interior calibration); position-in-lap s comes from the calibrated
 * distance. dt = 1 s (the timeline is 1 Hz). These feed §4.9 CdA directly.
 */
export function lapSampleGroups(
  tl: Timeline,
  laps: LapConstruction,
  track: TrackModel,
): Sample[][] {
  const { t, v, p, d } = tl
  const c = laps.calibrationInterior
  const d0 = laps.d0
  const L = track.lapLengthM
  const groups: Sample[][] = []

  for (let ln = 0; ln < N_LAPS; ln++) {
    const a = laps.lapBoundaryTimes[ln]
    const b = laps.lapBoundaryTimes[ln + 1]
    if (Number.isNaN(a) || Number.isNaN(b)) {
      groups.push([])
      continue
    }
    const samples: Sample[] = []
    for (let tt = Math.ceil(a); tt < b; tt++) {
      const vWheel = interpAt(t, v, tt)
      const dCal = c * (interpAt(t, d, tt) - d0)
      const sInLap = ((dCal % L) + L) % L
      samples.push({ dt: 1, powerW: interpAt(t, p, tt), vCom: c * vWheel, s: sInLap })
    }
    groups.push(samples)
  }
  return groups
}
