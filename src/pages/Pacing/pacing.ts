// Pacing page glue (SPEC §5.6): the ghost builder (target time → schedule → overlay vs
// any ride) and the optimality analysis (§4.14) wired to a resolved scenario baseline.
// Kept pure and unit-tested like Compare's/Gains' page-level modules.

import { comparePacing } from '../../engine/pacing'
import type { PacingBase, PacingComparison, PacingGrids } from '../../engine/pacing'
import { defaultStartPower, simulate } from '../../engine/simulate'
import type { SimResult } from '../../engine/simulate'
import { solvePowerForTime, solveTemplatePowerForTime } from '../../engine/solve'
import type { SolveBase } from '../../engine/solve'
import { solveSettlePowerForTime, startSplitPlan } from '../../engine/startsplit'
import type { ResolvedScenario } from '../../store/scenario'
import type { DistanceTimeSeries } from '../Compare/compare'

export type GhostScheduleKind = 'even' | 'template' | 'startSplit'

/** Everything the ghost builder needs from a resolved baseline, minus its power (the
 * ghost builds its own schedule from scratch — see solveGhostSchedule). */
export type GhostBase = Omit<PacingBase, 'v0' | 'distanceM' | 'lapPhaseOffsetM'>

const DEFAULT_POWER_BRACKET: [number, number] = [150, 800]

export interface GhostSchedule {
  steadyW: number
  sim: SimResult
  /** Total predicted time from the true start (= sim finish plus the entered start split
   * for the startSplit kind; = sim finish otherwise). */
  predictedTimeS: number
  /** Per-lap times from the true start (lap 1 = the entered split for startSplit). */
  lapTimes: number[]
  /** Set only for the startSplit kind. */
  startLapS?: number
}

/**
 * Solves for the steady-power level that hits `targetTimeS`: a flat schedule ("even"),
 * the owner-shaped standing-start template ("template"), or the owner's start-split model
 * ("startSplit" — lap 1 entered directly, rest ridden at settle power from at-speed,
 * engine/startsplit.ts; owner request 2026-07 item 12). Even/template run from a clean
 * standing start (v0=0.5, full 4000 m) — the ghost is a hypothetical plan, not anchored to
 * any ride's real head-start/under-read-power quirk.
 */
export function solveGhostSchedule(
  kind: GhostScheduleKind,
  targetTimeS: number,
  base: GhostBase,
  bracket: [number, number] = DEFAULT_POWER_BRACKET,
  startLapS = 21.5,
): GhostSchedule {
  if (kind === 'startSplit') {
    const ssBase = { cdaM2: base.cdaM2, rho: base.rho, params: base.params, track: base.track }
    const steadyW = solveSettlePowerForTime(targetTimeS, startLapS, ssBase, bracket)
    const plan = startSplitPlan(startLapS, steadyW, ssBase)
    return { steadyW, sim: plan.sim, predictedTimeS: plan.predictedTimeS, lapTimes: plan.lapTimes, startLapS }
  }
  const solveBase: SolveBase = { ...base, power: 0, v0: 0.5, distanceM: 4000 }
  const steadyW =
    kind === 'even'
      ? solvePowerForTime(targetTimeS, solveBase, bracket)
      : solveTemplatePowerForTime(targetTimeS, solveBase, bracket)
  const power = kind === 'even' ? steadyW : defaultStartPower(steadyW)
  const sim = simulate({ ...base, power, v0: 0.5, distanceM: 4000 })
  return { steadyW, sim, predictedTimeS: sim.finishTimeS, lapTimes: sim.lapTimes }
}

/**
 * The inverse direction for the start-split ghost (owner request 2026-07 item 7): ENTER
 * the settle power ("power excluding lap 1") and get the predicted schedule, instead of
 * solving power from a target time.
 */
export function ghostFromSettlePower(startLapS: number, settleW: number, base: GhostBase): GhostSchedule {
  const ssBase = { cdaM2: base.cdaM2, rho: base.rho, params: base.params, track: base.track }
  const plan = startSplitPlan(startLapS, settleW, ssBase)
  return { steadyW: settleW, sim: plan.sim, predictedTimeS: plan.predictedTimeS, lapTimes: plan.lapTimes, startLapS }
}

