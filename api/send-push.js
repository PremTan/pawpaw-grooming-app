import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import fs from 'fs'
import path from 'path'

const ADMIN_EMAIL = 'premtandalekar12345@gmail.com'
const PUSH_ICON = 'https://res.cloudinary.com/doawldbnh/image/upload/w_192,h_192,c_fit,f_png,q_auto/v1792509878/v5xliyxwuirgzhp6ict6.png'
const PUSH_IMAGE = 'https://res.cloudinary.com/doawldbnh/image/upload/w_512,h_512,c_fit,f_png,q_auto/v1792509878/v5xliyxwuirgzhp6ict6.png'

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
      userId = '',
      userEmail = '',
      toAdmin = false,
      title = 'Paw Paw Pet Grooming',
      body = '',
      message = '',
      bookingId = '',
      actionUrl = '/',
    } = req.body || {}

    const textBody = String(body || message || '').trim()
    const finalTitle = String(title || 'Paw Paw Pet Grooming').trim()
    const finalUrl = String(actionUrl || '/').trim()
    const notificationTag = String(bookingId ? `pawpaw-booking-${bookingId}` : 'pawpaw-alert')

    // 1. Collect all active recipient tokens uniquely
    const tokensCol = firestore.collection('fcmTokens')
    const tokensSet = new Set()

    const addDocsTokens = (snap) => {
      snap.forEach((docSnap) => {
        const d = docSnap.data()
        if (d && d.token && d.active !== false) {
          tokensSet.add(d.token)
        }
      })
    }

    const isAdminTarget = toAdmin || (userEmail && userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase())

    // Restriction: Push notifications to mobile/browser notification bars are currently enabled for Admin only.
    // User notifications are stored in Firestore for in-app website display only and not pushed to user notification bars.
    if (!isAdminTarget) {
      return res.status(200).json({
        success: true,
        message: 'Push notifications are currently enabled for Admin only. In-app website notification preserved.',
        recipient: { userId, userEmail, toAdmin: false },
        sentCount: 0,
      })
    }

    // Admin target tokens only
    const [adminRoleSnap, adminEmailSnap] = await Promise.all([
      tokensCol.where('isAdmin', '==', true).get(),
      tokensCol.where('userEmail', '==', ADMIN_EMAIL).get(),
    ])
    addDocsTokens(adminRoleSnap)
    addDocsTokens(adminEmailSnap)

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
    // Note: badge is omitted so Android doesn't flatten a full-color logo into a grey square.
    // icon provides the small notification icon, and image / imageUrl provides the large preview.
    const cleanTopic = notificationTag.replace(/[^a-zA-Z0-9-_.~%]/g, '_').slice(0, 32)

    // Data-only message payload:
    // This is the industry-standard solution for FCM Web Push on Android Chrome.
    // By omitting top-level and webpush 'notification' objects, Chrome will NOT display its own native push.
    // Our Service Worker acts as the single authoritative display handler via self.registration.showNotification,
    // which guarantees that only ONE notification is ever shown.
    const multicastMessage = {
      tokens,
      data: {
        title: finalTitle,
        body: textBody,
        bookingId: String(bookingId || ''),
        actionUrl: finalUrl,
        link: finalUrl,
        icon: PUSH_ICON,
        image: PUSH_IMAGE,
        tag: notificationTag,
        actionTitle: finalUrl.includes('boarding') ? '🐾 View Boarding' : '📅 View Booking',
      },
      android: {
        collapseKey: cleanTopic,
        priority: 'high',
      },
      webpush: {
        headers: {
          Urgency: 'high',
          Topic: cleanTopic,
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
