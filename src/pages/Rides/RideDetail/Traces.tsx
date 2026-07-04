// Speed/power/cadence traces, toggleable (SPEC §5.1).

import { useState } from 'react'
import Chart from '../../../components/Chart'

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
      <h2 className="text-sm font-semibold text-slate-900">Traces</h2>
      <div className="flex gap-4 text-sm text-slate-600">
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
      {show.speed && (
        <Chart
          ariaLabel="Speed over the race, wheel-derived, m/s"
          data={[{ type: 'scatter', mode: 'lines', x, y: v, line: { color: '#2563eb' }, name: 'Speed' }]}
          layout={{ yaxis: { title: { text: 'm/s' } }, xaxis: { title: { text: 's' } } }}
          height={220}
        />
      )}
      {show.power && (
        <Chart
          ariaLabel="Power over the race, watts"
          data={[{ type: 'scatter', mode: 'lines', x, y: p, line: { color: '#dc2626' }, name: 'Power' }]}
          layout={{ yaxis: { title: { text: 'W' } }, xaxis: { title: { text: 's' } } }}
          height={220}
        />
      )}
      {show.cadence && (
        <Chart
          ariaLabel="Cadence over the race, rpm"
          data={[{ type: 'scatter', mode: 'lines', x, y: cad, line: { color: '#16a34a' }, name: 'Cadence' }]}
          layout={{ yaxis: { title: { text: 'rpm' } }, xaxis: { title: { text: 's' } } }}
          height={220}
        />
      )}
    </section>
  )
}
