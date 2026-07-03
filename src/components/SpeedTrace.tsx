// Speed trace with draggable start/finish handles for the race-detection confirm screen
// (SPEC §4.5 / §5.1). Self-contained SVG — the app's Plotly chart wrapper (§2) lands in P4;
// this needs only a line plot plus two drag handles, so SVG keeps P3 dependency-free.

import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

export interface SpeedTraceProps {
  /** Elapsed seconds (parallel to v). */
  t: number[]
  /** Speed, m/s. */
  v: number[]
  startT: number
  finishT: number
  officialTimeS?: number
  onChangeStart?: (t: number) => void
  onChangeFinish?: (t: number) => void
  height?: number
}

const W = 720
const PAD = { l: 40, r: 12, t: 12, b: 26 }

export default function SpeedTrace({
  t,
  v,
  startT,
  finishT,
  onChangeStart,
  onChangeFinish,
  height = 220,
}: SpeedTraceProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const H = height
  const x0 = Math.min(t[0], startT)
  const x1 = Math.max(t[t.length - 1], finishT)
  const vMax = Math.max(...v) * 1.08

  const sx = (tt: number) => PAD.l + ((tt - x0) / (x1 - x0)) * (W - PAD.l - PAD.r)
  const sy = (vv: number) => PAD.t + (1 - vv / vMax) * (H - PAD.t - PAD.b)

  const line = t.map((tt, i) => `${sx(tt).toFixed(1)},${sy(v[i]).toFixed(1)}`).join(' ')

  const timeAtClientX = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return x0
    const px = (clientX - rect.left) * (W / rect.width)
    const tt = x0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (x1 - x0)
    return Math.max(x0, Math.min(x1, tt))
  }

  const startDrag = (cb?: (t: number) => void) => (e: ReactPointerEvent) => {
    if (!cb) return
    e.preventDefault()
    const move = (ev: PointerEvent) => cb(timeAtClientX(ev.clientX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const yTicks = [0, 5, 10, 15, 20].filter((s) => s <= vMax)
  const xTickStep = x1 - x0 > 400 ? 60 : 30
  const xTicks: number[] = []
  for (let tt = Math.ceil(x0 / xTickStep) * xTickStep; tt <= x1; tt += xTickStep) xTicks.push(tt)

  const handles = [
    { at: startT, color: '#16a34a', label: 'S', onDrag: onChangeStart },
    { at: finishT, color: '#dc2626', label: 'F', onDrag: onChangeFinish },
  ]

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Speed trace with draggable race start and finish handles"
      style={{ touchAction: 'none', userSelect: 'none' }}
    >
      {/* detected race window shading */}
      <rect
        x={sx(startT)}
        y={PAD.t}
        width={Math.max(0, sx(finishT) - sx(startT))}
        height={H - PAD.t - PAD.b}
        fill="#2563eb"
        opacity={0.08}
      />
      {/* axes */}
      {yTicks.map((s) => (
        <g key={`y${s}`}>
          <line x1={PAD.l} x2={W - PAD.r} y1={sy(s)} y2={sy(s)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={PAD.l - 5} y={sy(s) + 3} fontSize={9} textAnchor="end" fill="#94a3b8">
            {s}
          </text>
        </g>
      ))}
      {xTicks.map((tt) => (
        <text key={`x${tt}`} x={sx(tt)} y={H - PAD.b + 14} fontSize={9} textAnchor="middle" fill="#94a3b8">
          {tt}s
        </text>
      ))}
      {/* speed line */}
      <polyline points={line} fill="none" stroke="#334155" strokeWidth={1.25} />
      {/* draggable start/finish handles */}
      {handles.map((h) => (
        <g
          key={h.label}
          style={{ cursor: h.onDrag ? 'ew-resize' : 'default' }}
          onPointerDown={startDrag(h.onDrag)}
        >
          <rect x={sx(h.at) - 8} y={PAD.t} width={16} height={H - PAD.t - PAD.b} fill="transparent" />
          <line x1={sx(h.at)} x2={sx(h.at)} y1={PAD.t} y2={H - PAD.b} stroke={h.color} strokeWidth={2} />
          <rect x={sx(h.at) - 5} y={PAD.t} width={10} height={10} rx={2} fill={h.color} />
          <text x={sx(h.at)} y={PAD.t + 9} fontSize={9} textAnchor="middle" fill="#fff">
            {h.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
