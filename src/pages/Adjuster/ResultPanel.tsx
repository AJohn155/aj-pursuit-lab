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
import { gapCharts } from '../Compare/compare'
import type { DistanceTimeSeries } from '../Compare/compare'
import type { ResolvedScenario, ScenarioBaseline, ScenarioRunResult } from '../../store/scenario'
import type { Scenario } from '../../store/types'
import { T } from '../../components/EditableText'

/** Overrides big enough that the anchor's cancellation argument weakens (owner decision
 * 2026-08-17): a different venue, or power moved more than this fraction from the ride's
 * own settle power. Below these, the raw model time stays in the fine print only. */
const BIG_POWER_FRACTION = 0.05

export default function ResultPanel({
  baseline,
  resolved,
  baselineResolved,
  run,
  baselineRun,
  overrides,
}: {
  baseline: ScenarioBaseline
  resolved: ResolvedScenario
  /** The same baseline resolved with NO overrides — the run the anchor differences against. */
  baselineResolved: ResolvedScenario
  run: ScenarioRunResult
  baselineRun: ScenarioRunResult
  overrides: Scenario['overrides']
}) {
  // The baseline number the owner actually compares against: the ride's official time, or
  // the unmodified model run for a blank baseline.
  const baselineShownS = baseline === 'blank' ? baselineRun.predictedTimeS : baseline.ride.officialTimeS

  // Reference curve for the gap chart: the baseline MODEL run's own dense trajectory (same
  // model family as the scenario curve), so the chart's endpoint equals the headline Δ.
  // Comparing against the ride's actual split-anchored curve — the previous reference —
  // made the endpoint carry the reproduction error the stats now cancel (+0.83 s here vs a
  // −0.04 s headline; the owner cross-checks exactly this arithmetic).
  const referenceSeries: DistanceTimeSeries =
    baseline === 'blank'
      ? { distM: [0, ...baselineRun.lapSplits.map((_, i) => (i + 1) * resolved.track.lapLengthM)], elapsedS: [0, ...baselineRun.lapSplits] }
      : {
          distM: baselineRun.sim.samples.map((s) => s.s + baselineResolved.lapPhaseOffsetM),
          elapsedS: baselineRun.sim.samples.map((s) => s.t + baselineResolved.headStartS),
        }

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
  // The sensitivity number (owner report 2026-08-17): scenario model MINUS baseline model.
  // Both runs carry the same reproduction error, so it cancels exactly — "what is +1 W
  // worth" is answerable even though neither absolute time lands on the official one.
  // Measured on his 2024 Pan Am quali: +5 W is −0.798 s here, and stays −0.792…−0.806 s
  // when the baseline CdA is moved ±5 counts, i.e. it barely notices the ~2-count
  // disagreement between the fitted and time-matching CdA.
  const modelDeltaS = run.predictedTimeS - baselineRun.predictedTimeS
  // Anchored prediction (owner decision 2026-08-17): the model is trusted as a
  // differencer, the official time as the clock — so the predicted time is the real ride
  // plus the model's delta, and Predicted − Baseline = Δ holds exactly on the panel.
  const anchoredS = baseline === 'blank' ? run.predictedTimeS : baselineShownS + modelDeltaS

  // "Big" overrides where the cancellation assumption weakens: surface the raw model time
  // as its own stat (owner choice: show both) instead of fine print only.
  const settleW = baseline === 'blank' ? null : baseline.full.analysisResult.avgPowerExclLap1W
  const powerIsBig =
    (overrides.powerScale != null && Math.abs(overrides.powerScale - 1) > BIG_POWER_FRACTION) ||
    (overrides.avgPowerW != null &&
      settleW != null &&
      Number.isFinite(settleW) &&
      settleW > 0 &&
      Math.abs(overrides.avgPowerW / settleW - 1) > BIG_POWER_FRACTION)
  const venueIsChanged = resolved.venue.id !== baselineResolved.venue.id
  const showRawModel = baseline !== 'blank' && (powerIsBig || venueIsChanged)

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="text-sm font-semibold text-slate-900" id="adjuster.resultpanel.result" d="Result" />

      <div className={`grid grid-cols-2 gap-3 ${showRawModel ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-4'}`}>
        <Stat
          label="Predicted time"
          value={`${anchoredS.toFixed(3)}s`}
          hint={baseline === 'blank' ? undefined : 'Your ride + the model delta'}
        />
        <Stat
          label={baseline === 'blank' ? 'Baseline (no overrides)' : 'Baseline actual'}
          value={`${baselineShownS.toFixed(3)}s`}
        />
        <Stat
          label="Δ vs baseline"
          value={`${modelDeltaS <= 0 ? '−' : '+'}${Math.abs(modelDeltaS).toFixed(2)}s`}
          highlight={modelDeltaS < 0 ? 'good' : modelDeltaS > 0 ? 'bad' : undefined}
        />
        {showRawModel && (
          <Stat
            label="Raw model"
            value={`${run.predictedTimeS.toFixed(3)}s`}
            hint={venueIsChanged ? 'Unanchored — venue changed, so the anchor is a stretch' : 'Unanchored — big power change, so the anchor is a stretch'}
          />
        )}
        <Stat label="CdA used" value={resolved.cdaM2.toFixed(4)} />
      </div>
      {reproBiasS != null && (
        <T
          as="p"
          className="text-xs text-slate-400"
          id="adjuster.resultpanel.repro-bias-note"
          d="Predicted time = the ride's official {official}s + the model's delta. The raw model puts the baseline at {reproTime}s ({bias}s vs official — a single CdA can't reproduce laps 1 and 16, which the laps 3–15 fit excludes) and this scenario at {rawScenario}s; differencing the two runs cancels that shared error, so small changes stay readable."
          vars={{
            official: baselineShownS.toFixed(3),
            reproTime: baselineRun.predictedTimeS.toFixed(3),
            bias: `${reproBiasS <= 0 ? '−' : '+'}${Math.abs(reproBiasS).toFixed(2)}`,
            rawScenario: run.predictedTimeS.toFixed(3),
          }}
        />
      )}

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">
          Gap vs {baseline === 'blank' ? 'unmodified baseline' : 'baseline (model run)'}
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

function Stat({
  label,
  value,
  highlight,
  hint,
}: {
  label: string
  value: string
  highlight?: 'good' | 'bad'
  hint?: string
}) {
  const color = highlight === 'good' ? 'text-green-700' : highlight === 'bad' ? 'text-red-700' : 'text-slate-800'
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-tight text-slate-400">{hint}</p>}
    </div>
  )
}
