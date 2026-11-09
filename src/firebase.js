// src/firebase.js
// Vite loads .env.development for npm run dev and .env.production for npm run build.
// Copy .env.example when setting up a new environment, but never commit real env files.

import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  enableNetwork,
} from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

// Robust multi-tab persistent cache so data loads instantly from phone storage
let firestoreDb
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  })
} catch {
  firestoreDb = getFirestore(app)
}

export const db   = firestoreDb
export const storage = getStorage(app)
export const googleProvider = new GoogleAuthProvider()

// Auto-reconnect when user returns to app/tab from background or after phone unlock
if (typeof window !== 'undefined') {
  let isReviving = false

  const handleWakeUp = async () => {
    if (isReviving) return
    isReviving = true
    try {
      await enableNetwork(db).catch(() => {})
      if (auth.currentUser) {
        auth.currentUser.getIdToken(false).catch(() => {})
      }
    } catch {
      // safe no-op
    } finally {
      setTimeout(() => { isReviving = false }, 1500)
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      handleWakeUp()
    }
  })

  window.addEventListener('online', handleWakeUp)
}

if (typeof window !== 'undefined') {
  window.__PAWPAW_FIREBASE_DEBUG__ = {
    projectId: firebaseConfig.projectId,
    appId: firebaseConfig.appId,
    authDomain: firebaseConfig.authDomain,
    apiKey: firebaseConfig.apiKey,
    storageBucket: firebaseConfig.storageBucket,
  }
}

import { onAuthStateChanged } from 'firebase/auth'

onAuthStateChanged(auth, (user) => {
  console.log('USER:', user)
  console.log('EMAIL:', user?.email)
  console.log('PROJECT ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID)
})

// Admin email - must match VITE_ADMIN_EMAIL in the active env file.
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || ''
