import { describe, expect, it } from 'vitest'
import { planMerge, resolveDoc } from '../merge'
import type { Persisted } from '../types'

interface Doc extends Persisted {
  value: string
}

function doc(id: string, updatedAt: string, value = id): Doc {
  return { id, createdAt: updatedAt, updatedAt, value }
}

describe('resolveDoc', () => {
  it('returns remote when local is absent', () => {
    const remote = doc('a', '2026-01-01T00:00:00Z')
    expect(resolveDoc(undefined, remote)).toBe(remote)
  })

  it('returns local when remote is absent', () => {
    const local = doc('a', '2026-01-01T00:00:00Z')
    expect(resolveDoc(local, undefined)).toBe(local)
  })

  it('returns undefined when both are absent', () => {
    expect(resolveDoc(undefined, undefined)).toBeUndefined()
  })

  it('picks the doc with the later updatedAt', () => {
    const local = doc('a', '2026-01-01T00:00:00Z')
    const remote = doc('a', '2026-01-02T00:00:00Z')
    expect(resolveDoc(local, remote)).toBe(remote)
    expect(resolveDoc(remote, local)).toBe(remote)
  })

  it('prefers local on an exact timestamp tie', () => {
    const local = doc('a', '2026-01-01T00:00:00Z', 'local-value')
    const remote = doc('a', '2026-01-01T00:00:00Z', 'remote-value')
    expect(resolveDoc(local, remote)).toBe(local)
  })

  it('is not fooled by millisecond precision differences', () => {
    const local = doc('a', '2026-01-01T00:00:00.500Z')
    const remote = doc('a', '2026-01-01T00:00:00.499Z')
    expect(resolveDoc(local, remote)).toBe(local)
  })
})

describe('planMerge', () => {
  it('pushes local-only docs to remote', () => {
    const local = [doc('a', '2026-01-01T00:00:00Z')]
    const plan = planMerge(local, [])
    expect(plan.toRemote).toEqual(local)
    expect(plan.toLocal).toEqual([])
  })

  it('pulls remote-only docs to local', () => {
    const remote = [doc('a', '2026-01-01T00:00:00Z')]
    const plan = planMerge([], remote)
    expect(plan.toLocal).toEqual(remote)
    expect(plan.toRemote).toEqual([])
  })

  it('resolves conflicting docs by updatedAt, keeping the loser out of the opposite list', () => {
    const local = [doc('a', '2026-01-01T00:00:00Z', 'stale')]
    const remote = [doc('a', '2026-01-05T00:00:00Z', 'fresh')]
    const plan = planMerge(local, remote)
    expect(plan.toLocal).toEqual(remote)
    expect(plan.toRemote).toEqual([])
  })

  it('pushes a locally-edited doc that is newer than remote', () => {
    const local = [doc('a', '2026-01-05T00:00:00Z', 'fresh')]
    const remote = [doc('a', '2026-01-01T00:00:00Z', 'stale')]
    const plan = planMerge(local, remote)
    expect(plan.toRemote).toEqual(local)
    expect(plan.toLocal).toEqual([])
  })

  it('handles a mixed batch of local-only, remote-only, and conflicting docs independently', () => {
    const local = [
      doc('local-only', '2026-01-01T00:00:00Z'),
      doc('conflict', '2026-01-05T00:00:00Z', 'local-wins'),
    ]
    const remote = [
      doc('remote-only', '2026-01-01T00:00:00Z'),
      doc('conflict', '2026-01-01T00:00:00Z', 'remote-loses'),
    ]
    const plan = planMerge(local, remote)

    expect(plan.toRemote.map((d) => d.id).sort()).toEqual(['conflict', 'local-only'])
    expect(plan.toLocal.map((d) => d.id)).toEqual(['remote-only'])
  })

  it('is a no-op when local and remote already match', () => {
    const shared = doc('a', '2026-01-01T00:00:00Z')
    const plan = planMerge([shared], [shared])
    expect(plan.toLocal).toEqual([])
    expect(plan.toRemote).toEqual([])
  })
})
