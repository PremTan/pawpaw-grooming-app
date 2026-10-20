// src/utils/boardingSettings.js
import { doc, getDoc } from 'firebase/firestore'

export const BOARDING_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CHECKED_IN: 'checked_in',
  CHECKED_OUT: 'checked_out',
  CANCELLED: 'cancelled',
}

export const DEFAULT_BOARDING_SETTINGS = {
  dogDailyRate: 800,
  catDailyRate: 600,
  otherDailyRate: 500,
  checkInTimeDefault: '10:00 AM',
  checkOutTimeDefault: '12:00 PM',
  maxDogCapacity: 10,
  maxCatCapacity: 6,
  emergencyContactRequired: true,
  dailyWalkingCountDefault: 2,
  showNewBadge: true,
  acceptBookings: true,
  active: true,
}

export const TIME_SLOT_OPTIONS = [
  '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
  '06:00 PM', '07:00 PM', '08:00 PM',
]

export const FOOD_TYPES = [
  { id: 'packaged', label: 'Packaged Pet Food (Kibble/Wet)' },
  { id: 'home', label: 'Fresh Home-cooked Food' },
  { id: 'mixed', label: 'Mixed (Kibble + Fresh Food)' },
  { id: 'special', label: 'Prescription / Special Diet' },
]

export const FOOD_PROVIDERS = [
  { id: 'owner', label: 'Owner will provide pet food' },
  { id: 'pawpaw', label: 'Hostel will provide pet food' },
]

export const FEEDING_FREQUENCIES = [
  'Once a day',
  'Twice a day (Morning & Evening)',
  '3 times a day (Morning, Afternoon & Night)',
  'Custom schedule',
]

export const WALKING_FREQUENCIES = [
  '1 walk per day',
  '2 walks per day (Standard)',
  '3 walks per day',
  'Indoor play only / No outdoor walks',
]

export function normalizeBoardingSettings(data = {}) {
  return {
    dogDailyRate: Math.max(100, Number(data.dogDailyRate || DEFAULT_BOARDING_SETTINGS.dogDailyRate)),
    catDailyRate: Math.max(100, Number(data.catDailyRate || DEFAULT_BOARDING_SETTINGS.catDailyRate)),
    otherDailyRate: Math.max(100, Number(data.otherDailyRate || DEFAULT_BOARDING_SETTINGS.otherDailyRate)),
    checkInTimeDefault: data.checkInTimeDefault || DEFAULT_BOARDING_SETTINGS.checkInTimeDefault,
    checkOutTimeDefault: data.checkOutTimeDefault || DEFAULT_BOARDING_SETTINGS.checkOutTimeDefault,
    maxDogCapacity: Math.max(1, Number(data.maxDogCapacity || DEFAULT_BOARDING_SETTINGS.maxDogCapacity)),
    maxCatCapacity: Math.max(1, Number(data.maxCatCapacity || DEFAULT_BOARDING_SETTINGS.maxCatCapacity)),
    emergencyContactRequired: data.emergencyContactRequired !== false,
    showNewBadge: data.showNewBadge !== false,
    acceptBookings: data.acceptBookings !== false,
    active: data.active !== false && data.acceptBookings !== false,
  }
}

export async function fetchBoardingSettings(db) {
  try {
    const snap = await getDoc(doc(db, 'settings', 'boardingSettings'))
    return normalizeBoardingSettings(snap.exists() ? snap.data() : {})
  } catch {
    return normalizeBoardingSettings({})
  }
}

/**
 * Calculates boarding stay duration and estimated pricing.
 * Charging rule:
 * 1. Base duration is calculated as the difference in calendar days between check-in and check-out.
 * 2. Minimum duration is 1 day.
 * 3. Daily rate is ₹800 for Dog, ₹600 for Cat, and ₹500 for other pets by default.
 * 4. Duration is clearly reported as days and overnight nights.
 */
