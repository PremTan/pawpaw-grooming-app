// src/utils/homeCache.js
/**
 * High-performance client-side cache for Home screen data and images.
 * Implements Stale-While-Revalidate via localStorage to achieve instant (0ms) render.
 */

const CACHE_PREFIX = 'pawpaw_home_'

export function getHomeCache(key, fallback = null) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (parsed && parsed.data !== undefined) {
      return parsed.data
    }
    return fallback
  } catch {
    return fallback
  }
}

export function setHomeCache(key, data) {
  if (typeof window === 'undefined' || data === undefined) return
  try {
    const item = {
      data,
      savedAt: Date.now(),
    }
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item))
  } catch (err) {
    // If quota exceeded, silently continue without breaking the app
    console.warn('[homeCache] storage write failed:', err)
  }
}

export function clearHomeCache(key) {
  if (typeof window === 'undefined') return
  try {
    if (key) {
      localStorage.removeItem(CACHE_PREFIX + key)
    } else {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(k)
        }
      })
    }
  } catch {}
}

/**
 * Preload an image URL into browser cache as early as possible with high/low priority
 */
export function preloadImage(src, priority = 'low') {
  if (typeof window === 'undefined' || !src || typeof src !== 'string') return
  try {
    // Check if link preload already exists
    const existing = document.querySelector(`link[rel="preload"][href="${src}"]`)
    if (existing) return

    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = src
    if (priority === 'high') {
      link.setAttribute('fetchpriority', 'high')
    }
    document.head.appendChild(link)
  } catch {
    // Fallback: Image object
    try {
      const img = new Image()
      if (priority === 'high') {
        img.fetchPriority = 'high'
      }
      img.src = src
    } catch {}
  }
}

/**
 * Preload multiple images in the background when browser is idle
 */
export function prefetchImages(urls = []) {
  if (typeof window === 'undefined' || !Array.isArray(urls)) return

  const runner = () => {
    urls.filter(Boolean).slice(0, 8).forEach(url => {
      try {
        const img = new Image()
        img.decoding = 'async'
        img.src = url
      } catch {}
    })
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(runner, { timeout: 2000 })
  } else {
    setTimeout(runner, 400)
  }
}