/** Resamples a ghost sim's trajectory (dt=0.1) to a 1 Hz distance-vs-time series, the
 * same shape Compare's gap chart consumes (buildDistanceTimeSeries), so the ghost can be
 * overlaid against any real ride with the existing gapCharts()/timeAtDistance() math.
 *
 * For a startSplit ghost, the sim covers laps 2..n only — its distances shift up one lap
 * and its times shift by the start split, with a straight-line lap 1 prepended (the model
 * doesn't describe within-lap-1 dynamics; the gap chart's first 250 m is nominal). */
export function ghostDistanceTimeSeries(schedule: GhostSchedule): DistanceTimeSeries {
  const { sim } = schedule
  const startLapS = schedule.startLapS ?? 0
  const lapOffsetM = schedule.startLapS != null ? 250 : 0
  const lastT = sim.samples[sim.samples.length - 1]?.t ?? 0
  const nSec = Math.floor(lastT)
  const distM: number[] = []
  const elapsedS: number[] = []
  const dt = 0.1
  if (schedule.startLapS != null) {
    // Nominal lap 1: linear 0 → 250 m over the entered split.
    for (let sec = 0; sec < Math.floor(startLapS); sec++) {
      distM.push((sec / startLapS) * lapOffsetM)
      elapsedS.push(sec)
    }
  }
  for (let sec = 0; sec <= nSec; sec++) {
    const idx = sec / dt
    const i0 = Math.min(sim.samples.length - 1, Math.floor(idx))
    const i1 = Math.min(sim.samples.length - 1, i0 + 1)
    const frac = idx - i0
    const s0 = sim.samples[i0]
    const s1 = sim.samples[i1]
    distM.push(lapOffsetM + s0.s + frac * (s1.s - s0.s))
    elapsedS.push(startLapS + sec)
  }
  return { distM, elapsedS }
}

export interface PacingOptimalityResult {
  optimalTimeS: number
  actualTimeS: number
  deltaTimeS: number
  timeLostPerLapS: number[]
  optimalLapTimes: number[]
  actualLapTimes: number[]
  wPrimeEndJ: number
}

/**
 * Compares a resolved ride baseline's real pacing against the optimal schedule for its
 * own environment (§4.14). `resolved.power` for a ride baseline with no power override is
 * exactly the ride's own real recorded schedule (store/scenario.ts), so it's fed straight
 * to `comparePacing` as the "actual". Absolute times get `resolved.headStartS` added back,
 * same convention as `runScenario` — the delta/per-lap-lost numbers are unaffected by it
 * (it's added identically to both sides, see comment at the call site).
 *
 * `optimizePacing`'s default settleW grid (engine/pacing.ts) is centered on `cp` — fine
 * when CP is a real fit, but Settings' CP/W′ is currently a generic manually-set default
 * (§4.13 deviation, P4), which for an elite pursuiter sits well below their actual 4 km
 * race power. Left uncorrected, the grid search can't even consider the rider's own power
 * level and reports a bogus "optimal" slower than what they actually rode. Anchoring the
 * default settleW grid on the baseline's own average power instead — what the rider
 * actually demonstrated they can hold for this exact effort — is a materially better
 * default; an explicit `grids` override still takes priority when supplied.
 */
export function pacingOptimality(
  resolved: ResolvedScenario,
  cp: number,
  wPrime: number,
  grids?: PacingGrids,
): PacingOptimalityResult {
  const base: PacingBase = {
    cdaM2: resolved.cdaM2,
    rho: resolved.rho,
    params: resolved.params,
    track: resolved.track,
    distanceM: resolved.distanceM,
    v0: resolved.v0,
    lapPhaseOffsetM: resolved.lapPhaseOffsetM,
  }
  const settleW =
    grids?.settleW ??
    [0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2].map((f) => Math.round(resolved.baselineAvgPowerW * f))
  const cmp: PacingComparison = comparePacing(base, resolved.power, cp, wPrime, { ...grids, settleW })
  return {
    optimalTimeS: resolved.headStartS + cmp.optimal.timeS,
    actualTimeS: resolved.headStartS + cmp.actualTimeS,
    deltaTimeS: cmp.deltaTimeS,
    timeLostPerLapS: cmp.timeLostPerLapS,
    optimalLapTimes: cmp.optimal.lapTimes,
    actualLapTimes: cmp.actualLapTimes,
    wPrimeEndJ: cmp.optimal.wPrimeEndJ,
  }
}
