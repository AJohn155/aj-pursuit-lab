// Standing-start energy reconstruction, SPEC §4.6.
//
// At the first sample with valid power (t1, v1) the work already done ≈
//   0.5·mEff·v1²  +  crrEff·massKg·g·d1        (KE + rolling to t1)
// plus an aero trapezoid when v1 > 8 m/s (aero is negligible below that over <20 m). d1 is
// the datum distance covered to t1. Whole-ride energy metrics include this startEnergy.
// Speeds/distances are COM datum values (v_com = c·v_wheel), consistent with the CdA.

import { G } from '../constants'
import { effectiveInertialMass } from '../params'
import type { RiderParams } from '../types'
import type { Detection, LapConstruction, StartMetrics, Timeline } from './types'

const MIN_VALID_POWER_W = 100
const AERO_START_SPEED_MS = 8

export function reconstructStart(
  timeline: Timeline,
  detection: Detection,
  laps: LapConstruction,
  params: RiderParams,
  rho: number,
  cdaM2: number,
): StartMetrics {
  const { t, v, d, p } = timeline
  const c = laps.calibrationInterior
  const { t0, d0, firstMotionIdx } = detection

  let i = firstMotionIdx
  while (i < p.length - 1 && p[i] < MIN_VALID_POWER_W) i++

  const v1 = c * v[i] // COM datum speed at first valid power
  const d1 = c * (d[i] - d0) // datum distance covered to t1
  const mEff = effectiveInertialMass(params)

  let startEnergyJ = 0.5 * mEff * v1 * v1 + params.crrEff * params.massKg * G * d1
  if (v1 > AERO_START_SPEED_MS) {
    // Trapezoid of aero power (0 at t0, 0.5·ρ·CdA·v1³ at t1) over the start interval.
    startEnergyJ += 0.5 * (0.5 * rho * cdaM2 * v1 ** 3) * (t[i] - t0)
  }

  return { startEnergyJ, timeToFirstPowerS: t[i] - t0, firstPowerVComMs: v1 }
}
