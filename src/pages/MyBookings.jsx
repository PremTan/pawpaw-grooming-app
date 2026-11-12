// src/pages/MyBookings.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { collection, query, where, orderBy, getDocs, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import {
  AlertCircle,
  ArrowRight,
  Bed,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Clock,
  Compass,
  Droplets,
  Edit,
  FileText,
  Footprints,
  Home,
  IndianRupee,
  Info,
  LogIn,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  Package,
  PawPrint,
  Phone,
  Plus,
  PlusSquare,
  Receipt,
  RotateCcw,
  Scale,
  Scissors,
  ShieldCheck,
  Sparkles,
  Store,
  Syringe,
  Tag,
  User,
  UserRound,
  Users,
  Utensils,
  Wallet,
  X,
} from 'lucide-react'
import { ADMIN_EMAIL, db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'
import Toast from '../components/Toast'
import { fetchBookingSettings, getAvailabilityForDate, getBookingTypeLabel, getPaymentModeLabel, getPaymentOptionLabel } from '../utils/bookingSettings'
import { SERVICES, buildWhatsAppMessage } from '../utils/services'
import { buildServiceCatalog } from '../utils/serviceCatalog'
import { fetchBusinessInfo } from '../utils/businessInfo'
import { buildBoardingWhatsAppMessage } from '../utils/boardingSettings'
import {
  buildWalkingWhatsAppMessage,
  fetchWalkingSettings,
  DEFAULT_WALKING_SETTINGS,
  DEFAULT_WALKING_SLOTS,
  isWalkingDayOpen,
  parseSlotTimeToMinutes,
} from '../utils/walkingSettings'
import { downloadInvoicePdf } from '../utils/invoicePdf'

const STATUS_BADGE = {
  pending: 'badge-pending',
  confirmed: 'badge-confirmed',
  checked_in: 'badge-confirmed',
  checked_out: 'badge-completed',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
}

const STATUS_FILTERS = ['all', 'pending', 'confirmed', 'completed', 'cancelled']

const statusLabel = status => {
  if (status === 'all') return 'All'
  if (status === 'checked_in') return 'Checked In'
  if (status === 'checked_out') return 'Checked Out'
  return (status || 'pending').charAt(0).toUpperCase() + (status || 'pending').slice(1)
}
const money = value => Number(value || 0).toLocaleString('en-IN')
const shortId = id => id ? `#${id.slice(0, 8).toUpperCase()}` : '-'
const assignedWorker = booking => booking.assignedTeamMemberName || (booking.status === 'confirmed' || booking.status === 'completed' ? 'Owner' : '')

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
  } catch {}
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
  } catch {}
  return dob
}

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

function getRebookUrl(booking) {
  const params = new URLSearchParams()
  if (Array.isArray(booking.serviceIds) && booking.serviceIds.length > 0) {
    booking.serviceIds.forEach(id => params.append('service', id))
  } else if (booking.serviceId) {
    params.append('service', booking.serviceId)
  }
  if (Array.isArray(booking.selectedPackages) && booking.selectedPackages.length > 0) {
    params.append('package', booking.selectedPackages[0])
  } else if (booking.packageId) {
    params.append('package', booking.packageId)
  }
  if (booking.petName) params.set('petName', booking.petName)
  if (booking.petType) params.set('petType', booking.petType)
  if (booking.petBreed) params.set('petBreed', booking.petBreed)
  if (booking.bookingType) params.set('visit', booking.bookingType)
  if (booking.address) params.set('address', booking.address)
  if (booking.phone) params.set('phone', booking.phone)
  if (booking.ownerName) params.set('ownerName', booking.ownerName)
  params.set('step', '3')
  params.set('rebook', '1')
  return `/book?${params.toString()}`
}

function getBoardingRebookUrl(booking) {
  if (!booking) return '/boarding'
  const params = new URLSearchParams()
  if (booking.id) params.set('rebookId', booking.id)
  if (booking.petName) params.set('petName', booking.petName)
  if (booking.petType) params.set('petType', booking.petType)
  if (booking.petBreed) params.set('petBreed', booking.petBreed)
  if (booking.phone) params.set('phone', booking.phone)
  if (booking.ownerName) params.set('ownerName', booking.ownerName)
  return `/boarding?${params.toString()}`
}

function getPriceRange(value) {
  const values = String(value || '')
    .match(/\d[\d,]*(?:\.\d+)?/g)
    ?.map(item => Number(item.replace(/,/g, '')))
    .filter(item => Number.isFinite(item) && item > 0) || []
  if (!values.length) return { min: 0, max: 0 }
  return { min: Math.min(...values), max: Math.max(...values) }
}

function getPackagePriceRange(pkg) {
  const value = pkg?.priceRange || pkg?.price
  return getPriceRange(value)
}

function formatRangeLabel(range) {
  if (!range) return ''
  const { min, max } = range
  if (min <= 0 && max <= 0) return ''
  if (max > min) return `Rs ${min} - Rs ${max}+`
  return `Rs ${min}+`
}

