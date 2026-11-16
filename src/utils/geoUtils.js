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

/**
 * Calculates average walking pace (minutes per km).
 * Returns formatted string like "11'45\" /km" or "--'--\" /km" if distance is too small.
 */
export function calculatePace(distanceMeters = 0, elapsedSeconds = 0) {
  const km = Number(distanceMeters || 0) / 1000
  const secs = Number(elapsedSeconds || 0)
  if (km < 0.05 || secs < 15) {
    return { paceMinKm: 0, formatted: `--'--" /km` }
  }
  const paceSecondsPerKm = secs / km
  // Cap at realistic walking pace (e.g. 45 min/km max)
  if (paceSecondsPerKm > 2700) {
    return { paceMinKm: 45, formatted: `45'00" /km` }
  }
  const mins = Math.floor(paceSecondsPerKm / 60)
  const remainingSecs = Math.round(paceSecondsPerKm % 60)
  return {
    paceMinKm: +(paceSecondsPerKm / 60).toFixed(2),
    formatted: `${mins}'${String(remainingSecs).padStart(2, '0')}" /km`,
  }
}

/**
 * Calculates walking speed in km/h.
 * Can prefer live GPS speed if provided, falling back to average speed over duration.
 */
export function calculateSpeed(distanceMeters = 0, elapsedSeconds = 0, liveSpeedMps = null) {
  if (liveSpeedMps != null && liveSpeedMps > 0.2 && liveSpeedMps < 12) {
    const kmh = liveSpeedMps * 3.6
    return { speedKmH: +kmh.toFixed(1), formatted: `${kmh.toFixed(1)} km/h` }
  }
  const km = Number(distanceMeters || 0) / 1000
  const hours = Number(elapsedSeconds || 0) / 3600
  if (hours <= 0 || km <= 0.02) {
    return { speedKmH: 0, formatted: '0.0 km/h' }
  }
  const kmh = km / hours
  const safeKmh = Math.min(kmh, 15) // dog walking cap
  return { speedKmH: +safeKmh.toFixed(1), formatted: `${safeKmh.toFixed(1)} km/h` }
}

/**
 * Calculates estimated active calories burned by pet & walker during the walk.
 * Standard average ~50 kcal per km for moderate walking.
 */
export function calculateCalories(distanceMeters = 0, elapsedSeconds = 0) {
  const km = Number(distanceMeters || 0) / 1000
  const mins = Number(elapsedSeconds || 0) / 60
  // Blend distance (45 kcal/km) and duration (1.5 kcal/min base metabolism)
  const burned = Math.round(km * 45 + mins * 1.5)
  return burned > 0 ? burned : 0
}

/**
 * Returns human-readable label and color for GPS accuracy
 */
export function getGpsQuality(accuracyMeters) {
  if (accuracyMeters == null || isNaN(accuracyMeters)) {
    return { label: 'Detecting GPS', color: '#9ca3af' }
  }
  const m = Math.round(accuracyMeters)
  if (m <= 8) return { label: `Strong (±${m}m)`, color: '#22c55e' }
  if (m <= 18) return { label: `Good (±${m}m)`, color: '#16a34a' }
  if (m <= 35) return { label: `Moderate (±${m}m)`, color: '#eab308' }
  return { label: `Weak (±${m}m)`, color: '#f97316' }
}
