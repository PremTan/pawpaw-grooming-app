const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { logger } = require('firebase-functions')

initializeApp()

const db = getFirestore()
const messaging = getMessaging()
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || ''
const APP_URL = (process.env.APP_URL || 'https://pawpaw-grooming-app.vercel.app').replace(/\/$/, '')

const compact = value => String(value || '').trim()
const absoluteUrl = value => {
  const target = compact(value) || '/'
  if (/^https?:\/\//i.test(target)) return target
  return APP_URL + (target.startsWith('/') ? target : '/' + target)
}

async function getTokens({ userId = '', userEmail = '' }) {
  const refs = new Map()

  async function addSnapshot(query) {
    const snap = await query.get()
    snap.docs.forEach(doc => {
      const data = doc.data()
      if (data.active === false) return
      refs.set(doc.id, { id: doc.id, ...data })
    })
  }

  if (userId) {
    await addSnapshot(db.collection('fcmTokens').where('userId', '==', userId).where('active', '==', true))
  }
  if (userEmail) {
    await addSnapshot(db.collection('fcmTokens').where('userEmail', '==', userEmail).where('active', '==', true))
  }

  return Array.from(refs.values())
}

async function pruneInvalidTokens(tokenTargets, responses) {
  const batch = db.batch()
  let count = 0

  responses.forEach((response, index) => {
    if (response.success) return
    const code = response.error?.code || ''
    if (!code.includes('registration-token-not-registered') && !code.includes('invalid-registration-token')) return
    tokenTargets[index].docs.forEach(tokenDoc => {
      batch.set(db.collection('fcmTokens').doc(tokenDoc.id), {
        active: false,
        invalidatedAt: FieldValue.serverTimestamp(),
        errorCode: code,
      }, { merge: true })
      count += 1
    })
  })

  if (count) await batch.commit()
}

async function sendPushToRecipient({ notificationId = '', userId = '', userEmail = '', title, message, type = 'info', bookingId = '', actionUrl = '/' }) {
  const recipients = await getTokens({ userId, userEmail })
  const tokensByValue = new Map()
  recipients.forEach(item => {
    const token = item.token || item.id
    if (!token) return
    if (!tokensByValue.has(token)) tokensByValue.set(token, { token, docs: [] })
    tokensByValue.get(token).docs.push(item)
  })
  const tokenTargets = Array.from(tokensByValue.values())
  const tokens = tokenTargets.map(item => item.token)

  if (!tokens.length) {
    logger.info('No FCM tokens for notification recipient', { userId, userEmail, title })
    if (notificationId) {
      await db.collection('pushReceipts').doc(notificationId).set({
        userId, userEmail, title, tokenCount: 0, successCount: 0, failureCount: 0, reason: 'no-tokens', updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    return { successCount: 0, failureCount: 0 }
  }

  const cleanTitle = compact(title) || 'Paw Paw Pet Grooming'
  const cleanBody = compact(message)
  const cleanActionUrl = absoluteUrl(actionUrl)

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: cleanTitle,
      body: cleanBody,
    },
    data: {
      title: cleanTitle,
      body: cleanBody,
      type: compact(type),
      bookingId: compact(bookingId),
      actionUrl: cleanActionUrl,
    },
    webpush: {
      fcmOptions: {
        link: cleanActionUrl,
      },
      notification: {
        title: cleanTitle,
        body: cleanBody,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: compact(bookingId) || undefined,
        renotify: true,
        requireInteraction: false,
      },
    },
  })

  await pruneInvalidTokens(tokenTargets, response.responses)
  if (notificationId) {
    await db.collection('pushReceipts').doc(notificationId).set({
      userId, userEmail, title: cleanTitle, tokenCount: tokens.length, successCount: response.successCount, failureCount: response.failureCount, errors: response.responses.filter(item => !item.success).map(item => item.error?.code || item.error?.message || 'unknown'), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }
  logger.info('FCM push sent', { userId, userEmail, successCount: response.successCount, failureCount: response.failureCount })
  return response
}

exports.sendPushOnNotificationCreated = onDocumentCreated('notifications/{notifId}', async (event) => {
  const data = event.data?.data()
  if (!data) return

  await sendPushToRecipient({
    notificationId: event.params.notifId,
    userId: data.userId || '',
    userEmail: data.userEmail || '',
    title: data.title || 'Paw Paw Pet Grooming',
    message: data.message || '',
    type: data.type || 'info',
    bookingId: data.bookingId || '',
    actionUrl: data.actionUrl || '/',
  })
})

exports.notifyAdminOnBookingCreated = onDocumentCreated('bookings/{bookingId}', async (event) => {
  const booking = event.data?.data()
  const bookingId = event.params.bookingId
  if (!booking || booking.isWalkIn) return

  const settingsSnap = await db.doc('settings/general').get()
  const adminUid = settingsSnap.exists ? settingsSnap.data().adminUid || '' : ''
  const serviceName = compact(booking.serviceName) || 'Appointment'
  const petName = compact(booking.petName) || 'Pet'
  const ownerName = compact(booking.ownerName) || 'Customer'
  const dateTime = [compact(booking.date), compact(booking.slot)].filter(Boolean).join(' ')

  await db.collection('notifications').doc(`booking_admin_${bookingId}`).set({
    userId: adminUid,
    userEmail: ADMIN_EMAIL,
    title: `New booking from ${ownerName}`,
    message: `${serviceName} - ${petName}${dateTime ? ` - ${dateTime}` : ''}`,
    type: 'booking',
    bookingId,
    actionUrl: `/admin/bookings/${bookingId}`,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true })
})

exports.notifyOnBookingRescheduled = onDocumentUpdated('bookings/{bookingId}', async (event) => {
  const before = event.data?.before?.data?.() || {}
  const after = event.data?.after?.data?.() || {}
  const bookingId = event.params.bookingId
  const previousDate = compact(before.date)
  const previousSlot = compact(before.slot)
  const nextDate = compact(after.date)
  const nextSlot = compact(after.slot)
  const rescheduledBy = compact(after.rescheduledBy)

  if (!rescheduledBy || (before.date === after.date && before.slot === after.slot)) return

  const settingsSnap = await db.doc('settings/general').get()
  const adminUid = settingsSnap.exists ? settingsSnap.data().adminUid || '' : ''
  const oldDateTime = [previousDate, previousSlot].filter(Boolean).join(' ')
  const newDateTime = [nextDate, nextSlot].filter(Boolean).join(' ')
  const title = rescheduledBy === 'admin' ? 'Appointment rescheduled' : 'Appointment rescheduled'
  const message = rescheduledBy === 'admin'
    ? `Your appointment was rescheduled by admin from ${oldDateTime || 'the previous time'} to ${newDateTime || 'a new time'}.`
    : `An appointment was rescheduled by the customer from ${oldDateTime || 'the previous time'} to ${newDateTime || 'a new time'}.`

  await db.collection('notifications').doc(`booking_reschedule_${bookingId}`).set({
    userId: rescheduledBy === 'admin' ? compact(after.userId || '') : adminUid,
    userEmail: rescheduledBy === 'admin' ? (compact(after.userEmail || '') || ADMIN_EMAIL) : ADMIN_EMAIL,
    title,
    message,
    type: 'rescheduled',
    bookingId,
    actionUrl: rescheduledBy === 'admin' ? '/my-bookings' : `/admin/bookings/${bookingId}`,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true })
})
