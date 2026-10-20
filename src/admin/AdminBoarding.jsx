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
  ArrowRight,
  ArrowUpDown,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Droplets,
  Edit3,
  Eye,
  FileText,
  Footprints,
  Heart,
  IndianRupee,
  LogIn,
  LogOut,
  Mail,
  MessageCircle,
  Moon,
  PawPrint,
  Phone,
  Plus,
  PlusSquare,
  Receipt,
  RefreshCw,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Syringe,
  Tag,
  Trash2,
  User,
  Users,
  Utensils,
  Wallet,
  X,
  Bed,
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
  calculateBoardingStay,
  DEFAULT_BOARDING_TERMS,
  DEFAULT_BOARDING_TERMS_CLOSING,
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

function formatBoardingDate(dateStr) {
  if (!dateStr) return 'N/A'
  try {
    const parts = String(dateStr).split('-')
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      }
    }
    const d = new Date(dateStr)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    }
  } catch { }
  return dateStr
}

function formatPetAge(dob) {
  if (!dob) return ''
  try {
    const birth = new Date(dob)
    if (!Number.isNaN(birth.getTime())) {
      const now = new Date()
      let years = now.getFullYear() - birth.getFullYear()
      let months = now.getMonth() - birth.getMonth()
      if (months < 0) {
        years--
        months += 12
      }
      if (years > 0) return `${years} Year${years > 1 ? 's' : ''}`
      if (months > 0) return `${months} Month${months > 1 ? 's' : ''}`
      return 'Puppy / Kitten'
    }
  } catch { }
  return dob
}

