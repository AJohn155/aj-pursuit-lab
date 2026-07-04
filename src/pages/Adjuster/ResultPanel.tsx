// Live predicted time + lap splits + overlay vs baseline (SPEC §5.3).

import Chart from '../../components/Chart'
import { buildDistanceTimeSeries, gapCharts } from '../Compare/compare'
import type { DistanceTimeSeries } from '../Compare/compare'
import type { ResolvedScenario, ScenarioBaseline, ScenarioRunResult } from '../../store/scenario'

export default function ResultPanel({
  baseline,
  resolved,
  run,
  baselineRun,
}: {
  baseline: ScenarioBaseline
  resolved: ResolvedScenario
  run: ScenarioRunResult
  baselineRun: ScenarioRunResult
}) {
  const deltaS = baselineRun.predictedTimeS - run.predictedTimeS // positive = scenario faster

  const referenceSeries: DistanceTimeSeries =
    baseline === 'blank'
      ? { distM: [0, ...baselineRun.lapSplits.map((_, i) => (i + 1) * resolved.track.lapLengthM)], elapsedS: [0, ...baselineRun.lapSplits] }
      : buildDistanceTimeSeries(baseline.full)
  const scenarioSeries: DistanceTimeSeries = {
    distM: [0, ...run.lapSplits.map((_, i) => (i + 1) * resolved.track.lapLengthM)],
    elapsedS: [0, ...run.lapSplits],
  }
  const [, scenarioGap] = gapCharts([referenceSeries, scenarioSeries])

  const lapNumbers = run.lapTimes.map((_, i) => i + 1)

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Result</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Predicted time" value={`${run.predictedTimeS.toFixed(3)}s`} />
        <Stat
          label={baseline === 'blank' ? 'Baseline (no overrides)' : 'Baseline actual'}
          value={`${(baseline === 'blank' ? baselineRun.predictedTimeS : baseline.ride.officialTimeS).toFixed(3)}s`}
        />
        <Stat
          label="Δ vs baseline"
          value={`${deltaS >= 0 ? '−' : '+'}${Math.abs(deltaS).toFixed(2)}s`}
          highlight={deltaS > 0 ? 'good' : deltaS < 0 ? 'bad' : undefined}
        />
        <Stat label="CdA used" value={resolved.cdaM2.toFixed(4)} />
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">
          Gap vs {baseline === 'blank' ? 'unmodified baseline' : 'baseline ride (actual)'}
        </h3>
        <Chart
          ariaLabel="Cumulative time delta of this scenario versus the baseline, by distance"
          data={[
            {
              type: 'scatter',
              mode: 'lines',
              x: scenarioGap.distM,
              y: scenarioGap.gapS,
              name: 'Scenario',
              line: { color: '#2563eb' },
            },
          ]}
          layout={{
            xaxis: { title: { text: 'Distance (m)' } },
            yaxis: { title: { text: 'Gap (s), negative = ahead' } },
            shapes: [{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0, y1: 0, line: { color: '#94a3b8', dash: 'dot' } }],
          }}
          height={260}
        />
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Lap splits</h3>
        <Chart
          ariaLabel="Predicted lap split times for this scenario"
          data={[
            {
              type: 'bar',
              x: lapNumbers,
              y: run.lapTimes,
              marker: { color: '#2563eb' },
              name: 'Scenario',
            },
          ]}
          layout={{ xaxis: { title: { text: 'Lap' }, dtick: 1 }, yaxis: { title: { text: 's' } } }}
          height={240}
        />
      </div>
    </section>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: 'good' | 'bad' }) {
  const color = highlight === 'good' ? 'text-green-700' : highlight === 'bad' ? 'text-red-700' : 'text-slate-800'
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
    </div>
  )
}
