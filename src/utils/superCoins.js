// src/utils/superCoins.js
import { doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp, increment } from 'firebase/firestore'

export const DEFAULT_SUPERCOIN_SETTINGS = {
  enabled: true,
  coinValueInRupees: 1, // 1 SuperCoin = ₹1
  earnPercentage: 5, // 5% cashback in SuperCoins (5 coins per ₹100 spent)
  minBookingAmountToEarn: 100, // min booking amount to earn coins
  maxEarnPerBooking: 500, // max coins earnable in a single booking
  maxRedeemPercentage: 100, // Max % of booking subtotal that can be paid using coins (default 100%)
  minCoinsToRedeem: 1, // Min balance required to start redeeming
  maxRedeemPerBooking: 10000, // Max coins redeemable per booking
  walkingCreditMode: 'per_walk', // 'per_walk' (pro-rata after each walk) or 'on_pass_complete'
  tiers: {
    silverThreshold: 5, // 5 completed bookings for Silver
    goldThreshold: 15, // 15 completed bookings for Gold
    silverMultiplier: 1.2, // 1.2x coin earning for Silver
    goldMultiplier: 1.5, // 1.5x coin earning for Gold
  },
}

let cachedSettings = null
let cachedSettingsTime = 0
const CACHE_TTL_MS = 60 * 1000

export function clearSuperCoinSettingsCache() {
  cachedSettings = null
  cachedSettingsTime = 0
}

export function normalizeSuperCoinSettings(data = {}) {
  const tiers = typeof data.tiers === 'object' && data.tiers !== null ? data.tiers : {}

  return {
    enabled: data.enabled !== false,
    coinValueInRupees: Number(data.coinValueInRupees) > 0 ? Number(data.coinValueInRupees) : 1,
    earnPercentage: Number(data.earnPercentage) >= 0 ? Number(data.earnPercentage) : 5,
    minBookingAmountToEarn: Number(data.minBookingAmountToEarn) >= 0 ? Number(data.minBookingAmountToEarn) : 100,
    maxEarnPerBooking: Number(data.maxEarnPerBooking) > 0 ? Number(data.maxEarnPerBooking) : 500,
    maxRedeemPercentage: Number(data.maxRedeemPercentage) > 0 ? Number(data.maxRedeemPercentage) : 100,
    minCoinsToRedeem: Number(data.minCoinsToRedeem) >= 0 ? Number(data.minCoinsToRedeem) : 1,
    maxRedeemPerBooking: Number(data.maxRedeemPerBooking) > 0 ? Number(data.maxRedeemPerBooking) : 10000,
    walkingCreditMode: data.walkingCreditMode === 'on_pass_complete' ? 'on_pass_complete' : 'per_walk',
    tiers: {
      silverThreshold: Number(tiers.silverThreshold) > 0 ? Number(tiers.silverThreshold) : 5,
      goldThreshold: Number(tiers.goldThreshold) > 0 ? Number(tiers.goldThreshold) : 15,
      silverMultiplier: Number(tiers.silverMultiplier) >= 1 ? Number(tiers.silverMultiplier) : 1.2,
      goldMultiplier: Number(tiers.goldMultiplier) >= 1 ? Number(tiers.goldMultiplier) : 1.5,
    },
  }
}

export async function fetchSuperCoinSettings(db, forceRefresh = false) {
  const now = Date.now()
  if (!forceRefresh && cachedSettings && (now - cachedSettingsTime < CACHE_TTL_MS)) {
    return cachedSettings
  }

  try {
    const snap = await getDoc(doc(db, 'settings', 'superCoins'))
    if (snap.exists()) {
      cachedSettings = normalizeSuperCoinSettings(snap.data() || {})
    } else {
      cachedSettings = { ...DEFAULT_SUPERCOIN_SETTINGS }
    }
  } catch (err) {
    console.warn('Failed to load superCoins settings, using defaults:', err)
    cachedSettings = { ...DEFAULT_SUPERCOIN_SETTINGS }
  }

  cachedSettingsTime = now
  return cachedSettings
}

