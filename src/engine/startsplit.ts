// Start-split + settle-power race model (owner request 2026-07 item 12).
//
// The owner's planning convention (matches his historical spreadsheet): enter the expected
// first-lap time (the standing-start lap, gate to lap line) directly, then treat the rest
// of the race as riding at a settle power — "Power (excluding lap 1)" — from already being
// at speed. So: total = startLapS + simulated time over the remaining (n−1) laps starting
// AT the settle speed with flat settle power. No start-ramp modeling at all; the start lap
// is an input, not an output.

import { powerForSpeedTrack } from './calculators'
import { simulate } from './simulate'
import type { SimResult } from './simulate'
import { bisect } from './solve'
import type { BisectOptions } from './solve'
import type { RiderParams, TrackModel } from './types'

export interface StartSplitBase {
  cdaM2: number
  rho: number
  params: RiderParams
  track: TrackModel
}

const RACE_DISTANCE_M = 4000

/**
 * The steady COM speed a settle power holds on this track — inverts the §5.8
 * full-track-model power equation (aero + lap-averaged corner-lifted rolling) by bisection.
 */
export function settleSpeedForPower(settleW: number, base: StartSplitBase, opts?: BisectOptions): number {
  const { cdaM2, rho, params, track } = base
  return bisect(
    (v) => powerForSpeedTrack(v, cdaM2, rho, params.massKg, params.crrEff, params.mechEfficiency, track),
    settleW,
    5,
    30,
    opts,
  )
}

export interface StartSplitPlan {
  startLapS: number
  settleW: number
  settleSpeedMs: number
  predictedTimeS: number
  /** Per-lap times, lap 1 = the entered start split. */
  lapTimes: number[]
  /** Cumulative splits from the true start. */
  lapSplits: number[]
  /** The simulated laps 2..n portion (starts at the lap-1 line, at settle speed). */
  sim: SimResult
}

/** Runs the model: lap 1 = startLapS by assumption; laps 2..n simulated at flat settleW
 * from the settle speed. */
export function startSplitPlan(startLapS: number, settleW: number, base: StartSplitBase): StartSplitPlan {
  const L = base.track.lapLengthM
  const v0 = settleSpeedForPower(settleW, base)
  const sim = simulate({
    power: settleW,
    cdaM2: base.cdaM2,
    rho: base.rho,
    params: base.params,
    track: base.track,
    distanceM: RACE_DISTANCE_M - L,
    v0,
  })
  const lapTimes = [startLapS, ...sim.lapTimes]
  const lapSplits: number[] = []
  let cum = 0
  for (const lt of lapTimes) {
    cum += lt
    lapSplits.push(cum)
  }
  return {
    startLapS,
    settleW,
    settleSpeedMs: v0,
    predictedTimeS: startLapS + sim.finishTimeS,
    lapTimes,
    lapSplits,
    sim,
  }
}

/** Solves the settle power ("power excluding lap 1") that hits a target total time given
 * the entered start split. */
export function solveSettlePowerForTime(
  targetTimeS: number,
  startLapS: number,
  base: StartSplitBase,
  bracket: [number, number] = [150, 800],
  opts?: BisectOptions,
): number {
  return bisect(
    (w) => startSplitPlan(startLapS, w, base).predictedTimeS,
    targetTimeS,
    bracket[0],
    bracket[1],
    opts,
  )
}
