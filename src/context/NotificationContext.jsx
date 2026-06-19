// src/context/NotificationContext.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, writeBatch, getDocs
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './AuthContext'

const NotifContext = createContext(null)

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const unreadCount = notifications.filter(n => !n.read).length

  useEffect(() => {
    if (!user) { setNotifications([]); return }
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    )
    const unsub = onSnapshot(q, snap => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => {})
    return unsub
  }, [user])

  const markAllRead = async () => {
    if (!user) return
    const unread = notifications.filter(n => !n.read)
    if (!unread.length) return
    const batch = writeBatch(db)
    unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }))
    await batch.commit()
  }

  const markRead = async (id) => {
    await updateDoc(doc(db, 'notifications', id), { read: true })
  }

  // Helper to send a notification to a user
  const sendNotification = async (userId, { title, message, type = 'info', bookingId = '' }) => {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId, title, message, type, bookingId,
        read: false, createdAt: serverTimestamp(),
      })
    } catch {}
  }

  return (
    <NotifContext.Provider value={{ notifications, unreadCount, markAllRead, markRead, sendNotification }}>
      {children}
    </NotifContext.Provider>
  )
}

export const useNotifications = () => useContext(NotifContext)
