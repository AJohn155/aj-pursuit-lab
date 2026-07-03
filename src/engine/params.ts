// Small derived-quantity helpers, SPEC §4.1 / §4.3.

import type { RiderParams } from './types'

/**
 * Effective inertial mass mEff = massKg + rotatingMassEqKg (SPEC §4.1). Used ONLY in
 * kinetic-energy and acceleration terms; gravity and rolling resistance use massKg.
 */
export function effectiveInertialMass(p: RiderParams): number {
  return p.massKg + p.rotatingMassEqKg
}

/** Effective venue Crr = tyreCrr·surfaceFactor (SPEC §4.3), before the local kN multiplier. */
export function effectiveCrr(tyreCrr: number, surfaceFactor: number): number {
  return tyreCrr * surfaceFactor
}
