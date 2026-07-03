import {
  type Unsubscribe,
  collection as fsCollection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore'
import { type CollectionName, dataStore } from './DataStore'
import { firestore, watchAuthState } from './firebase'
import { planMerge, resolveDoc } from './merge'
import type { Persisted } from './types'

const COLLECTIONS: CollectionName[] = ['settings', 'venues', 'rides', 'scenarios', 'events']

let activeUid: string | null = null
let unsubscribers: Unsubscribe[] = []
let changeUnsub: (() => void) | null = null

function userDocsRef(uid: string, collectionName: CollectionName) {
  return fsCollection(firestore, 'users', uid, collectionName)
}

async function initialReconcile(uid: string, name: CollectionName): Promise<void> {
  const localDocs = await dataStore[name].getAll()
  const snap = await getDocs(userDocsRef(uid, name))
  const remoteDocs = snap.docs.map((d) => d.data() as Persisted)

  const { toLocal, toRemote } = planMerge(localDocs, remoteDocs)

  await Promise.all(toLocal.map((d) => dataStore[name].put(d as never, { silent: true })))
  await Promise.all(toRemote.map((d) => setDoc(doc(userDocsRef(uid, name), d.id), d)))
}

function watchRemote(uid: string, name: CollectionName): Unsubscribe {
  return onSnapshot(userDocsRef(uid, name), (snap) => {
    for (const change of snap.docChanges()) {
      if (change.type === 'removed') continue
      const remote = change.doc.data() as Persisted
      dataStore[name]
        .get(remote.id)
        .then((local) => {
          const winner = resolveDoc(local, remote)
          if (winner === remote && winner !== local) {
            return dataStore[name].put(remote as never, { silent: true })
          }
        })
        .catch(() => {
          // best-effort background sync; local state stays authoritative on error
        })
    }
  })
}

function watchLocalChanges(uid: string): () => void {
  return dataStore.onChange((collectionName, id, deleted) => {
    if (deleted) return // v1: no remote tombstoning yet, matches "out of scope" sync scope
    dataStore[collectionName].get(id).then((item) => {
      if (!item) return
      setDoc(doc(userDocsRef(uid, collectionName), id), item).catch(() => {
        // local write already succeeded; push retries on next snapshot/reconcile
      })
    })
  })
}

async function startSyncFor(uid: string): Promise<void> {
  activeUid = uid
  await Promise.all(COLLECTIONS.map((name) => initialReconcile(uid, name)))
  if (activeUid !== uid) return // signed out while reconciling
  unsubscribers = COLLECTIONS.map((name) => watchRemote(uid, name))
  changeUnsub = watchLocalChanges(uid)
}

function stopSync(): void {
  activeUid = null
  for (const unsub of unsubscribers) unsub()
  unsubscribers = []
  changeUnsub?.()
  changeUnsub = null
}

/** Wires DataStore (local) <-> Firestore (remote). Call once at app startup. */
export function initSync(): () => void {
  return watchAuthState((user) => {
    stopSync()
    if (user) startSyncFor(user.uid)
  })
}
