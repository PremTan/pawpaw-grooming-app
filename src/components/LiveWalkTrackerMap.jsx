// src/components/LiveWalkTrackerMap.jsx
import { useEffect, useRef, useState } from 'react'
import { loadLeaflet } from '../utils/leafletLoader'
import { MapPin, Navigation, Compass, ExternalLink, RefreshCw } from 'lucide-react'

export default function LiveWalkTrackerMap({
  pickupCoords,
  currentCoords,
  routeTrail = [],
  isLive = false,
  dogName = 'Dog',
  walkerName = 'Walker',
  height = '360px',
  interactive = true,
  showControls = true,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const pickupMarkerRef = useRef(null)
  const polylineRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [autoCenter, setAutoCenter] = useState(true)

  // Initialize Map
  useEffect(() => {
    let isMounted = true

    async function init() {
      const L = await loadLeaflet()
      if (!isMounted || !L || !containerRef.current) {
        if (isMounted && !L) setLoadError(true)
        setLoading(false)
        return
      }

      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      if (containerRef.current._leaflet_id) {
        containerRef.current._leaflet_id = null
      }

      const initialLat = currentCoords?.lat || pickupCoords?.lat || 18.4485
      const initialLng = currentCoords?.lng || pickupCoords?.lng || 73.8123

      const map = L.map(containerRef.current, {
        center: [initialLat, initialLng],
        zoom: 16,
        zoomControl: false,
        dragging: interactive,
        scrollWheelZoom: interactive,
        touchZoom: interactive,
        doubleClickZoom: interactive,
      })
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      if (showControls) {
        L.control.zoom({ position: 'bottomright' }).addTo(map)
      }

      // Add Pickup Marker if available
      if (pickupCoords?.lat && pickupCoords?.lng) {
        const pickupIcon = L.divIcon({
          className: 'pawpaw-pickup-marker',
          html: `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -100%);">
              <div style="background: #16a34a; color: #fff; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 999px; box-shadow: 0 4px 10px rgba(0,0,0,0.25); white-space: nowrap; margin-bottom: 3px; display: flex; align-items: center; gap: 4px;">
                <span>🏠 Pickup</span>
              </div>
              <div style="width: 14px; height: 14px; background: #16a34a; border: 2.5px solid #fff; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>
            </div>
          `,
          iconSize: [0, 0],
        })
        pickupMarkerRef.current = L.marker([pickupCoords.lat, pickupCoords.lng], { icon: pickupIcon })
          .addTo(map)
          .bindPopup(`<b>Pickup Location:</b> ${dogName}'s Home`)
      }

      // Add Current Walker Pin
      if (currentCoords?.lat && currentCoords?.lng) {
        const walkerIcon = L.divIcon({
          className: 'pawpaw-walker-live-marker',
          html: `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -50%);">
              <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(192, 136, 32, 0.25); animation: pawpaw-gps-pulse 2s infinite ease-out;"></div>
              <div style="position: relative; width: 34px; height: 34px; background: linear-gradient(135deg, #C08820 0%, #D49B2E 100%); border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 4px 12px rgba(192, 136, 32, 0.5); display: flex; align-items: center; justify-content: center; font-size: 16px;">
                🐾
              </div>
              <div style="margin-top: 4px; background: #221711; color: #FCFAF6; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 999px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap;">
                ${walkerName || 'Walker'}
              </div>
            </div>
          `,
          iconSize: [0, 0],
        })
        markerRef.current = L.marker([currentCoords.lat, currentCoords.lng], {
          icon: walkerIcon,
          zIndexOffset: 1000,
        })
          .addTo(map)
          .bindPopup(`<b>${walkerName}</b> is walking ${dogName}`)
      }

      // Add Polyline trail
      if (Array.isArray(routeTrail) && routeTrail.length > 0) {
        const latlngs = routeTrail
          .filter(p => p && p.lat && p.lng)
          .map(p => [p.lat, p.lng])

        if (latlngs.length > 0) {
          polylineRef.current = L.polyline(latlngs, {
            color: '#C08820',
            weight: 5,
            opacity: 0.85,
            smoothFactor: 1,
            lineJoin: 'round',
            lineCap: 'round',
          }).addTo(map)
        }
      }

      // Fit bounds if both pickup and walker or multiple trail points
      try {
        const boundsPoints = []
        if (pickupCoords?.lat && pickupCoords?.lng) boundsPoints.push([pickupCoords.lat, pickupCoords.lng])
        if (currentCoords?.lat && currentCoords?.lng) boundsPoints.push([currentCoords.lat, currentCoords.lng])
        if (Array.isArray(routeTrail)) {
          routeTrail.forEach(p => {
            if (p?.lat && p?.lng) boundsPoints.push([p.lat, p.lng])
          })
        }
        if (boundsPoints.length > 1) {
          map.fitBounds(boundsPoints, { padding: [50, 50], maxZoom: 17 })
        }
      } catch {}

      setLoading(false)
    }

    init()

    return () => {
      isMounted = false
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      if (containerRef.current?._leaflet_id) {
        containerRef.current._leaflet_id = null
      }
    }
  }, [interactive, showControls])

  // Update Walker Position smoothly
  useEffect(() => {
    if (!mapRef.current || !currentCoords?.lat || !currentCoords?.lng || !window.L) return

    const { lat, lng } = currentCoords
    const L = window.L

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    } else {
      const walkerIcon = L.divIcon({
        className: 'pawpaw-walker-live-marker',
        html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -50%);">
            <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(192, 136, 32, 0.25); animation: pawpaw-gps-pulse 2s infinite ease-out;"></div>
            <div style="position: relative; width: 34px; height: 34px; background: linear-gradient(135deg, #C08820 0%, #D49B2E 100%); border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 4px 12px rgba(192, 136, 32, 0.5); display: flex; align-items: center; justify-content: center; font-size: 16px;">
              🐾
            </div>
            <div style="margin-top: 4px; background: #221711; color: #FCFAF6; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 999px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap;">
              ${walkerName || 'Walker'}
            </div>
          </div>
        `,
        iconSize: [0, 0],
      })
      markerRef.current = L.marker([lat, lng], { icon: walkerIcon, zIndexOffset: 1000 }).addTo(mapRef.current)
    }

    if (autoCenter) {
      mapRef.current.panTo([lat, lng], { animate: true, duration: 1 })
    }
  }, [currentCoords?.lat, currentCoords?.lng, autoCenter, walkerName])

  // Update Route Trail Polyline
  useEffect(() => {
    if (!mapRef.current || !window.L) return
    const L = window.L

    const latlngs = (routeTrail || [])
      .filter(p => p && p.lat && p.lng)
      .map(p => [p.lat, p.lng])

    if (polylineRef.current) {
      polylineRef.current.setLatLngs(latlngs)
    } else if (latlngs.length > 0) {
      polylineRef.current = L.polyline(latlngs, {
        color: '#C08820',
        weight: 5,
        opacity: 0.85,
        smoothFactor: 1,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(mapRef.current)
    }
  }, [routeTrail])

  // Handle re-center click
  const handleRecenter = () => {
    if (!mapRef.current) return
    const target = currentCoords?.lat ? currentCoords : pickupCoords
    if (target?.lat && target?.lng) {
      mapRef.current.flyTo([target.lat, target.lng], 16, { duration: 1 })
      setAutoCenter(true)
    }
  }

  // Handle fit whole route
  const handleFitRoute = () => {
    if (!mapRef.current) return
    const points = []
    if (pickupCoords?.lat && pickupCoords?.lng) points.push([pickupCoords.lat, pickupCoords.lng])
    if (currentCoords?.lat && currentCoords?.lng) points.push([currentCoords.lat, currentCoords.lng])
    if (Array.isArray(routeTrail)) {
      routeTrail.forEach(p => {
        if (p?.lat && p?.lng) points.push([p.lat, p.lng])
      })
    }
    if (points.length > 0) {
      mapRef.current.fitBounds(points, { padding: [40, 40], maxZoom: 17 })
      setAutoCenter(false)
    }
  }

  const googleMapsUrl = currentCoords?.lat && currentCoords?.lng
    ? `https://www.google.com/maps?q=${currentCoords.lat},${currentCoords.lng}`
    : pickupCoords?.lat && pickupCoords?.lng
    ? `https://www.google.com/maps?q=${pickupCoords.lat},${pickupCoords.lng}`
    : ''

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: '16px', overflow: 'hidden', border: '1.5px solid var(--border)', background: 'var(--surface)', isolation: 'isolate', zIndex: 1 }}>
      {/* Map Canvas */}
      <div ref={containerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />

      {/* Loading Overlay */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(252, 250, 246, 0.85)', backdropFilter: 'blur(3px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', zIndex: 10 }}>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Loading Live Map...</span>
        </div>
      )}

      {/* Load Error Fallback */}
      {loadError && !loading && (
        <div style={{ position: 'absolute', inset: 0, background: 'var(--surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center', zIndex: 10 }}>
          <Compass size={32} color="var(--accent)" style={{ marginBottom: '8px' }} />
          <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600 }}>Interactive map could not be loaded.</p>
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ fontSize: '12px', padding: '8px 14px', textDecoration: 'none' }}
            >
              <ExternalLink size={13} /> Open in Google Maps ↗
            </a>
          )}
        </div>
      )}

      {/* Floating Status Pill (Top Left - Unobstructed) */}
      <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 10, maxWidth: 'calc(100% - 20px)' }}>
        {isLive ? (
          <div style={{ background: '#221711', color: '#fff', fontSize: '11px', fontWeight: 800, padding: '5px 12px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.15)', maxWidth: '100%', whiteSpace: 'nowrap' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', animation: 'pawpaw-gps-pulse 1.5s infinite', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>LIVE GPS · {dogName}</span>
          </div>
        ) : (
          <div style={{ background: 'var(--card)', color: 'var(--text)', fontSize: '11px', fontWeight: 700, padding: '5px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '5px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', border: '1px solid var(--border)', maxWidth: '100%', whiteSpace: 'nowrap' }}>
            <MapPin size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Walk Route · {dogName}</span>
          </div>
        )}
      </div>

      {/* Quick Action Floating Controls (Bottom Left - Prevents mobile overlap with status pill) */}
      {showControls && (
        <div style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 10, display: 'flex', gap: '5px', flexWrap: 'wrap', maxWidth: 'calc(100% - 70px)' }}>
          <button
            type="button"
            onClick={handleRecenter}
            title="Recenter on Walker"
            style={{
              background: autoCenter ? 'var(--accent)' : 'var(--card)',
              color: autoCenter ? '#fff' : 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '5px 9px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <Navigation size={11} /> Recenter
          </button>
          <button
            type="button"
            onClick={handleFitRoute}
            title="View full walk route"
            style={{
              background: 'var(--card)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '5px 9px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            Full Route
          </button>
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open location in Google Maps app"
              style={{
                background: 'var(--card)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '5px 9px',
                fontSize: '11px',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              <ExternalLink size={11} /> Maps ↗
            </a>
          )}
        </div>
      )}

      {/* Embedded CSS for pulsing animation and constrained leaflet layers */}
      <style>{`
        .leaflet-container {
          isolation: isolate;
          z-index: 1 !important;
        }
        .leaflet-pane {
          z-index: 2 !important;
        }
        .leaflet-top, .leaflet-bottom {
          z-index: 5 !important;
        }
        .leaflet-control {
          z-index: 5 !important;
        }
        @keyframes pawpaw-gps-pulse {
          0% {
            transform: scale(0.8);
            opacity: 0.9;
          }
          70% {
            transform: scale(2.2);
            opacity: 0;
          }
          100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
