// src/firebase.js
// ─────────────────────────────────────────────────────────────
// 1. Copy .env.example → .env
// 2. Fill in your Firebase project values
// 3. NEVER commit .env to GitHub
// ─────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
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
export const db   = getFirestore(app)
export const storage = getStorage(app)
export const googleProvider = new GoogleAuthProvider()

import { onAuthStateChanged } from 'firebase/auth'

onAuthStateChanged(auth, (user) => {
  console.log('USER:', user)
  console.log('EMAIL:', user?.email)
  console.log("PROJECT ID:", import.meta.env.VITE_FIREBASE_PROJECT_ID)
})

// Admin email — must match VITE_ADMIN_EMAIL in .env
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || ''

