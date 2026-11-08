import { doc, getDoc, serverTimestamp, setDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore'
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'
import { ADMIN_EMAIL, app, db } from '../firebase'

const vapidKey = (import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim().replace(/^['"]|['"]$/g, '')
const swPath = '/firebase-messaging-sw.js'

function formatFcmError(prefix, err) {
  if (err?.code === 15 || err?.name === 'InvalidAccessError') {
    return 'Invalid VAPID Key (check Firebase Cloud Messaging Key pair in Vercel)'
  }
  const msg = err?.message || err?.code || err?.name || 'error'
  return `${prefix}:${msg}`.slice(0, 90)
}

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
      return { ok: false, reason: formatFcmError('permission', err) }
    }
  }

  if (permission !== 'granted') return { ok: false, reason: permission }

  let registration
  try {
    registration = await navigator.serviceWorker.register(swPath)
    await navigator.serviceWorker.ready
    await registration.update().catch(() => {})
  } catch (err) {
    console.warn('FCM service worker registration failed:', err)
    return { ok: false, reason: formatFcmError('sw', err) }
  }

  let token
  try {
    const messaging = getMessaging(app)
    token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
  } catch (err) {
    console.warn('FCM token fetch initial attempt failed:', err)
    // If a subscription with a different VAPID key already exists (DOMException code 15: InvalidAccessError),
    // unsubscribe the stale subscription and get a fresh token with the current environment's vapidKey.
    try {
      const existingSub = await registration.pushManager?.getSubscription().catch(() => null)
      if (existingSub) {
        await existingSub.unsubscribe().catch(() => {})
      }
      const messaging = getMessaging(app)
      token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
    } catch (retryErr) {
      console.warn('FCM token fetch retry failed:', retryErr)
      return { ok: false, reason: formatFcmError('token', retryErr || err) }
    }
  }

  if (!token) return { ok: false, reason: 'empty-token' }

  const userEmail = (user.email || '').toLowerCase().trim()
  const envAdminEmail = (ADMIN_EMAIL || '').toLowerCase().trim()

  // 1. Primary: Register token via server-side Admin SDK endpoint
  // Bypasses Firestore client-side security rules, cleanly handles multi-user/switching accounts
  try {
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register-token',
        token,
        userId: user.uid,
        userEmail,
        platform: navigator.userAgent || '',
      }),
    })
  } catch (apiErr) {
    console.warn('FCM token server register attempt failed:', apiErr)
  }

  // 2. Secondary: Dual-write via client Firestore SDK
  try {
    const tokenRef = doc(db, 'fcmTokens', token)
    await setDoc(tokenRef, {
      token,
      userId: user.uid,
      userEmail,
      isAdmin: userEmail === envAdminEmail && envAdminEmail !== '',
      active: true,
      platform: navigator.userAgent || '',
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    console.warn('FCM token client Firestore write warning:', err)
  }

  return { ok: true, token }
}

export async function listenForForegroundMessages(onPayload) {
  const supported = await isSupported().catch(() => false)
  if (!supported) return () => {}

  const messaging = getMessaging(app)
  return onMessage(messaging, onPayload)
}
