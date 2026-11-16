// src/components/LiveWalkModal.jsx
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import {
  X,
  Footprints,
  Clock,
  Phone,
  ShieldCheck,
  Calendar,
  MapPin,
  ExternalLink,
  CheckCircle,
  RefreshCw,
  Gauge,
  Zap,
  Flame,
} from 'lucide-react'
import LiveWalkTrackerMap from './LiveWalkTrackerMap'
import {
  formatDistance,
  formatDurationMMSS,
  formatDurationHuman,
  calculateTotalRouteDistance,
  calculatePace,
  calculateSpeed,
  calculateCalories,
  getGpsQuality,
} from '../utils/geoUtils'
import { WALKING_STATUS, WALKING_STATUS_LABELS } from '../utils/walkingSettings'

export default function LiveWalkModal({ bookingId, initialBooking, onClose }) {
  const [booking, setBooking] = useState(initialBooking || null)
  const [loading, setLoading] = useState(!initialBooking)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Real-time snapshot listener on this specific walking booking
  useEffect(() => {
    if (!bookingId) return

    const unsub = onSnapshot(
      doc(db, 'walkingBookings', bookingId),
      (snap) => {
        if (snap.exists()) {
          setBooking({ id: snap.id, ...snap.data() })
        }
        setLoading(false)
      },
      (err) => {
        console.warn('Live walk listener error:', err)
        setLoading(false)
      }
    )

    return () => unsub()
  }, [bookingId])

  // Timer calculation
  useEffect(() => {
    if (!booking) return
    const isLive = booking.status === WALKING_STATUS.IN_PROGRESS

    if (isLive) {
      const startMs = booking.walkStartedAt?.toMillis
        ? booking.walkStartedAt.toMillis()
        : booking.walkStartedAt?.seconds
        ? booking.walkStartedAt.seconds * 1000
        : Date.now()

      const update = () => {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)))
      }
      update()
      const interval = setInterval(update, 1000)
      return () => clearInterval(interval)
    } else if (booking.walkDurationSeconds) {
      setElapsedSeconds(booking.walkDurationSeconds)
    }
  }, [booking?.status, booking?.walkStartedAt, booking?.walkDurationSeconds])

  if (!bookingId) return null

  const dogName = booking?.dogName || booking?.petName || 'Dog'
  const breed = booking?.breed || booking?.petBreed || 'Dog'
  const walkerName = booking?.assignedTeamMemberName || booking?.assignedWalkerName || 'Paw Paw Walker'
  const walkerPhone = booking?.assignedTeamMemberPhone || booking?.assignedWalkerPhone || ''
  const isLive = booking?.status === WALKING_STATUS.IN_PROGRESS
  const isCompleted = booking?.status === WALKING_STATUS.COMPLETED
  const targetDurationMins = booking?.duration || booking?.durationMinutes || 30

  const pickupCoords =
    booking?.locationCoords ||
    (booking?.lat && booking?.lng ? { lat: booking.lat, lng: booking.lng } : null)

  const currentCoords = booking?.liveLocation || null
  const routeTrail = Array.isArray(booking?.routeTrail) ? booking.routeTrail : []

  const distanceMeters =
    booking?.walkDistanceMeters || calculateTotalRouteDistance(routeTrail)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(20, 15, 12, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--card)',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '92vh',
          borderRadius: '24px',
          border: '1.5px solid var(--border)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: isLive ? '#221711' : 'var(--surface)',
            color: isLive ? '#FCFAF6' : 'var(--text)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                background: isLive
                  ? 'rgba(192, 136, 32, 0.25)'
                  : 'var(--accent-bg)',
                border: `1px solid ${isLive ? '#C08820' : 'var(--accent-border)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isLive ? '#D49B2E' : 'var(--accent)',
              }}
            >
              <Footprints size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>
                  {dogName}’s Walk
                </h3>
                {isLive && (
                  <span
                    style={{
                      background: 'rgba(34, 197, 94, 0.2)',
                      color: '#4ade80',
                      border: '1px solid #22c55e',
                      fontSize: '10.5px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#22c55e',
                        animation: 'pawpaw-gps-pulse 1.5s infinite',
                      }}
                    />
                    LIVE GPS
                  </span>
                )}
                {isCompleted && (
                  <span className="badge badge-completed" style={{ fontSize: '10.5px' }}>
                    Completed
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: '11.5px',
                  color: isLive ? 'rgba(255,255,255,0.7)' : 'var(--muted)',
                }}
              >
                {breed} · {targetDurationMins} Mins Session
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close live tracking"
            style={{
              background: isLive ? 'rgba(255,255,255,0.1)' : 'var(--surface)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isLive ? '#fff' : 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
              <div>Connecting to live walk session...</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* 🚨 Emergency SOS Banner */}
              {booking?.hasEmergency && (
                <div style={{
                  background: '#fee2e2',
                  border: '2px solid #ef4444',
                  borderRadius: '16px',
                  padding: '14px 16px',
                  boxShadow: '0 8px 24px rgba(239, 68, 68, 0.25)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>🚨</span>
                      <div>
                        <strong style={{ color: '#dc2626', fontSize: '14px', display: 'block' }}>
                          WALKER SOS ALERT ACTIVE
                        </strong>
                        <span style={{ fontSize: '11.5px', color: '#991b1b' }}>
                          Reason: {booking.emergencyReason || 'Urgent incident occurred'}
                        </span>
                      </div>
                    </div>

                    {walkerPhone && (
                      <a
                        href={`tel:${walkerPhone}`}
                        style={{
                          background: '#dc2626',
                          color: '#fff',
                          textDecoration: 'none',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Phone size={13} /> Call Walker Now
                      </a>
                    )}
                  </div>

                  {booking.emergencyNote && (
                    <div style={{ fontSize: '12px', color: '#7f1d1d', fontStyle: 'italic', background: '#fff', padding: '6px 10px', borderRadius: '8px', border: '1px solid #fca5a5' }}>
                      "{booking.emergencyNote}"
                    </div>
                  )}
                </div>
              )}

              {/* Stats HUD (Time, Distance, Pace, Speed, Burn) */}
              {(() => {
                const pace = calculatePace(distanceMeters, elapsedSeconds)
                const speed = calculateSpeed(distanceMeters, elapsedSeconds, booking?.liveLocation?.speed)
                const calories = booking?.estimatedCalories || calculateCalories(distanceMeters, elapsedSeconds)
                const gpsQuality = getGpsQuality(booking?.liveLocation?.accuracy)

                return (
                  <div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '10px',
                        background: 'var(--surface)',
                        borderRadius: '16px',
                        padding: '12px 14px',
                        border: '1.5px solid var(--border)',
                        textAlign: 'center',
                      }}
                    >
                      {/* 1. Time */}
                      <div>
                        <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '3px' }}>
                          <Clock size={11} /> {isLive ? 'Walk Duration' : 'Total Walk Time'}
                        </span>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text)', fontFamily: 'monospace' }}>
                          {isLive ? formatDurationMMSS(elapsedSeconds) : formatDurationHuman(elapsedSeconds)}
                        </div>
                        <span style={{ fontSize: '10.5px', color: 'var(--accent)', fontWeight: 700 }}>
                          Target: {targetDurationMins} Mins
                        </span>
                      </div>

                      {/* 2. Distance */}
                      <div>
                        <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '3px' }}>
                          <Footprints size={11} /> Distance Walked
                        </span>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#16a34a', fontFamily: 'monospace' }}>
                          {formatDistance(distanceMeters)}
                        </div>
                        <span style={{ fontSize: '10.5px', color: 'var(--muted)' }}>
                          {routeTrail.length > 0 ? `${routeTrail.length} GPS points` : 'Tracking route'}
                        </span>
                      </div>

                      {/* 3. Pace */}
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                        <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '3px' }}>
                          <Gauge size={11} /> Avg Pace
                        </span>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: '#0284c7', fontFamily: 'monospace' }}>
                          {booking?.walkPace || pace.formatted}
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                          Minutes / km
                        </span>
                      </div>

                      {/* 4. Speed */}
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                        <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '3px' }}>
                          <Zap size={11} /> Speed
                        </span>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: '#d97706', fontFamily: 'monospace' }}>
                          {booking?.walkSpeedKmh ? `${booking.walkSpeedKmh} km/h` : speed.formatted}
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                          Walking speed
                        </span>
                      </div>
                    </div>

                    {/* Calories + GPS quality footer chip */}
                    <div style={{
                      marginTop: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 12px',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      fontSize: '11px',
                      color: 'var(--muted)',
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ea580c', fontWeight: 700 }}>
                        <Flame size={12} /> Active Burn: ~{calories} kcal
                      </span>
                      {isLive && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: gpsQuality.color }} />
                          <span style={{ color: gpsQuality.color, fontWeight: 700 }}>GPS: {gpsQuality.label}</span>
                        </span>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Interactive Live Map */}
              <div>
                <LiveWalkTrackerMap
                  pickupCoords={pickupCoords}
                  currentCoords={currentCoords}
                  routeTrail={routeTrail}
                  isLive={isLive}
                  dogName={dogName}
                  walkerName={walkerName}
                  height="300px"
                />
              </div>

              {/* Walker & Contact Card */}
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: '15px',
                    }}
                  >
                    🐾
                  </div>
                  <div>
                    <span style={{ fontSize: '10.5px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                      Assigned Walker
                    </span>
                    <strong style={{ fontSize: '14px', color: 'var(--text)' }}>
                      {walkerName}
                    </strong>
                  </div>
                </div>

                {walkerPhone && (
                  <a
                    href={`tel:${walkerPhone}`}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}
                  >
                    <Phone size={13} /> Call Walker
                  </a>
                )}
              </div>

              {/* Schedule and Pickup Location Summary */}
              <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={13} color="var(--accent)" />
                  <span>{booking.date || booking.walkingDate || '-'} at {booking.slot || booking.walkingSlot || '-'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <MapPin size={13} color="var(--accent)" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span>{booking.pickupAddress || booking.address || (booking.area ? `${booking.area}, Pune` : 'Pickup')}</span>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
            {isLive ? '🟢 GPS updates streamed live' : isCompleted ? 'Walk completed successfully' : 'Waiting for walker to start'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ fontSize: '12.5px', padding: '6px 14px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
