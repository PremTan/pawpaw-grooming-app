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

// Helper to send multicast push notification to a customer and record in-app notification in Firestore
async function sendCustomerPushAndInApp(firestore, messaging, { userId, userEmail, title, body, actionUrl, type, tag }) {
  // 1. In-App Notification (saved in top-level notifications collection for the notification bell)
  try {
    await firestore.collection('notifications').add({
      userId: userId || '',
      userEmail: userEmail || '',
      title,
      message: body,
      type: type || 'grooming_reminder',
      actionUrl: actionUrl || '/book',
      read: false,
      createdAt: new Date(),
    })
  } catch (err) {
    console.warn('[daily-summary] Could not write customer in-app notification:', err.message)
  }

  // 2. Collect FCM push tokens
  const tokensSet = new Set()
  const tokensCol = firestore.collection('fcmTokens')

  if (userId) {
    try {
      const uSnap = await tokensCol.where('userId', '==', userId).where('active', '==', true).get()
      uSnap.forEach(d => {
        const t = d.data()?.token
        if (t) tokensSet.add(t)
      })
    } catch (err) {
      console.warn('[daily-summary] Could not query user tokens:', err.message)
    }
  }

  if (userEmail) {
    try {
      const eSnap = await tokensCol.where('userEmail', '==', userEmail).where('active', '==', true).get()
      eSnap.forEach(d => {
        const t = d.data()?.token
        if (t) tokensSet.add(t)
      })
    } catch (err) {
      console.warn('[daily-summary] Could not query email tokens:', err.message)
    }
  }

  const tokens = Array.from(tokensSet)
  if (tokens.length === 0) {
    return { pushed: 0 }
  }

  const actionBtnTitle = actionUrl.includes('/book') ? '📅 Book Appointment' : '🐾 View Details'

  const messagePayload = {
    tokens,
    notification: {
      title,
      body,
    },
    data: {
      title,
      body,
      actionUrl,
      link: actionUrl,
      icon: PUSH_ICON,
      tag: tag || 'pawpaw-reminder',
      actionTitle: actionBtnTitle,
    },
    android: {
      priority: 'high',
      notification: {
        tag: tag || 'pawpaw-reminder',
        clickAction: actionUrl,
        icon: PUSH_ICON,
      },
    },
    webpush: {
      headers: {
        Urgency: 'high',
        Topic: (tag || 'pawpaw-reminder').slice(0, 32),
      },
      notification: {
        title,
        body,
        icon: PUSH_ICON,
        tag: tag || 'pawpaw-reminder',
        renotify: true,
        requireInteraction: true,
        actions: [
          { action: 'open_url', title: actionBtnTitle },
          { action: 'dismiss', title: 'Dismiss' },
        ],
        data: {
          url: actionUrl,
        },
      },
      fcmOptions: {
        link: actionUrl,
      },
    },
  }

  try {
    const pushRes = await messaging.sendEachForMulticast(messagePayload)
    return { pushed: pushRes.successCount, failed: pushRes.failureCount }
  } catch (pErr) {
    console.warn('[daily-summary] Customer push multicast warning:', pErr.message)
    return { pushed: 0, error: pErr.message }
  }
}

