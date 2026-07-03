import { liveQuery } from 'dexie'
import { db } from './db'
import type { Event, Persisted, Ride, Scenario, Settings, Venue } from './types'

export type CollectionName = 'settings' | 'venues' | 'rides' | 'scenarios' | 'events'

/** Called after every local write/delete so the sync layer can push to Firestore. */
export type ChangeListener = (collection: CollectionName, id: string, deleted: boolean) => void

export interface Collection<T extends Persisted> {
  getAll(): Promise<T[]>
  get(id: string): Promise<T | undefined>
  /** `silent` skips the change notification — used by the sync engine applying
   * an incoming remote doc, so it doesn't get pushed straight back out. */
  put(item: T, options?: { silent?: boolean }): Promise<void>
  delete(id: string): Promise<void>
  /** Live local query. Reads always come from IndexedDB per SPEC §2. */
  observe(): { subscribe(next: (items: T[]) => void): { unsubscribe(): void } }
}

export interface DataStore {
  settings: Collection<Settings>
  venues: Collection<Venue>
  rides: Collection<Ride>
  scenarios: Collection<Scenario>
  events: Collection<Event>
  onChange(listener: ChangeListener): () => void
}

class DexieCollection<T extends Persisted> implements Collection<T> {
  private readonly name: CollectionName
  private readonly table: import('dexie').Table<T, string>
  private readonly notify: (collection: CollectionName, id: string, deleted: boolean) => void

  constructor(
    name: CollectionName,
    table: import('dexie').Table<T, string>,
    notify: (collection: CollectionName, id: string, deleted: boolean) => void,
  ) {
    this.name = name
    this.table = table
    this.notify = notify
  }

  getAll(): Promise<T[]> {
    return this.table.toArray()
  }

  get(id: string): Promise<T | undefined> {
    return this.table.get(id)
  }

  async put(item: T, options?: { silent?: boolean }): Promise<void> {
    await this.table.put(item)
    if (!options?.silent) this.notify(this.name, item.id, false)
  }

  async delete(id: string): Promise<void> {
    await this.table.delete(id)
    this.notify(this.name, id, true)
  }

  observe() {
    const table = this.table
    return {
      subscribe(next: (items: T[]) => void) {
        const sub = liveQuery(() => table.toArray()).subscribe({ next })
        return { unsubscribe: () => sub.unsubscribe() }
      },
    }
  }
}

class LocalDataStore implements DataStore {
  private listeners = new Set<ChangeListener>()

  private notify: ChangeListener = (collection, id, deleted) => {
    for (const l of this.listeners) l(collection, id, deleted)
  }

  settings = new DexieCollection<Settings>('settings', db.settings, this.notify)
  venues = new DexieCollection<Venue>('venues', db.venues, this.notify)
  rides = new DexieCollection<Ride>('rides', db.rides, this.notify)
  scenarios = new DexieCollection<Scenario>('scenarios', db.scenarios, this.notify)
  events = new DexieCollection<Event>('events', db.events, this.notify)

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

/** Single DataStore instance the app talks to. Swap the sync backend without touching callers. */
export const dataStore: DataStore = new LocalDataStore()
