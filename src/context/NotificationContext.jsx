// src/context/NotificationContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, writeBatch
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './AuthContext'

const NotifContext = createContext(null)
const canUseBrowserNotifications = () => typeof window !== 'undefined' && 'Notification' in window

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [browserPermission, setBrowserPermission] = useState(() => canUseBrowserNotifications() ? window.Notification.permission : 'unsupported')
  const seenIdsRef = useRef(new Set())
  const initializedRef = useRef(false)
  const unreadCount = notifications.filter(n => !n.read).length

  const showBrowserNotification = (notification) => {
    if (!canUseBrowserNotifications() || window.Notification.permission !== 'granted') return
    if (document.visibilityState === 'visible') return

    const toast = new window.Notification(notification.title || 'New notification', {
      body: notification.message || '',
      tag: notification.bookingId || notification.id,
    })
    toast.onclick = () => {
      window.focus()
      toast.close()
    }
  }

  useEffect(() => {
    if (!user) {
      setNotifications([])
      seenIdsRef.current = new Set()
      initializedRef.current = false
      return
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    )
    const unsub = onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setNotifications(rows)

      if (initializedRef.current) {
        rows
          .filter(n => !n.read && !seenIdsRef.current.has(n.id))
          .forEach(showBrowserNotification)
      }
      seenIdsRef.current = new Set(rows.map(n => n.id))
      initializedRef.current = true
    }, () => {})
    return unsub
  }, [user])

  const requestBrowserPermission = async () => {
    if (!canUseBrowserNotifications()) {
      setBrowserPermission('unsupported')
      return 'unsupported'
    }
    if (window.Notification.permission === 'default') {
      const permission = await window.Notification.requestPermission()
      setBrowserPermission(permission)
      return permission
    }
    setBrowserPermission(window.Notification.permission)
    return window.Notification.permission
  }

  const markAllRead = async () => {
    if (!user) return
    const unread = notifications.filter(n => !n.read)
    if (!unread.length) return
    const batch = writeBatch(db)
    unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }))
    await batch.commit()
  }

  const markRead = async (id) => {
    if (!id) return
    await updateDoc(doc(db, 'notifications', id), { read: true })
  }

  const sendNotification = async (userId, { title, message, type = 'info', bookingId = '', actionUrl = '' }) => {
    if (!userId) return
    try {
      await addDoc(collection(db, 'notifications'), {
        userId, title, message, type, bookingId, actionUrl,
        read: false, createdAt: serverTimestamp(),
      })
    } catch {}
  }

  return (
    <NotifContext.Provider value={{ notifications, unreadCount, markAllRead, markRead, sendNotification, requestBrowserPermission, browserPermission }}>
      {children}
    </NotifContext.Provider>
  )
}

export const useNotifications = () => useContext(NotifContext)
