// src/admin/AdminBoarding.jsx
import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  setDoc,
  getDoc,
} from 'firebase/firestore'
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Heart,
  IndianRupee,
  LogIn,
  LogOut,
  MessageCircle,
  PawPrint,
  Phone,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  User,
  Utensils,
  X,
} from 'lucide-react'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import {
  BOARDING_STATUS,
  buildBoardingWhatsAppMessage,
  fetchBoardingSettings,
  normalizeBoardingSettings,
} from '../utils/boardingSettings'
import { fetchBusinessInfo } from '../utils/businessInfo'

const STATUS_OPTS = ['all', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled']

const STATUS_BADGE = {
  pending: 'badge-pending',
  confirmed: 'badge-confirmed',
  checked_in: 'badge-confirmed',
  checked_out: 'badge-completed',
  cancelled: 'badge-cancelled',
}

const statusLabel = (st = 'pending') => {
  if (st === 'checked_in') return 'Checked In'
  if (st === 'checked_out') return 'Checked Out'
  return st.charAt(0).toUpperCase() + st.slice(1)
}

const money = (val) => Number(val || 0).toLocaleString('en-IN')
const shortId = (id = '') => `#${id.slice(0, 8).toUpperCase()}`

export default function AdminBoarding() {
  const { user } = useAuth()
  const { sendNotification } = useNotifications()

  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [selectedBooking, setSelectedBooking] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [checkoutModal, setCheckoutModal] = useState(null)
  const [checkoutAmount, setCheckoutAmount] = useState('')

  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settingsForm, setSettingsForm] = useState(null)
  const [savingSettings, setSavingSettings] = useState(false)

  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState('')
  const [shopName, setShopName] = useState('Paw Paw Pet Grooming')

  const fetchBoardings = async () => {
    setLoading(true)
    try {
      const q = query(collection(db, 'boardingBookings'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {
      try {
        const snap2 = await getDocs(collection(db, 'boardingBookings'))
        const r = snap2.docs.map(d => ({ id: d.id, ...d.data() }))
        r.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        setBookings(r)
      } catch (err) {
        console.error('Fetch boarding error:', err)
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchBoardings()
    fetchBusinessInfo(db).then(biz => {
      setAdminWhatsappNumber(biz.whatsappNumber || '')
      setShopName(biz.contact.shopName || 'Paw Paw Pet Grooming')
    })
    fetchBoardingSettings(db).then(s => setSettingsForm(s))
  }, [])

  useEffect(() => {
    if (!toastMessage) return
    const t = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [toastMessage])

  const filtered = useMemo(() => {
    let r = [...bookings]
    if (statusF !== 'all') r = r.filter(b => b.status === statusF)
    if (dateFrom) r = r.filter(b => b.checkInDate && b.checkInDate >= dateFrom)
    if (dateTo) r = r.filter(b => b.checkInDate && b.checkInDate <= dateTo)
    if (search.trim()) {
      const s = search.toLowerCase()
      r = r.filter(b =>
        b.ownerName?.toLowerCase().includes(s) ||
        b.petName?.toLowerCase().includes(s) ||
        b.phone?.includes(s) ||
        b.id?.toLowerCase().includes(s)
      )
    }
    return r
  }, [bookings, statusF, dateFrom, dateTo, search])

  const stats = useMemo(() => {
    const total = bookings.length
    const checkedIn = bookings.filter(b => b.status === BOARDING_STATUS.CHECKED_IN).length
    const upcoming = bookings.filter(b => b.status === BOARDING_STATUS.CONFIRMED).length
    const pending = bookings.filter(b => b.status === BOARDING_STATUS.PENDING).length
    const completed = bookings.filter(b => b.status === BOARDING_STATUS.CHECKED_OUT)
    const revenue = completed.reduce((sum, b) => sum + (Number(b.amountCollected || b.estimatedTotal) || 0), 0)

    return { total, checkedIn, upcoming, pending, revenue }
  }, [bookings])

  const patchLocal = (id, patch) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
    setSelectedBooking(prev => prev?.id === id ? { ...prev, ...patch } : prev)
  }

  // Confirm / Approve request
  const handleConfirm = async (b) => {
    setUpdating(b.id)
    try {
      const patch = { status: BOARDING_STATUS.CONFIRMED, updatedAt: serverTimestamp(), confirmedAt: serverTimestamp() }
      await updateDoc(doc(db, 'boardingBookings', b.id), patch)
      patchLocal(b.id, { ...patch, updatedAt: new Date(), confirmedAt: new Date() })

      if (b.userId) {
        await sendNotification(b.userId, {
          title: 'Pet Boarding Confirmed!',
          message: `Your pet ${b.petName}'s stay from ${b.checkInDate} to ${b.checkOutDate} has been confirmed. We look forward to hosting them!`,
          type: 'boarding_confirmed',
          bookingId: b.id,
          actionUrl: '/my-bookings',
        })
      }
      setToastType('success')
      setToastMessage('Boarding request confirmed.')
    } catch {
      setToastType('error')
      setToastMessage('Could not confirm boarding.')
    }
    setUpdating(null)
  }

  // Check In
  const handleCheckIn = async (b) => {
    setUpdating(b.id)
    try {
      const patch = { status: BOARDING_STATUS.CHECKED_IN, updatedAt: serverTimestamp(), checkedInAt: serverTimestamp() }
      await updateDoc(doc(db, 'boardingBookings', b.id), patch)
      patchLocal(b.id, { ...patch, updatedAt: new Date(), checkedInAt: new Date() })

      if (b.userId) {
        await sendNotification(b.userId, {
          title: `${b.petName} has Checked In!`,
          message: `${b.petName} is safely settled into their cozy suite. We will keep you updated!`,
          type: 'boarding_checked_in',
          bookingId: b.id,
          actionUrl: '/my-bookings',
        })
      }
      setToastType('success')
      setToastMessage(`${b.petName} marked as checked in.`)
    } catch {
      setToastType('error')
      setToastMessage('Could not update check-in.')
    }
    setUpdating(null)
  }

  // Check Out
  const openCheckOutModal = (b) => {
    setCheckoutModal(b)
    setCheckoutAmount(String(b.estimatedTotal || ''))
  }

  const confirmCheckOut = async () => {
    if (!checkoutModal) return
    const amt = Number(checkoutAmount) || Number(checkoutModal.estimatedTotal) || 0
    setUpdating(checkoutModal.id)
    try {
      const patch = {
        status: BOARDING_STATUS.CHECKED_OUT,
        amountCollected: amt,
        updatedAt: serverTimestamp(),
        checkedOutAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'boardingBookings', checkoutModal.id), patch)
      patchLocal(checkoutModal.id, { ...patch, updatedAt: new Date(), checkedOutAt: new Date() })

      if (checkoutModal.userId) {
        await sendNotification(checkoutModal.userId, {
          title: 'Pet Boarding Completed',
          message: `Thank you for trusting Paw Paw with ${checkoutModal.petName}'s stay! Hope to see them again soon.`,
          type: 'boarding_completed',
          bookingId: checkoutModal.id,
          actionUrl: '/my-bookings',
        })
      }
      setToastType('success')
      setToastMessage('Pet checked out and payment recorded.')
      setCheckoutModal(null)
    } catch {
      setToastType('error')
      setToastMessage('Could not complete check-out.')
    }
    setUpdating(null)
  }

  // Cancel / Reject
  const confirmCancel = async () => {
    if (!cancelTarget) return
    setUpdating(cancelTarget.id)
    try {
      const patch = {
        status: BOARDING_STATUS.CANCELLED,
        cancelledBy: 'admin',
        cancellationReason: cancelReason.trim() || 'Unavailable suite dates',
        updatedAt: serverTimestamp(),
        cancelledAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'boardingBookings', cancelTarget.id), patch)
      patchLocal(cancelTarget.id, { ...patch, updatedAt: new Date(), cancelledAt: new Date() })

      if (cancelTarget.userId) {
        await sendNotification(cancelTarget.userId, {
          title: 'Boarding Request Cancelled',
          message: `Your boarding request for ${cancelTarget.petName} was cancelled by admin. Reason: ${cancelReason.trim() || 'Suite unavailable'}`,
          type: 'boarding_cancelled',
          bookingId: cancelTarget.id,
          actionUrl: '/my-bookings',
        })
      }
      setToastType('success')
      setToastMessage('Boarding request cancelled.')
      setCancelTarget(null)
      setCancelReason('')
    } catch {
      setToastType('error')
      setToastMessage('Could not cancel boarding request.')
    }
    setUpdating(null)
  }

  // Save Settings
  const saveBoardingSettings = async () => {
    setSavingSettings(true)
    try {
      await setDoc(doc(db, 'settings', 'boardingSettings'), {
        ...settingsForm,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setToastType('success')
      setToastMessage('Boarding settings updated successfully.')
      setShowSettingsModal(false)
    } catch {
      setToastType('error')
      setToastMessage('Failed to save boarding settings.')
    }
    setSavingSettings(false)
  }

  return (
    <div className="admin-page">
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Building2 size={26} style={{ color: 'var(--accent)' }} /> Pet Boarding Reservations
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Manage overnight pet stays, check-ins, check-outs, and customer care instructions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 700,
            padding: '6px 12px',
            borderRadius: '999px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: (settingsForm?.acceptBookings !== false) ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
            color: (settingsForm?.acceptBookings !== false) ? '#34d399' : '#ef4444',
            border: `1px solid ${(settingsForm?.acceptBookings !== false) ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: (settingsForm?.acceptBookings !== false) ? '#34d399' : '#ef4444' }} />
            {(settingsForm?.acceptBookings !== false) ? 'Bookings Open' : 'Bookings Closed'}
          </div>

          <button onClick={() => setShowSettingsModal(true)} className="btn btn-secondary" style={{ fontSize: '13px', padding: '8px 14px' }}>
            <Settings size={15} /> Rates & Settings
          </button>
          <button onClick={fetchBoardings} className="btn btn-secondary" style={{ fontSize: '13px', padding: '8px 14px' }}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <div style={{ padding: '16px', borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total Stays</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>{stats.total}</div>
        </div>
        <div style={{ padding: '16px', borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase' }}>Currently Checked In</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#60a5fa', marginTop: '4px' }}>{stats.checkedIn}</div>
        </div>
        <div style={{ padding: '16px', borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase' }}>Pending Requests</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>{stats.pending}</div>
        </div>
        <div style={{ padding: '16px', borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 700, textTransform: 'uppercase' }}>Boarding Revenue</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>₹{money(stats.revenue)}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ padding: '16px', borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--border)', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
        <div style={{ flex: '1 1 220px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            className="input"
            placeholder="Search by customer, pet, phone..."
            style={{ paddingLeft: '36px' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {STATUS_OPTS.map(st => (
            <button
              key={st}
              onClick={() => setStatusF(st)}
              className={`filter-btn${statusF === st ? ' active' : ''}`}
              style={{
                padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${statusF === st ? 'var(--accent)' : 'var(--border)'}`,
                background: statusF === st ? 'var(--accent-bg)' : 'transparent',
                color: statusF === st ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              {statusLabel(st)}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings Table / List */}
      {loading ? (
        <Spinner text="Loading boarding requests..." />
      ) : filtered.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
          <Building2 size={36} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
          <h3 style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 700, margin: '0 0 6px' }}>No boarding requests found</h3>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 0 }}>Reservations made by customers will appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {filtered.map(b => {
            const isPending = b.status === BOARDING_STATUS.PENDING
            const isConfirmed = b.status === BOARDING_STATUS.CONFIRMED
            const isCheckedIn = b.status === BOARDING_STATUS.CHECKED_IN

            return (
              <div
                key={b.id}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '18px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '14px',
                }}
              >
                {/* Left: Pet & Customer Details */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '240px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                    {b.petPhotoUrl ? (
                      <img src={b.petPhotoUrl} alt={b.petName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
                    ) : (
                      <PawPrint size={22} />
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '15px', color: 'var(--text)' }}>{b.petName}</strong>
                      <span className={`badge ${STATUS_BADGE[b.status] || 'badge-pending'}`}>
                        {statusLabel(b.status)}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                      {b.petType} {b.petBreed ? `· ${b.petBreed}` : ''}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text)', marginTop: '2px' }}>
                      Owner: {b.ownerName} ({b.phone})
                    </div>
                  </div>
                </div>

                {/* Middle: Stay dates */}
                <div style={{ minWidth: '180px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Stay Schedule</div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600, marginTop: '2px' }}>
                    {b.checkInDate} → {b.checkOutDate}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 700, marginTop: '2px' }}>
                    {b.stayDays || 1} Day(s) · ₹{b.estimatedTotal || 0}
                  </div>
                </div>

                {/* Right: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSelectedBooking(b)}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '7px 12px' }}
                  >
                    <Eye size={14} /> View Details
                  </button>

                  {/* WhatsApp */}
                  {adminWhatsappNumber && (
                    <a
                      href={`https://wa.me/${adminWhatsappNumber}?text=${buildBoardingWhatsAppMessage(b, shopName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ fontSize: '12px', padding: '7px 10px', color: '#25D366' }}
                      title="WhatsApp customer"
                    >
                      <MessageCircle size={15} />
                    </a>
                  )}

                  {/* Approve */}
                  {isPending && (
                    <button
                      onClick={() => handleConfirm(b)}
                      disabled={updating === b.id}
                      className="btn btn-primary"
                      style={{ fontSize: '12px', padding: '7px 14px' }}
                    >
                      <Check size={14} /> Approve
                    </button>
                  )}

                  {/* Check In */}
                  {isConfirmed && (
                    <button
                      onClick={() => handleCheckIn(b)}
                      disabled={updating === b.id}
                      className="btn btn-primary"
                      style={{ fontSize: '12px', padding: '7px 14px', background: '#3b82f6' }}
                    >
                      <LogIn size={14} /> Check In
                    </button>
                  )}

                  {/* Check Out */}
                  {isCheckedIn && (
                    <button
                      onClick={() => openCheckOutModal(b)}
                      disabled={updating === b.id}
                      className="btn btn-primary"
                      style={{ fontSize: '12px', padding: '7px 14px', background: '#10b981' }}
                    >
                      <LogOut size={14} /> Check Out
                    </button>
                  )}

                  {/* Cancel / Reject */}
                  {(isPending || isConfirmed) && (
                    <button
                      onClick={() => setCancelTarget(b)}
                      className="btn btn-secondary"
                      style={{ fontSize: '12px', padding: '7px 10px', color: '#ef4444' }}
                      title="Cancel or reject request"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* FULL DETAILS MODAL */}
      {selectedBooking && (
        <div className="modal-overlay" onClick={() => setSelectedBooking(null)}>
          <div className="reschedule-modal-card" style={{ maxWidth: '640px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="reschedule-modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Boarding Reservation #{selectedBooking.id.slice(0, 8).toUpperCase()}</h3>
                <span className={`badge ${STATUS_BADGE[selectedBooking.status]}`} style={{ marginTop: '4px', display: 'inline-block' }}>
                  {statusLabel(selectedBooking.status)}
                </span>
              </div>
              <button type="button" className="icon-btn" onClick={() => setSelectedBooking(null)}><X size={18} /></button>
            </div>

            <div style={{ display: 'grid', gap: '14px', maxHeight: '68vh', overflowY: 'auto', paddingRight: '4px' }}>
              {/* Pet & Owner Section */}
              <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>Pet & Owner Details</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px', fontSize: '13px' }}>
                  <div><strong>Pet:</strong> {selectedBooking.petName} ({selectedBooking.petType} - {selectedBooking.petBreed || 'N/A'})</div>
                  <div><strong>Gender / Weight:</strong> {selectedBooking.petGender || 'N/A'} · {selectedBooking.petWeight ? `${selectedBooking.petWeight} kg` : 'N/A'}</div>
                  <div><strong>Owner:</strong> {selectedBooking.ownerName}</div>
                  <div><strong>Phone:</strong> {selectedBooking.phone}</div>
                  <div><strong>Email:</strong> {selectedBooking.userEmail || 'N/A'}</div>
                  <div><strong>Emergency:</strong> {selectedBooking.emergencyContactName ? `${selectedBooking.emergencyContactName} (${selectedBooking.emergencyContactPhone})` : 'None'}</div>
                </div>
              </div>

              {/* Health & Vaccine */}
              <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>Health & Vaccinations</span>
                <div style={{ display: 'grid', gap: '6px', marginTop: '8px', fontSize: '13px' }}>
                  <div><strong>Vaccination Status:</strong> {selectedBooking.vaccinationStatus}</div>
                  {selectedBooking.vaccinationNotes && <div><strong>Vaccine Notes:</strong> {selectedBooking.vaccinationNotes}</div>}
                  {selectedBooking.medicalConditions && <div><strong>Medical Conditions / Meds:</strong> {selectedBooking.medicalConditions}</div>}
                </div>
              </div>

              {/* Stay Schedule & Pricing */}
              <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>Stay & Billing</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px', fontSize: '13px' }}>
                  <div><strong>Check-In:</strong> {selectedBooking.checkInDate} at {selectedBooking.checkInTime}</div>
                  <div><strong>Check-Out:</strong> {selectedBooking.checkOutDate} at {selectedBooking.checkOutTime}</div>
                  <div><strong>Duration:</strong> {selectedBooking.stayDays} Day(s) ({selectedBooking.stayNights || 0} Nights)</div>
                  <div><strong>Daily Rate:</strong> ₹{selectedBooking.dailyRate}</div>
                  <div><strong>Estimated Total:</strong> <span style={{ color: 'var(--accent)', fontWeight: 800 }}>₹{selectedBooking.estimatedTotal}</span></div>
                  <div><strong>Amount Collected:</strong> {selectedBooking.amountCollected ? `₹${selectedBooking.amountCollected}` : 'Pending collection'}</div>
                </div>
              </div>

              {/* Food & Care Preferences */}
              <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>Food & Care Instructions</span>
                <div style={{ display: 'grid', gap: '6px', marginTop: '8px', fontSize: '13px' }}>
                  <div><strong>Food Type:</strong> {selectedBooking.foodType}</div>
                  <div><strong>Food Provider:</strong> {selectedBooking.foodProvider}</div>
                  <div><strong>Feeding Schedule:</strong> {selectedBooking.feedingSchedule}</div>
                  {selectedBooking.specialDietInstructions && <div><strong>Diet/Water Notes:</strong> {selectedBooking.specialDietInstructions}</div>}
                  {selectedBooking.walkingFrequency !== 'N/A' && <div><strong>Walking Routine:</strong> {selectedBooking.walkingFrequency}</div>}
                  {selectedBooking.sleepingHabits && <div><strong>Sleeping Habits:</strong> {selectedBooking.sleepingHabits}</div>}
                  {selectedBooking.toiletHabits && <div><strong>Toilet Habits:</strong> {selectedBooking.toiletHabits}</div>}
                  {selectedBooking.behaviorNotes && <div><strong>Behavior around pets:</strong> {selectedBooking.behaviorNotes}</div>}
                  <div><strong>Separation Anxiety:</strong> {selectedBooking.separationAnxiety}</div>
                  {selectedBooking.additionalInstructions && <div><strong>Special Requests:</strong> {selectedBooking.additionalInstructions}</div>}
                </div>
              </div>
            </div>

            <div className="reschedule-modal-footer" style={{ marginTop: '16px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedBooking(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* CHECK OUT MODAL */}
      {checkoutModal && (
        <div className="modal-overlay" onClick={() => setCheckoutModal(null)}>
          <div className="reschedule-modal-card" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="reschedule-modal-header">
              <h3>Check Out Pet</h3>
              <button type="button" className="icon-btn" onClick={() => setCheckoutModal(null)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
              Confirm check-out for <strong>{checkoutModal.petName}</strong> and record payment collected.
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                Total Amount Collected (₹)
              </label>
              <input
                className="input"
                type="number"
                value={checkoutAmount}
                onChange={e => setCheckoutAmount(e.target.value)}
                placeholder="Enter final collected amount"
              />
              <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                Original estimate: ₹{checkoutModal.estimatedTotal} ({checkoutModal.stayDays} days)
              </span>
            </div>
            <div className="reschedule-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setCheckoutModal(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={confirmCheckOut}>
                Confirm Check-Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {cancelTarget && (
        <div className="modal-overlay" onClick={() => setCancelTarget(null)}>
          <div className="reschedule-modal-card" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div className="reschedule-modal-header">
              <h3>Reject / Cancel Request</h3>
              <button type="button" className="icon-btn" onClick={() => setCancelTarget(null)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
              Are you sure you want to cancel the boarding request for <strong>{cancelTarget.petName}</strong>?
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                Cancellation Reason
              </label>
              <input
                className="input"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. Suites fully occupied for requested dates"
              />
            </div>
            <div className="reschedule-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setCancelTarget(null)}>Back</button>
              <button type="button" className="btn btn-primary" style={{ background: '#ef4444' }} onClick={confirmCancel}>
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettingsModal && settingsForm && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="reschedule-modal-card" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="reschedule-modal-header">
              <h3>Boarding Rates & Settings</h3>
              <button type="button" className="icon-btn" onClick={() => setShowSettingsModal(false)}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gap: '16px', marginTop: '12px' }}>
              {/* Setting B: Accept Boarding Bookings */}
              <div style={{
                padding: '14px 16px',
                borderRadius: '14px',
                background: 'var(--surface)',
                border: '1.5px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
                    Accept Boarding Bookings
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', lineHeight: 1.4 }}>
                    Allow customers to submit new pet boarding requests. When OFF, shows "Boarding Bookings Temporarily Closed".
                  </div>
                </div>
                <input
                  type="checkbox"
                  id="acceptBookingsToggle"
                  checked={settingsForm.acceptBookings !== false}
                  onChange={e => setSettingsForm(p => ({ ...p, acceptBookings: e.target.checked }))}
                  style={{ width: '20px', height: '20px', accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                />
              </div>

              {/* Setting A: Show NEW Badge */}
              <div style={{
                padding: '14px 16px',
                borderRadius: '14px',
                background: 'var(--surface)',
                border: '1.5px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Show NEW Badge <span style={{ background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: '10px', padding: '2px 6px', borderRadius: '6px', fontWeight: 800 }}>NEW</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', lineHeight: 1.4 }}>
                    Display the golden "NEW" feature announcement badge at the top-right of the homepage boarding card.
                  </div>
                </div>
                <input
                  type="checkbox"
                  id="showNewBadgeToggle"
                  checked={settingsForm.showNewBadge !== false}
                  onChange={e => setSettingsForm(p => ({ ...p, showNewBadge: e.target.checked }))}
                  style={{ width: '20px', height: '20px', accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
                />
              </div>

              {/* Rates */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.8px', display: 'block', marginBottom: '10px' }}>
                  Daily Rates
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Dog Rate (₹/day)</label>
                    <input
                      type="number"
                      className="input"
                      value={settingsForm.dogDailyRate}
                      onChange={e => setSettingsForm(p => ({ ...p, dogDailyRate: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Cat Rate (₹/day)</label>
                    <input
                      type="number"
                      className="input"
                      value={settingsForm.catDailyRate}
                      onChange={e => setSettingsForm(p => ({ ...p, catDailyRate: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>

              {/* Capacity */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.8px', display: 'block', marginBottom: '10px' }}>
                  Room Capacity
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Max Dog Capacity</label>
                    <input
                      type="number"
                      className="input"
                      value={settingsForm.maxDogCapacity}
                      onChange={e => setSettingsForm(p => ({ ...p, maxDogCapacity: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Max Cat Capacity</label>
                    <input
                      type="number"
                      className="input"
                      value={settingsForm.maxCatCapacity}
                      onChange={e => setSettingsForm(p => ({ ...p, maxCatCapacity: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="reschedule-modal-footer" style={{ marginTop: '20px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowSettingsModal(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={savingSettings} onClick={saveBoardingSettings}>
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
