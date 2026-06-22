export const WORKING_HOURS = ''

export const DEFAULT_FEATURES = [
  { icon: 'award', title: 'Expert Groomers', desc: 'Trained for all breeds & temperaments' },
  { icon: 'shield', title: 'Safe & Gentle', desc: 'Pet-friendly, toxin-free products only' },
  { icon: 'clock', title: 'Flexible Hours', desc: 'Availability is managed by the grooming team' },
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
