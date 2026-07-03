import Dexie, { type Table } from 'dexie'
import {
  DEFAULT_SETTINGS_VALUES,
  SETTINGS_ID,
  type Event,
  type Ride,
  type Scenario,
  type Settings,
  type Venue,
} from './types'

export class AppDatabase extends Dexie {
  settings!: Table<Settings, string>
  venues!: Table<Venue, string>
  rides!: Table<Ride, string>
  scenarios!: Table<Scenario, string>
  events!: Table<Event, string>

  constructor() {
    super('aj-pursuit-lab')
    this.version(1).stores({
      settings: 'id, updatedAt',
      venues: 'id, name, updatedAt',
      rides: 'id, date, venueId, updatedAt',
      scenarios: 'id, baseline, updatedAt',
      events: 'id, date, venueId, updatedAt',
    })
  }
}

export const db = new AppDatabase()

// Seed venues per SPEC.md §3.2. geometrySource 'published' — refined later by
// fitting (§4.8) or manual edit, which is the app's designed path for
// reconciling the lapLengthM = 2*straightLengthM + 2*pi*bendRadiusM residual
// on these UCI-typical placeholder values.
export const SEED_VENUES: Omit<Venue, keyof import('./types').Persisted>[] = [
  {
    name: 'VELO Sports Center (LA)',
    city: 'Carson',
    country: 'USA',
    lapLengthM: 250,
    bendRadiusM: 23.0,
    straightLengthM: 42,
    bankingDeg: 45,
    indoor: true,
    altitudeM: 15,
    surfaceFactor: 1.0,
    geometrySource: 'published',
    notes: 'timber',
  },
  {
    name: 'Peñalolén (Santiago)',
    city: 'Santiago',
    country: 'Chile',
    lapLengthM: 250,
    bendRadiusM: 23.0,
    straightLengthM: 42,
    bankingDeg: 44,
    indoor: true,
    altitudeM: 700,
    surfaceFactor: 1.0,
    geometrySource: 'published',
    notes: '2025 Worlds',
  },
  {
    name: 'Ballerup Super Arena',
    city: 'Ballerup',
    country: 'Denmark',
    lapLengthM: 250,
    bendRadiusM: 23.0,
    straightLengthM: 42,
    bankingDeg: 44,
    indoor: true,
    altitudeM: 25,
    surfaceFactor: 1.0,
    geometrySource: 'published',
    notes: '2024 Worlds',
  },
  {
    name: 'Asunción',
    city: 'Asunción',
    country: 'Paraguay',
    lapLengthM: 250,
    bendRadiusM: 23.0,
    straightLengthM: 42,
    bankingDeg: 44,
    indoor: true,
    altitudeM: 90,
    surfaceFactor: 1.0,
    geometrySource: 'published',
    notes: '',
  },
  {
    name: 'Vélodrome National SQY (Paris)',
    city: 'Saint-Quentin-en-Yvelines',
    country: 'France',
    lapLengthM: 250,
    bendRadiusM: 23.0,
    straightLengthM: 42,
    bankingDeg: 44,
    indoor: true,
    altitudeM: 110,
    surfaceFactor: 1.0,
    geometrySource: 'published',
    notes: '2022 Worlds',
  },
  {
    name: 'Vicente Chancay (San Juan)',
    city: 'San Juan',
    country: 'Argentina',
    lapLengthM: 250,
    bendRadiusM: 23.0,
    straightLengthM: 42,
    bankingDeg: 44,
    indoor: true,
    altitudeM: 650,
    surfaceFactor: 1.0,
    geometrySource: 'published',
    notes: '',
  },
  {
    name: 'Cambridge (NZ)',
    city: 'Cambridge',
    country: 'New Zealand',
    lapLengthM: 250,
    bendRadiusM: 23.0,
    straightLengthM: 42,
    bankingDeg: 43,
    indoor: true,
    altitudeM: 55,
    surfaceFactor: 1.0,
    geometrySource: 'published',
    notes: '',
  },
  {
    name: '7-Eleven Velodrome (COS)',
    city: 'Colorado Springs',
    country: 'USA',
    lapLengthM: 333.33,
    bendRadiusM: 33.5,
    straightLengthM: 60,
    bankingDeg: 33,
    indoor: false,
    altitudeM: 1840,
    surfaceFactor: 1.0,
    geometrySource: 'published',
    notes: 'concrete, outdoor: interpret CdA with caution',
  },
]

export async function ensureSeeded(): Promise<void> {
  const now = new Date().toISOString()

  const existingSettings = await db.settings.get(SETTINGS_ID)
  if (!existingSettings) {
    await db.settings.put({
      id: SETTINGS_ID,
      createdAt: now,
      updatedAt: now,
      ...DEFAULT_SETTINGS_VALUES,
    })
  }

  const venueCount = await db.venues.count()
  if (venueCount === 0) {
    await db.venues.bulkAdd(
      SEED_VENUES.map((v, i) => ({
        ...v,
        id: `seed-venue-${i}`,
        createdAt: now,
        updatedAt: now,
      })),
    )
  }
}
