import { useState } from 'react'
import { signInWithGoogle, signOutOfFirebase } from '../../store/firebase'
import { useAuthUser } from '../../store/useAuth'
import { T } from '../../components/EditableText'

export default function AuthPanel() {
  const user = useAuthUser()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSignIn() {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleSignOut() {
    setBusy(true)
    try {
      await signOutOfFirebase()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 p-4">
      <T as="h2" className="mb-3 text-sm font-semibold text-slate-900" id="settings.authpanel.cloud-sync" d="Cloud sync" />
      {user === undefined && <p className="text-sm text-slate-500">Checking sign-in state…</p>}
      {user === null && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Signed out. Data stays local-only until you sign in.
          </p>
          <button
            type="button"
            onClick={handleSignIn}
            disabled={busy}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Sign in with Google
          </button>
        </div>
      )}
      {user && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-medium text-slate-900">{user.email}</span>
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Sign out
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  )
}
