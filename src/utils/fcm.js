import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'
import { ADMIN_EMAIL, app, db } from '../firebase'

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || ''
const swPath = '/firebase-messaging-sw.js'

export async function registerFcmToken(user) {
  if (!user?.uid || !vapidKey) return { ok: false, reason: !vapidKey ? 'missing-vapid-key' : 'missing-user' }
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return { ok: false, reason: 'unsupported-browser' }

  const supported = await isSupported().catch(() => false)
  if (!supported) return { ok: false, reason: 'unsupported-fcm' }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()

  if (permission !== 'granted') return { ok: false, reason: permission }

  const registration = await navigator.serviceWorker.register(swPath)
  const messaging = getMessaging(app)
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })

  if (!token) return { ok: false, reason: 'empty-token' }

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

  return { ok: true, token }
}

export async function listenForForegroundMessages(onPayload) {
  const supported = await isSupported().catch(() => false)
  if (!supported) return () => {}

  const messaging = getMessaging(app)
  return onMessage(messaging, onPayload)
}
