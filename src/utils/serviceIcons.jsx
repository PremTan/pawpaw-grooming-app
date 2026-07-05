import { Award, Bath, Bone, Brush, Cat, Clock, Crown, Dog, Droplets, Flower2, Gem, Heart, Package, PawPrint, Scissors, Shield, ShowerHead, Sparkles, Star, WandSparkles, Wind } from 'lucide-react'

export const SERVICE_ICON_OPTIONS = [
  { key: 'scissors', label: 'Scissors', Icon: Scissors },
  { key: 'bath', label: 'Bath', Icon: Bath },
  { key: 'shower', label: 'Shower', Icon: ShowerHead },
  { key: 'brush', label: 'Brush', Icon: Brush },
  { key: 'droplets', label: 'Droplets', Icon: Droplets },
  { key: 'wind', label: 'Blow Dry', Icon: Wind },
  { key: 'sparkles', label: 'Sparkles', Icon: Sparkles },
  { key: 'wand', label: 'Magic Wand', Icon: WandSparkles },
  { key: 'paw', label: 'Paw', Icon: PawPrint },
  { key: 'dog', label: 'Dog', Icon: Dog },
  { key: 'cat', label: 'Cat', Icon: Cat },
  { key: 'bone', label: 'Bone', Icon: Bone },
  { key: 'star', label: 'Star', Icon: Star },
  { key: 'heart', label: 'Heart', Icon: Heart },
  { key: 'flower', label: 'Flower', Icon: Flower2 },
  { key: 'gem', label: 'Gem', Icon: Gem },
  { key: 'crown', label: 'Crown', Icon: Crown },
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
