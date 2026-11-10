// src/utils/offers.js
import { collection, doc, getDocs, getDoc, query, where } from 'firebase/firestore'

/**
 * Fetch all active and currently valid offers.
 * Reads from 'settings/offers' first (guaranteed permitted in live Firestore rules),
 * falling back to the 'offers' collection.
 */
export async function fetchActiveOffers(db) {
  const today = new Date().toISOString().slice(0, 10)
  try {
    // 1. Try reading from settings/offers
    const settingsSnap = await getDoc(doc(db, 'settings', 'offers'))
    if (settingsSnap.exists()) {
      const data = settingsSnap.data()
      if (Array.isArray(data?.list)) {
        return data.list.filter(offer => {
          if (!offer || offer.isActive === false) return false
          if (offer.validFrom && offer.validFrom > today) return false
          if (offer.validUntil && offer.validUntil < today) return false
          return true
        })
      }
    }

    // 2. Fallback to /offers collection
    const q = query(collection(db, 'offers'), where('isActive', '==', true))
    const snap = await getDocs(q)
    return snap.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .filter(offer => {
        if (offer.validFrom && offer.validFrom > today) return false
        if (offer.validUntil && offer.validUntil < today) return false
        return true
      })
  } catch (err) {
    console.error('[offers] Failed to fetch active offers:', err)
    return []
  }
}

/**
 * Fetch the currently featured festival offer for the home banner.
 * ONLY returns an offer if explicitly marked as showBanner: true and is active.
 * If all offers have banner turned OFF, returns null.
 */
export async function fetchFeaturedOffer(db) {
  try {
    const activeOffers = await fetchActiveOffers(db)
    const featured = activeOffers.find(o => o.showBanner === true && o.isActive !== false) || null
    return featured
  } catch {
    return null
  }
}

/**
 * Calculate discount amount for a given offer and booking subtotal.
 * @param {object} offer - The offer document
 * @param {number} subtotal - The booking subtotal
 * @param {object} [options]
 * @param {'grooming'|'boarding'} [options.serviceType] - The service being booked
 * @returns {{ valid: boolean, discountAmount: number, error?: string }}
 */