// Core Automation: Checks for pets due for grooming and new users without bookings
async function processAutomatedCustomerReminders(firestore, messaging, todayIst) {
  const results = {
    groomingRemindersSent: 0,
    welcomeRemindersSent: 0,
    skippedInBoarding: 0,
    skippedAlreadyBooked: 0,
    skippedAlreadyNotified: 0,
    details: [],
  }

  try {
    const nowIst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const dayOfWeek = nowIst.getDay() // 0 = Sunday, 4 = Thursday, 5 = Friday, 6 = Saturday
    const isWeekendApproaching = (dayOfWeek === 4 || dayOfWeek === 5)

    // ─── 1. HOSTEL GUARD: Find all pets currently checked-in at Boarding ───
    const checkedInBoardingSnap = await firestore.collection('boardingBookings')
      .where('status', '==', 'checked_in')
      .get()

    const checkedInUserIds = new Set()
    const checkedInPetNames = new Set()

    checkedInBoardingSnap.forEach(docSnap => {
      const b = docSnap.data()
      if (b?.userId && b.userId !== 'walkin') checkedInUserIds.add(String(b.userId).trim())
      if (b?.userEmail) checkedInUserIds.add(String(b.userEmail).trim().toLowerCase())
      if (b?.petName) checkedInPetNames.add(String(b.petName).trim().toLowerCase())
    })

    // ─── 2. UPCOMING BOOKING GUARD: Find all upcoming grooming bookings (pending/confirmed) ───
    const upcomingBookingsSnap = await firestore.collection('bookings')
      .where('status', 'in', ['pending', 'confirmed'])
      .get()

    const usersWithUpcoming = new Set()
    const petsWithUpcoming = new Set()

    upcomingBookingsSnap.forEach(docSnap => {
      const b = docSnap.data()
      const uid = b?.userId ? String(b.userId).trim() : ''
      const email = b?.userEmail ? String(b.userEmail).trim().toLowerCase() : ''
      if (uid && uid !== 'walkin') usersWithUpcoming.add(uid)
      if (email) usersWithUpcoming.add(email)
      if (b?.petName) {
        const pName = String(b.petName).trim().toLowerCase()
        petsWithUpcoming.add(`${uid || email}_${pName}`)
      }
    })

    // ─── 3. GROOMING REMINDER CHECK: Pets due in 2 days (Recommended Days - 2) ───
    const sixtyDaysAgo = new Date(nowIst)
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().slice(0, 10)

    const completedSnap = await firestore.collection('bookings')
      .where('status', '==', 'completed')
      .where('date', '>=', sixtyDaysAgoStr)
      .get()

    // Find the most recent completed booking per pet
    const latestCompletedByPet = new Map()

    completedSnap.forEach(docSnap => {
      const b = { id: docSnap.id, ...docSnap.data() }
      const uid = b.userId && b.userId !== 'walkin' ? String(b.userId).trim() : ''
      const email = b.userEmail ? String(b.userEmail).trim().toLowerCase() : ''
      const petName = String(b.petName || 'Pet').trim()
      if (!uid && !email) return

      const key = `${uid || email}_${petName.toLowerCase()}`
      const existing = latestCompletedByPet.get(key)
      const apptDate = b.date ? new Date(`${b.date}T00:00:00`) : (b.completedAt?.toDate ? b.completedAt.toDate() : null)
      const existingDate = existing?.date ? new Date(`${existing.date}T00:00:00`) : (existing?.completedAt?.toDate ? existing.completedAt.toDate() : null)

      if (!existing || (apptDate && existingDate && apptDate > existingDate)) {
        latestCompletedByPet.set(key, b)
      }
    })

    for (const [key, booking] of latestCompletedByPet.entries()) {
      const uid = booking.userId && booking.userId !== 'walkin' ? String(booking.userId).trim() : ''
      const email = booking.userEmail ? String(booking.userEmail).trim().toLowerCase() : ''
      const petName = String(booking.petName || 'Pet').trim()

      // Hostel Guard: skip if pet is currently checked in at boarding
      if (checkedInPetNames.has(petName.toLowerCase()) || checkedInUserIds.has(uid) || checkedInUserIds.has(email)) {
        results.skippedInBoarding++
        continue
      }

      // Upcoming Guard: skip if customer or pet already booked an upcoming appointment
      if (petsWithUpcoming.has(key) || usersWithUpcoming.has(uid) || usersWithUpcoming.has(email)) {
        results.skippedAlreadyBooked++
        continue
      }

      // Anti-Spam Guard: skip if reminder was already sent for this completed booking cycle
      if (booking.groomingReminderSent === true) {
        results.skippedAlreadyNotified++
        continue
      }

      // Cycle Calculation: admin days if specified, fallback to 28 days
      const cycleDays = Number(booking.nextRecommendedVisitDays) || 28
      // Send 2 days before the due date!
      const triggerDays = Math.max(1, cycleDays - 2)

      const completedDate = booking.completedAt?.toDate
        ? booking.completedAt.toDate()
        : (booking.date ? new Date(`${booking.date}T00:00:00`) : null)

      if (!completedDate || isNaN(completedDate.getTime())) continue

      const daysSinceCompleted = Math.floor((nowIst.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24))

      // Trigger condition: Send when customer has reached triggerDays (allow small window up to triggerDays + 2)
      if (daysSinceCompleted >= triggerDays && daysSinceCompleted <= triggerDays + 2) {
        let reminderTitle = `Time for ${petName}'s next spa session? 🐶`
        let reminderBody = `It's almost time for ${petName}'s grooming session! Tap to choose your preferred slot.`

        if (isWeekendApproaching) {
          reminderTitle = `Weekend slot for ${petName}? 🐶`
          reminderBody = `Time for ${petName}'s next spa session! Weekend slots fill up fast — tap here to reserve.`
        }

        const actionUrl = `/book?petName=${encodeURIComponent(petName)}`

        await sendCustomerPushAndInApp(firestore, messaging, {
          userId: uid,
          userEmail: email,
          title: reminderTitle,
          body: reminderBody,
          actionUrl,
          type: 'grooming_reminder',
          tag: `pawpaw-grooming-reminder-${booking.id}`,
        })

        // Mark on booking so this completed cycle is never notified again
        await firestore.collection('bookings').doc(booking.id).update({
          groomingReminderSent: true,
          groomingReminderSentAt: new Date(),
        })

        results.groomingRemindersSent++
        results.details.push({ type: 'grooming_reminder', petName, userId: uid, cycleDays, daysSinceCompleted })
      }
    }

    // ─── 4. NEW SIGNUP USER CHECK: Registered ~2 days ago with 0 bookings ───
    const twoDaysAgoMin = new Date(nowIst.getTime() - 60 * 60 * 1000) // 60 hours ago
    const twoDaysAgoMax = new Date(nowIst.getTime() - 36 * 60 * 1000) // 36 hours ago

    // Get all user IDs/emails that have ever made any booking
    const allBookedUserIds = new Set()
    const allBookedEmails = new Set()

    const allBookingsSnap = await firestore.collection('bookings').select('userId', 'userEmail').get()
    allBookingsSnap.forEach(d => {
      const b = d.data()
      if (b?.userId && b.userId !== 'walkin') allBookedUserIds.add(String(b.userId).trim())
      if (b?.userEmail) allBookedEmails.add(String(b.userEmail).trim().toLowerCase())
    })

    const allBoardingSnap = await firestore.collection('boardingBookings').select('userId', 'userEmail').get()
    allBoardingSnap.forEach(d => {
      const b = d.data()
      if (b?.userId && b.userId !== 'walkin') allBookedUserIds.add(String(b.userId).trim())
      if (b?.userEmail) allBookedEmails.add(String(b.userEmail).trim().toLowerCase())
    })

    const profilesSnap = await firestore.collection('profiles').get()

    for (const docSnap of profilesSnap.docs) {
      const profile = { id: docSnap.id, ...docSnap.data() }
      const uid = String(profile.id || profile.userId || '').trim()
      const email = String(profile.email || '').trim().toLowerCase()
      if (!uid || email === ENV_ADMIN_EMAIL) continue

      // Skip if user has ever booked before
      if (allBookedUserIds.has(uid) || allBookedEmails.has(email)) continue

      // Skip if welcome reminder was already sent
      if (profile.welcomeReminderSent === true) continue

      const createdAt = profile.createdAt?.toDate ? profile.createdAt.toDate() : (profile.updatedAt?.toDate ? profile.updatedAt.toDate() : null)
      if (!createdAt || isNaN(createdAt.getTime())) continue

      // If user joined between 36 and 60 hours ago (~Day 2)
      if (createdAt >= twoDaysAgoMin && createdAt <= twoDaysAgoMax) {
        const welcomeTitle = 'Welcome to Paw Paw Salon! 🐾'
        const welcomeBody = 'Treat your furry best friend to a relaxing spa bath & grooming session. Tap to book your pet\'s first visit!'
        const actionUrl = '/book'

        await sendCustomerPushAndInApp(firestore, messaging, {
          userId: uid,
          userEmail: email,
          title: welcomeTitle,
          body: welcomeBody,
          actionUrl,
          type: 'welcome_reminder',
          tag: `pawpaw-welcome-${uid}`,
        })

        await firestore.collection('profiles').doc(docSnap.id).update({
          welcomeReminderSent: true,
          welcomeReminderSentAt: new Date(),
        })

        results.welcomeRemindersSent++
        results.details.push({ type: 'welcome_reminder', userId: uid, email })
      }
    }

  } catch (err) {
    console.error('[daily-summary] Customer reminders automation error:', err)
    results.error = err.message
  }

  return results
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
        const collected = (data?.amountCollected !== undefined && data?.amountCollected !== null && data?.amountCollected !== '')
          ? Number(data.amountCollected)
          : (data?.finalTotal !== undefined && data?.finalTotal !== null && data?.finalTotal !== '')
          ? Number(data.finalTotal)
          : (data?.totalAmount !== undefined && data?.totalAmount !== null && data?.totalAmount !== '')
          ? Number(data.totalAmount)
          : Number(data?.estimatedTotal || data?.price || 0)

        totalRevenue += isNaN(collected) ? 0 : collected
      } else if (status === 'cancelled') {
        cancelledCount++
      } else {
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

    // 3. Compose the admin summary title & message
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
      ]

      if (pendingCount > 0) {
        parts.push(`⏳ ${pendingCount} Pending`)
      }

      if (cancelledCount > 0) {
        parts.push(`❌ ${cancelledCount} Cancelled`)
      }

      if (totalRevenue > 0) {
        parts.push(`₹${formatInr(totalRevenue)} Revenue`)
      }

      if (activeBoardingCount > 0) {
        parts.push(`🐾 ${activeBoardingCount} Boarding Stay${activeBoardingCount === 1 ? '' : 's'}`)
      }

      textBody = parts.join(' • ')
    }

    const finalUrl = `/admin/bookings?date=${todayIst}`
    const actionBtnTitle = "📅 Today's Bookings"
    const notificationTag = `pawpaw-summary-${todayIst}`

    // 4. Save admin daily summary notification in Firestore
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

    // 5. Gather all active Admin FCM tokens & multicast push to Admin
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

    const adminTokens = Array.from(tokensSet)
    let adminPushSuccessCount = 0
    let adminPushFailureCount = 0

    if (adminTokens.length > 0) {
      const multicastMessage = {
        tokens: adminTokens,
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
          actionTitle: actionBtnTitle,
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

      const pushResponse = await messaging.sendEachForMulticast(multicastMessage)
      adminPushSuccessCount = pushResponse.successCount
      adminPushFailureCount = pushResponse.failureCount
    }

    // ─── 6. AUTOMATED CUSTOMER REMINDERS (RUNS ON SAME 9:00 PM CRON) ───
    const customerRemindersResult = await processAutomatedCustomerReminders(firestore, messaging, todayIst)

    return res.status(200).json({
      success: true,
      message: 'Daily summary and automated customer reminders processed successfully',
      summary: {
        date: todayIst,
        totalGrooming,
        completedCount,
        pendingCount,
        cancelledCount,
        totalRevenue,
        activeBoardingCount,
        adminTitle: finalTitle,
        adminBody: textBody,
        adminDevicesSent: adminPushSuccessCount,
      },
      customerReminders: customerRemindersResult,
    })
  } catch (error) {
    console.error('[daily-summary] Error generating daily summary and reminders:', error)
    return res.status(500).json({
      error: 'Failed to process daily summary and customer reminders',
      details: error.message,
    })
  }
}
