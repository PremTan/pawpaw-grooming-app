// src/admin/AdminWalking.jsx
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  query,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  setDoc,
  addDoc,
  orderBy,
  serverTimestamp,
  deleteDoc,
  onSnapshot,
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
  DEFAULT_WALKING_PACKS,
  calculatePackPrice,
  buildWalkingWhatsAppMessage,
  WALKING_STATUS,
  WALKING_STATUS_LABELS,
  WALKING_STATUS_BADGES,
} from '../utils/walkingSettings'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import petWalkingHero from '../assets/pet-walking-hero.jpg'
import LiveWalkModal from '../components/LiveWalkModal'
import { formatDistance, formatDurationHuman, calculatePace, calculateCalories } from '../utils/geoUtils'
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
  Package,
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
  UserCheck,
  UserRound,
  Share2,
  Copy,
  Star,
  AlertOctagon,
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

const generateWhatsAppReportMessage = (booking) => {
  if (!booking) return ''
  const dogName = booking.dogName || booking.petName || 'Dog'
  const breed = booking.breed || booking.dogBreed || ''
  const report = booking.walkReport || {}
  const durationSec = report.durationSeconds || booking.walkDurationSeconds || 0
  const distanceM = report.distanceMeters || booking.walkDistanceMeters || 0

  let msg = `🐾 *Paw Paw Pet Walking - Walk Report Card* 🐾\n`
  msg += `------------------------------------\n`
  msg += `🐶 *Pet:* ${dogName}${breed ? ` (${breed})` : ''}\n`
  if (report.walkerName || booking.assignedWalkerName) {
    msg += `🚶 *Walker:* ${report.walkerName || booking.assignedWalkerName}\n`
  }
  msg += `⏱️ *Duration:* ${formatDurationHuman(durationSec)}\n`
  msg += `📍 *Distance Walked:* ${formatDistance(distanceM)}\n`
  const pace = booking.walkPace || calculatePace(distanceM, durationSec).formatted
  const calories = booking.estimatedCalories || calculateCalories(distanceM, durationSec)
  msg += `⚡ *Avg Pace:* ${pace}\n`
  msg += `🔥 *Estimated Burn:* ~${calories} kcal\n`
  msg += `💧 *Pee Breaks:* ${report.peeCount ?? booking.walkActivities?.pee ?? 0}\n`
  msg += `💩 *Poop Breaks:* ${report.pooCount ?? booking.walkActivities?.poo ?? 0}\n`
  msg += `🥤 *Hydrated:* ${(report.waterGiven ?? booking.walkActivities?.water) ? 'Yes 💧' : 'No'}\n`
  msg += `🍖 *Treats:* ${report.treatCount ?? booking.walkActivities?.treats ?? 0}\n`
  if (report.notes || booking.walkerNotes) {
    msg += `📝 *Walker Note:* "${report.notes || booking.walkerNotes}"\n`
  }
  if (report.photos?.length || booking.walkPhotos?.length) {
    const photos = report.photos || booking.walkPhotos || []
    msg += `📸 *Photos (${photos.length}):*\n`
    photos.forEach((url, i) => {
      msg += `Photo ${i + 1}: ${url}\n`
    })
  }
  msg += `------------------------------------\n`
  msg += `Thank you for choosing Paw Paw Pet Care! ❤️🐕\n`
  msg += `Tracked with real-time GPS & care monitoring.`
  return encodeURIComponent(msg)
}

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

  // Confirm & Walker Assignment Modal
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [confirmWalkerId, setConfirmWalkerId] = useState('')
  const [confirmSendWhatsApp, setConfirmSendWhatsApp] = useState(false)

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

  // Team & Walker Assignment State
  const [teamMembers, setTeamMembers] = useState([])
  const [walkerFilter, setWalkerFilter] = useState('all')
  const [assigningId, setAssigningId] = useState('')
  const [liveTrackingBooking, setLiveTrackingBooking] = useState(null)

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
    setLoadingBookings(true)
    const q = query(collection(db, 'walkingBookings'), orderBy('createdAt', 'desc'))

    let unsub = null
    try {
      unsub = onSnapshot(
        q,
        (snap) => {
          setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
          setLoadingBookings(false)
        },
        () => {
          // Fallback snapshot without composite ordering
          unsub = onSnapshot(collection(db, 'walkingBookings'), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            list.sort((a, b) => {
              const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0
              const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0
              return bTime - aTime
            })
            setBookings(list)
            setLoadingBookings(false)
          })
        }
      )
    } catch {
      loadBookings()
    }

    fetchWalkingSettings(db).then(setSettings)
    fetchBusinessInfo(db).then(biz => {
      if (biz) {
        setAdminWhatsappNumber(biz.whatsappNumber || '')
        setShopName(biz.contact?.shopName || 'Paw Paw Pet Grooming')
      }
    })

    // Load active team members for walker assignment
    async function loadTeam() {
      try {
        const snap = await getDocs(collection(db, 'teamMembers'))
        setTeamMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch (err) {
        console.warn('Could not load team members:', err)
      }
    }
    loadTeam()

    return () => {
      if (unsub) unsub()
    }
  }, [])

  // Filter assignable team members (only active members with role containing 'Walker')
  const walkerOptions = useMemo(() => {
    return teamMembers.filter(m => {
      if (m.active === false) return false
      return (m.role || '').trim().toLowerCase().includes('walker')
    })
  }, [teamMembers])

  // Assign or unassign a walker
  const handleAssignWalker = async (booking, walkerId) => {
    if (!booking) return
    setAssigningId(booking.id)
    try {
      const selected = walkerOptions.find(w => w.id === walkerId)
      const patch = selected ? {
        assignedTeamMemberId: selected.id,
        assignedTeamMemberName: selected.name,
        assignedTeamMemberPhone: selected.phone || '',
        assignedTeamMemberRole: selected.role || 'Walker',
        assignedWalkerId: selected.id,
        assignedWalkerName: selected.name,
        assignedWalkerPhone: selected.phone || '',
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } : {
        assignedTeamMemberId: null,
        assignedTeamMemberName: '',
        assignedTeamMemberPhone: '',
        assignedTeamMemberRole: '',
        assignedWalkerId: null,
        assignedWalkerName: '',
        assignedWalkerPhone: '',
        assignedAt: null,
        updatedAt: serverTimestamp(),
      }

      await updateDoc(doc(db, 'walkingBookings', booking.id), patch)

      if (selected) {
        addDoc(collection(db, 'walkerNotifications'), {
          walkerId: selected.id,
          title: `🐾 New Dog Walk Assigned!`,
          message: `${booking.dogName || booking.petName || 'Dog'} on ${booking.date || booking.walkingDate || 'scheduled date'} (${booking.slot || booking.walkingSlot || 'slot'})`,
          bookingId: booking.id,
          dogName: booking.dogName || booking.petName || 'Dog',
          area: booking.area || 'Dhayari',
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {})
      }

      setBookings(prev => prev.map(item => item.id === booking.id ? { ...item, ...patch } : item))
      if (selectedBooking?.id === booking.id) {
        setSelectedBooking(prev => ({ ...prev, ...patch }))
      }
      setToastMessage(selected ? `Assigned to walker ${selected.name}!` : 'Walker unassigned.')
    } catch (err) {
      alert(`Could not assign walker: ${err.message}`)
    } finally {
      setAssigningId('')
    }
  }

  // Send walk details and live portal link to Walker on WhatsApp
  const handleSendWalkToWalkerWhatsApp = (booking) => {
    if (!booking) return
    const walkerPhone = booking.assignedTeamMemberPhone || booking.assignedWalkerPhone || ''
    const rawPhone = String(walkerPhone).replace(/\D/g, '')
    const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone

    const mapUrl = booking.mapPinUrl || booking.mapLink || (booking.lat && booking.lng ? `https://www.google.com/maps?q=${booking.lat},${booking.lng}` : '')
    const portalUrl = `${window.location.origin}/walker?walkerId=${booking.assignedTeamMemberId || booking.assignedWalkerId || ''}`

    const msg = `🐾 *Paw Paw — Dog Walk Assignment Details*

🐶 *Dog:* ${booking.dogName || booking.petName || 'Dog'} (${booking.breed || booking.petBreed || 'Breed not specified'})
📅 *Date:* ${booking.date || booking.walkingDate || '-'}
⏰ *Time Slot:* ${booking.slot || booking.walkingSlot || '-'} (${booking.duration || 30} Mins Walk)
👤 *Pet Parent:* ${booking.ownerName || 'Pet Parent'} (${booking.phone || '-'})
📍 *Pickup Address:* ${booking.pickupAddress || booking.address || '-'}${booking.area ? `, ${booking.area}` : ''}${booking.landmark ? ` (Landmark: ${booking.landmark})` : ''}
${mapUrl ? `🗺️ *Google Maps:* ${mapUrl}\n` : ''}
${booking.behaviorNotes ? `⚠️ *Instructions:* ${booking.behaviorNotes}\n` : ''}
🚀 *Open Walker Portal to Start Live Walk:*
${portalUrl}`

    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(waUrl, '_blank')
  }

  // Filter Bookings
  const filteredBookings = bookings.filter(b => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    if (walkerFilter !== 'all') {
      if (walkerFilter === 'unassigned') {
        if (b.assignedTeamMemberId || b.assignedWalkerId) return false
      } else {
        if ((b.assignedTeamMemberId || b.assignedWalkerId) !== walkerFilter) return false
      }
    }
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (b.dogName || b.petName || '').toLowerCase().includes(q) ||
      (b.ownerName || '').toLowerCase().includes(q) ||
      (b.phone || '').toLowerCase().includes(q) ||
      (b.area || '').toLowerCase().includes(q) ||
      (b.pickupAddress || '').toLowerCase().includes(q) ||
      (b.assignedTeamMemberName || '').toLowerCase().includes(q) ||
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

      const targetWalkerId = booking.assignedWalkerId || booking.assignedTeamMemberId
      if (targetWalkerId && newStatus === WALKING_STATUS.CONFIRMED) {
        addDoc(collection(db, 'walkerNotifications'), {
          walkerId: targetWalkerId,
          title: `🐾 Walk Confirmed!`,
          message: `${booking.dogName || booking.petName || 'Dog'} on ${booking.date || booking.walkingDate || 'scheduled date'} (${booking.slot || booking.walkingSlot || 'slot'})`,
          bookingId: booking.id,
          dogName: booking.dogName || booking.petName || 'Dog',
          area: booking.area || 'Dhayari',
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {})
      }

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

  // Open Confirm & Assign Walker Modal
  const openConfirmModal = (booking) => {
    if (!booking) return
    setConfirmTarget(booking)
    const existingWalker = booking.assignedWalkerId || booking.assignedTeamMemberId || ''
    if (existingWalker) {
      setConfirmWalkerId(existingWalker)
    } else if (walkerOptions.length === 1) {
      setConfirmWalkerId(walkerOptions[0].id)
    } else {
      setConfirmWalkerId('')
    }
    setConfirmSendWhatsApp(false)
  }

  // Confirm booking & assign selected walker
  const handleConfirmAndAssign = async () => {
    if (!confirmTarget) return
    setUpdatingId(confirmTarget.id)
    try {
      const selectedWalker = walkerOptions.find(w => w.id === confirmWalkerId)

      const patch = {
        status: WALKING_STATUS.CONFIRMED,
        confirmedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      if (selectedWalker) {
        patch.assignedTeamMemberId = selectedWalker.id
        patch.assignedTeamMemberName = selectedWalker.name
        patch.assignedTeamMemberPhone = selectedWalker.phone || ''
        patch.assignedTeamMemberRole = selectedWalker.role || 'Walker'
        patch.assignedWalkerId = selectedWalker.id
        patch.assignedWalkerName = selectedWalker.name
        patch.assignedWalkerPhone = selectedWalker.phone || ''
        patch.assignedAt = serverTimestamp()
      }

      await updateDoc(doc(db, 'walkingBookings', confirmTarget.id), patch)

      // Notify Walker in Walker Portal
      if (selectedWalker) {
        addDoc(collection(db, 'walkerNotifications'), {
          walkerId: selectedWalker.id,
          title: `🐾 New Dog Walk Assigned!`,
          message: `${confirmTarget.dogName || confirmTarget.petName || 'Dog'} on ${confirmTarget.date || 'date'} (${confirmTarget.slot || 'slot'})`,
          bookingId: confirmTarget.id,
          dogName: confirmTarget.dogName || confirmTarget.petName || 'Dog',
          area: confirmTarget.area || 'Dhayari',
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {})
      }

      // Update local state
      setBookings(prev => prev.map(item => item.id === confirmTarget.id ? { ...item, ...patch } : item))
      if (selectedBooking?.id === confirmTarget.id) {
        setSelectedBooking(prev => ({ ...prev, ...patch }))
      }

      // Notify Customer
      if (confirmTarget.userId && sendNotification) {
        await sendNotification(confirmTarget.userId, {
          userEmail: confirmTarget.userEmail || '',
          toAdmin: false,
          title: '🐕 Pet Walking: Confirmed',
          message: `Your dog walking session for ${confirmTarget.dogName} on ${confirmTarget.date} at ${confirmTarget.slot} has been confirmed!`,
          type: 'walking_update',
          bookingId: confirmTarget.id,
          actionUrl: '/my-bookings?tab=walking',
        }).catch(() => {})
      }

      // If WhatsApp option enabled and walker has phone
      if (confirmSendWhatsApp && selectedWalker?.phone) {
        handleSendWalkToWalkerWhatsApp({ ...confirmTarget, ...patch })
      }

      setToastMessage(
        selectedWalker
          ? `Walk confirmed & assigned to ${selectedWalker.name}!`
          : 'Walk confirmed successfully!'
      )
      setConfirmTarget(null)
    } catch (err) {
      alert(`Could not confirm walk: ${err.message}`)
    } finally {
      setUpdatingId('')
    }
  }

  // Resolve Walker Emergency
  const handleAdminResolveEmergency = async (booking) => {
    if (!booking) return
    setUpdatingId(booking.id)
    try {
      const patch = {
        hasEmergency: false,
        emergencyStatus: 'resolved',
        emergencyResolvedAt: serverTimestamp(),
        emergencyResolvedBy: 'admin',
        updatedAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'walkingBookings', booking.id), patch)
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, ...patch } : b))
      if (selectedBooking?.id === booking.id) {
        setSelectedBooking(prev => ({ ...prev, ...patch }))
      }
      setToastMessage('Emergency alert marked as resolved.')
    } catch (err) {
      alert(`Could not resolve emergency: ${err.message}`)
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

          {/* Search & Walker Filter Bar */}
          <div style={{ marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1', minWidth: '220px', maxWidth: '420px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                className="input"
                placeholder="Search dog, owner, phone, address, or walker..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '34px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Footprints size={15} color="var(--accent)" />
              <select
                className="input"
                value={walkerFilter}
                onChange={e => setWalkerFilter(e.target.value)}
                style={{ fontSize: '12.5px', padding: '7px 10px', minWidth: '150px' }}
                aria-label="Filter by assigned walker"
              >
                <option value="all">All Walkers ({bookings.length})</option>
                <option value="unassigned">⚠️ Unassigned ({bookings.filter(b => !b.assignedTeamMemberId && !b.assignedWalkerId).length})</option>
                {walkerOptions.map(w => {
                  const countForWalker = bookings.filter(b => (b.assignedTeamMemberId || b.assignedWalkerId) === w.id).length
                  return (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.role ? `(${w.role})` : ''} ({countForWalker})
                    </option>
                  )
                })}
              </select>
            </div>
          </div>

          {/* 🚨 Global Emergency SOS Banner in Admin Panel */}
          {(() => {
            const emergencies = bookings.filter(b => b.hasEmergency)
            if (emergencies.length === 0) return null

            return (
              <div style={{
                background: '#fee2e2',
                border: '2px solid #ef4444',
                borderRadius: '16px',
                padding: '16px 20px',
                marginBottom: '16px',
                boxShadow: '0 8px 30px rgba(220, 38, 38, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <AlertOctagon size={24} />
                  </div>
                  <div>
                    <strong style={{ fontSize: '15px', color: '#991b1b', display: 'block' }}>
                      🚨 ACTIVE WALKER SOS EMERGENCY ({emergencies.length} Walk{emergencies.length > 1 ? 's' : ''})
                    </strong>
                    <span style={{ fontSize: '12.5px', color: '#b91c1c' }}>
                      {emergencies.map(e => `${e.dogName || 'Dog'} (${e.assignedTeamMemberName || 'Walker'}) - ${e.emergencyReason || 'Urgent incident'}`).join(' · ')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openBookingDetails(emergencies[0])}
                  className="btn"
                  style={{ background: '#dc2626', color: '#fff', fontWeight: 800, fontSize: '13px', padding: '9px 16px', borderRadius: '10px' }}
                >
                  View Emergency Details 🚨
                </button>
              </div>
            )
          })()}

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
                    onClick={() => openBookingDetails(b)}
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                      cursor: 'pointer',
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
                        {b.hasEmergency && (
                          <span className="badge" style={{ background: '#fee2e2', color: '#dc2626', border: '1.5px solid #ef4444', fontWeight: 900 }}>
                            🚨 SOS ALERT
                          </span>
                        )}
                        {b.status === WALKING_STATUS.CONFIRMED && b.walkerArrivalStatus === 'on_the_way' && (
                          <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                            🚗 On The Way
                          </span>
                        )}
                        {b.status === WALKING_STATUS.CONFIRMED && b.walkerArrivalStatus === 'arrived' && (
                          <span className="badge" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                            📍 At Doorstep
                          </span>
                        )}
                        {b.status === WALKING_STATUS.COMPLETED && b.walkerRating && (
                          <span className="badge" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Star size={11} fill="#f59e0b" color="#f59e0b" /> {b.walkerRating}/5
                          </span>
                        )}
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
                      <div>
                        <span style={{ color: 'var(--muted)', display: 'block', fontSize: '11px' }}>ASSIGNED WALKER</span>
                        {b.assignedTeamMemberName ? (
                          <strong style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Footprints size={13} /> {b.assignedTeamMemberName}
                          </strong>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Footprints size={13} /> Unassigned
                          </span>
                        )}
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
                        {b.status === WALKING_STATUS.IN_PROGRESS && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              setLiveTrackingBooking(b)
                            }}
                            style={{
                              background: '#16a34a',
                              border: '1px solid #15803d',
                              color: '#fff',
                              fontWeight: 800,
                              fontSize: '12px',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)',
                            }}
                          >
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#fff', animation: 'pawpaw-gps-pulse 1.5s infinite' }} />
                            Live GPS Walk
                          </button>
                        )}
                        {b.status === WALKING_STATUS.COMPLETED && (Array.isArray(b.routeTrail) && b.routeTrail.length > 0) && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              setLiveTrackingBooking(b)
                            }}
                            style={{
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              color: 'var(--accent)',
                              fontWeight: 700,
                              fontSize: '12px',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Footprints size={13} /> View Route
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            openBookingDetails(b)
                          }}
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
                            onClick={e => e.stopPropagation()}
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
                              onClick={e => {
                                e.stopPropagation()
                                openConfirmModal(b)
                              }}
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
                              onClick={e => {
                                e.stopPropagation()
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
                              onClick={e => {
                                e.stopPropagation()
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
                          <button
                            type="button"
                            disabled={updatingId === b.id}
                            onClick={e => {
                              e.stopPropagation()
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
                        )}

                        {isInProgress && (
                          <button
                            type="button"
                            disabled={updatingId === b.id}
                            onClick={e => {
                              e.stopPropagation()
                              handleUpdateStatus(b, WALKING_STATUS.COMPLETED)
                            }}
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
                            onClick={e => {
                              e.stopPropagation()
                              navigate(`/admin/invoices?mode=walking&id=${b.id}`)
                            }}
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
            <button
              type="button"
              className={`walking-subtab-btn ${settingsTab === 'packs' ? 'active' : ''}`}
              onClick={() => setSettingsTab('packs')}
            >
              <Package size={14} /> Walking Packs ({settings.packs?.enabled !== false ? 'Active' : 'Off'})
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

          {/* SUBTAB 5: WALKING PACKS & SUBSCRIPTIONS */}
          {settingsTab === 'packs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Master Pack Toggle */}
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
                      <strong style={{ fontSize: '14.5px', color: 'var(--text)' }}>Weekly & Monthly Walking Packs</strong>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: (settings.packs?.enabled ?? true) ? '#dcfce7' : '#fee2e2',
                          color: (settings.packs?.enabled ?? true) ? '#15803d' : '#b91c1c',
                          border: `1px solid ${(settings.packs?.enabled ?? true) ? '#bbf7d0' : '#fecaca'}`,
                        }}
                      >
                        {(settings.packs?.enabled ?? true) ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Allow pet parents to book 7-Day or Monthly subscription passes upfront with bundle discounts instead of booking daily.
                    </span>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                    <input
                      type="checkbox"
                      checked={settings.packs?.enabled ?? true}
                      onChange={e => setSettings(prev => ({
                        ...prev,
                        packs: {
                          ...(prev.packs || DEFAULT_WALKING_PACKS),
                          enabled: e.target.checked,
                        },
                      }))}
                      style={{ width: '22px', height: '22px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>
                      {(settings.packs?.enabled ?? true) ? 'Packs Enabled' : 'Packs Disabled'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Weekly & Monthly Pack Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                {/* 1. Weekly Pack */}
                <div
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '18px 20px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', fontWeight: 800, color: 'var(--accent)' }}>
                      <Package size={16} /> 7-Day Weekly Pack
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.packs?.weekly?.enabled ?? true}
                        onChange={e => setSettings(prev => ({
                          ...prev,
                          packs: {
                            ...(prev.packs || DEFAULT_WALKING_PACKS),
                            weekly: {
                              ...((prev.packs || DEFAULT_WALKING_PACKS).weekly || {}),
                              enabled: e.target.checked,
                            },
                          },
                        }))}
                        style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)' }}>Active</span>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '3px' }}>
                        Total Walks in Pack
                      </label>
                      <input
                        type="number"
                        min="3"
                        max="14"
                        className="input"
                        value={settings.packs?.weekly?.totalWalks ?? 7}
                        onChange={e => setSettings(prev => ({
                          ...prev,
                          packs: {
                            ...(prev.packs || DEFAULT_WALKING_PACKS),
                            weekly: {
                              ...((prev.packs || DEFAULT_WALKING_PACKS).weekly || {}),
                              totalWalks: Number(e.target.value) || 7,
                            },
                          },
                        }))}
                        style={{ fontSize: '12.5px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '3px' }}>
                        Bundle Discount (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        className="input"
                        value={settings.packs?.weekly?.discountPercent ?? 12}
                        onChange={e => setSettings(prev => ({
                          ...prev,
                          packs: {
                            ...(prev.packs || DEFAULT_WALKING_PACKS),
                            weekly: {
                              ...((prev.packs || DEFAULT_WALKING_PACKS).weekly || {}),
                              discountPercent: Number(e.target.value) || 0,
                            },
                          },
                        }))}
                        style={{ fontSize: '12.5px' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '3px' }}>
                      Badge Text (Shown to Clients)
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={settings.packs?.weekly?.badgeText ?? 'Most Popular'}
                      onChange={e => setSettings(prev => ({
                        ...prev,
                        packs: {
                          ...(prev.packs || DEFAULT_WALKING_PACKS),
                          weekly: {
                            ...((prev.packs || DEFAULT_WALKING_PACKS).weekly || {}),
                            badgeText: e.target.value,
                          },
                        },
                      }))}
                      style={{ fontSize: '12.5px' }}
                    />
                  </div>
                </div>

                {/* 2. Monthly Pack */}
                <div
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '18px 20px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', fontWeight: 800, color: 'var(--accent)' }}>
                      <Package size={16} /> Monthly Subscription Pack
                    </div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.packs?.monthly?.enabled ?? true}
                        onChange={e => setSettings(prev => ({
                          ...prev,
                          packs: {
                            ...(prev.packs || DEFAULT_WALKING_PACKS),
                            monthly: {
                              ...((prev.packs || DEFAULT_WALKING_PACKS).monthly || {}),
                              enabled: e.target.checked,
                            },
                          },
                        }))}
                        style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)' }}>Active</span>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '3px' }}>
                        Total Walks (Mon–Sat standard)
                      </label>
                      <input
                        type="number"
                        min="15"
                        max="31"
                        className="input"
                        value={settings.packs?.monthly?.totalWalks ?? 26}
                        onChange={e => setSettings(prev => ({
                          ...prev,
                          packs: {
                            ...(prev.packs || DEFAULT_WALKING_PACKS),
                            monthly: {
                              ...((prev.packs || DEFAULT_WALKING_PACKS).monthly || {}),
                              totalWalks: Number(e.target.value) || 26,
                            },
                          },
                        }))}
                        style={{ fontSize: '12.5px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '3px' }}>
                        Bundle Discount (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        className="input"
                        value={settings.packs?.monthly?.discountPercent ?? 22}
                        onChange={e => setSettings(prev => ({
                          ...prev,
                          packs: {
                            ...(prev.packs || DEFAULT_WALKING_PACKS),
                            monthly: {
                              ...((prev.packs || DEFAULT_WALKING_PACKS).monthly || {}),
                              discountPercent: Number(e.target.value) || 0,
                            },
                          },
                        }))}
                        style={{ fontSize: '12.5px' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '3px' }}>
                      Badge Text (Shown to Clients)
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={settings.packs?.monthly?.badgeText ?? 'Best Value (Save 22%)'}
                      onChange={e => setSettings(prev => ({
                        ...prev,
                        packs: {
                          ...(prev.packs || DEFAULT_WALKING_PACKS),
                          monthly: {
                            ...((prev.packs || DEFAULT_WALKING_PACKS).monthly || {}),
                            badgeText: e.target.value,
                          },
                        },
                      }))}
                      style={{ fontSize: '12.5px' }}
                    />
                  </div>
                </div>
              </div>

              {/* 3. Out-of-town / Skip Day Policy Card */}
              <div
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '18px 20px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontSize: '18px' }}>🗓️</div>
                    <div>
                      <strong style={{ fontSize: '14px', color: 'var(--text)' }}>"Skip Day / Going Out" Policy</strong>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        If a parent is out of town, they can tap "Skip Walk" in their bookings. The pack validity auto-extends by +1 day so no walk is lost!
                      </div>
                    </div>
                  </div>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.packs?.allowSkip ?? true}
                      onChange={e => setSettings(prev => ({
                        ...prev,
                        packs: {
                          ...(prev.packs || DEFAULT_WALKING_PACKS),
                          allowSkip: e.target.checked,
                        },
                      }))}
                      style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Allow Skipping</span>
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface)', padding: '12px 14px', borderRadius: '10px' }}>
                  <Clock size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Minimum Skip Notice (Hours)</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Parent must tap skip at least this many hours before the walk slot to prevent unnecessary walker travel.
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    className="input"
                    value={settings.packs?.minSkipNoticeHours ?? 2}
                    onChange={e => setSettings(prev => ({
                      ...prev,
                      packs: {
                        ...(prev.packs || DEFAULT_WALKING_PACKS),
                        minSkipNoticeHours: Number(e.target.value) || 2,
                      },
                    }))}
                    style={{ width: '80px', fontSize: '13px', textAlign: 'center' }}
                  />
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
                    {selectedBooking.status === WALKING_STATUS.CONFIRMED && selectedBooking.walkerArrivalStatus === 'on_the_way' && (
                      <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                        🚗 Walker On The Way
                      </span>
                    )}
                    {selectedBooking.status === WALKING_STATUS.CONFIRMED && selectedBooking.walkerArrivalStatus === 'arrived' && (
                      <span className="badge" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                        📍 At Doorstep
                      </span>
                    )}
                    {selectedBooking.hasEmergency && (
                      <span className="badge" style={{ background: '#fee2e2', color: '#dc2626', border: '1.5px solid #ef4444', fontWeight: 900 }}>
                        🚨 EMERGENCY SOS ACTIVE
                      </span>
                    )}
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
              
              {/* 🚨 High-Priority Emergency Notice Banner in Admin Details */}
              {selectedBooking.hasEmergency && (
                <div style={{
                  background: '#fee2e2',
                  border: '2px solid #ef4444',
                  borderRadius: '16px',
                  padding: '16px',
                  boxShadow: '0 8px 24px rgba(239, 68, 68, 0.25)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '24px' }}>🚨</span>
                      <div>
                        <strong style={{ fontSize: '15px', color: '#dc2626', display: 'block' }}>
                          WALKER SOS EMERGENCY ACTIVE
                        </strong>
                        <span style={{ fontSize: '12px', color: '#991b1b' }}>
                          Reported by: <strong>{selectedBooking.assignedTeamMemberName || 'Walker'}</strong> ({selectedBooking.assignedTeamMemberPhone || '-'})
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {selectedBooking.emergencyWalkerLocation?.lat && (
                        <a
                          href={`https://maps.google.com/?q=${selectedBooking.emergencyWalkerLocation.lat},${selectedBooking.emergencyWalkerLocation.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{ fontSize: '12px', fontWeight: 800, padding: '7px 12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <MapPin size={13} /> Walker GPS Pin ↗
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => handleAdminResolveEmergency(selectedBooking)}
                        disabled={updatingId === selectedBooking.id}
                        className="btn"
                        style={{ background: '#16a34a', color: '#fff', fontSize: '12px', fontWeight: 800, padding: '7px 14px', borderRadius: '8px' }}
                      >
                        {updatingId === selectedBooking.id ? 'Resolving...' : '✅ Mark Resolved'}
                      </button>
                    </div>
                  </div>

                  <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: '10px', padding: '10px 12px', fontSize: '12.5px', color: '#7f1d1d' }}>
                    <div><strong>Emergency Issue:</strong> {selectedBooking.emergencyReason || 'Urgent incident occurred'}</div>
                    {selectedBooking.emergencyNote && (
                      <div style={{ fontStyle: 'italic', marginTop: '4px' }}>
                        "{selectedBooking.emergencyNote}"
                      </div>
                    )}
                  </div>
                </div>
              )}

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

              {/* SECTION: Walker Assignment & WhatsApp Dispatch */}
              <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: '14px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Footprints size={15} color="var(--accent)" /> Walker Assignment & Live GPS Dispatch
                  </div>
                  {selectedBooking.assignedTeamMemberName ? (
                    <span className="badge badge-online">
                      Walker: {selectedBooking.assignedTeamMemberName}
                    </span>
                  ) : (
                    <span className="badge badge-pending">
                      Walker Unassigned
                    </span>
                  )}
                </div>

                {selectedBooking.walkerArrivalStatus && selectedBooking.walkerArrivalStatus !== 'idle' && (
                  <div style={{
                    marginBottom: '10px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: selectedBooking.walkerArrivalStatus === 'arrived' ? '#f0fdf4' : '#eff6ff',
                    border: `1px solid ${selectedBooking.walkerArrivalStatus === 'arrived' ? '#bbf7d0' : '#bfdbfe'}`,
                    color: selectedBooking.walkerArrivalStatus === 'arrived' ? '#166534' : '#1e40af',
                  }}>
                    <span style={{ fontSize: '16px' }}>{selectedBooking.walkerArrivalStatus === 'arrived' ? '🔔' : '🚗'}</span>
                    <div>
                      <strong>Walker Status: {selectedBooking.walkerArrivalStatus === 'arrived' ? 'Arrived at Doorstep' : 'On The Way to Location'}</strong>
                      <div style={{ fontSize: '11px', opacity: 0.85 }}>
                        {selectedBooking.walkerArrivalStatus === 'arrived'
                          ? `Walker reached customer's doorstep`
                          : `Walker marked heading towards pickup`}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <select
                    className="input"
                    value={selectedBooking.assignedTeamMemberId || selectedBooking.assignedWalkerId || ''}
                    onChange={e => handleAssignWalker(selectedBooking, e.target.value)}
                    disabled={assigningId === selectedBooking.id}
                    style={{ flex: 1, minWidth: '180px', fontSize: '13px', padding: '9px 12px' }}
                    aria-label="Assign walker"
                  >
                    {walkerOptions.length === 0 ? (
                      <option value="">-- No Walkers in Team (Add role 'Walker' in Team section) --</option>
                    ) : (
                      <option value="">-- Select Assigned Walker ({walkerOptions.length} available) --</option>
                    )}
                    {walkerOptions.map(w => (
                      <option key={w.id} value={w.id}>
                        🐾 {w.name} {w.role ? `(${w.role})` : ''} {w.phone ? `· ${w.phone}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedBooking.assignedTeamMemberName && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => handleSendWalkToWalkerWhatsApp(selectedBooking)}
                      className="btn btn-primary"
                      style={{ background: '#25D366', borderColor: '#20BA5C', color: '#fff', fontSize: '12px', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <MessageCircle size={15} /> Send Walk Details to Walker (WhatsApp)
                    </button>
                    {selectedBooking.assignedTeamMemberPhone && (
                      <a
                        href={`tel:${selectedBooking.assignedTeamMemberPhone}`}
                        className="btn btn-secondary"
                        style={{ fontSize: '12px', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                      >
                        <Phone size={13} /> Call Walker
                      </a>
                    )}
                  </div>
                )}

                {(selectedBooking.status === WALKING_STATUS.IN_PROGRESS || (Array.isArray(selectedBooking.routeTrail) && selectedBooking.routeTrail.length > 0)) && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border)' }}>
                    <button
                      type="button"
                      onClick={() => setLiveTrackingBooking(selectedBooking)}
                      className="btn btn-primary"
                      style={{
                        width: '100%',
                        background: selectedBooking.status === WALKING_STATUS.IN_PROGRESS ? '#16a34a' : 'var(--accent)',
                        borderColor: selectedBooking.status === WALKING_STATUS.IN_PROGRESS ? '#15803d' : 'var(--accent-border)',
                        color: '#fff',
                        fontSize: '12.5px',
                        padding: '9px 14px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontWeight: 800,
                      }}
                    >
                      <Footprints size={15} />
                      {selectedBooking.status === WALKING_STATUS.IN_PROGRESS ? 'Watch Live GPS Walk' : 'View Recorded Walk Route Map'}
                    </button>
                  </div>
                )}

                {/* 🐾 Walk Report Card in Admin Panel */}
                {(selectedBooking.walkReport || selectedBooking.walkActivities) && (
                  <div style={{ marginTop: '12px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: '14px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        🐾 Walk Report Card
                      </span>
                      {selectedBooking.phone && (
                        <a
                          href={`https://wa.me/${(selectedBooking.whatsappNumber || selectedBooking.phone).replace(/\D/g, '')}?text=${generateWhatsAppReportMessage(selectedBooking)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#25D366',
                            color: '#fff',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 800,
                            textDecoration: 'none',
                          }}
                        >
                          <MessageCircle size={13} /> Send Report on WhatsApp
                        </a>
                      )}
                    </div>

                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', textAlign: 'center', marginBottom: '10px' }}>
                      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '6px 2px' }}>
                        <span style={{ fontSize: '14px', display: 'block' }}>💧</span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E40AF' }}>
                          {(selectedBooking.walkReport?.peeCount ?? selectedBooking.walkActivities?.pee) || 0} Pee
                        </span>
                      </div>
                      <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '10px', padding: '6px 2px' }}>
                        <span style={{ fontSize: '14px', display: 'block' }}>💩</span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#92400E' }}>
                          {(selectedBooking.walkReport?.pooCount ?? selectedBooking.walkActivities?.poo) || 0} Poo
                        </span>
                      </div>
                      <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '10px', padding: '6px 2px' }}>
                        <span style={{ fontSize: '14px', display: 'block' }}>🥤</span>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#065F46' }}>
                          {selectedBooking.walkReport?.waterGiven || selectedBooking.walkActivities?.water ? 'Hydrated' : 'No'}
                        </span>
                      </div>
                      <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px', padding: '6px 2px' }}>
                        <span style={{ fontSize: '14px', display: 'block' }}>🦴</span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#78350F' }}>
                          {(selectedBooking.walkReport?.treatCount ?? selectedBooking.walkActivities?.treats) || 0} Treats
                        </span>
                      </div>
                    </div>

                    {/* Distance, Duration, Pace & Calories */}
                    {(selectedBooking.walkDistanceMeters || selectedBooking.walkDurationSeconds || selectedBooking.walkReport?.distanceMeters) && (() => {
                      const dist = selectedBooking.walkReport?.distanceMeters || selectedBooking.walkDistanceMeters || 0
                      const dur = selectedBooking.walkReport?.durationSeconds || selectedBooking.walkDurationSeconds || 0
                      const pace = selectedBooking.walkPace || calculatePace(dist, dur).formatted
                      const cal = selectedBooking.estimatedCalories || calculateCalories(dist, dur)

                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
                          <div style={{ background: 'var(--card)', borderRadius: '10px', padding: '8px 4px', textAlign: 'center', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block' }}>Distance</span>
                            <strong style={{ fontSize: '12px', color: '#16a34a' }}>
                              {formatDistance(dist)}
                            </strong>
                          </div>
                          <div style={{ background: 'var(--card)', borderRadius: '10px', padding: '8px 4px', textAlign: 'center', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block' }}>Duration</span>
                            <strong style={{ fontSize: '12px', color: 'var(--text)' }}>
                              {formatDurationHuman(dur)}
                            </strong>
                          </div>
                          <div style={{ background: 'var(--card)', borderRadius: '10px', padding: '8px 4px', textAlign: 'center', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block' }}>Avg Pace</span>
                            <strong style={{ fontSize: '12px', color: '#0284c7' }}>
                              {pace}
                            </strong>
                          </div>
                          <div style={{ background: 'var(--card)', borderRadius: '10px', padding: '8px 4px', textAlign: 'center', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'block' }}>Calories</span>
                            <strong style={{ fontSize: '12px', color: '#ea580c' }}>
                              ~{cal} kcal
                            </strong>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Walker Notes */}
                    {(selectedBooking.walkReport?.notes || selectedBooking.walkerNotes) && (
                      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '2px' }}>Walker's Note:</span>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text)', fontStyle: 'italic', lineHeight: 1.4 }}>
                          "{selectedBooking.walkReport?.notes || selectedBooking.walkerNotes}"
                        </p>
                      </div>
                    )}

                    {/* Walk Photos */}
                    {(selectedBooking.walkReport?.photos?.length > 0 || (Array.isArray(selectedBooking.walkPhotos) && selectedBooking.walkPhotos.length > 0)) && (
                      <div>
                        <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Photos from Walk:</span>
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                          {(selectedBooking.walkReport?.photos || selectedBooking.walkPhotos || []).map((pUrl, idx) => (
                            <a key={idx} href={pUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '64px', height: '64px', borderRadius: '10px', overflow: 'hidden', border: '1.5px solid var(--border)', flexShrink: 0 }}>
                              <img src={pUrl} alt="Walk memory" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 🌟 Pet Parent Review & Rating */}
                {selectedBooking.walkerRating && (
                  <div style={{ marginTop: '12px', background: '#FFFDF5', border: '1.5px solid #FDE68A', borderRadius: '14px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        ⭐ Parent Review & Rating
                      </span>
                      <span style={{ fontSize: '11px', color: '#B45309', fontWeight: 700 }}>
                        {selectedBooking.ownerName || 'Pet Parent'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          size={18}
                          fill={star <= selectedBooking.walkerRating ? '#F59E0B' : 'none'}
                          color={star <= selectedBooking.walkerRating ? '#F59E0B' : '#D1D5DB'}
                        />
                      ))}
                      <strong style={{ marginLeft: '6px', fontSize: '13px', color: '#B45309' }}>
                        {selectedBooking.walkerRating} / 5 Stars
                      </strong>
                    </div>

                    {Array.isArray(selectedBooking.walkerCompliments) && selectedBooking.walkerCompliments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                        {selectedBooking.walkerCompliments.map((comp, i) => (
                          <span key={i} style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', padding: '2px 8px', fontSize: '11px', fontWeight: 700, color: '#92400E' }}>
                            {comp}
                          </span>
                        ))}
                      </div>
                    )}

                    {selectedBooking.walkerFeedback && (
                      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text)', fontStyle: 'italic', background: '#fff', border: '1px solid #FDE68A', borderRadius: '10px', padding: '8px 10px', lineHeight: 1.4 }}>
                        "{selectedBooking.walkerFeedback}"
                      </p>
                    )}
                  </div>
                )}
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
                      onClick={() => openConfirmModal(selectedBooking)}
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
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)', background: 'var(--surface)', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <Footprints size={14} color="var(--accent)" />
                    <span>Awaiting Walker to start live GPS walk in <a href="/walker" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 800, textDecoration: 'underline' }}>Walker Portal ↗</a></span>
                  </div>
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
          MODAL: CONFIRM WALK & ASSIGN WALKER
         ========================================================================= */}
      {confirmTarget && (
        <div className="walking-modal-overlay" onClick={() => setConfirmTarget(null)}>
          <div className="walking-modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            {/* Header */}
            <div className="walking-modal-header" style={{ background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.1) 0%, rgba(21, 128, 61, 0.05) 100%)', borderBottom: '1px solid rgba(22, 163, 74, 0.2)' }}>
              <div className="walking-modal-header-left">
                <div className="walking-modal-icon-badge" style={{ background: '#16a34a', color: '#fff' }}>
                  <CheckCircle size={22} />
                </div>
                <div>
                  <h3 className="walking-modal-title" style={{ color: '#15803d' }}>Confirm Walk & Assign Walker</h3>
                  <p className="walking-modal-subtitle">
                    Request for <strong>{confirmTarget.dogName}</strong>{confirmTarget.breed ? ` • ${confirmTarget.breed}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="walking-modal-close-btn"
                onClick={() => setConfirmTarget(null)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="walking-modal-body">
              {/* Summary Box */}
              <div className="walking-cancel-summary-box" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="cancel-summary-top">
                  <div className="cancel-dog-info">
                    <Dog size={16} color="var(--accent)" />
                    <strong>{confirmTarget.dogName}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>({confirmTarget.duration || 30} Mins)</span>
                  </div>
                  <div className="cancel-schedule-info">
                    <Calendar size={13} />
                    <span>{formatFriendlyDate(confirmTarget.date)}</span>
                    <span className="dot">•</span>
                    <Clock size={13} />
                    <span>{confirmTarget.slot || confirmTarget.customTimeRequested}</span>
                  </div>
                </div>

                <div style={{ marginTop: '8px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <MapPin size={13} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                      <strong>Pickup:</strong> {confirmTarget.area || 'Dhayari'} {confirmTarget.pickupAddress ? `(${confirmTarget.pickupAddress})` : ''}
                    </span>
                  </div>
                  {(confirmTarget.userName || confirmTarget.ownerName || confirmTarget.phone || confirmTarget.userPhone) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <User size={13} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                        <strong>Parent:</strong> {confirmTarget.userName || confirmTarget.ownerName || 'Pet Parent'} {confirmTarget.phone || confirmTarget.userPhone ? `· ${confirmTarget.phone || confirmTarget.userPhone}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Walker Selection */}
              <div className="walking-form-group" style={{ marginTop: '16px' }}>
                <label className="walking-form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: '13px' }}>Assign Walker *</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Role: Walker</span>
                </label>

                {walkerOptions.length === 0 ? (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 12px', fontSize: '12px', color: '#92400e' }}>
                    ⚠️ No team members with role <strong>"Walker"</strong> found in Team.
                    <div style={{ marginTop: '4px', fontSize: '11.5px' }}>
                      You can confirm now and assign later, or add/update a member with role "Walker" in Team section.
                    </div>
                  </div>
                ) : (
                  <select
                    className="input"
                    value={confirmWalkerId}
                    onChange={e => setConfirmWalkerId(e.target.value)}
                    style={{ width: '100%', fontSize: '13.5px', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid var(--accent)', background: 'var(--card)' }}
                  >
                    <option value="">-- Choose Walker to assign --</option>
                    {walkerOptions.map(w => (
                      <option key={w.id} value={w.id}>
                        🐾 {w.name} {w.phone ? `(${w.phone})` : ''}
                      </option>
                    ))}
                  </select>
                )}

                <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: 'var(--muted)' }}>
                  The assigned walker will receive this walk in their <strong>Walker Portal</strong> schedule and can start live GPS tracking.
                </p>
              </div>

              {/* WhatsApp Checkbox */}
              {confirmWalkerId && (
                <div style={{ marginTop: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', color: '#166534', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={confirmSendWhatsApp}
                      onChange={e => setConfirmSendWhatsApp(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: '#16a34a' }}
                    />
                    <span>Send walk details to Walker on WhatsApp</span>
                  </label>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="walking-modal-footer">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="btn btn-secondary walking-modal-btn"
                disabled={updatingId === confirmTarget.id}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmAndAssign}
                className="btn btn-primary walking-modal-btn"
                disabled={updatingId === confirmTarget.id}
                style={{ background: '#16a34a', borderColor: '#15803d' }}
              >
                {updatingId === confirmTarget.id ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    <span>Confirming...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={15} />
                    <span>{confirmWalkerId ? 'Confirm & Assign' : 'Confirm Walk'}</span>
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

      {/* Live Dog Walk GPS Tracker Modal */}
      {liveTrackingBooking && (
        <LiveWalkModal
          bookingId={liveTrackingBooking.id}
          initialBooking={liveTrackingBooking}
          onClose={() => setLiveTrackingBooking(null)}
        />
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

        .walking-booking-card {
          padding: 20px 24px;
          border-radius: 16px;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
        }
        .walking-booking-card:hover {
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08) !important;
          border-color: rgba(192, 136, 32, 0.4) !important;
          transform: translateY(-1px);
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
