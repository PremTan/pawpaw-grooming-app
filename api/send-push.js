import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import fs from 'fs'
import path from 'path'

// Admin email dynamically resolved from environment variables (.env / Vercel envs)
const ENV_ADMIN_EMAIL = (process.env.VITE_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const PUSH_ICON = 'https://res.cloudinary.com/doawldbnh/image/upload/w_192,h_192,c_fit,f_png,q_auto/v1792509878/v5xliyxwuirgzhp6ict6.png'

function getServiceAccount() {
  const envKey = process.env.FIREBASE_SERVICE_ACCOUNT
  if (envKey) {
    try {
      const trimmed = envKey.trim()
      return JSON.parse(trimmed)
    } catch {
      try {
        return JSON.parse(Buffer.from(envKey.trim(), 'base64').toString('utf8'))
      } catch (e) {
        console.error('[send-push] Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable:', e)
      }
    }
  }

  // Fallback to local serviceAccountKey.json if running locally
  try {
    const localKeyPath = path.join(process.cwd(), 'serviceAccountKey.json')
    if (fs.existsSync(localKeyPath)) {
      return JSON.parse(fs.readFileSync(localKeyPath, 'utf8'))
    }
  } catch (err) {
    console.warn('[send-push] Local serviceAccountKey.json check warning:', err.message)
  }

  return null
}

function initFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApp()
  }

  const credentials = getServiceAccount()
  if (!credentials) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT credentials')
  }

  return initializeApp({
    credential: cert(credentials),
  })
}

