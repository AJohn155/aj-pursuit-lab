import DetectionConfirm from './DetectionConfirm'

export default function Rides() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Rides</h1>
      <p className="text-sm text-slate-500">
        Upload a ride and confirm the detected race window. The rides list, metadata form,
        and full ride detail arrive in P4.
      </p>
      <DetectionConfirm />
    </div>
  )
}