function formatBookingEstimate(booking) {
  const min = Number(booking.estimatedTotal || 0)
  const max = Number(booking.estimatedTotalMax || booking.estimatedTotal || 0)
  if (max > min) return `Rs ${money(min)} – Rs ${money(max)}+`
  if (min > 0) return `Rs ${money(min)}`
  return 'Rs 0'
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
  const navigate = useNavigate()
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
  const [packages, setPackages] = useState([])
  const [serviceDetails, setServiceDetails] = useState({})
  const [editingAppointmentId, setEditingAppointmentId] = useState(null)
  const [editServiceIds, setEditServiceIds] = useState([])
  const [editPackageIds, setEditPackageIds] = useState([])
  const [editBookingType, setEditBookingType] = useState('store')
  const [editAddress, setEditAddress] = useState('')
  const [profileAddresses, setProfileAddresses] = useState([])
  const [editFullOpen, setEditFullOpen] = useState(false)
  const editAddressRef = useRef(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // Pet Boarding state
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const tabFromUrl = searchParams.get('tab') || location.state?.tab || location.state?.domainTab
  const [domainTab, setDomainTab] = useState(
    tabFromUrl === 'walking' ? 'walking' : tabFromUrl === 'boarding' ? 'boarding' : 'grooming'
  )

  useEffect(() => {
    const tabParam = searchParams.get('tab') || location.state?.tab || location.state?.domainTab
    if (tabParam === 'walking') {
      setDomainTab('walking')
    } else if (tabParam === 'boarding') {
      setDomainTab('boarding')
    } else if (tabParam === 'grooming') {
      setDomainTab('grooming')
    }
  }, [searchParams, location.state])
  const [boardings, setBoardings] = useState([])
  const [boardingLoading, setBoardingLoading] = useState(false)
  const [selectedBoarding, setSelectedBoarding] = useState(null)
  const [boardingCancelTarget, setBoardingCancelTarget] = useState(null)
  const [boardingCancelReason, setBoardingCancelReason] = useState('')
  const [cancellingBoardingId, setCancellingBoardingId] = useState('')

  // Pet Walking state
  const [walkings, setWalkings] = useState([])
  const [walkingLoading, setWalkingLoading] = useState(false)
  const [selectedWalking, setSelectedWalking] = useState(null)
  const [walkingCancelTarget, setWalkingCancelTarget] = useState(null)
  const [walkingCancelReason, setWalkingCancelReason] = useState('')
  const [cancellingWalkingId, setCancellingWalkingId] = useState('')
  const [walkingRescheduleTarget, setWalkingRescheduleTarget] = useState(null)
  const [walkingRescheduleDate, setWalkingRescheduleDate] = useState('')
  const [walkingRescheduleSlot, setWalkingRescheduleSlot] = useState('')
  const [walkingRescheduleBookedSlots, setWalkingRescheduleBookedSlots] = useState([])
  const [reschedulingWalkingId, setReschedulingWalkingId] = useState('')
  const [walkingSettings, setWalkingSettings] = useState(DEFAULT_WALKING_SETTINGS)
  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState('')
  const [shopName, setShopName] = useState('Paw Paw Pet Grooming')
  const [shopAddress, setShopAddress] = useState('')
  const [businessInfo, setBusinessInfo] = useState(null)
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState('')
  const [invoiceToast, setInvoiceToast] = useState('')
  const [invoiceToastType, setInvoiceToastType] = useState('success')

  // Lock background scroll when boarding modal is open
  useEffect(() => {
    if (selectedBoarding) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [selectedBoarding])

  useEffect(() => {
    fetchBusinessInfo(db).then(biz => {
      setBusinessInfo(biz)
      setAdminWhatsappNumber(biz.whatsappNumber || '')
      setShopName(biz.contact?.shopName || 'Paw Paw Pet Grooming')
      setShopAddress(biz.contact?.address || '')
    })
  }, [])

  useEffect(() => {
    if (!invoiceToast) return
    const t = window.setTimeout(() => setInvoiceToast(''), 3500)
    return () => window.clearTimeout(t)
  }, [invoiceToast])

  const allowInvoice = bookingSettings?.allowCustomerInvoiceDownload === true

  const handleDownloadGroomingInvoice = async (booking) => {
    if (!booking) return
    setDownloadingInvoiceId(booking.id)
    try {
      const invoiceData = {
        ...booking,
        serviceName: appointmentTitle(booking),
        totalAmount: Number(booking.amountCollected || booking.estimatedTotal || 0),
        amountCollected: Number(booking.amountCollected || booking.estimatedTotal || 0),
      }
      await downloadInvoicePdf(invoiceData, businessInfo || {})
      setInvoiceToastType('success')
      setInvoiceToast('Invoice downloaded successfully!')
    } catch (err) {
      console.error('Invoice download failed:', err)
      setInvoiceToastType('error')
      setInvoiceToast('Failed to download invoice. Please try again.')
    } finally {
      setDownloadingInvoiceId('')
    }
  }

  const handleDownloadBoardingInvoice = async (b) => {
    if (!b) return
    setDownloadingInvoiceId(b.id)
    try {
      const stayDays = b.stayDays || 1
      const dailyRate = Number(b.dailyRate || 0)
      const baseAmount = stayDays * dailyRate
      const foodCharge = Number(b.specialFoodCharge || 0)
      const lateFee = Number(b.lateCheckOutCharge || 0)

      const items = [
        [
          '01',
          `Pet Boarding Stay (${stayDays} Days, ${b.stayNights || 0} Nights)\nPet: ${b.petName || 'Pet'} (${b.petType || 'Pet'})\nCheck-In: ${b.checkInDate} ${b.checkInTime || ''}\nCheck-Out: ${b.actualCheckOutDate || b.checkOutDate} ${b.actualCheckOutTime || b.checkOutTime || ''}`,
          `${stayDays}`,
          dailyRate.toLocaleString('en-IN'),
          baseAmount.toLocaleString('en-IN'),
        ],
      ]
      if (foodCharge > 0) {
        items.push([
          '02',
          `Special Food Charge (${b.specialFoodProvider === 'pawpaw' ? 'Provided by Paw Paw' : 'Special Diet'})`,
          '1',
          foodCharge.toLocaleString('en-IN'),
          foodCharge.toLocaleString('en-IN'),
        ])
      }
      if (lateFee > 0) {
        items.push([
          '03',
          `Late Check-Out Fee (${b.actualCheckOutTime || ''})`,
          '1',
          lateFee.toLocaleString('en-IN'),
          lateFee.toLocaleString('en-IN'),
        ])
      }

      const finalTotal = Number(b.totalAmount || (baseAmount + foodCharge + lateFee))
      const finalCollected = Number(b.amountCollected || finalTotal)

      const boardingInvoiceData = {
        ...b,
        isBoarding: true,
        serviceName: 'Pet Boarding Stay',
        date: b.checkInDate,
        invoiceItems: items,
        totalAmount: finalTotal,
        amountCollected: finalCollected,
      }
      await downloadInvoicePdf(boardingInvoiceData, businessInfo || {})
      setInvoiceToastType('success')
      setInvoiceToast('Boarding invoice downloaded successfully!')
    } catch (err) {
      console.error('Boarding invoice download failed:', err)
      setInvoiceToastType('error')
      setInvoiceToast('Failed to download invoice. Please try again.')
    } finally {
      setDownloadingInvoiceId('')
    }
  }

  const fetchBoardings = async () => {
    if (!user?.uid) return
    setBoardingLoading(true)
    try {
      const q = query(collection(db, 'boardingBookings'), where('userId', '==', user.uid))
      const snap = await getDocs(q)
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      setBoardings(list)
    } catch {}
    setBoardingLoading(false)
  }

  useEffect(() => {
    if (user?.uid) {
      fetchBoardings()
    }
  }, [user])

  const cancelBoardingBooking = async () => {
    if (!boardingCancelTarget || !boardingCancelReason.trim()) return
    setCancellingBoardingId(boardingCancelTarget.id)
    try {
      const patch = {
        status: 'cancelled',
        cancelledBy: 'user',
        cancelledAt: serverTimestamp(),
        cancellationReason: boardingCancelReason.trim(),
        updatedAt: serverTimestamp(),
      }
      await setDoc(doc(db, 'boardingBookings', boardingCancelTarget.id), patch, { merge: true })
      setBoardings(prev => prev.map(b => b.id === boardingCancelTarget.id ? { ...b, ...patch, cancelledAt: new Date(), updatedAt: new Date() } : b))
      await sendNotification('', {
        userEmail: ADMIN_EMAIL || '',
        toAdmin: true,
        title: 'Pet Boarding Cancelled by Customer',
        message: `Boarding request for ${boardingCancelTarget.petName} was cancelled by ${boardingCancelTarget.ownerName}. Reason: ${boardingCancelReason.trim()}`,
        type: 'boarding_cancelled',
        bookingId: boardingCancelTarget.id,
        actionUrl: '/admin/boarding',
      })
      setCancelToast('Boarding reservation cancelled successfully.')
      setBoardingCancelTarget(null)
      setBoardingCancelReason('')
    } catch (err) {
      alert('Could not cancel boarding reservation. Please try again.')
    }
    setCancellingBoardingId('')
  }

  const fetchWalkings = async () => {
    if (!user?.uid) return
    setWalkingLoading(true)
    try {
      const q = query(collection(db, 'walkingBookings'), where('userId', '==', user.uid))
      const snap = await getDocs(q)
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      setWalkings(list)
    } catch {}
    setWalkingLoading(false)
  }

  useEffect(() => {
    if (user?.uid) {
      fetchWalkings()
    }
  }, [user])

  const cancelWalkingBooking = async () => {
    if (!walkingCancelTarget || !walkingCancelReason.trim()) return
    setCancellingWalkingId(walkingCancelTarget.id)
    try {
      const patch = {
        status: 'cancelled',
        cancelledBy: 'user',
        cancelledAt: serverTimestamp(),
        cancellationReason: walkingCancelReason.trim(),
        updatedAt: serverTimestamp(),
      }
      await setDoc(doc(db, 'walkingBookings', walkingCancelTarget.id), patch, { merge: true })
      setWalkings(prev => prev.map(w => w.id === walkingCancelTarget.id ? { ...w, ...patch, cancelledAt: new Date(), updatedAt: new Date() } : w))
      await sendNotification('', {
        userEmail: ADMIN_EMAIL || '',
        toAdmin: true,
        title: 'Pet Walking Cancelled by Customer',
        message: `Walking request for ${walkingCancelTarget.petName} on ${walkingCancelTarget.walkingDate} was cancelled by ${walkingCancelTarget.ownerName}. Reason: ${walkingCancelReason.trim()}`,
        type: 'walking_cancelled',
        bookingId: walkingCancelTarget.id,
        actionUrl: '/admin/walking',
      })
      setCancelToast('Pet walking booking cancelled successfully.')
      setWalkingCancelTarget(null)
      setWalkingCancelReason('')
    } catch (err) {
      alert('Could not cancel walking booking. Please try again.')
    }
    setCancellingWalkingId('')
  }

  useEffect(() => {
    fetchWalkingSettings(db).then(setWalkingSettings).catch(() => {})
  }, [])

  useEffect(() => {
    if (!walkingRescheduleTarget?.id || !walkingRescheduleDate) {
      setWalkingRescheduleBookedSlots([])
      return
    }
    let ignore = false
    async function fetchBookedWalkingSlots() {
      try {
        const q = query(
          collection(db, 'walkingBookings'),
          where('walkingDate', '==', walkingRescheduleDate)
        )
        const snap = await getDocs(q)
        const counts = {}
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(item => item.id !== walkingRescheduleTarget.id && (item.status || '') !== 'cancelled')
          .forEach(item => {
            const s = item.walkingSlot || item.slot
            if (s) counts[s] = (counts[s] || 0) + 1
          })
        const cap = Math.max(1, Number(walkingSettings?.maxCapacityPerSlot || 2))
        if (!ignore) {
          setWalkingRescheduleBookedSlots(
            Object.entries(counts).filter(([, count]) => count >= cap).map(([slot]) => slot)
          )
        }
      } catch {
        if (!ignore) setWalkingRescheduleBookedSlots([])
      }
    }
    fetchBookedWalkingSlots()
    return () => { ignore = true }
  }, [walkingRescheduleTarget?.id, walkingRescheduleDate, walkingSettings?.maxCapacityPerSlot])

  const openWalkingRescheduleModal = (booking) => {
    setWalkingRescheduleTarget(booking)
    setWalkingRescheduleDate(booking.walkingDate || booking.date || '')
    setWalkingRescheduleSlot(booking.walkingSlot || booking.slot || '')
    setWalkingRescheduleBookedSlots([])
  }

  const confirmWalkingReschedule = async () => {
    if (!walkingRescheduleTarget || !walkingRescheduleDate || !walkingRescheduleSlot) return
    const prevDate = walkingRescheduleTarget.walkingDate || walkingRescheduleTarget.date || ''
    const prevSlot = walkingRescheduleTarget.walkingSlot || walkingRescheduleTarget.slot || ''
    if (walkingRescheduleDate === prevDate && walkingRescheduleSlot === prevSlot) {
      setRescheduleToast('Cannot reschedule to the same slot. Please select a different slot.')
      return
    }

    setReschedulingWalkingId(walkingRescheduleTarget.id)
    try {
      const patch = {
        date: walkingRescheduleDate,
        walkingDate: walkingRescheduleDate,
        slot: walkingRescheduleSlot,
        walkingSlot: walkingRescheduleSlot,
        customTimeRequested: '',
        customTimeNote: '',
        updatedAt: serverTimestamp(),
        rescheduledAt: serverTimestamp(),
        rescheduledBy: 'user',
      }
      await setDoc(doc(db, 'walkingBookings', walkingRescheduleTarget.id), patch, { merge: true })
      setWalkings(prev => prev.map(w => w.id === walkingRescheduleTarget.id ? { ...w, ...patch, updatedAt: new Date(), rescheduledAt: new Date() } : w))
      if (selectedWalking && selectedWalking.id === walkingRescheduleTarget.id) {
        setSelectedWalking(prev => ({ ...prev, ...patch }))
      }
      await sendNotification('', {
        userEmail: ADMIN_EMAIL || '',
        toAdmin: true,
        title: 'Pet Walking Rescheduled by Customer',
        message: `Walking request for ${walkingRescheduleTarget.petName || walkingRescheduleTarget.dogName || 'Dog'} was rescheduled to ${walkingRescheduleDate} at ${walkingRescheduleSlot} by ${walkingRescheduleTarget.ownerName || 'Customer'}.`,
        type: 'walking_rescheduled',
        bookingId: walkingRescheduleTarget.id,
        actionUrl: '/admin/walking',
      })
      setRescheduleToast('Pet walking session rescheduled successfully.')
      setWalkingRescheduleTarget(null)
      setWalkingRescheduleDate('')
      setWalkingRescheduleSlot('')
    } catch (err) {
      alert('Could not reschedule walking appointment. Please try again.')
    } finally {
      setReschedulingWalkingId('')
    }
  }

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
    async function loadCatalog() {
      try {
        const [packagesSnap, detailsSnap] = await Promise.all([
          getDocs(collection(db, 'packages')),
          getDocs(collection(db, 'serviceDetails')),
        ])
        const details = {}
        detailsSnap.docs.forEach(docItem => {
          details[docItem.id] = { id: docItem.id, ...docItem.data() }
        })
        setServiceDetails(details)
        setPackages(packagesSnap.docs.map(docItem => ({ id: docItem.id, ...docItem.data() })).filter(pkg => pkg.active !== false))
      } catch {}
    }
    loadCatalog()
  }, [])

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

  const visibleServices = useMemo(() => buildServiceCatalog(serviceDetails), [serviceDetails])

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

  const openEditAppointment = (booking) => {
    setEditingAppointmentId(booking.id)
    setEditServiceIds(serviceIdsFor(booking))
    setEditPackageIds(Array.isArray(booking.selectedPackages) ? booking.selectedPackages : [])
    setEditBookingType(booking.bookingType || 'store')
    // Only prefill address for home visits. Prevent carrying stored address into store bookings.
    setEditAddress((booking.bookingType || 'store') === 'home' ? (booking.address || '') : '')
    // Open full edit form overlay
    setEditFullOpen(true)
    // push history state so mobile back button closes the form
    try {
      window.history.pushState({ myBookingsEdit: booking.id }, '')
    } catch (e) {}
  }

  // Fetch user profile addresses for autofill/selection
  useEffect(() => {
    let ignore = false
    async function fetchProfile() {
      try {
        if (!user?.uid) return
        const snap = await getDocs(query(collection(db, 'profiles'), where('__name__', '==', user.uid)))
        if (!snap || !snap.docs || snap.docs.length === 0) return
        const data = snap.docs[0].data()
        const profileAddresses = Array.isArray(data.addresses) && data.addresses.length ? data.addresses : []
        const normalized = profileAddresses.length ? profileAddresses : data.address ? [{ id: `address-${Date.now()}`, type: 'Home', address: data.address, isDefault: true }] : []
        if (!ignore) setProfileAddresses(normalized)
      } catch (err) {}
    }
    fetchProfile()
    return () => { ignore = true }
  }, [user?.uid])

  // Handle browser back button to close the edit overlay
  useEffect(() => {
    if (!editFullOpen) return undefined
    const onPop = () => {
      setEditFullOpen(false)
      setEditingAppointmentId(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [editFullOpen])

  // Prevent body scrolling while full-edit overlay is open
  useEffect(() => {
    if (!editFullOpen) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev || '' }
  }, [editFullOpen])

  // Autofill default profile address when switching to home visit
  useEffect(() => {
    if (editBookingType !== 'home') return
    if (String(editAddress || '').trim()) return
    const def = profileAddresses.find(a => a.isDefault) || profileAddresses[0]
    if (def) setEditAddress(def.address || '')
  }, [editBookingType, profileAddresses])

  const selectedEditServices = visibleServices.filter(service => editServiceIds.includes(service.id))
  const selectedEditPackages = packages.filter(pkg => editPackageIds.includes(pkg.id))

  const editServicePriceRange = () => selectedEditServices.reduce((total, service) => {
    const range = getPriceRange(service.price)
    const fallback = Number(service.basePrice || 0)
    const min = range.min || fallback
    const max = range.max || min
    return { min: total.min + min, max: total.max + max }
  }, { min: 0, max: 0 })

  const editPackagePriceRange = () => selectedEditPackages.reduce((total, pkg) => {
    const range = getPackagePriceRange(pkg)
    return { min: total.min + range.min, max: total.max + (range.max || range.min) }
  }, { min: 0, max: 0 })

  const editServiceTotal = () => editServicePriceRange().min + editPackagePriceRange().min
  const editVisitCharge = () => {
    if (!bookingSettings?.fixedVisitCharges) return 0
    const raw = editBookingType === 'home' ? bookingSettings.homeVisitCharge : bookingSettings.centerVisitCharge
    return Number(raw || 0) || 0
  }
  const editEstimatedTotal = () => editServiceTotal() + editVisitCharge()
  const editEstimatedTotalMax = () => editServicePriceRange().max + editPackagePriceRange().max + editVisitCharge()
  const editTotalPrice = () => {
    const min = editEstimatedTotal()
    const max = editEstimatedTotalMax()
    if (min > 0 && max > min) return `Rs ${min} - Rs ${max}+`
    return min > 0 ? `Rs ${min}+` : ''
  }

  const saveEditAppointment = async () => {
    if (!selectedBooking || !editingAppointmentId || savingEdit) return
    if (editServiceIds.length === 0 && editPackageIds.length === 0) return
    if (editBookingType === 'home' && !String(editAddress || '').trim()) return

    setSavingEdit(true)
    try {
      const nextServiceNames = selectedEditServices.map(service => service.name)
      const nextPackageNames = selectedEditPackages.map(pkg => pkg.name)
      const patch = {
        serviceId: editServiceIds[0] || '',
        serviceIds: editServiceIds,
        serviceNames: nextServiceNames,
        selectedPackages: editPackageIds,
        packageNames: nextPackageNames,
        serviceName: [...nextServiceNames, ...nextPackageNames].filter(Boolean).join(', ') || selectedBooking.serviceName || 'Appointment',
        bookingType: editBookingType,
        // Clear stored address when switching to In Store
        address: editBookingType === 'home' ? editAddress : '',
        serviceTotal: editServiceTotal(),
        visitCharge: editVisitCharge(),
        estimatedTotal: editEstimatedTotal(),
        estimatedTotalMax: editEstimatedTotalMax(),
        updatedAt: serverTimestamp(),
      }
      await setDoc(doc(db, 'bookings', selectedBooking.id), patch, { merge: true })
      const localPatch = { ...patch, updatedAt: new Date() }
      setBookings(prev => prev.map(item => item.id === selectedBooking.id ? { ...item, ...localPatch } : item))
      setSelectedBooking(prev => prev?.id === selectedBooking.id ? { ...prev, ...localPatch } : prev)
      setEditingAppointmentId(null)
      setRescheduleToast('Appointment updated successfully.')
      // close full edit overlay if open by navigating back
      if (editFullOpen) {
        try { window.history.back() } catch (e) { setEditFullOpen(false) }
      }
    } catch (err) {
      console.error('FIREBASE ERROR:', err)
      alert('Could not update booking. Please try again.')
    }
    setSavingEdit(false)
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
      await sendNotification('', {
        userEmail: ADMIN_EMAIL || '',
        toAdmin: true,
        title: 'Appointment rescheduled',
        message: `${appointmentTitle(rescheduleTarget)} was moved from ${previousDate} at ${formatSlot(previousSlot)} to ${rescheduleDate} at ${formatSlot(rescheduleSlot)}.`,
        type: 'rescheduled',
        bookingId: rescheduleTarget.id,
        actionUrl: `/admin/bookings/${rescheduleTarget.id}`,
      })
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
      await sendNotification('', {
        userEmail: ADMIN_EMAIL || '',
        toAdmin: true,
        title: 'Appointment cancelled',
        message: `${appointmentTitle(booking)} on ${booking.date} at ${formatSlot(booking.slot)} - Appointment cancelled by user. Reason: ${cleanReason}`,
        type: 'cancelled',
        bookingId: booking.id,
        actionUrl: `/admin/bookings/${booking.id}`,
      })
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
      {invoiceToast && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300, marginTop: '144px' }}>
          <Toast message={invoiceToast} type={invoiceToastType} onClose={() => setInvoiceToast('')} />
        </div>
      )}
      <div className="my-bookings-shell">
        <div className="my-bookings-header">
          <div className="my-bookings-title-group">
            <PawPrint size={20} className="my-bookings-paw-icon" />
            <div>
              <h1>My Bookings</h1>
              <p>{domainTab === 'walking' ? `${walkings.length} total dog walk${walkings.length !== 1 ? 's' : ''}` : domainTab === 'boarding' ? `${boardings.length} total boarding stay${boardings.length !== 1 ? 's' : ''}` : `${bookings.length} total appointment${bookings.length !== 1 ? 's' : ''}`}</p>
            </div>
          </div>
          <Link to={domainTab === 'walking' ? "/book-walking" : domainTab === 'boarding' ? "/boarding" : "/book"} className="btn btn-primary my-bookings-new">
            <Plus size={16} /> {domainTab === 'walking' ? 'Book a Walk' : domainTab === 'boarding' ? 'New Boarding Stay' : 'New Grooming'}
          </Link>
        </div>

        {/* Domain Switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '22px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setDomainTab('grooming')}
            style={{
              padding: '9px 16px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              border: `1.5px solid ${domainTab === 'grooming' ? 'var(--accent)' : 'var(--border)'}`,
              background: domainTab === 'grooming' ? 'var(--accent-bg)' : 'var(--surface)',
              color: domainTab === 'grooming' ? 'var(--accent)' : 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Scissors size={14} /> Grooming ({bookings.length})
          </button>
          <button
            type="button"
            onClick={() => setDomainTab('boarding')}
            style={{
              padding: '9px 16px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              border: `1.5px solid ${domainTab === 'boarding' ? 'var(--accent)' : 'var(--border)'}`,
              background: domainTab === 'boarding' ? 'var(--accent-bg)' : 'var(--surface)',
              color: domainTab === 'boarding' ? 'var(--accent)' : 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Building2 size={14} /> Pet Boarding ({boardings.length})
          </button>
          <button
            type="button"
            onClick={() => setDomainTab('walking')}
            style={{
              padding: '9px 16px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              border: `1.5px solid ${domainTab === 'walking' ? 'var(--accent)' : 'var(--border)'}`,
              background: domainTab === 'walking' ? 'var(--accent-bg)' : 'var(--surface)',
              color: domainTab === 'walking' ? 'var(--accent)' : 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Footprints size={14} /> Dog Walking ({walkings.length})
          </button>
        </div>

        {domainTab === 'boarding' ? (
          <div>
            {/* Boarding Stats */}
            <div className="my-bookings-stats">
              <div className="my-bookings-stat-card">
                <span>Total Stays</span>
                <strong>{boardings.length}</strong>
              </div>
              <div className="my-bookings-stat-card">
                <span>Pending Review</span>
                <strong style={{ color: '#f59e0b' }}>{boardings.filter(b => b.status === 'pending').length}</strong>
              </div>
              <div className="my-bookings-stat-card">
                <span>Confirmed</span>
                <strong style={{ color: 'var(--accent)' }}>{boardings.filter(b => b.status === 'confirmed').length}</strong>
              </div>
              <div className="my-bookings-stat-card">
                <span>Checked In</span>
                <strong style={{ color: '#3b82f6' }}>{boardings.filter(b => b.status === 'checked_in').length}</strong>
              </div>
            </div>

            {boardingLoading ? (
              <Spinner text="Loading boarding reservations..." />
            ) : boardings.length === 0 ? (
              <div className="my-bookings-empty" style={{ padding: '48px 20px', textAlign: 'center', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <Building2 size={36} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
                <p style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)', margin: '0 0 6px' }}>No boarding stays found</p>
                <span style={{ color: 'var(--muted)', fontSize: '13px', display: 'block', marginBottom: '18px' }}>Book your pet a cozy stay while you travel.</span>
                <Link to="/boarding" className="btn btn-primary">Book Pet Boarding</Link>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {boardings.map(b => (
                  <div
                    key={b.id}
                    className="my-boarding-card"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(212,175,55,0.04))',
                      border: '1px solid var(--border)',
                      borderRadius: '16px',
                      padding: '16px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                        {b.petPhotoUrl ? (
                          <img src={b.petPhotoUrl} alt={b.petName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
                        ) : (
                          <PawPrint size={20} />
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
                        <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 700, marginTop: '2px' }}>
                          {b.stayDays || 1} Day(s) ({b.stayNights || 0} Nights) · ₹{money(b.totalAmount || (Number(b.estimatedTotal || 0) + Number(b.specialFoodCharge || 0) + Number(b.lateCheckOutCharge || 0)))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Stay Dates</div>
                      <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                        <span>{formatBoardingDate(b.checkInDate)} → {formatBoardingDate(b.actualCheckOutDate || b.checkOutDate)}</span>
                        {b.actualCheckOutDate && b.actualCheckOutDate !== b.checkOutDate && (
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(217, 119, 6, 0.15)', color: '#d97706', fontWeight: 700 }}>
                            (Actual)
                          </span>
                        )}
                      </div>
                      {(b.actualCheckOutTime || b.checkOutTime) && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
                          Check-out: <span style={{ color: b.actualCheckOutTime ? '#d97706' : 'var(--text)', fontWeight: 600 }}>{b.actualCheckOutTime || b.checkOutTime}</span>
                          {b.actualCheckOutTime && (
                            <span style={{ marginLeft: '4px', fontSize: '10px', color: '#d97706', fontWeight: 700 }}>(Actual)</span>
                          )}
                        </div>
                      )}
                      {Number(b.lateCheckOutCharge || 0) > 0 && (
                        <div style={{ fontSize: '11px', color: '#d97706', fontWeight: 600, marginTop: '2px' }}>
                          Late check-out: +₹{money(b.lateCheckOutCharge)}
                        </div>
                      )}
                    </div>

                    <div className="my-booking-row-actions boarding-card-actions" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setSelectedBoarding(b)}
                        className="my-booking-card-btn secondary"
                      >
                        View Details
                      </button>
                      {(b.status === 'checked_out' || b.status === 'completed') && (
                        <button
                          type="button"
                          onClick={() => {
                            navigate(getBoardingRebookUrl(b), { state: { rebookBooking: b } })
                          }}
                          className="my-booking-card-btn primary rebook"
                        >
                          <RotateCcw size={12} /> Re-book
                        </button>
                      )}
                      {allowInvoice && (b.status === 'checked_out' || b.status === 'completed') && (
                        <button
                          type="button"
                          onClick={() => handleDownloadBoardingInvoice(b)}
                          disabled={downloadingInvoiceId === b.id}
                          className="my-booking-card-btn invoice"
                          title="Download PDF Invoice"
                        >
                          <FileText size={12} /> {downloadingInvoiceId === b.id ? 'Downloading...' : 'Invoice'}
                        </button>
                      )}
                      {(b.status === 'pending' || b.status === 'confirmed') && (
                        <button
                          type="button"
                          onClick={() => { setBoardingCancelTarget(b); setBoardingCancelReason('') }}
                          className="my-booking-card-btn cancel"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : domainTab === 'walking' ? (
          <div>
            {/* Walking Stats */}
            <div className="my-bookings-stats">
              <div className="my-bookings-stat-card">
                <span>Total Walks</span>
                <strong>{walkings.length}</strong>
              </div>
              <div className="my-bookings-stat-card">
                <span>Pending Review</span>
                <strong style={{ color: '#f59e0b' }}>{walkings.filter(w => w.status === 'pending').length}</strong>
              </div>
              <div className="my-bookings-stat-card">
                <span>Confirmed</span>
                <strong style={{ color: 'var(--accent)' }}>{walkings.filter(w => w.status === 'confirmed').length}</strong>
              </div>
              <div className="my-bookings-stat-card">
                <span>Completed</span>
                <strong style={{ color: '#10b981' }}>{walkings.filter(w => w.status === 'completed').length}</strong>
              </div>
            </div>

            {walkingLoading ? (
              <Spinner text="Loading walking appointments..." />
            ) : walkings.length === 0 ? (
              <div className="my-bookings-empty" style={{ padding: '48px 20px', textAlign: 'center', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <Footprints size={36} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
                <p style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)', margin: '0 0 6px' }}>No dog walks booked yet</p>
                <span style={{ color: 'var(--muted)', fontSize: '13px', display: 'block', marginBottom: '18px' }}>Schedule daily morning or evening walks for your pooch.</span>
                <Link to="/book-walking" className="btn btn-primary">Book a Walk</Link>
              </div>
            ) : (
              <div className="my-bookings-list">
                {walkings.map(w => {
                  const petName = w.petName || w.dogName || 'Dog'
                  const petBreed = w.petBreed || w.breed || 'Dog'
                  const walkDate = w.walkingDate || w.date || ''
                  const walkSlot = w.walkingSlot || w.slot || 'Custom Timing'
                  const duration = w.durationMinutes || w.duration || 30
                  const address = w.pickupAddress || w.address || ''
                  const price = w.totalPrice || 199
                  const customTime = w.customTimeRequested || w.customTimeNote || ''
                  const wpMsg = buildWalkingWhatsAppMessage(w, businessInfo?.name || shopName)
                  const wpUrl = `https://wa.me/${(adminWhatsappNumber || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(wpMsg)}`

                  return (
                    <div
                      key={w.id}
                      className="my-booking-row"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if (e.target.closest && e.target.closest('button, a')) return
                        setSelectedWalking(w)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedWalking(w)
                        }
                      }}
                    >
                      <div className="my-booking-row-top">
                        <div className="my-booking-date">
                          <strong><Calendar size={12} /> {formatBoardingDate(walkDate)}</strong>
                          <small><Clock size={12} /> {walkSlot}</small>
                        </div>
                        <div className="my-booking-badges">
                          <span className={`badge ${STATUS_BADGE[w.status] || 'badge-pending'} my-booking-status`}>
                            {statusLabel(w.status)}
                          </span>
                          <span className="badge" style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
                            {duration}m Walk
                          </span>
                        </div>
                      </div>

                      <div className="my-booking-row-body">
                        <div className="my-booking-main-row">
                          <div className="my-booking-pet-thumb placeholder" style={{ background: 'var(--accent-bg)', color: 'var(--accent)', overflow: 'hidden' }}>
                            {w.petPhotoUrl || w.photoUrl ? (
                              <img src={w.petPhotoUrl || w.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <Footprints size={18} />
                            )}
                          </div>
                          <div className="my-booking-main-copy">
                            <strong>{petName} ({petBreed})</strong>
                            <small title={address}>
                              <MapPin size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> {address ? (address.length > 45 ? `${address.slice(0, 45)}...` : address) : (w.area || 'Dhayari')}
                            </small>
                            <div className="my-booking-row-meta">
                              <span>Area: {w.area || 'Dhayari'}</span>
                              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                                ₹{money(price)}
                              </span>
                              {customTime && (
                                <span style={{ color: '#d97706', fontSize: '11px', fontWeight: 600 }}>
                                  (Custom: {customTime})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="my-booking-row-actions" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="my-booking-card-btn details"
                          onClick={() => setSelectedWalking(w)}
                        >
                          Details
                        </button>

                        {(w.status === 'pending' || w.status === 'under_review' || !w.status) && (
                          <button
                            type="button"
                            className="my-booking-card-btn reschedule"
                            onClick={() => openWalkingRescheduleModal(w)}
                          >
                            <Clock size={12} /> Reschedule
                          </button>
                        )}

                        {(w.status === 'pending' || w.status === 'confirmed') && (
                          <button
                            type="button"
                            className="my-booking-card-btn cancel"
                            onClick={() => {
                              setWalkingCancelTarget(w)
                              setWalkingCancelReason('')
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div>
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
                          <span className={booking.status === 'completed' ? 'meta-paid' : ''}>
                            {booking.status === 'completed'
                              ? `Paid: ₹${money(booking.amountCollected || booking.estimatedTotal)}`
                              : `Est. total: ${formatBookingEstimate(booking)}`
                            }
                          </span>
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

                  {/* Dedicated Action Bar */}
                  <div className="my-booking-row-actions" onClick={event => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setSelectedBooking(booking)}
                      className="my-booking-card-btn secondary"
                    >
                      View Details
                    </button>
                    {booking.status === 'completed' && (
                      <button
                        type="button"
                        className="my-booking-card-btn primary rebook"
                        onClick={() => navigate(getRebookUrl(booking))}
                        title={`Book again for ${booking.petName || 'your pet'}`}
                      >
                        <RotateCcw size={12} />
                        <span>Re-book</span>
                      </button>
                    )}
                    {allowInvoice && booking.status === 'completed' && (
                      <button
                        type="button"
                        className="my-booking-card-btn invoice"
                        onClick={() => handleDownloadGroomingInvoice(booking)}
                        disabled={downloadingInvoiceId === booking.id}
                        title="Download Invoice PDF"
                      >
                        <FileText size={12} />
                        <span>{downloadingInvoiceId === booking.id ? 'Downloading...' : 'Invoice'}</span>
                      </button>
                    )}
                    {canRescheduleBooking(booking) && (
                      <button
                        type="button"
                        className="my-booking-card-btn reschedule"
                        onClick={() => openRescheduleModal(booking)}
                        disabled={reschedulingId === booking.id}
                      >
                        <Clock size={12} />
                        <span>Reschedule</span>
                      </button>
                    )}
                    {canCancelBooking(booking, bookingSettings) && (
                      <button
                        type="button"
                        className="my-booking-card-btn cancel"
                        disabled={cancellingId === booking.id}
                        onClick={() => { setCancelReason(''); setCancelTarget(booking) }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
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

            {selectedBooking && (() => {
        const selectedServices = serviceNamesFor(selectedBooking)
        const selectedPackages = Array.isArray(selectedBooking.packageNames) && selectedBooking.packageNames.length
          ? selectedBooking.packageNames
          : (selectedBooking.packageName ? [selectedBooking.packageName] : [])
        const hasServicesOrPackages = selectedServices.length > 0 || selectedPackages.length > 0
        const isCompleted = selectedBooking.status === 'completed'
        const isCancelled = selectedBooking.status === 'cancelled'
        const isPending = selectedBooking.status === 'pending'
        const isConfirmed = selectedBooking.status === 'confirmed'
        const canResched = canRescheduleBooking(selectedBooking)
        const canCancel = canCancelBooking(selectedBooking, bookingSettings)

        return (
          <div className="my-booking-modal-overlay boarding-modal-overlay" onClick={() => setSelectedBooking(null)}>
            <div className="boarding-details-modal grooming-details-modal" onClick={event => event.stopPropagation()}>
              
              {/* Modal Header */}
              <div className="details-modal-header">
                <div className="details-header-top-row">
                  <h2 className="details-title">Grooming Appointment</h2>

                  <div className="header-actions-row">
                    {adminWhatsappNumber && (
                      <a
                        href={`https://wa.me/${adminWhatsappNumber}?text=${buildWhatsAppMessage(selectedBooking, shopName)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="details-header-btn whatsapp"
                        aria-label="Send details to WhatsApp"
                      >
                        <MessageCircle size={14} /> <span>WhatsApp</span>
                      </a>
                    )}

                    <button
                      type="button"
                      className="details-close-btn"
                      onClick={() => setSelectedBooking(null)}
                      aria-label="Close modal"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div className="details-header-sub-row">
                  <span className={`boarding-status-pill ${selectedBooking.status || 'pending'}`}>
                    {isCompleted && <CheckCircle2 size={13} />}
                    {isConfirmed && <Check size={13} />}
                    {isCancelled && <X size={13} />}
                    {isPending && <Clock size={13} />}
                    <span>{statusLabel(selectedBooking.status)}</span>
                  </span>
                  {(selectedBooking.rescheduleCount || 0) > 0 && (
                    <span className="boarding-status-pill rescheduled">
                      <Clock size={13} />
                      <span>Rescheduled</span>
                    </span>
                  )}
                  <span className="details-ref-id">{shortId(selectedBooking.id)}</span>
                </div>
              </div>

              {/* Modal Scrollable Body */}
              <div className="details-modal-body">

                {/* Card 1: Services & Appointment Overview */}
                <div className="boarding-section-card">
                  <div className="section-card-header">
                    <div className="section-icon-wrap scissors">
                      <Scissors size={16} />
                    </div>
                    <h3>Services & Appointment</h3>
                  </div>

                  {/* Highlighted Service / Package Tags */}
                  <div className="grooming-services-chips">
                    {selectedServices.map((name, i) => (
                      <span key={`srv-${i}`} className="grooming-service-tag">
                        <Scissors size={12} /> {name}
                      </span>
                    ))}
                    {selectedPackages.map((name, i) => (
                      <span key={`pkg-${i}`} className="grooming-package-tag">
                        <Package size={12} /> {name}
                      </span>
                    ))}
                    {!hasServicesOrPackages && (
                      <span className="grooming-service-tag">
                        <Scissors size={12} /> {selectedBooking.serviceName || appointmentTitle(selectedBooking)}
                      </span>
                    )}
                  </div>

                  <div className="detail-two-col-grid">
                    <div className="detail-item">
                      <span className="detail-label"><Calendar size={14} /> Date</span>
                      <strong className="detail-val">{selectedBooking.date || '-'}</strong>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label"><Clock size={14} /> Time Slot</span>
                      <strong className="detail-val">{formatSlot(selectedBooking.slot)}</strong>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label">
                        {(selectedBooking.bookingType || 'store') === 'home' ? <Home size={14} /> : <Store size={14} />} Visit Type
                      </span>
                      <strong className="detail-val">{getBookingTypeLabel(selectedBooking.bookingType || 'store')}</strong>
                    </div>

                    {(selectedBooking.assignedStaffName || selectedBooking.assignedStaff) ? (
                      <div className="detail-item">
                        <span className="detail-label"><User size={14} /> Assigned Groomer</span>
                        <strong className="detail-val">{selectedBooking.assignedStaffName || selectedBooking.assignedStaff}</strong>
                      </div>
                    ) : (
                      <div className="detail-item">
                        <span className="detail-label"><User size={14} /> Team Member</span>
                        <strong className="detail-val" style={{ color: 'var(--muted)', fontWeight: 600 }}>Assigned at Salon</strong>
                      </div>
                    )}

                    {selectedBooking.address && (
                      <div className="detail-item full">
                        <span className="detail-label"><MapPin size={14} /> Service Address</span>
                        <strong className="detail-val">{selectedBooking.address}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card 2: Pet Details */}
                <div className="boarding-section-card">
                  <div className="section-card-header">
                    <div className="section-icon-wrap paw">
                      <PawPrint size={16} />
                    </div>
                    <h3>Pet Details</h3>
                  </div>

                  <div className="pet-hero-row">
                    <div className="pet-avatar-large">
                      {petImageUrlFor(selectedBooking) ? (
                        <img
                          src={petImageUrlFor(selectedBooking)}
                          alt={selectedBooking.petName || 'Pet'}
                          onError={e => {
                            e.currentTarget.style.display = 'none'
                            if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex'
                          }}
                        />
                      ) : null}
                      <div className="avatar-fallback" style={{ display: petImageUrlFor(selectedBooking) ? 'none' : 'flex' }}>
                        <PawPrint size={24} />
                      </div>
                    </div>

                    <div className="pet-hero-info">
                      <strong className="pet-hero-name">{selectedBooking.petName || 'Pet'}</strong>
                      <div className="pet-hero-subtitle">
                        {selectedBooking.petBreed || selectedBooking.petType || 'Pet Details'}
                        {selectedBooking.petBreed && selectedBooking.petType ? ` (${selectedBooking.petType})` : ''}
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

                  {(selectedBooking.phone || selectedBooking.ownerName) && (
                    <div className="detail-two-col-grid">
                      {selectedBooking.ownerName && (
                        <div className="detail-item">
                          <span className="detail-label"><User size={14} /> Owner</span>
                          <strong className="detail-val">{selectedBooking.ownerName}</strong>
                        </div>
                      )}
                      {selectedBooking.phone && (
                        <div className="detail-item">
                          <span className="detail-label"><Phone size={14} /> Phone</span>
                          <strong className="detail-val">{selectedBooking.phone}</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card 3: Pricing & Estimate */}
                <div className="boarding-section-card">
                  <div className="section-card-header">
                    <div className="section-icon-wrap rupee">
                      <IndianRupee size={16} />
                    </div>
                    <h3>Pricing & Estimate</h3>
                  </div>

                  <div className="detail-two-col-grid">
                    {selectedBooking.originalSubtotal > 0 && selectedBooking.couponCode && (
                      <div className="detail-item">
                        <span className="detail-label">Subtotal</span>
                        <strong className="detail-val">Rs {money(selectedBooking.originalSubtotal)}</strong>
                      </div>
                    )}
                    {selectedBooking.couponCode && (
                      <div className="detail-item">
                        <span className="detail-label">Offer Applied</span>
                        <span className="grooming-package-tag" style={{ width: 'fit-content', padding: '3px 8px', fontSize: '11.5px' }}>
                          <Tag size={12} /> {selectedBooking.couponCode} (-Rs {money(selectedBooking.discountAmount || 0)})
                        </span>
                      </div>
                    )}
                    {selectedBooking.visitCharge > 0 && (
                      <div className="detail-item">
                        <span className="detail-label">Visit Charge</span>
                        <strong className="detail-val">Rs {money(selectedBooking.visitCharge)}</strong>
                      </div>
                    )}
                  </div>

                  <div className="grooming-price-banner">
                    <div className="grooming-price-label">
                      <span>Estimated Total</span>
                      {selectedBooking.estimatedTotalMax && Number(selectedBooking.estimatedTotalMax) > Number(selectedBooking.estimatedTotal || 0) && (
                        <div style={{ fontSize: '11px', color: '#9E721D', marginTop: '2px' }}>Final price depends on pet breed & size</div>
                      )}
                    </div>
                    <div className="grooming-price-value">
                      {formatBookingEstimate(selectedBooking)}
                    </div>
                  </div>

                  {isCompleted && (
                    <div className="grooming-payment-completed-row">
                      <div className="detail-item">
                        <span className="detail-label"><Receipt size={14} /> Payment Status</span>
                        <span className="boarding-status-pill completed" style={{ width: 'fit-content', marginTop: '3px' }}>
                          <CheckCircle2 size={12} /> Paid / Collected
                        </span>
                      </div>
                      <div className="detail-item" style={{ textAlign: 'right' }}>
                        <span className="detail-label" style={{ justifyContent: 'flex-end' }}>Amount Paid</span>
                        <strong className="detail-val" style={{ color: '#16A34A', fontSize: '16px' }}>
                          Rs {money(selectedBooking.amountPaid || selectedBooking.amountCollected || selectedBooking.finalAmount || selectedBooking.price || 0)}
                        </strong>
                      </div>
                    </div>
                  )}

                  {isCompleted && (selectedBooking.nextRecommendedDays || selectedBooking.nextRecommendedDate) && (
                    <div className="grooming-next-visit-pill">
                      <Sparkles size={15} style={{ color: '#2563EB', flexShrink: 0 }} />
                      <span>
                        Recommended next grooming: <strong>{selectedBooking.nextRecommendedDate ? selectedBooking.nextRecommendedDate : `in ${selectedBooking.nextRecommendedDays} days`}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Card 4: Before & After Photos */}
                {(selectedBooking.beforeImageUrl || selectedBooking.afterImageUrl) && (
                  <div className="boarding-section-card">
                    <div className="section-card-header">
                      <div className="section-icon-wrap camera">
                        <Camera size={16} />
                      </div>
                      <h3>Before & After</h3>
                    </div>

                    <div className="grooming-photos-grid">
                      {selectedBooking.beforeImageUrl && (
                        <button
                          type="button"
                          className="grooming-photo-card"
                          onClick={() => setPreviewImage({ url: selectedBooking.beforeImageUrl, label: 'Before' })}
                        >
                          <img src={selectedBooking.beforeImageUrl} alt="Before grooming" />
                          <span className="grooming-photo-tag">Before</span>
                        </button>
                      )}
                      {selectedBooking.afterImageUrl && (
                        <button
                          type="button"
                          className="grooming-photo-card"
                          onClick={() => setPreviewImage({ url: selectedBooking.afterImageUrl, label: 'After' })}
                        >
                          <img src={selectedBooking.afterImageUrl} alt="After grooming" />
                          <span className="grooming-photo-tag">After</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Card 5: Cancellation Notice */}
                {isCancelled && (
                  <div className="grooming-cancel-alert">
                    <AlertCircle size={18} className="alert-icon" />
                    <div>
                      <strong>Appointment Cancelled</strong>
                      <p>
                        Cancelled by: {selectedBooking.cancelledBy === 'admin' ? (shopName || 'Paw Paw Salon') : 'You'}
                        {selectedBooking.cancellationReason ? ` • "${selectedBooking.cancellationReason}"` : ''}
                      </p>
                    </div>
                  </div>
                )}

                {/* Card 6: Customer Notes */}
                {selectedBooking.notes && (
                  <div className="boarding-section-card">
                    <div className="section-card-header">
                      <div className="section-icon-wrap notes">
                        <FileText size={16} />
                      </div>
                      <h3>Special Notes</h3>
                    </div>
                    <div style={{ fontSize: '13.5px', color: '#4B382A', lineHeight: 1.5, background: '#FBF8F2', padding: '10px 14px', borderRadius: '10px', border: '1px solid #EFE6D8' }}>
                      {selectedBooking.notes}
                    </div>
                  </div>
                )}

              </div>

              {/* Modal Footer Actions */}
              <div className={`details-modal-footer ${(!canResched && !canCancel && !isPending) ? 'single-btn' : ''}`}>
                {isPending && (
                  <>
                    <button
                      type="button"
                      className="grooming-action-btn edit"
                      onClick={() => openEditAppointment(selectedBooking)}
                    >
                      <Scissors size={15} /> Edit
                    </button>
                    {canCancel && (
                      <button
                        type="button"
                        className="grooming-action-btn cancel"
                        disabled={cancellingId === selectedBooking.id}
                        onClick={() => { setCancelReason(''); setCancelTarget(selectedBooking) }}
                      >
                        <X size={15} /> {cancellingId === selectedBooking.id ? 'Cancelling...' : 'Cancel'}
                      </button>
                    )}
                  </>
                )}

                {isConfirmed && (
                  <>
                    {canResched && (
                      <button
                        type="button"
                        className="grooming-action-btn reschedule"
                        disabled={reschedulingId === selectedBooking.id}
                        onClick={() => openRescheduleModal(selectedBooking)}
                      >
                        <Clock size={15} /> Reschedule
                      </button>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        className="grooming-action-btn cancel"
                        disabled={cancellingId === selectedBooking.id}
                        onClick={() => { setCancelReason(''); setCancelTarget(selectedBooking) }}
                      >
                        <X size={15} /> Cancel Booking
                      </button>
                    )}
                    {!canResched && !canCancel && adminWhatsappNumber && (
                      <a
                        href={`https://wa.me/${adminWhatsappNumber}?text=${buildWhatsAppMessage(selectedBooking, shopName)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grooming-action-btn whatsapp"
                      >
                        <MessageCircle size={15} /> Chat with Salon
                      </a>
                    )}
                  </>
                )}

                {isCompleted && (
                  <>
                    <button
                      type="button"
                      className="grooming-action-btn primary"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelectedBooking(null)
                        navigate(getRebookUrl(selectedBooking))
                      }}
                    >
                      <RotateCcw size={15} /> Re-book
                    </button>
                    {allowInvoice && (
                      <button
                        type="button"
                        className="grooming-action-btn invoice"
                        style={{
                          background: 'rgba(16, 185, 129, 0.08)',
                          borderColor: 'rgba(16, 185, 129, 0.35)',
                          color: '#059669',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        disabled={downloadingInvoiceId === selectedBooking.id}
                        onClick={() => handleDownloadGroomingInvoice(selectedBooking)}
                      >
                        <FileText size={15} /> {downloadingInvoiceId === selectedBooking.id ? 'Downloading...' : 'Download Invoice'}
                      </button>
                    )}
                    {adminWhatsappNumber && (
                      <a
                        href={`https://wa.me/${adminWhatsappNumber}?text=${buildWhatsAppMessage(selectedBooking, shopName)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grooming-action-btn whatsapp"
                      >
                        <MessageCircle size={15} /> Contact Salon
                      </a>
                    )}
                  </>
                )}

                {isCancelled && (
                  <>
                    <Link
                      to="/services"
                      className="grooming-action-btn primary"
                      onClick={() => setSelectedBooking(null)}
                    >
                      <Scissors size={15} /> Book New
                    </Link>
                    {adminWhatsappNumber && (
                      <a
                        href={`https://wa.me/${adminWhatsappNumber}?text=${buildWhatsAppMessage(selectedBooking, shopName)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grooming-action-btn whatsapp"
                      >
                        <MessageCircle size={15} /> Chat on WA
                      </a>
                    )}
                  </>
                )}
              </div>

              {/* Full screen edit overlay (opened via Edit) */}
              {editingAppointmentId === selectedBooking.id && editFullOpen && (
                <div className="my-booking-edit-full-overlay" onClick={() => { try { window.history.back() } catch(e){ setEditFullOpen(false); setEditingAppointmentId(null) } }}>
                  <div className="my-booking-edit-full" onClick={e => e.stopPropagation()}>
                    <div className="my-booking-edit-full-head">
                      <button type="button" className="icon-btn" onClick={() => { try { window.history.back() } catch(e){ setEditFullOpen(false); setEditingAppointmentId(null) } }} aria-label="Back"><ChevronRight style={{ transform: 'rotate(180deg)' }} size={18} /></button>
                      <h3>Edit appointment</h3>
                    </div>
                    <div className="my-booking-edit-full-body">
                      <div style={{ marginBottom: 12 }}>
                        <label className="input-label">Services & Packages</label>
                        <details className="my-booking-dropdown">
                          <summary>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minWidth: 0 }}>
                              <div className="my-booking-dropdown-summary" title={(() => {
                                const names = []
                                selectedEditServices.forEach(s => names.push(s.name))
                                selectedEditPackages.forEach(p => names.push(p.name))
                                return names.join(', ')
                              })()}>
                                {(() => {
                                  const names = []
                                  selectedEditServices.forEach(s => names.push(s.name))
                                  selectedEditPackages.forEach(p => names.push(p.name))
                                  if (!names.length) return 'Edit Services / Packages'
                                  return names.join(', ')
                                })()}
                              </div>
                              <div className="my-booking-dropdown-toggle" aria-hidden>
                                <ChevronDown size={16} className="my-booking-dropdown-icon" />
                              </div>
                            </div>
                          </summary>
                          <div style={{ padding: '10px', display: 'grid', gap: '10px' }}>
                            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', background: 'var(--card)', maxHeight: '520px', overflow: 'auto' }}>
                              <div style={{ display: 'grid', gap: '10px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--muted)', marginBottom: '8px' }}>Services / Packages</div>
                                <div className="my-booking-checkbox-list" style={{ display: 'grid', gap: '4px' }}>
                                  {[...visibleServices.map(service => ({
                                    id: service.id,
                                    name: service.name,
                                    priceLabel: formatRangeLabel(getPriceRange(service.price || service.basePrice)) || (service.basePrice ? `Rs ${service.basePrice}` : ''),
                                    checked: editServiceIds.includes(service.id),
                                    onChange: () => setEditServiceIds(prev => prev.includes(service.id) ? prev.filter(id => id !== service.id) : [...prev, service.id]),
                                  })), ...packages.map(pkg => ({
                                    id: pkg.id,
                                    name: pkg.name,
                                    priceLabel: formatRangeLabel(getPackagePriceRange(pkg)) || (pkg.price ? String(pkg.price) : ''),
                                    checked: editPackageIds.includes(pkg.id),
                                    onChange: () => setEditPackageIds(prev => prev.includes(pkg.id) ? prev.filter(id => id !== pkg.id) : [...prev, pkg.id]),
                                  }))].map(item => (
                                    <label key={item.id} className="my-booking-checkbox-item" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 6px', justifyContent: 'space-between' }}>
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: '1 1 0', minWidth: 0 }}>
                                        <input type="checkbox" checked={item.checked} onChange={item.onChange} style={{ flexShrink: 0, marginTop: 4 }} />
                                        <span style={{ fontSize: '14px', flex: '1 1 0', minWidth: 0, wordBreak: 'break-word' }}>{item.name}</span>
                                      </div>
                                      <div style={{ color: 'var(--muted)', fontSize: '13px', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.priceLabel}</div>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </details>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label className="input-label">Visit Type</label>
                          <select className="input" value={editBookingType} onChange={(event) => setEditBookingType(event.target.value)}>
                            <option value="store">In Store</option>
                            <option value="home">Home Visit</option>
                          </select>
                        </div>
                        {editBookingType === 'home' && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label className="input-label">Address</label>
                            <div style={{ marginBottom: 8 }}>
                              {profileAddresses.length > 0 ? (
                                <select className="input" value={editAddress} onChange={(e) => setEditAddress(e.target.value)}>
                                  <option value="">Select address</option>
                                  {profileAddresses.map(a => (
                                    <option key={a.id} value={a.address}>{a.address}{a.isDefault ? ' (Default)' : ''}</option>
                                  ))}
                                </select>
                              ) : (
                                <select className="input" value={editAddress} onChange={(e) => setEditAddress(e.target.value)}>
                                  <option value="">No saved addresses</option>
                                </select>
                              )}
                            </div>
                            <textarea ref={editAddressRef} className="input" rows="3" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Enter your address for the home visit" />
                            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                              <button type="button" className="btn btn-ghost" onClick={() => { setEditAddress(''); setTimeout(() => editAddressRef.current?.focus(), 50) }}>Use custom</button>
                              <Link to="/profile" className="btn btn-ghost">Manage addresses</Link>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="my-booking-edit-summary" style={{ marginTop: 12 }}>
                        <span>Estimated Total</span>
                        <strong>{editTotalPrice() || 'Rs 0'}</strong>
                      </div>

                      <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-secondary" onClick={() => { try { window.history.back() } catch(e){ setEditFullOpen(false); setEditingAppointmentId(null) } }}>Back</button>
                        <button type="button" className="btn btn-primary" onClick={saveEditAppointment} disabled={savingEdit || (editServiceIds.length === 0 && editPackageIds.length === 0) || (editBookingType === 'home' && !String(editAddress || '').trim())}>
                          {savingEdit ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )
      })()}


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

      {/* Boarding Details Modal (Screenshot 1 Match) */}
      {selectedBoarding && (
        <div className="my-booking-modal-overlay boarding-modal-overlay" onClick={() => setSelectedBoarding(null)}>
          <div className="boarding-details-modal" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="details-modal-header">
              {/* Row 1: Title on left, actions on right */}
              <div className="details-header-top-row">
                <h2 className="details-title">Boarding Reservation</h2>

                <div className="header-actions-row">
                  {adminWhatsappNumber && (
                    <a
                      href={`https://wa.me/${adminWhatsappNumber}?text=${buildBoardingWhatsAppMessage(selectedBoarding, shopName)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="details-header-btn whatsapp"
                      aria-label="Send details to WhatsApp"
                    >
                      <MessageCircle size={14} /> <span>WhatsApp</span>
                    </a>
                  )}

                  <button
                    type="button"
                    className="details-close-btn"
                    onClick={() => setSelectedBoarding(null)}
                    aria-label="Close modal"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Row 2: Status badge and Reservation ID on the same line */}
              <div className="details-header-sub-row">
                <span className={`boarding-status-pill ${selectedBoarding.status || 'pending'}`}>
                  {selectedBoarding.status === 'checked_out' && <CheckCircle2 size={13} />}
                  {selectedBoarding.status === 'checked_in' && <LogIn size={13} />}
                  {selectedBoarding.status === 'confirmed' && <Check size={13} />}
                  {selectedBoarding.status === 'cancelled' && <X size={13} />}
                  <span>{statusLabel(selectedBoarding.status)}</span>
                </span>
                <span className="details-ref-id">{shortId(selectedBoarding.id)}</span>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="details-modal-body">
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
                    {selectedBoarding.petPhotoUrl ? (
                      <img
                        src={selectedBoarding.petPhotoUrl}
                        alt={selectedBoarding.petName}
                        onError={e => {
                          e.currentTarget.style.display = 'none'
                          if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex'
                        }}
                      />
                    ) : null}
                    <div className="avatar-fallback" style={{ display: selectedBoarding.petPhotoUrl ? 'none' : 'flex' }}>
                      <PawPrint size={24} />
                    </div>
                  </div>

                  <div className="pet-hero-info">
                    <strong className="pet-hero-name">{selectedBoarding.petName || 'Pet'}</strong>
                    <div className="pet-hero-subtitle">
                      {selectedBoarding.petType || 'Pet'} • {selectedBoarding.petBreed || 'Breed Not Specified'}
                    </div>

                    <div className="pet-pills-row">
                      {selectedBoarding.petGender && (
                        <span className="pet-pill">
                          <Users size={12} /> {selectedBoarding.petGender}
                        </span>
                      )}
                      {selectedBoarding.petDob && (
                        <span className="pet-pill">
                          <Calendar size={12} /> {formatPetAge(selectedBoarding.petDob)}
                        </span>
                      )}
                      {selectedBoarding.petWeight && (
                        <span className="pet-pill">
                          <Scale size={12} /> {selectedBoarding.petWeight} kg
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="detail-two-col-grid">
                  <div className="detail-item">
                    <span className="detail-label"><User size={14} /> Owner Name</span>
                    <strong className="detail-val">{selectedBoarding.ownerName || 'N/A'}</strong>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label"><ShieldCheck size={14} /> Emergency Contact</span>
                    <strong className="detail-val">
                      {selectedBoarding.emergencyContactPhone
                        ? `${selectedBoarding.emergencyContactName ? selectedBoarding.emergencyContactName + ' ' : ''}(${selectedBoarding.emergencyContactPhone})`
                        : 'None'}
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label"><Phone size={14} /> Phone Number</span>
                    <strong className="detail-val">{selectedBoarding.phone || 'N/A'}</strong>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label"><Mail size={14} /> Email</span>
                    <strong className="detail-val email">{selectedBoarding.userEmail || 'N/A'}</strong>
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
                      {selectedBoarding.vaccinationStatus || 'Fully Vaccinated'}
                    </span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label"><Calendar size={14} /> Last Vaccination / Notes</span>
                    <strong className="detail-val">{selectedBoarding.vaccinationNotes || 'None'}</strong>
                  </div>
                </div>

                <div className="detail-item full" style={{ marginTop: '12px' }}>
                  <span className="detail-label"><PlusSquare size={14} /> Medical Conditions / Medicines</span>
                  <strong className="detail-val">
                    {selectedBoarding.medicalConditions || selectedBoarding.medicines || selectedBoarding.allergies || 'No'}
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
                    <strong className="stay-val">{formatBoardingDate(selectedBoarding.checkInDate)}</strong>
                    <span className="stay-sub">{selectedBoarding.checkInTime || '10:00 AM'}</span>
                  </div>

                  <div className="stay-arrow">
                    <ArrowRight size={18} />
                  </div>

                  <div className="stay-banner-item">
                    <span className="stay-label">
                      <Calendar size={13} /> {selectedBoarding.actualCheckOutDate || selectedBoarding.actualCheckOutTime ? 'Actual Check-Out' : 'Check-Out'}
                    </span>
                    <strong className="stay-val">
                      {formatBoardingDate(selectedBoarding.actualCheckOutDate || selectedBoarding.checkOutDate)}
                    </strong>
                    <span className="stay-sub">
                      {selectedBoarding.actualCheckOutTime || selectedBoarding.checkOutTime || '11:00 PM'}
                      {selectedBoarding.actualCheckOutTime && (
                        <span style={{ color: '#d97706', fontWeight: 700, marginLeft: '4px' }}>
                          (Actual)
                        </span>
                      )}
                      {selectedBoarding.actualCheckOutDate && selectedBoarding.actualCheckOutDate !== selectedBoarding.checkOutDate && (
                        <span style={{ color: '#d97706', display: 'block', fontSize: '10px', fontWeight: 600 }}>
                          (Sched: {formatBoardingDate(selectedBoarding.checkOutDate)})
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="stay-banner-item total">
                    <span className="stay-label"><Moon size={13} /> Total Stay</span>
                    <strong className="stay-val duration">
                      {selectedBoarding.stayDays || 1} Days
                    </strong>
                    <span className="stay-sub">({selectedBoarding.stayNights || 0} Nights)</span>
                  </div>
                </div>

                {(selectedBoarding.actualCheckOutDate || selectedBoarding.actualCheckOutTime) && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(217, 119, 6, 0.08)',
                    border: '1px solid rgba(217, 119, 6, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: '12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309' }}>
                      <Clock size={15} />
                      <span>
                        <strong>Actual Check-Out Pick-up:</strong> {formatBoardingDate(selectedBoarding.actualCheckOutDate || selectedBoarding.checkOutDate)} at {selectedBoarding.actualCheckOutTime || selectedBoarding.checkOutTime || '11:00 PM'}
                      </span>
                    </div>
                    {selectedBoarding.actualCheckOutDate && selectedBoarding.actualCheckOutDate !== selectedBoarding.checkOutDate && (
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        (Scheduled: {formatBoardingDate(selectedBoarding.checkOutDate)})
                      </span>
                    )}
                  </div>
                )}

                {/* Hostel Drop-off & Pick-up Location */}
                <div style={{
                  marginTop: '12px',
                  background: 'var(--card-bg, #F9FAFB)',
                  border: '1px solid var(--border-color, #E5E7EB)',
                  borderRadius: '10px',
                  padding: '11px 13px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}>
                  <MapPin size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#C08820' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text, #1F2937)', marginBottom: '2px' }}>
                      Hostel Drop-off & Pick-up Location
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--muted, #4B5563)', lineHeight: 1.45, marginBottom: '6px' }}>
                      {selectedBoarding.hostelAddress || shopAddress || 'Paw Paw Pet Boarding Facility, Pune'}
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedBoarding.hostelAddress || shopAddress || 'Paw Paw Pet Boarding Facility, Pune')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '11.5px',
                        color: '#C08820',
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                    >
                      Get Directions / View on Google Maps →
                    </a>
                  </div>
                </div>

                <div className="billing-three-col-row">
                  <div className="billing-item">
                    <span className="billing-label"><Tag size={14} /> Daily Rate</span>
                    <strong className="billing-val">₹{money(selectedBoarding.dailyRate || 800)}</strong>
                  </div>

                  {Number(selectedBoarding.originalSubtotal || 0) > 0 && selectedBoarding.couponCode && (
                    <div className="billing-item">
                      <span className="billing-label"><Receipt size={14} /> Subtotal</span>
                      <strong className="billing-val">₹{money(selectedBoarding.originalSubtotal)}</strong>
                    </div>
                  )}

                  {selectedBoarding.couponCode && (
                    <div className="billing-item">
                      <span className="billing-label"><Tag size={14} /> Offer Applied</span>
                      <strong className="billing-val" style={{ color: '#10b981' }}>
                        {selectedBoarding.couponCode} (-₹{money(selectedBoarding.discountAmount)})
                      </strong>
                    </div>
                  )}

                  <div className="billing-item">
                    <span className="billing-label"><Receipt size={14} /> Estimated Total</span>
                    <strong className="billing-val estimated">₹{money(selectedBoarding.estimatedTotal)}</strong>
                  </div>

                  {Number(selectedBoarding.specialFoodCharge || 0) > 0 && (
                    <div className="billing-item">
                      <span className="billing-label"><Utensils size={14} /> Special Food Charge</span>
                      <strong className="billing-val" style={{ color: '#16a34a' }}>
                        +₹{money(selectedBoarding.specialFoodCharge)}
                      </strong>
                      <span style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '2px' }}>
                        {selectedBoarding.specialFoodChargeCollectedAt === 'check_in' ? 'Paid at Check-In' : 'Paid at Checkout'}
                      </span>
                    </div>
                  )}

                  {Number(selectedBoarding.lateCheckOutCharge || 0) > 0 && (
                    <div className="billing-item">
                      <span className="billing-label"><Clock size={14} /> Late Check-Out Fee</span>
                      <strong className="billing-val" style={{ color: '#d97706' }}>
                        +₹{money(selectedBoarding.lateCheckOutCharge)}
                      </strong>
                      <span style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '2px' }}>
                        {selectedBoarding.actualCheckOutTime
                          ? `Picked up at ${selectedBoarding.actualCheckOutTime}${selectedBoarding.actualCheckOutDate && selectedBoarding.actualCheckOutDate !== selectedBoarding.checkOutDate ? ` on ${formatBoardingDate(selectedBoarding.actualCheckOutDate)}` : ''} (after 11:00 PM)`
                          : 'Paid at Checkout (Picked up after 11 PM)'}
                      </span>
                    </div>
                  )}

                  {(Number(selectedBoarding.specialFoodCharge || 0) > 0 || Number(selectedBoarding.lateCheckOutCharge || 0) > 0) && (
                    <div className="billing-item">
                      <span className="billing-label"><Receipt size={14} /> Total Stay Amount</span>
                      <strong className="billing-val" style={{ color: 'var(--text)' }}>
                        ₹{money(selectedBoarding.totalAmount || (Number(selectedBoarding.estimatedTotal || 0) + Number(selectedBoarding.specialFoodCharge || 0) + Number(selectedBoarding.lateCheckOutCharge || 0)))}
                      </strong>
                    </div>
                  )}

                  <div className="billing-item">
                    <span className="billing-label"><Wallet size={14} /> Amount Paid</span>
                    <strong className="billing-val collected">₹{money(selectedBoarding.amountCollected || 0)}</strong>
                  </div>

                  <div className="billing-item">
                    <span className="billing-label"><Receipt size={14} /> Remaining Balance</span>
                    <strong className="billing-val" style={{ color: Math.max(0, (Number(selectedBoarding.totalAmount || (Number(selectedBoarding.estimatedTotal || 0) + Number(selectedBoarding.specialFoodCharge || 0) + Number(selectedBoarding.lateCheckOutCharge || 0)))) - Number(selectedBoarding.amountCollected || 0)) > 0 ? 'var(--accent)' : '#16a34a' }}>
                      ₹{money(Math.max(0, (Number(selectedBoarding.totalAmount || (Number(selectedBoarding.estimatedTotal || 0) + Number(selectedBoarding.specialFoodCharge || 0) + Number(selectedBoarding.lateCheckOutCharge || 0)))) - Number(selectedBoarding.amountCollected || 0)))}
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
                      {selectedBoarding.specialFoodRequired
                        ? 'Yes'
                        : (selectedBoarding.specialFoodRequired === false ? 'No (Regular food fine)' : (selectedBoarding.foodType || 'No'))}
                    </strong>
                  </div>

                  {selectedBoarding.specialFoodRequired && (
                    <div className="detail-item">
                      <span className="detail-label"><Users size={14} /> Special Food Provider</span>
                      <strong className="detail-val">
                        {selectedBoarding.specialFoodProvider === 'pawpaw'
                          ? 'Paw Paw will provide it'
                          : selectedBoarding.specialFoodProvider === 'customer'
                            ? 'Owner will provide (No extra charge)'
                            : (selectedBoarding.foodProvider || 'Owner')}
                      </strong>
                    </div>
                  )}

                  {selectedBoarding.specialFoodRequired && (
                    <div className="detail-item">
                      <span className="detail-label"><Receipt size={14} /> Special Food Charge</span>
                      <strong className="detail-val" style={{ color: Number(selectedBoarding.specialFoodCharge || 0) > 0 ? '#16a34a' : 'var(--text)' }}>
                        {Number(selectedBoarding.specialFoodCharge || 0) > 0
                          ? `₹${money(selectedBoarding.specialFoodCharge)} (${selectedBoarding.specialFoodChargeCollectedAt === 'check_in' ? 'Paid at Check-In' : selectedBoarding.specialFoodChargeCollectedAt === 'checkout' ? 'Paid at Checkout' : 'Confirmed by hostel'})`
                          : selectedBoarding.specialFoodProvider === 'customer'
                            ? '₹0 (Owner provides food)'
                            : 'Confirmed at check-in or checkout'}
                      </strong>
                    </div>
                  )}

                  <div className="detail-item">
                    <span className="detail-label"><Clock size={14} /> Feeding Schedule</span>
                    <strong className="detail-val">{selectedBoarding.feedingSchedule || 'Twice a day'}</strong>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label"><AlertCircle size={14} /> Food Allergies / Dislikes</span>
                    <strong className="detail-val">
                      {selectedBoarding.foodAllergies || selectedBoarding.allergies || 'None'}
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label"><Droplets size={14} /> Diet / Water Notes</span>
                    <strong className="detail-val">
                      {selectedBoarding.specialDietInstructions || selectedBoarding.waterInstructions || selectedBoarding.dietInstructions || 'None'}
                    </strong>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label"><PawPrint size={14} /> Walking Routine</span>
                    <strong className="detail-val">{selectedBoarding.walkingFrequency || '2 walks per day (Standard)'}</strong>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label"><Bed size={14} /> Sleeping Habits</span>
                    <strong className="detail-val">{selectedBoarding.sleepingHabits || 'None'}</strong>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label"><Footprints size={14} /> Toilet Habits</span>
                    <strong className="detail-val">{selectedBoarding.toiletHabits || 'Outdoor breaks'}</strong>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label"><Users size={14} /> Behaviour around pets</span>
                    <strong className="detail-val">{selectedBoarding.behaviorNotes || 'Friendly'}</strong>
                  </div>

                  <div className="detail-item full">
                    <span className="detail-label"><User size={14} /> Special Requests</span>
                    <strong className="detail-val">{selectedBoarding.additionalInstructions || 'None'}</strong>
                  </div>

                  <div className="detail-item full">
                    <span className="detail-label"><ShieldCheck size={14} /> Terms & Conditions</span>
                    <strong className="detail-val" style={{ color: selectedBoarding.termsAccepted ? '#16a34a' : 'var(--text)' }}>
                      {selectedBoarding.termsAccepted ? (
                        <>
                          ✓ Accepted & Agreed at Booking
                          {selectedBoarding.termsSnapshot?.length ? ` (${selectedBoarding.termsSnapshot.length} conditions)` : ''}
                        </>
                      ) : (
                        'Standard Paw Paw Boarding Terms'
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            {(() => {
              const isFinished = selectedBoarding.status === 'checked_out' || selectedBoarding.status === 'completed'
              const isPendingOrConfirmed = selectedBoarding.status === 'pending' || selectedBoarding.status === 'confirmed'
              const isCancelled = selectedBoarding.status === 'cancelled'
              const hasMultiple = isFinished && allowInvoice

              return (
                <div className={`details-modal-footer boarding-modal-footer ${!hasMultiple ? 'single-btn' : ''}`}>
                  {isFinished && (
                    <>
                      <button
                        type="button"
                        className="grooming-action-btn primary"
                        onClick={() => {
                          const target = selectedBoarding
                          setSelectedBoarding(null)
                          navigate(getBoardingRebookUrl(target), { state: { rebookBooking: target } })
                        }}
                      >
                        <RotateCcw size={15} /> Re-book
                      </button>
                      {allowInvoice && (
                        <button
                          type="button"
                          className="grooming-action-btn invoice"
                          disabled={downloadingInvoiceId === selectedBoarding.id}
                          onClick={() => handleDownloadBoardingInvoice(selectedBoarding)}
                        >
                          <FileText size={15} /> {downloadingInvoiceId === selectedBoarding.id ? 'Downloading...' : 'Download Invoice'}
                        </button>
                      )}
                    </>
                  )}

                  {isPendingOrConfirmed && (
                    <button
                      type="button"
                      className="grooming-action-btn cancel"
                      onClick={() => {
                        const target = selectedBoarding
                        setBoardingCancelTarget(target)
                        setBoardingCancelReason('')
                      }}
                    >
                      <X size={15} /> Cancel Reservation
                    </button>
                  )}

                  {isCancelled && (
                    <button
                      type="button"
                      className="grooming-action-btn primary"
                      onClick={() => {
                        const target = selectedBoarding
                        setSelectedBoarding(null)
                        navigate(getBoardingRebookUrl(target), { state: { rebookBooking: target } })
                      }}
                    >
                      <RotateCcw size={15} /> Re-book
                    </button>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Boarding Cancel Modal */}
      <ConfirmModal
        open={!!boardingCancelTarget}
        title="Cancel boarding reservation?"
        message={boardingCancelTarget ? `Are you sure you want to cancel the boarding reservation for ${boardingCancelTarget.petName} from ${boardingCancelTarget.checkInDate} to ${boardingCancelTarget.checkOutDate}?` : ''}
        confirmText="Yes, cancel reservation"
        cancelText="Keep reservation"
        loading={!!boardingCancelTarget && cancellingBoardingId === boardingCancelTarget.id}
        onCancel={() => { setBoardingCancelTarget(null); setBoardingCancelReason('') }}
        onConfirm={cancelBoardingBooking}
        reasonLabel="Cancellation reason"
        reasonPlaceholder="Please tell us why you are cancelling this boarding stay"
        reasonValue={boardingCancelReason}
        onReasonChange={setBoardingCancelReason}
        reasonRequired
      />

      {/* Pet Walking Details Modal (Native Paw Paw Theme & Layout) */}
      {selectedWalking && (() => {
        const petName = selectedWalking.petName || selectedWalking.dogName || 'Dog'
        const petBreed = selectedWalking.petBreed || selectedWalking.breed || 'Dog'
        const petAge = selectedWalking.petAge || selectedWalking.age || ''
        const walkDate = selectedWalking.walkingDate || selectedWalking.date || ''
        const walkSlot = selectedWalking.walkingSlot || selectedWalking.slot || 'Custom Timing'
        const duration = selectedWalking.durationMinutes || selectedWalking.duration || 30
        const address = selectedWalking.pickupAddress || selectedWalking.address || ''
        const area = selectedWalking.area || 'Dhayari'
        const landmark = selectedWalking.landmark || ''
        const price = selectedWalking.totalPrice || 199
        const customTime = selectedWalking.customTimeRequested || selectedWalking.customTimeNote || ''
        const notes = selectedWalking.notes || selectedWalking.specialInstructions || selectedWalking.behaviorNotes || ''
        const walkerInst = selectedWalking.walkerInstructions || selectedWalking.notes || ''
        const isPendingOrConfirmed = selectedWalking.status === 'pending' || selectedWalking.status === 'confirmed'
        const wpMsg = buildWalkingWhatsAppMessage(selectedWalking, businessInfo?.name || shopName)
        const wpUrl = `https://wa.me/${(adminWhatsappNumber || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(wpMsg)}`

        return (
          <div className="my-booking-modal-overlay boarding-modal-overlay" onClick={() => setSelectedWalking(null)}>
            <div className="boarding-details-modal walking-details-modal" onClick={e => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="details-modal-header">
                <div className="details-header-top-row">
                  <h2 className="details-title">Dog Walking Details</h2>

                  <div className="header-actions-row">
                    {adminWhatsappNumber && (
                      <a
                        href={wpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="details-header-btn whatsapp"
                        aria-label="Send details to WhatsApp"
                      >
                        <MessageCircle size={14} /> <span>WhatsApp</span>
                      </a>
                    )}

                    <button
                      type="button"
                      className="details-close-btn"
                      onClick={() => setSelectedWalking(null)}
                      aria-label="Close modal"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Row 2: Status badge and Request ID */}
                <div className="details-header-sub-row">
                  <span className={`boarding-status-pill ${selectedWalking.status || 'pending'}`}>
                    {selectedWalking.status === 'completed' && <CheckCircle2 size={13} />}
                    {selectedWalking.status === 'confirmed' && <Check size={13} />}
                    {selectedWalking.status === 'cancelled' && <X size={13} />}
                    <span>{statusLabel(selectedWalking.status)}</span>
                  </span>
                  <span className="details-ref-id">{shortId(selectedWalking.id)}</span>
                </div>
              </div>

              {/* Modal Scrollable Body */}
              <div className="details-modal-body">
                {/* SECTION 1: Dog & Owner Details */}
                <div className="boarding-section-card">
                  <div className="section-card-header">
                    <div className="section-icon-wrap paw">
                      <PawPrint size={16} />
                    </div>
                    <h3>Dog & Owner Details</h3>
                  </div>

                  <div className="pet-hero-row">
                    <div className="pet-avatar-large" style={{ overflow: 'hidden' }}>
                      {selectedWalking.petPhotoUrl || selectedWalking.photoUrl ? (
                        <img src={selectedWalking.petPhotoUrl || selectedWalking.photoUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div className="avatar-fallback" style={{ display: 'flex' }}>
                          <Footprints size={24} />
                        </div>
                      )}
                    </div>

                    <div className="pet-hero-info">
                      <strong className="pet-hero-name">{petName}</strong>
                      <div className="pet-hero-subtitle">
                        Dog • {petBreed}
                      </div>

                      <div className="pet-pills-row">
                        {petAge && (
                          <span className="pet-pill">
                            <Calendar size={12} /> {petAge}
                          </span>
                        )}
                        <span className="pet-pill">
                          <Footprints size={12} /> {duration} Mins Walk
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="detail-two-col-grid">
                    <div className="detail-item">
                      <span className="detail-label"><User size={14} /> Owner Name</span>
                      <strong className="detail-val">{selectedWalking.ownerName || 'N/A'}</strong>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label"><Phone size={14} /> Contact Number</span>
                      <strong className="detail-val">{selectedWalking.phone || 'N/A'}</strong>
                    </div>

                    {selectedWalking.whatsappNumber && (
                      <div className="detail-item">
                        <span className="detail-label"><MessageCircle size={14} /> WhatsApp Number</span>
                        <strong className="detail-val">{selectedWalking.whatsappNumber}</strong>
                      </div>
                    )}

                    {selectedWalking.emergencyContact && (
                      <div className="detail-item">
                        <span className="detail-label"><ShieldCheck size={14} /> Emergency Contact</span>
                        <strong className="detail-val">{selectedWalking.emergencyContact}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION 2: Walk Schedule & Timing */}
                <div className="boarding-section-card">
                  <div className="section-card-header">
                    <div className="section-icon-wrap calendar">
                      <Calendar size={16} />
                    </div>
                    <h3>Walk Schedule & Timing</h3>
                  </div>

                  <div className="detail-two-col-grid">
                    <div className="detail-item">
                      <span className="detail-label"><Calendar size={14} /> Walking Date</span>
                      <strong className="detail-val">{formatBoardingDate(walkDate)}</strong>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label"><Clock size={14} /> Time Slot</span>
                      <strong className="detail-val">{walkSlot}</strong>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label"><Footprints size={14} /> Duration</span>
                      <strong className="detail-val">{duration} Minutes Session</strong>
                    </div>

                    <div className="detail-item">
                      <span className="detail-label"><IndianRupee size={14} /> Per-Walk Rate</span>
                      <strong className="detail-val" style={{ color: 'var(--accent)', fontWeight: 800 }}>
                        ₹{money(price)}
                      </strong>
                    </div>

                    {customTime && (
                      <div className="detail-item full">
                        <span className="detail-label"><Sparkles size={14} /> Custom Timing Request</span>
                        <strong className="detail-val" style={{ color: '#d97706' }}>{customTime}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION 3: Pick-up Location */}
                <div className="boarding-section-card">
                  <div className="section-card-header">
                    <div className="section-icon-wrap home">
                      <MapPin size={16} />
                    </div>
                    <h3>Pick-up Location</h3>
                  </div>

                  <div className="detail-two-col-grid">
                    <div className="detail-item full">
                      <span className="detail-label"><MapPin size={14} /> Complete Address</span>
                      <strong className="detail-val">{address || 'No address provided'}</strong>
                      {selectedWalking.mapPinUrl && (
                        <div style={{ marginTop: '6px' }}>
                          <a
                            href={selectedWalking.mapPinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              color: '#1d4ed8',
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              textDecoration: 'none',
                            }}
                          >
                            <MapPin size={12} /> View Map Pin in Google Maps ↗
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="detail-item">
                      <span className="detail-label"><Compass size={14} /> Locality / Area</span>
                      <strong className="detail-val">{area}</strong>
                    </div>

                    {landmark && (
                      <div className="detail-item">
                        <span className="detail-label"><Store size={14} /> Landmark</span>
                        <strong className="detail-val">{landmark}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION 4: Notes & Instructions */}
                {(notes || walkerInst) && (
                  <div className="boarding-section-card">
                    <div className="section-card-header">
                      <div className="section-icon-wrap paw">
                        <Info size={16} />
                      </div>
                      <h3>Notes & Walker Instructions</h3>
                    </div>

                    <div className="detail-two-col-grid">
                      {notes && (
                        <div className="detail-item full">
                          <span className="detail-label"><Info size={14} /> Pet Behavior & Habits</span>
                          <strong className="detail-val">{notes}</strong>
                        </div>
                      )}

                      {walkerInst && walkerInst !== notes && (
                        <div className="detail-item full">
                          <span className="detail-label"><Footprints size={14} /> Instructions for Walker</span>
                          <strong className="detail-val">{walkerInst}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              {isPendingOrConfirmed && (
                <div className="details-modal-footer boarding-modal-footer">
                  {(selectedWalking.status === 'pending' || selectedWalking.status === 'under_review' || !selectedWalking.status) && (
                    <button
                      type="button"
                      className="grooming-action-btn reschedule"
                      onClick={() => {
                        const target = selectedWalking
                        setSelectedWalking(null)
                        openWalkingRescheduleModal(target)
                      }}
                    >
                      <Clock size={15} /> Reschedule Walk
                    </button>
                  )}

                  <button
                    type="button"
                    className="grooming-action-btn cancel"
                    onClick={() => {
                      const target = selectedWalking
                      setSelectedWalking(null)
                      setWalkingCancelTarget(target)
                      setWalkingCancelReason('')
                    }}
                  >
                    <X size={15} /> Cancel Walk
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Walking Cancel Modal */}
      <ConfirmModal
        open={!!walkingCancelTarget}
        title="Cancel Dog Walking Session"
        message={walkingCancelTarget ? `Are you sure you want to cancel the walking appointment for ${walkingCancelTarget.petName || walkingCancelTarget.dogName || 'Dog'} on ${formatBoardingDate(walkingCancelTarget.walkingDate || walkingCancelTarget.date)} at ${walkingCancelTarget.walkingSlot || walkingCancelTarget.slot || 'scheduled time'}?` : ''}
        confirmText="Yes, cancel walk"
        cancelText="Keep walk"
        loading={!!walkingCancelTarget && cancellingWalkingId === walkingCancelTarget.id}
        onCancel={() => { setWalkingCancelTarget(null); setWalkingCancelReason('') }}
        onConfirm={cancelWalkingBooking}
        reasonLabel="Cancellation reason"
        reasonPlaceholder="Please tell us why you are cancelling this walking appointment"
        reasonValue={walkingCancelReason}
        onReasonChange={setWalkingCancelReason}
        reasonRequired
      />

      {/* Walking Reschedule Modal */}
      {walkingRescheduleTarget && (() => {
        const isWalkingOpen = isWalkingDayOpen(walkingSettings, walkingRescheduleDate)
        const isToday = walkingRescheduleDate === dateKeyLocal()
        const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
        const petName = walkingRescheduleTarget.petName || walkingRescheduleTarget.dogName || 'Dog'
        const currentScheduleDate = walkingRescheduleTarget.walkingDate || walkingRescheduleTarget.date || '-'
        const currentScheduleSlot = walkingRescheduleTarget.walkingSlot || walkingRescheduleTarget.slot || '-'

        return (
          <div className="my-booking-modal-overlay" onClick={() => setWalkingRescheduleTarget(null)}>
            <section className="my-booking-modal" onClick={event => event.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div className="my-booking-modal-head">
                <div>
                  <h2>Reschedule Dog Walk</h2>
                  <p>{petName} · Current: {formatBoardingDate(currentScheduleDate)} ({currentScheduleSlot})</p>
                </div>
                <button type="button" onClick={() => setWalkingRescheduleTarget(null)} aria-label="Close reschedule dialog">
                  <X size={18} />
                </button>
              </div>

              <div className="my-booking-detail-grid">
                <div>
                  <span>Current Date</span>
                  <strong>{formatBoardingDate(currentScheduleDate)}</strong>
                </div>
                <div>
                  <span>Current Time Slot</span>
                  <strong>{currentScheduleSlot}</strong>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <label className="input-label" style={{ display: 'block', marginBottom: '8px' }}>Select New Date</label>
                <input
                  type="date"
                  className="input"
                  min={dateKeyLocal()}
                  value={walkingRescheduleDate}
                  onChange={e => {
                    setWalkingRescheduleDate(e.target.value)
                    setWalkingRescheduleSlot('')
                  }}
                />
                {!isWalkingOpen && (
                  <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px', display: 'block', fontWeight: 600 }}>
                    ⚠️ Paw Paw is closed for dog walking on this day. Please select another day.
                  </span>
                )}
              </div>

              {walkingRescheduleDate && isWalkingOpen && (
                <div style={{ marginTop: '16px' }}>
                  <label className="input-label" style={{ display: 'block', marginBottom: '8px' }}>Select New Time Slot</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                    {(walkingSettings?.slots || DEFAULT_WALKING_SLOTS).map(slot => {
                      const isSelected = walkingRescheduleSlot === slot
                      const isFull = walkingRescheduleBookedSlots.includes(slot)
                      const slotMins = parseSlotTimeToMinutes(slot)
                      const isPast = isToday && slotMins <= nowMins + 30
                      const disabled = !isWalkingOpen || isFull || isPast

                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            if (currentScheduleDate === walkingRescheduleDate && currentScheduleSlot === slot) {
                              setRescheduleToast('Cannot reschedule to the same slot. Please choose a different slot.')
                              return
                            }
                            setWalkingRescheduleSlot(slot)
                          }}
                          style={{
                            background: isSelected ? 'var(--accent)' : disabled ? 'var(--surface)' : 'var(--card)',
                            color: isSelected ? '#ffffff' : disabled ? 'var(--muted)' : 'var(--text)',
                            border: `1.5px solid ${isSelected ? 'var(--accent)' : disabled ? 'var(--border)' : 'var(--accent-border)'}`,
                            borderRadius: '10px',
                            padding: '10px 4px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled ? 0.45 : 1,
                            textAlign: 'center',
                            position: 'relative',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                            width: '100%',
                            boxSizing: 'border-box',
                          }}
                        >
                          {slot}
                          {isFull && <span style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: '#ef4444' }}>Full</span>}
                          {isPast && <span style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: 'var(--muted)' }}>Passed</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="my-booking-modal-actions" style={{ marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setWalkingRescheduleTarget(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmWalkingReschedule}
                  disabled={
                    !walkingRescheduleDate ||
                    !walkingRescheduleSlot ||
                    !isWalkingOpen ||
                    reschedulingWalkingId === walkingRescheduleTarget.id ||
                    walkingRescheduleBookedSlots.includes(walkingRescheduleSlot)
                  }
                >
                  {reschedulingWalkingId === walkingRescheduleTarget.id ? 'Rescheduling...' : 'Confirm Reschedule'}
                </button>
              </div>
            </section>
          </div>
        )
      })()}
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

        .my-booking-dropdown summary::-webkit-details-marker { display:none }
        .my-booking-dropdown summary {
          list-style: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--card);
          cursor: pointer;
          height: 44px;
          min-height: 44px;
          overflow: hidden;
          min-width: 0;
          width: 100%;
        }
        .my-booking-dropdown summary > div {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          min-width: 0;
          overflow: hidden;
        }
        .my-booking-dropdown-label { font-weight: 800; color: var(--text); }
        .my-booking-dropdown-summary {
          color: var(--muted);
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: block;
          flex: 1 1 0;
          width: 0;
          min-width: 0;
          max-width: calc(100% - 52px);
          line-height: 20px;
        }
        .my-booking-dropdown-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          min-width: 36px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: rgba(255,255,255,0.02);
        }
        .my-booking-checkbox-list { padding: 8px 0 0 0; }
        .my-booking-checkbox-item input[type="checkbox"] { width: 18px; height: 18px }
        .my-booking-dropdown-icon { color: var(--muted); transition: transform 160ms ease }
        .my-booking-dropdown[open] summary .my-booking-dropdown-icon { transform: none }

        .my-booking-dropdown-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: rgba(255,255,255,0.02);
        }

        /* Keep dropdown panel from pushing the page; scroll inside the panel */
        .my-booking-dropdown > div {
          max-height: 320px;
          overflow: auto;
        }

        /* Constrain full-edit overlay so page doesn't scroll; body scroll stays inside modal */
        .my-booking-edit-full {
          max-height: calc(100vh - 80px);
          overflow: hidden;
        }

        .my-booking-edit-full-body {
          overflow: auto;
          max-height: calc(100vh - 160px);
          padding-right: 8px;
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

        .my-booking-row-meta span.meta-paid {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          border-color: rgba(16, 185, 129, 0.28);
        }

        .my-booking-row-actions {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 6px;
          padding-top: 10px;
          border-top: 1px solid var(--border);
        }

        .my-booking-card-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text);
          cursor: pointer;
          transition: all 0.18s ease;
          line-height: 1.25;
        }

        .my-booking-card-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.22);
        }

        .my-booking-card-btn.primary {
          background: rgba(212, 175, 55, 0.1);
          border-color: rgba(212, 175, 55, 0.4);
          color: var(--accent);
          font-weight: 700;
        }

        .my-booking-card-btn.primary:hover {
          background: var(--accent);
          border-color: var(--accent);
          color: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 3px 10px rgba(212, 175, 55, 0.25);
        }

        .my-booking-card-btn.reschedule {
          background: rgba(37, 99, 235, 0.08);
          border-color: rgba(37, 99, 235, 0.35);
          color: #2563eb;
        }

        .my-booking-card-btn.reschedule:hover {
          background: rgba(37, 99, 235, 0.16);
          border-color: #2563eb;
          color: #1d4ed8;
          transform: translateY(-1px);
        }

        .theme-dark .my-booking-card-btn.reschedule,
        .theme-purple .my-booking-card-btn.reschedule {
          color: #60a5fa;
          border-color: rgba(96, 165, 250, 0.35);
          background: rgba(59, 130, 246, 0.12);
        }

        .my-booking-card-btn.invoice {
          background: rgba(16, 185, 129, 0.08);
          border-color: rgba(16, 185, 129, 0.35);
          color: #059669;
        }

        .my-booking-card-btn.invoice:hover {
          background: rgba(16, 185, 129, 0.16);
          border-color: #059669;
          color: #047857;
          transform: translateY(-1px);
        }

        .theme-dark .my-booking-card-btn.invoice,
        .theme-purple .my-booking-card-btn.invoice {
          color: #34d399;
          border-color: rgba(52, 211, 153, 0.35);
          background: rgba(16, 185, 129, 0.12);
        }

        .my-booking-card-btn.details {
          background: rgba(184, 134, 11, 0.08);
          border-color: rgba(184, 134, 11, 0.35);
          color: #B8860B;
          font-weight: 700;
        }

        .my-booking-card-btn.details:hover {
          background: rgba(184, 134, 11, 0.16);
          border-color: #B8860B;
          color: #92400E;
          transform: translateY(-1px);
        }

        .theme-dark .my-booking-card-btn.details,
        .theme-purple .my-booking-card-btn.details {
          color: #FBBF24;
          border-color: rgba(251, 191, 36, 0.35);
          background: rgba(217, 119, 6, 0.15);
        }

        .my-booking-card-btn.whatsapp {
          background: #F0FDF4;
          border-color: #BBF7D0;
          color: #15803D;
          font-weight: 700;
        }

        .my-booking-card-btn.whatsapp:hover {
          background: #DCFCE7;
          border-color: #86EFAC;
          color: #166534;
          transform: translateY(-1px);
        }

        .theme-dark .my-booking-card-btn.whatsapp,
        .theme-purple .my-booking-card-btn.whatsapp {
          color: #4ADE80;
          border-color: rgba(74, 222, 128, 0.35);
          background: rgba(34, 197, 94, 0.15);
        }

        .my-booking-card-btn.cancel {
          background: #FEF2F2;
          border-color: #FECACA;
          color: #DC2626;
          font-weight: 700;
        }

        .my-booking-card-btn.cancel:hover {
          background: #FEE2E2;
          border-color: #FCA5A5;
          color: #B91C1C;
          transform: translateY(-1px);
        }

        .theme-dark .my-booking-card-btn.cancel,
        .theme-purple .my-booking-card-btn.cancel {
          color: #F87171;
          border-color: rgba(248, 113, 113, 0.35);
          background: rgba(239, 68, 68, 0.14);
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

        .my-booking-edit-full-overlay {
          position: fixed;
          inset: 0;
          z-index: 1400;
          background: rgba(0,0,0,0.36);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
        }

        .my-booking-edit-full {
          width: min(900px, 100%);
          max-height: min(88vh, 1200px);
          overflow: auto;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 20px;
        }

        .my-booking-edit-full-head {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 12px;
        }

        .my-booking-edit-full-head h3 { margin: 0; font-size: 18px; font-weight: 900 }
        .my-booking-edit-full-body { display: grid; grid-template-columns: 1fr 1fr; gap: 12px }
        .my-booking-edit-full .input { width: 100%; box-sizing: border-box }
        .my-booking-edit-full .my-booking-checkbox-list { max-height: 240px }

        
        /* Grooming Details Modal Redesign */
        .grooming-details-modal {
          max-width: 620px;
        }

        .grooming-services-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-bottom: 14px;
        }

        .grooming-service-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          background: #FAF3E5;
          border: 1.2px solid #EEDBC2;
          color: #8C5D08;
        }

        .grooming-package-tag {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          background: #F0FDF4;
          border: 1.2px solid #BBF7D0;
          color: #15803D;
        }

        .section-icon-wrap.scissors {
          background: #FAF3E3;
          color: #B8860B;
        }

        .section-icon-wrap.camera {
          background: #FDF2F8;
          color: #DB2777;
        }

        .section-icon-wrap.rupee {
          background: #F0FDF4;
          color: #16A34A;
        }

        .section-icon-wrap.notes {
          background: #F8FAFC;
          color: #475569;
        }

        .grooming-price-banner {
          background: #FDFBF7;
          border: 1.2px dashed #E5D5BC;
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 10px;
        }

        .grooming-price-label {
          font-size: 13px;
          font-weight: 700;
          color: #6E584B;
        }

        .grooming-price-value {
          font-size: 18px;
          font-weight: 800;
          color: #B8860B;
        }

        .grooming-payment-completed-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 10px;
          margin-top: 10px;
          border-top: 1px solid #F5EFE6;
        }

        .grooming-next-visit-pill {
          margin-top: 10px;
          background: #EFF6FF;
          border: 1px solid #BFDBFE;
          border-radius: 10px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          color: #1E40AF;
          font-weight: 600;
        }

        .grooming-photos-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .grooming-photo-card {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          aspect-ratio: 4 / 3;
          border: 1px solid #EFE6D8;
          background: #F7F3EB;
          cursor: pointer;
          padding: 0;
          display: block;
          width: 100%;
        }

        .grooming-photo-card img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.2s ease;
        }

        .grooming-photo-card:hover img {
          transform: scale(1.04);
        }

        .grooming-photo-tag {
          position: absolute;
          bottom: 8px;
          left: 8px;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 800;
          background: rgba(30, 20, 10, 0.72);
          color: #FFF;
          backdrop-filter: blur(4px);
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .grooming-cancel-alert {
          background: #FEF2F2;
          border: 1.2px solid #FECACA;
          border-radius: 14px;
          padding: 12px 14px;
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }

        .grooming-cancel-alert .alert-icon {
          color: #DC2626;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .grooming-cancel-alert strong {
          display: block;
          font-size: 13.5px;
          font-weight: 800;
          color: #991B1B;
          margin-bottom: 2px;
        }

        .grooming-cancel-alert p {
          margin: 0;
          font-size: 12.5px;
          color: #7F1D1D;
        }

        .boarding-status-pill.completed {
          background: #ECFDF3;
          color: #027A48;
          border: 1px solid #A6F4C5;
        }

        .boarding-status-pill.rescheduled {
          background: #F3E8FF;
          color: #7E22CE;
          border: 1px solid #D8B4FE;
        }

        .details-modal-footer {
          padding: 12px 18px 16px;
          border-top: 1.2px solid #EFE6D8;
          background: #FFFDF9;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          flex-shrink: 0;
        }

        .details-modal-footer.single-btn {
          grid-template-columns: 1fr;
        }

        .grooming-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          border: 1.2px solid transparent;
          text-decoration: none;
          font-family: inherit;
          box-sizing: border-box;
          min-height: 42px;
        }

        .grooming-action-btn.edit {
          background: #FFFBEB;
          border-color: #FDE68A;
          color: #B45309;
        }
        .grooming-action-btn.edit:hover {
          background: #FEF3C7;
          border-color: #FCD34D;
        }

        .grooming-action-btn.reschedule {
          background: #EFF6FF;
          border-color: #BFDBFE;
          color: #1D4ED8;
        }
        .grooming-action-btn.reschedule:hover {
          background: #DBEAFE;
          border-color: #93C5FD;
        }

        .grooming-action-btn.cancel {
          background: #FEF2F2;
          border-color: #FECACA;
          color: #DC2626;
        }
        .grooming-action-btn.cancel:hover {
          background: #FEE2E2;
          border-color: #FCA5A5;
        }

        .grooming-action-btn.whatsapp {
          background: #F0FDF4;
          border-color: #BBF7D0;
          color: #15803D;
        }
        .grooming-action-btn.whatsapp:hover {
          background: #DCFCE7;
          border-color: #86EFAC;
        }

        .grooming-action-btn.primary {
          background: linear-gradient(135deg, #C29326, #A67818);
          border-color: #946910;
          color: #FFFFFF;
        }
        .grooming-action-btn.primary:hover {
          filter: brightness(1.05);
        }

        .grooming-action-btn.invoice {
          background: rgba(16, 185, 129, 0.08);
          border-color: rgba(16, 185, 129, 0.35);
          color: #059669;
          font-weight: 700;
        }
        .grooming-action-btn.invoice:hover {
          background: rgba(16, 185, 129, 0.16);
          border-color: #059669;
          color: #047857;
        }

        @media (max-width: 640px) {
          .my-booking-edit-full { padding: 12px }
          .my-booking-edit-full-body { grid-template-columns: 1fr !important }
          .my-booking-dropdown-summary { max-width: 100% }
          .my-booking-edit-full .my-booking-checkbox-list { max-height: 180px }
          .my-booking-edit-full .btn { display: block; width: 100%; }
          .my-booking-edit-full .my-booking-edit-summary { flex-direction: column; align-items: flex-start; gap: 8px }
          .my-booking-edit-full .my-booking-edit-summary strong { font-size: 16px }
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

          .my-boarding-card {
            padding: 14px 12px !important;
          }

          .my-booking-row-actions {
            display: flex;
            flex-wrap: nowrap;
            gap: 6px;
            width: 100%;
          }

          .my-booking-card-btn {
            flex: 1 1 0;
            min-width: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            text-align: center;
            padding: 7px 4px;
            font-size: 11.5px;
            box-sizing: border-box;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .my-booking-card-btn svg {
            flex-shrink: 0;
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

        /* Boarding Details Modal Styles (Customer Portal) */
        .boarding-modal-overlay {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 16px !important;
          box-sizing: border-box !important;
        }

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
          display: grid;
          gap: 14px;
        }

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

        @media (max-width: 640px) {
          .boarding-modal-overlay {
            align-items: center !important;
            justify-content: center !important;
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

          .detail-two-col-grid {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .stay-banner-strip {
            flex-wrap: wrap;
            gap: 10px;
          }

          .billing-three-col-row {
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          .details-modal-footer {
            padding: 10px 14px 14px;
            gap: 8px;
          }

          .grooming-action-btn {
            padding: 9px 8px;
            font-size: 13px;
            min-height: 40px;
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











