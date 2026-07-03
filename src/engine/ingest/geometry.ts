// Venue geometry fitting, SPEC §4.8.
//
// From the steady laps (3..N−1), fit bend radius R (with S = (L−2πR)/2) by matching the
// predicted wheel-speed modulation shape kV(v(s)) to the observed band-passed speed
// waveform, averaged across laps. The lap phase (where the start/finish line sits on the
// track) is unknown and differs per ride, so it's fit jointly with R. Sign and amplitude
// are left free (least-squares scaled) because the rider's own cornering speed modulation
// confounds the raw kV amplitude — only the shape (bend width via fBend, and phase) is
// informative. Reported as `fittedBendRadiusM`; the engine's geometry priority is
// user > fitted > published (§4.8).

import { G } from '../constants'
import type { LapConstruction, Timeline } from './types'
import { interpAt, mean } from './util'

const STEADY_FIRST_LAP = 3
const STEADY_LAST_LAP = 15

/**
 * Band-passed wheel-speed profile per steady lap: mean speed in each of `nBins` position
 * bins over [0, L), with the lap mean removed. One array per lap.
 */
export function steadyLapSpeedProfiles(
  tl: Timeline,
  laps: LapConstruction,
  lapLengthM: number,
  nBins = 25,
): number[][] {
  const { t, v, d } = tl
  const c = laps.calibrationInterior
  const d0 = laps.d0
  const L = lapLengthM
  const profiles: number[][] = []

  for (let ln = STEADY_FIRST_LAP - 1; ln <= STEADY_LAST_LAP - 1; ln++) {
    const a = laps.lapBoundaryTimes[ln]
    const b = laps.lapBoundaryTimes[ln + 1]
    if (Number.isNaN(a) || Number.isNaN(b)) continue
    const sum = new Array<number>(nBins).fill(0)
    const cnt = new Array<number>(nBins).fill(0)
    for (let tt = Math.ceil(a); tt < b; tt++) {
      const s = (((c * (interpAt(t, d, tt) - d0)) % L) + L) % L
      const bi = Math.min(nBins - 1, Math.floor((s / L) * nBins))
      sum[bi] += interpAt(t, v, tt)
      cnt[bi]++
    }
    const prof = sum.map((x, i) => (cnt[i] ? x / cnt[i] : Number.NaN))
    const m = mean(prof.filter((x) => !Number.isNaN(x)))
    profiles.push(prof.map((x) => (Number.isNaN(x) ? 0 : x - m)))
  }
  return profiles
}

export interface GeometryFit {
  bendRadiusM: number
  straightLengthM: number
  /** Fitted phase offset of the lap line relative to the straight, m. */
  phaseOffsetM: number
  /** Residual sum of squares of the best fit (lower = better). */
  residual: number
}

/**
 * Grid-search R and lap phase to best match the kV(v,s) shape to the observed band-passed
 * speed. Uses a representative steady speed for the lean angle. Sign/amplitude are free.
 */
export function fitVenueGeometry(
  profiles: number[][],
  lapLengthM: number,
  opts: { comHeightM?: number; refSpeedMs?: number } = {},
): GeometryFit {
  const L = lapLengthM
  const h = opts.comHeightM ?? 1.1
  const vRef = opts.refSpeedMs ?? 16.5
  if (profiles.length === 0) throw new Error('fitVenueGeometry: no steady-lap profiles')
  const nBins = profiles[0].length

  // Observed profile averaged across laps.
  const obs = new Array<number>(nBins).fill(0)
  for (const p of profiles) for (let i = 0; i < nBins; i++) obs[i] += p[i] / profiles.length

  let best: GeometryFit = {
    bendRadiusM: 23,
    straightLengthM: (L - 2 * Math.PI * 23) / 2,
    phaseOffsetM: 0,
    residual: Number.POSITIVE_INFINITY,
  }

  for (let R = 18; R <= 28; R += 0.25) {
    const S = (L - 2 * Math.PI * R) / 2
    if (S <= 0) continue
    const arc = Math.PI * R
    const kVBend = (R + h * Math.sin(Math.atan((vRef * vRef) / (G * R)))) / R

    for (let phase = 0; phase < L; phase += L / nBins) {
      // Centered kV template at this R and phase.
      const tmpl = new Array<number>(nBins)
      for (let i = 0; i < nBins; i++) {
        const s = ((((i + 0.5) / nBins) * L - phase) % L + L) % L
        const inBend = (s >= S && s < S + arc) || s >= 2 * S + arc
        tmpl[i] = inBend ? kVBend : 1
      }
      const tm = mean(tmpl)
      let num = 0
      let den = 0
      for (let i = 0; i < nBins; i++) {
        const tc = tmpl[i] - tm
        num += obs[i] * tc
        den += tc * tc
      }
      if (den < 1e-9) continue
      const alpha = num / den
      let ss = 0
      for (let i = 0; i < nBins; i++) {
        const tc = tmpl[i] - tm
        const r = obs[i] - alpha * tc
        ss += r * r
      }
      if (ss < best.residual) {
        best = { bendRadiusM: R, straightLengthM: S, phaseOffsetM: phase, residual: ss }
      }
    }
  }
  return best
}
