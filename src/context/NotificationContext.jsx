// src/context/NotificationContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, writeBatch
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './AuthContext'
import { listenForForegroundMessages, registerFcmToken } from '../utils/fcm'

const NotifContext = createContext(null)
const canUseBrowserNotifications = () => typeof window !== 'undefined' && 'Notification' in window
const createdAtMs = (notification) => notification.createdAt?.toMillis?.() || notification.createdAt?.toDate?.()?.getTime?.() || 0

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [notificationError, setNotificationError] = useState('')
  const [browserPermission, setBrowserPermission] = useState(() => canUseBrowserNotifications() ? window.Notification.permission : 'unsupported')
  const [fcmStatus, setFcmStatus] = useState('idle')
  const seenIdsRef = useRef(new Set())
  const initializedRef = useRef(false)
  const unreadCount = notifications.filter(n => !n.read).length

  const showBrowserNotification = (notification) => {
    if (!canUseBrowserNotifications() || window.Notification.permission !== 'granted') return

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
    if (!user || !canUseBrowserNotifications() || window.Notification.permission !== 'granted') return
    registerFcmToken(user).then(result => setFcmStatus(result.ok ? 'registered' : result.reason)).catch(err => {
      console.warn('FCM registration failed:', err)
      setFcmStatus('error')
    })
  }, [user])

  useEffect(() => {
    let unsubscribe = () => {}
    listenForForegroundMessages(payload => {
      showBrowserNotification({
        title: payload.notification?.title || payload.data?.title || 'Paw Paw Pet Grooming',
        message: payload.notification?.body || payload.data?.body || '',
        bookingId: payload.data?.bookingId || '',
      })
    }).then(nextUnsubscribe => { unsubscribe = nextUnsubscribe }).catch(err => console.warn('FCM foreground listener failed:', err))
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setNotifications([])
      setNotificationError('')
      seenIdsRef.current = new Set()
      initializedRef.current = false
      return
    }

    const sources = { uid: [], email: [] }
    const mergeSources = () => {
      const map = new Map()
      Object.values(sources).flat().forEach(notification => map.set(notification.id, notification))
      const rows = Array.from(map.values()).sort((a, b) => createdAtMs(b) - createdAtMs(a))
      setNotifications(rows)
      seenIdsRef.current = new Set(rows.map(n => n.id))
    }

    const listen = (key, field, value) => onSnapshot(
      query(collection(db, 'notifications'), where(field, '==', value)),
      snap => {
        sources[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setNotificationError('')
        mergeSources()
      },
      err => {
        console.warn('Notification listener failed:', err)
        setNotificationError(err?.message || 'Could not load notifications.')
      }
    )

    const unsubs = [listen('uid', 'userId', user.uid)]
    if (user.email) unsubs.push(listen('email', 'userEmail', user.email))

    const bootTimer = window.setTimeout(() => { initializedRef.current = true }, 1200)
    return () => {
      window.clearTimeout(bootTimer)
      unsubs.forEach(unsub => unsub())
      initializedRef.current = false
    }
  }, [user])

  const requestBrowserPermission = async () => {
    if (!canUseBrowserNotifications()) {
      setBrowserPermission('unsupported')
      setFcmStatus('unsupported-browser')
      return 'unsupported'
    }

    const result = await registerFcmToken(user)
    setBrowserPermission(window.Notification.permission)
    setFcmStatus(result.ok ? 'registered' : result.reason)
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

  const sendNotification = async (userId, { userEmail = '', title, message, type = 'info', bookingId = '', actionUrl = '' }) => {
    if (!userId && !userEmail) return false
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: userId || '',
        userEmail: userEmail || '',
        title,
        message,
        type,
        bookingId,
        actionUrl,
        read: false,
        createdAt: serverTimestamp(),
      })
      return true
    } catch (err) {
      console.warn('Notification send failed:', err)
      return false
    }
  }

  return (
    <NotifContext.Provider value={{ notifications, unreadCount, markAllRead, markRead, sendNotification, requestBrowserPermission, browserPermission, notificationError, fcmStatus }}>
      {children}
    </NotifContext.Provider>
  )
}

export const useNotifications = () => useContext(NotifContext)
