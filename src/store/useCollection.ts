import { useEffect, useState } from 'react'
import type { Collection } from './DataStore'
import type { Persisted } from './types'

/** Subscribes to a live local query. Reads always come from IndexedDB per SPEC §2. */
export function useCollection<T extends Persisted>(collection: Collection<T>): T[] {
  const [items, setItems] = useState<T[]>([])
  useEffect(() => {
    const sub = collection.observe().subscribe(setItems)
    return () => sub.unsubscribe()
  }, [collection])
  return items
}
