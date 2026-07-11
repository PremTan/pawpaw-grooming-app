// src/pages/MyBookings.jsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, orderBy, getDocs, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { Calendar, ChevronRight, Clock, Home, Plus, Store, UserRound, X } from 'lucide-react'
import { ADMIN_EMAIL, db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'
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

export default function MyBookings() {
  const { user } = useAuth()
  const { sendNotification } = useNotifications()
  const [bookings, setBookings] = useState([])
  const [bookingSettings, setBookingSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [cancellingId, setCancellingId] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleSlot, setRescheduleSlot] = useState('')
  const [rescheduleBookedSlots, setRescheduleBookedSlots] = useState([])
  const [reschedulingId, setReschedulingId] = useState('')

  useEffect(() => {
    fetchBookingSettings(db).then(setBookingSettings).catch(() => {})
  }, [])

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
    } catch (err) {
      console.error("FIREBASE ERROR:", err);
      alert('Could not cancel booking. Please try again.')
    }
    setCancellingId('')
  }

  return (
    <div className="my-bookings-page">
      <div className="my-bookings-shell">
        <div className="my-bookings-header">
          <div>
            <h1>My Bookings</h1>
            <p>{bookings.length} total appointment{bookings.length !== 1 ? 's' : ''}</p>
          </div>
          <Link to="/book" className="btn btn-primary my-bookings-new">
            <Plus size={16} /> New Booking
          </Link>
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
            {filtered.map(booking => (
              <button key={booking.id} type="button" className="my-booking-row" onClick={() => setSelectedBooking(booking)}>
                <span className="my-booking-date">
                  <strong>{booking.date || '-'}</strong>
                  <small>{formatSlot(booking.slot)}</small>
                </span>
                <span className="my-booking-main">
                  <strong>{appointmentTitle(booking)}</strong>
                  <small>{petLine(booking)}</small>
                </span>
                <span className="my-booking-badges">
                  <span className={`badge ${STATUS_BADGE[booking.status] || 'badge-pending'} my-booking-status`}>{statusLabel(booking.status)}</span>
                  {(booking.rescheduleCount || 0) > 0 && (
                    <span className="badge badge-rescheduled">
                      Rescheduled
                    </span>
                  )}
                </span>
                <ChevronRight size={17} className="my-booking-chevron" />
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedBooking && (
        <div className="my-booking-modal-overlay" onClick={() => setSelectedBooking(null)}>
          <section className="my-booking-modal" onClick={event => event.stopPropagation()}>
            <div className="my-booking-modal-head">
              <div>
                <span className={`badge ${STATUS_BADGE[selectedBooking.status] || 'badge-pending'}`}>{statusLabel(selectedBooking.status)}</span>
                {(selectedBooking.rescheduleCount || 0) > 0 && (
                  <span className="badge badge-rescheduled" style={{ marginLeft: '8px' }}>
                    Rescheduled
                  </span>
                )}
                <h2>{appointmentTitle(selectedBooking)}</h2>
                <p>{shortId(selectedBooking.id)}</p>
              </div>
              <button type="button" onClick={() => setSelectedBooking(null)} aria-label="Close booking details">
                <X size={18} />
              </button>
            </div>

            <div className="my-booking-detail-grid">
              <Detail label="Pet" value={selectedBooking.petName || '-'} />
              <Detail label="Breed" value={selectedBooking.petBreed || selectedBooking.petType || '-'} />
              <Detail label="Date" value={selectedBooking.date || '-'} icon={<Calendar size={15} />} />
              <Detail label="Time" value={formatSlot(selectedBooking.slot)} icon={<Clock size={15} />} />
              <Detail label="Request Sent" value={formatDateTime(selectedBooking.createdAt)} />
              <Detail label="Appointment Date & Time" value={formatAppointmentStart(selectedBooking)} />
              {selectedBooking.status === 'cancelled' && <Detail label="Cancelled By" value={selectedBooking.cancelledBy === 'admin' ? 'Paw Paw' : 'You'} />}
              {selectedBooking.status === 'cancelled' && <Detail label="Cancelled At" value={formatDateTime(selectedBooking.cancelledAt)} />}
              {selectedBooking.status === 'cancelled' && selectedBooking.cancellationReason && <Detail label="Reason" value={selectedBooking.cancellationReason} />}
              <Detail label="Visit" value={getBookingTypeLabel(selectedBooking.bookingType || 'store')} icon={(selectedBooking.bookingType || 'store') === 'home' ? <Home size={15} /> : <Store size={15} />} />
              {assignedWorker(selectedBooking) && <Detail label="Assigned To" value={`${assignedWorker(selectedBooking)}${selectedBooking.assignedTeamMemberIsOwner ? ' (Owner)' : ''}`} icon={<UserRound size={15} />} />}
              {selectedBooking.packageNames?.length > 0 && <Detail label="Packages" value={selectedBooking.packageNames.join(', ')} />}
              {serviceNamesFor(selectedBooking).length > 0 && <Detail label="Services" value={serviceNamesFor(selectedBooking).join(', ')} />}
              {(selectedBooking.rescheduleCount || 0) > 0 && <Detail label="Reschedules" value={`${selectedBooking.rescheduleCount || 0} time${(selectedBooking.rescheduleCount || 0) === 1 ? '' : 's'}`} />}
              {(selectedBooking.rescheduledBy || selectedBooking.previousDate) && <Detail label="Last Rescheduled" value={selectedBooking.rescheduledBy ? `${selectedBooking.rescheduledBy === 'admin' ? 'Admin' : 'You'} · ${selectedBooking.previousDate || '-'} ${selectedBooking.previousSlot ? `• ${formatSlot(selectedBooking.previousSlot)}` : ''}` : `${selectedBooking.previousDate || '-'} ${selectedBooking.previousSlot ? `• ${formatSlot(selectedBooking.previousSlot)}` : ''}`} />}
              {Number(selectedBooking.visitCharge || 0) > 0 && <Detail label="Visit Charge" value={`Rs ${money(selectedBooking.visitCharge)}`} />}
              {Number(selectedBooking.estimatedTotal || 0) > 0 && <Detail label="Estimated Total" value={`Rs ${money(selectedBooking.estimatedTotal)}+`} />}
              {(selectedBooking.paymentMode || selectedBooking.paymentPreference) && <Detail label="Payment" value={selectedBooking.paymentMode ? getPaymentModeLabel(selectedBooking.paymentMode) : getPaymentOptionLabel(selectedBooking.paymentPreference)} />}
              {Number(selectedBooking.amountCollected || 0) > 0 && <Detail label="Paid" value={`Rs ${money(selectedBooking.amountCollected)}`} />}
            </div>

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
                      <button key={slot} type="button" disabled={disabled} onClick={() => setRescheduleSlot(slot)} className={`slot-btn slot-btn-available${isPast ? ' slot-btn-past' : ''}${isBooked ? ' slot-btn-booked' : ''}${rescheduleSlot === slot ? ' selected' : ''}`}>
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
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 22px;
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
          display: grid;
          grid-template-columns: minmax(84px, 112px) minmax(0, 1fr) auto 18px;
          gap: 12px;
          align-items: center;
          text-align: left;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 14px;
          cursor: pointer;
          box-shadow: 0 12px 34px rgba(0,0,0,0.05);
        }

        .my-booking-row:hover,
        .my-booking-row:focus-visible {
          border-color: var(--accent);
          outline: none;
        }

        .my-booking-date,
        .my-booking-main {
          min-width: 0;
        }

        .my-booking-date strong,
        .my-booking-date small,
        .my-booking-main strong,
        .my-booking-main small {
          display: block;
        }

        .my-booking-date strong {
          color: var(--text);
          font-size: 13px;
          font-weight: 800;
        }

        .my-booking-date small,
        .my-booking-date em {
          color: var(--muted);
          font-size: 12px;
          margin-top: 4px;
          font-style: normal;
        }

        .my-booking-date em {
          font-size: 11px;
        }

        .my-booking-main strong {
          color: var(--text);
          font-size: 15px;
          font-weight: 900;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .my-booking-main small {
          color: var(--muted);
          font-size: 13px;
          margin-top: 5px;
          overflow-wrap: anywhere;
        }

        .my-booking-status {
          justify-self: end;
          text-transform: capitalize;
          white-space: nowrap;
        }

        .my-booking-badges {
          justify-self: end;
          display: inline-flex;
          gap: 8px;
          align-items: center;
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
          margin-bottom: 18px;
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
            display: grid;
          }

          .my-bookings-new {
            width: fit-content;
          }

          .my-booking-row {
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 10px;
            padding: 13px;
          }

          .my-booking-date {
            grid-column: 1 / -1;
            display: flex;
            gap: 10px;
            align-items: center;
          }

          .my-booking-date strong,
          .my-booking-date small {
            margin: 0;
          }

          .my-booking-main {
            grid-column: 1;
          }

          .my-booking-status {
            grid-column: 2;
            grid-row: 2;
            align-self: start;
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

          .my-booking-detail-grid {
            grid-template-columns: 1fr;
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











