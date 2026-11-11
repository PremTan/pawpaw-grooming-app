// src/admin/AdminWalking.jsx
import { useState, useEffect } from 'react'
import {
  collection,
  query,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  setDoc,
  orderBy,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore'
import { ADMIN_EMAIL, db } from '../firebase'
import { useNotifications } from '../context/NotificationContext'
import { fetchBusinessInfo } from '../utils/businessInfo'
import {
  fetchWalkingSettings,
  saveWalkingSettings,
  DEFAULT_WALKING_SETTINGS,
  DEFAULT_WALKING_SLOTS,
  DEFAULT_SERVICEABLE_AREAS,
  buildWalkingWhatsAppMessage,
  WALKING_STATUS,
  WALKING_STATUS_LABELS,
  WALKING_STATUS_BADGES,
} from '../utils/walkingSettings'
import {
  Calendar,
  Check,
  CheckCircle,
  Clock,
  Dog,
  Footprints,
  IndianRupee,
  Info,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  User,
  X,
  XCircle,
  PlayCircle,
} from 'lucide-react'

const money = (val) => Number(val || 0).toLocaleString('en-IN')

export default function AdminWalking() {
  const { sendNotification } = useNotifications() || {}

  const [activeTab, setActiveTab] = useState('bookings') // 'bookings' | 'settings'
  const [bookings, setBookings] = useState([])
  const [loadingBookings, setLoadingBookings] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [editingFee, setEditingFee] = useState('')
  const [savingFee, setSavingFee] = useState(false)
  const [updatingId, setUpdatingId] = useState('')

  // Reschedule Modal
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleSlot, setRescheduleSlot] = useState('')

  // Cancel Modal
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')

  // Settings State
  const [settings, setSettings] = useState(DEFAULT_WALKING_SETTINGS)
  const [savingSettings, setSavingSettings] = useState(false)
  const [newSlotInput, setNewSlotInput] = useState('')
  const [newAreaInput, setNewAreaInput] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState('')
  const [shopName, setShopName] = useState('Paw Paw Pet Grooming')

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return
    const t = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [toastMessage])

  // Load Bookings & Settings
  const loadBookings = async () => {
    setLoadingBookings(true)
    try {
      const q = query(collection(db, 'walkingBookings'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {
      // Fallback query without composite ordering if index pending
      try {
        const snap = await getDocs(collection(db, 'walkingBookings'))
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        list.sort((a, b) => {
          const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0
          const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0
          return bTime - aTime
        })
        setBookings(list)
      } catch (err2) {
        console.warn('Could not load walking bookings:', err2)
      }
    } finally {
      setLoadingBookings(false)
    }
  }

  useEffect(() => {
    loadBookings()
    fetchWalkingSettings(db).then(setSettings)
    fetchBusinessInfo(db).then(biz => {
      if (biz) {
        setAdminWhatsappNumber(biz.whatsappNumber || '')
        setShopName(biz.contact?.shopName || 'Paw Paw Pet Grooming')
      }
    })
  }, [])

  // Filter Bookings
  const filteredBookings = bookings.filter(b => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (b.dogName || b.petName || '').toLowerCase().includes(q) ||
      (b.ownerName || '').toLowerCase().includes(q) ||
      (b.phone || '').toLowerCase().includes(q) ||
      (b.area || '').toLowerCase().includes(q) ||
      (b.pickupAddress || '').toLowerCase().includes(q) ||
      (b.id || '').toLowerCase().includes(q)
    )
  })

  // Status Counts
  const counts = {
    all: bookings.length,
    pending: bookings.filter(b => b.status === WALKING_STATUS.PENDING).length,
    confirmed: bookings.filter(b => b.status === WALKING_STATUS.CONFIRMED).length,
    in_progress: bookings.filter(b => b.status === WALKING_STATUS.IN_PROGRESS).length,
    completed: bookings.filter(b => b.status === WALKING_STATUS.COMPLETED).length,
    cancelled: bookings.filter(b => b.status === WALKING_STATUS.CANCELLED).length,
  }

  // Update Status Action
  const handleUpdateStatus = async (booking, newStatus, reason = '') => {
    setUpdatingId(booking.id)
    try {
      const patch = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      }
      if (newStatus === WALKING_STATUS.CONFIRMED) {
        patch.confirmedAt = serverTimestamp()
      }
      if (newStatus === WALKING_STATUS.COMPLETED) {
        patch.completedAt = serverTimestamp()
      }
      if (newStatus === WALKING_STATUS.CANCELLED) {
        patch.cancelledAt = serverTimestamp()
        patch.cancelledBy = 'admin'
        if (reason) patch.cancellationReason = reason
      }

      await updateDoc(doc(db, 'walkingBookings', booking.id), patch)
      setBookings(prev => prev.map(item => item.id === booking.id ? { ...item, ...patch } : item))
      if (selectedBooking?.id === booking.id) {
        setSelectedBooking(prev => ({ ...prev, ...patch }))
      }

      // Notify Customer
      if (booking.userId && sendNotification) {
        let msg = ''
        if (newStatus === WALKING_STATUS.CONFIRMED) {
          msg = `Your dog walking session for ${booking.dogName} on ${booking.date} at ${booking.slot} has been confirmed!`
        } else if (newStatus === WALKING_STATUS.COMPLETED) {
          msg = `Dog walking session for ${booking.dogName} is completed. Thank you for choosing Paw Paw!`
        } else if (newStatus === WALKING_STATUS.CANCELLED) {
          msg = `Your walking session for ${booking.dogName} on ${booking.date} has been cancelled. ${reason ? `Reason: ${reason}` : ''}`
        }

        if (msg) {
          await sendNotification(booking.userId, {
            userEmail: booking.userEmail || '',
            toAdmin: false,
            title: `🐕 Pet Walking: ${WALKING_STATUS_LABELS[newStatus] || 'Update'}`,
            message: msg,
            type: 'walking_update',
            bookingId: booking.id,
            actionUrl: '/my-bookings?tab=walking',
          }).catch(() => {})
        }
      }

      setToastMessage(`Booking status updated to ${WALKING_STATUS_LABELS[newStatus] || newStatus}`)
    } catch (err) {
      alert(`Could not update status: ${err.message}`)
    } finally {
      setUpdatingId('')
      setCancelTarget(null)
      setCancelReason('')
    }
  }

  // Confirm Reschedule
  const handleConfirmReschedule = async () => {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleSlot) {
      alert('Please choose both a new date and time slot.')
      return
    }

    setUpdatingId(rescheduleTarget.id)
    try {
      const prevDate = rescheduleTarget.date
      const prevSlot = rescheduleTarget.slot

      const patch = {
        date: rescheduleDate,
        slot: rescheduleSlot,
        status: WALKING_STATUS.CONFIRMED,
        previousDate: prevDate,
        previousSlot: prevSlot,
        rescheduledBy: 'admin',
        rescheduledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      await updateDoc(doc(db, 'walkingBookings', rescheduleTarget.id), patch)
      setBookings(prev => prev.map(item => item.id === rescheduleTarget.id ? { ...item, ...patch } : item))
      if (selectedBooking?.id === rescheduleTarget.id) {
        setSelectedBooking(prev => ({ ...prev, ...patch }))
      }

      // Notify customer
      if (rescheduleTarget.userId && sendNotification) {
        await sendNotification(rescheduleTarget.userId, {
          userEmail: rescheduleTarget.userEmail || '',
          toAdmin: false,
          title: '🐕 Pet Walk Rescheduled',
          message: `Your dog walk for ${rescheduleTarget.dogName} was moved from ${prevDate} at ${prevSlot} to ${rescheduleDate} at ${rescheduleSlot}.`,
          type: 'walking_rescheduled',
          bookingId: rescheduleTarget.id,
          actionUrl: '/my-bookings?tab=walking',
        }).catch(() => {})
      }

      setToastMessage('Walk rescheduled and confirmed successfully!')
      setRescheduleTarget(null)
      setRescheduleDate('')
      setRescheduleSlot('')
    } catch (err) {
      alert(`Could not reschedule: ${err.message}`)
    } finally {
      setUpdatingId('')
    }
  }

  // Open Booking Details with Editable Fee State
  const openBookingDetails = (b) => {
    setSelectedBooking(b)
    setEditingFee(String(b.totalPrice ?? '199'))
  }

  // Update Walk Fee / Charges (Allowed even after completed!)
  const handleSaveFee = async () => {
    if (!selectedBooking) return
    const numFee = Number(editingFee)
    if (isNaN(numFee) || numFee < 0) {
      alert('Please enter a valid positive fee amount.')
      return
    }
    setSavingFee(true)
    try {
      const patch = {
        totalPrice: numFee,
        updatedAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'walkingBookings', selectedBooking.id), patch)
      setBookings(prev => prev.map(item => item.id === selectedBooking.id ? { ...item, ...patch } : item))
      setSelectedBooking(prev => ({ ...prev, ...patch }))
      setToastMessage(`Walking fee updated to ₹${numFee}`)
    } catch (err) {
      alert(`Could not save fee: ${err.message}`)
    } finally {
      setSavingFee(false)
    }
  }

  // Save Settings Handler
  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await saveWalkingSettings(db, settings)
      setToastMessage('Pet Walking settings saved successfully!')
    } catch (err) {
      alert(`Could not save settings: ${err.message}`)
    } finally {
      setSavingSettings(false)
    }
  }

  const handleAddSlot = () => {
    const s = newSlotInput.trim()
    if (!s) return
    if (settings.slots.includes(s)) {
      alert('Slot already exists.')
      return
    }
    setSettings(prev => ({ ...prev, slots: [...prev.slots, s] }))
    setNewSlotInput('')
  }

  const handleRemoveSlot = (slotToRemove) => {
    setSettings(prev => ({ ...prev, slots: prev.slots.filter(s => s !== slotToRemove) }))
  }

  const handleAddArea = () => {
    const a = newAreaInput.trim()
    if (!a) return
    if (settings.serviceableAreas.includes(a)) {
      alert('Area already exists.')
      return
    }
    setSettings(prev => ({ ...prev, serviceableAreas: [...prev.serviceableAreas, a] }))
    setNewAreaInput('')
  }

  const handleRemoveArea = (areaToRemove) => {
    setSettings(prev => ({ ...prev, serviceableAreas: prev.serviceableAreas.filter(a => a !== areaToRemove) }))
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', color: 'var(--text)' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, background: 'var(--card)', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: '12px', padding: '12px 20px', boxShadow: '0 8px 30px rgba(0,0,0,0.25)', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={16} /> {toastMessage}
        </div>
      )}

      {/* Header & Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '999px', padding: '4px 12px', fontSize: '11px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>
              <Footprints size={12} /> Service Management
            </div>
            <button
              type="button"
              onClick={loadBookings}
              disabled={loadingBookings}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                borderRadius: '999px',
                padding: '4px 11px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease',
              }}
              title="Refresh pet walking data"
            >
              <RefreshCw size={11} style={{ animation: loadingBookings ? 'spin 1s linear infinite' : 'none' }} />
              Refresh
            </button>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text)', margin: 0 }}>
            Pet Walking Management
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '4px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
            Manage daily dog-walking sessions, schedules, and pricing.
          </p>
        </div>

        {/* Tab Switcher - Single Line on Mobile */}
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '4px', gap: '4px', width: '100%', maxWidth: '380px', boxSizing: 'border-box' }}>
          <button
            type="button"
            onClick={() => setActiveTab('bookings')}
            style={{
              flex: 1,
              background: activeTab === 'bookings' ? 'var(--card)' : 'transparent',
              color: activeTab === 'bookings' ? 'var(--accent)' : 'var(--muted)',
              border: activeTab === 'bookings' ? '1px solid var(--border)' : '1px solid transparent',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <Dog size={15} /> Bookings ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            style={{
              flex: 1,
              background: activeTab === 'settings' ? 'var(--card)' : 'transparent',
              color: activeTab === 'settings' ? 'var(--accent)' : 'var(--muted)',
              border: activeTab === 'settings' ? '1px solid var(--border)' : '1px solid transparent',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <SlidersHorizontal size={15} /> Walking Settings
          </button>
        </div>
      </div>

      {/* =========================================================================
          TAB 1: BOOKINGS LIST
         ========================================================================= */}
      {activeTab === 'bookings' && (
        <div>
          {/* Quick Stats - Compact Horizontally Scrollable Row */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '6px',
              marginBottom: '16px',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {[
              { label: 'Total', count: counts.all, color: 'var(--text)', filter: 'all' },
              { label: 'Pending', count: counts.pending, color: '#f59e0b', filter: 'pending' },
              { label: 'In Progress', count: counts.in_progress, color: '#3b82f6', filter: 'in_progress' },
              { label: 'Confirmed', count: counts.confirmed, color: 'var(--accent)', filter: 'confirmed' },
              { label: 'Completed', count: counts.completed, color: '#10b981', filter: 'completed' },
            ].map(s => {
              const isSelected = statusFilter === s.filter
              return (
                <button
                  key={s.filter}
                  type="button"
                  onClick={() => setStatusFilter(s.filter)}
                  style={{
                    flex: '0 0 auto',
                    minWidth: '78px',
                    background: isSelected ? 'var(--accent-bg)' : 'var(--card)',
                    border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '10px',
                    padding: '6px 10px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxSizing: 'border-box',
                  }}
                >
                  <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '1px', whiteSpace: 'nowrap' }}>
                    {s.label}
                  </span>
                  <strong style={{ fontSize: '16px', fontWeight: 900, color: s.color }}>
                    {s.count}
                  </strong>
                </button>
              )
            })}
          </div>

          {/* Search Bar */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '460px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                className="input"
                placeholder="Search dog, owner, phone, or Dhayari address..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '34px' }}
              />
            </div>
          </div>

          {/* Bookings List Cards */}
          {loadingBookings ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--muted)', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
              <p style={{ margin: 0, fontSize: '13px' }}>Loading pet walking requests...</p>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--muted)', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <Dog size={32} style={{ color: 'var(--muted)', margin: '0 auto 8px' }} />
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>No pet walking bookings found.</p>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Try changing the status filter or search query.</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              {filteredBookings.map(b => {
                const isPending = b.status === WALKING_STATUS.PENDING
                const isConfirmed = b.status === WALKING_STATUS.CONFIRMED
                const isInProgress = b.status === WALKING_STATUS.IN_PROGRESS
                const isCompleted = b.status === WALKING_STATUS.COMPLETED
                const isCancelled = b.status === WALKING_STATUS.CANCELLED

                const cleanPhone = String(b.phone || '').replace(/\D/g, '')
                const waNumber = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone
                const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${buildWalkingWhatsAppMessage(b, shopName)}` : '#'

                return (
                  <div
                    key={b.id}
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '16px',
                      padding: '18px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                    }}
                  >
                    {/* Top Row: Dog Info & Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                          <Dog size={22} />
                        </span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                              {b.dogName || b.petName}
                            </h3>
                            {(b.breed || b.petBreed) && (
                              <span style={{ fontSize: '12px', color: 'var(--muted)', background: 'var(--surface)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                {b.breed || b.petBreed}
                              </span>
                            )}
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                              #{b.id.slice(0, 8).toUpperCase()}
                            </span>
                          </div>
                          <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                            Owner: <strong>{b.ownerName}</strong> · 📞 {b.phone}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`badge ${WALKING_STATUS_BADGES[b.status] || 'badge-pending'}`}>
                          {WALKING_STATUS_LABELS[b.status] || b.status}
                        </span>
                        <span style={{ fontSize: '15px', fontWeight: 900, color: 'var(--accent)' }}>
                          ₹{money(b.totalPrice)}
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: Schedule & Location Details */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px', fontSize: '12px' }}>
                      <div>
                        <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>SCHEDULE</span>
                        <strong style={{ color: 'var(--text)' }}>
                          📅 {b.date} · ⏰ {b.slot || b.customTimeRequested}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>DURATION</span>
                        <strong style={{ color: 'var(--accent)' }}>
                          ⏱️ {b.duration} Minutes Session
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>PICK-UP LOCATION</span>
                        <strong style={{ color: 'var(--text)' }} title={b.pickupAddress}>
                          📍 {b.area || 'Dhayari'} ({b.pickupAddress})
                        </strong>
                      </div>
                    </div>

                    {/* Notes if any */}
                    {(b.behaviorNotes || b.notes) && (
                      <div style={{ fontSize: '11.5px', color: 'var(--muted)', background: 'var(--accent-bg)', border: '1px dashed var(--accent-border)', borderRadius: '8px', padding: '8px 12px' }}>
                        {b.behaviorNotes && <span><strong>Dog Habits:</strong> {b.behaviorNotes} </span>}
                        {b.notes && <span><strong>Instructions:</strong> {b.notes}</span>}
                      </div>
                    )}

                    {/* Actions Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', paddingTop: '4px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => openBookingDetails(b)}
                          style={{
                            background: 'rgba(184, 134, 11, 0.08)',
                            border: '1px solid rgba(184, 134, 11, 0.35)',
                            color: '#b8860b',
                            fontWeight: 700,
                            fontSize: '12px',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Details
                        </button>
                        {waNumber && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: '#f0fdf4',
                              border: '1px solid #bbf7d0',
                              color: '#15803d',
                              fontWeight: 700,
                              fontSize: '12px',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              whiteSpace: 'nowrap',
                            }}
                            title="Chat with customer on WhatsApp"
                          >
                            <MessageCircle size={14} /> WhatsApp
                          </a>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'nowrap' }}>
                        {isPending && (
                          <>
                            <button
                              type="button"
                              disabled={updatingId === b.id}
                              onClick={() => handleUpdateStatus(b, WALKING_STATUS.CONFIRMED)}
                              style={{
                                background: '#16a34a',
                                border: '1px solid #15803d',
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: '11px',
                                padding: '5px 8px',
                                borderRadius: '7px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                              }}
                            >
                              <Check size={13} /> Confirm
                            </button>
                            <button
                              type="button"
                              disabled={updatingId === b.id}
                              onClick={() => {
                                setRescheduleTarget(b)
                                setRescheduleDate(b.date || '')
                                setRescheduleSlot(b.slot || '')
                              }}
                              style={{
                                background: 'rgba(37, 99, 235, 0.08)',
                                border: '1px solid rgba(37, 99, 235, 0.35)',
                                color: '#2563eb',
                                fontWeight: 700,
                                fontSize: '11px',
                                padding: '5px 8px',
                                borderRadius: '7px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              <Clock size={12} /> Reschedule
                            </button>
                            <button
                              type="button"
                              disabled={updatingId === b.id}
                              onClick={() => {
                                setCancelTarget(b)
                                setCancelReason('')
                              }}
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#dc2626',
                                fontWeight: 700,
                                fontSize: '11px',
                                padding: '5px 8px',
                                borderRadius: '7px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              <X size={13} /> Decline
                            </button>
                          </>
                        )}

                        {isConfirmed && (
                          <>
                            <button
                              type="button"
                              disabled={updatingId === b.id}
                              onClick={() => handleUpdateStatus(b, WALKING_STATUS.IN_PROGRESS)}
                              style={{
                                background: '#7c3aed',
                                border: '1px solid #6d28d9',
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: '11px',
                                padding: '5px 9px',
                                borderRadius: '7px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                boxShadow: '0 2px 6px rgba(124, 58, 237, 0.25)',
                              }}
                            >
                              <PlayCircle size={13} /> Start Walk
                            </button>
                            <button
                              type="button"
                              disabled={updatingId === b.id}
                              onClick={() => {
                                setRescheduleTarget(b)
                                setRescheduleDate(b.date || '')
                                setRescheduleSlot(b.slot || '')
                              }}
                              style={{
                                background: 'rgba(37, 99, 235, 0.08)',
                                border: '1px solid rgba(37, 99, 235, 0.35)',
                                color: '#2563eb',
                                fontWeight: 700,
                                fontSize: '11px',
                                padding: '5px 8px',
                                borderRadius: '7px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              <Clock size={12} /> Reschedule
                            </button>
                          </>
                        )}

                        {isInProgress && (
                          <button
                            type="button"
                            disabled={updatingId === b.id}
                            onClick={() => handleUpdateStatus(b, WALKING_STATUS.COMPLETED)}
                            style={{
                              background: '#059669',
                              border: '1px solid #047857',
                              color: '#ffffff',
                              fontWeight: 700,
                              fontSize: '11px',
                              padding: '5px 10px',
                              borderRadius: '7px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                              boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
                            }}
                          >
                            <CheckCircle size={13} /> Mark Completed
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: WALKING SETTINGS
         ========================================================================= */}
      {activeTab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Top Header Card */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '18px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            }}
          >
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '4px' }}>
                <SlidersHorizontal size={13} /> Walking Configuration
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text)', margin: 0 }}>
                Pet Walking Settings & Pricing
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Configure duration rates, operational days, walk slots, and serviceable areas.
              </span>
            </div>
            <button
              type="button"
              disabled={savingSettings}
              onClick={handleSaveSettings}
              className="btn btn-primary"
              style={{ gap: '6px', padding: '9px 18px', fontSize: '13px', whiteSpace: 'nowrap' }}
            >
              <Save size={15} /> {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {/* Section 1: Online Bookings Status */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '18px 20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '14.5px', color: 'var(--text)' }}>Accept Online Walking Bookings</strong>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: settings.acceptBookings !== false ? '#dcfce7' : '#fee2e2',
                      color: settings.acceptBookings !== false ? '#15803d' : '#b91c1c',
                      border: `1px solid ${settings.acceptBookings !== false ? '#bbf7d0' : '#fecaca'}`,
                    }}
                  >
                    {settings.acceptBookings !== false ? 'Active & Open' : 'Paused'}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  Toggle off to temporarily close pet walking booking on the customer app.
                </span>
              </div>
              <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                <input
                  type="checkbox"
                  checked={settings.acceptBookings !== false}
                  onChange={e => setSettings(prev => ({ ...prev, acceptBookings: e.target.checked }))}
                  style={{ width: '22px', height: '22px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>
                  {settings.acceptBookings !== false ? 'Open for Walks' : 'Walks Paused'}
                </span>
              </label>
            </div>
          </div>

          {/* Section 2: Duration Pricing & Capacity */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '18px 20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
                <IndianRupee size={15} /> Duration Pricing & Walker Capacity
              </div>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Set the default prices charged per dog per walk session and slot limit.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
              {/* 30 Min */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Clock size={13} style={{ color: 'var(--accent)' }} />
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text)' }}>
                    30-Min Walk
                  </label>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--muted)', fontSize: '13px' }}>₹</span>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    value={settings.rate30Min}
                    onChange={e => setSettings(prev => ({ ...prev, rate30Min: Number(e.target.value) }))}
                    style={{ paddingLeft: '26px', fontWeight: 800 }}
                  />
                </div>
              </div>

              {/* 45 Min */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Clock size={13} style={{ color: 'var(--accent)' }} />
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text)' }}>
                    45-Min Walk
                  </label>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--muted)', fontSize: '13px' }}>₹</span>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    value={settings.rate45Min}
                    onChange={e => setSettings(prev => ({ ...prev, rate45Min: Number(e.target.value) }))}
                    style={{ paddingLeft: '26px', fontWeight: 800 }}
                  />
                </div>
              </div>

              {/* 60 Min */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Clock size={13} style={{ color: 'var(--accent)' }} />
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text)' }}>
                    60-Min Walk
                  </label>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--muted)', fontSize: '13px' }}>₹</span>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    value={settings.rate60Min}
                    onChange={e => setSettings(prev => ({ ...prev, rate60Min: Number(e.target.value) }))}
                    style={{ paddingLeft: '26px', fontWeight: 800 }}
                  />
                </div>
              </div>

              {/* Max Dogs / Slot */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Dog size={13} style={{ color: 'var(--accent)' }} />
                  <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text)' }}>
                    Max Dogs / Slot
                  </label>
                </div>
                <input
                  type="number"
                  className="input"
                  min="1"
                  max="10"
                  value={settings.maxCapacityPerSlot}
                  onChange={e => setSettings(prev => ({ ...prev, maxCapacityPerSlot: Number(e.target.value) }))}
                  style={{ fontWeight: 800 }}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Operating Days */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '18px 20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
                <Calendar size={15} /> Weekly Operating Days
              </div>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Select which days walkers are available in Dhayari.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(95px, 1fr))', gap: '8px' }}>
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
                const isOpen = settings.operatingDays?.[day] !== false
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      const next = { ...settings.operatingDays, [day]: !isOpen }
                      setSettings(prev => ({ ...prev, operatingDays: next }))
                    }}
                    style={{
                      background: isOpen ? 'var(--accent-bg)' : 'var(--surface)',
                      border: `1.5px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '10px',
                      padding: '10px 8px',
                      fontSize: '12px',
                      fontWeight: 800,
                      color: isOpen ? 'var(--accent)' : 'var(--muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isOpen && <Check size={13} />}
                    <span style={{ textTransform: 'capitalize' }}>{day.slice(0, 3)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section 4: Daily Walking Slots */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '18px 20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
                <Clock size={15} /> Daily Walking Slots ({settings.slots.length})
              </div>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Time slots displayed to customers when booking dog walks.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {settings.slots.map(s => (
                <span
                  key={s}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--accent-border)',
                    color: 'var(--text)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Clock size={11} style={{ color: 'var(--accent)' }} />
                  {s}
                  <button
                    type="button"
                    onClick={() => handleRemoveSlot(s)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                    title="Remove slot"
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', maxWidth: '380px' }}>
              <input
                className="input"
                placeholder="e.g. 07:00 AM or 06:00 PM"
                value={newSlotInput}
                onChange={e => setNewSlotInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSlot() }}
                style={{ fontSize: '12.5px' }}
              />
              <button
                type="button"
                onClick={handleAddSlot}
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '12px', flexShrink: 0, gap: '4px' }}
              >
                <Plus size={14} /> Add Slot
              </button>
            </div>
          </div>

          {/* Section 5: Serviceable Localities */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              padding: '18px 20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
                <MapPin size={15} /> Serviceable Localities ({settings.serviceableAreas.length})
              </div>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Eligible locations in Dhayari, Pune where walking is supported.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {settings.serviceableAreas.map(a => (
                <span
                  key={a}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    borderRadius: '8px',
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <MapPin size={11} style={{ color: 'var(--accent)' }} />
                  {a}
                  <button
                    type="button"
                    onClick={() => handleRemoveArea(a)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                    title="Remove locality"
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', maxWidth: '380px' }}>
              <input
                className="input"
                placeholder="e.g. Vadgaon Phata or Dhayari Gaon"
                value={newAreaInput}
                onChange={e => setNewAreaInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddArea() }}
                style={{ fontSize: '12.5px' }}
              />
              <button
                type="button"
                onClick={handleAddArea}
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '12px', flexShrink: 0, gap: '4px' }}
              >
                <Plus size={14} /> Add Area
              </button>
            </div>
          </div>

          {/* Bottom Save Bar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
            <button
              type="button"
              disabled={savingSettings}
              onClick={handleSaveSettings}
              className="btn btn-primary"
              style={{ gap: '6px', padding: '12px 26px', fontSize: '14px', whiteSpace: 'nowrap' }}
            >
              <Save size={16} /> {savingSettings ? 'Saving Settings...' : 'Save All Settings'}
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: BOOKING DETAIL VIEW (Redesigned luxury modal with editable fee)
         ========================================================================= */}
      {selectedBooking && (
        <div className="modal-overlay" onClick={() => setSelectedBooking(null)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' }}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'var(--card)',
              color: 'var(--text)',
              border: '1.5px solid var(--border)',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              boxSizing: 'border-box',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'var(--accent-bg)', border: '1.5px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <Dog size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '19px', fontWeight: 900, margin: 0, color: 'var(--text)' }}>
                      {selectedBooking.dogName || selectedBooking.petName}
                    </h2>
                    {(selectedBooking.breed || selectedBooking.petBreed) && (
                      <span style={{ fontSize: '12px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                        {selectedBooking.breed || selectedBooking.petBreed}
                      </span>
                    )}
                    <span className={`badge ${WALKING_STATUS_BADGES[selectedBooking.status] || 'badge-pending'}`}>
                      {WALKING_STATUS_LABELS[selectedBooking.status] || selectedBooking.status}
                    </span>
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
                    Request ID: #{selectedBooking.id.slice(0, 8).toUpperCase()}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelectedBooking(null)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* SECTION: Billing & Walk Fee (EDITABLE even after completed!) */}
              <div style={{ background: 'var(--accent-bg)', border: '1.5px solid var(--accent-border)', borderRadius: '14px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <IndianRupee size={15} /> Walk Fee & Charges (Editable)
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>
                    {selectedBooking.status === WALKING_STATUS.COMPLETED ? 'Completed · Editable' : 'Editable by Admin'}
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: '1', minWidth: '140px' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--text)' }}>₹</span>
                    <input
                      type="number"
                      className="input"
                      value={editingFee}
                      onChange={e => setEditingFee(e.target.value)}
                      placeholder="Fee amount..."
                      style={{ paddingLeft: '28px', fontWeight: 800, fontSize: '16px', color: 'var(--text)', background: 'var(--card)' }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveFee}
                    disabled={savingFee || Number(editingFee) === Number(selectedBooking.totalPrice)}
                    className="btn btn-primary"
                    style={{ padding: '8px 16px', fontSize: '13px', gap: '6px', whiteSpace: 'nowrap', opacity: Number(editingFee) === Number(selectedBooking.totalPrice) ? 0.7 : 1 }}
                  >
                    <Save size={14} /> {savingFee ? 'Saving...' : 'Save Charges'}
                  </button>
                </div>
                {Number(editingFee) !== Number(selectedBooking.totalPrice) && (
                  <span style={{ fontSize: '11px', color: '#d97706', marginTop: '6px', display: 'block', fontWeight: 600 }}>
                    * Unsaved change. Current saved rate is ₹{selectedBooking.totalPrice}.
                  </span>
                )}
              </div>

              {/* SECTION: Schedule & Session Info */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} color="var(--accent)" /> Walk Schedule & Timing
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', fontSize: '12.5px' }}>
                  <div>
                    <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Date</span>
                    <strong style={{ color: 'var(--text)' }}>{selectedBooking.date || selectedBooking.walkingDate}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Time Slot</span>
                    <strong style={{ color: 'var(--text)' }}>{selectedBooking.slot || selectedBooking.walkingSlot}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Duration</span>
                    <strong style={{ color: 'var(--accent)' }}>{selectedBooking.duration || selectedBooking.durationMinutes} Minutes</strong>
                  </div>
                </div>
                {selectedBooking.customTimeRequested && (
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--border)', fontSize: '11.5px', color: '#d97706' }}>
                    <strong>Custom Timing Request:</strong> {selectedBooking.customTimeRequested}
                  </div>
                )}
              </div>

              {/* SECTION: Customer & Dog Information */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} color="var(--accent)" /> Customer & Contact Details
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', fontSize: '12.5px' }}>
                  <div>
                    <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Owner Name</span>
                    <strong style={{ color: 'var(--text)' }}>{selectedBooking.ownerName || 'N/A'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Primary Phone</span>
                    {selectedBooking.phone ? (
                      <a href={`tel:${selectedBooking.phone}`} style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
                        📞 {selectedBooking.phone}
                      </a>
                    ) : (
                      <span>N/A</span>
                    )}
                  </div>
                  {selectedBooking.whatsappNumber && (
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>WhatsApp Number</span>
                      <strong style={{ color: '#16a34a' }}>💬 {selectedBooking.whatsappNumber}</strong>
                    </div>
                  )}
                  {selectedBooking.emergencyContact && (
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Emergency Contact</span>
                      <strong style={{ color: 'var(--text)' }}>{selectedBooking.emergencyContact}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: Pick-Up Location */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} color="var(--accent)" /> Pick-Up Location
                </div>
                <div style={{ fontSize: '12.5px' }}>
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Area / Locality</span>
                    <strong style={{ color: 'var(--text)' }}>{selectedBooking.area || 'Dhayari'}</strong>
                  </div>
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Complete Address</span>
                    <strong style={{ color: 'var(--text)', lineHeight: 1.4 }}>{selectedBooking.pickupAddress || selectedBooking.address || 'N/A'}</strong>
                  </div>
                  {selectedBooking.landmark && (
                    <div>
                      <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>Landmark</span>
                      <span style={{ color: 'var(--text)' }}>{selectedBooking.landmark}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: Habits & Notes */}
              {(selectedBooking.behaviorNotes || selectedBooking.notes) && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 16px', fontSize: '12.5px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={14} color="var(--accent)" /> Walker Instructions & Dog Habits
                  </div>
                  {selectedBooking.behaviorNotes && (
                    <div style={{ marginBottom: '6px' }}>
                      <strong style={{ color: 'var(--accent)' }}>Dog Habits:</strong> {selectedBooking.behaviorNotes}
                    </div>
                  )}
                  {selectedBooking.notes && (
                    <div>
                      <strong style={{ color: 'var(--text)' }}>Instructions:</strong> {selectedBooking.notes}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
              <div>
                {selectedBooking.phone && (
                  <a
                    href={`https://wa.me/${(selectedBooking.whatsappNumber || selectedBooking.phone).replace(/\D/g, '')}?text=${buildWalkingWhatsAppMessage(selectedBooking, shopName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      color: '#15803D',
                      fontWeight: 700,
                      fontSize: '12px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      textDecoration: 'none',
                    }}
                  >
                    <MessageCircle size={14} /> WhatsApp Customer
                  </a>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {selectedBooking.status === WALKING_STATUS.PENDING && (
                  <>
                    <button
                      type="button"
                      disabled={updatingId === selectedBooking.id}
                      onClick={() => handleUpdateStatus(selectedBooking, WALKING_STATUS.CONFIRMED)}
                      style={{
                        background: '#16A34A',
                        border: '1px solid #15803D',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontSize: '12px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                      }}
                    >
                      <Check size={14} /> Confirm
                    </button>
                    <button
                      type="button"
                      disabled={updatingId === selectedBooking.id}
                      onClick={() => {
                        const target = selectedBooking
                        setSelectedBooking(null)
                        setCancelTarget(target)
                        setCancelReason('')
                      }}
                      style={{
                        background: '#FEF2F2',
                        border: '1px solid #FECACA',
                        color: '#DC2626',
                        fontWeight: 700,
                        fontSize: '12px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <X size={14} /> Decline
                    </button>
                  </>
                )}

                {selectedBooking.status === WALKING_STATUS.CONFIRMED && (
                  <button
                    type="button"
                    disabled={updatingId === selectedBooking.id}
                    onClick={() => handleUpdateStatus(selectedBooking, WALKING_STATUS.IN_PROGRESS)}
                    style={{
                      background: '#7C3AED',
                      border: '1px solid #6D28D9',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      fontSize: '12px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 6px rgba(124, 58, 237, 0.25)',
                    }}
                  >
                    <PlayCircle size={14} /> Start Walk
                  </button>
                )}

                {selectedBooking.status === WALKING_STATUS.IN_PROGRESS && (
                  <button
                    type="button"
                    disabled={updatingId === selectedBooking.id}
                    onClick={() => handleUpdateStatus(selectedBooking, WALKING_STATUS.COMPLETED)}
                    style={{
                      background: '#059669',
                      border: '1px solid #047857',
                      color: '#FFFFFF',
                      fontWeight: 700,
                      fontSize: '12px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
                    }}
                  >
                    <CheckCircle size={14} /> Mark Completed
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedBooking(null)}
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '8px 14px' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: RESCHEDULE
         ========================================================================= */}
      {rescheduleTarget && (
        <div className="modal-overlay" onClick={() => setRescheduleTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', background: 'var(--card)', color: 'var(--text)' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 12px', color: 'var(--text)' }}>
              Reschedule Walk for {rescheduleTarget.dogName}
            </h2>
            <p style={{ fontSize: '12.5px', color: 'var(--muted)', marginBottom: '16px' }}>
              Current: {rescheduleTarget.date} at {rescheduleTarget.slot}
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>New Date</label>
              <input
                type="date"
                className="input"
                min={new Date().toISOString().split('T')[0]}
                value={rescheduleDate}
                onChange={e => setRescheduleDate(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>New Slot</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '6px' }}>
                {settings.slots.map(s => {
                  const isSelected = rescheduleSlot === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRescheduleSlot(s)}
                      style={{
                        background: isSelected ? 'var(--accent)' : 'var(--surface)',
                        color: isSelected ? '#fff' : 'var(--text)',
                        border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: '8px',
                        padding: '6px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setRescheduleTarget(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={handleConfirmReschedule} className="btn btn-primary">
                Confirm Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CANCEL / DECLINE
         ========================================================================= */}
      {cancelTarget && (
        <div className="modal-overlay" onClick={() => setCancelTarget(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', background: 'var(--card)', color: 'var(--text)' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 10px', color: '#ef4444' }}>
              Decline / Cancel Walk
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
              Are you sure you want to cancel the walking request for <strong>{cancelTarget.dogName}</strong>?
            </p>
            <textarea
              className="input"
              rows={3}
              placeholder="Reason for cancellation (e.g. Walker unavailable in this locality, severe weather, etc.)..."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              style={{ resize: 'none', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setCancelTarget(null)} className="btn btn-secondary">
                Keep Booking
              </button>
              <button
                type="button"
                onClick={() => handleUpdateStatus(cancelTarget, WALKING_STATUS.CANCELLED, cancelReason)}
                className="btn btn-primary"
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

