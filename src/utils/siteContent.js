export const DEFAULT_FEATURES = [
  { icon: 'award', title: 'Expert Groomers', desc: 'Trained for all breeds & temperaments' },
  { icon: 'shield', title: 'Safe & Gentle', desc: 'Pet-friendly, toxin-free products only' },
  { icon: 'clock', title: 'Open 6 Days', desc: '9 AM - 8:30 PM, 6 days of the week' },
  { icon: 'award', title: 'Premium Quality Products', desc: 'We use only the best for your furry friend' },
]

export function normalizeFeature(feature, fallback) {
  const title = feature?.title || fallback.title
  const desc = feature?.desc || fallback.desc

  return {
    icon: feature?.icon || fallback.icon,
    title,
    desc,
  }
}

