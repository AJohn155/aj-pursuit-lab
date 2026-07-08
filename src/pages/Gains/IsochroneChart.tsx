// Isochrone chart (SPEC §5.5/§8): contours of simulated time over a CdA×power grid, with
// analyzed rides plotted as points at their own (CdA, avg power).

import Chart from '../../components/Chart'
import type { IsochroneGrid, RidePoint } from './gains'
import { T } from '../../components/EditableText'

export default function IsochroneChart({ grid, ridePoints }: { grid: IsochroneGrid; ridePoints: RidePoint[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="mb-2 text-sm font-semibold text-slate-900" id="gains.isochronechart.isochrone-chart" d="Isochrone chart" />
      <Chart
        ariaLabel="Contours of simulated finish time over CdA and average power, with rides plotted as points"
        data={[
          {
            type: 'contour',
            x: grid.cdaValues,
            y: grid.powerValues,
            z: grid.timeS,
            colorscale: 'Viridis',
            contours: { coloring: 'heatmap', showlabels: true },
            colorbar: { title: { text: 's' } },
            name: 'Simulated time',
          },
          {
            type: 'scatter',
            mode: 'text+markers',
            x: ridePoints.map((p) => p.cdaM2),
            y: ridePoints.map((p) => p.avgPowerW),
            text: ridePoints.map((p) => p.label),
            textposition: 'top center',
            marker: { color: 'white', size: 9, line: { color: 'black', width: 1.5 } },
            name: 'Rides',
          },
        ]}
        layout={{
          xaxis: { title: { text: 'CdA (m²)' } },
          yaxis: { title: { text: 'Avg power (W)' } },
        }}
        height={420}
      />
    </section>
  )
}
