import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'
import { ADMIN_EMAIL, app, db } from '../firebase'

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || ''
const swPath = '/firebase-messaging-sw.js'
const shortError = (prefix, err) => `${prefix}:${err?.code || err?.name || err?.message || 'error'}`.slice(0, 90)

export async function registerFcmToken(user) {
  if (!user?.uid || !vapidKey) return { ok: false, reason: !vapidKey ? 'missing-vapid-key' : 'missing-user' }
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return { ok: false, reason: 'unsupported-browser' }

  const supported = await isSupported().catch(() => false)
  if (!supported) return { ok: false, reason: 'unsupported-fcm' }

  let permission = Notification.permission
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission()
    } catch (err) {
      console.warn('Notification permission request failed:', err)
      return { ok: false, reason: shortError('permission', err) }
    }
  }

  if (permission !== 'granted') return { ok: false, reason: permission }

  let registration
  try {
    registration = await navigator.serviceWorker.register(swPath)
    await navigator.serviceWorker.ready
  } catch (err) {
    console.warn('FCM service worker registration failed:', err)
    return { ok: false, reason: shortError('sw', err) }
  }

  let token
  try {
    const messaging = getMessaging(app)
    token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
  } catch (err) {
    console.warn('FCM token fetch failed:', err)
    return { ok: false, reason: shortError('token', err) }
  }

  if (!token) return { ok: false, reason: 'empty-token' }

  try {
    await setDoc(doc(db, 'fcmTokens', token), {
      token,
      userId: user.uid,
      userEmail: user.email || '',
      isAdmin: user.email === ADMIN_EMAIL,
      active: true,
      platform: navigator.userAgent || '',
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    console.warn('FCM token Firestore save failed:', err)
    return { ok: false, reason: shortError('firestore', err) }
  }

  return { ok: true, token }
}

export async function listenForForegroundMessages(onPayload) {
  const supported = await isSupported().catch(() => false)
  if (!supported) return () => {}

  const messaging = getMessaging(app)
  return onMessage(messaging, onPayload)
}
