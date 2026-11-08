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
 * @returns {{ valid: boolean, discountAmount: number, error?: string }}
 */
export function calculateDiscount(offer, subtotal) {
  if (!offer) {
    return { valid: false, discountAmount: 0, error: 'Invalid coupon' }
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
      error: `Minimum booking amount of ₹${minAmount} required to use this coupon`
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
