import { Award, Bath, Clock, Heart, Package, PawPrint, Scissors, Shield, Sparkles, Star } from 'lucide-react'

export const SERVICE_ICON_OPTIONS = [
  { key: 'scissors', label: 'Scissors', Icon: Scissors },
  { key: 'bath', label: 'Bath', Icon: Bath },
  { key: 'sparkles', label: 'Sparkles', Icon: Sparkles },
  { key: 'paw', label: 'Paw', Icon: PawPrint },
  { key: 'star', label: 'Star', Icon: Star },
  { key: 'heart', label: 'Heart', Icon: Heart },
  { key: 'shield', label: 'Shield', Icon: Shield },
  { key: 'clock', label: 'Clock', Icon: Clock },
  { key: 'award', label: 'Award', Icon: Award },
  { key: 'package', label: 'Package', Icon: Package },
]

export const SERVICE_ICON_BY_KEY = SERVICE_ICON_OPTIONS.reduce((acc, option) => {
  acc[option.key] = option
  return acc
}, {})

export function defaultServiceIconKey(serviceId) {
  const defaults = {
    haircut: 'scissors',
    spa_bath: 'bath',
    hairstyle: 'sparkles',
    nail_cutting: 'paw',
    full_grooming: 'star',
    teeth_cleaning: 'sparkles',
    ear_cleaning: 'shield',
    de_shedding: 'paw',
  }
  return defaults[serviceId] || 'paw'
}

export function renderServiceIcon(iconKey, fallback, size = 28) {
  const option = SERVICE_ICON_BY_KEY[iconKey]
  if (option) {
    const Icon = option.Icon
    return <Icon size={size} strokeWidth={2.2} />
  }
  return fallback || <PawPrint size={size} strokeWidth={2.2} />
}
