import { doc, getDoc } from 'firebase/firestore'

export const DAYS = [
  { key: 'sun', label: 'Sunday' },
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
]

export const VISIT_MODES = [
  { value: 'center', label: 'At center' },
  { value: 'home', label: 'At home' },
  { value: 'hybrid', label: 'Hybrid' },
]

export const DEFAULT_TIME_WINDOWS = [{ start: '09:00', end: '18:00', mode: 'center' }]
export const DURATION_OPTIONS = [15, 30, 45, 60, 120, 180]

export const DEFAULT_BOOKING_SETTINGS = {
  appointmentDuration: 30,
  slotCapacity: 1,
  fixedVisitCharges: false,
  homeVisitCharge: '',
  centerVisitCharge: '',
  paymentMode: 'cash',
  weekly: DAYS.reduce((acc, day) => ({
    ...acc,
    [day.key]: {
      open: true,
      windows: DEFAULT_TIME_WINDOWS,
    },
  }), {}),
  holidays: [],
}

const pad = (value) => String(value).padStart(2, '0')

export function minutesFromTime(value) {
  const [h, m] = String(value || '').split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

export function labelFromMinutes(total) {
  const h24 = Math.floor(total / 60)
  const mins = total % 60
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  return `${pad(h12)}:${pad(mins)} ${suffix}`
}

function timeFromSlotLabel(label) {
  const match = String(label || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return ''
  let hour = Number(match[1])
  const mins = Number(match[2])
  const suffix = match[3].toUpperCase()
  if (suffix === 'PM' && hour !== 12) hour += 12
  if (suffix === 'AM' && hour === 12) hour = 0
  return `${pad(hour)}:${pad(mins)}`
}

export function normalizeSlots(value, fallback = []) {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean)
  const slots = String(value || '')
    .split(/[\n,]+/)
    .map(v => v.trim())
    .filter(Boolean)
  return slots.length ? slots : fallback
}

function normalizeWindows(saved, legacyDay) {
  if (Array.isArray(saved) && saved.length) {
    return saved.slice(0, 4).map(window => ({
      start: window.start || '09:00',
      end: window.end || '18:00',
      mode: ['center', 'home', 'hybrid'].includes(window.mode) ? window.mode : 'center',
    }))
  }

  const legacyStore = normalizeSlots(legacyDay?.storeSlots, [])
  const legacyHome = normalizeSlots(legacyDay?.homeSlots, [])
  if (legacyStore.length || legacyHome.length) {
    const first = timeFromSlotLabel(legacyStore[0] || legacyHome[0]) || '09:00'
    const last = timeFromSlotLabel(legacyStore.at(-1) || legacyHome.at(-1)) || '18:00'
    return [{ start: first, end: last, mode: legacyStore.length && legacyHome.length ? 'hybrid' : legacyHome.length ? 'home' : 'center' }]
  }

  return DEFAULT_TIME_WINDOWS
}

export function normalizeBookingSettings(data = {}) {
  const weekly = {}
  DAYS.forEach(day => {
    const saved = data.weekly?.[day.key] || {}
    weekly[day.key] = {
      open: saved.open !== false,
      windows: normalizeWindows(saved.windows, saved),
    }
  })
  return {
    appointmentDuration: Number(data.appointmentDuration || 30),
    slotCapacity: Math.max(1, Number(data.slotCapacity || 1)),
    fixedVisitCharges: data.fixedVisitCharges === true,
    homeVisitCharge: data.homeVisitCharge ?? '',
    centerVisitCharge: data.centerVisitCharge ?? '',
    paymentMode: ['prepaid', 'cash', 'both'].includes(data.paymentMode) ? data.paymentMode : 'cash',
    weekly,
    holidays: Array.isArray(data.holidays) ? data.holidays.filter(Boolean) : [],
  }
}

export async function fetchBookingSettings(db) {
  try {
    const snap = await getDoc(doc(db, 'settings', 'bookingSettings'))
    return normalizeBookingSettings(snap.exists() ? snap.data() : {})
  } catch {
    return normalizeBookingSettings({})
  }
}

export function dayKeyFromDate(dateString) {
  if (!dateString) return ''
  const date = new Date(`${dateString}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return DAYS[date.getDay()]?.key || ''
}

function buildSlotsForMode(windows, duration, targetMode) {
  const slots = []
  windows.forEach(window => {
    if (window.mode !== targetMode && window.mode !== 'hybrid') return
    const start = minutesFromTime(window.start)
    const end = minutesFromTime(window.end)
    if (start === null || end === null || end <= start) return
    for (let value = start; value < end; value += duration) {
      slots.push(labelFromMinutes(value))
    }
  })
  return Array.from(new Set(slots))
}

export function getAvailabilityForDate(settings, dateString) {
  const normalized = normalizeBookingSettings(settings)
  if (!dateString || normalized.holidays.includes(dateString)) {
    return { open: false, storeSlots: [], homeSlots: [], reasons: ['Holiday'] }
  }
  const day = normalized.weekly[dayKeyFromDate(dateString)]
  if (!day || day.open === false) {
    return { open: false, storeSlots: [], homeSlots: [], reasons: ['Closed'] }
  }
  return {
    open: true,
    storeSlots: buildSlotsForMode(day.windows, normalized.appointmentDuration, 'center'),
    homeSlots: buildSlotsForMode(day.windows, normalized.appointmentDuration, 'home'),
    reasons: [],
  }
}

export function getBookingTypeLabel(type) {
  if (type === 'home') return 'Home Visit'
  return 'In Store'
}


export function formatTimeWindow(window) {
  const start = minutesFromTime(window.start)
  const end = minutesFromTime(window.end)
  if (start === null || end === null) return ''
  const mode = VISIT_MODES.find(item => item.value === window.mode)?.label || 'At center'
  return labelFromMinutes(start) + ' - ' + labelFromMinutes(end) + ' (' + mode + ')'
}

export function getWorkingStatus(settings, now = new Date()) {
  const normalized = normalizeBookingSettings(settings)
  const key = dateKeyLocal(now)
  const dayKey = DAYS[now.getDay()]?.key || ''
  const day = normalized.weekly[dayKey]

  if (!day || normalized.holidays.includes(key) || day.open === false) {
    return { open: false, label: 'Closed', detail: normalized.holidays.includes(key) ? 'Holiday today' : 'Closed today', windows: [] }
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const storeWindows = day.windows.filter(window => window.mode === 'center' || window.mode === 'hybrid')
  const openNow = storeWindows.some(window => {
    const start = minutesFromTime(window.start)
    const end = minutesFromTime(window.end)
    return start !== null && end !== null && currentMinutes >= start && currentMinutes < end
  })

  return {
    open: openNow,
    label: openNow ? 'Open now' : 'Closed now',
    detail: storeWindows.length ? storeWindows.map(formatTimeWindow).join(', ') : 'No center hours today',
    windows: day.windows.map(formatTimeWindow).filter(Boolean),
  }
}

function dateKeyLocal(date) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}
