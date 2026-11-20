// src/utils/commonSettings.js
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'

export const DEFAULT_COMMON_SETTINGS = {
  holidays: [],
  holidayLabels: {},
  allowCustomerInvoiceDownload: false,
  emergencyClosure: false,
  emergencyNotice: '',
  closureStartDate: '',
  reopenDate: '',
  servicesActive: {
    grooming: true,
    walking: true,
    boarding: true,
  },
}

let cachedCommonSettings = null
let cachedCommonSettingsTime = 0
const CACHE_TTL_MS = 60 * 1000

export function clearCommonSettingsCache() {
  cachedCommonSettings = null
  cachedCommonSettingsTime = 0
}

export function normalizeCommonSettings(data = {}) {
  const holidays = Array.isArray(data.holidays)
    ? Array.from(new Set(data.holidays.map(d => String(d || '').trim()).filter(Boolean))).sort()
    : []

  const holidayLabels = typeof data.holidayLabels === 'object' && data.holidayLabels !== null
    ? { ...data.holidayLabels }
    : {}

  const today = new Date().toISOString().slice(0, 10)
  const closureStartDate = String(data.closureStartDate || '').trim()
  const reopenDate = String(data.reopenDate || data.closureEndDate || '').trim()
  let emergencyClosure = Boolean(data.emergencyClosure)

  // Auto-expire closure if expected reopen date has arrived or passed
  if (emergencyClosure && reopenDate && today >= reopenDate) {
    emergencyClosure = false
  }

  return {
    holidays,
    holidayLabels,
    allowCustomerInvoiceDownload: Boolean(data.allowCustomerInvoiceDownload),
    emergencyClosure,
    emergencyNotice: String(data.emergencyNotice || '').trim(),
    closureStartDate,
    reopenDate,
    servicesActive: {
      grooming: data.servicesActive?.grooming !== false,
      walking: data.servicesActive?.walking !== false,
      boarding: data.servicesActive?.boarding !== false,
    },
  }
}

export async function fetchCommonSettings(db, forceRefresh = false) {
  const now = Date.now()
  if (!forceRefresh && cachedCommonSettings && (now - cachedCommonSettingsTime < CACHE_TTL_MS)) {
    return cachedCommonSettings
  }

  try {
    const snap = await getDoc(doc(db, 'settings', 'commonSettings'))
    if (snap.exists()) {
      const raw = snap.data() || {}
      const today = new Date().toISOString().slice(0, 10)
      const reopenDate = String(raw.reopenDate || raw.closureEndDate || '').trim()

      // If reopen date has passed, auto-sync back to Firestore so state is permanently inactive
      if (raw.emergencyClosure && reopenDate && today >= reopenDate) {
        setDoc(doc(db, 'settings', 'commonSettings'), {
          emergencyClosure: false,
          autoReopenedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true }).catch(() => {})
      }

      const normalized = normalizeCommonSettings(raw)
      cachedCommonSettings = normalized
      cachedCommonSettingsTime = now
      return normalized
    }

    // Fallback migration: If commonSettings not yet created, import existing holidays and invoice download toggle from bookingSettings
    try {
      const legacySnap = await getDoc(doc(db, 'settings', 'bookingSettings'))
      const legacyData = legacySnap.exists() ? (legacySnap.data() || {}) : {}
      const fallback = normalizeCommonSettings({
        holidays: Array.isArray(legacyData.holidays) ? legacyData.holidays : [],
        allowCustomerInvoiceDownload: Boolean(legacyData.allowCustomerInvoiceDownload),
      })
      cachedCommonSettings = fallback
      cachedCommonSettingsTime = now
      return fallback
    } catch {
      const fallback = normalizeCommonSettings({})
      cachedCommonSettings = fallback
      cachedCommonSettingsTime = now
      return fallback
    }
  } catch (err) {
    console.warn('[commonSettings] Failed to fetch common settings:', err)
    return normalizeCommonSettings({})
  }
}

export async function saveCommonSettings(db, settings) {
  const normalized = normalizeCommonSettings(settings)
  const payload = {
    ...normalized,
    updatedAt: serverTimestamp(),
  }

  await Promise.all([
    setDoc(doc(db, 'settings', 'commonSettings'), payload, { merge: true }),
    setDoc(doc(db, 'settings', 'bookingSettings'), {
      allowCustomerInvoiceDownload: normalized.allowCustomerInvoiceDownload,
      holidays: normalized.holidays,
      updatedAt: serverTimestamp(),
    }, { merge: true }),
  ])

  cachedCommonSettings = normalized
  cachedCommonSettingsTime = Date.now()

  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('pawpaw_cached_booking_settings')
      localStorage.removeItem('pawpaw_cached_walking_settings')
      localStorage.removeItem('pawpaw_cached_boarding_settings')
    } catch {}
  }

  return normalized
}

export function isCommonHoliday(commonSettings, dateString) {
  if (!dateString || !commonSettings) return false
  const holidays = Array.isArray(commonSettings.holidays) ? commonSettings.holidays : []
  return holidays.includes(dateString)
}

export function getHolidayReason(commonSettings, dateString) {
  if (!dateString || !commonSettings) return ''
  return commonSettings.holidayLabels?.[dateString] || 'Holiday'
}

/**
 * Checks whether emergency center closure is currently effective for the given date (or today).
 * Takes into account optional closureStartDate and auto-expiration on reopenDate.
 */
export function isEmergencyClosureActive(commonSettings, targetDateString = null) {
  if (!commonSettings || !commonSettings.emergencyClosure) return false
  const today = new Date().toISOString().slice(0, 10)
  const checkDate = targetDateString || today

  // If reopen date has already passed today, the entire closure is auto-expired
  const reopenDate = String(commonSettings.reopenDate || commonSettings.closureEndDate || '').trim()
  if (reopenDate && today >= reopenDate) {
    return false
  }

  // If checking a future date against reopenDate
  if (reopenDate && checkDate >= reopenDate) {
    return false
  }

  // If a future closure start date is set and checkDate is before it
  const startDate = String(commonSettings.closureStartDate || '').trim()
  if (startDate && checkDate < startDate) {
    return false
  }

  return true
}

/**
 * Checks if a specific appointment date falls within the emergency closure window.
 */
export function isDateWithinClosure(commonSettings, dateString) {
  return isEmergencyClosureActive(commonSettings, dateString)
}

