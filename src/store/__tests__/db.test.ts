import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { dataStore } from '../DataStore'
import { AppDatabase, SEED_VENUES, ensureSeeded } from '../db'
import { DEFAULT_SETTINGS_VALUES, SETTINGS_ID } from '../types'

describe('ensureSeeded', () => {
  beforeEach(async () => {
    const fresh = new AppDatabase()
    await fresh.delete()
    await fresh.open()
    await fresh.close()
  })

  it('seeds default settings and all venues on first run', async () => {
    await ensureSeeded()

    const settings = await dataStore.settings.get(SETTINGS_ID)
    expect(settings).toMatchObject(DEFAULT_SETTINGS_VALUES)

    const venues = await dataStore.venues.getAll()
    expect(venues).toHaveLength(SEED_VENUES.length)
    expect(venues.map((v) => v.name).sort()).toEqual(
      SEED_VENUES.map((v) => v.name).sort(),
    )
  })

  it('is idempotent: running twice does not duplicate venues or reset edited settings', async () => {
    await ensureSeeded()

    const settings = await dataStore.settings.get(SETTINGS_ID)
    await dataStore.settings.put({ ...settings!, rolloutM: 2.105 })

    await ensureSeeded()

    const venues = await dataStore.venues.getAll()
    expect(venues).toHaveLength(SEED_VENUES.length)

    const settingsAfter = await dataStore.settings.get(SETTINGS_ID)
    expect(settingsAfter?.rolloutM).toBe(2.105)
  })
})

describe('DataStore CRUD + change notifications', () => {
  beforeEach(async () => {
    const fresh = new AppDatabase()
    await fresh.delete()
    await fresh.open()
    await fresh.close()
    await ensureSeeded()
  })

  it('put/get/getAll/delete round-trip through IndexedDB', async () => {
    const now = new Date().toISOString()
    await dataStore.rides.put({
      id: 'ride-1',
      createdAt: now,
      updatedAt: now,
      date: '2026-01-01',
      venueId: 'seed-venue-0',
      eventName: 'Test event',
      round: 'final',
      officialTimeS: 246.793,
      officialSplits: [],
      gear: { chainring: 65, cog: 15 },
      systemMassKg: 100,
      kit: [],
      notes: '',
      flags: { outdoor: false, caughtRider: false, interrupted: false },
      analysisVersion: 'v0',
    })

    expect(await dataStore.rides.get('ride-1')).toMatchObject({ eventName: 'Test event' })
    expect(await dataStore.rides.getAll()).toHaveLength(1)

    await dataStore.rides.delete('ride-1')
    expect(await dataStore.rides.get('ride-1')).toBeUndefined()
  })

  it('notifies onChange listeners on put and delete, but not on silent put', async () => {
    const events: { collection: string; id: string; deleted: boolean }[] = []
    const unsubscribe = dataStore.onChange((collection, id, deleted) => {
      events.push({ collection, id, deleted })
    })

    const venue = (await dataStore.venues.getAll())[0]
    await dataStore.venues.put({ ...venue, notes: 'edited' })
    await dataStore.venues.put({ ...venue, notes: 'from remote' }, { silent: true })
    await dataStore.venues.delete(venue.id)

    unsubscribe()

    expect(events).toEqual([
      { collection: 'venues', id: venue.id, deleted: false },
      { collection: 'venues', id: venue.id, deleted: true },
    ])
  })
})
