// src/admin/AdminBookings.jsx
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore'
import { Calendar, CheckCircle2, Clock, IndianRupee, MessageCircle, Phone, Search, Trash2, X } from 'lucide-react'
import Spinner from '../components/Spinner'
import { useNotifications } from '../context/NotificationContext'
import { db } from '../firebase'
import { syncPublicStats } from '../utils/publicStats'
import { SERVICES, WHATSAPP_NUMBER, buildWhatsAppMessage } from '../utils/services'

const STATUS_OPTS = ['all', 'pending', 'confirmed', 'completed', 'cancelled']
const BADGE = { pending: 'badge-pending', confirmed: 'badge-confirmed', completed: 'badge-completed', cancelled: 'badge-cancelled' }

const statusLabel = (status = 'pending') => status.charAt(0).toUpperCase() + status.slice(1)
const money = (value) => Number(value || 0).toLocaleString('en-IN')
const shortId = (id = '') => `#${id.slice(0, 8).toUpperCase()}`

export default function AdminBookings() {
  const { sendNotification } = useNotifications()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDate = searchParams.get('date') || ''
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [serviceF, setServiceF] = useState('all')
  const [dateFrom, setDateFrom] = useState(requestedDate)
  const [dateTo, setDateTo] = useState(requestedDate)
  const [updating, setUpdating] = useState(null)
  const [cashModal, setCashModal] = useState(null)
  const [cashAmt, setCashAmt] = useState('')
  const [selectedBooking, setSelectedBooking] = useState(null)

  const fetchBookings = async () => {
    setLoading(true)
    try {
      const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      await syncPublicStats(db)
    } catch {
      try {
        const snap = await getDocs(collection(db, 'bookings'))
        const r = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        r.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        setBookings(r)
        await syncPublicStats(db)
      } catch {}
    }
    setLoading(false)
  }

  useEffect(() => { fetchBookings() }, [])

  const filtered = useMemo(() => {
    let r = [...bookings]
    if (statusF !== 'all') r = r.filter(b => b.status === statusF)
    if (serviceF !== 'all') r = r.filter(b => b.serviceId === serviceF || b.serviceIds?.includes?.(serviceF))
    if (dateFrom) r = r.filter(b => b.date && b.date >= dateFrom)
    if (dateTo) r = r.filter(b => b.date && b.date <= dateTo)
    if (search.trim()) {
      const s = search.toLowerCase()
      r = r.filter(b =>
        b.ownerName?.toLowerCase().includes(s) ||
        b.petName?.toLowerCase().includes(s) ||
        b.phone?.includes(s) ||
        b.serviceName?.toLowerCase().includes(s) ||
        b.id?.toLowerCase().includes(s)
      )
    }
    return r
  }, [bookings, serviceF, statusF, search, dateFrom, dateTo])

  const totalEarnings = useMemo(() => (
    bookings
      .filter(b => b.status === 'completed' && b.amountCollected)
      .reduce((sum, b) => sum + (parseFloat(b.amountCollected) || 0), 0)
  ), [bookings])

  const patchBooking = (id, patch) => {
    setBookings(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))
    setSelectedBooking(prev => prev?.id === id ? { ...prev, ...patch } : prev)
  }

  const updateStatus = async (b, status) => {
    if (!b?.id) return
    if (status === 'completed') {
      if (b.status !== 'confirmed') return
      setCashModal(b)
      setCashAmt('')
      return
    }
    if (status === 'confirmed' && b.status !== 'pending') return
    if (status === 'cancelled' && !['pending', 'confirmed'].includes(b.status)) return

    setUpdating(b.id)
    try {
      await updateDoc(doc(db, 'bookings', b.id), { status })
      patchBooking(b.id, { status })
      await syncPublicStats(db)
      if (b.userId && b.userId !== 'walkin') {
        const msgs = {
          confirmed: 'Your booking has been approved.',
          cancelled: 'Your booking was cancelled.',
        }
        if (msgs[status]) {
          await sendNotification(b.userId, {
            title: `Booking ${statusLabel(status)}`,
            message: `${b.serviceName} on ${b.date} at ${b.slot} - ${msgs[status]}`,
            type: status,
            bookingId: b.id,
          })
        }
      }
    } catch {}
    setUpdating(null)
  }

  const handleComplete = async () => {
    if (!cashModal || cashModal.status !== 'confirmed') return
    setUpdating(cashModal.id)
    const amt = parseFloat(cashAmt) || 0
    try {
      await updateDoc(doc(db, 'bookings', cashModal.id), { status: 'completed', amountCollected: amt })
      patchBooking(cashModal.id, { status: 'completed', amountCollected: amt })
      await syncPublicStats(db)
      if (cashModal.userId && cashModal.userId !== 'walkin') {
        await sendNotification(cashModal.userId, {
          title: 'Appointment Completed',
          message: `${cashModal.serviceName} for ${cashModal.petName} completed. Thank you!`,
          type: 'completed',
          bookingId: cashModal.id,
        })
      }
    } catch {}
    setCashModal(null)
    setCashAmt('')
    setUpdating(null)
  }

  const deleteBooking = async (b) => {
    if (!b?.id) return
    if (!window.confirm(`Delete booking ${shortId(b.id)}? This will remove it from booking counts and collected earnings.`)) return
    setUpdating(b.id)
    try {
      await deleteDoc(doc(db, 'bookings', b.id))
      setBookings(prev => prev.filter(x => x.id !== b.id))
      setSelectedBooking(prev => prev?.id === b.id ? null : prev)
      await syncPublicStats(db)
    } catch {}
    setUpdating(null)
  }

  const stop = (event) => event.stopPropagation()

  const S = {
    meta: { display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0 },
    iconBtn: (color, bg) => ({ border: `1px solid ${color}`, background: bg, color }),
  }

  return (
    <div className="admin-bookings-page">
      <div className="admin-bookings-header">
        <div>
          <h1>Bookings</h1>
          <p>
            {filtered.length} of {bookings.length} bookings
            {totalEarnings > 0 && <span>Total Collected: Rs {money(totalEarnings)}</span>}
          </p>
        </div>
      </div>

      <div className="admin-booking-filters">
        <div className="admin-booking-search">
          <Search size={14} />
          <input placeholder="Search name, pet, phone or ID" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={statusF} onChange={e => setStatusF(e.target.value)}>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s === 'all' ? 'All Status' : statusLabel(s)}</option>)}
        </select>
        <select value={serviceF} onChange={e => setServiceF(e.target.value)}>
          <option value="all">All Services</option>
          {SERVICES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="date" aria-label="From date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" aria-label="To date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        {(dateFrom || dateTo) && <button type="button" className="admin-booking-clear-filter" onClick={() => { setDateFrom(''); setDateTo(''); setSearchParams({}) }}>Clear dates</button>}
      </div>

      {loading ? <Spinner text="Loading bookings..." /> : filtered.length === 0 ? (
        <div className="admin-booking-empty">No bookings found.</div>
      ) : (
        <div className="admin-booking-list">
          {filtered.map(b => (
            <button key={b.id} type="button" className="admin-booking-card" onClick={() => setSelectedBooking(b)}>
              <div className="admin-booking-main">
                <div className="admin-booking-title-row">
                  <strong>{b.ownerName || 'Customer'}</strong>
                  <span>{shortId(b.id)}</span>
                  {b.isWalkIn && <span className="badge badge-walkin">Walk-in</span>}
                </div>
                <p>{b.petName || 'Pet'}{b.petType ? ` (${b.petType}${b.petBreed ? `, ${b.petBreed}` : ''})` : ''}</p>
                <p>{b.serviceName || 'Service'}{b.packageNames?.length > 0 ? ` + ${b.packageNames.join(', ')}` : ''}</p>
                <div className="admin-booking-min-meta">
                  <span style={S.meta}><Calendar size={13} /> {b.date || '-'}</span>
                  <span style={S.meta}><Clock size={13} /> {b.slot || '-'}</span>
                  <span style={S.meta}><Phone size={13} /> {b.phone || '-'}</span>
                  {b.amountCollected > 0 && <span className="admin-booking-money">Rs {money(b.amountCollected)}</span>}
                </div>
              </div>

              <div className="admin-booking-actions" onClick={stop}>
                <span className={`badge ${BADGE[b.status] || 'badge-pending'}`}>{statusLabel(b.status || 'pending')}</span>
                <div>
                  {b.status === 'pending' && (
                    <button type="button" onClick={() => updateStatus(b, 'confirmed')} disabled={updating === b.id} style={S.iconBtn('#34d399', 'rgba(52,211,153,0.1)')}>
                      <CheckCircle2 size={14} /> Approve
                    </button>
                  )}
                  {b.status === 'confirmed' && (
                    <button type="button" onClick={() => updateStatus(b, 'completed')} disabled={updating === b.id} style={S.iconBtn('var(--accent)', 'var(--accent-bg)')}>
                      <IndianRupee size={14} /> Complete
                    </button>
                  )}
                  {['pending', 'confirmed'].includes(b.status) && (
                    <button type="button" onClick={() => updateStatus(b, 'cancelled')} disabled={updating === b.id} style={S.iconBtn('#ef4444', 'rgba(239,68,68,0.1)')}>
                      <X size={14} /> Cancel
                    </button>
                  )}
                  {['completed', 'cancelled'].includes(b.status) && (
                    <button type="button" onClick={() => deleteBooking(b)} disabled={updating === b.id} style={S.iconBtn('#ef4444', 'rgba(239,68,68,0.1)')}>
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                  <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${buildWhatsAppMessage(b)}`} target="_blank" rel="noopener noreferrer" style={S.iconBtn('#25D366', 'rgba(37,211,102,0.1)')}>
                    <MessageCircle size={14} /> WA
                  </a>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          updating={updating}
          onClose={() => setSelectedBooking(null)}
          onStatus={updateStatus}
          onDelete={deleteBooking}
        />
      )}

      {cashModal && (
        <div className="modal-overlay" onClick={() => setCashModal(null)}>
          <div className="modal-box admin-booking-cash-modal" onClick={e => e.stopPropagation()}>
            <div>
              <h2>Complete Appointment</h2>
              <p>{cashModal.ownerName} · {cashModal.serviceName} · {cashModal.date}</p>
              <label>Cash Collected (Rs)</label>
              <div className="admin-booking-cash-input">
                <span>Rs</span>
                <input className="input" type="number" min="0" placeholder="e.g. 600" value={cashAmt} onChange={e => setCashAmt(e.target.value)} autoFocus />
              </div>
              {cashAmt && <p className="admin-booking-confirm-money">Rs {money(cashAmt)} will be recorded</p>}
              <div className="admin-booking-modal-actions">
                <button onClick={() => setCashModal(null)} className="btn btn-secondary">Cancel</button>
                <button onClick={handleComplete} className="btn btn-primary">Mark Complete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BookingDetailModal({ booking, updating, onClose, onStatus, onDelete }) {
  const detailRows = [
    ['Booking ID', shortId(booking.id)],
    ['Owner', booking.ownerName || '-'],
    ['Phone', booking.phone || '-'],
    ['Pet', `${booking.petName || '-'}${booking.petType ? ` (${booking.petType}${booking.petBreed ? `, ${booking.petBreed}` : ''})` : ''}`],
    ['Service', booking.serviceName || '-'],
    ['Packages', booking.packageNames?.length ? booking.packageNames.join(', ') : '-'],
    ['Date', booking.date || '-'],
    ['Time', booking.slot || '-'],
    ['Source', booking.isWalkIn ? 'Walk-in' : 'Online'],
    ['Amount Collected', booking.amountCollected > 0 ? `Rs ${money(booking.amountCollected)}` : '-'],
    ['Notes', booking.notes || '-'],
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box admin-booking-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-booking-detail-head">
          <div>
            <span className={`badge ${BADGE[booking.status] || 'badge-pending'}`}>{statusLabel(booking.status || 'pending')}</span>
            <h2>{booking.ownerName || 'Booking Details'}</h2>
            <p>{booking.serviceName || 'Service'} · {booking.date || '-'} · {booking.slot || '-'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close booking details"><X size={18} /></button>
        </div>

        <div className="admin-booking-detail-grid">
          {detailRows.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <div className="admin-booking-detail-actions">
          {booking.status === 'pending' && (
            <button type="button" onClick={() => onStatus(booking, 'confirmed')} disabled={updating === booking.id} className="btn btn-secondary">
              <CheckCircle2 size={15} /> Approve
            </button>
          )}
          {booking.status === 'confirmed' && (
            <button type="button" onClick={() => onStatus(booking, 'completed')} disabled={updating === booking.id} className="btn btn-primary">
              <IndianRupee size={15} /> Complete
            </button>
          )}
          {['pending', 'confirmed'].includes(booking.status) && (
            <button type="button" onClick={() => onStatus(booking, 'cancelled')} disabled={updating === booking.id} className="btn btn-danger">
              <X size={15} /> Cancel
            </button>
          )}
          {['completed', 'cancelled'].includes(booking.status) && (
            <button type="button" onClick={() => onDelete(booking)} disabled={updating === booking.id} className="btn btn-danger">
              <Trash2 size={15} /> Delete
            </button>
          )}
          <a className="btn btn-secondary" href={`https://wa.me/${WHATSAPP_NUMBER}?text=${buildWhatsAppMessage(booking)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={15} /> WhatsApp
          </a>
        </div>
      </div>
    </div>
  )
}

