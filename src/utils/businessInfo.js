import { doc, getDoc } from 'firebase/firestore'
import { DAYS, fetchBookingSettings, formatTimeWindow, normalizeBookingSettings } from './bookingSettings'

export const EMPTY_CONTACT_INFO = {
  whatsappNumber: '',
  address: '',
  hours: '',
  shopName: '',
  logoUrl: '',
}

export const EMPTY_FOOTER_INFO = {
  tagline: '',
  phones: [],
  email: '',
  socials: [],
}

export async function fetchBusinessInfo(db) {
  const [contactSnap, footerSnap, bookingSettings] = await Promise.all([
    getDoc(doc(db, 'settings', 'contactInfo')),
    getDoc(doc(db, 'settings', 'footerInfo')),
    fetchBookingSettings(db),
  ])

  const contact = contactSnap.exists() ? { ...EMPTY_CONTACT_INFO, ...contactSnap.data() } : EMPTY_CONTACT_INFO
  const footer = footerSnap.exists() ? { ...EMPTY_FOOTER_INFO, ...footerSnap.data() } : EMPTY_FOOTER_INFO
  const whatsappPhone = Array.isArray(footer.phones) ? footer.phones.find(phone => phone.isWhatsapp)?.number : ''

  return {
    contact,
    footer,
    bookingSettings,
    whatsappNumber: contact.whatsappNumber || whatsappPhone || '',
    hoursText: contact.hours || formatBusinessHours(bookingSettings),
  }
}

export function formatBusinessHours(settings) {
  const normalized = normalizeBookingSettings(settings)
  const openDays = DAYS.filter(day => normalized.weekly[day.key]?.open !== false)
  if (!openDays.length) return ''

  const windows = openDays
    .flatMap(day => normalized.weekly[day.key]?.windows || [])
    .map(formatTimeWindow)
    .filter(Boolean)
  const uniqueWindows = Array.from(new Set(windows))
  const dayLabel = openDays.length === 7 ? 'Open all week' : openDays.map(day => day.label.slice(0, 3)).join(', ')

  return uniqueWindows.length ? `${dayLabel}: ${uniqueWindows.join(', ')}` : dayLabel
}

export function buildGeneralWhatsAppMessage(shopName) {
  const name = shopName || 'Pet Grooming'
  return encodeURIComponent(`Hi ${name}, I am interested in booking a service for my pet. Could you help me with more details?`)
}
