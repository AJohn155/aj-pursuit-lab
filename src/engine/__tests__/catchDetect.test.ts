// Catch-signature detection (owner request 2026-07 round 10): the Pan Am dip-then-surge
// shape must fire with the right lap; clean rides (both real fixtures) must stay silent.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectCatchSignature } from '../ingest/catchDetect'
import { analyzeRideFull } from '../ingest/report'
import { effectiveCrr, makeTrack } from '../index'
import type { RiderParams } from '../types'
import type { RollingCdaPoint } from '../cda'

const fixturesDir = fileURLToPath(new URL('../../../data/fixtures/', import.meta.url))
const track = makeTrack(250, 23)
const params: RiderParams = {
  massKg: 100,
  rotatingMassEqKg: 1.0,
  crrEff: effectiveCrr(0.0014, 1.0),
  mechEfficiency: 0.98,
  comHeightM: 1.1,
}

/** The owner's real Pan Am quali rolling series (catch at lap 7.5), captured from the
 * probe run 2026-07-14 — centers every ¼ lap from 508 m. */
const PAN_AM_ROLLING: RollingCdaPoint[] = [
  0.1806, 0.1771, 0.1753, 0.1743, 0.1739, 0.1737, 0.1738, 0.1736, 0.1733, 0.1729, 0.1729, 0.1733,
  0.1734, 0.1731, 0.1729, 0.1729, 0.1733, 0.1732, 0.1734, 0.1732, 0.1729, 0.1721, 0.1715, 0.1712,
  0.1711, 0.1707, 0.1704, 0.1706, 0.1718, 0.1736, 0.1751, 0.176, 0.1765, 0.1769, 0.1775, 0.1781,
  0.1787, 0.1793, 0.1801, 0.1812, 0.1825, 0.1836, 0.1848, 0.185, 0.1844, 0.183, 0.1828, 0.1831,
  0.1835, 0.183, 0.1826, 0.1825,
].map((cdaM2, i) => ({ centerDistM: 508 + i * 62.5, cdaM2 }))

describe('detectCatchSignature', () => {
  it('fires on the real Pan Am quali shape with the right lap', () => {
    const sig = detectCatchSignature(PAN_AM_ROLLING, 250)
    expect(sig).not.toBeNull()
    expect(sig!.suggestedLap).toBeGreaterThanOrEqual(7)
    expect(sig!.suggestedLap).toBeLessThanOrEqual(8.5)
    expect(sig!.dipCdaM2).toBeLessThan(sig!.baselineCdaM2)
    expect(sig!.surgeCdaM2).toBeGreaterThan(sig!.baselineCdaM2)
  })

  it('stays silent on both clean fixture rides', () => {
    const rides = [
      { file: 'SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', officialTimeS: 246.793, rho: 1.122 },
      { file: 'SRM_PM9_ANDERS_TP_2025-10-24_18-53-43.fit', officialTimeS: 248.699, rho: 1.116 },
    ]
    for (const r of rides) {
      const full = analyzeRideFull(new Uint8Array(fs.readFileSync(`${fixturesDir}${r.file}`)), {
        officialTimeS: r.officialTimeS,
        rho: r.rho,
        params,
        track,
        cpW: { cp: 400, wPrimeJ: 25000 },
        densityKnown: true,
      })
      expect(detectCatchSignature(full.rolling, 250)).toBeNull()
    }
  })

  it('stays silent on flat and monotone-drift series', () => {
    const flat = Array.from({ length: 40 }, (_, i) => ({ centerDistM: 500 + i * 62.5, cdaM2: 0.17 }))
    expect(detectCatchSignature(flat, 250)).toBeNull()
    const drift = Array.from({ length: 40 }, (_, i) => ({ centerDistM: 500 + i * 62.5, cdaM2: 0.165 + i * 0.0004 }))
    expect(detectCatchSignature(drift, 250)).toBeNull()
  })
})
