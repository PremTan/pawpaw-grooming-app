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
const createdAtMs = (notification) =>
  notification.createdAt?.toMillis?.() ||
  notification.createdAt?.toDate?.()?.getTime?.() ||
  (notification.createdAt ? new Date(notification.createdAt).getTime() : 0)

const PAWPAW_ALERTED_KEY = 'pawpaw_alerted_notif_ids'
const PAWPAW_READ_KEY = 'pawpaw_read_notifications'

function getStoredIdSet(key) {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function saveStoredIdSet(key, set, max = 200) {
  if (typeof window === 'undefined') return
  try {
    const arr = Array.from(set).slice(-max)
    localStorage.setItem(key, JSON.stringify(arr))
  } catch (err) {
    console.warn(`Could not save ${key} to localStorage:`, err)
  }
}

export function NotificationProvider({ children }) {
  const { user, isAdmin } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [notificationError, setNotificationError] = useState('')
  const [browserPermission, setBrowserPermission] = useState(() => canUseBrowserNotifications() ? window.Notification.permission : 'unsupported')
  const [fcmStatus, setFcmStatus] = useState('idle')

  const seenIdsRef = useRef(new Set())
  const loadedSourcesRef = useRef(new Set())
  const sessionStartRef = useRef(Date.now())
  const alertedIdsRef = useRef(getStoredIdSet(PAWPAW_ALERTED_KEY))
  const locallyReadRef = useRef(getStoredIdSet(PAWPAW_READ_KEY))
  const recentAlertsRef = useRef(new Map())

  const unreadCount = notifications.filter(n => !n.read).length

  const PUSH_ICON = 'https://res.cloudinary.com/doawldbnh/image/upload/w_192,h_192,c_fit,f_png,q_auto/v1792509878/v5xliyxwuirgzhp6ict6.png'

  const showBrowserNotification = async (notification) => {
    if (!canUseBrowserNotifications() || window.Notification.permission !== 'granted') return

    const now = Date.now()
    const notifCreated = createdAtMs(notification)

    // 1. Guard against historical notifications (> 2 mins old or before current session)
    if (notifCreated > 0 && (now - notifCreated > 120000 || notifCreated < sessionStartRef.current - 5000)) {
      return
    }

    // 2. Global deduplication by signature (prevents double-popups from FCM + Firestore)
    const title = notification.title || 'Paw Paw Pet Grooming'
    const body = notification.message || notification.body || ''
    const bookingId = notification.bookingId || ''
    const sig = `${title}:::${body}:::${bookingId}`

    if (recentAlertsRef.current.has(sig)) {
      const lastTime = recentAlertsRef.current.get(sig)
      if (now - lastTime < 15000) return
    }
    recentAlertsRef.current.set(sig, now)

    // 3. Consistent notification tag
    const tag = notification.tag || (bookingId ? `pawpaw-booking-${bookingId}` : (notification.id ? `pawpaw-notif-${notification.id}` : 'pawpaw-alert'))
    if (recentAlertsRef.current.has(tag)) {
      const lastTime = recentAlertsRef.current.get(tag)
      if (now - lastTime < 15000) return
    }
    recentAlertsRef.current.set(tag, now)

    // Mark as alerted so it is never shown again across restarts
    if (notification.id) {
      alertedIdsRef.current.add(notification.id)
      saveStoredIdSet(PAWPAW_ALERTED_KEY, alertedIdsRef.current)
    }

    const targetUrl = notification.actionUrl || notification.link || '/'
    const actionTitle = notification.actionTitle || (
      isAdmin
        ? (targetUrl.includes('boarding') ? '🐾 View Boarding' : '📅 View Booking')
        : (targetUrl.includes('/book')
            ? '📅 Book Appointment'
            : (targetUrl.includes('boarding') ? '🐾 View Stay' : '📅 View Appointment'))
    )
    const options = {
      body,
      icon: PUSH_ICON,
      badge: PUSH_ICON,
      tag,
      renotify: false,
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
      const data = payload.data || {}
      const notif = payload.notification || {}
      showBrowserNotification({
        id: data.id || data.notifId || '',
        title: data.title || notif.title || 'Paw Paw Pet Grooming',
        message: data.body || notif.body || '',
        bookingId: data.bookingId || '',
        tag: data.tag || (data.bookingId ? `pawpaw-booking-${data.bookingId}` : 'pawpaw-alert'),
        actionUrl: data.actionUrl || data.link || '/',
      })
    }).then(nextUnsubscribe => { unsubscribe = nextUnsubscribe }).catch(err => console.warn('FCM foreground listener failed:', err))
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setNotifications([])
      setNotificationError('')
      seenIdsRef.current = new Set()
      loadedSourcesRef.current = new Set()
      return
    }

    const expectedSources = ['uid']
    if (user.email) expectedSources.push('email')
    if (isAdmin) expectedSources.push('admin')

    const sources = { uid: [], email: [], admin: [] }
    const mergeSources = () => {
      const map = new Map()
      Object.values(sources).flat().forEach(notification => map.set(notification.id, notification))

      const currentLocallyRead = locallyReadRef.current
      const rows = Array.from(map.values())
        .map(n => (currentLocallyRead.has(n.id) ? { ...n, read: true } : n))
        .sort((a, b) => createdAtMs(b) - createdAtMs(a))
      
      const allLoaded = expectedSources.every(k => loadedSourcesRef.current.has(k))

      // Only notify active browser if ALL initial snapshot queries have loaded
      // AND the notification was created LIVE during the current session (never historical on launch)
      if (allLoaded && seenIdsRef.current.size > 0) {
        rows.forEach(n => {
          const created = createdAtMs(n)
          const isHistorical = created > 0 && created < sessionStartRef.current - 5000
          const alreadyAlerted = alertedIdsRef.current.has(n.id)

          if (!isHistorical && !alreadyAlerted && !seenIdsRef.current.has(n.id) && !n.read) {
            alertedIdsRef.current.add(n.id)
            saveStoredIdSet(PAWPAW_ALERTED_KEY, alertedIdsRef.current)
            if (fcmStatus !== 'registered') {
              showBrowserNotification(n)
            }
          }
        })
      }

      setNotifications(rows)
      seenIdsRef.current = new Set(rows.map(n => n.id))
    }

    const listen = (key, field, value) => onSnapshot(
      query(collection(db, 'notifications'), where(field, '==', value)),
      snap => {
        sources[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        loadedSourcesRef.current.add(key)
        setNotificationError('')
        mergeSources()
      },
      err => {
        console.warn('Notification listener failed:', err)
        loadedSourcesRef.current.add(key)
        setNotificationError(err?.message || 'Could not load notifications.')
      }
    )

    const unsubs = [listen('uid', 'userId', user.uid)]
    if (user.email) {
      unsubs.push(listen('email', 'userEmail', user.email.toLowerCase().trim()))
    }
    if (isAdmin) {
      unsubs.push(listen('admin', 'toAdmin', true))
    }

    return () => {
      unsubs.forEach(unsub => unsub())
      loadedSourcesRef.current = new Set()
    }
  }, [user, isAdmin])

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
    if (!user) return { success: false, count: 0 }
    const unread = notifications.filter(n => !n.read)
    if (!unread.length) return { success: true, count: 0 }

    // 1. Immediately cache in persistent localStorage
    unread.forEach(n => locallyReadRef.current.add(n.id))
    saveStoredIdSet(PAWPAW_READ_KEY, locallyReadRef.current)

    // 2. Optimistically update local React state
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))

    // 3. Batch update Firestore documents
    try {
      const batch = writeBatch(db)
      unread.slice(0, 450).forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { read: true })
      })
      await batch.commit()
      return { success: true, count: unread.length }
    } catch (batchErr) {
      console.warn('Batch mark-all-read failed, falling back to individual updates:', batchErr)
      const updatePromises = unread.map(n =>
        updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(err => {
          console.warn(`Could not mark notification ${n.id} read:`, err)
        })
      )
      await Promise.allSettled(updatePromises)
      return { success: true, count: unread.length }
    }
  }

  const markRead = async (id) => {
    if (!id) return
    locallyReadRef.current.add(id)
    saveStoredIdSet(PAWPAW_READ_KEY, locallyReadRef.current)

    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true })
    } catch (err) {
      console.warn(`Failed to mark notification ${id} read:`, err)
    }
  }

  const sendNotification = async (userId, { userEmail = '', title, message, type = 'info', bookingId = '', actionUrl = '', toAdmin = false }) => {
    if (!userId && !userEmail && !toAdmin) return false
    const cleanEmail = (userEmail || '').trim().toLowerCase()
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: userId || '',
        userEmail: cleanEmail,
        toAdmin: Boolean(toAdmin),
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
          userEmail: cleanEmail,
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


