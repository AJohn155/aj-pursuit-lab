// Uniform 1 Hz timeline construction, SPEC §4.4.
//
// Split records at gaps > 5 s into segments (the race lives within one segment); within a
// segment, resample onto integer seconds, linearly interpolating across gaps ≤ 5 s. Mark
// interpolated samples and report dropout stats for the quality badge (§4.16).

import type { FitRecord, Timeline } from './types'
import { clamp, lerp } from './util'

const GAP_SPLIT_S = 5

/**
 * Split records into contiguous segments wherever the elapsed-time gap exceeds the
 * threshold (default 5 s). Files recorded at intervals ≥ the default threshold (e.g. a 5 s
 * SRM interval) pass a larger threshold, else every routine inter-record gap would split.
 */
export function splitSegments(records: FitRecord[], gapSplitS: number = GAP_SPLIT_S): FitRecord[][] {
  const segments: FitRecord[][] = []
  let current: FitRecord[] = [records[0]]
  for (let i = 1; i < records.length; i++) {
    if (records[i].t - records[i - 1].t > gapSplitS) {
      segments.push(current)
      current = []
    }
    current.push(records[i])
  }
  segments.push(current)
  return segments
}

/** Median inter-record interval, s (the file's own recording cadence). */
function medianIntervalS(records: FitRecord[]): number {
  if (records.length < 2) return 1
  const intervals = records
    .slice(1)
    .map((r, i) => r.t - records[i].t)
    .sort((a, b) => a - b)
  return intervals[Math.floor(intervals.length / 2)]
}

/**
 * Build a uniform 1 Hz timeline over the race segment (SPEC §4.4). The race segment is the
 * one with the most records — for both fixtures the race is by far the densest span, with
 * warmup/cooldown separated by large (69–751 s) gaps.
 */
export function buildTimeline(records: FitRecord[]): Timeline {
  if (records.length === 0) throw new Error('buildTimeline: no records')
  // Slow-recording files (e.g. 5 s SRM interval) split segments at 2.5× their own
  // interval instead of the 1 Hz default, else every routine gap would be a split.
  const rawInterval = medianIntervalS(records)
  const segments = splitSegments(records, Math.max(GAP_SPLIT_S, 2.5 * rawInterval))
  const seg = segments.reduce((a, b) => (b.length > a.length ? b : a))

  const t0 = seg[0].t
  const t1 = seg[seg.length - 1].t
  const n = Math.round(t1 - t0) + 1

  // Raw sample times (rounded to the second) mark which integer seconds are real vs filled.
  const rawSeconds = new Set(seg.map((r) => Math.round(r.t)))

  // The race segment's own recording cadence: a second between two 5 s-interval records is
  // expected coverage, not a dropout — only gaps exceeding the segment's own interval
  // count (owner file 2026-07 round 5). 1 Hz files behave exactly as before (interval 1 →
  // any skipped second is a dropout).
  const recordIntervalS = medianIntervalS(seg)

  const t: number[] = []
  const v: number[] = []
  const p: number[] = []
  const d: number[] = []
  const cad: number[] = []
  const interpolated: boolean[] = []

  let j = 0
  for (let k = 0; k < n; k++) {
    const now = t0 + k
    while (j < seg.length - 1 && seg[j + 1].t <= now) j++
    const a = seg[j]
    const b = seg[Math.min(j + 1, seg.length - 1)]
    const span = b.t - a.t || 1
    const f = clamp((now - a.t) / span, 0, 1)
    t.push(now)
    v.push(lerp(a.speedMs, b.speedMs, f))
    p.push(lerp(a.powerW, b.powerW, f))
    d.push(lerp(a.distanceM, b.distanceM, f))
    cad.push(lerp(a.cadenceRpm ?? 0, b.cadenceRpm ?? 0, f))
    interpolated.push(!rawSeconds.has(now) && b.t - a.t > recordIntervalS + 0.5)
  }

  const dropoutSeconds = interpolated.reduce((s, b) => s + (b ? 1 : 0), 0)
  return {
    t,
    v,
    p,
    d,
    cad,
    interpolated,
    dropoutSeconds,
    interpolatedFraction: dropoutSeconds / n,
    segmentCount: segments.length,
    segmentSpanS: t1 - t0,
    recordIntervalS,
  }
}
