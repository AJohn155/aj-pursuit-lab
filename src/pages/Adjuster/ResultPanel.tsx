// Live predicted time + lap splits + overlay vs baseline (SPEC §5.3).
//
// 2026-07 round 4 item 11 (owner screenshot): the Δ stat used to compare against the
// baseline's *re-simulation* while the card next to it displayed the baseline's *official*
// time, so "248.993 vs 248.699 = +1.05 s" never added up. Δ is now computed against exactly
// the number displayed (official time for a ride baseline), and the model's own
// reproduction of the baseline is surfaced as fine print so its bias is visible instead of
// silently folded into the delta. The gap chart's first 250 m looked broken for the same
// family of reason: the scenario side only had lap-line points, so lap 1 interpolated as a
// constant-speed straight line against the ride's real standing-start curve. The scenario
// curve now uses the dense simulated trajectory and starts where the simulation starts
// (after the start split / head start), and the baseline side is anchored on official
// splits when the ride has them.

import Chart from '../../components/Chart'
import { buildDistanceTimeSeries, gapCharts } from '../Compare/compare'
import type { DistanceTimeSeries } from '../Compare/compare'
import type { ResolvedScenario, ScenarioBaseline, ScenarioRunResult } from '../../store/scenario'
import { T } from '../../components/EditableText'

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
  // The baseline number the owner actually compares against: the ride's official time, or
  // the unmodified model run for a blank baseline. Δ is vs THIS number (positive = slower).
  const baselineShownS = baseline === 'blank' ? baselineRun.predictedTimeS : baseline.ride.officialTimeS
  const deltaS = run.predictedTimeS - baselineShownS

  const referenceSeries: DistanceTimeSeries =
    baseline === 'blank'
      ? { distM: [0, ...baselineRun.lapSplits.map((_, i) => (i + 1) * resolved.track.lapLengthM)], elapsedS: [0, ...baselineRun.lapSplits] }
      : buildDistanceTimeSeries(baseline.full, {
          officialSplits: baseline.ride.officialSplits,
          lapLengthM: resolved.track.lapLengthM,
        })

  // Dense scenario curve straight from the simulated trajectory, shifted back onto the
  // true datum/true clock (the sim starts after the head start — see resolveScenario).
  const simStartM = resolved.lapPhaseOffsetM
  const scenarioSeries: DistanceTimeSeries = {
    distM: run.sim.samples.map((s) => s.s + simStartM),
    elapsedS: run.sim.samples.map((s) => s.t + resolved.headStartS),
  }
  const [, scenarioGapFull] = gapCharts([referenceSeries, scenarioSeries])
  // Nothing is simulated before simStartM (the start split is an input, not a model), so
  // the curve begins there — comparing inside that stretch was the "weird first 250 m".
  const gapPoints = scenarioGapFull.distM
    .map((d, i) => ({ d, gap: scenarioGapFull.gapS[i] }))
    .filter((p) => p.d >= simStartM)

  const lapNumbers = run.lapTimes.map((_, i) => i + 1)

  const reproBiasS = baseline === 'blank' ? null : baselineRun.predictedTimeS - baseline.ride.officialTimeS

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="text-sm font-semibold text-slate-900" id="adjuster.resultpanel.result" d="Result" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Predicted time" value={`${run.predictedTimeS.toFixed(3)}s`} />
        <Stat
          label={baseline === 'blank' ? 'Baseline (no overrides)' : 'Baseline actual'}
          value={`${baselineShownS.toFixed(3)}s`}
        />
        <Stat
          label="Δ vs baseline"
          value={`${deltaS <= 0 ? '−' : '+'}${Math.abs(deltaS).toFixed(2)}s`}
          highlight={deltaS < 0 ? 'good' : deltaS > 0 ? 'bad' : undefined}
        />
        <Stat label="CdA used" value={resolved.cdaM2.toFixed(4)} />
      </div>
      {reproBiasS != null && (
        <T
          as="p"
          className="text-xs text-slate-400"
          id="adjuster.resultpanel.repro-bias-note"
          d="The model re-simulates the baseline ride itself at {reproTime}s ({bias}s vs official) — treat predicted deltas smaller than that reproduction bias as noise."
          vars={{
            reproTime: baselineRun.predictedTimeS.toFixed(3),
            bias: `${reproBiasS <= 0 ? '−' : '+'}${Math.abs(reproBiasS).toFixed(2)}`,
          }}
        />
      )}

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
              x: gapPoints.map((p) => p.d),
              y: gapPoints.map((p) => p.gap),
              name: 'Scenario',
              line: { color: '#2563eb' },
            },
          ]}
          layout={{
            xaxis: { title: { text: 'Distance (m)' }, range: [0, 4000] },
            yaxis: { title: { text: 'Gap (s), negative = ahead' } },
            shapes: [{ type: 'line', x0: 0, x1: 1, xref: 'paper', y0: 0, y1: 0, line: { color: '#94a3b8', dash: 'dot' } }],
          }}
          height={260}
        />
        {simStartM > 100 && (
          <T
            as="p"
            className="mt-1 text-xs text-slate-400"
            id="adjuster.resultpanel.sim-start-note"
            d="Starts at {startM} m — the start split is an input, not modeled, so there's nothing to compare inside lap 1."
            vars={{ startM: simStartM.toFixed(0) }}
          />
        )}
      </div>

      <div>
        <T as="h3" className="mb-1 text-xs font-semibold uppercase text-slate-500" id="adjuster.resultpanel.lap-splits" d="Lap splits" />
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
