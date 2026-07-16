// Shared "caught a rider here" vertical-line marker for the ride-detail plots (owner
// request 2026-07 round 12). Each chart's x-axis is in different units — race time (s),
// lap number, or distance (m) — so the caller passes the x-value in that chart's own
// units; this just produces the Plotly shape + label to merge into the layout.

export function catchLineLayout(x: number): {
  shapes: object[]
  annotations: object[]
} {
  return {
    shapes: [
      {
        type: 'line',
        xref: 'x',
        yref: 'paper',
        x0: x,
        x1: x,
        y0: 0,
        y1: 1,
        line: { color: '#f59e0b', width: 1.5, dash: 'dot' },
      },
    ],
    annotations: [
      {
        xref: 'x',
        yref: 'paper',
        x,
        y: 1,
        yanchor: 'bottom',
        text: 'caught rider',
        showarrow: false,
        font: { size: 10, color: '#b45309' },
      },
    ],
  }
}

/**
 * Race-relative time (s, t0-based) at a fractional lap position, from the constructed lap
 * boundary times — for placing the catch line on the time-axis plots (Traces, W′bal).
 * `caughtAtLap` 7.5 → the time halfway through lap 8. Null when the bracketing boundaries
 * aren't finite.
 */
export function lapPositionToRaceTimeS(
  caughtAtLap: number,
  lapBoundaryTimes: number[],
  t0: number,
): number | null {
  const i = Math.floor(caughtAtLap)
  const a = lapBoundaryTimes[i]
  const b = lapBoundaryTimes[i + 1]
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return null
  return a + (caughtAtLap - i) * (b - a) - t0
}
