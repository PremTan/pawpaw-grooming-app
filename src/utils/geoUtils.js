// src/utils/geoUtils.js
// Utility helpers for live GPS dog walk tracking and distance calculation

/**
 * Calculates distance between two latitude/longitude points in meters using Haversine formula.
 */
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0
  const R = 6371000 // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Calculates the total length of a path in meters.
 * @param {Array<{lat: number, lng: number}>} trail
 */
export function calculateTotalRouteDistance(trail = []) {
  if (!Array.isArray(trail) || trail.length < 2) return 0
  let total = 0
  for (let i = 1; i < trail.length; i++) {
    const p1 = trail[i - 1]
    const p2 = trail[i]
    if (p1 && p2 && p1.lat && p1.lng && p2.lat && p2.lng) {
      total += calculateDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng)
    }
  }
  return total
}

/**
 * Formats distance in meters into human-readable string (m or km)
 */
export function formatDistance(meters = 0) {
  const m = Number(meters || 0)
  if (m < 1000) {
    return `${Math.round(m)} m`
  }
  return `${(m / 1000).toFixed(2)} km`
}

/**
 * Formats duration in seconds into MM:SS format
 */
export function formatDurationMMSS(seconds = 0) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/**
 * Formats duration in seconds into human-readable string (e.g. 24m 10s)
 */
export function formatDurationHuman(seconds = 0) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const mins = Math.floor(s / 60)
  const secs = s % 60
  if (mins === 0) return `${secs}s`
  if (secs === 0) return `${mins}m`
  return `${mins}m ${secs}s`
}
