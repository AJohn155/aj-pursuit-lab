// Race detection, SPEC §4.5.
//
// 1. Candidate window: longest contiguous span where the 10 s rolling-mean power > 250 W
//    lasting 150–350 s.
// 2. Start anchor: walk back to the last sample with v < 1 m/s; if none, the file begins
//    mid-start → missingStart, start = first sample.
// 3. Refine t0: fit the first 5 moving speed samples (constant acceleration ⇒ v linear in
//    t, the "constant-jerk-free" case) and extrapolate to v = 0; clamp the extrapolation
//    to ≤ 3.5 s.
// 4. Finish: the datum 4000 m crossing measured from the start line (the timed distance of
//    a 4 km pursuit). The §4.5.3 power-collapse is a coarse window detector; the actual
//    finish for duration/timing is the 4000 m line, which is also what officialTimeS times
//    and what §4.7's lap-16 boundary and §4.5.5's finish alignment reference. Using
//    power-collapse instead runs ~3.6 s long on the final (the rider pedals past the line).

import type { Detection, Timeline } from './types'
import { crossingTime, mean, rollingMean } from './util'

const POWER_THRESHOLD_W = 250
const WINDOW_MIN_S = 150
const WINDOW_MAX_S = 350
const MAX_START_EXTRAP_S = 3.5
const RACE_DISTANCE_M = 4000

/**
 * Fit the first 5 moving speed samples and return the time (relative to `start`) where
 * v→0. Returns 0 (no refinement) when fewer than 5 samples remain, when the fit is not
 * accelerating (slope ≤ 0 — extrapolating backward to v=0 is meaningless), or when the
 * extrapolation lands after `start` — so a degenerate file can never produce a NaN t0 or
 * a start refined into the future.
 */
function extrapolateStart(v: number[], start: number): number {
  const N = 5
  if (start + N > v.length) return 0
  const mx = (N - 1) / 2
  let my = 0
  for (let k = 0; k < N; k++) my += v[start + k] / N
  let sxx = 0
  let sxy = 0
  for (let k = 0; k < N; k++) {
    sxx += (k - mx) * (k - mx)
    sxy += (k - mx) * (v[start + k] - my)
  }
  const slope = sxy / sxx
  if (slope <= 0) return 0
  const intercept = my - slope * mx
  const dt = -intercept / slope // t (rel to `start`) at which the linear fit hits v = 0
  return dt < 0 ? dt : 0
}

export function detectRace(tl: Timeline, officialTimeS?: number): Detection {
  const { t, v, p, d } = tl
  const n = p.length

  // 10 s trailing rolling-mean power.
  const rp = p.map((_, i) => rollingMean(p, 10, i))

  // Longest contiguous >250 W span lasting 150–350 s.
  let startIdx = -1
  let endIdx = -1
  let bestLen = 0
  let i = 0
  while (i < n) {
    if (rp[i] > POWER_THRESHOLD_W) {
      let j = i
      while (j < n && rp[j] > POWER_THRESHOLD_W) j++
      const len = t[j - 1] - t[i]
      if (len >= WINDOW_MIN_S && len <= WINDOW_MAX_S && len > bestLen) {
        bestLen = len
        startIdx = i
        endIdx = j - 1
      }
      i = j
    } else {
      i++
    }
  }
  if (startIdx < 0) throw new Error('detectRace: no sustained 150–350 s high-power window found')

  // Start anchor: walk back to the last v < 1; none ⇒ missing start.
  let anchor = startIdx
  let missingStart = false
  while (anchor > 0 && v[anchor] >= 1) anchor--
  if (v[anchor] >= 1) {
    missingStart = true
    anchor = 0
  }

  // First moving sample at/after the anchor.
  let firstMotionIdx = anchor
  while (firstMotionIdx < n && v[firstMotionIdx] < 1) firstMotionIdx++

  // Refine t0 by extrapolating the first 5 moving samples to v = 0, clamped.
  const extrap = extrapolateStart(v, firstMotionIdx)
  const t0 = t[firstMotionIdx] + Math.max(extrap, -MAX_START_EXTRAP_S)
  const startVComMs = v[firstMotionIdx]

  // Start-line file distance: subtract the distance covered during the extrapolated ramp
  // (triangular, v: 0 → v[firstMotion] over t[firstMotion]−t0).
  const d0 = d[firstMotionIdx] - 0.5 * v[firstMotionIdx] * (t[firstMotionIdx] - t0)

  const tFinish = crossingTime(t, d, d0 + RACE_DISTANCE_M) ?? t[n - 1]
  const detectedDurationS = tFinish - t0
  const raceMeanPowerW = mean(p.slice(startIdx, endIdx + 1))

  const detection: Detection = {
    t0,
    tFinish,
    detectedDurationS,
    missingStart,
    startVComMs,
    firstMotionIdx,
    raceWindow: { startIdx, endIdx },
    raceMeanPowerW,
    d0,
  }
  if (officialTimeS != null) {
    detection.officialTimeS = officialTimeS
    detection.officialDeltaS = detectedDurationS - officialTimeS
    detection.officialWithinTol = Math.abs(detection.officialDeltaS) <= 2.5
  }
  return detection
}
