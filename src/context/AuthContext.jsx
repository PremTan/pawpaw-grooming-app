// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db, ADMIN_EMAIL } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!user?.uid) {
      setProfile(null)
      return
    }

    const unsub = onSnapshot(
      doc(db, 'profiles', user.uid),
      snap => setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      () => setProfile(null)
    )
    return unsub
  }, [user])

  const logout = () => signOut(auth)
  const isAdmin = user?.email === ADMIN_EMAIL
  const isBlocked = !isAdmin && profile?.blocked === true

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, isAdmin, isBlocked }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}