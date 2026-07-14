// Cadence-derived speed fallback (owner request 2026-07 round 5): broken-channel
// detection and reconstruction, plus the real broken file's signature synthesized from it.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFitRecords } from '../ingest/fit'
import { assessSpeedChannel, developmentM, reconstructSpeedFromCadence } from '../ingest/speedFallback'
import { buildTimeline } from '../ingest/timeline'
import type { FitRecord } from '../ingest/types'

const fixturesDir = fileURLToPath(new URL('../../../data/fixtures/', import.meta.url))

/** Healthy fixed-gear records: v locked to cadence (dev 8.957 m), small sensor noise. */
function healthyRecords(n = 120): FitRecord[] {
  const dev = developmentM(2.09, 60, 14)
  const out: FitRecord[] = []
  let d = 0
  for (let t = 0; t < n; t++) {
    const cad = 105 + Math.sin(t / 7) * 3
    const v = (cad / 60) * dev * (1 + 0.01 * Math.sin(t / 3))
    d += v
    out.push({ t, powerW: 450, speedMs: v, distanceM: d, cadenceRpm: cad })
  }
  return out
}

/** Same ride but with an aliased speed channel: v jumps randomly 0.4–1.0× truth. */
function brokenRecords(n = 120): FitRecord[] {
  return healthyRecords(n).map((r, i) => {
    const wobble = 0.4 + 0.6 * Math.abs(Math.sin(i * 2.399)) // deterministic pseudo-noise
    return { ...r, speedMs: r.speedMs * wobble, distanceM: r.distanceM * 0.65 }
  })
}

describe('assessSpeedChannel', () => {
  it('passes a healthy fixed-gear file (ratio locked to the gear)', () => {
    const a = assessSpeedChannel(healthyRecords())
    expect(a.broken).toBe(false)
    expect(a.ratioSpread).toBeLessThan(0.05)
  })

  it('flags an aliased speed channel', () => {
    const a = assessSpeedChannel(brokenRecords())
    expect(a.broken).toBe(true)
    expect(a.ratioSpread).toBeGreaterThan(0.1)
  })

  it('passes both real fixture files (their speed channels are good)', () => {
    for (const f of ['SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 'SRM_PM9_ANDERS_TP_2025-10-24_18-53-43.fit']) {
      const a = assessSpeedChannel(parseFitRecords(fs.readFileSync(`${fixturesDir}${f}`)))
      expect(a.broken).toBe(false)
    }
  })

  it('never flags a file without cadence', () => {
    const noCad = healthyRecords().map((r) => ({ ...r, cadenceRpm: undefined }))
    expect(assessSpeedChannel(noCad).broken).toBe(false)
  })
})

describe('reconstructSpeedFromCadence', () => {
  it('recovers the true speed and distance of a broken file (fixed gear locks cadence to wheel)', () => {
    const truth = healthyRecords()
    const dev = developmentM(2.09, 60, 14)
    const recon = reconstructSpeedFromCadence(brokenRecords(), dev)
    for (let i = 0; i < truth.length; i++) {
      // Within ~1.5% — the healthy generator adds ±1% sensor noise the reconstruction
      // deliberately doesn't reproduce (cadence is the truth channel).
      expect(Math.abs(recon[i].speedMs - truth[i].speedMs) / truth[i].speedMs).toBeLessThan(0.015)
    }
    const dTruth = truth.at(-1)!.distanceM - truth[0].distanceM
    const dRecon = recon.at(-1)!.distanceM - recon[0].distanceM
    expect(Math.abs(dRecon - dTruth) / dTruth).toBeLessThan(0.015)
  })

  it('does not integrate distance across >5 s segment gaps', () => {
    const dev = developmentM(2.09, 60, 14)
    const recs = healthyRecords(20)
    const shifted = healthyRecords(20).map((r) => ({ ...r, t: r.t + 900 }))
    const recon = reconstructSpeedFromCadence([...recs, ...shifted], dev)
    const atGapEnd = recon[20].distanceM - recon[19].distanceM
    expect(atGapEnd).toBe(0)
  })

  it('leaves power, cadence, and timestamps untouched', () => {
    const recs = brokenRecords(30)
    const recon = reconstructSpeedFromCadence(recs, 8.957)
    for (let i = 0; i < recs.length; i++) {
      expect(recon[i].t).toBe(recs[i].t)
      expect(recon[i].powerW).toBe(recs[i].powerW)
      expect(recon[i].cadenceRpm).toBe(recs[i].cadenceRpm)
    }
  })
})

describe('timeline recording-interval-aware dropout', () => {
  it('a uniform 5 s-interval file has zero dropout (expected coverage, not gaps)', () => {
    const recs = healthyRecords(60).filter((r) => r.t % 5 === 0)
    const tl = buildTimeline(recs)
    expect(tl.recordIntervalS).toBe(5)
    expect(tl.dropoutSeconds).toBe(0)
  })

  it('a missing record in a 5 s file still counts as dropout', () => {
    const recs = healthyRecords(60)
      .filter((r) => r.t % 5 === 0)
      .filter((r) => r.t !== 30)
    const tl = buildTimeline(recs)
    expect(tl.dropoutSeconds).toBeGreaterThan(0)
  })

  it('1 Hz files behave exactly as before: a skipped second is a dropout', () => {
    const recs = healthyRecords(30).filter((r) => r.t !== 15)
    const tl = buildTimeline(recs)
    expect(tl.recordIntervalS).toBe(1)
    expect(tl.dropoutSeconds).toBe(1)
  })
})
