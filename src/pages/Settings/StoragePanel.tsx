// Storage overview (owner question 2026-07 round 9: "what does my storage situation look
// like?"). Everything lives in the browser's IndexedDB (synced to Firestore when signed
// in), and each ride embeds its .fit file as base64 inside its own document — so the two
// numbers that matter are per-ride doc size vs the Firestore 1 MB doc limit (already
// guarded at upload) and total local usage vs the browser quota.

import { useEffect, useState } from 'react'
import { FIT_FILE_B64_MAX_BYTES } from '../../store/encoding'
import { dataStore } from '../../store/DataStore'
import { useCollection } from '../../store/useCollection'
import { T } from '../../components/EditableText'

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function StoragePanel() {
  const rides = useCollection(dataStore.rides)
  const venues = useCollection(dataStore.venues)
  const scenarios = useCollection(dataStore.scenarios)
  const events = useCollection(dataStore.events)

  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    void navigator.storage?.estimate?.().then((e) => {
      if (!cancelled && e.usage != null && e.quota != null) setQuota({ usage: e.usage, quota: e.quota })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Doc size ≈ its JSON length; the .fit base64 dominates. Both are what Firestore counts.
  const docSizes = rides.map((r) => ({ ride: r, bytes: JSON.stringify(r).length }))
  const totalRideBytes = docSizes.reduce((s, d) => s + d.bytes, 0)
  const largest = docSizes.reduce((a, b) => (b.bytes > (a?.bytes ?? 0) ? b : a), docSizes[0])
  const fitBytes = rides.reduce((s, r) => s + Math.round(((r.fitFileB64?.length ?? 0) * 3) / 4), 0)

  const stats: { label: string; value: string; hint?: string }[] = [
    {
      label: 'Rides',
      value: `${rides.length} (${fmtBytes(totalRideBytes)})`,
      hint: `.fit attachments ${fmtBytes(fitBytes)}`,
    },
    {
      label: 'Largest ride doc',
      value: largest ? fmtBytes(largest.bytes) : '—',
      hint: `Firestore limit 1 MB; upload guard ${fmtBytes(FIT_FILE_B64_MAX_BYTES)} of base64`,
    },
    {
      label: 'Other docs',
      value: `${venues.length} venues · ${scenarios.length} scenarios · ${events.length} events`,
    },
    {
      label: 'Browser storage',
      value: quota ? `${fmtBytes(quota.usage)} of ${fmtBytes(quota.quota)}` : '—',
      hint: quota ? `${((quota.usage / quota.quota) * 100).toFixed(2)}% of what this browser allows` : undefined,
    },
  ]

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <T as="h2" className="mb-1 text-sm font-semibold text-slate-900" id="settings.storage.title" d="Storage" />
      <T
        as="p"
        className="mb-3 text-xs text-slate-500"
        id="settings.storage.caption"
        d="Rides live in this browser's IndexedDB (synced to Firestore when signed in); each ride embeds its .fit file. SRM race files are tiny (~10 KB), so hundreds of rides use a few MB — the browser quota and Firestore free tier (1 GiB) are nowhere in sight."
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-sm font-semibold text-slate-900">{s.value}</p>
            {s.hint && <p className="text-[11px] text-slate-400">{s.hint}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}
