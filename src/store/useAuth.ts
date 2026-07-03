import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { watchAuthState } from './firebase'

/** undefined = auth state not yet resolved, null = signed out, User = signed in. */
export function useAuthUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => watchAuthState(setUser), [])
  return user
}
