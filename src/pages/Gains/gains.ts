// Marginal gains math (SPEC §5.5): five fixed perturbations vs a baseline, plus the
// CdA×power isochrone grid. Pure — testable like the engine, kept out of the React tree.

import { simulate } from '../../engine/simulate'
import { wattsEquivalentForTimeGain } from '../../store/scenario'
import type { ResolvedScenario } from '../../store/scenario'

export interface GainsRow {
  label: string
  /** Positive = faster (a real gain). */
  deltaTimeS: number
  /** Extra watts (at baseline CdA/crr/mass/rho) that would produce the same time gain. */
  wattsEquivalent: number
}

/** Total predicted time (head start included, matching runScenario/wattsEquivalentForTimeGain's
 * convention — see store/scenario.ts) for a baseline with one or more fields patched. */
function runWith(baseline: ResolvedScenario, patch: Partial<ResolvedScenario>): number {
  const merged = { ...baseline, ...patch }
  const sim = simulate({
    power: merged.power,
    cdaM2: merged.cdaM2,
    rho: merged.rho,
    params: merged.params,
    track: merged.track,
    distanceM: merged.distanceM,
    v0: merged.v0,
    lapPhaseOffsetM: merged.lapPhaseOffsetM,
  })
  return merged.headStartS + sim.finishTimeS
}

/** SPEC §5.5's five fixed perturbations, in the order they should tornado-sort by default. */
export function computeGainsRows(baseline: ResolvedScenario): GainsRow[] {
  const baselineTimeS = runWith(baseline, {})

  const perturbed: { label: string; timeS: number }[] = [
    { label: '−0.005 CdA', timeS: runWith(baseline, { cdaM2: baseline.cdaM2 - 0.005 }) },
    { label: '−0.010 CdA', timeS: runWith(baseline, { cdaM2: baseline.cdaM2 - 0.01 }) },
    {
      label: '−0.0002 Crr',
      timeS: runWith(baseline, { params: { ...baseline.params, crrEff: baseline.params.crrEff - 0.0002 } }),
    },
    { label: '−1 kg', timeS: runWith(baseline, { params: { ...baseline.params, massKg: baseline.params.massKg - 1 } }) },
    { label: '−0.02 ρ', timeS: runWith(baseline, { rho: baseline.rho - 0.02 }) },
    {
      label: '+10 W',
      timeS: runWith(baseline, {
        power: scalePower(baseline.power, (baseline.baselineAvgPowerW + 10) / baseline.baselineAvgPowerW),
      }),
    },
  ]

  return perturbed
    .map(({ label, timeS }) => ({
      label,
      deltaTimeS: baselineTimeS - timeS,
      // Self-consistent even if a perturbation somehow came out slower: solving for the
      // (possibly slightly slower) time just yields a small negative watts-equivalent.
      wattsEquivalent: wattsEquivalentForTimeGain(timeS, baseline),
    }))
    .sort((a, b) => Math.abs(b.deltaTimeS) - Math.abs(a.deltaTimeS))
}

function scalePower(power: ResolvedScenario['power'], scale: number): ResolvedScenario['power'] {
  return typeof power === 'function' ? (t: number, s: number) => scale * power(t, s) : power * scale
}

export interface IsochroneGrid {
  cdaValues: number[]
  powerValues: number[]
  /** timeS[i][j] = finish time at powerValues[i], cdaValues[j]. */
  timeS: number[][]
}

export interface RidePoint {
  label: string
  cdaM2: number
  avgPowerW: number
}

const CDA_GRID_POINTS = 18
const POWER_GRID_POINTS = 16

/**
 * Contours of simulated time over a CdA×power grid (SPEC §5.5/§8 "isochrone chart"), at
 * constant power (not the baseline's real pacing schedule — the grid's whole point is
 * comparing flat average-power levels). Range defaults to a band around the baseline,
 * widened to include any ride points passed in so real data always falls on-grid.
 */
export function buildIsochroneGrid(baseline: ResolvedScenario, ridePoints: RidePoint[]): IsochroneGrid {
  const cdaCenter = baseline.cdaM2
  const powerCenter = baseline.baselineAvgPowerW

  let cdaMin = cdaCenter - 0.03
  let cdaMax = cdaCenter + 0.03
  let powerMin = powerCenter - 100
  let powerMax = powerCenter + 100
  for (const p of ridePoints) {
    cdaMin = Math.min(cdaMin, p.cdaM2 - 0.005)
    cdaMax = Math.max(cdaMax, p.cdaM2 + 0.005)
    powerMin = Math.min(powerMin, p.avgPowerW - 10)
    powerMax = Math.max(powerMax, p.avgPowerW + 10)
  }

  const cdaValues = Array.from({ length: CDA_GRID_POINTS }, (_, i) => cdaMin + ((cdaMax - cdaMin) * i) / (CDA_GRID_POINTS - 1))
  const powerValues = Array.from(
    { length: POWER_GRID_POINTS },
    (_, i) => powerMin + ((powerMax - powerMin) * i) / (POWER_GRID_POINTS - 1),
  )

  const timeS = powerValues.map((p) =>
    cdaValues.map(
      (cda) =>
        simulate({ power: p, cdaM2: cda, rho: baseline.rho, params: baseline.params, track: baseline.track }).finishTimeS,
    ),
  )

  return { cdaValues, powerValues, timeS }
}