export async function saveSuperCoinSettings(db, nextSettings) {
  const normalized = normalizeSuperCoinSettings(nextSettings)
  await setDoc(doc(db, 'settings', 'superCoins'), {
    ...normalized,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  cachedSettings = normalized
  cachedSettingsTime = Date.now()
  return normalized
}

/**
 * Calculates customer loyalty tier based on completed bookings count
 */
export function getUserTier(completedBookingsCount = 0, settings = DEFAULT_SUPERCOIN_SETTINGS) {
  const count = Number(completedBookingsCount) || 0
  const silver = settings.tiers?.silverThreshold || 5
  const gold = settings.tiers?.goldThreshold || 15

  const overallProgress = count >= gold
    ? 100
    : count >= silver
      ? Math.min(100, Math.round(50 + ((count - silver) / Math.max(1, (gold - silver))) * 50))
      : Math.min(50, Math.round((count / Math.max(1, silver)) * 50))

  if (count >= gold) {
    return {
      id: 'gold',
      name: 'Gold',
      badge: '👑 Gold',
      multiplier: settings.tiers?.goldMultiplier || 1.5,
      completedCount: count,
      targetCount: gold,
      nextTierName: null,
      ordersAway: 0,
      progressPercent: 100,
    }
  }

  if (count >= silver) {
    const ordersAway = Math.max(0, gold - count)
    return {
      id: 'silver',
      name: 'Silver',
      badge: '✨ Silver',
      multiplier: settings.tiers?.silverMultiplier || 1.2,
      completedCount: count,
      targetCount: gold,
      nextTierName: 'Gold',
      ordersAway,
      progressPercent: overallProgress,
    }
  }

  // Base Member Tier
  const ordersAway = Math.max(0, silver - count)
  return {
    id: 'bronze',
    name: 'Member',
    badge: '🐾 Member',
    multiplier: 1.0,
    completedCount: count,
    targetCount: silver,
    nextTierName: 'Silver',
    ordersAway,
    progressPercent: overallProgress,
  }
}

/**
 * Calculates how many SuperCoins a booking earns
 */
export function calculateCoinsEarned(amount = 0, settings = DEFAULT_SUPERCOIN_SETTINGS, tierMultiplier = 1.0) {
  if (!settings.enabled) return 0
  const amt = Number(amount) || 0
  if (amt < (settings.minBookingAmountToEarn || 100)) return 0

  const baseCoins = (amt * (settings.earnPercentage || 5)) / 100
  const multiplied = Math.round(baseCoins * (tierMultiplier || 1.0))
  const maxCap = settings.maxEarnPerBooking || 500

  return Math.min(maxCap, Math.max(0, multiplied))
}

/**
 * Calculates max SuperCoins a user can redeem against a subtotal
 */
export function calculateMaxRedeemableCoins(subtotal = 0, userBalance = 0, settings = DEFAULT_SUPERCOIN_SETTINGS) {
  if (!settings.enabled) return 0
  const bal = Math.max(0, Number(userBalance) || 0)
  if (bal <= 0) return 0

  const sub = Math.max(0, Number(subtotal) || 0)
  if (sub <= 0) return 0

  const coinValue = settings.coinValueInRupees || 1
  const subtotalCoins = Math.floor(sub / coinValue)

  // Max % cap of subtotal (defaults to 100% so user can freely use their coins up to the full bill)
  const maxPercent = settings.maxRedeemPercentage && settings.maxRedeemPercentage > 0 ? settings.maxRedeemPercentage : 100
  const maxAllowedCoins = Math.floor((sub * maxPercent) / (100 * coinValue))
  const maxCap = settings.maxRedeemPerBooking || 10000

  return Math.min(bal, subtotalCoins, maxAllowedCoins, maxCap)
}

/**
 * Credit SuperCoins to a user's wallet
 */
export async function creditSuperCoins(db, { userId, coins, bookingId, serviceType, description }) {
  if (!userId || !coins || coins <= 0) return null
  const userRef = doc(db, 'profiles', userId)

  const transactionEntry = {
    id: `sc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'credit',
    coins: Number(coins),
    bookingId: String(bookingId || ''),
    serviceType: String(serviceType || 'general'),
    description: String(description || 'SuperCoins Earned'),
    createdAt: new Date().toISOString(),
  }

  try {
    await updateDoc(userRef, {
      superCoins: increment(Number(coins)),
      superCoinHistory: arrayUnion(transactionEntry),
      updatedAt: serverTimestamp(),
    })
    return transactionEntry
  } catch (err) {
    // If profiles/{userId} document doesn't have superCoins initialized yet, set with merge
    await setDoc(userRef, {
      superCoins: increment(Number(coins)),
      superCoinHistory: arrayUnion(transactionEntry),
      updatedAt: serverTimestamp(),
    }, { merge: true })
    return transactionEntry
  }
}

/**
 * Redeem SuperCoins from a user's wallet
 */
export async function redeemSuperCoins(db, { userId, coins, bookingId, serviceType, description }) {
  if (!userId || !coins || coins <= 0) return null
  const userRef = doc(db, 'profiles', userId)

  const transactionEntry = {
    id: `sc_deb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'debit',
    coins: Number(coins),
    bookingId: String(bookingId || ''),
    serviceType: String(serviceType || 'general'),
    description: String(description || 'SuperCoins Redeemed'),
    createdAt: new Date().toISOString(),
  }

  await updateDoc(userRef, {
    superCoins: increment(-Math.abs(Number(coins))),
    superCoinHistory: arrayUnion(transactionEntry),
    updatedAt: serverTimestamp(),
  })

  return transactionEntry
}
