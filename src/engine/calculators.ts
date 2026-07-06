// Calculator math (ports of the owner's spreadsheets), SPEC §5.8. Gate 7 lives here.
//
// These preserve the owner's conventions exactly. Kept pure and unit-tested against the
// spreadsheet examples in §7.

import { airDensity } from './atmosphere'
import { G } from './constants'
import { normalizeLapTimesFast } from './density'
import { bisect } from './solve'
import { lapCrrMultiplier } from './track'
import type { TrackModel } from './types'

/** Convert km/h to m/s. */
export const KPH_TO_MS = 1 / 3.6

// ── Cadence ───────────────────────────────────────────────────────────────────────
// A pedal revolution advances the wheel by rollout·(chainring/cog) metres. Over a lap of
// length L covered in `lapTimeS`, cadence (rpm) = pedal revs / time × 60.

/** Cadence (rpm) for a lap time on a given gear and venue lap length (SPEC §5.8). */
export function cadenceRpm(
  lapTimeS: number,
  lapLengthM: number,
  rolloutM: number,
  chainring: number,
  cog: number,
): number {
  return (60 * lapLengthM * cog) / (lapTimeS * rolloutM * chainring)
}

export interface Gear {
  chainring: number
  cog: number
}

export interface CadenceGrid {
  lapTimesS: number[]
  gears: Gear[]
  /** cells[row][col] = cadence rpm for lapTimesS[row] on gears[col]. */
  cells: number[][]
}

/**
 * Cadence grid: lap-time rows (default 13.0–17.0 s step 0.1, SPEC §5.8) × gear columns.
 * `lapLengthM` makes it venue-aware.
 */
export function cadenceGrid(
  gears: Gear[],
  lapLengthM: number,
  rolloutM: number,
  lapTimesS: number[] = rangeInclusive(13.0, 17.0, 0.1),
): CadenceGrid {
  const cells = lapTimesS.map((lt) =>
    gears.map((g) => cadenceRpm(lt, lapLengthM, rolloutM, g.chainring, g.cog)),
  )
  return { lapTimesS, gears, cells }
}

// ── Power for speed ─────────────────────────────────────────────────────────────────

/**
 * Flat-equation power for speed (SPEC §5.8, exact port):
 *   P = (0.5·CdA·ρ·v³ + m·g·Crr·v) / η
 * Gate 7a: 63 km/h, CdA 0.212, ρ 1.12, m 100, Crr 0.002, η 0.98 → 684.29 W.
 */
export function powerForSpeedFlat(
  vMs: number,
  cdaM2: number,
  rho: number,
  massKg: number,
  crr: number,
  eta: number,
): number {
  return (0.5 * cdaM2 * rho * vMs * vMs * vMs + massKg * G * crr * vMs) / eta
}

/**
 * Full-track-model power for a constant COM speed around a velodrome (SPEC §5.8 toggle).
 * Aero is unchanged by cornering; rolling is lifted by the lap-averaged normal-force
 * multiplier kCrrLap(v) (§4.3), since at constant speed the time-in-bend fraction equals
 * the bend fraction. Reduces to the flat equation on a straight track (fBend·(kN−1)→0).
 */
export function powerForSpeedTrack(
  vMs: number,
  cdaM2: number,
  rho: number,
  massKg: number,
  crrEff: number,
  eta: number,
  track: TrackModel,
): number {
  const kCrr = lapCrrMultiplier(vMs, track)
  return (0.5 * cdaM2 * rho * vMs * vMs * vMs + massKg * G * crrEff * kCrr * vMs) / eta
}

// ── Watts saved (aero) ──────────────────────────────────────────────────────────────

/**
 * Aero watts saved by a CdA reduction (SPEC §5.8): ΔP = 0.5·(counts/1000)·ρ·v³, where
 * 1 count = 0.001 m² CdA. Gate 7b: 60 km/h, 5 counts, ρ 1.15 → 13.31 W.
 */
export function wattsSavedAero(vMs: number, counts: number, rho: number): number {
  return 0.5 * (counts / 1000) * rho * vMs * vMs * vMs
}

