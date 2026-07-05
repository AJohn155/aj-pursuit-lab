// Shared graded-color helper for calculator grids (owner request 2026-07 item 17: the
// spreadsheet-style green→yellow→red conditional formatting). Pastel lightness keeps the
// numbers readable on top.

export function heatColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t))
  // Hue 130 (green) → 55 (yellow) → 12 (red), via yellow at t=0.5.
  const hue = clamped < 0.5 ? 130 - (130 - 55) * (clamped / 0.5) : 55 - (55 - 12) * ((clamped - 0.5) / 0.5)
  return `hsl(${hue.toFixed(0)}, 75%, 82%)`
}

/** Maps a value into [0,1] against a grid's min/max (equal min/max → 0.5). */
export function heatT(value: number, min: number, max: number): number {
  return max > min ? (value - min) / (max - min) : 0.5
}
