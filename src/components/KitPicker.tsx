// Structured kit picker (owner request 2026-07 round 4, item 3): kit is chosen from a
// persistent taxonomy — sections (Helmet, Suit, Shoes, …) each holding named equipment —
// so the same item is selectable across rides without spelling drift. The taxonomy lives
// in Settings (synced like everything else) and is editable inline: every section select
// has an "+ Add new…" entry, and the Manage panel adds/renames/removes sections and items.
//
// A ride's `kit` stays a plain string[] of item names (unchanged storage shape), so
// existing rides, the list's kit column, and the kit filter all keep working. Tags saved
// before the taxonomy existed (or whose item was later deleted) surface as "untagged"
// chips that can be kept, removed, or filed into a section with one click.

import { useState } from 'react'
import { dataStore } from '../store/DataStore'
import { SETTINGS_ID, withSettingsDefaults, type Settings } from '../store/types'
import { useCollection } from '../store/useCollection'

type Taxonomy = Settings['kitTaxonomy']

const ADD_NEW = '__add_new__'

export default function KitPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const settingsRows = useCollection(dataStore.settings)
  const rawSettings = settingsRows.find((s) => s.id === SETTINGS_ID)
  const [managing, setManaging] = useState(false)
  const [newSection, setNewSection] = useState('')

  if (!rawSettings) return <p className="text-xs text-slate-500">Loading kit list…</p>
  const settings = withSettingsDefaults(rawSettings)
  const taxonomy = settings.kitTaxonomy

  async function saveTaxonomy(next: Taxonomy) {
    await dataStore.settings.put({ ...settings, kitTaxonomy: next, updatedAt: new Date().toISOString() })
  }

  const allItems = new Set(taxonomy.flatMap((s) => s.items))
  const legacyTags = value.filter((v) => !allItems.has(v))

  function selectedIn(section: Taxonomy[number]): string {
    return value.find((v) => section.items.includes(v)) ?? ''
  }

  function setSectionSelection(section: Taxonomy[number], item: string) {
    const withoutSection = value.filter((v) => !section.items.includes(v))
    onChange(item ? [...withoutSection, item] : withoutSection)
  }

  async function handleSelect(section: Taxonomy[number], picked: string) {
    if (picked === ADD_NEW) {
      const name = window.prompt(`New ${section.section.toLowerCase()} name:`)?.trim()
      if (!name) return
      if (!section.items.includes(name)) {
        await saveTaxonomy(
          taxonomy.map((s) => (s.section === section.section ? { ...s, items: [...s.items, name] } : s)),
        )
      }
      setSectionSelection(section, name)
      return
    }
    setSectionSelection(section, picked)
  }

  async function fileLegacyTag(tag: string, sectionName: string) {
    if (!sectionName) return
    await saveTaxonomy(
      taxonomy.map((s) => (s.section === sectionName && !s.items.includes(tag) ? { ...s, items: [...s.items, tag] } : s)),
    )
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {taxonomy.map((section) => (
          <label key={section.section} className="block text-sm">
            <span className="text-xs font-medium text-slate-500">{section.section}</span>
            <select
              value={selectedIn(section)}
              onChange={(e) => void handleSelect(section, e.target.value)}
              className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">—</option>
              {section.items.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
              <option value={ADD_NEW}>+ Add new…</option>
            </select>
          </label>
        ))}
      </div>

      {legacyTags.length > 0 && (
        <div className="space-y-1 rounded-lg bg-amber-50 p-2">
          <p className="text-xs text-amber-800">
            Tags on this ride that aren't in the kit list yet — file each into a section (keeps it
            selected) or remove it:
          </p>
          <div className="flex flex-wrap gap-2">
            {legacyTags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-slate-700">
                {tag}
                <select
                  value=""
                  onChange={(e) => void fileLegacyTag(tag, e.target.value)}
                  className="rounded border border-slate-200 text-xs text-slate-500"
                >
                  <option value="">file under…</option>
                  {taxonomy.map((s) => (
                    <option key={s.section} value={s.section}>
                      {s.section}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== tag))}
                  className="font-bold text-red-600"
                  aria-label={`Remove tag ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setManaging((m) => !m)}
        className="text-xs font-medium text-violet-700 hover:underline"
      >
        {managing ? 'Done managing' : 'Manage kit list…'}
      </button>

      {managing && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {taxonomy.map((section) => (
            <div key={section.section} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-slate-500">{section.section}</span>
                <button
                  type="button"
                  onClick={() => {
                    const name = window.prompt('Rename section:', section.section)?.trim()
                    if (!name || name === section.section) return
                    void saveTaxonomy(taxonomy.map((s) => (s.section === section.section ? { ...s, section: name } : s)))
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  rename
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      section.items.length > 0 &&
                      !window.confirm(`Remove section "${section.section}" and its ${section.items.length} item(s) from the kit list? Rides keep their tags.`)
                    )
                      return
                    void saveTaxonomy(taxonomy.filter((s) => s.section !== section.section))
                  }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  remove section
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {section.items.map((item) => (
                  <span key={item} className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs text-slate-700">
                    {item}
                    <button
                      type="button"
                      onClick={() =>
                        void saveTaxonomy(
                          taxonomy.map((s) =>
                            s.section === section.section ? { ...s, items: s.items.filter((i) => i !== item) } : s,
                          ),
                        )
                      }
                      className="font-bold text-red-600"
                      aria-label={`Remove ${item} from ${section.section}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const name = window.prompt(`New ${section.section.toLowerCase()} name:`)?.trim()
                    if (!name || section.items.includes(name)) return
                    void saveTaxonomy(
                      taxonomy.map((s) => (s.section === section.section ? { ...s, items: [...s.items, name] } : s)),
                    )
                  }}
                  className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:bg-white"
                >
                  + add item
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <input
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              placeholder="New section (e.g. Overshoes)"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                const name = newSection.trim()
                if (!name || taxonomy.some((s) => s.section === name)) return
                void saveTaxonomy([...taxonomy, { section: name, items: [] }])
                setNewSection('')
              }}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white"
            >
              + Add section
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
