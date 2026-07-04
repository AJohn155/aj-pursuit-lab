// Simple least-squares linear trendline, used for the per-lap CdA drift chart (SPEC §5.1).

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
