// Accel/decel summary (SPEC §4.15 / §5.1).

import type { AccelDecel } from '../../../engine/ingest'
import Chart from '../../../components/Chart'

export default function AccelDecelSummary({ accelDecel }: { accelDecel: AccelDecel }) {
  const lapNumbers = accelDecel.byLap.map((l) => l.lap)
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Accel / decel</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Total accelerating</p>
          <p className="text-sm font-medium text-slate-800">{accelDecel.sAccel}s</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Total decelerating</p>
          <p className="text-sm font-medium text-slate-800">{accelDecel.sDecel}s</p>
        </div>
      </div>
      <Chart
        ariaLabel="Seconds spent accelerating versus decelerating per lap"
        data={[
          {
            type: 'bar',
            x: lapNumbers,
            y: accelDecel.byLap.map((l) => l.sAccel),
            name: 'Accelerating',
            marker: { color: '#16a34a' },
          },
          {
            type: 'bar',
            x: lapNumbers,
            y: accelDecel.byLap.map((l) => l.sDecel),
            name: 'Decelerating',
            marker: { color: '#dc2626' },
          },
        ]}
        layout={{ barmode: 'group', xaxis: { title: { text: 'Lap' } }, yaxis: { title: { text: 's' } } }}
        height={220}
      />
    </section>
  )
}