export default async function handler(req, res) {
  // CORS support
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' })
  }

  try {
    const app = initFirebaseAdmin()
    const firestore = getFirestore(app)
    const messaging = getMessaging(app)

    const {
      action = '',
      token = '',
      platform = '',
      userId = '',
      userEmail = '',
      toAdmin = false,
      toAll = false,
      broadcast = false,
      title = 'Paw Paw Pet Grooming',
      body = '',
      message = '',
      bookingId = '',
      actionUrl = '/',
    } = req.body || {}

    const tokensCol = firestore.collection('fcmTokens')

    // Handle token registration action (runs with Admin SDK, guarantees token is saved in Firestore)
    if (action === 'register-token' || req.body?.registerToken) {
      if (!token || !userId) {
        return res.status(400).json({ error: 'Missing token or userId' })
      }
      const cleanEmail = String(userEmail || '').trim().toLowerCase()
      await tokensCol.doc(token).set({
        token,
        userId,
        userEmail: cleanEmail,
        isAdmin: cleanEmail === ENV_ADMIN_EMAIL && ENV_ADMIN_EMAIL !== '',
        active: true,
        platform: String(platform || ''),
        updatedAt: new Date(),
      }, { merge: true })

      return res.status(200).json({ success: true, message: 'FCM token registered in Firestore' })
    }

    const textBody = String(body || message || '').trim()
    const finalTitle = String(title || 'Paw Paw Pet Grooming').trim()
    const finalUrl = String(actionUrl || '/').trim()
    const notificationTag = String(bookingId ? `pawpaw-booking-${bookingId}` : 'pawpaw-alert')

    // 1. Collect all active recipient tokens uniquely
    const tokensSet = new Set()

    const addDocsTokens = (snap) => {
      snap.forEach((docSnap) => {
        const d = docSnap.data()
        if (d && d.token && d.active !== false) {
          tokensSet.add(d.token)
        }
      })
    }

    const targetEmail = String(userEmail || '').trim().toLowerCase()
    const isAdminTarget = toAdmin || (targetEmail && (targetEmail === ENV_ADMIN_EMAIL && ENV_ADMIN_EMAIL !== ''))

    const queries = []

    if (toAll || broadcast) {
      // Broadcast to all active customer devices
      queries.push(tokensCol.where('active', '==', true).get())
    } else if (isAdminTarget) {
      // Admin target tokens:
      // 1) All devices registered with isAdmin: true
      // 2) Any device registered with the active admin email from env (dev or prod)
      // 3) Any device registered with the target admin email passed in request
      queries.push(tokensCol.where('isAdmin', '==', true).get())
      if (ENV_ADMIN_EMAIL) {
        queries.push(tokensCol.where('userEmail', '==', ENV_ADMIN_EMAIL).get())
      }
      if (targetEmail && targetEmail !== ENV_ADMIN_EMAIL) {
        queries.push(tokensCol.where('userEmail', '==', targetEmail).get())
      }
    } else {
      // Customer / User target tokens:
      // Match active devices registered for this user by userId or email
      if (userId) {
        queries.push(tokensCol.where('userId', '==', userId).get())
      }
      if (targetEmail) {
        queries.push(tokensCol.where('userEmail', '==', targetEmail).get())
      }
      if (userEmail && String(userEmail).trim().toLowerCase() !== String(userEmail).trim()) {
        queries.push(tokensCol.where('userEmail', '==', String(userEmail).trim()).get())
      }
    }

    const querySnaps = await Promise.all(queries)
    querySnaps.forEach(addDocsTokens)

    const tokens = Array.from(tokensSet)

    if (tokens.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No active device tokens found for recipient',
        recipient: { userId, userEmail, toAdmin: isAdminTarget },
        sentCount: 0,
      })
    }

    // 2. Multicast FCM message with high priority for Web Push
    const cleanTopic = notificationTag.replace(/[^a-zA-Z0-9-_.~%]/g, '_').slice(0, 32)
    const actionBtnTitle = req.body?.actionTitle || (
      isAdminTarget
        ? (finalUrl.includes('boarding') ? '🐾 View Boarding' : '📅 View Booking')
        : (finalUrl.includes('/book')
            ? '📅 Book Appointment'
            : (finalUrl.includes('boarding') ? '🐾 View Stay' : '📅 View Appointment'))
    )

    const multicastMessage = {
      tokens,
      notification: {
        title: finalTitle,
        body: textBody,
      },
      data: {
        title: finalTitle,
        body: textBody,
        bookingId: String(bookingId || ''),
        actionUrl: finalUrl,
        link: finalUrl,
        icon: PUSH_ICON,
        tag: notificationTag,
        actionTitle: actionBtnTitle,
      },
      android: {
        collapseKey: cleanTopic,
        priority: 'high',
        notification: {
          tag: notificationTag,
          clickAction: finalUrl,
          icon: PUSH_ICON,
        },
      },
      webpush: {
        headers: {
          Urgency: 'high',
          Topic: cleanTopic,
        },
        notification: {
          title: finalTitle,
          body: textBody,
          icon: PUSH_ICON,
          tag: notificationTag,
          renotify: true,
          requireInteraction: true,
          actions: [
            { action: 'open_url', title: actionBtnTitle },
            { action: 'dismiss', title: 'Dismiss' },
          ],
          data: {
            url: finalUrl,
          },
        },
        fcmOptions: {
          link: finalUrl,
        },
      },
    }

    const response = await messaging.sendEachForMulticast(multicastMessage)

    // 3. Cleanup dead/unregistered tokens in the background
    const batch = firestore.batch()
    let deadTokenCount = 0

    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const errCode = resp.error.code
        if (
          errCode === 'messaging/registration-token-not-registered' ||
          errCode === 'messaging/invalid-registration-token'
        ) {
          const deadToken = tokens[idx]
          batch.update(tokensCol.doc(deadToken), { active: false, deactivatedAt: new Date() })
          deadTokenCount++
        }
      }
    })

    if (deadTokenCount > 0) {
      await batch.commit().catch((err) => console.warn('[send-push] Token cleanup failed:', err))
    }

    return res.status(200).json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalTokens: tokens.length,
      deadTokensCleaned: deadTokenCount,
    })
  } catch (error) {
    console.error('[send-push] Error processing push notification:', error)
    return res.status(500).json({
      error: 'Failed to send push notification',
      details: error.message,
    })
  }
}
