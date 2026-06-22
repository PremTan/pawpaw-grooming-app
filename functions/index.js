const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { logger } = require('firebase-functions')

initializeApp()

const db = getFirestore()
const messaging = getMessaging()
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL || 'premtandalekar12345@gmail.com'

const compact = value => String(value || '').trim()

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
    await addSnapshot(db.collection('fcmTokens').where('userId', '==', userId))
  }
  if (userEmail) {
    await addSnapshot(db.collection('fcmTokens').where('userEmail', '==', userEmail))
  }

  return Array.from(refs.values())
}

async function pruneInvalidTokens(tokens, responses) {
  const batch = db.batch()
  let count = 0

  responses.forEach((response, index) => {
    if (response.success) return
    const code = response.error?.code || ''
    if (!code.includes('registration-token-not-registered') && !code.includes('invalid-registration-token')) return
    batch.set(db.collection('fcmTokens').doc(tokens[index].id), {
      active: false,
      invalidatedAt: FieldValue.serverTimestamp(),
      errorCode: code,
    }, { merge: true })
    count += 1
  })

  if (count) await batch.commit()
}

async function sendPushToRecipient({ userId = '', userEmail = '', title, message, type = 'info', bookingId = '', actionUrl = '/' }) {
  const recipients = await getTokens({ userId, userEmail })
  const tokens = recipients.map(item => item.id).filter(Boolean)

  if (!tokens.length) {
    logger.info('No FCM tokens for notification recipient', { userId, userEmail, title })
    return { successCount: 0, failureCount: 0 }
  }

  const cleanTitle = compact(title) || 'Paw Paw Pet Grooming'
  const cleanBody = compact(message)
  const cleanActionUrl = compact(actionUrl) || '/'

  const response = await messaging.sendEachForMulticast({
    tokens,
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

  await pruneInvalidTokens(recipients, response.responses)
  logger.info('FCM push sent', { userId, userEmail, successCount: response.successCount, failureCount: response.failureCount })
  return response
}

exports.sendPushOnNotificationCreated = onDocumentCreated('notifications/{notificationId}', async (event) => {
  const data = event.data?.data()
  if (!data) return

  await sendPushToRecipient({
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
