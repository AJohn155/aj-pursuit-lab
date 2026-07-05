// Shared helpers for the speed-vs-position overlay charts (RideDetail and Compare):
// lap-gradient colors, phase re-anchoring onto track coordinates, and bend shading.
// Kept out of the component files so react-refresh stays happy.

/** Light→dark single-direction gradient across the ride: hsl(210,90%,78%) → hsl(250,85%,32%). */
export function lapGradientColor(lap: number, lapCount: number): string {
  const f = lapCount > 1 ? (lap - 1) / (lapCount - 1) : 0
  const h = 210 + f * 40
  const s = 90 - f * 5
  const l = 78 - f * 46
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`
}

/** Re-anchor a position-in-lap onto track coordinates (0 = start of a straight). */
export function alignPosM(posM: number, phaseOffsetM: number, lapLengthM: number): number {
  return (((posM - phaseOffsetM) % lapLengthM) + lapLengthM) % lapLengthM
}

/** Plotly shapes shading the two bend spans for a (fitted or published) geometry. */
export function bendShapes(straightLengthM: number, lapLengthM: number) {
  const arc = (lapLengthM - 2 * straightLengthM) / 2
  const S = straightLengthM
  return [
    { start: S, end: S + arc },
    { start: 2 * S + arc, end: lapLengthM },
  ].map(({ start, end }) => ({
    type: 'rect' as const,
    xref: 'x' as const,
    yref: 'paper' as const,
    x0: start,
    x1: end,
    y0: 0,
    y1: 1,
    fillcolor: 'rgba(148, 163, 184, 0.12)',
    line: { width: 0 },
  }))
}

/** Splits a series at wrap-around discontinuities so aligned laps don't draw a horizontal
 * streak across the plot when the shift moves the seam mid-lap. */
export function splitAtWraps(posM: number[], speedMs: number[]): { x: number[]; y: number[] }[] {
  const parts: { x: number[]; y: number[] }[] = []
  let cur: { x: number[]; y: number[] } = { x: [], y: [] }
  for (let i = 0; i < posM.length; i++) {
    if (i > 0 && Math.abs(posM[i] - posM[i - 1]) > 100) {
      if (cur.x.length > 1) parts.push(cur)
      cur = { x: [], y: [] }
    }
    cur.x.push(posM[i])
    cur.y.push(speedMs[i])
  }
  if (cur.x.length > 1) parts.push(cur)
  return parts
}
