// Optimality analysis (SPEC §5.6/§4.14): optimal vs actual pacing for a real ride
// baseline, with a CP/W′ panel (defaults from Settings, editable here as a local what-if
// — tune permanently on the Settings page).

import { useMemo, useState } from 'react'
import Chart from '../../components/Chart'
import type { ResolvedScenario } from '../../store/scenario'
import { pacingOptimality } from './pacing'
import type { PacingOptimalityResult } from './pacing'

export default function OptimalityPanel({
  resolved,
  defaultCp,
  defaultWPrimeJ,
}: {
  resolved: ResolvedScenario | null
  defaultCp: number
  defaultWPrimeJ: number
}) {
  const [cpInput, setCpInput] = useState(String(defaultCp))
  const [wPrimeInput, setWPrimeInput] = useState(String(defaultWPrimeJ))

  const cp = Number(cpInput)
  const wPrime = Number(wPrimeInput)

  const { result, error }: { result: PacingOptimalityResult | null; error: string | null } = useMemo(() => {
    if (!resolved || !Number.isFinite(cp) || !Number.isFinite(wPrime) || cp <= 0 || wPrime <= 0) {
      return { result: null, error: null }
    }
    try {
      return { result: pacingOptimality(resolved, cp, wPrime), error: null }
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [resolved, cp, wPrime])

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Pacing optimality</h2>
      <p className="text-xs text-slate-500">
        Grid-searches a 3-parameter pacing family (start intensity, settle power, end-kick timing) against this
        ride's own environment and compares it to the ride's real pacing.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:w-96">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">CP (W)</span>
          <input
            type="number"
            value={cpInput}
            onChange={(e) => setCpInput(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">W′ (J)</span>
          <input
            type="number"
            value={wPrimeInput}
            onChange={(e) => setWPrimeInput(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
      </div>

      {!resolved && <p className="text-sm text-slate-500">Pick a ride baseline above to run the optimality analysis.</p>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {result && (
        <>
          <div className="flex flex-wrap gap-6 text-sm text-slate-700">
            <div>
              <span className="text-slate-500">Optimal: </span>
              <span className="font-mono font-medium">{result.optimalTimeS.toFixed(3)} s</span>
            </div>
            <div>
              <span className="text-slate-500">Actual: </span>
              <span className="font-mono font-medium">{result.actualTimeS.toFixed(3)} s</span>
            </div>
            <div>
              <span className="text-slate-500">Time lost to pacing: </span>
              <span className={`font-mono font-medium ${result.deltaTimeS > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {result.deltaTimeS >= 0 ? '+' : ''}
                {result.deltaTimeS.toFixed(3)} s
              </span>
            </div>
          </div>

          <Chart
            ariaLabel="Time lost to pacing per lap, actual minus optimal"
            data={[
              {
                type: 'bar',
                x: result.timeLostPerLapS.map((_, i) => `L${i + 1}`),
                y: result.timeLostPerLapS,
                marker: { color: result.timeLostPerLapS.map((v) => (v >= 0 ? '#dc2626' : '#16a34a')) },
              },
            ]}
            layout={{ xaxis: { title: { text: 'Lap' } }, yaxis: { title: { text: 'Time lost (s)' } } }}
            height={260}
          />
        </>
      )}
    </section>
  )
}
