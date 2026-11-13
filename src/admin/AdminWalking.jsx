// src/admin/AdminWalking.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import petWalkingHero from '../assets/pet-walking-hero.jpg'
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
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  User,
  X,
  XCircle,
  PlayCircle,
} from 'lucide-react'

const money = (val) => Number(val || 0).toLocaleString('en-IN')

const formatFriendlyDate = (dateStr) => {
  if (!dateStr) return 'No date'
  try {
    const parts = String(dateStr).split('-')
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      }
    }
    return dateStr
  } catch {
    return dateStr
  }
}

const QUICK_CANCEL_REASONS = [
  'Walker unavailable in this locality',
  'Severe weather / Heavy rain',
  'Customer requested cancellation',
  'Pet unwell / Medical reason',
  'Slot overbooked / Capacity reached',
  'Emergency reason',
]

export default function AdminWalking() {
  const navigate = useNavigate()
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
  const [settingsTab, setSettingsTab] = useState('durations') // 'durations' | 'slots' | 'general' | 'areas'
  const [newSlotInput, setNewSlotInput] = useState('')
  const [newAreaInput, setNewAreaInput] = useState('')
  const [newDurationMins, setNewDurationMins] = useState(30)
  const [newDurationPrice, setNewDurationPrice] = useState(199)
  const [newDurationLabel, setNewDurationLabel] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState('')
  const [shopName, setShopName] = useState('Paw Paw Pet Grooming')
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [optimizingBanner, setOptimizingBanner] = useState(false)
  const [bannerUploadError, setBannerUploadError] = useState('')

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

  // Upload Homepage Banner Image
  const handleBannerUpload = async (file) => {
    if (!file) return
    try {
      validateImageFile(file)
    } catch (err) {
      setBannerUploadError(err.message)
      return
    }
    setBannerUploadError('')
    setUploadingBanner(true)
    try {
      const url = await uploadToCloudinary(file, {
        onOptimizeStart: () => setOptimizingBanner(true),
        onOptimizeEnd: () => setOptimizingBanner(false),
      })
      setSettings(p => ({ ...p, bannerImageUrl: url }))
      setToastMessage('Walking banner image uploaded. Click Save Settings to persist.')
    } catch (err) {
      setBannerUploadError(err.message || 'Image upload failed. Please try again.')
    } finally {
      setUploadingBanner(false)
      setOptimizingBanner(false)
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

  const handleAddDuration = () => {
    const mins = Number(newDurationMins)
    const price = Number(newDurationPrice)
    if (!mins || mins <= 0) {
      alert('Please enter a valid duration in minutes.')
      return
    }
    if (price < 0 || isNaN(price)) {
      alert('Please enter a valid price.')
      return
    }
    const currentDurations = settings.durations || []
    if (currentDurations.some(d => Number(d.duration) === mins)) {
      alert(`A duration tier for ${mins} minutes already exists. You can edit its price directly.`)
      return
    }
    const label = newDurationLabel.trim() || `${mins} Min Walk`
    const next = [...currentDurations, { duration: mins, price, label }]
      .sort((a, b) => Number(a.duration) - Number(b.duration))
    setSettings(prev => ({ ...prev, durations: next }))
    setNewDurationLabel('')
  }

  const handleUpdateDurationPrice = (mins, newPrice) => {
    setSettings(prev => ({
      ...prev,
      durations: (prev.durations || []).map(d =>
        Number(d.duration) === Number(mins) ? { ...d, price: Math.max(0, Number(newPrice) || 0) } : d
      )
    }))
  }

  const handleUpdateDurationLabel = (mins, newLabel) => {
    setSettings(prev => ({
      ...prev,
      durations: (prev.durations || []).map(d =>
        Number(d.duration) === Number(mins) ? { ...d, label: newLabel } : d
      )
    }))
  }

  const handleRemoveDuration = (mins) => {
    if ((settings.durations || []).length <= 1) {
      alert('You must have at least one walking duration tier.')
      return
    }
    if (window.confirm(`Delete the ${mins}-minute walking duration tier?`)) {
      setSettings(prev => ({
        ...prev,
        durations: (prev.durations || []).filter(d => Number(d.duration) !== Number(mins))
      }))
    }
  }

  return (
    <div className="admin-page admin-walking-page">
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
                    className="walking-booking-card"
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                    }}
                  >
                    {/* Top Row: Dog Info & Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', overflow: 'hidden', flexShrink: 0 }}>
                          {b.petPhotoUrl || b.photoUrl ? (
                            <img src={b.petPhotoUrl || b.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <Dog size={22} />
                          )}
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

                        {b.status === WALKING_STATUS.COMPLETED && (
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/invoices?mode=walking&id=${b.id}`)}
                            style={{
                              background: 'rgba(212, 175, 55, 0.12)',
                              border: '1px solid var(--accent-border)',
                              color: 'var(--accent)',
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
                            }}
                            title="Generate / View Invoice"
                          >
                            <ReceiptText size={13} /> Invoice
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Sub-tab navigation pills */}
          <div className="walking-subtabs-bar" style={{ marginBottom: '2px' }}>
            <button
              type="button"
              className={`walking-subtab-btn ${settingsTab === 'durations' ? 'active' : ''}`}
              onClick={() => setSettingsTab('durations')}
            >
              <IndianRupee size={14} /> Durations & Pricing ({settings.durations?.length || 3})
            </button>
            <button
              type="button"
              className={`walking-subtab-btn ${settingsTab === 'slots' ? 'active' : ''}`}
              onClick={() => setSettingsTab('slots')}
            >
              <Clock size={14} /> Slots & Capacity ({settings.slots?.length || 0})
            </button>
            <button
              type="button"
              className={`walking-subtab-btn ${settingsTab === 'general' ? 'active' : ''}`}
              onClick={() => setSettingsTab('general')}
            >
              <SlidersHorizontal size={14} /> General & Schedule
            </button>
            <button
              type="button"
              className={`walking-subtab-btn ${settingsTab === 'areas' ? 'active' : ''}`}
              onClick={() => setSettingsTab('areas')}
            >
              <MapPin size={14} /> Serviceable Areas ({settings.serviceableAreas?.length || 0})
            </button>
          </div>

          {/* SUBTAB 1: DURATIONS & PRICING */}
          {settingsTab === 'durations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    <IndianRupee size={15} /> Active Walking Durations & Rates
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    Set custom walk session durations and their prices in ₹. Customers choose from these when booking walks.
                  </span>
                </div>

                {/* Duration Cards Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  {(settings.durations || DEFAULT_WALKING_DURATIONS).map(d => (
                    <div
                      key={d.duration}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        position: 'relative',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 800 }}>
                          <Clock size={12} /> {d.duration} Minutes
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDuration(d.duration)}
                          title="Delete duration tier"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: '4px',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div>
                        <label style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                          Display Label
                        </label>
                        <input
                          type="text"
                          className="input"
                          value={d.label || `${d.duration} Min Walk`}
                          onChange={e => handleUpdateDurationLabel(d.duration, e.target.value)}
                          placeholder="e.g. 30 Min Walk"
                          style={{ fontSize: '12px', padding: '6px 10px' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                          Price Per Session
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: 'var(--muted)', fontSize: '13px' }}>₹</span>
                          <input
                            type="number"
                            className="input"
                            min="0"
                            value={d.price}
                            onChange={e => handleUpdateDurationPrice(d.duration, e.target.value)}
                            style={{ paddingLeft: '24px', fontWeight: 800, fontSize: '13px', padding: '6px 10px 6px 24px' }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add New Duration Tier Card */}
                <div style={{ background: 'var(--accent-bg)', border: '1.5px dashed var(--accent-border)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '8px' }}>
                    <Plus size={15} /> Add New Duration Tier
                  </div>

                  {/* Preset Duration Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700 }}>Quick Presets:</span>
                    {[15, 20, 30, 45, 60, 75, 90, 120].map(mins => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => {
                          setNewDurationMins(mins)
                          if (!newDurationLabel || newDurationLabel.includes('Min Walk')) {
                            setNewDurationLabel(`${mins} Min Walk`)
                          }
                        }}
                        style={{
                          background: Number(newDurationMins) === mins ? 'var(--accent)' : 'var(--card)',
                          color: Number(newDurationMins) === mins ? '#ffffff' : 'var(--text)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '3px' }}>
                        Duration (Mins)
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="300"
                        className="input"
                        value={newDurationMins}
                        onChange={e => setNewDurationMins(e.target.value)}
                        style={{ fontSize: '12.5px' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '3px' }}>
                        Price (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="input"
                        value={newDurationPrice}
                        onChange={e => setNewDurationPrice(e.target.value)}
                        style={{ fontSize: '12.5px' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '3px' }}>
                        Label (Optional)
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder="e.g. 30 Min Walk"
                        value={newDurationLabel}
                        onChange={e => setNewDurationLabel(e.target.value)}
                        style={{ fontSize: '12.5px' }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleAddDuration}
                      className="btn btn-primary"
                      style={{ padding: '8px 16px', fontSize: '12.5px', height: '38px', gap: '6px', whiteSpace: 'nowrap' }}
                    >
                      <Plus size={15} /> Add Duration
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SUBTAB 2: SLOTS & CAPACITY */}
          {settingsTab === 'slots' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Walker Capacity per Slot */}
              <div
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '18px 20px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
                    <Dog size={15} /> Concurrent Walker Capacity
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    Maximum number of dogs that can be booked concurrently in the same walk time slot. Once reached, the slot displays as &ldquo;Full&rdquo; to customers.
                  </span>
                </div>

                <div style={{ maxWidth: '200px' }}>
                  <input
                    type="number"
                    className="input"
                    min="1"
                    max="10"
                    value={settings.maxCapacityPerSlot}
                    onChange={e => setSettings(prev => ({ ...prev, maxCapacityPerSlot: Number(e.target.value) }))}
                    style={{ fontWeight: 800, fontSize: '14px' }}
                  />
                </div>
              </div>

              {/* Daily Walking Slots */}
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
                    Time slots displayed to customers when booking dog walks across morning & evening shifts.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
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
            </div>
          )}

          {/* SUBTAB 3: GENERAL & SCHEDULE */}
          {settingsTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Online Bookings Status */}
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

              {/* Show NEW Feature Badge */}
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
                      <strong style={{ fontSize: '14.5px', color: 'var(--text)' }}>Show NEW Feature Badge</strong>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: 'var(--accent-bg)',
                          color: 'var(--accent)',
                          border: '1px solid var(--accent-border)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Sparkles size={10} /> NEW
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Display the golden &ldquo;NEW&rdquo; badge on the Pet Walking section of the customer homepage.
                    </span>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                    <input
                      type="checkbox"
                      checked={settings.showNewBadge !== false}
                      onChange={e => setSettings(prev => ({ ...prev, showNewBadge: e.target.checked }))}
                      style={{ width: '22px', height: '22px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>
                      {settings.showNewBadge !== false ? 'Badge Shown' : 'Badge Hidden'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Homepage Walking Banner Image */}
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
                    <Upload size={14} /> Homepage Pet Walking Banner Image
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    Custom photo shown in the Pet Walking card on the homepage. If removed, the default high-resolution image is displayed.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: '180px', height: '120px', borderRadius: '12px', overflow: 'hidden', border: '1.5px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
                    <img
                      src={settings.bannerImageUrl || petWalkingHero}
                      alt="Banner Preview"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = petWalkingHero;
                      }}
                    />
                    <div style={{ position: 'absolute', bottom: '6px', left: '6px', right: '6px', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', textAlign: 'center', fontWeight: 600 }}>
                      {settings.bannerImageUrl ? 'Custom Image Active' : 'Default Photo'}
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: uploadingBanner ? 'not-allowed' : 'pointer', width: 'fit-content', fontSize: '12.5px', padding: '8px 14px' }}>
                      <Upload size={14} />
                      {uploadingBanner ? (optimizingBanner ? 'Optimizing...' : 'Uploading...') : 'Upload Custom Image'}
                      <input
                        type="file"
                        accept={IMAGE_FILE_ACCEPT}
                        disabled={uploadingBanner}
                        style={{ display: 'none' }}
                        onChange={e => {
                          if (e.target.files?.[0]) {
                            handleBannerUpload(e.target.files[0])
                            e.target.value = ''
                          }
                        }}
                      />
                    </label>

                    {settings.bannerImageUrl && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content', fontSize: '12px', padding: '4px 8px', cursor: 'pointer' }}
                        onClick={() => setSettings(p => ({ ...p, bannerImageUrl: '' }))}
                      >
                        <Trash2 size={13} /> Remove Custom Image (Use Default)
                      </button>
                    )}

                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Supports JPG, PNG, WebP up to 10MB. Images are automatically compressed before upload.
                    </span>

                    {bannerUploadError && (
                      <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 500 }}>
                        {bannerUploadError}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Homepage Short Description */}
              <div
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '18px 20px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>
                    <Info size={14} /> Homepage Short Description
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    Keep it concise (1–2 lines) for optimal display on mobile screens.
                  </span>
                </div>
                <input
                  type="text"
                  className="input"
                  value={settings.description || ''}
                  placeholder="e.g. Reliable, loving dog walkers around Dhayari with morning & evening shifts."
                  onChange={e => setSettings(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              {/* Operating Days */}
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
            </div>
          )}

          {/* SUBTAB 4: SERVICEABLE LOCALITIES */}
          {settingsTab === 'areas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    Eligible locations in Dhayari, Pune where dog walking pick-up is supported.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
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
            </div>
          )}

          {/* Proper Floating Save Button */}
          <div className="admin-common-floating-save">
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="admin-floating-save-btn"
              aria-label="Save Settings"
            >
              <Save size={17} />
              <span>{savingSettings ? 'Saving...' : 'Save Settings'}</span>
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
                <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'var(--accent-bg)', border: '1.5px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0, overflow: 'hidden' }}>
                  {selectedBooking.petPhotoUrl || selectedBooking.photoUrl ? (
                    <img src={selectedBooking.petPhotoUrl || selectedBooking.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Dog size={24} />
                  )}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {selectedBooking.status === WALKING_STATUS.COMPLETED && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = selectedBooking.id
                      setSelectedBooking(null)
                      navigate(`/admin/invoices?mode=walking&id=${id}`)
                    }}
                    style={{
                      background: 'rgba(212, 175, 55, 0.12)',
                      border: '1px solid var(--accent-border)',
                      color: 'var(--accent)',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title="Generate or View Invoice"
                  >
                    <ReceiptText size={13} /> Invoice
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setSelectedBooking(null)}
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted)' }}
                >
                  <X size={16} />
                </button>
              </div>
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
                    {selectedBooking.mapPinUrl && (
                      <div style={{ marginTop: '8px' }}>
                        <a
                          href={selectedBooking.mapPinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#1d4ed8',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: 700,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <MapPin size={13} /> Open Live GPS / Map Pin in Google Maps ↗
                        </a>
                      </div>
                    )}
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

                {selectedBooking.status === WALKING_STATUS.COMPLETED && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = selectedBooking.id
                      setSelectedBooking(null)
                      navigate(`/admin/invoices?mode=walking&id=${id}`)
                    }}
                    className="btn btn-primary"
                    style={{
                      fontSize: '12px',
                      padding: '8px 14px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <ReceiptText size={14} /> Generate Invoice
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
          MODAL: RESCHEDULE (Modern Redesign)
         ========================================================================= */}
      {rescheduleTarget && (
        <div className="walking-modal-overlay" onClick={() => setRescheduleTarget(null)}>
          <div className="walking-modal-card" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="walking-modal-header">
              <div className="walking-modal-header-left">
                <div className="walking-modal-icon-badge reschedule">
                  <Calendar size={20} />
                </div>
                <div>
                  <h3 className="walking-modal-title">Reschedule Walk</h3>
                  <p className="walking-modal-subtitle">
                    For <strong>{rescheduleTarget.dogName}</strong>{rescheduleTarget.breed ? ` • ${rescheduleTarget.breed}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="walking-modal-close-btn"
                onClick={() => setRescheduleTarget(null)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="walking-modal-body">
              {/* Current Schedule Summary */}
              <div className="walking-current-schedule-banner">
                <div className="current-schedule-label">CURRENT SCHEDULE</div>
                <div className="current-schedule-details">
                  <span className="current-schedule-pill">
                    <Calendar size={13} />
                    <span>{formatFriendlyDate(rescheduleTarget.date)}</span>
                  </span>
                  <span className="current-schedule-pill">
                    <Clock size={13} />
                    <span>{rescheduleTarget.slot}</span>
                  </span>
                </div>
              </div>

              {/* New Date Picker */}
              <div className="walking-form-group">
                <label className="walking-form-label">
                  <Calendar size={13} />
                  <span>Select New Date</span>
                </label>
                <input
                  type="date"
                  className="walking-form-input"
                  min={new Date().toISOString().split('T')[0]}
                  value={rescheduleDate}
                  onChange={e => setRescheduleDate(e.target.value)}
                />
              </div>

              {/* New Slot Picker */}
              <div className="walking-form-group">
                <div className="walking-label-row">
                  <label className="walking-form-label">
                    <Clock size={13} />
                    <span>Choose Time Slot</span>
                  </label>
                  {rescheduleSlot && (
                    <span className="walking-selected-slot-hint">
                      Selected: <strong>{rescheduleSlot}</strong>
                    </span>
                  )}
                </div>
                <div className="walking-slots-grid">
                  {(settings.slots || DEFAULT_WALKING_SLOTS).map(s => {
                    const isSelected = rescheduleSlot === s
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setRescheduleSlot(s)}
                        className={`walking-slot-chip${isSelected ? ' active' : ''}`}
                      >
                        {isSelected && <Check size={12} className="slot-check-icon" />}
                        <span>{s}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notification Note */}
              <div className="walking-modal-info-note">
                <Info size={14} />
                <span>The customer will automatically receive an in-app notification confirming the updated schedule.</span>
              </div>
            </div>

            {/* Footer */}
            <div className="walking-modal-footer">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="btn btn-secondary walking-modal-btn"
                disabled={updatingId === rescheduleTarget.id}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReschedule}
                className="btn btn-primary walking-modal-btn"
                disabled={!rescheduleDate || !rescheduleSlot || updatingId === rescheduleTarget.id}
              >
                {updatingId === rescheduleTarget.id ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    <span>Rescheduling...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Confirm Reschedule</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CANCEL / DECLINE (Modern Redesign)
         ========================================================================= */}
      {cancelTarget && (
        <div className="walking-modal-overlay" onClick={() => setCancelTarget(null)}>
          <div className="walking-modal-card" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="walking-modal-header danger">
              <div className="walking-modal-header-left">
                <div className="walking-modal-icon-badge danger">
                  <XCircle size={22} />
                </div>
                <div>
                  <h3 className="walking-modal-title danger">Decline / Cancel Walk</h3>
                  <p className="walking-modal-subtitle">
                    Request for <strong>{cancelTarget.dogName}</strong>{cancelTarget.breed ? ` • ${cancelTarget.breed}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="walking-modal-close-btn"
                onClick={() => setCancelTarget(null)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="walking-modal-body">
              {/* Booking Info Box */}
              <div className="walking-cancel-summary-box">
                <div className="cancel-summary-top">
                  <div className="cancel-dog-info">
                    <Dog size={16} />
                    <strong>{cancelTarget.dogName}</strong>
                    {cancelTarget.planTitle && <span className="cancel-plan-badge">{cancelTarget.planTitle}</span>}
                  </div>
                  <div className="cancel-schedule-info">
                    <Calendar size={13} />
                    <span>{formatFriendlyDate(cancelTarget.date)}</span>
                    <span className="dot">•</span>
                    <Clock size={13} />
                    <span>{cancelTarget.slot}</span>
                  </div>
                </div>
                {(cancelTarget.userName || cancelTarget.userPhone) && (
                  <div className="cancel-customer-row">
                    <User size={12} />
                    <span>
                      Customer: <strong>{cancelTarget.userName || 'Pet Parent'}</strong>
                      {cancelTarget.userPhone ? ` (${cancelTarget.userPhone})` : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Quick Reason Chips */}
              <div className="walking-form-group">
                <label className="walking-form-label">
                  <span>Quick Reasons (Click to fill)</span>
                </label>
                <div className="walking-reason-chips">
                  {QUICK_CANCEL_REASONS.map(reason => (
                    <button
                      key={reason}
                      type="button"
                      className={`walking-reason-chip${cancelReason === reason ? ' active' : ''}`}
                      onClick={() => setCancelReason(reason)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea */}
              <div className="walking-form-group">
                <label className="walking-form-label">
                  <span>Reason for Cancellation</span>
                  <small className="walking-optional-tag">Shared with customer</small>
                </label>
                <textarea
                  className="walking-form-textarea"
                  rows={3}
                  placeholder="Explain why the walk cannot be fulfilled (e.g. Walker unavailable in this locality, severe weather, etc.)..."
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                />
              </div>

              <div className="walking-cancel-warning-note">
                <Info size={14} />
                <span>This will decline the request, free up the walker slot, and notify the pet parent.</span>
              </div>
            </div>

            {/* Footer */}
            <div className="walking-modal-footer">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="btn btn-secondary walking-modal-btn"
                disabled={updatingId === cancelTarget.id}
              >
                Keep Booking
              </button>
              <button
                type="button"
                onClick={() => handleUpdateStatus(cancelTarget, WALKING_STATUS.CANCELLED, cancelReason)}
                className="btn btn-danger-action walking-modal-btn"
                disabled={updatingId === cancelTarget.id}
              >
                {updatingId === cancelTarget.id ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <>
                    <XCircle size={15} />
                    <span>Confirm Cancellation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scoped responsive styles */}
      <style>{`
        /* Walking Modals Redesign */
        .walking-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1250;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(5px);
          display: grid;
          place-items: center;
          padding: 16px;
          overflow-y: auto;
          box-sizing: border-box;
        }

        .walking-modal-card {
          width: min(100%, 500px);
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: walkingModalZoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
        }

        @keyframes walkingModalZoomIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .walking-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 20px 14px;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
        }

        .walking-modal-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .walking-modal-icon-badge {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .walking-modal-icon-badge.reschedule {
          background: rgba(217, 119, 6, 0.12);
          color: #d97706;
          border: 1px solid rgba(217, 119, 6, 0.25);
        }

        .walking-modal-icon-badge.danger {
          background: rgba(239, 68, 68, 0.12);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }

        .walking-modal-title {
          margin: 0;
          font-size: 17px;
          font-weight: 800;
          color: var(--text);
          line-height: 1.25;
        }

        .walking-modal-title.danger {
          color: #ef4444;
        }

        .walking-modal-subtitle {
          margin: 2px 0 0;
          font-size: 12px;
          color: var(--muted);
          line-height: 1.35;
        }

        .walking-modal-close-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.18s ease;
          flex-shrink: 0;
        }

        .walking-modal-close-btn:hover {
          color: var(--text);
          background: var(--card);
        }

        .walking-modal-body {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 15px;
          max-height: calc(85vh - 150px);
          overflow-y: auto;
          box-sizing: border-box;
        }

        /* Current Schedule Banner */
        .walking-current-schedule-banner {
          background: linear-gradient(135deg, rgba(217, 119, 6, 0.08) 0%, rgba(217, 119, 6, 0.02) 100%);
          border: 1px solid rgba(217, 119, 6, 0.2);
          border-radius: 12px;
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .current-schedule-label {
          font-size: 10.5px;
          font-weight: 800;
          color: #d97706;
          letter-spacing: 0.5px;
        }

        .current-schedule-details {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .current-schedule-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text);
          background: var(--card);
          border: 1px solid var(--border);
          padding: 4px 10px;
          border-radius: 6px;
        }

        /* Cancel Summary Box */
        .walking-cancel-summary-box {
          background: rgba(239, 68, 68, 0.05);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .cancel-summary-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }

        .cancel-dog-info {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          color: var(--text);
        }

        .cancel-plan-badge {
          font-size: 10.5px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 5px;
          background: rgba(217, 119, 6, 0.12);
          color: #d97706;
        }

        .cancel-schedule-info {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          color: var(--muted);
        }

        .cancel-schedule-info .dot {
          opacity: 0.5;
        }

        .cancel-customer-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: var(--muted);
          border-top: 1px dashed rgba(239, 68, 68, 0.2);
          padding-top: 6px;
        }

        /* Form controls */
        .walking-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .walking-form-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .walking-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .walking-selected-slot-hint {
          font-size: 11.5px;
          color: #d97706;
        }

        .walking-optional-tag {
          font-size: 10.5px;
          color: var(--muted);
          text-transform: none;
          font-weight: 500;
          margin-left: auto;
        }

        .walking-form-input {
          width: 100%;
          padding: 9px 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-size: 13.5px;
          box-sizing: border-box;
          transition: border-color 0.18s ease;
        }

        .walking-form-input:focus {
          outline: none;
          border-color: var(--accent);
        }

        .walking-form-textarea {
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-size: 13px;
          font-family: inherit;
          resize: none;
          box-sizing: border-box;
          transition: border-color 0.18s ease;
          line-height: 1.45;
        }

        .walking-form-textarea:focus {
          outline: none;
          border-color: #ef4444;
        }

        /* Slots Grid */
        .walking-slots-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
          gap: 6px;
        }

        .walking-slot-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 8px 10px;
          border-radius: 9px;
          border: 1.5px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.16s ease;
        }

        .walking-slot-chip:hover {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--surface) 90%, var(--accent));
          transform: translateY(-1px);
        }

        .walking-slot-chip.active {
          background: var(--accent);
          border-color: var(--accent);
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(217, 119, 6, 0.3);
        }

        .slot-check-icon {
          flex-shrink: 0;
        }

        /* Reason Chips */
        .walking-reason-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .walking-reason-chip {
          display: inline-flex;
          align-items: center;
          padding: 5px 10px;
          border-radius: 7px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .walking-reason-chip:hover {
          border-color: #ef4444;
          color: #ef4444;
          background: rgba(239, 68, 68, 0.05);
        }

        .walking-reason-chip.active {
          background: rgba(239, 68, 68, 0.12);
          border-color: #ef4444;
          color: #ef4444;
          font-weight: 700;
        }

        /* Info Notes */
        .walking-modal-info-note {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 11.5px;
          color: var(--muted);
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 8px 12px;
          border-radius: 9px;
          line-height: 1.4;
        }

        .walking-modal-info-note svg {
          color: #d97706;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .walking-cancel-warning-note {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 11.5px;
          color: #ef4444;
          background: rgba(239, 68, 68, 0.06);
          border: 1px solid rgba(239, 68, 68, 0.2);
          padding: 8px 12px;
          border-radius: 9px;
          line-height: 1.4;
        }

        .walking-cancel-warning-note svg {
          flex-shrink: 0;
          margin-top: 1px;
        }

        /* Footer */
        .walking-modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          padding: 14px 20px;
          border-top: 1px solid var(--border);
          background: var(--surface);
        }

        .walking-modal-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 18px;
          font-size: 13px;
          font-weight: 700;
          border-radius: 10px;
          cursor: pointer;
          white-space: nowrap;
        }

        .btn-danger-action {
          background: #ef4444;
          border: 1px solid #ef4444;
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(239, 68, 68, 0.3);
          transition: all 0.18s ease;
        }

        .btn-danger-action:hover:not(:disabled) {
          background: #dc2626;
          border-color: #dc2626;
          transform: translateY(-1px);
        }

        .btn-danger-action:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }

        .admin-walking-page {
          padding: 24px 20px 80px;
          max-width: 1280px;
          margin: 0 auto;
          color: var(--text);
          box-sizing: border-box;
          width: 100%;
        }

        @media (max-width: 768px) {
          .admin-walking-page {
            padding: 12px 6px 90px !important;
          }
          .walking-booking-card {
            padding: 12px 10px !important;
          }
        }

        .walking-subtabs-bar {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 4px;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          width: 100%;
        }
        .walking-subtabs-bar::-webkit-scrollbar {
          display: none;
        }

        .walking-subtab-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--muted);
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }
        .walking-subtab-btn.active {
          background: var(--accent);
          color: #ffffff;
          border-color: var(--accent);
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        }

        .walking-sticky-bar {
          position: sticky;
          bottom: 14px;
          z-index: 40;
          display: flex;
          justify-content: center;
          margin-top: 24px;
          pointer-events: none;
        }
        .walking-sticky-bar-content {
          pointer-events: auto;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 10px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
          width: 100%;
          max-width: 640px;
          backdrop-filter: blur(12px);
          box-sizing: border-box;
        }
        .walking-sticky-info {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .walking-status-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
          flex-shrink: 0;
        }
        .walking-status-text strong {
          display: block;
          font-size: 13px;
          color: var(--text);
          white-space: nowrap;
        }
        .walking-status-text small {
          display: block;
          font-size: 11px;
          color: var(--muted);
          white-space: nowrap;
        }
        @media (max-width: 600px) {
          .walking-sticky-bar {
            bottom: 8px;
          }
          .walking-sticky-bar-content {
            padding: 8px 12px;
            gap: 8px;
          }
          .walking-status-text small {
            display: none;
          }
          .walking-status-text strong {
            font-size: 12px;
          }
          .walking-save-btn {
            padding: 7px 14px !important;
            font-size: 12px !important;
            white-space: nowrap;
          }
        }
      `}</style>
    </div>
  )
}