export default function AdminBoarding() {
  const { user } = useAuth()
  const { sendNotification } = useNotifications()

  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(null)

  // Filters & Search state
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [dateRangeF, setDateRangeF] = useState('all')
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [petTypeF, setPetTypeF] = useState('all')
  const [customerF, setCustomerF] = useState('')
  const [amountRangeF, setAmountRangeF] = useState('all')
  const [sortBy, setSortBy] = useState('latest')
  const [showFilterDrawer, setShowFilterDrawer] = useState(false)

  // Modals state
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState(null)

  // Check-In Advance Payment & Special Food Modal state
  const [checkInModal, setCheckInModal] = useState(null)
  const [hasAdvancePayment, setHasAdvancePayment] = useState(null) // null | 'yes' | 'no'
  const [advanceAmountInput, setAdvanceAmountInput] = useState('')
  const [checkInFoodChargeInput, setCheckInFoodChargeInput] = useState('')
  const [checkInFoodTiming, setCheckInFoodTiming] = useState('check_in') // 'check_in' | 'checkout'

  // Checkout modal
  const [checkoutModal, setCheckoutModal] = useState(null)
  const [checkoutAmount, setCheckoutAmount] = useState('')
  const [checkoutFoodChargeInput, setCheckoutFoodChargeInput] = useState('')

  // Cancel modal
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')

  // Settings modal
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [savedSettings, setSavedSettings] = useState(null)
  const [settingsDraft, setSettingsDraft] = useState(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [termsViewMode, setTermsViewMode] = useState('items') // 'items' | 'text'

  // UI state
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState('')
  const [shopName, setShopName] = useState('Paw Paw Pet Grooming')

  // Prevent background scrolling while any modal/drawer is open
  useEffect(() => {
    const isAnyModalOpen = Boolean(
      selectedBooking ||
      showFilterDrawer ||
      checkInModal ||
      checkoutModal ||
      cancelTarget ||
      showSettingsModal
    )
    if (isAnyModalOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [selectedBooking, showFilterDrawer, checkInModal, checkoutModal, cancelTarget, showSettingsModal])

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
      setShopName(biz.contact?.shopName || 'Paw Paw Pet Grooming')
    })
    fetchBoardingSettings(db).then(s => setSavedSettings(s))
  }, [])

  useEffect(() => {
    if (!toastMessage) return
    const t = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [toastMessage])

  const patchLocal = (id, patch) => {
    setBookings(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
    setSelectedBooking(prev => prev?.id === id ? { ...prev, ...patch } : prev)
  }

  const hasActiveFilters = useMemo(() => {
    return (
      statusF !== 'all' ||
      dateRangeF !== 'all' ||
      petTypeF !== 'all' ||
      customerF.trim() !== '' ||
      amountRangeF !== 'all' ||
      sortBy !== 'latest'
    )
  }, [statusF, dateRangeF, petTypeF, customerF, amountRangeF, sortBy])

  const clearAllFilters = () => {
    setStatusF('all')
    setDateRangeF('all')
    setCustomDateFrom('')
    setCustomDateTo('')
    setPetTypeF('all')
    setCustomerF('')
    setAmountRangeF('all')
    setSortBy('latest')
    setSearch('')
  }

  const filtered = useMemo(() => {
    let r = [...bookings]

    // Status filter
    if (statusF !== 'all') {
      r = r.filter(b => String(b.status || '').toLowerCase() === statusF.toLowerCase())
    }

    // Pet Type
    if (petTypeF !== 'all') {
      r = r.filter(b => String(b.petType || '').toLowerCase() === petTypeF.toLowerCase())
    }

    // Customer name / email / phone
    if (customerF.trim()) {
      const s = customerF.toLowerCase()
      r = r.filter(b =>
        b.ownerName?.toLowerCase().includes(s) ||
        b.userEmail?.toLowerCase().includes(s) ||
        b.phone?.includes(s)
      )
    }

    // Search query
    if (search.trim()) {
      const s = search.toLowerCase()
      r = r.filter(b =>
        b.ownerName?.toLowerCase().includes(s) ||
        b.petName?.toLowerCase().includes(s) ||
        b.petBreed?.toLowerCase().includes(s) ||
        b.phone?.includes(s) ||
        b.id?.toLowerCase().includes(s)
      )
    }

    // Date Range
    if (dateRangeF !== 'all') {
      const now = new Date()
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      if (dateRangeF === 'today') {
        r = r.filter(b => b.checkInDate === todayStr || (b.checkInDate <= todayStr && b.checkOutDate >= todayStr))
      } else if (dateRangeF === 'week') {
        const nextWeek = new Date(now.getTime() + 7 * 86400000)
        const nextWeekStr = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`
        r = r.filter(b => b.checkInDate >= todayStr && b.checkInDate <= nextWeekStr)
      } else if (dateRangeF === 'month') {
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        r = r.filter(b => b.checkInDate?.startsWith(currentMonth))
      } else if (dateRangeF === 'custom') {
        if (customDateFrom) r = r.filter(b => b.checkInDate >= customDateFrom)
        if (customDateTo) r = r.filter(b => b.checkInDate <= customDateTo)
      }
    }

    // Amount Range
    if (amountRangeF !== 'all') {
      r = r.filter(b => {
        const amt = Number(b.estimatedTotal || 0)
        if (amountRangeF === 'under_2000') return amt < 2000
        if (amountRangeF === '2000_5000') return amt >= 2000 && amt <= 5000
        if (amountRangeF === '5000_10000') return amt >= 5000 && amt <= 10000
        if (amountRangeF === 'above_10000') return amt > 10000
        return true
      })
    }

    // Sorting
    r.sort((a, b) => {
      if (sortBy === 'latest') {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (new Date(a.createdAt || 0).getTime() || 0)
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (new Date(b.createdAt || 0).getTime() || 0)
        return tB - tA
      }
      if (sortBy === 'oldest') {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (new Date(a.createdAt || 0).getTime() || 0)
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (new Date(b.createdAt || 0).getTime() || 0)
        return tA - tB
      }
      if (sortBy === 'checkin_asc') {
        return String(a.checkInDate || '').localeCompare(String(b.checkInDate || ''))
      }
      if (sortBy === 'checkin_desc') {
        return String(b.checkInDate || '').localeCompare(String(a.checkInDate || ''))
      }
      if (sortBy === 'amount_desc') {
        return (Number(b.estimatedTotal) || 0) - (Number(a.estimatedTotal) || 0)
      }
      if (sortBy === 'amount_asc') {
        return (Number(a.estimatedTotal) || 0) - (Number(b.estimatedTotal) || 0)
      }
      return 0
    })

    return r
  }, [bookings, statusF, petTypeF, customerF, search, dateRangeF, customDateFrom, customDateTo, amountRangeF, sortBy])

  const stats = useMemo(() => {
    const total = bookings.length
    const checkedIn = bookings.filter(b => b.status === BOARDING_STATUS.CHECKED_IN).length
    const upcoming = bookings.filter(b => b.status === BOARDING_STATUS.CONFIRMED).length
    const pending = bookings.filter(b => b.status === BOARDING_STATUS.PENDING).length
    const completed = bookings.filter(b => b.status === BOARDING_STATUS.CHECKED_OUT)
    const revenue = completed.reduce((sum, b) => sum + (Number(b.amountCollected || b.estimatedTotal) || 0), 0)

    return { total, checkedIn, upcoming, pending, revenue }
  }, [bookings])

  // Confirm / Approve
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

  // Open Check-In Dialog
  const openCheckInDialog = (b) => {
    setCheckInModal(b)
    setHasAdvancePayment(null)
    setAdvanceAmountInput('')
    setCheckInFoodChargeInput('')
    setCheckInFoodTiming('check_in')
  }

  // Confirm Check In (with advance payment & optional special food charge logic)
  const confirmCheckIn = async () => {
    if (!checkInModal) return
    setUpdating(checkInModal.id)
    try {
      const existingCollected = Number(checkInModal.amountCollected || 0)
      const advanceNow = hasAdvancePayment === 'yes' ? (Number(advanceAmountInput) || 0) : 0

      const isPawPawSpecialFood = Boolean(
        checkInModal.specialFoodRequired && checkInModal.specialFoodProvider === 'pawpaw'
      )
      const foodCharge = (isPawPawSpecialFood && Number(checkInFoodChargeInput) > 0)
        ? Math.round(Number(checkInFoodChargeInput))
        : 0
      const foodCollectedNow = (foodCharge > 0 && checkInFoodTiming === 'check_in') ? foodCharge : 0

      const newTotalCollected = existingCollected + advanceNow + foodCollectedNow
      const totalStayWithFood = Number(checkInModal.estimatedTotal || 0) + foodCharge

      const patch = {
        status: BOARDING_STATUS.CHECKED_IN,
        amountCollected: newTotalCollected,
        advanceAmount: (Number(checkInModal.advanceAmount || 0)) + advanceNow,
        updatedAt: serverTimestamp(),
        checkedInAt: serverTimestamp(),
      }

      if (foodCharge > 0) {
        patch.specialFoodCharge = foodCharge
        patch.specialFoodChargeRecordedAt = 'check_in'
        patch.specialFoodChargeCollectedAt = checkInFoodTiming
        patch.totalAmount = totalStayWithFood
      }

      await updateDoc(doc(db, 'boardingBookings', checkInModal.id), patch)
      patchLocal(checkInModal.id, { ...patch, updatedAt: new Date(), checkedInAt: new Date() })

      if (checkInModal.userId) {
        let msg = `${checkInModal.petName} is safely settled into their cozy suite.`
        if (advanceNow > 0 || foodCollectedNow > 0) {
          msg += ` Payment of ₹${money(advanceNow + foodCollectedNow)} recorded at check-in.`
        }
        await sendNotification(checkInModal.userId, {
          title: `${checkInModal.petName} has Checked In!`,
          message: msg,
          type: 'boarding_checked_in',
          bookingId: checkInModal.id,
          actionUrl: '/my-bookings',
        })
      }
      setToastType('success')
      let toast = `${checkInModal.petName} marked as checked in.`
      if (advanceNow > 0) toast += ` Advance: ₹${money(advanceNow)}.`
      if (foodCharge > 0) {
        toast += ` Special food charge: ₹${money(foodCharge)} (${checkInFoodTiming === 'check_in' ? 'Collected' : 'Due at checkout'}).`
      }
      setToastMessage(toast)
      setCheckInModal(null)
    } catch {
      setToastType('error')
      setToastMessage('Could not complete check-in.')
    }
    setUpdating(null)
  }

  // Check Out
  const openCheckOutModal = (b) => {
    setCheckoutModal(b)
    setCheckoutFoodChargeInput('')
    const previousCollected = Number(b.amountCollected || 0)
    const existingFoodCharge = Number(b.specialFoodCharge || 0)
    const totalStay = (Number(b.estimatedTotal || 0) + existingFoodCharge)
    const remaining = Math.max(0, totalStay - previousCollected)
    setCheckoutAmount(String(remaining))
  }

  const confirmCheckOut = async () => {
    if (!checkoutModal) return
    const additionalAmt = Number(checkoutAmount) || 0
    const previousCollected = Number(checkoutModal.amountCollected || 0)
    const finalTotalCollected = previousCollected + additionalAmt

    setUpdating(checkoutModal.id)
    try {
      const isPawPawSpecialFood = Boolean(
        checkoutModal.specialFoodRequired && checkoutModal.specialFoodProvider === 'pawpaw'
      )
      const alreadyRecordedFoodCharge = Number(checkoutModal.specialFoodCharge || 0)
      const hasRecordedAtCheckIn = Boolean(
        checkoutModal.specialFoodChargeRecordedAt === 'check_in' || alreadyRecordedFoodCharge > 0
      )

      const newlyAddedFoodCharge = (!hasRecordedAtCheckIn && isPawPawSpecialFood && Number(checkoutFoodChargeInput) > 0)
        ? Math.round(Number(checkoutFoodChargeInput))
        : 0

      const patch = {
        status: BOARDING_STATUS.CHECKED_OUT,
        amountCollected: finalTotalCollected,
        updatedAt: serverTimestamp(),
        checkedOutAt: serverTimestamp(),
      }

      if (newlyAddedFoodCharge > 0) {
        patch.specialFoodCharge = newlyAddedFoodCharge
        patch.specialFoodChargeRecordedAt = 'checkout'
        patch.specialFoodChargeCollectedAt = 'checkout'
        patch.totalAmount = Number(checkoutModal.estimatedTotal || 0) + newlyAddedFoodCharge
      } else if (hasRecordedAtCheckIn) {
        if (checkoutModal.specialFoodChargeCollectedAt === 'checkout' || !checkoutModal.specialFoodChargeCollectedAt) {
          patch.specialFoodChargeCollectedAt = 'checkout'
        }
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

  // Toggle bookings open/closed quickly from header pill (operates strictly on savedSettings)
  const toggleBookingsOpen = async () => {
    if (!savedSettings) return
    const nextVal = !(savedSettings.acceptBookings !== false)
    try {
      const updated = {
        ...savedSettings,
        acceptBookings: nextVal,
        updatedAt: serverTimestamp(),
      }
      await setDoc(doc(db, 'settings', 'boardingSettings'), updated, { merge: true })
      setSavedSettings(prev => ({ ...prev, acceptBookings: nextVal }))
      setToastType('success')
      setToastMessage(`Boarding bookings are now ${nextVal ? 'OPEN' : 'CLOSED'}.`)
    } catch {
      setToastType('error')
      setToastMessage('Could not update booking status.')
    }
  }

  // Open Settings Modal: loads fresh saved settings and initializes a local draft state
  const openSettingsModal = async () => {
    try {
      const current = await fetchBoardingSettings(db)
      setSavedSettings(current)
      setSettingsDraft({
        ...current,
        terms: Array.isArray(current.terms) && current.terms.length > 0 ? [...current.terms] : [...DEFAULT_BOARDING_TERMS],
        termsClosingMessage: current.termsClosingMessage || DEFAULT_BOARDING_TERMS_CLOSING,
      })
      setTermsViewMode('items')
      setShowSettingsModal(true)
    } catch {
      const fallback = savedSettings ? { ...savedSettings } : normalizeBoardingSettings({})
      setSettingsDraft({
        ...fallback,
        terms: Array.isArray(fallback.terms) && fallback.terms.length > 0 ? [...fallback.terms] : [...DEFAULT_BOARDING_TERMS],
        termsClosingMessage: fallback.termsClosingMessage || DEFAULT_BOARDING_TERMS_CLOSING,
      })
      setTermsViewMode('items')
      setShowSettingsModal(true)
    }
  }

  // Cancel / Close Settings Modal: discards uncommitted draft changes
  const closeSettingsModal = () => {
    setShowSettingsModal(false)
    setSettingsDraft(null)
  }

  // Helper functions for editing Pet Boarding Terms & Conditions in Settings Modal
  const handleAddTerm = () => {
    setSettingsDraft(p => ({
      ...p,
      terms: [...(p.terms || []), ''],
    }))
  }

  const handleUpdateTerm = (idx, val) => {
    setSettingsDraft(p => {
      const list = [...(p.terms || [])]
      list[idx] = val
      return { ...p, terms: list }
    })
  }

  const handleRemoveTerm = (idx) => {
    setSettingsDraft(p => {
      const list = (p.terms || []).filter((_, i) => i !== idx)
      return { ...p, terms: list }
    })
  }

  const handleMoveTerm = (idx, direction) => {
    setSettingsDraft(p => {
      const list = [...(p.terms || [])]
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= list.length) return p
      const temp = list[idx]
      list[idx] = list[targetIdx]
      list[targetIdx] = temp
      return { ...p, terms: list }
    })
  }

  const handleResetTermsToDefault = () => {
    setSettingsDraft(p => ({
      ...p,
      terms: [...DEFAULT_BOARDING_TERMS],
      termsClosingMessage: DEFAULT_BOARDING_TERMS_CLOSING,
    }))
  }

  const handleRawTextChange = (text) => {
    const lines = text.split('\n')
    setSettingsDraft(p => ({
      ...p,
      terms: lines,
    }))
  }

  // Save Settings Modal: validates all fields and explicitly persists all settings at once
  const saveBoardingSettings = async () => {
    if (!settingsDraft) return

    const dogRate = Number(settingsDraft.dogDailyRate)
    const catRate = Number(settingsDraft.catDailyRate)
    const maxDog = Number(settingsDraft.maxDogCapacity)
    const maxCat = Number(settingsDraft.maxCatCapacity)

    if (isNaN(dogRate) || dogRate <= 0) {
      setToastType('error')
      setToastMessage('Please enter a valid Dog Daily Rate (greater than 0).')
      return
    }
    if (isNaN(catRate) || catRate <= 0) {
      setToastType('error')
      setToastMessage('Please enter a valid Cat Daily Rate (greater than 0).')
      return
    }
    if (isNaN(maxDog) || maxDog <= 0) {
      setToastType('error')
      setToastMessage('Please enter a valid Max Dog Capacity (at least 1).')
      return
    }
    if (isNaN(maxCat) || maxCat <= 0) {
      setToastType('error')
      setToastMessage('Please enter a valid Max Cat Capacity (at least 1).')
      return
    }

    // Validate Terms & Conditions are not empty
    const cleanedTerms = (settingsDraft.terms || [])
      .map(t => String(t || '').trim())
      .filter(Boolean)

    if (cleanedTerms.length === 0) {
      setToastType('error')
      setToastMessage('Terms & Conditions cannot be empty. Please include at least one term.')
      return
    }

    setSavingSettings(true)
    try {
      const payload = {
        ...settingsDraft,
        dogDailyRate: Math.round(dogRate),
        catDailyRate: Math.round(catRate),
        maxDogCapacity: Math.round(maxDog),
        maxCatCapacity: Math.round(maxCat),
        acceptBookings: settingsDraft.acceptBookings !== false,
        showNewBadge: settingsDraft.showNewBadge !== false,
        terms: cleanedTerms,
        termsClosingMessage: String(settingsDraft.termsClosingMessage || '').trim(),
        updatedAt: serverTimestamp(),
      }

      await setDoc(doc(db, 'settings', 'boardingSettings'), payload, { merge: true })

      const normalized = normalizeBoardingSettings(payload)
      setSavedSettings(normalized)
      setToastType('success')
      setToastMessage('Boarding settings & terms updated successfully.')
      setShowSettingsModal(false)
      setSettingsDraft(null)
    } catch (err) {
      console.error('Failed to save boarding settings:', err)
      setToastType('error')
      setToastMessage('Failed to save boarding settings. Please try again.')
    } finally {
      setSavingSettings(false)
    }
  }

  // Single Edit workflow in details modal
  const openEditMode = (b) => {
    setEditForm({ ...b })
    setIsEditing(true)
  }

  const saveReservationEdit = async () => {
    if (!editForm || !selectedBooking) return
    setUpdating(selectedBooking.id)
    try {
      const stayCalc = calculateBoardingStay(
        editForm.checkInDate,
        editForm.checkInTime,
        editForm.checkOutDate,
        editForm.checkOutTime,
        editForm.petType,
        {
          dogDailyRate: editForm.dailyRate || 800,
          catDailyRate: editForm.dailyRate || 600,
          otherDailyRate: editForm.dailyRate || 500,
        }
      )

      const patch = {
        ...editForm,
        stayDays: stayCalc.days || editForm.stayDays || 1,
        stayNights: stayCalc.nights || editForm.stayNights || 0,
        dailyRate: Number(editForm.dailyRate) || stayCalc.dailyRate || 800,
        estimatedTotal: stayCalc.estimatedTotal || editForm.estimatedTotal || 0,
        updatedAt: serverTimestamp(),
      }
      delete patch.id

      await updateDoc(doc(db, 'boardingBookings', selectedBooking.id), patch)
      const updated = { ...selectedBooking, ...patch, updatedAt: new Date() }
      patchLocal(selectedBooking.id, updated)
      setSelectedBooking(updated)
      setIsEditing(false)
      setToastType('success')
      setToastMessage('Reservation snapshot updated successfully.')
    } catch (err) {
      setToastType('error')
      setToastMessage('Could not save reservation changes.')
    }
    setUpdating(null)
  }

  return (
    <div className="admin-page">
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1400 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}

      {/* Header */}
      <div className="boarding-admin-header">
        <div className="header-title-group">
          <div className="header-icon-badge">
            <Building2 size={26} />
          </div>
          <div>
            <h1 className="header-title">Pet Boarding Reservations</h1>
            <p className="header-subtitle">
              Manage overnight pet stays, check-ins, check-outs, and customer care instructions.
            </p>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            onClick={toggleBookingsOpen}
            className={`pill-status-btn ${(savedSettings?.acceptBookings !== false) ? 'open' : 'closed'}`}
            title="Click to toggle booking availability"
          >
            <span className="dot" />
            <span>{(savedSettings?.acceptBookings !== false) ? 'Bookings Open' : 'Bookings Closed'}</span>
          </button>

          <button onClick={openSettingsModal} className="btn btn-secondary action-btn">
            <Settings size={14} />
            <span>Rates & Settings</span>
          </button>

          <button onClick={fetchBoardings} className="btn btn-secondary action-btn">
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary Cards: 4 in 1 single row */}
      <div className="boarding-stats-grid">
        <div className="boarding-stat-card stays">
          <div className="stat-card-head">
            <div className="stat-icon-box">
              <Calendar size={14} className="stat-icon" />
            </div>
            <span className="stat-label">Total Stays</span>
          </div>
          <div className="stat-val">{stats.total}</div>
        </div>

        <div className="boarding-stat-card checked-in">
          <div className="stat-card-head">
            <div className="stat-icon-box">
              <LogIn size={14} className="stat-icon" />
            </div>
            <span className="stat-label">Checked In</span>
          </div>
          <div className="stat-val">{stats.checkedIn}</div>
        </div>

        <div className="boarding-stat-card pending">
          <div className="stat-card-head">
            <div className="stat-icon-box">
              <Clock size={14} className="stat-icon" />
            </div>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat-val">{stats.pending}</div>
        </div>

        <div className="boarding-stat-card revenue">
          <div className="stat-card-head">
            <div className="stat-icon-box">
              <IndianRupee size={14} className="stat-icon" />
            </div>
            <span className="stat-label">Revenue</span>
          </div>
          <div className="stat-val revenue-val">₹{money(stats.revenue)}</div>
        </div>
      </div>

      {/* Search & Filter Bar: Single row with Search, Filters, and Latest First */}
      <div className="boarding-filter-bar">
        <div className="boarding-search-wrap">
          <Search size={15} className="search-icon" />
          <input
            className="input search-input"
            placeholder="Search by customer, pet, phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="search-clear-btn" onClick={() => setSearch('')}>
              <X size={13} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`boarding-filter-btn ${hasActiveFilters ? 'active' : ''}`}
          onClick={() => setShowFilterDrawer(true)}
        >
          <SlidersHorizontal size={14} />
          <span>Filters</span>
          {hasActiveFilters && <span className="active-filter-dot" />}
        </button>
      </div>

      {/* Booking count row */}
      <div className="boarding-count-row">
        <span className="boarding-results-count">
          <strong>{filtered.length}</strong> {filtered.length === 1 ? 'Booking' : 'Bookings'}
        </span>
      </div>

      {/* Bookings List */}
      {loading ? (
        <Spinner text="Loading boarding reservations..." />
      ) : filtered.length === 0 ? (
        <div className="boarding-empty-state">
          <Building2 size={40} className="empty-icon" />
          <h3>No boarding requests found</h3>
          <p>
            {hasActiveFilters || search
              ? 'No reservations match your current filters. Try resetting filters.'
              : 'Reservations made by customers will appear here.'}
          </p>
          {(hasActiveFilters || search) && (
            <button type="button" className="btn btn-secondary" onClick={clearAllFilters} style={{ marginTop: '12px' }}>
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="boarding-cards-grid">
          {filtered.map(b => {
            const isPending = b.status === BOARDING_STATUS.PENDING
            const isConfirmed = b.status === BOARDING_STATUS.CONFIRMED
            const isCheckedIn = b.status === BOARDING_STATUS.CHECKED_IN
            const isCheckedOut = b.status === BOARDING_STATUS.CHECKED_OUT
            const isCancelled = b.status === BOARDING_STATUS.CANCELLED

            return (
              <div key={b.id} className="boarding-admin-card">
                <div className="boarding-card-top">
                  <div
                    className="boarding-card-pet-avatar"
                    onClick={() => { setSelectedBooking(b); setIsEditing(false) }}
                    style={{ cursor: 'pointer' }}
                  >
                    {b.petPhotoUrl ? (
                      <img
                        src={b.petPhotoUrl}
                        alt={b.petName}
                        onError={e => {
                          e.currentTarget.style.display = 'none'
                          if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex'
                        }}
                      />
                    ) : null}
                    <div className="avatar-fallback" style={{ display: b.petPhotoUrl ? 'none' : 'flex' }}>
                      <PawPrint size={22} />
                    </div>
                  </div>

                  <div
                    className="boarding-card-header-info"
                    onClick={() => { setSelectedBooking(b); setIsEditing(false) }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="boarding-card-title-row">
                      <strong className="boarding-card-pet-name">{b.petName}</strong>
                      <span className={`boarding-status-pill ${b.status || 'pending'}`}>
                        {statusLabel(b.status)}
                      </span>
                    </div>

                    <div className="boarding-card-breed">
                      {b.petType || 'Pet'} · {b.petBreed || 'Breed Not Specified'}
                    </div>

                    <div className="boarding-card-owner">
                      <span><User size={12} /> Owner: <strong>{b.ownerName}</strong></span>
                      {b.phone && <span><Phone size={12} /> {b.phone}</span>}
                    </div>
                  </div>

                  {/* Top-Right Edit Icon Button */}
                  <button
                    type="button"
                    className="boarding-card-edit-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedBooking(b)
                      openEditMode(b)
                    }}
                    aria-label={`Edit ${b.petName}'s reservation`}
                    title="Edit Reservation"
                  >
                    <Edit3 size={15} />
                  </button>
                </div>

                {/* Middle details strip: 2 columns, clean and uncrowded */}
                <div className="boarding-card-strip">
                  <div className="boarding-strip-item">
                    <div className="strip-icon-box">
                      <Calendar size={14} />
                    </div>
                    <div className="boarding-strip-text">
                      <span className="strip-label">Stay Schedule</span>
                      <strong className="strip-val">
                        {formatBoardingDate(b.checkInDate)} → {formatBoardingDate(b.checkOutDate)}
                      </strong>
                      <span className="strip-sub">{b.stayDays || 1} Day(s)</span>
                    </div>
                  </div>

                  <div className="boarding-strip-item">
                    <div className="strip-icon-box">
                      <IndianRupee size={14} />
                    </div>
                    <div className="boarding-strip-text">
                      <span className="strip-label">Total Amount</span>
                      <strong className="strip-val amount">
                        ₹{money(b.totalAmount || (Number(b.estimatedTotal || 0) + Number(b.specialFoodCharge || 0)))}
                      </strong>
                      {Number(b.specialFoodCharge || 0) > 0 && (
                        <span className="strip-sub" style={{ color: '#16a34a' }}>
                          inc. ₹{money(b.specialFoodCharge)} food
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Status-Specific Action Buttons */}
                <div className="boarding-card-actions">
                  {isPending && (
                    <>
                      <button
                        type="button"
                        className="card-action-btn confirm"
                        onClick={() => handleConfirm(b)}
                        disabled={updating === b.id}
                      >
                        <CheckCircle2 size={16} />
                        <span>{updating === b.id ? 'Confirming...' : 'Confirm Booking'}</span>
                      </button>
                      <button
                        type="button"
                        className="card-action-btn cancel"
                        onClick={() => setCancelTarget(b)}
                      >
                        <X size={16} />
                        <span>Cancel Request</span>
                      </button>
                    </>
                  )}

                  {isConfirmed && (
                    <>
                      <button
                        type="button"
                        className="card-action-btn checkin"
                        onClick={() => openCheckInDialog(b)}
                      >
                        <LogIn size={16} />
                        <span>Check In</span>
                      </button>
                      <button
                        type="button"
                        className="card-action-btn cancel"
                        onClick={() => setCancelTarget(b)}
                      >
                        <X size={16} />
                        <span>Cancel Request</span>
                      </button>
                    </>
                  )}

                  {isCheckedIn && (
                    <>
                      <button
                        type="button"
                        className="card-action-btn checkout"
                        onClick={() => openCheckOutModal(b)}
                      >
                        <LogOut size={16} />
                        <span>Check Out</span>
                      </button>
                      <button
                        type="button"
                        className="card-action-btn details"
                        onClick={() => { setSelectedBooking(b); setIsEditing(false) }}
                      >
                        <Eye size={15} />
                        <span>View Details</span>
                      </button>
                    </>
                  )}

                  {(isCheckedOut || isCancelled) && (
                    <>
                      <button
                        type="button"
                        className="card-action-btn details"
                        onClick={() => { setSelectedBooking(b); setIsEditing(false) }}
                      >
                        <Eye size={15} />
                        <span>View Details</span>
                      </button>
                      {adminWhatsappNumber && (
                        <a
                          href={`https://wa.me/${adminWhatsappNumber}?text=${buildBoardingWhatsAppMessage(b, shopName)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="card-action-btn whatsapp"
                        >
                          <MessageCircle size={15} />
                          <span>WhatsApp</span>
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ============================================================
          FILTERS & SORTING BOTTOM SHEET / MODAL
          ============================================================ */}
      {showFilterDrawer && (
        <div className="modal-overlay filter-drawer-overlay" onClick={() => setShowFilterDrawer(false)}>
          <div className="filters-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="bottom-sheet-handle" />

            <div className="bottom-sheet-head">
              <div className="head-title">
                <SlidersHorizontal size={18} color="var(--accent)" />
                <h3>Filters & Sorting</h3>
              </div>
              <button type="button" className="icon-btn" onClick={() => setShowFilterDrawer(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="bottom-sheet-body">
              {/* Status pills */}
              <div className="filter-group">
                <label className="filter-label">Booking Status</label>
                <div className="filter-pills-row">
                  {STATUS_OPTS.map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusF(st)}
                      className={`filter-pill-opt ${statusF === st ? 'active' : ''}`}
                    >
                      {statusLabel(st)}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2-col: Date range & Sort by */}
              <div className="filter-two-col">
                <div className="filter-group">
                  <label className="filter-label"><Calendar size={13} /> Date Range</label>
                  <select
                    className="input"
                    value={dateRangeF}
                    onChange={e => setDateRangeF(e.target.value)}
                  >
                    <option value="all">All Dates</option>
                    <option value="today">Today / Active Today</option>
                    <option value="week">Next 7 Days</option>
                    <option value="month">This Month</option>
                    <option value="custom">Custom Date Range</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label className="filter-label"><ArrowUpDown size={13} /> Sort By</label>
                  <select
                    className="input"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                  >
                    <option value="latest">Latest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="checkin_asc">Stay Date (Earliest)</option>
                    <option value="checkin_desc">Stay Date (Latest)</option>
                    <option value="amount_desc">Amount (High to Low)</option>
                    <option value="amount_asc">Amount (Low to High)</option>
                  </select>
                </div>
              </div>

              {dateRangeF === 'custom' && (
                <div className="filter-two-col" style={{ marginTop: '-6px' }}>
                  <div className="filter-group">
                    <label className="filter-label">From Date</label>
                    <input
                      type="date"
                      className="input"
                      value={customDateFrom}
                      onChange={e => setCustomDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="filter-group">
                    <label className="filter-label">To Date</label>
                    <input
                      type="date"
                      className="input"
                      value={customDateTo}
                      onChange={e => setCustomDateTo(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* 3-col: Pet type, Customer, Amount Range */}
              <div className="filter-three-col">
                <div className="filter-group">
                  <label className="filter-label"><PawPrint size={13} /> Pet Type</label>
                  <select
                    className="input"
                    value={petTypeF}
                    onChange={e => setPetTypeF(e.target.value)}
                  >
                    <option value="all">All (Dog & Cat)</option>
                    <option value="Dog">Dogs Only</option>
                    <option value="Cat">Cats Only</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label className="filter-label"><User size={13} /> Customer</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Search customer..."
                    value={customerF}
                    onChange={e => setCustomerF(e.target.value)}
                  />
                </div>

                <div className="filter-group">
                  <label className="filter-label"><IndianRupee size={13} /> Amount Range</label>
                  <select
                    className="input"
                    value={amountRangeF}
                    onChange={e => setAmountRangeF(e.target.value)}
                  >
                    <option value="all">All Amounts</option>
                    <option value="under_2000">Under ₹2,000</option>
                    <option value="2000_5000">₹2,000 – ₹5,000</option>
                    <option value="5000_10000">₹5,000 – ₹10,000</option>
                    <option value="above_10000">Above ₹10,000</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bottom-sheet-footer">
              <button type="button" className="btn btn-secondary" onClick={clearAllFilters}>
                <RefreshCw size={14} /> Clear All
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setShowFilterDrawer(false)}>
                <Check size={15} /> Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          BOARDING RESERVATION DETAILS MODAL (Matches Screenshot 1)
          ============================================================ */}
      {selectedBooking && (
        <div className="modal-overlay" onClick={() => { setSelectedBooking(null); setIsEditing(false) }}>
          <div className="boarding-details-modal" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="details-modal-header">
              {/* Row 1: Title on left, actions on right */}
              <div className="details-header-top-row">
                <h2 className="details-title">
                  {isEditing ? 'Edit Boarding Reservation' : 'Boarding Reservation'}
                </h2>

                <div className="header-actions-row">
                  {!isEditing && adminWhatsappNumber && (
                    <a
                      href={`https://wa.me/${adminWhatsappNumber}?text=${buildBoardingWhatsAppMessage(selectedBooking, shopName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="details-header-btn whatsapp"
                      aria-label="Send details to WhatsApp"
                    >
                      <MessageCircle size={14} /> <span>WhatsApp</span>
                    </a>
                  )}

                  {!isEditing ? (
                    <button
                      type="button"
                      className="details-header-btn edit"
                      onClick={() => openEditMode(selectedBooking)}
                      aria-label="Edit Reservation"
                    >
                      <Edit3 size={14} /> <span>Edit</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="details-header-btn cancel-edit"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </button>
                  )}

                  <button
                    type="button"
                    className="details-close-btn"
                    onClick={() => { setSelectedBooking(null); setIsEditing(false) }}
                    aria-label="Close modal"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Row 2: Status badge and Reservation ID on the same line */}
              <div className="details-header-sub-row">
                <span className={`boarding-status-pill ${selectedBooking.status || 'pending'}`}>
                  {selectedBooking.status === 'checked_out' && <CheckCircle2 size={13} />}
                  {selectedBooking.status === 'checked_in' && <LogIn size={13} />}
                  {selectedBooking.status === 'confirmed' && <Check size={13} />}
                  {selectedBooking.status === 'cancelled' && <X size={13} />}
                  <span>{statusLabel(selectedBooking.status)}</span>
                </span>
                <span className="details-ref-id">{shortId(selectedBooking.id)}</span>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="details-modal-body">
              {!isEditing ? (
                <>
                  {/* CARD A: Pet & Owner Details */}
                  <div className="boarding-section-card">
                    <div className="section-card-header">
                      <div className="section-icon-wrap paw">
                        <PawPrint size={16} />
                      </div>
                      <h3>Pet & Owner Details</h3>
                    </div>

                    <div className="pet-hero-row">
                      <div className="pet-avatar-large">
                        {selectedBooking.petPhotoUrl ? (
                          <img
                            src={selectedBooking.petPhotoUrl}
                            alt={selectedBooking.petName}
                            onError={e => {
                              e.currentTarget.style.display = 'none'
                              if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex'
                            }}
                          />
                        ) : null}
                        <div className="avatar-fallback" style={{ display: selectedBooking.petPhotoUrl ? 'none' : 'flex' }}>
                          <PawPrint size={24} />
                        </div>
                      </div>

                      <div className="pet-hero-info">
                        <strong className="pet-hero-name">{selectedBooking.petName || 'Pet'}</strong>
                        <div className="pet-hero-subtitle">
                          {selectedBooking.petType || 'Pet'} • {selectedBooking.petBreed || 'Breed Not Specified'}
                        </div>

                        <div className="pet-pills-row">
                          {selectedBooking.petGender && (
                            <span className="pet-pill">
                              <Users size={12} /> {selectedBooking.petGender}
                            </span>
                          )}
                          {selectedBooking.petDob && (
                            <span className="pet-pill">
                              <Calendar size={12} /> {formatPetAge(selectedBooking.petDob)}
                            </span>
                          )}
                          {selectedBooking.petWeight && (
                            <span className="pet-pill">
                              <Scale size={12} /> {selectedBooking.petWeight} kg
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="detail-two-col-grid">
                      <div className="detail-item">
                        <span className="detail-label"><User size={14} /> Owner Name</span>
                        <strong className="detail-val">{selectedBooking.ownerName || 'N/A'}</strong>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label"><ShieldCheck size={14} /> Emergency Contact</span>
                        <strong className="detail-val">
                          {selectedBooking.emergencyContactPhone
                            ? `${selectedBooking.emergencyContactName ? selectedBooking.emergencyContactName + ' ' : ''}(${selectedBooking.emergencyContactPhone})`
                            : 'None'}
                        </strong>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label"><Phone size={14} /> Phone Number</span>
                        <strong className="detail-val">{selectedBooking.phone || 'N/A'}</strong>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label"><Mail size={14} /> Email</span>
                        <strong className="detail-val email">{selectedBooking.userEmail || 'N/A'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* CARD B: Health & Vaccinations */}
                  <div className="boarding-section-card">
                    <div className="section-card-header">
                      <div className="section-icon-wrap shield">
                        <ShieldCheck size={16} />
                      </div>
                      <h3>Health & Vaccinations</h3>
                    </div>

                    <div className="detail-two-col-grid">
                      <div className="detail-item">
                        <span className="detail-label"><Syringe size={14} /> Vaccination Status</span>
                        <span className="badge-vaccine">
                          {selectedBooking.vaccinationStatus || 'Fully Vaccinated'}
                        </span>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label"><Calendar size={14} /> Last Vaccination / Notes</span>
                        <strong className="detail-val">{selectedBooking.vaccinationNotes || 'None'}</strong>
                      </div>
                    </div>

                    <div className="detail-item full" style={{ marginTop: '12px' }}>
                      <span className="detail-label"><PlusSquare size={14} /> Medical Conditions / Medicines</span>
                      <strong className="detail-val">
                        {selectedBooking.medicalConditions || selectedBooking.medicines || selectedBooking.allergies || 'No'}
                      </strong>
                    </div>
                  </div>

                  {/* CARD C: Stay & Billing Details */}
                  <div className="boarding-section-card">
                    <div className="section-card-header">
                      <div className="section-icon-wrap calendar">
                        <Calendar size={16} />
                      </div>
                      <h3>Stay & Billing Details</h3>
                    </div>

                    <div className="stay-banner-strip">
                      <div className="stay-banner-item">
                        <span className="stay-label"><Calendar size={13} /> Check-In</span>
                        <strong className="stay-val">{formatBoardingDate(selectedBooking.checkInDate)}</strong>
                        <span className="stay-sub">{selectedBooking.checkInTime || '10:00 AM'}</span>
                      </div>

                      <div className="stay-arrow">
                        <ArrowRight size={18} />
                      </div>

                      <div className="stay-banner-item">
                        <span className="stay-label"><Calendar size={13} /> Check-Out</span>
                        <strong className="stay-val">{formatBoardingDate(selectedBooking.checkOutDate)}</strong>
                        <span className="stay-sub">{selectedBooking.checkOutTime || '12:00 PM'}</span>
                      </div>

                      <div className="stay-banner-item total">
                        <span className="stay-label"><Moon size={13} /> Total Stay</span>
                        <strong className="stay-val duration">
                          {selectedBooking.stayDays || 1} Days
                        </strong>
                        <span className="stay-sub">({selectedBooking.stayNights || 0} Nights)</span>
                      </div>
                    </div>

                    <div className="billing-three-col-row">
                      <div className="billing-item">
                        <span className="billing-label"><Tag size={14} /> Daily Rate</span>
                        <strong className="billing-val">₹{money(selectedBooking.dailyRate || 800)}</strong>
                      </div>

                      <div className="billing-item">
                        <span className="billing-label"><Receipt size={14} /> Base Boarding Stay</span>
                        <strong className="billing-val estimated">₹{money(selectedBooking.estimatedTotal)}</strong>
                      </div>

                      {Number(selectedBooking.specialFoodCharge || 0) > 0 && (
                        <div className="billing-item">
                          <span className="billing-label"><Utensils size={14} /> Special Food Charge</span>
                          <strong className="billing-val" style={{ color: '#16a34a' }}>
                            +₹{money(selectedBooking.specialFoodCharge)}
                          </strong>
                          <span style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '2px' }}>
                            {selectedBooking.specialFoodChargeCollectedAt === 'check_in' ? 'Collected at Check-In' : 'Collected at Checkout'}
                          </span>
                        </div>
                      )}

                      {Number(selectedBooking.specialFoodCharge || 0) > 0 && (
                        <div className="billing-item">
                          <span className="billing-label"><Receipt size={14} /> Total Stay Amount</span>
                          <strong className="billing-val" style={{ color: 'var(--text)' }}>
                            ₹{money(selectedBooking.totalAmount || (Number(selectedBooking.estimatedTotal || 0) + Number(selectedBooking.specialFoodCharge || 0)))}
                          </strong>
                        </div>
                      )}

                      <div className="billing-item">
                        <span className="billing-label"><Wallet size={14} /> Amount Collected</span>
                        <strong className="billing-val collected">₹{money(selectedBooking.amountCollected || 0)}</strong>
                      </div>

                      <div className="billing-item">
                        <span className="billing-label"><Receipt size={14} /> Remaining Balance</span>
                        <strong className="billing-val" style={{ color: Math.max(0, (Number(selectedBooking.totalAmount || selectedBooking.estimatedTotal || 0) + (selectedBooking.totalAmount ? 0 : Number(selectedBooking.specialFoodCharge || 0))) - Number(selectedBooking.amountCollected || 0)) > 0 ? 'var(--accent)' : '#16a34a' }}>
                          ₹{money(Math.max(0, (Number(selectedBooking.totalAmount || selectedBooking.estimatedTotal || 0) + (selectedBooking.totalAmount ? 0 : Number(selectedBooking.specialFoodCharge || 0))) - Number(selectedBooking.amountCollected || 0)))}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* CARD D: Food & Care Instructions */}
                  <div className="boarding-section-card">
                    <div className="section-card-header">
                      <div className="section-icon-wrap food">
                        <Utensils size={16} />
                      </div>
                      <h3>Food & Care Instructions</h3>
                    </div>

                    <div className="detail-two-col-grid care">
                      <div className="detail-item">
                        <span className="detail-label"><Utensils size={14} /> Regular Food</span>
                        <strong className="detail-val" style={{ color: '#16a34a' }}>
                          ✓ Included (Provided by Paw Paw)
                        </strong>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label"><Utensils size={14} /> Special Food Required</span>
                        <strong className="detail-val">
                          {selectedBooking.specialFoodRequired
                            ? 'Yes'
                            : (selectedBooking.specialFoodRequired === false ? 'No (Regular food fine)' : (selectedBooking.foodType || 'No'))}
                        </strong>
                      </div>

                      {selectedBooking.specialFoodRequired && (
                        <div className="detail-item">
                          <span className="detail-label"><Users size={14} /> Special Food Provider</span>
                          <strong className="detail-val">
                            {selectedBooking.specialFoodProvider === 'pawpaw'
                              ? 'Paw Paw will provide it'
                              : selectedBooking.specialFoodProvider === 'customer'
                                ? 'Owner will provide (No extra charge)'
                                : (selectedBooking.foodProvider || 'Owner')}
                          </strong>
                        </div>
                      )}

                      {selectedBooking.specialFoodRequired && (
                        <div className="detail-item">
                          <span className="detail-label"><Receipt size={14} /> Special Food Charge</span>
                          <strong className="detail-val" style={{ color: Number(selectedBooking.specialFoodCharge || 0) > 0 ? '#16a34a' : 'var(--text)' }}>
                            {Number(selectedBooking.specialFoodCharge || 0) > 0
                              ? `₹${money(selectedBooking.specialFoodCharge)} (${selectedBooking.specialFoodChargeCollectedAt === 'check_in' ? 'Collected at Check-In' : selectedBooking.specialFoodChargeCollectedAt === 'checkout' ? 'Collected at Checkout' : 'Recorded'})`
                              : selectedBooking.specialFoodProvider === 'customer'
                                ? '₹0 (Owner provides food)'
                                : 'Not recorded / To be confirmed by hostel'}
                          </strong>
                        </div>
                      )}

                      <div className="detail-item">
                        <span className="detail-label"><Clock size={14} /> Feeding Schedule</span>
                        <strong className="detail-val">{selectedBooking.feedingSchedule || 'Twice a day'}</strong>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label"><AlertCircle size={14} /> Food Allergies / Dislikes</span>
                        <strong className="detail-val">
                          {selectedBooking.foodAllergies || selectedBooking.allergies || 'None'}
                        </strong>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label"><Droplets size={14} /> Diet / Water Notes</span>
                        <strong className="detail-val">
                          {selectedBooking.specialDietInstructions || selectedBooking.waterInstructions || selectedBooking.dietInstructions || 'None'}
                        </strong>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label"><PawPrint size={14} /> Walking Routine</span>
                        <strong className="detail-val">{selectedBooking.walkingFrequency || '2 walks per day (Standard)'}</strong>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label"><Bed size={14} /> Sleeping Habits</span>
                        <strong className="detail-val">{selectedBooking.sleepingHabits || 'None'}</strong>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label"><Footprints size={14} /> Toilet Habits</span>
                        <strong className="detail-val">{selectedBooking.toiletHabits || 'Outdoor breaks'}</strong>
                      </div>

                      <div className="detail-item">
                        <span className="detail-label"><Users size={14} /> Behaviour around pets</span>
                        <strong className="detail-val">{selectedBooking.behaviorNotes || 'Friendly'}</strong>
                      </div>

                      <div className="detail-item full">
                        <span className="detail-label"><FileText size={14} /> Special Requests</span>
                        <strong className="detail-val">{selectedBooking.additionalInstructions || 'None'}</strong>
                      </div>

                      <div className="detail-item full">
                        <span className="detail-label"><ShieldCheck size={14} /> Terms & Conditions</span>
                        <strong className="detail-val" style={{ color: selectedBooking.termsAccepted ? '#16a34a' : 'var(--text)' }}>
                          {selectedBooking.termsAccepted ? (
                            <>
                              ✓ Accepted & Agreed by Customer at Booking
                              {selectedBooking.termsSnapshot?.length ? ` (${selectedBooking.termsSnapshot.length} conditions snapshotted)` : ''}
                            </>
                          ) : (
                            'Standard Paw Paw Boarding Terms'
                          )}
                        </strong>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* EDIT FORM (Controlled by the single Edit button) */
                <div className="boarding-edit-form">
                  <div className="boarding-section-card">
                    <h4 className="edit-sec-title">Pet Details</h4>
                    <div className="filter-two-col">
                      <div>
                        <label className="edit-input-label">Pet Name</label>
                        <input
                          className="input"
                          value={editForm.petName || ''}
                          onChange={e => setEditForm(p => ({ ...p, petName: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="edit-input-label">Pet Type</label>
                        <select
                          className="input"
                          value={editForm.petType || 'Dog'}
                          onChange={e => setEditForm(p => ({ ...p, petType: e.target.value }))}
                        >
                          <option value="Dog">Dog</option>
                          <option value="Cat">Cat</option>
                        </select>
                      </div>
                      <div>
                        <label className="edit-input-label">Breed</label>
                        <input
                          className="input"
                          value={editForm.petBreed || ''}
                          onChange={e => setEditForm(p => ({ ...p, petBreed: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="edit-input-label">Weight (kg)</label>
                        <input
                          className="input"
                          value={editForm.petWeight || ''}
                          onChange={e => setEditForm(p => ({ ...p, petWeight: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="boarding-section-card">
                    <h4 className="edit-sec-title">Owner & Emergency Contact</h4>
                    <div className="filter-two-col">
                      <div>
                        <label className="edit-input-label">Owner Name</label>
                        <input
                          className="input"
                          value={editForm.ownerName || ''}
                          onChange={e => setEditForm(p => ({ ...p, ownerName: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="edit-input-label">Phone Number</label>
                        <input
                          className="input"
                          value={editForm.phone || ''}
                          onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="edit-input-label">Email</label>
                        <input
                          className="input"
                          value={editForm.userEmail || ''}
                          onChange={e => setEditForm(p => ({ ...p, userEmail: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="edit-input-label">Emergency Phone</label>
                        <input
                          className="input"
                          value={editForm.emergencyContactPhone || ''}
                          onChange={e => setEditForm(p => ({ ...p, emergencyContactPhone: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="boarding-section-card">
                    <h4 className="edit-sec-title">Stay Dates & Daily Rate</h4>
                    <div className="filter-two-col">
                      <div>
                        <label className="edit-input-label">Check-In Date</label>
                        <input
                          type="date"
                          className="input"
                          value={editForm.checkInDate || ''}
                          onChange={e => setEditForm(p => ({ ...p, checkInDate: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="edit-input-label">Check-Out Date</label>
                        <input
                          type="date"
                          className="input"
                          value={editForm.checkOutDate || ''}
                          onChange={e => setEditForm(p => ({ ...p, checkOutDate: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="edit-input-label">Check-In Time</label>
                        <input
                          className="input"
                          value={editForm.checkInTime || '10:00 AM'}
                          onChange={e => setEditForm(p => ({ ...p, checkInTime: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="edit-input-label">Check-Out Time</label>
                        <input
                          className="input"
                          value={editForm.checkOutTime || '12:00 PM'}
                          onChange={e => setEditForm(p => ({ ...p, checkOutTime: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="edit-input-label">Daily Rate (₹)</label>
                        <input
                          type="number"
                          className="input"
                          value={editForm.dailyRate || 800}
                          onChange={e => setEditForm(p => ({ ...p, dailyRate: Number(e.target.value) }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="boarding-section-card">
                    <h4 className="edit-sec-title">Health & Instructions</h4>
                    <div style={{ display: 'grid', gap: '10px' }}>
                      <div>
                        <label className="edit-input-label">Vaccination Status</label>
                        <input
                          className="input"
                          value={editForm.vaccinationStatus || ''}
                          onChange={e => setEditForm(p => ({ ...p, vaccinationStatus: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="edit-input-label">Vaccine / Medical Notes</label>
                        <input
                          className="input"
                          value={editForm.vaccinationNotes || ''}
                          onChange={e => setEditForm(p => ({ ...p, vaccinationNotes: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="edit-input-label">Special Requests / Care Notes</label>
                        <textarea
                          className="input"
                          rows={2}
                          value={editForm.additionalInstructions || ''}
                          onChange={e => setEditForm(p => ({ ...p, additionalInstructions: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer (Only shown when editing) */}
            {isEditing && (
              <div className="details-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={updating === selectedBooking.id}
                  onClick={saveReservationEdit}
                >
                  {updating === selectedBooking.id ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          CHECK-IN MODAL: ADVANCE PAYMENT & SPECIAL FOOD WORKFLOW
          ============================================================ */}
      {checkInModal && (() => {
        const estTotal = Number(checkInModal.estimatedTotal || 0)
        const prevCollected = Number(checkInModal.amountCollected || 0)
        const advanceNow = hasAdvancePayment === 'yes' ? (Number(advanceAmountInput) || 0) : 0
        const isPawPawSpecialFood = Boolean(
          checkInModal.specialFoodRequired && checkInModal.specialFoodProvider === 'pawpaw'
        )
        const isCustomerSpecialFood = Boolean(
          checkInModal.specialFoodRequired && checkInModal.specialFoodProvider === 'customer'
        )
        const foodCharge = (isPawPawSpecialFood && Number(checkInFoodChargeInput) > 0)
          ? Math.round(Number(checkInFoodChargeInput))
          : 0
        const foodCollectedNow = (foodCharge > 0 && checkInFoodTiming === 'check_in') ? foodCharge : 0
        const totalStayWithFood = estTotal + foodCharge
        const totalCollectingNow = advanceNow + foodCollectedNow
        const newTotalCollected = prevCollected + totalCollectingNow
        const remainingBalance = Math.max(0, totalStayWithFood - newTotalCollected)

        return (
          <div className="modal-overlay" onClick={() => setCheckInModal(null)}>
            <div className="reschedule-modal-card" style={{ maxWidth: '480px', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="reschedule-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <LogIn size={20} color="#0284c7" />
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>Check In Pet — {checkInModal.petName}</h3>
                </div>
                <button type="button" className="icon-btn" onClick={() => setCheckInModal(null)}><X size={18} /></button>
              </div>

              <div style={{ padding: '6px 0 16px' }}>
                {/* 1. Food Arrangement Snapshot Card */}
                <div style={{
                  background: '#fefce8',
                  border: '1.5px solid #fef08a',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  fontSize: '12.5px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#854d0e', marginBottom: '8px' }}>
                    <Utensils size={14} color="#854d0e" />
                    <span>Food & Dietary Arrangement (Snapshot)</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#713f12', fontWeight: 700, display: 'block' }}>Regular Food:</span>
                      <strong style={{ color: '#16a34a' }}>✓ Included (Paw Paw)</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#713f12', fontWeight: 700, display: 'block' }}>Special Food:</span>
                      <strong style={{ color: checkInModal.specialFoodRequired ? '#b45309' : '#16a34a' }}>
                        {checkInModal.specialFoodRequired
                          ? (isPawPawSpecialFood ? 'Yes — Paw Paw will provide' : 'Yes — Owner will provide (₹0)')
                          : 'No (Regular food fine)'}
                      </strong>
                    </div>
                  </div>

                  {checkInModal.feedingSchedule && (
                    <div style={{ fontSize: '11.5px', color: '#713f12', marginBottom: '4px' }}>
                      <strong>Schedule:</strong> {checkInModal.feedingSchedule}
                    </div>
                  )}

                  {(checkInModal.foodAllergies || checkInModal.allergies) && (
                    <div style={{ fontSize: '11.5px', color: '#713f12', marginBottom: '4px' }}>
                      <strong>Allergies / Dislikes:</strong> {checkInModal.foodAllergies || checkInModal.allergies}
                    </div>
                  )}

                  {(checkInModal.specialDietInstructions || checkInModal.waterInstructions || checkInModal.dietInstructions) && (
                    <div style={{ fontSize: '11.5px', color: '#713f12' }}>
                      <strong>Diet / Water Notes:</strong> {checkInModal.specialDietInstructions || checkInModal.waterInstructions || checkInModal.dietInstructions}
                    </div>
                  )}
                </div>

                {/* 2. Special Food Charge Recording (Only if Paw Paw provides special food) */}
                {isPawPawSpecialFood && (
                  <div style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #bbf7d0',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    marginBottom: '16px',
                  }}>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#166534', display: 'block', marginBottom: '4px' }}>
                      Record Special Food Charge (Optional at Check-In)
                    </label>
                    <p style={{ fontSize: '11.5px', color: '#15803d', margin: '0 0 10px', lineHeight: 1.4 }}>
                      Customer requested Paw Paw to provide special food. Enter confirmed charge now, or leave blank if collecting at checkout.
                    </p>
                    <input
                      type="number"
                      min="0"
                      className="input"
                      value={checkInFoodChargeInput}
                      onChange={e => setCheckInFoodChargeInput(e.target.value)}
                      placeholder="Enter special food charge in ₹ (Optional)"
                    />

                    {Number(checkInFoodChargeInput) > 0 && (
                      <div style={{ marginTop: '10px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534', display: 'block', marginBottom: '6px' }}>
                          When will you collect this food charge?
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <button
                            type="button"
                            className={`btn ${checkInFoodTiming === 'check_in' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setCheckInFoodTiming('check_in')}
                            style={{ fontSize: '11.5px', padding: '7px 8px', justifyContent: 'center' }}
                          >
                            Collect Now
                          </button>
                          <button
                            type="button"
                            className={`btn ${checkInFoodTiming === 'checkout' ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setCheckInFoodTiming('checkout')}
                            style={{ fontSize: '11.5px', padding: '7px 8px', justifyContent: 'center' }}
                          >
                            Collect at Checkout
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Advance Payment Question */}
                <p style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600, margin: '0 0 10px' }}>
                  Have you collected any advance payment?
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  <button
                    type="button"
                    className={`btn ${hasAdvancePayment === 'yes' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setHasAdvancePayment('yes')}
                    style={{ justifyContent: 'center', padding: '11px 14px', fontWeight: 700 }}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className={`btn ${hasAdvancePayment === 'no' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setHasAdvancePayment('no'); setAdvanceAmountInput('') }}
                    style={{ justifyContent: 'center', padding: '11px 14px', fontWeight: 700 }}
                  >
                    No
                  </button>
                </div>

                {hasAdvancePayment === 'yes' && (
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                      Advance Amount Collected (₹)
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="input"
                      value={advanceAmountInput}
                      onChange={e => setAdvanceAmountInput(e.target.value)}
                      placeholder="Enter advance amount, e.g. 2000"
                      autoFocus
                    />
                  </div>
                )}

                {/* 4. Payment Summary Before Saving */}
                {hasAdvancePayment !== null && (
                  <div style={{
                    background: 'var(--surface)',
                    border: '1.5px solid var(--border)',
                    borderRadius: '14px',
                    padding: '14px 16px',
                    fontSize: '12.5px',
                    display: 'grid',
                    gap: '8px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                      <span>Original Boarding Stay:</span>
                      <strong style={{ color: 'var(--text)' }}>₹{money(estTotal)}</strong>
                    </div>

                    {foodCharge > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#166534' }}>
                        <span>Special Food Charge ({checkInFoodTiming === 'check_in' ? 'Collecting Now' : 'Due at Checkout'}):</span>
                        <strong>+₹{money(foodCharge)}</strong>
                      </div>
                    )}

                    {foodCharge > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: '12px' }}>
                        <span>Total Stay (Boarding + Food):</span>
                        <strong style={{ color: 'var(--text)' }}>₹{money(totalStayWithFood)}</strong>
                      </div>
                    )}

                    {prevCollected > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                        <span>Existing Recorded Payment:</span>
                        <strong style={{ color: '#16a34a' }}>₹{money(prevCollected)}</strong>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                      <span>Advance Collected Now:</span>
                      <strong style={{ color: hasAdvancePayment === 'yes' ? '#16a34a' : 'var(--text)' }}>
                        ₹{hasAdvancePayment === 'yes' ? money(advanceAmountInput || 0) : '0'}
                      </strong>
                    </div>

                    {foodCollectedNow > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                        <span>Food Charge Collected Now:</span>
                        <strong style={{ color: '#16a34a' }}>₹{money(foodCollectedNow)}</strong>
                      </div>
                    )}

                    <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                      <span style={{ color: 'var(--text)' }}>Resulting Total Collected:</span>
                      <span style={{ color: '#16a34a', fontSize: '14px' }}>
                        ₹{money(newTotalCollected)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--muted)' }}>
                      <span>Remaining Balance:</span>
                      <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                        ₹{money(remainingBalance)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="reschedule-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setCheckInModal(null)}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: '#0284c7' }}
                  disabled={
                    hasAdvancePayment === null ||
                    (hasAdvancePayment === 'yes' && (!advanceAmountInput || Number(advanceAmountInput) <= 0)) ||
                    updating === checkInModal.id
                  }
                  onClick={confirmCheckIn}
                >
                  {updating === checkInModal.id ? 'Processing...' : 'Confirm Check-In'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ============================================================
          CHECKOUT MODAL
          ============================================================ */}
      {checkoutModal && (() => {
        const isPawPawFood = Boolean(
          checkoutModal.specialFoodRequired && checkoutModal.specialFoodProvider === 'pawpaw'
        )
        const isCustomerFood = Boolean(
          checkoutModal.specialFoodRequired && checkoutModal.specialFoodProvider === 'customer'
        )
        const alreadyRecordedCharge = Number(checkoutModal.specialFoodCharge || 0)
        const isRecordedAtCheckIn = Boolean(
          checkoutModal.specialFoodChargeRecordedAt === 'check_in' || alreadyRecordedCharge > 0
        )

        const newlyEnteredCharge = (!isRecordedAtCheckIn && isPawPawFood && Number(checkoutFoodChargeInput) > 0)
          ? Math.round(Number(checkoutFoodChargeInput))
          : 0

        const effectiveFoodCharge = isRecordedAtCheckIn ? alreadyRecordedCharge : newlyEnteredCharge
        const originalBoardingTotal = Number(checkoutModal.estimatedTotal || 0)
        const totalStayAmount = originalBoardingTotal + effectiveFoodCharge
        const previouslyCollected = Number(checkoutModal.amountCollected || 0)
        const additionalAtCheckout = Number(checkoutAmount) || 0
        const totalCollectedAfter = previouslyCollected + additionalAtCheckout
        const remainingBalance = Math.max(0, totalStayAmount - totalCollectedAfter)

        return (
          <div className="modal-overlay" onClick={() => setCheckoutModal(null)}>
            <div className="reschedule-modal-card" style={{ maxWidth: '480px', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="reschedule-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <LogOut size={20} color="#16a34a" />
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>Check Out Pet — {checkoutModal.petName}</h3>
                </div>
                <button type="button" className="icon-btn" onClick={() => setCheckoutModal(null)}><X size={18} /></button>
              </div>

              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '4px 0 14px' }}>
                Confirm check-out for <strong>{checkoutModal.petName}</strong> and record final payment collected.
              </p>

              {/* Special Food Status / Input if Paw Paw provided and not yet recorded */}
              {isRecordedAtCheckIn ? (
                <div style={{
                  background: '#f0fdf4',
                  border: '1.5px solid #bbf7d0',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  marginBottom: '14px',
                  fontSize: '12px',
                  color: '#166534',
                }}>
                  <strong>Special Food Charge (Recorded at Check-In):</strong> ₹{money(alreadyRecordedCharge)}
                  <span style={{ display: 'block', fontSize: '11px', color: '#15803d', marginTop: '2px' }}>
                    {checkoutModal.specialFoodChargeCollectedAt === 'check_in'
                      ? 'Already collected at check-in.'
                      : 'Included in balance due for checkout collection.'}
                  </span>
                </div>
              ) : isPawPawFood ? (
                <div style={{
                  background: '#fefce8',
                  border: '1.5px solid #fef08a',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: '14px',
                }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#854d0e', display: 'block', marginBottom: '4px' }}>
                    Record Special Food Charge (₹)
                  </label>
                  <p style={{ fontSize: '11.5px', color: '#713f12', margin: '0 0 8px', lineHeight: 1.4 }}>
                    Paw Paw provided special food for {checkoutModal.petName}. Enter the confirmed food charge below (or leave 0 if included).
                  </p>
                  <input
                    type="number"
                    min="0"
                    className="input"
                    value={checkoutFoodChargeInput}
                    onChange={e => {
                      const val = e.target.value
                      setCheckoutFoodChargeInput(val)
                      const extra = Number(val) || 0
                      const newRem = Math.max(0, (originalBoardingTotal + extra) - previouslyCollected)
                      setCheckoutAmount(String(newRem))
                    }}
                    placeholder="Enter special food charge, e.g. 500"
                  />
                </div>
              ) : isCustomerFood ? (
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  marginBottom: '14px',
                  fontSize: '12px',
                  color: 'var(--muted)',
                }}>
                  Special Food Provider: <strong>Customer provided food (₹0 extra charge)</strong>
                </div>
              ) : null}

              {/* Complete Breakdown matching requirements */}
              <div style={{
                background: 'var(--surface)',
                padding: '14px 16px',
                borderRadius: '14px',
                border: '1.5px solid var(--border)',
                marginBottom: '16px',
                fontSize: '12.5px',
                display: 'grid',
                gap: '8px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                  <span>Original Boarding Total:</span>
                  <strong style={{ color: 'var(--text)' }}>₹{money(originalBoardingTotal)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: effectiveFoodCharge > 0 ? '#166534' : 'var(--muted)' }}>
                  <span>
                    Special-Food Charge:
                    {effectiveFoodCharge > 0 && (
                      <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '4px' }}>
                        ({isRecordedAtCheckIn ? 'Recorded at Check-In' : 'Adding at Checkout'})
                      </span>
                    )}
                  </span>
                  <strong>
                    {effectiveFoodCharge > 0 ? `+₹${money(effectiveFoodCharge)}` : '₹0'}
                  </strong>
                </div>

                {effectiveFoodCharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text)', fontWeight: 700, borderTop: '1px dotted var(--border)', paddingTop: '6px' }}>
                    <span>Total Stay Amount (Stay + Food):</span>
                    <span>₹{money(totalStayAmount)}</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                  <span>Previously Collected Payments (inc. Advance):</span>
                  <strong style={{ color: '#16a34a' }}>₹{money(previouslyCollected)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                  <span>Additional Amount Collecting Now:</span>
                  <strong style={{ color: additionalAtCheckout > 0 ? '#16a34a' : 'var(--text)' }}>
                    ₹{money(additionalAtCheckout)}
                  </strong>
                </div>

                <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                  <span style={{ color: 'var(--text)' }}>Total Amount Collected After Checkout:</span>
                  <span style={{ color: '#16a34a', fontSize: '14px' }}>
                    ₹{money(totalCollectedAfter)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--muted)' }}>
                  <span>Remaining Balance:</span>
                  <span style={{ fontWeight: 700, color: remainingBalance > 0 ? 'var(--accent)' : '#16a34a' }}>
                    ₹{money(remainingBalance)}
                  </span>
                </div>
              </div>

              {/* Amount collecting now input */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)' }}>
                    Amount Collecting Now at Check-Out (₹)
                  </label>
                  <button
                    type="button"
                    onClick={() => setCheckoutAmount(String(Math.max(0, totalStayAmount - previouslyCollected)))}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    Set to Balance Due (₹{money(Math.max(0, totalStayAmount - previouslyCollected))})
                  </button>
                </div>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={checkoutAmount}
                  onChange={e => setCheckoutAmount(e.target.value)}
                  placeholder="Enter amount collected at checkout"
                />
              </div>

              <div className="reschedule-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setCheckoutModal(null)}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={updating === checkoutModal.id}
                  onClick={confirmCheckOut}
                >
                  {updating === checkoutModal.id ? 'Processing...' : 'Confirm Check-Out'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ============================================================
          CANCEL REQUEST MODAL
          ============================================================ */}
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

      {/* ============================================================
          RATES & SETTINGS MODAL
          ============================================================ */}
      {showSettingsModal && settingsDraft && (
        <div className="modal-overlay" onClick={closeSettingsModal}>
          <div
            className="boarding-settings-modal-card"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="boarding-settings-title"
          >
            {/* Modal Header */}
            <div className="boarding-settings-modal-header">
              <h3 id="boarding-settings-title">Boarding Rates & Settings</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={closeSettingsModal}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body (Vertically Scrollable) */}
            <div className="boarding-settings-modal-body">
              {/* Accept Bookings */}
              <div className="boarding-settings-toggle-card">
                <div className="boarding-settings-toggle-info">
                  <div className="boarding-settings-toggle-title">
                    Accept Boarding Bookings
                  </div>
                  <div className="boarding-settings-toggle-desc">
                    Allow customers to submit new pet boarding requests. When OFF, shows &ldquo;Boarding Bookings Temporarily Closed&rdquo;.
                  </div>
                </div>
                <input
                  type="checkbox"
                  id="acceptBookingsToggle"
                  checked={settingsDraft.acceptBookings !== false}
                  onChange={e => setSettingsDraft(p => ({ ...p, acceptBookings: e.target.checked }))}
                  className="boarding-settings-checkbox"
                  aria-label="Accept Boarding Bookings"
                />
              </div>

              {/* Show NEW Badge */}
              <div className="boarding-settings-toggle-card">
                <div className="boarding-settings-toggle-info">
                  <div className="boarding-settings-toggle-title">
                    <span>Show NEW Badge</span>
                    <span className="boarding-settings-new-badge">NEW</span>
                  </div>
                  <div className="boarding-settings-toggle-desc">
                    Display the golden &ldquo;NEW&rdquo; feature announcement badge at the top-right of the homepage boarding card.
                  </div>
                </div>
                <input
                  type="checkbox"
                  id="showNewBadgeToggle"
                  checked={settingsDraft.showNewBadge !== false}
                  onChange={e => setSettingsDraft(p => ({ ...p, showNewBadge: e.target.checked }))}
                  className="boarding-settings-checkbox"
                  aria-label="Show NEW Badge"
                />
              </div>

              {/* Daily Rates */}
              <div className="boarding-settings-section">
                <span className="boarding-settings-section-heading">
                  Daily Rates
                </span>
                <div className="boarding-settings-field-grid">
                  <div className="boarding-settings-field">
                    <label htmlFor="dogDailyRateInput">Dog Rate (₹/day)</label>
                    <input
                      id="dogDailyRateInput"
                      type="number"
                      min="1"
                      className="input"
                      value={settingsDraft.dogDailyRate ?? ''}
                      onChange={e => setSettingsDraft(p => ({ ...p, dogDailyRate: e.target.value === '' ? '' : Number(e.target.value) }))}
                    />
                  </div>
                  <div className="boarding-settings-field">
                    <label htmlFor="catDailyRateInput">Cat Rate (₹/day)</label>
                    <input
                      id="catDailyRateInput"
                      type="number"
                      min="1"
                      className="input"
                      value={settingsDraft.catDailyRate ?? ''}
                      onChange={e => setSettingsDraft(p => ({ ...p, catDailyRate: e.target.value === '' ? '' : Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>

              {/* Room Capacity */}
              <div className="boarding-settings-section">
                <span className="boarding-settings-section-heading">
                  Room Capacity
                </span>
                <div className="boarding-settings-field-grid">
                  <div className="boarding-settings-field">
                    <label htmlFor="maxDogCapacityInput">Max Dog Capacity</label>
                    <input
                      id="maxDogCapacityInput"
                      type="number"
                      min="1"
                      className="input"
                      value={settingsDraft.maxDogCapacity ?? ''}
                      onChange={e => setSettingsDraft(p => ({ ...p, maxDogCapacity: e.target.value === '' ? '' : Number(e.target.value) }))}
                    />
                  </div>
                  <div className="boarding-settings-field">
                    <label htmlFor="maxCatCapacityInput">Max Cat Capacity</label>
                    <input
                      id="maxCatCapacityInput"
                      type="number"
                      min="1"
                      className="input"
                      value={settingsDraft.maxCatCapacity ?? ''}
                      onChange={e => setSettingsDraft(p => ({ ...p, maxCatCapacity: e.target.value === '' ? '' : Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>

              {/* Pet Boarding Terms & Conditions */}
              <div className="boarding-settings-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <span className="boarding-settings-section-heading" style={{ margin: 0 }}>
                    Pet Boarding Terms & Conditions
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className={`btn ${termsViewMode === 'items' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 10px', fontSize: '11.5px', height: '28px' }}
                      onClick={() => setTermsViewMode('items')}
                    >
                      Bullet Items ({(settingsDraft.terms || []).length})
                    </button>
                    <button
                      type="button"
                      className={`btn ${termsViewMode === 'text' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 10px', fontSize: '11.5px', height: '28px' }}
                      onClick={() => setTermsViewMode('text')}
                    >
                      Multiline Text
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
                  These terms are presented to customers on Step 5 (Review & Confirm) for mandatory acceptance. You can edit, add, remove, and reorder bullet points.
                </p>

                {termsViewMode === 'items' ? (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {(settingsDraft.terms || []).map((term, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'flex-start',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '10px',
                          padding: '10px 12px',
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: '11.5px',
                            color: '#C08820',
                            marginTop: '6px',
                            minWidth: '24px',
                          }}
                        >
                          #{idx + 1}
                        </span>

                        <textarea
                          rows={2}
                          className="input"
                          style={{
                            flex: 1,
                            fontSize: '12.5px',
                            lineHeight: 1.4,
                            padding: '8px 10px',
                            minHeight: '48px',
                            resize: 'vertical',
                          }}
                          value={term}
                          onChange={e => handleUpdateTerm(idx, e.target.value)}
                          placeholder={`Enter term #${idx + 1}...`}
                        />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ width: '26px', height: '26px', padding: 0 }}
                            disabled={idx === 0}
                            onClick={() => handleMoveTerm(idx, 'up')}
                            title="Move up"
                          >
                            <ChevronUp size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ width: '26px', height: '26px', padding: 0 }}
                            disabled={idx === (settingsDraft.terms || []).length - 1}
                            onClick={() => handleMoveTerm(idx, 'down')}
                            title="Move down"
                          >
                            <ChevronDown size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ width: '26px', height: '26px', padding: 0, color: '#ef4444' }}
                            onClick={() => handleRemoveTerm(idx)}
                            title="Delete term"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '12px', padding: '7px 12px', gap: '5px' }}
                        onClick={handleAddTerm}
                      >
                        <Plus size={14} /> Add Another Term
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '11.5px', padding: '7px 12px', color: 'var(--muted)' }}
                        onClick={handleResetTermsToDefault}
                      >
                        Reset to Official Defaults
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <textarea
                      rows={12}
                      className="input"
                      style={{
                        width: '100%',
                        fontSize: '12.5px',
                        lineHeight: 1.5,
                        padding: '10px 12px',
                        fontFamily: 'inherit',
                      }}
                      value={(settingsDraft.terms || []).join('\n')}
                      onChange={e => handleRawTextChange(e.target.value)}
                      placeholder="Enter one term per line..."
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: 'var(--muted)' }}>
                      <span>Each line represents an individual bullet point.</span>
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#C08820', cursor: 'pointer', padding: 0, fontSize: '11px', fontWeight: 600 }}
                        onClick={handleResetTermsToDefault}
                      >
                        Reset to Defaults
                      </button>
                    </div>
                  </div>
                )}

                {/* Closing Message */}
                <div style={{ marginTop: '14px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                    Closing Message / Note
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={settingsDraft.termsClosingMessage ?? ''}
                    onChange={e => setSettingsDraft(p => ({ ...p, termsClosingMessage: e.target.value }))}
                    placeholder="e.g. Your pet's safety, comfort, and happiness are our priority! ❤️🐶🐱"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer (Pinned at Bottom, Never Overlaps Content) */}
            <div className="boarding-settings-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeSettingsModal}
                disabled={savingSettings}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingSettings}
                onClick={saveBoardingSettings}
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          SCOPED STYLES FOR ADMIN BOARDING & MODALS
          ============================================================ */}
      <style>{`
        /* ============================================================
           BOARDING RATES & SETTINGS MODAL (Responsive Mobile Layout)
           ============================================================ */
        .boarding-settings-modal-card {
          width: min(calc(100vw - 28px), 480px);
          max-height: min(90vh, 720px);
          background: var(--card);
          border: 1.5px solid var(--border);
          border-radius: 18px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.22);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          margin: auto;
          box-sizing: border-box;
        }

        .boarding-settings-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 18px;
          border-bottom: 1px solid var(--border);
          background: var(--card);
          flex-shrink: 0;
          gap: 12px;
          box-sizing: border-box;
        }

        .boarding-settings-modal-header h3 {
          margin: 0;
          color: var(--text);
          font-size: 17px;
          font-weight: 800;
          line-height: 1.25;
        }

        .boarding-settings-modal-header .icon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--muted);
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }

        .boarding-settings-modal-header .icon-btn:hover {
          color: var(--text);
          border-color: var(--accent);
        }

        .boarding-settings-modal-body {
          flex: 1 1 auto;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          box-sizing: border-box;
        }

        .boarding-settings-toggle-card {
          padding: 14px 16px;
          border-radius: 14px;
          background: var(--surface);
          border: 1.5px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          box-sizing: border-box;
        }

        .boarding-settings-toggle-info {
          min-width: 0;
          flex: 1;
        }

        .boarding-settings-toggle-title {
          font-weight: 800;
          font-size: 13.5px;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .boarding-settings-new-badge {
          background: var(--accent-bg);
          color: var(--accent);
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 6px;
          font-weight: 800;
          display: inline-block;
        }

        .boarding-settings-toggle-desc {
          font-size: 12px;
          color: var(--muted);
          margin-top: 4px;
          line-height: 1.45;
          word-break: normal;
          overflow-wrap: break-word;
        }

        .boarding-settings-checkbox {
          width: 20px;
          height: 20px;
          accent-color: var(--accent);
          cursor: pointer;
          flex-shrink: 0;
          margin: 0;
        }

        .boarding-settings-section {
          border-top: 1px solid var(--border);
          padding-top: 14px;
        }

        .boarding-settings-section-heading {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--muted);
          letter-spacing: 0.8px;
          display: block;
          margin-bottom: 10px;
        }

        .boarding-settings-field-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .boarding-settings-field {
          min-width: 0;
        }

        .boarding-settings-field label {
          font-size: 12px;
          font-weight: 700;
          color: var(--muted);
          display: block;
          margin-bottom: 6px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .boarding-settings-field .input {
          width: 100%;
          box-sizing: border-box;
        }

        .boarding-settings-modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          padding: 14px 18px;
          border-top: 1px solid var(--border);
          background: var(--card);
          flex-shrink: 0;
          box-sizing: border-box;
        }

        @media (max-width: 480px) {
          .boarding-settings-modal-card {
            width: min(calc(100vw - 20px), 480px);
            max-height: min(92vh, 680px);
            border-radius: 16px;
          }

          .boarding-settings-modal-header {
            padding: 14px 14px;
          }

          .boarding-settings-modal-body {
            padding: 14px 14px;
            gap: 14px;
          }

          .boarding-settings-toggle-card {
            padding: 12px 14px;
            gap: 12px;
          }

          .boarding-settings-field-grid {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .boarding-settings-field label {
            white-space: normal;
          }

          .boarding-settings-modal-footer {
            flex-direction: column-reverse;
            gap: 8px;
            padding: 12px 14px;
          }

          .boarding-settings-modal-footer button {
            width: 100%;
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
        }

        .boarding-admin-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 22px;
          flex-wrap: wrap;
          gap: 14px;
        }

        .header-title-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-icon-badge {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: #FAF3E3;
          border: 1px solid #EADBBE;
          color: #B8860B;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .header-title {
          font-size: 24px;
          font-weight: 800;
          color: var(--text);
          margin: 0;
          letter-spacing: -0.3px;
        }

        .header-subtitle {
          color: var(--muted);
          font-size: 13px;
          margin: 4px 0 0;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: nowrap;
        }

        .pill-status-btn {
          font-size: 12.5px;
          font-weight: 700;
          padding: 8px 12px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .pill-status-btn.open {
          background: #ECFDF3;
          color: #027A48;
          border: 1.5px solid #A6F4C5;
        }

        .pill-status-btn.closed {
          background: #FEF3F2;
          color: #B42318;
          border: 1.5px solid #FECDCA;
        }

        .pill-status-btn .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .pill-status-btn.open .dot {
          background: #12B76A;
        }

        .pill-status-btn.closed .dot {
          background: #F04438;
        }

        .action-btn {
          font-size: 12.5px;
          padding: 8px 12px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* Stats Grid: Always 4 columns in 1 row */
        .boarding-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 20px;
        }

        .boarding-stat-card {
          padding: 12px 14px;
          border-radius: 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }

        .boarding-stat-card.stays {
          background: #FFF9F3;
          border: 1.5px solid #FDE8D3;
        }
        .boarding-stat-card.stays .stat-icon { color: #E07A5F; }
        .boarding-stat-card.stays .stat-icon-box { background: #FEECE0; }

        .boarding-stat-card.checked-in {
          background: #F0F9FF;
          border: 1.5px solid #D0ECFD;
        }
        .boarding-stat-card.checked-in .stat-icon { color: #0284C7; }
        .boarding-stat-card.checked-in .stat-icon-box { background: #E0F2FE; }

        .boarding-stat-card.pending {
          background: #FEFCE8;
          border: 1.5px solid #FEF08A;
        }
        .boarding-stat-card.pending .stat-icon { color: #D97706; }
        .boarding-stat-card.pending .stat-icon-box { background: #FEF9C3; }

        .boarding-stat-card.revenue {
          background: #F0FDF4;
          border: 1.5px solid #DCFCE7;
        }
        .boarding-stat-card.revenue .stat-icon { color: #16A34A; }
        .boarding-stat-card.revenue .stat-icon-box { background: #DCFCE7; }

        .stat-card-head {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }

        .stat-icon-box {
          width: 24px;
          height: 24px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .stat-label {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--muted);
          letter-spacing: 0.4px;
          min-width: 0;
          white-space: nowrap;
        }

        .stat-val {
          font-size: 22px;
          font-weight: 800;
          color: var(--text);
          line-height: 1.1;
        }
        .boarding-stat-card.checked-in .stat-val { color: #0284C7; }
        .boarding-stat-card.pending .stat-val { color: #D97706; }
        .boarding-stat-card.revenue .stat-val { color: #16A34A; }
        .stat-val.revenue-val {
          font-size: 18px;
        }

        /* Search & Filter Bar: Single row with Search, Filters, and Latest First */
        .boarding-filter-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }

        .boarding-search-wrap {
          flex: 1;
          min-width: 0;
          position: relative;
          display: flex;
          align-items: center;
        }

        .boarding-search-wrap .search-icon {
          position: absolute;
          left: 12px;
          color: var(--muted);
          pointer-events: none;
        }

        .boarding-search-wrap .search-input {
          padding-left: 34px;
          padding-right: 28px;
          width: 100%;
          border-radius: 12px;
          height: 40px;
          font-size: 13px;
          background: var(--card);
          border: 1.2px solid var(--border);
        }

        .search-clear-btn {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          color: var(--muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
        }

        .boarding-filter-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 40px;
          padding: 0 12px;
          border-radius: 12px;
          background: var(--card);
          border: 1.2px solid var(--border);
          color: var(--text);
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
          position: relative;
          transition: all 0.15s;
          white-space: nowrap;
        }

        .boarding-filter-btn.active {
          border-color: var(--accent);
          background: #FAF3E3;
          color: #B8860B;
        }

        .active-filter-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #B8860B;
        }

        /* Results count row */
        .boarding-count-row {
          margin-bottom: 12px;
          font-size: 13.5px;
          color: var(--text);
          font-weight: 600;
        }

        .boarding-results-count {
          color: var(--muted);
        }

        .boarding-results-count strong {
          color: var(--text);
          font-weight: 800;
        }

        /* Booking Cards Grid */
        .boarding-cards-grid {
          display: grid;
          gap: 14px;
        }

        .boarding-admin-card {
          background: var(--card);
          border: 1.2px solid var(--border);
          border-radius: 18px;
          padding: 16px 18px;
          box-shadow: 0 3px 12px rgba(60, 40, 20, 0.03);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .boarding-admin-card:hover {
          border-color: #E2D7C5;
          box-shadow: 0 6px 18px rgba(60, 40, 20, 0.05);
        }

        .boarding-card-top {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          position: relative;
        }

        .boarding-card-pet-avatar {
          width: 50px;
          height: 50px;
          border-radius: 14px;
          background: #FAF3E3;
          color: #B8860B;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
          border: 1px solid #EFE6D8;
        }
        .boarding-card-pet-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .boarding-card-header-info {
          flex: 1;
          min-width: 0;
          padding-right: 36px;
        }

        .boarding-card-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .boarding-card-pet-name {
          font-size: 16px;
          font-weight: 800;
          color: var(--text);
        }

        .boarding-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          text-transform: capitalize;
        }

        .boarding-status-pill.pending {
          background: #FEFCE8;
          color: #B45309;
          border: 1px solid #FEF08A;
        }
        .boarding-status-pill.confirmed {
          background: #EFF8FF;
          color: #0284C7;
          border: 1px solid #B2DDFF;
        }
        .boarding-status-pill.checked_in {
          background: #F0F9FF;
          color: #0369A1;
          border: 1.2px solid #BAE6FD;
        }
        .boarding-status-pill.checked_out {
          background: #ECFDF3;
          color: #027A48;
          border: 1px solid #A6F4C5;
        }
        .boarding-status-pill.cancelled {
          background: #FEF3F2;
          color: #B42318;
          border: 1px solid #FECDCA;
        }

        .boarding-card-breed {
          font-size: 12.5px;
          color: var(--muted);
          margin-top: 2px;
        }

        .boarding-card-owner {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 12px;
          color: var(--text);
          margin-top: 4px;
          flex-wrap: wrap;
        }
        .boarding-card-owner span {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        /* Top-Right Edit Button */
        .boarding-card-edit-btn {
          position: absolute;
          top: 0;
          right: 0;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #FFFFFF;
          border: 1.2px solid #E4DACB;
          color: #B8860B;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .boarding-card-edit-btn:hover {
          background: #FAF3E3;
          border-color: #C08820;
        }

        /* Middle details strip: 2 columns, clean and uncrowded */
        .boarding-card-strip {
          background: #FDFBF7;
          border: 1.2px solid #F2ECE1;
          border-radius: 14px;
          padding: 12px 14px;
          margin: 12px 0 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .boarding-strip-item {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .strip-icon-box {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          background: #FAF3E3;
          color: #B8860B;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .boarding-strip-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .strip-label {
          font-size: 10.5px;
          font-weight: 800;
          text-transform: capitalize;
          color: var(--muted);
        }

        .strip-val {
          font-size: 13.5px;
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
        }

        .strip-val.amount {
          color: #C08820;
          font-size: 16px;
          font-weight: 800;
        }

        .strip-sub {
          font-size: 11px;
          color: var(--muted);
          font-weight: 600;
        }

        /* Card Bottom Actions: Status-specific direct action buttons */
        .boarding-card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
        }

        .card-action-btn {
          flex: 1 1 0;
          min-width: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 38px;
          padding: 0 12px;
          border-radius: 10px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
          text-decoration: none;
          white-space: nowrap;
        }

        .card-action-btn.confirm {
          background: #FFFFFF;
          border: 1.5px solid #16A34A;
          color: #15803D;
        }
        .card-action-btn.confirm:hover {
          background: #F0FDF4;
        }

        .card-action-btn.checkin {
          background: #FFFFFF;
          border: 1.5px solid #0284C7;
          color: #0369A1;
        }
        .card-action-btn.checkin:hover {
          background: #F0F9FF;
        }

        .card-action-btn.checkout {
          background: #FFFFFF;
          border: 1.5px solid #16A34A;
          color: #15803D;
        }
        .card-action-btn.checkout:hover {
          background: #F0FDF4;
        }

        .card-action-btn.cancel {
          background: #FFFFFF;
          border: 1.5px solid #EF4444;
          color: #DC2626;
        }
        .card-action-btn.cancel:hover {
          background: #FEF2F2;
        }

        .card-action-btn.details {
          background: #FFFFFF;
          border: 1.3px solid #E0D7C9;
          color: #3B2E25;
        }
        .card-action-btn.details:hover {
          background: #FAF6EE;
          border-color: #C08820;
          color: #B8860B;
        }

        .card-action-btn.whatsapp {
          background: #FFFFFF;
          border: 1.3px solid #25D366;
          color: #128C7E;
        }
        .card-action-btn.whatsapp:hover {
          background: #F0FDF4;
        }

        /* Bottom Sheet Modal */
        .filter-drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(4px);
          z-index: 1200 !important;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding: 0 !important;
        }

        .filters-bottom-sheet {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 24px 24px 0 0;
          width: 100%;
          max-width: 600px;
          max-height: 85vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          margin: 0;
          box-shadow: 0 -8px 32px rgba(0,0,0,0.25);
          animation: slideUp 0.25s ease-out;
        }

        @media (min-width: 641px) {
          .filter-drawer-overlay {
            align-items: center !important;
            padding: 20px !important;
          }
          .filters-bottom-sheet {
            border-radius: 24px;
            margin: auto;
            max-height: 80vh;
          }
        }

        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        .bottom-sheet-handle {
          width: 44px;
          height: 4px;
          border-radius: 999px;
          background: #D5CBBF;
          margin: 12px auto 6px;
        }

        .bottom-sheet-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 20px 14px;
          border-bottom: 1px solid var(--border);
        }

        .bottom-sheet-head .head-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .bottom-sheet-head h3 {
          margin: 0;
          font-size: 17px;
          font-weight: 800;
          color: var(--text);
        }

        .bottom-sheet-body {
          padding: 16px 20px;
          display: grid;
          gap: 16px;
          overflow-y: auto;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .filter-label {
          font-size: 11.5px;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--muted);
          letter-spacing: 0.6px;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .filter-pills-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .filter-pill-opt {
          padding: 7px 14px;
          border-radius: 10px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          background: var(--surface);
          border: 1.2px solid var(--border);
          color: var(--muted);
          transition: all 0.15s;
        }

        .filter-pill-opt.active {
          background: #FAF3E3;
          border-color: #C08820;
          color: #B8860B;
        }

        .filter-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .filter-three-col {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .bottom-sheet-footer {
          padding: 14px 20px;
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .bottom-sheet-footer .btn {
          flex: 1;
          justify-content: center;
          padding: 11px;
          font-size: 13px;
        }

        /* Details Modal (Screenshot 1 match) */
        .boarding-details-modal {
          background: #FFFDF9;
          border: 1.5px solid #EFE6D8;
          border-radius: 22px;
          width: min(calc(100vw - 24px), 620px);
          max-height: calc(100dvh - 32px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 16px 48px rgba(60, 40, 20, 0.18);
          margin: auto;
          box-sizing: border-box;
        }

        .details-modal-header {
          padding: 14px 18px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          border-bottom: 1.2px solid #EFE6D8;
          background: #FFFDF9;
          flex-shrink: 0;
          box-sizing: border-box;
        }

        .details-header-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
        }

        .details-title {
          font-size: 18px;
          font-weight: 800;
          color: #221711;
          margin: 0;
          line-height: 1.25;
          min-width: 0;
          word-break: break-word;
          flex: 1;
        }

        .header-actions-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .details-header-sub-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .details-ref-id {
          font-size: 12px;
          font-weight: 800;
          color: #9E6B18;
          background: #FAF3E5;
          border: 1px solid #EEDBC2;
          padding: 3px 8px;
          border-radius: 6px;
          letter-spacing: 0.5px;
          display: inline-flex;
          align-items: center;
          line-height: 1;
        }

        .details-header-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 11px;
          border-radius: 9px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.15s;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .details-header-btn.whatsapp {
          background: #FFFFFF;
          border: 1.3px solid #25D366;
          color: #128C7E;
        }
        .details-header-btn.whatsapp:hover {
          background: #F0FDF4;
        }

        .details-header-btn.edit {
          background: #FFFFFF;
          border: 1.3px solid #C08820;
          color: #B8860B;
        }
        .details-header-btn.edit:hover {
          background: #FAF3E3;
        }

        .details-header-btn.cancel-edit {
          background: var(--surface);
          border: 1.2px solid var(--border);
          color: var(--muted);
        }

        .details-close-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid #EFE6D8;
          background: #FFFDF9;
          color: var(--muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }
        .details-close-btn:hover {
          background: #FAF3E5;
          border-color: var(--accent);
          color: var(--text);
        }

        .details-modal-body {
          flex: 1 1 auto;
          padding: 16px 18px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          display: grid;
          gap: 14px;
        }

        /* Section Cards */
        .boarding-section-card {
          background: #FFFFFF;
          border: 1.2px solid #EFE6D8;
          border-radius: 16px;
          padding: 16px 18px;
          box-shadow: 0 2px 8px rgba(60, 40, 20, 0.02);
        }

        .section-card-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }

        .section-icon-wrap {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #FAF3E3;
          color: #B8860B;
          flex-shrink: 0;
        }

        .section-card-header h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 800;
          color: #2B1D15;
        }

        /* Pet Hero Row */
        .pet-hero-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding-bottom: 14px;
          border-bottom: 1px solid #F5EFE6;
          margin-bottom: 12px;
        }

        .pet-avatar-large {
          width: 60px;
          height: 60px;
          border-radius: 14px;
          background: #FAF3E3;
          color: #B8860B;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
          border: 1px solid #EFE6D8;
        }
        .pet-avatar-large img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .pet-hero-name {
          font-size: 18px;
          font-weight: 800;
          color: #221711;
          display: block;
        }

        .pet-hero-subtitle {
          font-size: 13px;
          color: #7D6B60;
          margin: 2px 0 6px;
        }

        .pet-pills-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .pet-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 9px;
          border-radius: 999px;
          background: #F8F5EE;
          border: 1px solid #EADBCE;
          color: #55443A;
          font-size: 11.5px;
          font-weight: 700;
        }

        /* 2-col detail grid */
        .detail-two-col-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px 14px;
        }

        .detail-two-col-grid.care {
          gap: 10px 14px;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }

        .detail-item.full {
          grid-column: 1 / -1;
        }

        .detail-label {
          font-size: 11px;
          font-weight: 800;
          color: #8C786E;
          text-transform: capitalize;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .detail-label svg {
          color: #C08820;
        }

        .detail-val {
          font-size: 13.5px;
          font-weight: 700;
          color: #2B1D15;
          word-break: break-word;
        }
        .detail-val.email {
          font-size: 12.5px;
          font-weight: 600;
        }

        .badge-vaccine {
          display: inline-block;
          width: fit-content;
          background: #ECFDF3;
          color: #027A48;
          border: 1px solid #A6F4C5;
          padding: 3px 9px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
        }

        /* Stay Banner Strip inside Card C */
        .stay-banner-strip {
          background: #FDFBF7;
          border: 1px solid #EFE6D8;
          border-radius: 14px;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
          gap: 8px;
        }

        .stay-banner-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .stay-banner-item.total {
          text-align: right;
        }

        .stay-arrow {
          color: #C08820;
          opacity: 0.7;
          flex-shrink: 0;
        }

        .stay-label {
          font-size: 11px;
          font-weight: 800;
          color: #8C786E;
          display: flex;
          align-items: center;
          gap: 4px;
          text-transform: uppercase;
        }

        .stay-val {
          font-size: 14px;
          font-weight: 800;
          color: #221711;
        }

        .stay-val.duration {
          color: #D97706;
          font-size: 15px;
        }

        .stay-sub {
          font-size: 11px;
          color: #8C786E;
          font-weight: 600;
        }

        /* Billing 3-col */
        .billing-three-col-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          padding-top: 4px;
        }

        .billing-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .billing-label {
          font-size: 11px;
          font-weight: 800;
          color: #8C786E;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .billing-val {
          font-size: 15px;
          font-weight: 800;
          color: #2B1D15;
        }
        .billing-val.estimated {
          color: #C08820;
          font-size: 16.5px;
        }
        .billing-val.collected {
          color: #16A34A;
          font-size: 16.5px;
        }

        /* Edit Form inside Modal */
        .boarding-edit-form {
          display: grid;
          gap: 14px;
        }

        .edit-sec-title {
          font-size: 13px;
          font-weight: 800;
          text-transform: uppercase;
          color: #B8860B;
          margin: 0 0 10px;
          letter-spacing: 0.5px;
        }

        .edit-input-label {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--muted);
          display: block;
          margin-bottom: 4px;
        }

        /* Details Modal Footer */
        .details-modal-footer {
          padding: 14px 20px;
          border-top: 1.2px solid #EFE6D8;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          background: #FFFDF9;
        }

        .btn-details-close-wide {
          width: 100%;
          justify-content: center;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 11px;
          border-radius: 12px;
          background: #FFFFFF;
          border: 1.5px solid #C08820;
          color: #9A6C16;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-details-close-wide:hover {
          background: #FAF3E3;
        }

        /* Empty state */
        .boarding-empty-state {
          padding: 48px 20px;
          text-align: center;
          background: var(--card);
          border-radius: 18px;
          border: 1.2px solid var(--border);
        }
        .boarding-empty-state .empty-icon {
          color: var(--muted);
          margin-bottom: 12px;
        }
        .boarding-empty-state h3 {
          margin: 0 0 6px;
          font-size: 16px;
          font-weight: 800;
          color: var(--text);
        }
        .boarding-empty-state p {
          color: var(--muted);
          font-size: 13px;
          margin: 0;
        }

        /* Mobile Adjustments (<= 640px) */
        @media (max-width: 640px) {
          .boarding-admin-header {
            margin-bottom: 14px;
          }

          .header-title {
            font-size: 20px;
          }

          .header-subtitle {
            font-size: 12px;
          }

          /* Requirement 1: All three management actions in a single horizontal row on mobile */
          .header-actions {
            width: 100%;
            display: flex;
            flex-wrap: nowrap;
            align-items: center;
            gap: 6px;
            justify-content: space-between;
          }

          .pill-status-btn,
          .header-actions .action-btn {
            flex: 1 1 0;
            min-width: 0;
            padding: 7px 4px;
            font-size: 11px;
            gap: 4px;
            justify-content: center;
            text-align: center;
          }

          /* Requirement: All four summary statistics in a single horizontal row on mobile */
          .boarding-stats-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 4px;
            margin-bottom: 14px;
          }

          .boarding-stat-card {
            padding: 7px 4px;
            border-radius: 12px;
            gap: 4px;
            min-width: 0;
            box-sizing: border-box;
          }

          .stat-card-head {
            gap: 3px;
            min-width: 0;
          }

          .stat-icon-box {
            width: 17px;
            height: 17px;
            border-radius: 5px;
            flex-shrink: 0;
          }

          .stat-icon-box svg {
            width: 10px;
            height: 10px;
          }

          .stat-label {
            font-size: 9px;
            font-weight: 700;
            text-transform: none;
            letter-spacing: -0.15px;
            white-space: nowrap;
            overflow: visible;
            text-overflow: clip;
            line-height: 1.1;
          }

          .stat-val {
            font-size: 16px;
            font-weight: 800;
            line-height: 1.1;
            white-space: nowrap;
            overflow: visible;
          }

          .stat-val.revenue-val {
            font-size: 12px;
            font-weight: 800;
            letter-spacing: -0.3px;
            white-space: nowrap;
            overflow: visible;
          }

          /* Requirement 3: Search, Filters, and Latest First on single row */
          .boarding-filter-bar {
            gap: 6px;
            margin-bottom: 10px;
          }

          .boarding-search-wrap .search-input {
            height: 38px;
            font-size: 12px;
            padding-left: 30px;
            padding-right: 24px;
          }

          .boarding-search-wrap .search-icon {
            left: 10px;
            width: 14px;
            height: 14px;
          }

          .boarding-filter-btn {
            height: 38px;
            padding: 0 8px;
            font-size: 11.5px;
            gap: 4px;
          }

          /* Requirement 4: Strip layout with 2 columns */
          .boarding-admin-card {
            padding: 14px;
            border-radius: 16px;
          }

          .boarding-card-strip {
            padding: 10px 12px;
            margin: 10px 0 12px;
            gap: 8px;
          }

          .strip-icon-box {
            width: 28px;
            height: 28px;
          }

          .strip-icon-box svg {
            width: 13px;
            height: 13px;
          }

          .strip-label {
            font-size: 10px;
          }

          .strip-val {
            font-size: 12.5px;
          }

          .strip-val.amount {
            font-size: 14.5px;
          }

          .strip-sub {
            font-size: 10.5px;
          }

          /* Requirement 5 & 6: Action buttons side-by-side */
          .boarding-card-actions {
            gap: 6px;
          }

          .card-action-btn {
            height: 36px;
            font-size: 11.5px;
            padding: 0 8px;
            gap: 4px;
          }

          .card-action-btn svg {
            width: 14px;
            height: 14px;
          }

          .detail-two-col-grid {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .filter-three-col {
            grid-template-columns: 1fr;
          }

          .stay-banner-strip {
            flex-wrap: wrap;
            gap: 10px;
          }

          .billing-three-col-row {
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          .modal-overlay {
            padding: 10px !important;
          }

          .boarding-details-modal {
            width: min(calc(100vw - 20px), 620px);
            max-height: calc(100dvh - 24px);
            border-radius: 20px;
            margin: auto;
          }

          .details-modal-header {
            padding: 12px 14px 10px;
            gap: 6px;
          }

          .details-title {
            font-size: 16px;
          }

          .details-header-btn {
            padding: 5px 9px;
            font-size: 11.5px;
          }

          .details-close-btn {
            width: 30px;
            height: 30px;
          }

          .details-modal-body {
            padding: 12px 14px;
            gap: 12px;
          }
        }

        @media (max-width: 360px) {
          .pill-status-btn,
          .header-actions .action-btn {
            font-size: 10px;
            padding: 6px 2px;
          }

          .boarding-stats-grid {
            gap: 3px;
          }

          .boarding-stat-card {
            padding: 6px 3px;
          }

          .stat-card-head {
            gap: 2.5px;
          }

          .stat-icon-box {
            width: 15px;
            height: 15px;
            border-radius: 4px;
          }

          .stat-icon-box svg {
            width: 9px;
            height: 9px;
          }

          .stat-label {
            font-size: 8px;
            letter-spacing: -0.25px;
            white-space: nowrap;
            overflow: visible;
            text-overflow: clip;
          }

          .stat-val {
            font-size: 14px;
          }

          .stat-val.revenue-val {
            font-size: 10.5px;
            letter-spacing: -0.4px;
          }

          .card-action-btn {
            font-size: 10.5px;
            padding: 0 4px;
          }
        }

        @media (max-width: 320px) {
          .boarding-stats-grid {
            gap: 2px;
          }

          .boarding-stat-card {
            padding: 6px 2px;
          }

          .stat-card-head {
            gap: 2px;
          }

          .stat-icon-box {
            width: 13px;
            height: 13px;
          }

          .stat-icon-box svg {
            width: 8px;
            height: 8px;
          }

          .stat-label {
            font-size: 7.5px;
            letter-spacing: -0.3px;
          }

          .stat-val {
            font-size: 12.5px;
          }

          .stat-val.revenue-val {
            font-size: 9.5px;
            letter-spacing: -0.4px;
          }
        }
      `}</style>
    </div>
  )
}
