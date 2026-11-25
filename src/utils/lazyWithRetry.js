// src/utils/lazyWithRetry.js
import { lazy } from 'react'

/**
 * Lazy loads a component with automatic retry on chunk load failure.
 * Solves the common issue where dynamic imports fail due to network drops
 * or stale chunk hashes after a new production deployment.
 */
export function lazyWithRetry(componentImport, key = '') {
  return lazy(async () => {
    const storageKey = `chunk_retry_${key || 'generic'}`
    const hasRetried = typeof window !== 'undefined' && window.sessionStorage.getItem(storageKey) === 'true'

    try {
      const module = await componentImport()
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(storageKey)
      }
      return module
    } catch (error) {
      console.warn(`[lazyWithRetry] Chunk failed for ${key || 'component'}:`, error)

      // If we haven't retried yet in this session, reload the page to get the latest chunk hashes
      if (!hasRetried && typeof window !== 'undefined') {
        window.sessionStorage.setItem(storageKey, 'true')
        window.location.reload()
        return new Promise(() => {}) // Keep Suspense active until reload completes
      }

      // If already retried once and still failing, throw so ErrorBoundary handles it gracefully
      throw error
    }
  })
}
