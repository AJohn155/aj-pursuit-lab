// App-wide editable UI text (owner request 2026-07 round 4, item 15): every box title /
// subtitle rendered through <T> can be reworded from the shell's "Edit text" mode. The
// overrides live in Settings.textOverrides (synced with everything else), keyed by a
// stable per-string id; clearing a field restores the built-in default.

import { useState } from 'react'
import type { ReactNode } from 'react'
import { dataStore } from '../store/DataStore'
import { SETTINGS_ID, withSettingsDefaults } from '../store/types'
import { useCollection } from '../store/useCollection'
import { TextEditContext, useTextEdit } from './textEditContext'

export function TextEditProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState(false)
  return <TextEditContext.Provider value={{ editing, setEditing }}>{children}</TextEditContext.Provider>
}

/**
 * Editable text node. Renders the override for `id` (or the default `d`) inside `as`.
 * In edit mode it becomes an input styled to inherit the heading's own typography;
 * blur saves, empty restores the default.
 */
export function T({
  id,
  d,
  as: Tag = 'span',
  className,
}: {
  id: string
  d: string
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'legend'
  className?: string
}) {
  const { editing } = useTextEdit()
  const settingsRows = useCollection(dataStore.settings)
  const rawSettings = settingsRows.find((s) => s.id === SETTINGS_ID)
  const settings = rawSettings ? withSettingsDefaults(rawSettings) : undefined
  const text = settings?.textOverrides[id] ?? d

  if (!editing || !settings) return <Tag className={className}>{text}</Tag>

  async function save(value: string) {
    if (!settings) return
    const trimmed = value.trim()
    const next = { ...settings.textOverrides }
    if (trimmed === '' || trimmed === d) delete next[id]
    else next[id] = trimmed
    if (JSON.stringify(next) === JSON.stringify(settings.textOverrides)) return
    await dataStore.settings.put({ ...settings, textOverrides: next, updatedAt: new Date().toISOString() })
  }

  return (
    <Tag className={className}>
      <input
        defaultValue={text}
        placeholder={d}
        onBlur={(e) => void save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        title={`Default: ${d}`}
        className="w-full min-w-24 rounded border border-dashed border-violet-400 bg-violet-50/50 px-1"
        style={{ font: 'inherit', color: 'inherit', letterSpacing: 'inherit' }}
      />
    </Tag>
  )
}
