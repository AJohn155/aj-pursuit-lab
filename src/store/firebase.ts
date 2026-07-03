import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Client-side Firebase config is not a secret — access control is enforced by
// Firestore security rules (see firestore.rules), not by keeping this hidden.
const firebaseConfig = {
  apiKey: 'AIzaSyAcc-4RW8wtBmF6Q-CIbjYMhYeSP5jFryM',
  authDomain: 'aj-pursuit-lab.firebaseapp.com',
  projectId: 'aj-pursuit-lab',
  storageBucket: 'aj-pursuit-lab.firebasestorage.app',
  messagingSenderId: '516368601826',
  appId: '1:516368601826:web:83b7d9034839357d4944bb',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const firestore = getFirestore(firebaseApp)

const googleProvider = new GoogleAuthProvider()

export function signInWithGoogle(): Promise<void> {
  return signInWithPopup(auth, googleProvider).then(() => undefined)
}

export function signOutOfFirebase(): Promise<void> {
  return signOut(auth)
}

export function watchAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback)
}
