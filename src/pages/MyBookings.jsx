// src/pages/MyBookings.jsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, orderBy, getDocs, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { Calendar, ChevronRight, Clock, Home, PawPrint, Plus, Store, UserRound, X } from 'lucide-react'
import { ADMIN_EMAIL, db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'
import Toast from '../components/Toast'
import { fetchBookingSettings, getAvailabilityForDate, getBookingTypeLabel, getPaymentModeLabel, getPaymentOptionLabel } from '../utils/bookingSettings'
import { SERVICES } from '../utils/services'

const STATUS_BADGE = {
  pending: 'badge-pending',
  confirmed: 'badge-confirmed',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
}

const STATUS_FILTERS = ['all', 'pending', 'confirmed', 'completed', 'cancelled']

const statusLabel = status => status === 'all' ? 'All' : (status || 'pending').charAt(0).toUpperCase() + (status || 'pending').slice(1)
const money = value => Number(value || 0).toLocaleString('en-IN')
const shortId = id => id ? `#${id.slice(0, 8).toUpperCase()}` : '-'
const assignedWorker = booking => booking.assignedTeamMemberName || (booking.status === 'confirmed' || booking.status === 'completed' ? 'Owner' : '')

function parseAppointmentStart(booking) {
  if (booking.bookingStartAt?.toDate) return booking.bookingStartAt.toDate()
  if (!booking.date) return null
  let match = String(booking.slot || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  let hour
  let minute
  if (match) {
    hour = Number(match[1])
    minute = Number(match[2])
    const suffix = match[3].toUpperCase()
    if (suffix === 'PM' && hour !== 12) hour += 12
    if (suffix === 'AM' && hour === 12) hour = 0
  } else {
    match = String(booking.slot || '').trim().match(/^(\d{1,2}):(\d{2})$/)
    if (!match) return null
    hour = Number(match[1])
    minute = Number(match[2])
  }
  const date = new Date(`${booking.date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateTime(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null
  if (!date) return '-'
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\b(am|pm)\b/i, value => value.toUpperCase())
}

function formatSlot(value) {
  const text = String(value || '').trim()
  let match = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (match) {
    let hour = Number(match[1])
    const minute = Number(match[2])
    const suffix = match[3].toUpperCase()
    if (suffix === 'PM' && hour !== 12) hour += 12
    if (suffix === 'AM' && hour === 12) hour = 0
    return formatDateTime(new Date(2000, 0, 1, hour, minute)).replace(/^\d+ \w+ \d+,\s*/, '')
  }
  match = text.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return text || '-'
  return formatDateTime(new Date(2000, 0, 1, Number(match[1]), Number(match[2]))).replace(/^\d+ \w+ \d+,\s*/, '')
}

function formatAppointmentStart(booking) {
  return formatDateTime(parseAppointmentStart(booking))
}

function canCancelBooking(booking, settings) {
  if (booking.status === 'pending') return true
  if (booking.status !== 'confirmed') return false
  const start = parseAppointmentStart(booking)
  if (!start) return false
  const cutoffMinutes = Math.max(0, Number(settings?.cancellationCutoffMinutes ?? 60))
  return start.getTime() - Date.now() >= cutoffMinutes * 60 * 1000
}

function canRescheduleBooking(booking) {
  if (!booking) return false
  if (booking.status === 'completed') return false
  if (['pending', 'confirmed'].includes(booking.status)) return true
  return booking.status === 'cancelled' && booking.cancelledBy === 'admin'
}

const dateKeyLocal = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const isFutureSlotForDate = (dateString, slotLabel) => {
  const match = String(slotLabel || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!dateString || !match) return false
  let hour = Number(match[1])
  const minute = Number(match[2])
  const suffix = match[3].toUpperCase()
  if (suffix === 'PM' && hour !== 12) hour += 12
  if (suffix === 'AM' && hour === 12) hour = 0
  const date = new Date(`${dateString}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`)
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now()
}

function serviceIdsFor(booking) {
  if (Array.isArray(booking.serviceIds) && booking.serviceIds.length) return booking.serviceIds
  return booking.serviceId ? [booking.serviceId] : []
}

function serviceNamesFor(booking) {
  if (Array.isArray(booking.serviceNames) && booking.serviceNames.length) return booking.serviceNames
  const ids = serviceIdsFor(booking)
  const names = ids.map(id => SERVICES.find(service => service.id === id)?.name).filter(Boolean)
  if (names.length) return names
  return booking.serviceName ? [booking.serviceName] : []
}

function appointmentTitle(booking) {
  const serviceNames = serviceNamesFor(booking)
  const packageNames = Array.isArray(booking.packageNames) ? booking.packageNames : []
  const labels = [...serviceNames, ...packageNames].filter(Boolean)
  return labels.length ? labels.join(', ') : booking.serviceName || 'Appointment'
}

function petLine(booking) {
  return [booking.petName, booking.petBreed].filter(Boolean).join(' - ') || 'Pet details not added'
}

function petImageUrlFor(booking) {
  return booking.petPhotoUrl || booking.petImageUrl || booking.petPhoto || booking.petImage || booking.pet?.photoUrl || ''
}

export default function MyBookings() {
  const { user } = useAuth()
  const { sendNotification } = useNotifications()
  const [bookings, setBookings] = useState([])
  const [bookingSettings, setBookingSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [previewImage, setPreviewImage] = useState(null)
  const [cancellingId, setCancellingId] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelToast, setCancelToast] = useState('')
  const [rescheduleToast, setRescheduleToast] = useState('')
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleSlot, setRescheduleSlot] = useState('')
  const [rescheduleBookedSlots, setRescheduleBookedSlots] = useState([])
  const [reschedulingId, setReschedulingId] = useState('')

  useEffect(() => {
    fetchBookingSettings(db).then(setBookingSettings).catch(() => {})
  }, [])

  useEffect(() => {
    if (!cancelToast) return
    const t = window.setTimeout(() => setCancelToast(''), 3500)
    return () => window.clearTimeout(t)
  }, [cancelToast])

  useEffect(() => {
    if (!rescheduleToast) return
    const t = window.setTimeout(() => setRescheduleToast(''), 3500)
    return () => window.clearTimeout(t)
  }, [rescheduleToast])

  useEffect(() => {
    if (!rescheduleTarget?.id || !rescheduleDate) {
      setRescheduleBookedSlots([])
      return
    }
    let ignore = false
    async function fetchBooked() {
      try {
        const q = query(
          collection(db, 'bookings'),
          where('date', '==', rescheduleDate),
          where('status', 'in', ['pending', 'confirmed', 'completed'])
        )
        const snap = await getDocs(q)
        const slotCounts = {}
        snap.docs
          .map(d => d.data())
          .filter(item => item.id !== rescheduleTarget.id && (item.status || '') !== 'cancelled')
          .forEach(item => { slotCounts[item.slot] = (slotCounts[item.slot] || 0) + 1 })
        const capacity = Math.max(1, Number(bookingSettings?.slotCapacity || 1))
        if (!ignore) setRescheduleBookedSlots(Object.entries(slotCounts).filter(([, count]) => count >= capacity).map(([slot]) => slot))
      } catch {
        if (!ignore) setRescheduleBookedSlots([])
      }
    }
    fetchBooked()
    return () => { ignore = true }
  }, [rescheduleTarget?.id, rescheduleDate, bookingSettings, rescheduleTarget?.bookingType])

  useEffect(() => {
    async function fetch() {
      try {
        const q = query(collection(db, 'bookings'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'))
        const snap = await getDocs(q)
        setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch {
        try {
          const q2 = query(collection(db, 'bookings'), where('userId', '==', user.uid))
          const snap2 = await getDocs(q2)
          const results = snap2.docs.map(d => ({ id: d.id, ...d.data() }))
          results.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
          setBookings(results)
        } catch {}
      }
      setLoading(false)
    }
    fetch()
  }, [user])

  const filtered = useMemo(
    () => filter === 'all' ? bookings : bookings.filter(booking => booking.status === filter),
    [bookings, filter]
  )

  const bookingSummary = useMemo(() => {
    const counts = { total: bookings.length, upcoming: 0, completed: 0, cancelled: 0 }
    bookings.forEach(booking => {
      if (booking.status === 'completed') counts.completed += 1
      else if (booking.status === 'cancelled') counts.cancelled += 1
      else counts.upcoming += 1
    })
    return counts
  }, [bookings])

  const openPreviewImage = (event, url, label) => {
    if (!url) return
    event.preventDefault()
    event.stopPropagation()
    setPreviewImage({ url, label })
  }

  const openRescheduleModal = (booking) => {
    setRescheduleTarget(booking)
    setRescheduleDate(booking.date || '')
    setRescheduleSlot(booking.slot || '')
    setRescheduleBookedSlots([])
  }

  const rescheduleAvailability = rescheduleDate ? getAvailabilityForDate(bookingSettings || undefined, rescheduleDate) : { open: false, storeSlots: [], homeSlots: [] }
  const rescheduleSlots = (rescheduleTarget?.bookingType || 'store') === 'home' ? rescheduleAvailability.homeSlots : rescheduleAvailability.storeSlots
  const isRescheduleToday = rescheduleDate === dateKeyLocal()
  const bookableRescheduleSlots = isRescheduleToday ? rescheduleSlots.filter(slot => isFutureSlotForDate(rescheduleDate, slot)) : rescheduleSlots

  const confirmReschedule = async () => {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleSlot) return
    const previousDate = rescheduleTarget.date || ''
    const previousSlot = rescheduleTarget.slot || ''
    const sameAsCurrent = String(rescheduleDate || '') === String(previousDate) && String(rescheduleSlot || '') === String(previousSlot)
    if (sameAsCurrent) {
      setRescheduleToast('Cannot reschedule to the same slot. Please choose a different slot.')
      return
    }
    const oldBookingStart = parseAppointmentStart(rescheduleTarget)
    const newBookingStart = rescheduleDate && rescheduleSlot ? (() => {
      const match = String(rescheduleSlot || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
      if (!match) return null
      let hour = Number(match[1])
      const minute = Number(match[2])
      const suffix = match[3].toUpperCase()
      if (suffix === 'PM' && hour !== 12) hour += 12
      if (suffix === 'AM' && hour === 12) hour = 0
      const date = new Date(`${rescheduleDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`)
      return Number.isNaN(date.getTime()) ? null : date
    })() : null
    setReschedulingId(rescheduleTarget.id)
    try {
      const history = Array.isArray(rescheduleTarget.rescheduleHistory) ? rescheduleTarget.rescheduleHistory : []
      const patch = {
        date: rescheduleDate,
        slot: rescheduleSlot,
        status: 'pending',
        updatedAt: serverTimestamp(),
        rescheduleCount: Number(rescheduleTarget.rescheduleCount || 0) + 1,
        rescheduledAt: serverTimestamp(),
        rescheduledBy: 'user',
        previousDate,
        previousSlot,
        rescheduleHistory: [
          ...history,
          {
            previousDate,
            previousSlot,
            newDate: rescheduleDate,
            newSlot: rescheduleSlot,
            rescheduledAt: new Date().toISOString(),
            rescheduledBy: 'user',
            previousStatus: rescheduleTarget.status,
          },
        ],
        bookingStartAt: newBookingStart ? Timestamp.fromDate(newBookingStart) : null,
      }
      await setDoc(doc(db, 'bookings', rescheduleTarget.id), patch, { merge: true })
      const localPatch = {
        ...patch,
        rescheduledAt: new Date(),
        bookingStartAt: newBookingStart ? { toDate: () => newBookingStart } : null,
        previousDate,
        previousSlot,
      }
      setBookings(prev => prev.map(item => item.id === rescheduleTarget.id ? { ...item, ...localPatch } : item))
      setSelectedBooking(prev => prev?.id === rescheduleTarget.id ? { ...prev, ...localPatch } : prev)
      if (ADMIN_EMAIL) {
        await sendNotification('', {
          userEmail: ADMIN_EMAIL,
          title: 'Appointment rescheduled',
          message: `${appointmentTitle(rescheduleTarget)} was moved from ${previousDate} at ${formatSlot(previousSlot)} to ${rescheduleDate} at ${formatSlot(rescheduleSlot)}.`,
          type: 'rescheduled',
          bookingId: rescheduleTarget.id,
          actionUrl: `/admin/bookings/${rescheduleTarget.id}`,
        })
      }
      setRescheduleTarget(null)
      setRescheduleDate('')
      setRescheduleSlot('')
      setRescheduleToast('Appointment rescheduled successfully.')
    } catch (err) {
      console.error('FIREBASE ERROR:', err)
      alert('Could not reschedule booking. Please try again.')
    }
    setReschedulingId('')
  }

  const cancelBooking = async (booking, reason) => {
    const cleanReason = String(reason || '').trim()
    if (!canCancelBooking(booking, bookingSettings) || !cleanReason) return
    setCancellingId(booking.id)
    try {
      await setDoc(doc(db, 'bookings', booking.id), {
        status: 'cancelled',
        cancelledBy: 'user',
        cancelledAt: serverTimestamp(),
        cancellationReason: cleanReason,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      const patch = { status: 'cancelled', cancelledBy: 'user', cancelledAt: new Date(), cancellationReason: cleanReason, updatedAt: new Date() }
      setBookings(prev => prev.map(item => item.id === booking.id ? { ...item, ...patch } : item))
      setSelectedBooking(prev => prev?.id === booking.id ? { ...prev, ...patch } : prev)
      if (ADMIN_EMAIL) {
        await sendNotification('', {
          userEmail: ADMIN_EMAIL,
          title: 'Appointment cancelled',
          message: `${appointmentTitle(booking)} on ${booking.date} at ${formatSlot(booking.slot)} - Appointment cancelled by user. Reason: ${cleanReason}`,
          type: 'cancelled',
          bookingId: booking.id,
          actionUrl: `/admin/bookings/${booking.id}`,
        })
      }
      setCancelTarget(null)
      setCancelReason('')
      setCancelToast('Appointment cancelled successfully.')
    } catch (err) {
      console.error("FIREBASE ERROR:", err);
      alert('Could not cancel booking. Please try again.')
    }
    setCancellingId('')
  }

  return (
    <div className="my-bookings-page">
      {cancelToast && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={cancelToast} type="success" onClose={() => setCancelToast('')} />
        </div>
      )}
      {rescheduleToast && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300, marginTop: '72px' }}>
          <Toast message={rescheduleToast} type={rescheduleToast.includes('Cannot') ? 'error' : 'success'} onClose={() => setRescheduleToast('')} />
        </div>
      )}
      <div className="my-bookings-shell">
        <div className="my-bookings-header">
          <div className="my-bookings-title-group">
            <PawPrint size={20} className="my-bookings-paw-icon" />
            <div>
              <h1>My Bookings</h1>
              <p>{bookings.length} total appointment{bookings.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <Link to="/book" className="btn btn-primary my-bookings-new">
            <Plus size={16} /> New Booking
          </Link>
        </div>

        <div className="my-bookings-stats" aria-label="Booking summary">
          <div className="my-bookings-stat-card">
            <span>Total</span>
            <strong>{bookingSummary.total}</strong>
          </div>
          <div className="my-bookings-stat-card">
            <span>Upcoming</span>
            <strong>{bookingSummary.upcoming}</strong>
          </div>
          <div className="my-bookings-stat-card">
            <span>Completed</span>
            <strong>{bookingSummary.completed}</strong>
          </div>
          <div className="my-bookings-stat-card">
            <span>Cancelled</span>
            <strong>{bookingSummary.cancelled}</strong>
          </div>
        </div>

        <div className="my-bookings-filters" role="tablist" aria-label="Booking status filters">
          {STATUS_FILTERS.map(item => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={filter === item ? 'active' : ''}
            >
              {statusLabel(item)}
            </button>
          ))}
        </div>

        {loading ? <Spinner text="Loading your bookings..." /> : filtered.length === 0 ? (
          <div className="my-bookings-empty">
            <p>No bookings found</p>
            <span>{filter === 'all' ? 'Book your first grooming appointment.' : `No ${filter} appointments right now.`}</span>
            <Link to="/book" className="btn btn-primary">Book Now</Link>
          </div>
        ) : (
          <div className="my-bookings-list">
            {filtered.map(booking => {
              const petImage = petImageUrlFor(booking)
              return (
                <div
                  key={booking.id}
                  role="button"
                  tabIndex={0}
                  className="my-booking-row"
                  onClick={(event) => {
                    if (event.target.closest && (event.target.closest('button') || event.target.closest('.my-booking-preview-side'))) return
                    setSelectedBooking(booking)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedBooking(booking)
                    }
                  }}
                >
                  <div className="my-booking-row-top">
                    <div className="my-booking-date">
                      <strong><Calendar size={12} /> {booking.date || '-'}</strong>
                      <small><Clock size={12} /> {formatSlot(booking.slot)}</small>
                    </div>
                    <div className="my-booking-badges">
                      <span className={`badge ${STATUS_BADGE[booking.status] || 'badge-pending'} my-booking-status`}>{statusLabel(booking.status)}</span>
                      {(booking.rescheduleCount || 0) > 0 && (
                        <span className="badge badge-rescheduled">Rescheduled</span>
                      )}
                    </div>
                  </div>
                  <div className="my-booking-row-body">
                    <div className="my-booking-main-row">
                      {petImage ? <img className="my-booking-pet-thumb" src={petImage} alt={petLine(booking)} /> : <div className="my-booking-pet-thumb placeholder"><PawPrint size={14} /></div>}
                      <div className="my-booking-main-copy">
                        <strong title={appointmentTitle(booking)}>{appointmentTitle(booking)}</strong>
                        <small title={petLine(booking)}>{petLine(booking)}</small>
                        <div className="my-booking-row-meta">
                          <span>{getBookingTypeLabel(booking.bookingType || 'store')}</span>
                        </div>
                      </div>
                    </div>
                    {(booking.beforeImageUrl || booking.afterImageUrl) && (
                      <div className="my-booking-preview-side" onClick={event => event.stopPropagation()}>
                        <div className="my-booking-preview-copy">
                          <span>Before & After</span>
                          <strong>Transformation</strong>
                        </div>
                        <div className="my-booking-row-images">
                          {booking.beforeImageUrl && (
                            <button type="button" onClick={(event) => openPreviewImage(event, booking.beforeImageUrl, 'Before')} onMouseDown={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()}>
                              <img src={booking.beforeImageUrl} alt="Before appointment" />
                              <span className="my-booking-preview-caption">Before</span>
                            </button>
                          )}
                          {booking.afterImageUrl && (
                            <button type="button" onClick={(event) => openPreviewImage(event, booking.afterImageUrl, 'After')} onMouseDown={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()}>
                              <img src={booking.afterImageUrl} alt="After appointment" />
                              <span className="my-booking-preview-caption">After</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <ChevronRight size={17} className="my-booking-chevron" />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {previewImage && (
        <div className="my-booking-image-lightbox" onClick={() => setPreviewImage(null)}>
          <div className="my-booking-image-lightbox-shell" onClick={event => event.stopPropagation()}>
            <div className="my-booking-image-lightbox-head">
              <span>{previewImage.label}</span>
              <button type="button" onClick={() => setPreviewImage(null)} aria-label="Close image preview"><X size={18} /></button>
            </div>
            <img src={previewImage.url} alt={previewImage.label} />
          </div>
        </div>
      )}

      {selectedBooking && (
        <div className="my-booking-modal-overlay" onClick={() => setSelectedBooking(null)}>
          <section className="my-booking-modal" onClick={event => event.stopPropagation()}>
            <div className="my-booking-modal-head">
              <div>
                <div className="my-booking-modal-badges">
                  <span className={`badge ${STATUS_BADGE[selectedBooking.status] || 'badge-pending'}`}>{statusLabel(selectedBooking.status)}</span>
                  {(selectedBooking.rescheduleCount || 0) > 0 && (
                    <span className="badge badge-rescheduled">
                      Rescheduled
                    </span>
                  )}
                </div>
                <h2>{appointmentTitle(selectedBooking)}</h2>
                <p>{shortId(selectedBooking.id)} • {selectedBooking.date || '-'} • {formatSlot(selectedBooking.slot)}</p>
              </div>
              <button type="button" onClick={() => setSelectedBooking(null)} aria-label="Close booking details">
                <X size={18} />
              </button>
            </div>

            <div className="my-booking-modal-hero">
              <div className="my-booking-modal-hero-content">
                {petImageUrlFor(selectedBooking) ? <img className="my-booking-modal-pet-image" src={petImageUrlFor(selectedBooking)} alt={petLine(selectedBooking)} /> : <div className="my-booking-modal-pet-image placeholder"><PawPrint size={18} /></div>}
                <div>
                  <div className="my-booking-modal-hero-label">Appointment overview</div>
                  <div className="my-booking-modal-hero-title">{appointmentTitle(selectedBooking)}</div>
                </div>
              </div>
              <div className="my-booking-modal-hero-meta">
                <span>{getBookingTypeLabel(selectedBooking.bookingType || 'store')}</span>
                {selectedBooking.phone ? <span>{selectedBooking.phone}</span> : null}
              </div>
            </div>

            <div className="my-booking-detail-grid">
              <Detail label="Pet" value={selectedBooking.petName || '-'} />
              <Detail label="Breed" value={selectedBooking.petBreed || selectedBooking.petType || '-'} />
              <Detail label="Date" value={selectedBooking.date || '-'} icon={<Calendar size={15} />} />
              <Detail label="Time" value={formatSlot(selectedBooking.slot)} icon={<Clock size={15} />} />
              {selectedBooking.status === 'cancelled' && <Detail label="Cancelled By" value={selectedBooking.cancelledBy === 'admin' ? 'Paw Paw' : 'You'} />}
              {selectedBooking.status === 'cancelled' && selectedBooking.cancellationReason && <Detail label="Reason" value={selectedBooking.cancellationReason} />}
              <Detail label="Visit" value={getBookingTypeLabel(selectedBooking.bookingType || 'store')} icon={(selectedBooking.bookingType || 'store') === 'home' ? <Home size={15} /> : <Store size={15} />} />
              {selectedBooking.address && <Detail label="Address" value={selectedBooking.address} />}
            </div>

            {(selectedBooking.beforeImageUrl || selectedBooking.afterImageUrl) && (
              <div className="my-booking-image-section">
                <h3>Before & After</h3>
                <div className="my-booking-image-grid">
                  {selectedBooking.beforeImageUrl && (
                    <button type="button" className="my-booking-image-card" onClick={() => setPreviewImage({ url: selectedBooking.beforeImageUrl, label: 'Before' })}>
                      <div className="my-booking-image-label-row"><span>Before</span><span className="my-booking-image-icon">↔</span></div>
                      <img src={selectedBooking.beforeImageUrl} alt="Before appointment" />
                    </button>
                  )}
                  {selectedBooking.afterImageUrl && (
                    <button type="button" className="my-booking-image-card" onClick={() => setPreviewImage({ url: selectedBooking.afterImageUrl, label: 'After' })}>
                      <div className="my-booking-image-label-row"><span>After</span><span className="my-booking-image-icon">↔</span></div>
                      <img src={selectedBooking.afterImageUrl} alt="After appointment" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {selectedBooking.address && (
              <div className="my-booking-detail-note">
                <strong>Address</strong>
                <p>{selectedBooking.address}</p>
              </div>
            )}
              {canRescheduleBooking(selectedBooking) && (
                <button
                  type="button"
                  className="btn btn-secondary my-booking-reschedule-btn"
                  disabled={reschedulingId === selectedBooking.id}
                  onClick={() => openRescheduleModal(selectedBooking)}
                >
                  Reschedule
                </button>
              )}
            {canCancelBooking(selectedBooking, bookingSettings) && (
              <button
                type="button"
                className="btn btn-danger my-booking-cancel-btn"
                disabled={cancellingId === selectedBooking.id}
                onClick={() => { setCancelReason(''); setCancelTarget(selectedBooking) }}
              >
                <X size={15} /> {cancellingId === selectedBooking.id ? 'Cancelling...' : 'Cancel Booking'}
              </button>
            )}

            {selectedBooking.notes && (
              <div className="my-booking-detail-note">
                <strong>Notes</strong>
                <p>{selectedBooking.notes}</p>
              </div>
            )}

          </section>
        </div>
      )}


      {rescheduleTarget && (
        <div className="my-booking-modal-overlay" onClick={() => setRescheduleTarget(null)}>
          <section className="my-booking-modal" onClick={event => event.stopPropagation()}>
            <div className="my-booking-modal-head">
              <div>
                <h2>Reschedule Appointment</h2>
                <p>{appointmentTitle(rescheduleTarget)} · {rescheduleTarget.date || '-'} · {formatSlot(rescheduleTarget.slot)}</p>
              </div>
              <button type="button" onClick={() => setRescheduleTarget(null)} aria-label="Close reschedule dialog">
                <X size={18} />
              </button>
            </div>
            <div className="my-booking-detail-grid">
              <div>
                <span>Current Date</span>
                <strong>{rescheduleTarget.date || '-'}</strong>
              </div>
              <div>
                <span>Current Time</span>
                <strong>{formatSlot(rescheduleTarget.slot)}</strong>
              </div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <label className="input-label" style={{ display: 'block', marginBottom: '8px' }}>New Date</label>
              <input type="date" className="input" min={dateKeyLocal()} value={rescheduleDate} onChange={e => { setRescheduleDate(e.target.value); setRescheduleSlot('') }} />
            </div>
            {rescheduleDate && (
              <div style={{ marginTop: '16px' }}>
                <label className="input-label" style={{ display: 'block', marginBottom: '8px' }}>New Time</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                  {rescheduleSlots.map(slot => {
                    const isPast = isRescheduleToday && !isFutureSlotForDate(rescheduleDate, slot)
                    const isBooked = rescheduleBookedSlots.includes(slot)
                    const disabled = isPast || isBooked
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (rescheduleTarget?.date === rescheduleDate && rescheduleTarget?.slot === slot) {
                            setRescheduleToast('Cannot reschedule to the same slot. Please choose a different slot.')
                            return
                          }
                          setRescheduleSlot(slot)
                        }}
                        className={`slot-btn slot-btn-available${isPast ? ' slot-btn-past' : ''}${isBooked ? ' slot-btn-booked' : ''}${rescheduleSlot === slot ? ' selected' : ''}`}
                      >
                        {slot}
                      </button>
                    )
                  })}
                </div>
                {rescheduleSlots.length === 0 ? (
                  <p style={{ color: '#ef4444', fontSize: '11px', marginTop: '8px' }}>No slots are available for this visit type.</p>
                ) : bookableRescheduleSlots.length === 0 ? (
                  <p style={{ color: '#ef4444', fontSize: '11px', marginTop: '8px' }}>No future slots are available for this visit type today.</p>
                ) : (
                  <p style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '8px' }}>Green slots are available. Gray slots are past or already booked.</p>
                )}
              </div>
            )}
            <div className="my-booking-modal-actions" style={{ marginTop: '20px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setRescheduleTarget(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={confirmReschedule} disabled={!rescheduleDate || !rescheduleSlot || reschedulingId === rescheduleTarget.id || !bookableRescheduleSlots.includes(rescheduleSlot) || rescheduleBookedSlots.includes(rescheduleSlot)}>
                {reschedulingId === rescheduleTarget.id ? 'Rescheduling...' : 'Confirm Reschedule'}
              </button>
            </div>
          </section>
        </div>
      )}

      <ConfirmModal
        open={!!cancelTarget}
        title="Cancel booking?"
        message={cancelTarget ? `Are you sure you want to cancel ${appointmentTitle(cancelTarget)} for ${cancelTarget.date || 'this date'} at ${formatSlot(cancelTarget.slot)}?` : ''}
        confirmText="Yes, cancel"
        cancelText="Keep booking"
        loading={!!cancelTarget && cancellingId === cancelTarget.id}
        onCancel={() => { setCancelTarget(null); setCancelReason('') }}
        onConfirm={() => cancelTarget && cancelBooking(cancelTarget, cancelReason)}
        reasonLabel="Cancellation reason"
        reasonPlaceholder="Please tell us why you are cancelling"
        reasonValue={cancelReason}
        onReasonChange={setCancelReason}
        reasonRequired
      />
      <style>{`
        .my-bookings-page {
          background: var(--bg);
          min-height: 100vh;
          padding-top: 80px;
        }

        .my-bookings-shell {
          width: min(760px, 100%);
          margin: 0 auto;
          padding: 40px 20px 80px;
        }

        .my-bookings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 22px;
        }

        .my-bookings-title-group {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .my-bookings-paw-icon {
          color: var(--accent);
          flex-shrink: 0;
        }

        .my-bookings-header h1 {
          font-family: 'Playfair Display', serif;
          font-size: clamp(32px, 8vw, 46px);
          line-height: 1;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 8px;
          letter-spacing: 0;
        }

        .my-bookings-header p {
          color: var(--muted);
          font-size: 14px;
        }

        .my-bookings-new {
          font-size: 13px;
          padding: 10px 16px;
          flex-shrink: 0;
        }

        .my-bookings-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 16px;
        }

        .my-bookings-stat-card {
          background: linear-gradient(135deg, rgba(212,175,55,0.12), rgba(255,255,255,0.03));
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 12px 14px;
          display: grid;
          gap: 4px;
        }

        .my-bookings-stat-card span {
          color: var(--muted);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .my-bookings-stat-card strong {
          color: var(--text);
          font-size: 18px;
          font-weight: 900;
        }

        .my-bookings-filters {
          display: flex;
          gap: 8px;
          margin-bottom: 18px;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .my-bookings-filters button {
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--muted);
          border-radius: 999px;
          padding: 9px 14px;
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
        }

        .my-bookings-filters button.active {
          border-color: var(--accent-border);
          background: var(--accent-bg);
          color: var(--accent);
        }

        .my-bookings-list {
          display: grid;
          gap: 10px;
        }

        .my-booking-row {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
          text-align: left;
          background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(212,175,55,0.04));
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 14px;
          cursor: pointer;
          box-shadow: 0 14px 40px rgba(0,0,0,0.08);
          position: relative;
        }

        .my-booking-row:hover,
        .my-booking-row:focus-visible {
          border-color: var(--accent);
          outline: none;
        }

        .my-booking-row-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .my-booking-date {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          min-width: 0;
        }

        .my-booking-date strong,
        .my-booking-main-copy strong {
          color: var(--text);
          font-size: 13px;
          font-weight: 800;
        }

        .my-booking-date strong {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .my-booking-date small,
        .my-booking-main-copy small {
          color: var(--muted);
          font-size: 12px;
          font-style: normal;
        }

        .my-booking-date small {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .my-booking-row-body {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .my-booking-main-row {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          flex: 1;
          min-width: 0;
        }

        .my-booking-preview-side {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          flex-shrink: 0;
          margin-left: auto;
        }

        .my-booking-preview-copy {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }

        .my-booking-preview-copy span {
          color: var(--muted);
          font-size: 11px;
          font-weight: 700;
        }

        .my-booking-preview-copy strong {
          color: var(--text);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .my-booking-pet-thumb,
        .my-booking-modal-pet-image {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          object-fit: cover;
          border: 1px solid var(--border);
          background: var(--surface);
          flex-shrink: 0;
        }

        .my-booking-pet-thumb.placeholder,
        .my-booking-modal-pet-image.placeholder {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
        }

        .my-booking-main-copy {
          min-width: 0;
          flex: 1;
        }

        .my-booking-main-copy strong,
        .my-booking-main-copy small {
          display: block;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-box-orient: vertical;
        }

        .my-booking-main-copy strong {
          font-size: 15px;
          line-height: 1.35;
          -webkit-line-clamp: 2;
        }

        .my-booking-main-copy small {
          margin-top: 5px;
          -webkit-line-clamp: 2;
        }

        .my-booking-row-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .my-booking-row-meta span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: 999px;
          background: rgba(255,255,255,0.04);
          color: var(--muted);
          font-size: 11px;
          font-weight: 700;
          border: 1px solid var(--border);
        }

        .my-booking-row-images {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-start;
        }

        .my-booking-row-images button {
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
          background: transparent;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .my-booking-row-images img {
          display: block;
          width: 54px;
          height: 54px;
          object-fit: cover;
        }

        .my-booking-preview-caption {
          color: var(--muted);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          padding-bottom: 4px;
        }

        .my-booking-status {
          text-transform: capitalize;
          white-space: nowrap;
        }

        .my-booking-badges {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .badge-rescheduled {
          background: rgba(245, 158, 11, 0.16);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.24);
          padding: 4px 8px;
          border-radius: 999px;
          font-weight: 800;
          font-size: 12px;
        }

        .my-booking-chevron {
          color: var(--muted);
        }

        .my-bookings-empty {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 38px 18px;
          text-align: center;
        }

        .my-bookings-empty p {
          color: var(--text);
          font-size: 18px;
          font-weight: 900;
          margin-bottom: 8px;
        }

        .my-bookings-empty span {
          display: block;
          color: var(--muted);
          font-size: 14px;
          margin-bottom: 20px;
        }

        .my-booking-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0,0,0,0.36);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }

        .my-booking-modal {
          width: min(560px, 100%);
          max-height: min(720px, calc(100vh - 36px));
          overflow: auto;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 22px;
          box-shadow: 0 24px 70px rgba(0,0,0,0.22);
        }

        .my-booking-modal-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 14px;
        }

        .my-booking-modal-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 8px;
        }

        .my-booking-modal-hero {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          padding: 14px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: linear-gradient(135deg, rgba(212,175,55,0.12), rgba(255,255,255,0.03));
          margin-bottom: 12px;
        }

        .my-booking-modal-hero-content {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .my-booking-modal-pet-image {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          object-fit: cover;
          border: 1px solid var(--border);
          background: var(--surface);
          flex-shrink: 0;
        }

        .my-booking-modal-hero-label {
          color: var(--accent);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.8px;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .my-booking-modal-hero-title {
          color: var(--text);
          font-size: 16px;
          font-weight: 900;
          line-height: 1.35;
        }

        .my-booking-modal-hero-meta {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }

        .my-booking-modal-hero-meta span {
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.04);
          color: var(--muted);
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
        }

        .my-booking-modal-head h2 {
          color: var(--text);
          font-size: 22px;
          font-weight: 900;
          line-height: 1.25;
          margin: 10px 0 4px;
          overflow-wrap: anywhere;
        }

        .my-booking-modal-head p {
          color: var(--muted);
          font-family: 'DM Mono', monospace;
          font-size: 12px;
        }

        .my-booking-modal-head button {
          width: 38px;
          height: 38px;
          border-radius: 11px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }

        .my-booking-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .my-booking-detail-item,
        .my-booking-detail-note {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 13px;
        }

        .my-booking-detail-item span,
        .my-booking-detail-note strong {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--muted);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 7px;
        }

        .my-booking-detail-item b,
        .my-booking-detail-note p {
          color: var(--text);
          font-size: 14px;
          font-weight: 800;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }

        .my-booking-detail-note {
          margin-top: 10px;
        }

        .my-booking-image-section {
          margin-top: 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px;
        }

        .my-booking-image-section h3 {
          color: var(--text);
          font-size: 14px;
          font-weight: 900;
          margin: 0 0 10px;
        }

        .my-booking-image-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .my-booking-image-card {
          display: grid;
          gap: 6px;
          text-align: left;
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          min-width: 0;
        }

        .my-booking-image-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: var(--muted);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .my-booking-image-icon {
          color: var(--accent);
        }

        .my-booking-image-card img {
          width: 100%;
          aspect-ratio: 4 / 3;
          object-fit: cover;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--card);
        }

        .my-booking-image-lightbox {
          position: fixed;
          inset: 0;
          z-index: 1200;
          background: rgba(0,0,0,0.72);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }

        .my-booking-image-lightbox-shell {
          width: min(900px, 100%);
          max-height: min(90vh, 900px);
          display: grid;
          gap: 10px;
        }

        .my-booking-image-lightbox-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .my-booking-image-lightbox-head span {
          color: white;
          font-size: 13px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .my-booking-image-lightbox-head button {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.24);
          background: rgba(255,255,255,0.12);
          color: white;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .my-booking-image-lightbox img {
          width: 100%;
          max-height: 80vh;
          object-fit: contain;
          border-radius: 16px;
          background: #111;
        }

        .my-booking-cancel-btn {
          width: 100%;
          justify-content: center;
          margin-top: 14px;
        }

        .my-booking-reschedule-btn {
          width: 100%;
          justify-content: center;
          margin-top: 12px;
          background: var(--surface);
          color: var(--accent);
          border: 1px solid rgba(245, 158, 11, 0.16);
        }

        @media (max-width: 640px) {
          .my-bookings-shell {
            padding: 32px 16px 70px;
          }

          .my-bookings-header {
            display: flex;
            flex-wrap: nowrap;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
          }

          .my-bookings-title-group {
            flex: 1 1 auto;
            min-width: 0;
            gap: 8px;
          }

          .my-bookings-header h1 {
            font-size: clamp(22px, 5.4vw, 28px);
            line-height: 1.1;
            margin-bottom: 0;
          }

          .my-bookings-header p {
            display: none;
          }

          .my-bookings-stats {
            display: flex;
            gap: 8px;
            overflow-x: auto;
            padding-bottom: 4px;
            scrollbar-width: none;
          }

          .my-bookings-stat-card {
            flex: 0 0 84px;
            min-width: 84px;
            padding: 10px 10px;
          }

          .my-bookings-stat-card span {
            font-size: 8px;
            letter-spacing: 0.8px;
          }

          .my-bookings-stat-card strong {
            font-size: 14px;
            line-height: 1.1;
          }

          .my-bookings-new {
            width: auto;
            margin-left: 0;
            flex-shrink: 0;
            font-size: 11px;
            padding: 8px 11px;
          }

          .my-bookings-filters {
            gap: 6px;
            flex-wrap: nowrap;
            overflow-x: auto;
            padding-bottom: 2px;
            scrollbar-width: none;
          }

          .my-bookings-filters button {
            font-size: 11px;
            padding: 7px 10px;
            flex: 0 0 auto;
          }

          .my-booking-row {
            padding: 13px;
          }

          .my-booking-row-top {
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
          }

          .my-booking-date {
            flex-direction: row;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
          }

          .my-booking-date strong,
          .my-booking-date small {
            margin: 0;
          }

          .my-booking-row-body {
            flex-direction: row;
            align-items: center;
            gap: 10px;
          }

          .my-booking-main-row {
            flex: 1 1 auto;
            min-width: 0;
            gap: 8px;
          }

          .my-booking-main-copy {
            flex: 1 1 auto;
            min-width: 0;
          }

          .my-booking-preview-side {
            align-items: flex-start;
            margin-left: 0;
            width: auto;
            flex-shrink: 0;
          }

          .my-booking-preview-copy {
            align-items: flex-start;
          }

          .my-booking-row-images {
            justify-content: flex-start;
          }

          .my-booking-badges {
            justify-content: flex-start;
          }

          .my-booking-chevron {
            display: none;
          }

          .my-booking-modal-overlay {
            align-items: flex-end;
            padding: 0;
          }

          .my-booking-modal {
            width: 100%;
            max-height: 86vh;
            border-radius: 18px 18px 0 0;
            padding: 18px;
          }

          .my-booking-modal-hero {
            flex-direction: column;
          }

          .my-booking-modal-hero-meta {
            justify-content: flex-start;
          }

          .my-booking-detail-grid {
            grid-template-columns: 1fr;
          }

          .my-booking-image-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }
        }
      `}</style>
    </div>
  )
}

function Detail({ label, value, icon }) {
  return (
    <div className="my-booking-detail-item">
      <span>{icon}{label}</span>
      <b>{value}</b>
    </div>
  )
}











