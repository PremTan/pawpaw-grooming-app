// src/utils/commonSettings.js
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'

export const DEFAULT_COMMON_SETTINGS = {
  holidays: [],
  holidayLabels: {},
  allowCustomerInvoiceDownload: false,
  emergencyClosure: false,
  emergencyNotice: '',
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

  return {
    holidays,
    holidayLabels,
    allowCustomerInvoiceDownload: Boolean(data.allowCustomerInvoiceDownload),
    emergencyClosure: Boolean(data.emergencyClosure),
    emergencyNotice: String(data.emergencyNotice || '').trim(),
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
      const normalized = normalizeCommonSettings(snap.data())
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

