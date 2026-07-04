import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS_VALUES, withSettingsDefaults, type Settings } from '../types'

// A P1-era settings doc: created before cpW/wPrimeJ existed, so those keys are simply
// absent from the stored object even though the current Settings type claims otherwise.
const P1_ERA_DOC = {
  id: 'settings',
  createdAt: '1970-01-01T00:00:00.000Z',
  updatedAt: '2026-07-03T10:00:00.000Z',
  rolloutM: 2.105, // a genuine owner edit — must survive normalization
  systemMassKg: 100,
  tyreCrr: 0.0014,
  mechEfficiency: 0.98,
  comHeightM: 1.1,
  rotatingMassEqKg: 1.65,
  referenceAirDensity: 1.15,
} as Settings

describe('withSettingsDefaults (read-time migration for docs predating newer fields)', () => {
  it('backfills missing cpW/wPrimeJ from defaults so W′bal math never sees undefined', () => {
    const s = withSettingsDefaults(P1_ERA_DOC)
    expect(s.cpW).toBe(DEFAULT_SETTINGS_VALUES.cpW)
    expect(s.wPrimeJ).toBe(DEFAULT_SETTINGS_VALUES.wPrimeJ)
    expect(Number.isFinite(s.cpW)).toBe(true)
    expect(Number.isFinite(s.wPrimeJ)).toBe(true)
  })

  it('never overrides values the doc actually has — owner edits always win', () => {
    const s = withSettingsDefaults(P1_ERA_DOC)
    expect(s.rolloutM).toBe(2.105)
    expect(s.rotatingMassEqKg).toBe(1.65)
    expect(s.id).toBe('settings')
    expect(s.updatedAt).toBe('2026-07-03T10:00:00.000Z')
  })

  it('is a no-op on a fully-populated current doc', () => {
    const full: Settings = {
      id: 'settings',
      createdAt: 'c',
      updatedAt: 'u',
      ...DEFAULT_SETTINGS_VALUES,
      cpW: 385,
      wPrimeJ: 22000,
    }
    expect(withSettingsDefaults(full)).toEqual(full)
  })
})
