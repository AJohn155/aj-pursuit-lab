// W′ balance and CP/W′ estimation, SPEC §4.13.
//
// Skiba differential form: while P > CP, W′bal depletes by (P−CP)·dt; while P ≤ CP,
// W′bal recovers exponentially toward W′ with τ = 546·e^(−0.01·(CP−P)) + 316.

export interface WPrimeInput {
  /** Power series, W. */
  power: number[]
  /** Sample duration, s (uniform). */
  dt: number
  /** Critical power, W. */
  cp: number
  /** Anaerobic work capacity W′, J. */
  wPrime: number
}

/**
 * W′ balance over a power series (SPEC §4.13). Depletion is the exact spec form
 * (W′bal −= (P−CP)·dt). Recovery uses the standard Skiba exponential relaxation toward
 * W′ with the spec's τ: W′bal ← W′ − (W′ − W′bal)·e^(−dt/τ). The spec states "exponential
 * recovery with τ" without writing the update; this is the canonical differential-model
 * form and is the documented interpretation. W′bal is allowed to go negative (indicates
 * the tank is over-spent); callers can inspect the minimum.
 */
export function wPrimeBalance({ power, dt, cp, wPrime }: WPrimeInput): number[] {
  let bal = wPrime
  const out: number[] = []
  for (const P of power) {
    if (P > cp) {
      bal -= (P - cp) * dt
    } else {
      const tau = 546 * Math.exp(-0.01 * (cp - P)) + 316
      bal = wPrime - (wPrime - bal) * Math.exp(-dt / tau)
    }
    out.push(bal)
  }
  return out
}

/** Final W′bal after a power series. */
export function wPrimeEnd(input: WPrimeInput): number {
  const series = wPrimeBalance(input)
  return series[series.length - 1] ?? input.wPrime
}

/** Minimum W′bal over a power series (how close to empty the rider got). */
export function wPrimeMin(input: WPrimeInput): number {
  return Math.min(...wPrimeBalance(input))
}

export interface CpWprime {
  cp: number
  wPrime: number
}

/**
 * Estimate CP and W′ from mean-maximal power points (SPEC §4.13: fit from 180/240/300 s).
 * Uses the hyperbolic power-duration model P(t) = CP + W′/t, i.e. a linear regression of
 * P on x = 1/t: slope = W′, intercept = CP. Requires ≥ 2 points. Manual override lives
 * in settings (§5.10); this is the automatic fit.
 */
export function estimateCpWprime(points: { durationS: number; powerW: number }[]): CpWprime {
  if (points.length < 2) throw new Error('estimateCpWprime: need at least 2 points')
  const xs = points.map((p) => 1 / p.durationS)
  const ys = points.map((p) => p.powerW)
  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) * (xs[i] - meanX)
    sxy += (xs[i] - meanX) * (ys[i] - meanY)
  }
  const wPrime = sxy / sxx // slope
  const cp = meanY - wPrime * meanX // intercept
  return { cp, wPrime }
}
