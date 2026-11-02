import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import fs from 'fs'
import path from 'path'

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
        console.error('[daily-summary] Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable:', e)
      }
    }
  }

  try {
    const localKeyPath = path.join(process.cwd(), 'serviceAccountKey.json')
    if (fs.existsSync(localKeyPath)) {
      return JSON.parse(fs.readFileSync(localKeyPath, 'utf8'))
    }
  } catch (err) {
    console.warn('[daily-summary] Local serviceAccountKey.json check warning:', err.message)
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

// Format number into INR currency
function formatInr(val) {
  const num = Number(val || 0)
  return isNaN(num) ? '0' : num.toLocaleString('en-IN')
}

export default async function handler(req, res) {
  // CORS support
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const app = initFirebaseAdmin()
    const firestore = getFirestore(app)
    const messaging = getMessaging(app)

    // Current date in Indian Standard Time (Asia/Kolkata)
    const todayIst = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()) // Format: YYYY-MM-DD

    // 1. Query today's grooming bookings
    const bookingsCol = firestore.collection('bookings')
    const bookingsSnap = await bookingsCol.where('date', '==', todayIst).get()

    let totalGrooming = 0
    let completedCount = 0
    let pendingCount = 0
    let cancelledCount = 0
    let totalRevenue = 0

    bookingsSnap.forEach((docSnap) => {
      totalGrooming++
      const data = docSnap.data()
      const status = String(data?.status || '').toLowerCase()

      if (status === 'completed') {
        completedCount++
        const rev = Number(data?.finalTotal || data?.estimatedTotal || data?.serviceTotal || 0)
        if (!isNaN(rev)) totalRevenue += rev
      } else if (status === 'cancelled') {
        cancelledCount++
      } else {
        // pending, confirmed, in-progress
        pendingCount++
      }
    })

    // 2. Query active pet boardings for today
    let activeBoardingCount = 0
    try {
      const boardingCol = firestore.collection('boardingBookings')
      const boardingSnap = await boardingCol.where('status', 'in', ['pending', 'confirmed', 'checked_in']).get()

      boardingSnap.forEach((docSnap) => {
        const bData = docSnap.data()
        const checkIn = String(bData?.checkInDate || '')
        const checkOut = String(bData?.checkOutDate || '')
        if (checkIn && checkOut && checkIn <= todayIst && todayIst <= checkOut) {
          activeBoardingCount++
        }
      })
    } catch (bErr) {
      console.warn('[daily-summary] Boarding query warning:', bErr.message)
    }

    // 3. Compose the summary title & message
    let finalTitle = ''
    let textBody = ''

    if (totalGrooming === 0 && activeBoardingCount === 0) {
      finalTitle = `🌙 Daily Summary: No Appointments Today`
      textBody = `No appointments were scheduled for ${todayIst}. Salon was peaceful! 🐾`
    } else {
      const apptLabel = totalGrooming === 1 ? 'Appointment' : 'Appointments'
      finalTitle = `🌙 Daily Summary: ${totalGrooming} ${apptLabel}`

      const parts = [
        `✅ ${completedCount} Completed`,
        `⏳ ${pendingCount} Pending`,
        `❌ ${cancelledCount} Cancelled`,
      ]

      if (totalRevenue > 0) {
        parts.push(`₹${formatInr(totalRevenue)} Revenue`)
      }

      if (activeBoardingCount > 0) {
        parts.push(`🐾 ${activeBoardingCount} Boarding Stay${activeBoardingCount === 1 ? '' : 's'}`)
      }

      textBody = parts.join(' • ')
    }

    const finalUrl = '/admin'
    const notificationTag = `pawpaw-summary-${todayIst}`

    // 4. Save notification in Firestore for in-app bell
    await firestore.collection('notifications').add({
      userId: '',
      userEmail: ENV_ADMIN_EMAIL,
      title: finalTitle,
      message: textBody,
      type: 'daily_summary',
      actionUrl: finalUrl,
      read: false,
      createdAt: new Date(),
    })

    // 5. Gather all active Admin FCM tokens
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

    const adminQueries = [
      tokensCol.where('isAdmin', '==', true).get(),
    ]
    if (ENV_ADMIN_EMAIL) {
      adminQueries.push(tokensCol.where('userEmail', '==', ENV_ADMIN_EMAIL).get())
    }

    const querySnaps = await Promise.all(adminQueries)
    querySnaps.forEach(addDocsTokens)

    const tokens = Array.from(tokensSet)

    if (tokens.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Daily summary generated and saved, but no active admin tokens found',
        summary: {
          date: todayIst,
          totalGrooming,
          completedCount,
          pendingCount,
          cancelledCount,
          totalRevenue,
          activeBoardingCount,
        },
        sentCount: 0,
      })
    }

    // 6. Multicast push to all active Admin devices
    const multicastMessage = {
      tokens,
      notification: {
        title: finalTitle,
        body: textBody,
      },
      data: {
        title: finalTitle,
        body: textBody,
        actionUrl: finalUrl,
        link: finalUrl,
        icon: PUSH_ICON,
        tag: notificationTag,
        actionTitle: '📊 View Admin',
      },
      android: {
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
          Topic: notificationTag.slice(0, 32),
        },
        notification: {
          title: finalTitle,
          body: textBody,
          icon: PUSH_ICON,
          tag: notificationTag,
          renotify: true,
          requireInteraction: true,
          actions: [
            { action: 'open_url', title: '📊 View Admin' },
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

    const pushResponse = await messaging.sendEachForMulticast(multicastMessage)

    return res.status(200).json({
      success: true,
      message: 'Daily summary sent successfully',
      summary: {
        date: todayIst,
        totalGrooming,
        completedCount,
        pendingCount,
        cancelledCount,
        totalRevenue,
        activeBoardingCount,
        title: finalTitle,
        body: textBody,
      },
      successCount: pushResponse.successCount,
      failureCount: pushResponse.failureCount,
      totalAdminDevices: tokens.length,
    })
  } catch (error) {
    console.error('[daily-summary] Error generating daily summary:', error)
    return res.status(500).json({
      error: 'Failed to generate daily summary',
      details: error.message,
    })
  }
}
