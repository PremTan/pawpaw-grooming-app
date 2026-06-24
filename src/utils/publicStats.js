import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { countOpenDays, fetchBookingSettings } from './bookingSettings'

export function calculatePublicStats(bookings, reviews, bookingSettings) {
  const avgRating = reviews.length
    ? (reviews.reduce((sum, review) => sum + (review.rating || 5), 0) / reviews.length).toFixed(1)
    : 5.0
  const perServiceBookings = {}
  bookings.forEach(booking => {
    const ids = Array.isArray(booking.serviceIds) && booking.serviceIds.length
      ? booking.serviceIds
      : booking.serviceId ? [booking.serviceId] : []
    ids.forEach(id => {
      perServiceBookings[id] = (perServiceBookings[id] || 0) + 1
    })
  })

  return {
    totalBookings: bookings.length,
    totalReviews: reviews.length,
    avgRating,
    daysOpen: countOpenDays(bookingSettings),
    perServiceBookings,
  }
}

export async function syncPublicStats(db) {
  const [bookingsSnap, reviewsSnap, bookingSettings] = await Promise.all([
    getDocs(collection(db, 'bookings')),
    getDocs(collection(db, 'reviews')),
    fetchBookingSettings(db),
  ])
  const bookings = bookingsSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
  const reviews = reviewsSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
  const stats = calculatePublicStats(bookings, reviews, bookingSettings)

  await setDoc(doc(db, 'settings', 'homeStats'), {
    ...stats,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  await setDoc(doc(db, 'settings', 'general'), {
    publicStats: stats,
    totalBookings: stats.totalBookings,
    totalReviews: stats.totalReviews,
    avgRating: stats.avgRating,
    daysOpen: stats.daysOpen,
    statsUpdatedAt: serverTimestamp(),
  }, { merge: true })

  return stats
}