/** Steady speed (m/s) a flat power holds — inverts powerForSpeedFlat by bisection. */
export function speedAtPowerFlat(
  powerW: number,
  cdaM2: number,
  rho: number,
  massKg: number,
  crr: number,
  eta: number,
): number {
  return bisect((v) => powerForSpeedFlat(v, cdaM2, rho, massKg, crr, eta), powerW, 2, 35)
}

/**
 * Seconds saved over a distance by a CdA reduction at CONSTANT power (owner request
 * 2026-07 item 6: "what would this save in a 40 km TT / the hour"). At baseline CdA the
 * rider holds `vMs`; the implied power is held fixed and the speed the reduced CdA buys
 * is solved from the same flat equation. The start lap (if any) is assumed unchanged, so
 * the saving applies to the remaining `distanceM − startLapDistanceM`.
 */
export function timeSavedForCdaReduction(
  vMs: number,
  counts: number,
  rho: number,
  massKg: number,
  crr: number,
  eta: number,
  baselineCdaM2: number,
  distanceM: number,
  startLapDistanceM = 0,
): number {
  const remainingM = Math.max(0, distanceM - startLapDistanceM)
  if (remainingM === 0 || counts <= 0 || baselineCdaM2 - counts / 1000 <= 0) return 0
  const powerW = powerForSpeedFlat(vMs, baselineCdaM2, rho, massKg, crr, eta)
  const vNew = speedAtPowerFlat(powerW, baselineCdaM2 - counts / 1000, rho, massKg, crr, eta)
  return remainingM / vMs - remainingM / vNew
}

export interface WattsSavedGrid {
  speedsMs: number[]
  countsList: number[]
  /** cells[row][col] = ΔP for speedsMs[row], countsList[col]. */
  cells: number[][]
}

/** Watts-saved grid: speed rows × counts columns (SPEC §5.8). */
export function wattsSavedGrid(
  speedsMs: number[],
  countsList: number[],
  rho: number,
): WattsSavedGrid {
  const cells = speedsMs.map((v) => countsList.map((c) => wattsSavedAero(v, c, rho)))
  return { speedsMs, countsList, cells }
}

// ── Time adjuster ───────────────────────────────────────────────────────────────────

export interface EnvBlock {
  tempC: number
  pressureHPa: number
  rhPct: number
}

/**
 * Time adjuster (SPEC §5.8), fast mode: two environment blocks → densities via §4.2, then
 * scale a lap-time vector from ride density to target density (§4.12). `firstIsLap1`
 * (default true) applies the lap-1 blend to the first element. Gate 7c is the direct
 * density form: adjustLapTimesFastByDensity([15.6], 1.1722, 0.9934, false) → 14.7626.
 */
export function adjustLapTimesFast(
  lapTimesS: number[],
  rideEnv: EnvBlock,
  targetEnv: EnvBlock,
  firstIsLap1 = true,
): number[] {
  const rhoRide = airDensity(rideEnv.tempC, rideEnv.pressureHPa, rideEnv.rhPct)
  const rhoTarget = airDensity(targetEnv.tempC, targetEnv.pressureHPa, targetEnv.rhPct)
  return normalizeLapTimesFast(lapTimesS, rhoRide, rhoTarget, firstIsLap1)
}

/** Time adjuster with densities supplied directly (fast mode). Gate 7c uses this. */
export function adjustLapTimesFastByDensity(
  lapTimesS: number[],
  rhoRide: number,
  rhoTarget: number,
  firstIsLap1 = true,
): number[] {
  return normalizeLapTimesFast(lapTimesS, rhoRide, rhoTarget, firstIsLap1)
}

// ── helpers ─────────────────────────────────────────────────────────────────────────

/** Inclusive numeric range [start,end] step `step`, rounded to kill FP drift. */
export function rangeInclusive(start: number, end: number, step: number): number[] {
  const out: number[] = []
  const n = Math.round((end - start) / step)
  for (let i = 0; i <= n; i++) out.push(Math.round((start + i * step) * 1e6) / 1e6)
  return out
}