export function calculateDiscount(offer, subtotal, { serviceType } = {}) {
  if (!offer) {
    return { valid: false, discountAmount: 0, error: 'Invalid coupon' }
  }

  // 1. Verify service scope (grooming vs boarding vs all)
  const applicable = offer.applicableService || 'all'
  if (serviceType && applicable !== 'all' && applicable !== serviceType) {
    const label = applicable === 'boarding' ? 'Pet Boarding' : 'Pet Grooming'
    return {
      valid: false,
      discountAmount: 0,
      error: `This coupon is valid only for ${label} bookings.`,
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  if (offer.validFrom && offer.validFrom > today) {
    return { valid: false, discountAmount: 0, error: `This offer starts on ${offer.validFrom}` }
  }
  if (offer.validUntil && offer.validUntil < today) {
    return { valid: false, discountAmount: 0, error: 'This coupon has expired' }
  }

  const minAmount = Number(offer.minBookingAmount || 0)
  if (minAmount > 0 && subtotal < minAmount) {
    return {
      valid: false,
      discountAmount: 0,
      error: `Minimum booking amount of ₹${minAmount} required to use this coupon`,
    }
  }

  let discount = 0
  const val = Number(offer.discountValue || 0)

  if (offer.discountType === 'percentage') {
    discount = Math.round((subtotal * val) / 100)
    const maxCap = Number(offer.maxDiscountAmount || 0)
    if (maxCap > 0 && discount > maxCap) {
      discount = maxCap
    }
  } else {
    // Flat rupee discount
    discount = Math.min(val, subtotal)
  }

  return {
    valid: true,
    discountAmount: Math.max(0, discount),
  }
}

/**
 * Check whether a customer is a first-time customer (has 0 past non-cancelled bookings).
 * Checks bookings, boardingBookings, or both depending on serviceType.
 * @returns {Promise<boolean>} true if first-time, false if returning customer
 */
export async function checkFirstTimeCustomer(db, { userId, phone, serviceType = 'all' } = {}) {
  if (!db) return true
  try {
    // 1. Check by userId if authenticated
    if (userId && userId !== 'walkin' && userId !== 'walkin@offline') {
      if (serviceType === 'grooming' || serviceType === 'all') {
        const qGroom = query(collection(db, 'bookings'), where('userId', '==', userId))
        const snap = await getDocs(qGroom)
        const hasPast = snap.docs.some(d => d.data().status !== 'cancelled')
        if (hasPast) return false
      }

      if (serviceType === 'boarding' || serviceType === 'all') {
        const qBoard = query(collection(db, 'boardingBookings'), where('userId', '==', userId))
        const snap = await getDocs(qBoard)
        const hasPast = snap.docs.some(d => !['cancelled'].includes(d.data().status))
        if (hasPast) return false
      }
    }

    // 2. Check by phone number
    const cleanPhone = String(phone || '').replace(/\D/g, '')
    if (cleanPhone && cleanPhone.length >= 10) {
      const last10 = cleanPhone.slice(-10)

      if (serviceType === 'grooming' || serviceType === 'all') {
        const snapGroom = await getDocs(collection(db, 'bookings'))
        const match = snapGroom.docs.some(d => {
          const data = d.data()
          if (data.status === 'cancelled') return false
          const p = String(data.phone || '').replace(/\D/g, '')
          return p.endsWith(last10)
        })
        if (match) return false
      }

      if (serviceType === 'boarding' || serviceType === 'all') {
        const snapBoard = await getDocs(collection(db, 'boardingBookings'))
        const match = snapBoard.docs.some(d => {
          const data = d.data()
          if (['cancelled'].includes(data.status)) return false
          const p = String(data.phone || '').replace(/\D/g, '')
          return p.endsWith(last10)
        })
        if (match) return false
      }
    }

    return true
  } catch (err) {
    console.warn('[offers] checkFirstTimeCustomer error:', err)
    return true
  }
}

/**
 * Check whether a customer has already used a specific coupon code.
 * Checks both bookings and boardingBookings collections.
 * @returns {Promise<boolean>} true if already used, false if not used yet.
 */
export async function checkCouponUsage(db, code, { userId, phone } = {}) {
  if (!db || !code) return false
  const normalizedCode = String(code).trim().toUpperCase()

  try {
    // 1. Check by userId if authenticated
    if (userId && userId !== 'walkin' && userId !== 'walkin@offline') {
      const qUser = query(
        collection(db, 'bookings'),
        where('userId', '==', userId),
        where('couponCode', '==', normalizedCode)
      )
      const snap = await getDocs(qUser)
      const hasUsed = snap.docs.some(d => d.data().status !== 'cancelled')
      if (hasUsed) return true

      const qBoarding = query(
        collection(db, 'boardingBookings'),
        where('userId', '==', userId),
        where('couponCode', '==', normalizedCode)
      )
      const snapB = await getDocs(qBoarding)
      if (snapB.docs.some(d => !['cancelled'].includes(d.data().status))) return true
    }

    // 2. Check by customer phone number
    const cleanPhone = String(phone || '').replace(/\D/g, '')
    if (cleanPhone && cleanPhone.length >= 10) {
      const last10 = cleanPhone.slice(-10)
      const qPhone = query(
        collection(db, 'bookings'),
        where('couponCode', '==', normalizedCode)
      )
      const snap = await getDocs(qPhone)
      const match = snap.docs.some(d => {
        const data = d.data()
        if (data.status === 'cancelled') return false
        const p = String(data.phone || '').replace(/\D/g, '')
        return p.endsWith(last10)
      })
      if (match) return true

      const qBoardingPhone = query(
        collection(db, 'boardingBookings'),
        where('couponCode', '==', normalizedCode)
      )
      const snapBPhone = await getDocs(qBoardingPhone)
      const matchB = snapBPhone.docs.some(d => {
        const data = d.data()
        if (['cancelled'].includes(data.status)) return false
        const p = String(data.phone || '').replace(/\D/g, '')
        return p.endsWith(last10)
      })
      if (matchB) return true
    }

    return false
  } catch (err) {
    console.warn('[offers] checkCouponUsage error:', err)
    return false
  }
}
