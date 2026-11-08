// src/context/NotificationContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, doc, serverTimestamp, writeBatch
} from 'firebase/firestore'
import { ADMIN_EMAIL, db } from '../firebase'
import { useAuth } from './AuthContext'
import { listenForForegroundMessages, registerFcmToken } from '../utils/fcm'

const NotifContext = createContext(null)
const canUseBrowserNotifications = () => typeof window !== 'undefined' && 'Notification' in window
const createdAtMs = (notification) => notification.createdAt?.toMillis?.() || notification.createdAt?.toDate?.()?.getTime?.() || 0

export function NotificationProvider({ children }) {
  const { user, isAdmin } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [notificationError, setNotificationError] = useState('')
  const [browserPermission, setBrowserPermission] = useState(() => canUseBrowserNotifications() ? window.Notification.permission : 'unsupported')
  const [fcmStatus, setFcmStatus] = useState('idle')
  const seenIdsRef = useRef(new Set())
  const initializedRef = useRef(false)
  const unreadCount = notifications.filter(n => !n.read).length

  const PUSH_ICON = 'https://res.cloudinary.com/doawldbnh/image/upload/w_192,h_192,c_fit,f_png,q_auto/v1792509878/v5xliyxwuirgzhp6ict6.png'
  const recentAlertsRef = useRef(new Map())

  const showBrowserNotification = async (notification) => {
    if (!canUseBrowserNotifications() || window.Notification.permission !== 'granted') return

    const tag = notification.tag || notification.bookingId || notification.id || 'pawpaw-alert'
    const now = Date.now()
    if (recentAlertsRef.current.has(tag)) {
      const lastTime = recentAlertsRef.current.get(tag)
      if (now - lastTime < 10000) return
    }
    recentAlertsRef.current.set(tag, now)

    const title = notification.title || 'Paw Paw Pet Grooming'
    const targetUrl = notification.actionUrl || notification.link || '/'
    const actionTitle = isAdmin
      ? (targetUrl.includes('boarding') ? '🐾 View Boarding' : '📅 View Booking')
      : (targetUrl.includes('boarding') ? '🐾 View Stay' : '📅 View Appointment')
    const options = {
      body: notification.message || notification.body || '',
      icon: PUSH_ICON,
      tag,
      vibrate: [200, 100, 200],
      requireInteraction: true,
      data: {
        url: targetUrl,
      },
      actions: [
        { action: 'open_url', title: actionTitle },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    }

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, options)
          return
        }
      }
      const toast = new window.Notification(title, options)
      toast.onclick = () => {
        window.focus()
        toast.close()
      }
    } catch (err) {
      console.warn('Could not display system notification:', err)
    }
  }

  useEffect(() => {
    // Register FCM device push token for logged-in user (both Admin and regular customers)
    if (!user || !canUseBrowserNotifications()) return
    registerFcmToken(user).then(result => setFcmStatus(result.ok ? 'registered' : result.reason)).catch(err => {
      console.warn('FCM registration failed:', err)
      setFcmStatus(err?.code || err?.message || 'error')
    })
  }, [user])

  useEffect(() => {
    let unsubscribe = () => {}
    listenForForegroundMessages(payload => {
      showBrowserNotification({
        title: payload.data?.title || payload.notification?.title || 'Paw Paw Pet Grooming',
        message: payload.data?.body || payload.notification?.body || '',
        bookingId: payload.data?.bookingId || '',
        tag: payload.data?.tag || 'pawpaw-alert',
        actionUrl: payload.data?.actionUrl || payload.data?.link || '/',
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

    // Optimistically update local state immediately
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))

    // Update each document individually so a single stale/permission-blocked document doesn't fail the rest
    const updatePromises = unread.map(n =>
      updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(err => {
        console.warn(`Could not mark notification ${n.id} read:`, err)
      })
    )
    await Promise.allSettled(updatePromises)
  }

  const markRead = async (id) => {
    if (!id) return
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true })
    } catch (err) {
      console.warn(`Failed to mark notification ${id} read:`, err)
    }
  }

  const sendNotification = async (userId, { userEmail = '', title, message, type = 'info', bookingId = '', actionUrl = '', toAdmin = false }) => {
    if (!userId && !userEmail && !toAdmin) return false
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

      // Dispatch push notification to recipient's device (Admin or customer)
      fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId || '',
          userEmail: userEmail || '',
          toAdmin: Boolean(toAdmin),
          title,
          body: message,
          message,
          bookingId,
          actionUrl,
        }),
      }).catch(pushErr => console.warn('Push API dispatch error:', pushErr))

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

