// Pacing page glue (SPEC §5.6): the ghost builder (target time → schedule → overlay vs
// any ride) and the optimality analysis (§4.14) wired to a resolved scenario baseline.
// Kept pure and unit-tested like Compare's/Gains' page-level modules.

import { comparePacing } from '../../engine/pacing'
import type { PacingBase, PacingComparison, PacingGrids } from '../../engine/pacing'
import { defaultStartPower, simulate } from '../../engine/simulate'
import type { SimResult } from '../../engine/simulate'
import { solvePowerForTime, solveTemplatePowerForTime } from '../../engine/solve'
import type { SolveBase } from '../../engine/solve'
import type { ResolvedScenario } from '../../store/scenario'
import type { DistanceTimeSeries } from '../Compare/compare'

export type GhostScheduleKind = 'even' | 'template'

/** Everything the ghost builder needs from a resolved baseline, minus its power (the
 * ghost builds its own schedule from scratch — see solveGhostSchedule). */
export type GhostBase = Omit<PacingBase, 'v0' | 'distanceM' | 'lapPhaseOffsetM'>

const DEFAULT_POWER_BRACKET: [number, number] = [150, 800]

export interface GhostSchedule {
  steadyW: number
  sim: SimResult
}

/**
 * Solves for the steady-power level that hits `targetTimeS`, either as a flat schedule
 * ("even") or the owner-shaped standing-start template ("template") — the same target-time
 * inversion §4.11 already does for a flat power, extended to the template shape via
 * `solveTemplatePowerForTime` (engine/solve.ts). Runs from a clean standing start (v0=0.5,
 * full 4000 m) — the ghost is a hypothetical plan, not anchored to any ride's real
 * head-start/under-read-power quirk (store/scenario.ts's concern for a *real* baseline).
 */
export function solveGhostSchedule(
  kind: GhostScheduleKind,
  targetTimeS: number,
  base: GhostBase,
  bracket: [number, number] = DEFAULT_POWER_BRACKET,
): GhostSchedule {
  const solveBase: SolveBase = { ...base, power: 0, v0: 0.5, distanceM: 4000 }
  const steadyW =
    kind === 'even'
      ? solvePowerForTime(targetTimeS, solveBase, bracket)
      : solveTemplatePowerForTime(targetTimeS, solveBase, bracket)
  const power = kind === 'even' ? steadyW : defaultStartPower(steadyW)
  const sim = simulate({ ...base, power, v0: 0.5, distanceM: 4000 })
  return { steadyW, sim }
}

/** Resamples a ghost sim's trajectory (dt=0.1) to a 1 Hz distance-vs-time series, the
 * same shape Compare's gap chart consumes (buildDistanceTimeSeries), so the ghost can be
 * overlaid against any real ride with the existing gapCharts()/timeAtDistance() math. */
export function ghostDistanceTimeSeries(sim: SimResult): DistanceTimeSeries {
  const lastT = sim.samples[sim.samples.length - 1]?.t ?? 0
  const nSec = Math.floor(lastT)
  const distM: number[] = []
  const elapsedS: number[] = []
  const dt = 0.1
  for (let sec = 0; sec <= nSec; sec++) {
    const idx = sec / dt
    const i0 = Math.min(sim.samples.length - 1, Math.floor(idx))
    const i1 = Math.min(sim.samples.length - 1, i0 + 1)
    const frac = idx - i0
    const s0 = sim.samples[i0]
    const s1 = sim.samples[i1]
    distM.push(s0.s + frac * (s1.s - s0.s))
    elapsedS.push(sec)
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
