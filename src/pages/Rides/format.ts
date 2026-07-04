// Small presentation helpers shared across the Rides pages.

import type { QualityBadge } from '../../engine/ingest'

export function formatTimeS(seconds: number): string {
  return `${seconds.toFixed(3)}s`
}

/** Badge color classes matching the §4.16 thresholds (green ≥85, yellow ≥60, red below). */
export function qualityBadgeForScore(score: number): QualityBadge {
  if (score >= 85) return 'green'
  if (score >= 60) return 'yellow'
  return 'red'
}

export const BADGE_CLASSES: Record<QualityBadge, string> = {
  green: 'bg-green-100 text-green-800',
  yellow: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
}

/** Time-weighted average power across a set of laps (SPEC §5.1 rides-list "avg W"). */
export function weightedAvgPower(laps: { timeS: number; avgP: number }[]): number | null {
  const valid = laps.filter((l) => Number.isFinite(l.avgP))
  if (valid.length === 0) return null
  const totalTime = valid.reduce((s, l) => s + l.timeS, 0)
  if (totalTime <= 0) return null
  return valid.reduce((s, l) => s + l.avgP * l.timeS, 0) / totalTime
}
