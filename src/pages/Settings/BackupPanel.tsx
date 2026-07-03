import { useRef, useState } from 'react'
import { dataStore } from '../../store/DataStore'

interface Backup {
  version: 1
  exportedAt: string
  settings: unknown[]
  venues: unknown[]
  rides: unknown[]
  scenarios: unknown[]
  events: unknown[]
}

export default function BackupPanel() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)

  async function handleExport() {
    const backup: Backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: await dataStore.settings.getAll(),
      venues: await dataStore.venues.getAll(),
      rides: await dataStore.rides.getAll(),
      scenarios: await dataStore.scenarios.getAll(),
      events: await dataStore.events.getAll(),
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aj-pursuit-lab-backup-${backup.exportedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(file: File) {
    setStatus(null)
    try {
      const text = await file.text()
      const backup = JSON.parse(text) as Backup
      if (backup.version !== 1) throw new Error('Unrecognized backup version')

      await Promise.all(backup.settings.map((s) => dataStore.settings.put(s as never)))
      await Promise.all(backup.venues.map((v) => dataStore.venues.put(v as never)))
      await Promise.all(backup.rides.map((r) => dataStore.rides.put(r as never)))
      await Promise.all(backup.scenarios.map((s) => dataStore.scenarios.put(s as never)))
      await Promise.all(backup.events.map((e) => dataStore.events.put(e as never)))

      setStatus(
        `Imported ${backup.venues.length} venue(s), ${backup.rides.length} ride(s), ${backup.scenarios.length} scenario(s), ${backup.events.length} event(s).`,
      )
    } catch (err) {
      setStatus(err instanceof Error ? `Import failed: ${err.message}` : 'Import failed')
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Backup</h2>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExport}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
        >
          Export backup JSON
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
        >
          Import backup JSON
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleImportFile(file)
            e.target.value = ''
          }}
        />
      </div>
      {status && <p className="mt-2 text-sm text-slate-600">{status}</p>}
    </section>
  )
}