export function calculateBoardingStay(checkInDate, checkInTime, checkOutDate, checkOutTime, petType = 'Dog', settings = null) {
  const config = normalizeBoardingSettings(settings || {})

  const rate = petType === 'Cat'
    ? config.catDailyRate
    : petType === 'Dog'
      ? config.dogDailyRate
      : config.otherDailyRate

  if (!checkInDate || !checkOutDate) {
    return {
      valid: false,
      error: 'Please select both check-in and check-out dates.',
      days: 0,
      nights: 0,
      dailyRate: rate,
      estimatedTotal: 0,
    }
  }

  const inDate = new Date(`${checkInDate}T00:00:00`)
  const outDate = new Date(`${checkOutDate}T00:00:00`)

  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) {
    return {
      valid: false,
      error: 'Invalid dates selected.',
      days: 0,
      nights: 0,
      dailyRate: rate,
      estimatedTotal: 0,
    }
  }

  const diffMs = outDate.getTime() - inDate.getTime()
  const rawDiffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (rawDiffDays < 0) {
    return {
      valid: false,
      error: 'Check-out date must be on or after check-in date.',
      days: 0,
      nights: 0,
      dailyRate: rate,
      estimatedTotal: 0,
    }
  }

  // Same day boarding is 1 day, 0 nights. Otherwise nights = rawDiffDays, days = rawDiffDays
  const days = Math.max(1, rawDiffDays)
  const nights = rawDiffDays
  const estimatedTotal = days * rate

  return {
    valid: true,
    error: '',
    days,
    nights,
    dailyRate: rate,
    estimatedTotal,
    inDateFormatted: inDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    outDateFormatted: outDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
  }
}

export function buildBoardingWhatsAppMessage(booking, shopName = 'Paw Paw Pet Grooming') {
  const petName = booking.petName || 'Pet'
  const petType = booking.petType || 'Dog'
  const breed = booking.petBreed ? ` (${booking.petBreed})` : ''
  const inStr = `${booking.checkInDate || '-'} at ${booking.checkInTime || '-'}`
  const outStr = `${booking.checkOutDate || '-'} at ${booking.checkOutTime || '-'}`
  const idShort = (booking.id || '').slice(0, 8).toUpperCase()

  const foodDetail = booking.specialFoodRequired
    ? `Regular Food (Included) + Special Food (Provider: ${booking.specialFoodProvider === 'pawpaw' ? 'Paw Paw' : 'Owner'})`
    : (booking.regularFoodIncluded ? 'Regular Food (Included - Paw Paw)' : (booking.foodType || 'Standard'))

  return encodeURIComponent(
    `*New Pet Boarding Request - ${shopName}*\n\n` +
    `*Owner:* ${booking.ownerName || '-'}\n` +
    `*Phone:* ${booking.phone || '-'}\n` +
    `*Pet:* ${petName} - ${petType}${breed}\n` +
    `*Check-In:* ${inStr}\n` +
    `*Check-Out:* ${outStr}\n` +
    `*Duration:* ${booking.stayDays || 1} Day(s) (${booking.stayNights || 0} Night(s))\n` +
    `*Estimated Total:* Rs ${booking.estimatedTotal || 0}\n` +
    (Number(booking.specialFoodCharge || 0) > 0 ? `*Special Food Charge:* Rs ${booking.specialFoodCharge}\n` : '') +
    `*Food:* ${foodDetail}\n` +
    (booking.feedingSchedule ? `*Feeding Schedule:* ${booking.feedingSchedule}\n` : '') +
    (booking.foodAllergies || booking.allergies ? `*Allergies:* ${booking.foodAllergies || booking.allergies}\n` : '') +
    (booking.emergencyContactPhone ? `*Emergency Contact:* ${booking.emergencyContactName || ''} - ${booking.emergencyContactPhone}\n` : '') +
    (booking.specialDietInstructions ? `*Diet Notes:* ${booking.specialDietInstructions}\n` : '') +
    (booking.additionalInstructions ? `*Instructions:* ${booking.additionalInstructions}\n` : '') +
    `\n_Boarding Request ID: #${idShort}_`
  )
}
