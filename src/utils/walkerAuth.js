// src/utils/walkerAuth.js
// Authentication, password hashing, and single-session utilities for Dog Walkers

const LOCAL_SESSION_KEY = 'pawpaw_walker_session_v2'

/**
 * Normalizes a phone number to 10 digits for consistent lookup.
 * e.g. "+91 98765-43210" -> "9876543210"
 */
export function normalizePhone(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(2)
  }
  return digits.slice(-10)
}

/**
 * Generates a random cryptographic salt hex string
 */
export function generateSalt() {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16)
    window.crypto.getRandomValues(bytes)
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * Generates a unique session or activation token
 */
export function generateUniqueToken() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }
  return 'tok_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36)
}

/**
 * Computes SHA-256 hash of (salt + password)
 */
export async function hashPassword(password = '', salt = '') {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${salt}:${password}:pawpaw_walker_secure`)

  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Fallback simple hash for older environments
  let hash = 0
  const str = `${salt}:${password}`
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16)
}

/**
 * Verifies if entered password matches stored hash with the salt
 */
export async function verifyPassword(password, storedHash, salt) {
  if (!password || !storedHash || !salt) return false
  const computed = await hashPassword(password, salt)
  return computed === storedHash
}

/**
 * Local session management
 */
export function getSavedWalkerSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.walkerId && parsed.sessionId) {
      return parsed
    }
  } catch {}
  return null
}

export function saveWalkerSession(session) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session))
    // Also save simple walker ID for backward compatibility
    if (session?.walkerId) {
      localStorage.setItem('pawpaw_walker_id', session.walkerId)
    }
  } catch {}
}

export function clearWalkerSession() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(LOCAL_SESSION_KEY)
    localStorage.removeItem('pawpaw_walker_id')
  } catch {}
}
