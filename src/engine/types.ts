// Engine-internal types (SI units throughout). These are deliberately independent
// of src/store types so the engine stays self-contained and Node-testable
// (SPEC §2.1). The store maps its persisted Settings/Venue/Ride onto these.

/** Velodrome geometry model, SPEC §4.3. Layout per lap: straight, bend, straight, bend. */
export interface TrackModel {
  /** Lap length L (m). Constraint: lapLengthM = 2·straightLengthM + 2π·bendRadiusM. */
  lapLengthM: number
  /** Bend radius R (m) — centre of the datum-line arc. */
  bendRadiusM: number
  /** Straight length S (m). Should close the constraint above; see makeTrack(). */
  straightLengthM: number
}

/**
 * Rider/equipment parameters shared across engine functions (SI units).
 * `crrEff` is already tyreCrr·surfaceFactor (SPEC §4.3); callers combine those via
 * effectiveCrr(). Gravity/rolling use massKg; KE/acceleration use mEff = massKg +
 * rotatingMassEqKg (SPEC §4.1).
 */
export interface RiderParams {
  massKg: number
  rotatingMassEqKg: number
  crrEff: number
  mechEfficiency: number
  comHeightM: number
}

/**
 * One sample on the uniform 1 Hz-style timeline. `dt` is the duration this sample
 * represents (seconds); the engine sums energy as Σ(·)·dt so non-1 Hz spacing is fine.
 * `vCom` is the COM datum speed (m/s) — ingest derives it from the wheel-derived file
 * speed via the §4.7 calibration factor (v_com = c·v_wheel); see cda.ts for why the
 * §4.9 /kV term is not applied. `s` is position-in-lap (m, [0,L)).
 */
export interface Sample {
  dt: number
  powerW: number
  vCom: number
  s: number
}
