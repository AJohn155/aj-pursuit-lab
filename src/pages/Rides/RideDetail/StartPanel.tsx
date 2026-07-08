import { T } from '../../../components/EditableText'
// Standing-start panel (SPEC §4.6 metrics / §5.1).

export default function StartPanel({
  startMetrics,
}: {
  startMetrics: { energyJ: number; timeTo95PctCruise: number; peakPower: number }
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="mb-3 text-sm font-semibold text-slate-900" id="rides.ridedetail.startpanel.start" d="Start" />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Start energy" value={`${(startMetrics.energyJ / 1000).toFixed(2)} kJ`} />
        <Stat label="Time to 95% cruise" value={`${startMetrics.timeTo95PctCruise.toFixed(1)}s`} />
        <Stat label="Peak power" value={`${startMetrics.peakPower.toFixed(0)} W`} />
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  )
}
