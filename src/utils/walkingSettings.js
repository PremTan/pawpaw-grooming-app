// src/utils/walkingSettings.js
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'

export const DEFAULT_WALKING_SLOTS = [
  // Morning shift
  '06:30 AM',
  '07:15 AM',
  '08:00 AM',
  '08:45 AM',
  '09:30 AM',
  // Evening shift
  '05:00 PM',
  '05:45 PM',
  '06:30 PM',
  '07:15 PM',
  '08:00 PM',
]

export const DEFAULT_WALKING_DAYS = {
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: true,
  sunday: true,
}

export const DEFAULT_SERVICEABLE_AREAS = [
  'Dhayari',
  'DSK Vishwa',
  'Benkar Vasti',
  'Narhe',
  'Ambegaon Budruk',
  'Vadgaon Budruk',
  'Sinhagad Road (Dhayari Phata to Toll Plaza)',
]

export const DEFAULT_WALKING_SETTINGS = {
  active: true,
  acceptBookings: true,
  showNewBadge: true,
  rate30Min: 199,
  rate45Min: 279,
  rate60Min: 349,
  maxCapacityPerSlot: 2, // Max dogs scheduled concurrently in the same slot
  operatingDays: DEFAULT_WALKING_DAYS,
  slots: DEFAULT_WALKING_SLOTS,
  serviceableAreas: DEFAULT_SERVICEABLE_AREAS,
  bannerImageUrl: '',
  description: 'Daily walks, exercise, sniffing adventures, and happy tails for your dog.',
  guidelines: [
    'Solo or small-group walks managed by verified dog handlers.',
    'Leashed at all times with real-time GPS tracking and route safety.',
    'Fresh water break and paw wipe after every walking session.',
    'Live WhatsApp walk updates with photo & route summary upon completion.',
  ],
}

export const WALKING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

export const WALKING_STATUS_LABELS = {
  pending: 'Pending Confirmation',
  confirmed: 'Confirmed',
  in_progress: 'Walk In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const WALKING_STATUS_BADGES = {
  pending: 'badge-pending',
  confirmed: 'badge-confirmed',
  in_progress: 'badge-confirmed',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
}

export async function fetchWalkingSettings(db) {
  try {
    const snap = await getDoc(doc(db, 'settings', 'walkingSettings'))
    if (!snap.exists()) return DEFAULT_WALKING_SETTINGS
    const data = snap.data() || {}
    return {
      active: data.active !== false && data.acceptBookings !== false,
      acceptBookings: data.acceptBookings !== false,
      showNewBadge: data.showNewBadge !== false,
      rate30Min: Number(data.rate30Min) || DEFAULT_WALKING_SETTINGS.rate30Min,
      rate45Min: Number(data.rate45Min) || DEFAULT_WALKING_SETTINGS.rate45Min,
      rate60Min: Number(data.rate60Min) || DEFAULT_WALKING_SETTINGS.rate60Min,
      maxCapacityPerSlot: Math.max(1, Number(data.maxCapacityPerSlot) || DEFAULT_WALKING_SETTINGS.maxCapacityPerSlot),
      operatingDays: { ...DEFAULT_WALKING_DAYS, ...(data.operatingDays || {}) },
      slots: Array.isArray(data.slots) && data.slots.length ? data.slots : DEFAULT_WALKING_SLOTS,
      serviceableAreas: Array.isArray(data.serviceableAreas) && data.serviceableAreas.length ? data.serviceableAreas : DEFAULT_SERVICEABLE_AREAS,
      bannerImageUrl: String(data.bannerImageUrl || '').trim(),
      description: data.description || DEFAULT_WALKING_SETTINGS.description,
      guidelines: Array.isArray(data.guidelines) && data.guidelines.length ? data.guidelines : DEFAULT_WALKING_SETTINGS.guidelines,
    }
  } catch (err) {
    console.warn('[walkingSettings] fetch failed, using defaults:', err)
    return DEFAULT_WALKING_SETTINGS
  }
}

export async function saveWalkingSettings(db, patch = {}) {
  await setDoc(doc(db, 'settings', 'walkingSettings'), {
    ...patch,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export function isWalkingDayOpen(settings, dateString) {
  if (!dateString || !settings?.operatingDays) return true
  try {
    const d = new Date(`${dateString}T00:00:00`)
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
    return settings.operatingDays[dayName] !== false
  } catch {
    return true
  }
}

export function parseSlotTimeToMinutes(slotStr) {
  if (!slotStr) return 0
  const match = String(slotStr).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return 0
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const meridian = match[3].toUpperCase()
  if (meridian === 'PM' && hours < 12) hours += 12
  if (meridian === 'AM' && hours === 12) hours = 0
  return hours * 60 + minutes
}

export function buildWalkingWhatsAppMessage(booking, shopName = 'Paw Paw Pet Grooming') {
  const dogName = booking.dogName || booking.petName || 'Dog'
  const breed = booking.breed || booking.petBreed ? ` (${booking.breed || booking.petBreed})` : ''
  const duration = booking.duration ? `${booking.duration} Minutes` : '30 Minutes'
  const dateStr = booking.date || '-'
  const slotStr = booking.customTimeRequested || booking.slot || '-'
  const address = booking.pickupAddress || booking.address || '-'
  const price = booking.totalPrice ? `Rs ${booking.totalPrice}` : 'As confirmed'
  const idShort = (booking.id || '').slice(0, 8).toUpperCase()

  return encodeURIComponent(
    `*Pet Walking Request - ${shopName}*\n\n` +
    `*Owner:* ${booking.ownerName || '-'}\n` +
    `*Phone:* ${booking.phone || '-'}\n` +
    `*Dog:* ${dogName}${breed}\n` +
    `*Duration:* ${duration}\n` +
    `*Date:* ${dateStr}\n` +
    `*Time:* ${slotStr}\n` +
    `*Pick-up Address:* ${address}\n` +
    `*Area:* ${booking.area || 'Dhayari'}\n` +
    `*Total Rate:* ${price}\n` +
    (booking.notes ? `*Walker Notes:* ${booking.notes}\n` : '') +
    (booking.emergencyContact ? `*Emergency Contact:* ${booking.emergencyContact}\n` : '') +
    `\n_Walking Request ID: #${idShort}_`
  )
}

