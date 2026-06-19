export const DAYS_OPEN = 7
export const WORKING_HOURS = '9 AM - 9 PM'

export const DEFAULT_FEATURES = [
  { icon: 'award', title: 'Expert Groomers', desc: 'Trained for all breeds & temperaments' },
  { icon: 'shield', title: 'Safe & Gentle', desc: 'Pet-friendly, toxin-free products only' },
  { icon: 'clock', title: 'Open 7 Days', desc: '9 AM - 9 PM, every day of the week' },
]

export function normalizeFeature(feature, fallback) {
  const title = feature?.title || fallback.title
  const desc = feature?.desc || fallback.desc

  return {
    icon: feature?.icon || fallback.icon,
    title: title.replace(/Open\s+6\s+Days/i, 'Open 7 Days'),
    desc: desc.replace(/6\s+days?\s+a\s+week/i, '7 days a week'),
  }
}
