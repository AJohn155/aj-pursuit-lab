// Simple least-squares linear trendline, used for the per-lap CdA drift chart (SPEC §5.1)
// and the Progression scatter's fitted-equation overlay (owner request 2026-07 round 12).

export function linearTrend(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) * (xs[i] - meanX)
    sxy += (xs[i] - meanX) * (ys[i] - meanY)
  }
  const slope = sxx === 0 ? 0 : sxy / sxx
  const intercept = meanY - slope * meanX
  return { slope, intercept }
}

/** Coefficient of determination R² of a fitted line over the same points: 1 − SSres/SStot.
 * 0 when the y-values are constant (nothing to explain). */
export function rSquared(xs: number[], ys: number[], fit: { slope: number; intercept: number }): number {
  const n = ys.length
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    const pred = fit.intercept + fit.slope * xs[i]
    ssRes += (ys[i] - pred) * (ys[i] - pred)
    ssTot += (ys[i] - meanY) * (ys[i] - meanY)
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot
}
