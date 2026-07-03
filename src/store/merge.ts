import type { Persisted } from './types'

/**
 * Last-write-wins conflict resolution on a per-document `updatedAt` timestamp,
 * per SPEC §2. Pure function — no Dexie/Firestore imports — so it's directly
 * unit-testable without a real sync backend.
 */
export function resolveDoc<T extends Persisted>(
  local: T | undefined,
  remote: T | undefined,
): T | undefined {
  if (!local) return remote
  if (!remote) return local
  const localMs = Date.parse(local.updatedAt)
  const remoteMs = Date.parse(remote.updatedAt)
  return remoteMs > localMs ? remote : local
}

export interface MergePlan<T extends Persisted> {
  /** Docs to write into the local store (remote won, or local-only doc absent remotely is untouched). */
  toLocal: T[]
  /** Docs to push to the remote store (local won over an older/absent remote doc). */
  toRemote: T[]
}

/**
 * Reconciles a full local collection against a full remote collection.
 * Docs present on only one side are treated as new on that side (untouched sync default).
 */
export function planMerge<T extends Persisted>(localDocs: T[], remoteDocs: T[]): MergePlan<T> {
  const localById = new Map(localDocs.map((d) => [d.id, d]))
  const remoteById = new Map(remoteDocs.map((d) => [d.id, d]))
  const allIds = new Set([...localById.keys(), ...remoteById.keys()])

  const toLocal: T[] = []
  const toRemote: T[] = []

  for (const id of allIds) {
    const local = localById.get(id)
    const remote = remoteById.get(id)

    if (local && !remote) {
      toRemote.push(local)
      continue
    }
    if (remote && !local) {
      toLocal.push(remote)
      continue
    }
    if (local && remote) {
      const localMs = Date.parse(local.updatedAt)
      const remoteMs = Date.parse(remote.updatedAt)
      // Equal timestamps mean both sides already agree (updatedAt is bumped on
      // every real write) — nothing to push either direction.
      if (remoteMs > localMs) toLocal.push(remote)
      else if (localMs > remoteMs) toRemote.push(local)
    }
  }

  return { toLocal, toRemote }
}
