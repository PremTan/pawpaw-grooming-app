import { SERVICES } from './services'
import { defaultServiceIconKey } from './serviceIcons.jsx'

export function buildServiceCatalog(details = {}, { includeInactive = false } = {}) {
  const savedById = details || {}
  const baseIds = new Set(SERVICES.map(service => service.id))

  const builtInServices = SERVICES.map(service => {
    const saved = savedById[service.id] || {}
    return {
      ...service,
      ...saved,
      id: service.id,
      custom: false,
      name: saved.name || service.name,
      description: saved.description || service.description,
      summary: saved.summary || saved.description || service.description,
      price: saved.price || service.price,
      duration: saved.duration || service.duration,
      iconImageUrl: saved.iconImageUrl || service.image || '',
      iconKey: saved.iconKey || defaultServiceIconKey(service.id),
      active: saved.active !== false,
      images: Array.isArray(saved.images) ? saved.images : [],
    }
  })

  const customServices = Object.values(savedById)
    .filter(service => service?.id && !baseIds.has(service.id))
    .map((service, index) => ({
      id: service.id,
      custom: true,
      name: service.name || 'Untitled Service',
      description: service.description || service.summary || '',
      summary: service.summary || service.description || '',
      price: service.price || 'Price TBD',
      duration: service.duration || '',
      basePrice: Number(service.basePrice || 0),
      color: service.color || SERVICES[index % SERVICES.length]?.color || '#D4AF37',
      image: service.iconImageUrl || '',
      iconImageUrl: service.iconImageUrl || '',
      iconKey: service.iconKey || defaultServiceIconKey(service.id),
      active: service.active !== false,
      images: Array.isArray(service.images) ? service.images : [],
    }))

  const services = [...builtInServices, ...customServices]
  return includeInactive ? services : services.filter(service => service.active !== false)
}
