/**
 * Fast Cloudinary image optimizer.
 * Injects modern WebP/AVIF auto-format (f_auto), perceptual quality compression (q_auto),
 * and width capping (w_..., c_limit) to reduce image download size by 80-95%.
 */
export function optimizeCloudinary(url, width = 800) {
  if (!url || typeof url !== 'string') return url || ''
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url
  if (url.includes('/f_auto') || url.includes('/q_auto')) return url

  const params = `f_auto,q_auto${width ? `,w_${width},c_limit` : ''}`
  return url.replace('/upload/', `/upload/${params}/`)
}

