import { getDocs, getDocsFromCache, enableNetwork } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Executes getDocs with a timeout. If the network hangs (e.g. mobile zombie socket after sleep),
 * falls back to local IndexedDB cache immediately so the UI doesn't freeze with an infinite spinner.
 */
export async function safeGetDocs(queryRef, timeoutMs = 6000) {
  let timeoutId
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve('TIMEOUT'), timeoutMs)
  })

  try {
    const result = await Promise.race([getDocs(queryRef), timeoutPromise])
    clearTimeout(timeoutId)

    if (result === 'TIMEOUT') {
      console.warn('[Firestore] Network query took >6s, falling back to local cache...')
      // Attempt to load from offline cache
      try {
        const cachedSnap = await getDocsFromCache(queryRef)
        if (cachedSnap && !cachedSnap.empty) {
          // Re-enable network in background to reset zombie sockets
          enableNetwork(db).catch(() => {})
          return cachedSnap
        }
      } catch {
        // Cache read empty or failed; fall back to waiting for network
      }
      return await getDocs(queryRef)
    }

    return result
  } catch (err) {
    clearTimeout(timeoutId)
    // If network error occurred, try cache before failing
    try {
      const cachedSnap = await getDocsFromCache(queryRef)
      if (cachedSnap) return cachedSnap
    } catch {}
    throw err
  }
}

/**
 * Wraps any promise with a safety timeout so components never hang indefinitely on loading
 */
export async function withTimeout(promise, timeoutMs = 8000, fallback = null) {
  let timer
  const timeoutPromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      if (fallback !== null) resolve(fallback)
      else reject(new Error('TIMEOUT'))
    }, timeoutMs)
  })
  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timer)
  }
}

