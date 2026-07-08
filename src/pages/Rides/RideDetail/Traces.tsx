// Speed/power/cadence traces (SPEC §5.1), overlaid on ONE plot with per-series y-axes and
// a unified hover spike line (owner request 2026-07: single overlay + vertical cursor line
// instead of three stacked charts). The checkboxes still toggle series on/off.

import { useState } from 'react'
import Chart from '../../../components/Chart'
import { T } from '../../../components/EditableText'

export default function Traces({
  t,
  v,
  p,
  cad,
  t0,
}: {
  t: number[]
  v: number[]
  p: number[]
  cad: number[]
  t0: number
}) {
  const [show, setShow] = useState({ speed: true, power: true, cadence: true })
  const x = t.map((tt) => tt - t0)

  const toggle = (key: keyof typeof show) => setShow((s) => ({ ...s, [key]: !s[key] }))

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="text-sm font-semibold text-slate-900" id="rides.ridedetail.traces.traces" d="Traces" />
      <div className="flex flex-wrap gap-4 text-sm text-slate-600">
        {(
          [
            ['speed', 'Speed (m/s)'],
            ['power', 'Power (W)'],
            ['cadence', 'Cadence (rpm)'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input type="checkbox" checked={show[key]} onChange={() => toggle(key)} />
            {label}
          </label>
        ))}
      </div>
      <Chart
        ariaLabel="Speed, power and cadence over the race on one plot with a hover cursor line"
        data={[
          ...(show.speed
            ? [
                {
                  type: 'scatter' as const,
                  mode: 'lines' as const,
                  x,
                  y: v,
                  line: { color: '#7c3aed', width: 1.5 },
                  name: 'Speed (m/s)',
                },
              ]
            : []),
          ...(show.power
            ? [
                {
                  type: 'scatter' as const,
                  mode: 'lines' as const,
                  x,
                  y: p,
                  yaxis: 'y2',
                  line: { color: '#f43f5e', width: 1 },
                  name: 'Power (W)',
                },
              ]
            : []),
          ...(show.cadence
            ? [
                {
                  type: 'scatter' as const,
                  mode: 'lines' as const,
                  x,
                  y: cad,
                  yaxis: 'y3',
                  line: { color: '#10b981', width: 1 },
                  name: 'Cadence (rpm)',
                },
              ]
            : []),
        ]}
        layout={{
          hovermode: 'x unified',
          xaxis: {
            title: { text: 'Race time (s)' },
            domain: [0, 0.91],
            showspikes: true,
            spikemode: 'across',
            spikesnap: 'cursor',
            spikethickness: 1,
            spikedash: 'solid',
            spikecolor: '#94a3b8',
          },
          yaxis: { title: { text: 'm/s' }, tickfont: { color: '#7c3aed' } },
          yaxis2: {
            overlaying: 'y',
            side: 'right',
            showgrid: false,
            tickfont: { color: '#f43f5e' },
          },
          yaxis3: {
            overlaying: 'y',
            side: 'right',
            anchor: 'free',
            position: 0.97,
            showgrid: false,
            tickfont: { color: '#10b981' },
          },
          margin: { l: 48, r: 8, t: 24, b: 40 },
        }}
        height={340}
      />
    </section>
  )
}
