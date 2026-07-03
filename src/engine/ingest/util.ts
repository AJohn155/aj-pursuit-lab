// Small numeric helpers for ingest. Pure.

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

export function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

export function lerp(a: number, b: number, f: number): number {
  return a + f * (b - a)
}

/** Trailing rolling mean of `arr` over `w` samples ending at index i. */
export function rollingMean(arr: number[], w: number, i: number): number {
  let sum = 0
  let n = 0
  for (let k = Math.max(0, i - w + 1); k <= i; k++) {
    sum += arr[k]
    n++
  }
  return sum / n
}

/**
 * Linear interpolate a value from a 1 Hz-sampled series `arr` (parallel to integer-second
 * `t`) at an arbitrary elapsed time. Clamps to the endpoints.
 */
export function interpAt(t: number[], arr: number[], at: number): number {
  if (at <= t[0]) return arr[0]
  if (at >= t[t.length - 1]) return arr[arr.length - 1]
  const i = Math.floor(at - t[0])
  const frac = at - t[i]
  return arr[i] + frac * (arr[i + 1] - arr[i])
}

/** Elapsed time at which a monotonic-ish series `d` first reaches `target` (linear interp). */
export function crossingTime(t: number[], d: number[], target: number): number | null {
  for (let k = 1; k < d.length; k++) {
    if (d[k - 1] < target && d[k] >= target) {
      const frac = (target - d[k - 1]) / (d[k] - d[k - 1])
      return t[k - 1] + frac * (t[k] - t[k - 1])
    }
  }
  return null
}
