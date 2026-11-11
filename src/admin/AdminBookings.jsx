// src/admin/AdminBookings.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, startAfter, Timestamp, updateDoc, where } from 'firebase/firestore'
import Cropper from 'react-easy-crop'
import { Calendar, CalendarDays, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Edit3, IndianRupee, List, MapPin, MessageCircle, Phone, Plus, ReceiptText, RotateCcw, Scissors, Search, ShieldAlert, SlidersHorizontal, Sparkles, Tag, Upload, User, UserRound, X } from 'lucide-react'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'
import Toast from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import { db } from '../firebase'
import { syncPublicStats } from '../utils/publicStats'
import { BOOKING_STATUS, buildWhatsAppMessage } from '../utils/services'
import { fetchBusinessInfo } from '../utils/businessInfo'
import { fetchBookingSettings, getAvailabilityForDate, getBookingTypeLabel } from '../utils/bookingSettings'
import { buildServiceCatalog } from '../utils/serviceCatalog'
import { OWNER_ASSIGNEE_ID, buildAssigneePatch, getAssigneeLabel, getBookingAssignee, getOwnerAssignee } from '../utils/teamMembers'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, cropImageFile, validateImageFile } from '../utils/imageCompression'

const STATUS_OPTS = ['all', 'pending', 'confirmed', 'completed', 'cancelled']
const BADGE = { pending: 'badge-pending', confirmed: 'badge-confirmed', completed: 'badge-completed', cancelled: 'badge-cancelled' }
const PAGE_SIZE = 20

const statusLabel = (status = 'pending') => status.charAt(0).toUpperCase() + status.slice(1)
const money = (value) => Number(value || 0).toLocaleString('en-IN')
const shortId = (id = '') => `#${id.slice(0, 8).toUpperCase()}`

const parseAppointmentStart = (booking) => {
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

const getCustomerWhatsAppUrl = (booking, shopName, fallbackAdminNumber = '') => {
  const raw = String(booking?.phone || booking?.customerPhone || '').replace(/\D/g, '')
  const targetNumber = raw
    ? (raw.length === 10 ? `91${raw}` : raw)
    : String(fallbackAdminNumber || '').replace(/\D/g, '')
  if (!targetNumber) return '#'
  return `https://wa.me/${targetNumber}?text=${buildWhatsAppMessage(booking, shopName)}`
}

const formatDateTime = (value) => {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : null
  if (!date) return '-'
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\b(am|pm)\b/i, value => value.toUpperCase())
}

const formatSlot = (value) => {
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

const formatAppointmentStart = (booking) => formatDateTime(parseAppointmentStart(booking))

const dateKeyLocal = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const addDaysLocal = (dateKey, days) => {
  if (!dateKey) return dateKeyLocal()
  const parts = dateKey.split('-').map(Number)
  const dt = new Date(parts[0], parts[1] - 1, parts[2])
  dt.setDate(dt.getDate() + days)
  return dateKeyLocal(dt)
}

const formatDateNice = (dateKey) => {
  if (!dateKey) return ''
  const parts = dateKey.split('-').map(Number)
  const dt = new Date(parts[0], parts[1] - 1, parts[2])
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

const TIMELINE_HOURS = [
  { hour24: 9, label: '09:00 AM' },
  { hour24: 10, label: '10:00 AM' },
  { hour24: 11, label: '11:00 AM' },
  { hour24: 12, label: '12:00 PM' },
  { hour24: 13, label: '01:00 PM' },
  { hour24: 14, label: '02:00 PM' },
  { hour24: 15, label: '03:00 PM' },
  { hour24: 16, label: '04:00 PM' },
  { hour24: 17, label: '05:00 PM' },
  { hour24: 18, label: '06:00 PM' },
  { hour24: 19, label: '07:00 PM' },
  { hour24: 20, label: '08:00 PM' },
]

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

const canRescheduleBooking = (booking) => {
  if (!booking) return false
  if (booking.status === 'completed') return false
  if (['pending', 'confirmed'].includes(booking.status)) return true
  return booking.status === 'cancelled' && booking.cancelledBy === 'admin'
}

let cachedBookingsData = null
let cachedBookingsTime = 0
const BOOKINGS_CACHE_TTL = 3 * 60 * 1000
const INITIAL_FETCH_LIMIT = 120

let cachedTeamMembers = null
let cachedPackages = null
let cachedBusinessInfo = null
let cachedBookingSettings = null

export default function AdminBookings() {
  const { user } = useAuth()
  const { sendNotification } = useNotifications()
  const navigate = useNavigate()
  const { bookingId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDate = searchParams.get('date') || ''
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastVisibleDoc, setLastVisibleDoc] = useState(null)
  const [viewMode, setViewMode] = useState('list') // 'list' | 'timeline'
  const [timelineDate, setTimelineDate] = useState(() => requestedDate || dateKeyLocal(new Date()))
  const [timelineStaffFilter, setTimelineStaffFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [serviceF, setServiceF] = useState('all')
  const [quickFilter, setQuickFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState(requestedDate)
  const [dateTo, setDateTo] = useState(requestedDate)

  useEffect(() => {
    if (requestedDate) {
      setDateFrom(requestedDate)
      setDateTo(requestedDate)
    }
  }, [requestedDate])
  const [page, setPage] = useState(1)
  const [updating, setUpdating] = useState(null)
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [cashModal, setCashModal] = useState(null)
  const [cashAmt, setCashAmt] = useState('')
  const [recommendedVisitDays, setRecommendedVisitDays] = useState('')
  const [completionImageUrls, setCompletionImageUrls] = useState({ before: '', after: '' })
  const [completionPreviewUrls, setCompletionPreviewUrls] = useState({ before: '', after: '' })
  const [completionUploading, setCompletionUploading] = useState({ before: false, after: false })
  const [cropperState, setCropperState] = useState(null)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [selectedCustomerHistory, setSelectedCustomerHistory] = useState(null)
  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState('')
  const [shopName, setShopName] = useState('Paw Paw Pet Grooming')
  const [teamMembers, setTeamMembers] = useState([])
  const [serviceDetails, setServiceDetails] = useState({})
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [bookingSettings, setBookingSettings] = useState(null)
  const [packageOptions, setPackageOptions] = useState([])
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleSlot, setRescheduleSlot] = useState('')
  const [rescheduleBookedSlots, setRescheduleBookedSlots] = useState([])
  const [reschedulingId, setReschedulingId] = useState('')

  const fetchBookings = async (isBackground = false) => {
    const isFresh = cachedBookingsData && (Date.now() - cachedBookingsTime < BOOKINGS_CACHE_TTL)
    if (isFresh && !isBackground) {
      setBookings(cachedBookingsData.bookings)
      setServiceDetails(cachedBookingsData.serviceDetails)
      setHasMore(Boolean(cachedBookingsData.hasMore))
      setLastVisibleDoc(cachedBookingsData.lastVisibleDoc || null)
      setLoading(false)
      // Background revalidation
      fetchBookings(true)
      return
    }

    if (!isBackground && !cachedBookingsData) {
      setLoading(true)
    }

    try {
      const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'), limit(INITIAL_FETCH_LIMIT))
      const [snap, serviceSnap] = await Promise.all([getDocs(q), getDocs(collection(db, 'serviceDetails'))])
      const nextServiceDetails = {}
      serviceSnap.docs.forEach(d => { nextServiceDetails[d.id] = { id: d.id, ...d.data() } })
      setServiceDetails(nextServiceDetails)
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null
      const moreAvailable = snap.docs.length === INITIAL_FETCH_LIMIT
      setBookings(rows)
      setLastVisibleDoc(lastDoc)
      setHasMore(moreAvailable)
      cachedBookingsData = {
        bookings: rows,
        serviceDetails: nextServiceDetails,
        lastVisibleDoc: lastDoc,
        hasMore: moreAvailable,
      }
      cachedBookingsTime = Date.now()
      setLoading(false)
      // Sync public stats in the background without blocking the UI
      syncPublicStats(db).catch(() => {})
    } catch {
      try {
        const [snap, serviceSnap] = await Promise.all([
          getDocs(query(collection(db, 'bookings'), limit(INITIAL_FETCH_LIMIT))),
          getDocs(collection(db, 'serviceDetails'))
        ])
        const nextServiceDetails = {}
        serviceSnap.docs.forEach(d => { nextServiceDetails[d.id] = { id: d.id, ...d.data() } })
        setServiceDetails(nextServiceDetails)
        const r = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        r.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null
        const moreAvailable = snap.docs.length === INITIAL_FETCH_LIMIT
        setBookings(r)
        setLastVisibleDoc(lastDoc)
        setHasMore(moreAvailable)
        cachedBookingsData = {
          bookings: r,
          serviceDetails: nextServiceDetails,
          lastVisibleDoc: lastDoc,
          hasMore: moreAvailable,
        }
        cachedBookingsTime = Date.now()
        setLoading(false)
        syncPublicStats(db).catch(() => {})
      } catch {
        setLoading(false)
      }
    }
  }

  const loadMoreBookings = async () => {
    if (!lastVisibleDoc || loadingMore) return
    setLoadingMore(true)
    try {
      const q = query(
        collection(db, 'bookings'),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisibleDoc),
        limit(60)
      )
      const snap = await getDocs(q)
      if (snap.empty) {
        setHasMore(false)
      } else {
        const moreRows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        const updated = [...bookings, ...moreRows]
        const newLastDoc = snap.docs[snap.docs.length - 1]
        const moreAvailable = snap.docs.length === 60
        setBookings(updated)
        setLastVisibleDoc(newLastDoc)
        setHasMore(moreAvailable)
        cachedBookingsData = {
          bookings: updated,
          serviceDetails,
          lastVisibleDoc: newLastDoc,
          hasMore: moreAvailable,
        }
        cachedBookingsTime = Date.now()
      }
    } catch (err) {
      console.error('Error loading more bookings:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => { fetchBookings() }, [])

  useEffect(() => {
    if (cachedTeamMembers) {
      setTeamMembers(cachedTeamMembers)
      return
    }
    async function fetchTeamMembers() {
      try {
        const snap = await getDocs(query(collection(db, 'teamMembers'), orderBy('createdAt', 'desc')))
        const members = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        cachedTeamMembers = members
        setTeamMembers(members)
      } catch {
        try {
          const snap = await getDocs(collection(db, 'teamMembers'))
          const members = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          cachedTeamMembers = members
          setTeamMembers(members)
        } catch {}
      }
    }
    fetchTeamMembers()
  }, [])

  useEffect(() => {
    if (cachedPackages) {
      setPackageOptions(cachedPackages)
      return
    }
    async function fetchPackages() {
      try {
        const snap = await getDocs(query(collection(db, 'packages'), orderBy('createdAt', 'desc')))
        const pkgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(pkg => pkg.active !== false)
        cachedPackages = pkgs
        setPackageOptions(pkgs)
      } catch {
        try {
          const snap = await getDocs(collection(db, 'packages'))
          const pkgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(pkg => pkg.active !== false)
          cachedPackages = pkgs
          setPackageOptions(pkgs)
        } catch {}
      }
    }
    fetchPackages()
  }, [])

  useEffect(() => {
    if (!bookingId || bookings.length === 0) return
    const match = bookings.find(booking => booking.id === bookingId)
    if (match) setSelectedBooking(match)
  }, [bookingId, bookings])

  useEffect(() => {
    async function fetchWhatsapp() {
      const info = await fetchBusinessInfo(db)
      setAdminWhatsappNumber(info.whatsappNumber || '')
      setShopName(info.contact.shopName || 'Paw Paw Pet Grooming')
    }
    fetchWhatsapp()
  }, [])

  useEffect(() => {
    fetchBookingSettings(db).then(setBookingSettings).catch(() => {})
  }, [])

  useEffect(() => {
    if (!toastMessage) return
    const t = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [toastMessage])

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
          where('status', 'in', [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED])
        )
        const snap = await getDocs(q)
        const slotCounts = {}
        snap.docs
          .map(d => d.data())
          .filter(item => item.id !== rescheduleTarget.id && (item.status || '') !== BOOKING_STATUS.CANCELLED)
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

  const serviceCatalog = useMemo(() => buildServiceCatalog(serviceDetails), [serviceDetails])
  const ownerAssignee = useMemo(() => getOwnerAssignee(user), [user])
  const assignableTeamMembers = useMemo(() => teamMembers.filter(member => member.active !== false), [teamMembers])
  const assigneeOptions = useMemo(() => [ownerAssignee, ...assignableTeamMembers], [ownerAssignee, assignableTeamMembers])
  const assigneeFor = booking => getBookingAssignee(booking, ownerAssignee, teamMembers)

  const todayKey = dateKeyLocal(new Date())

  const todayCount = useMemo(() => {
    return bookings.filter(b => b.date === todayKey && b.status !== 'cancelled').length
  }, [bookings, todayKey])

  const upcomingCount = useMemo(() => {
    return bookings.filter(b => b.date && b.date > todayKey && b.status !== 'cancelled').length
  }, [bookings, todayKey])

  const customerHistoryMap = useMemo(() => {
    const map = new Map()
    bookings.forEach(item => {
      const key = (item.phone || item.userId || item.ownerName || '').trim().toLowerCase()
      if (!key) return
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(item)
    })
    map.forEach(list => {
      list.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (new Date(a.date || a.createdAt || 0).getTime() || 0)
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (new Date(b.date || b.createdAt || 0).getTime() || 0)
        return timeB - timeA
      })
    })
    return map
  }, [bookings])

  const filtered = useMemo(() => {
    let r = [...bookings]
    if (quickFilter === 'today') {
      r = r.filter(b => b.date === todayKey)
    } else if (quickFilter === 'upcoming') {
      r = r.filter(b => b.date && b.date > todayKey)
    }
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
        b.assignedTeamMemberName?.toLowerCase().includes(s) ||
        b.id?.toLowerCase().includes(s)
      )
    }
    if (quickFilter === 'today') {
      r.sort((a, b) => {
        const timeA = parseAppointmentStart(a)?.getTime() || 0
        const timeB = parseAppointmentStart(b)?.getTime() || 0
        return timeA - timeB
      })
    }
    return r
  }, [bookings, quickFilter, todayKey, serviceF, statusF, search, dateFrom, dateTo])

  const timelineDayBookings = useMemo(() => {
    let r = bookings.filter(b => b.date === timelineDate)
    if (timelineStaffFilter !== 'all') {
      if (timelineStaffFilter === 'unassigned') {
        r = r.filter(b => !b.assignedTeamMemberId)
      } else {
        r = r.filter(b => (b.assignedTeamMemberId || OWNER_ASSIGNEE_ID) === timelineStaffFilter)
      }
    }
    r.sort((a, b) => {
      const timeA = parseAppointmentStart(a)?.getTime() || 0
      const timeB = parseAppointmentStart(b)?.getTime() || 0
      return timeA - timeB
    })
    return r
  }, [bookings, timelineDate, timelineStaffFilter])

  const getBookingHour24 = (b) => {
    const dt = parseAppointmentStart(b)
    if (dt) return dt.getHours()
    const match = String(b.slot || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (match) {
      let h = Number(match[1])
      if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12
      if (match[3].toUpperCase() === 'AM' && h === 12) h = 0
      return h
    }
    return null
  }

  useEffect(() => { setPage(1) }, [quickFilter, serviceF, statusF, search, dateFrom, dateTo])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  const hasActiveFilters = quickFilter !== 'all' || statusF !== 'all' || serviceF !== 'all' || Boolean(dateFrom) || Boolean(dateTo)
  const activeFilterCount = (quickFilter !== 'all' ? 1 : 0) + (statusF !== 'all' ? 1 : 0) + (serviceF !== 'all' ? 1 : 0) + (dateFrom || dateTo ? 1 : 0)
  const clearAllFilters = () => {
    setQuickFilter('all')
    setStatusF('all')
    setServiceF('all')
    setDateFrom('')
    setDateTo('')
    setSearchParams({})
  }

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const totalEarnings = useMemo(() => (
    bookings
      .filter(b => b.status === 'completed' && b.amountCollected)
      .reduce((sum, b) => sum + (parseFloat(b.amountCollected) || 0), 0)
  ), [bookings])

  const patchBooking = (id, patch) => {
    setBookings(prev => {
      const next = prev.map(x => x.id === id ? { ...x, ...patch } : x)
      if (cachedBookingsData) cachedBookingsData.bookings = next
      return next
    })
    setSelectedBooking(prev => prev?.id === id ? { ...prev, ...patch } : prev)
  }

  const saveBookingUpdates = async (id, patch) => {
    setUpdating(id)
    try {
      await updateDoc(doc(db, 'bookings', id), patch)
      patchBooking(id, { ...patch, updatedAt: new Date(), bookingStartAt: patch.bookingStartAt || null })
      setToastType('success')
      setToastMessage('Booking details updated successfully.')
    } catch (err) {
      console.error('SAVE BOOKING ERROR:', err)
      setToastType('error')
      setToastMessage('Could not update booking details. Please try again.')
    }
    setUpdating(null)
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
      const patch = {
        date: rescheduleDate,
        slot: rescheduleSlot,
        status: 'pending',
        updatedAt: serverTimestamp(),
        rescheduleCount: Number(rescheduleTarget.rescheduleCount || 0) + 1,
        rescheduledAt: serverTimestamp(),
        rescheduledBy: 'admin',
        previousDate,
        previousSlot,
        rescheduleHistory: [
          ...(Array.isArray(rescheduleTarget.rescheduleHistory) ? rescheduleTarget.rescheduleHistory : []),
          {
            previousDate,
            previousSlot,
            newDate: rescheduleDate,
            newSlot: rescheduleSlot,
            rescheduledAt: new Date().toISOString(),
            rescheduledBy: 'admin',
            previousStatus: rescheduleTarget.status,
          },
        ],
        bookingStartAt: newBookingStart ? Timestamp.fromDate(newBookingStart) : null,
      }
      await updateDoc(doc(db, 'bookings', rescheduleTarget.id), patch)
      patchBooking(rescheduleTarget.id, { ...patch, rescheduledAt: new Date(), bookingStartAt: newBookingStart ? { toDate: () => newBookingStart } : null })
      if (rescheduleTarget.userId && rescheduleTarget.userId !== 'walkin') {
        await sendNotification(rescheduleTarget.userId, {
          userEmail: rescheduleTarget.userEmail || rescheduleTarget.customerEmail || rescheduleTarget.email || '',
          title: 'Appointment rescheduled',
          message: `Your appointment was rescheduled by admin from ${previousDate} at ${formatSlot(previousSlot)} to ${rescheduleDate} at ${formatSlot(rescheduleSlot)}.`,
          type: 'rescheduled',
          bookingId: rescheduleTarget.id,
          actionUrl: '/my-bookings',
        })
      }
      setRescheduleTarget(null)
      setRescheduleDate('')
      setRescheduleSlot('')
      setToastType('success')
      setToastMessage('Appointment rescheduled successfully.')
    } catch (err) {
      console.error('FIREBASE ERROR:', err)
      setToastType('error')
      setToastMessage('Could not reschedule booking. Please try again.')
      alert('Could not reschedule booking. Please try again.')
    }
    setReschedulingId('')
  }

  const updateStatus = async (b, status, reason = '') => {
    if (!b?.id) return
    if (status === 'completed') {
      if (b.status !== 'confirmed') return
      resetCompletionUploads()
      const estTotal = Number(b.estimatedTotal)
      const amtColl = Number(b.amountCollected)
      const priceNum = parseFloat(String(b.price || '').replace(/[^0-9.]/g, ''))
      const defaultAmount = (!isNaN(estTotal) && estTotal > 0)
        ? estTotal
        : ((!isNaN(amtColl) && amtColl > 0)
            ? amtColl
            : ((!isNaN(priceNum) && priceNum > 0) ? priceNum : ''))
      setCashAmt(defaultAmount !== '' ? String(defaultAmount) : '')
      setRecommendedVisitDays(b.recommendedVisitDays ? String(b.recommendedVisitDays) : '30')
      setCashModal(b)
      return
    }
    if (status === 'confirmed' && b.status !== 'pending') return
    if (status === 'cancelled' && !['pending', 'confirmed'].includes(b.status)) return
    const cleanReason = String(reason || '').trim()
    if (status === 'cancelled' && !cleanReason) return

    setUpdating(b.id)
    try {
      const assignmentPatch = status === 'confirmed' && !b.assignedTeamMemberId ? buildAssigneePatch(ownerAssignee) : {}
      const cancellationPatch = status === 'cancelled' ? { cancelledBy: 'admin', cancelledAt: serverTimestamp(), cancellationReason: cleanReason, updatedAt: serverTimestamp() } : {}
      const localCancellationPatch = status === 'cancelled' ? { cancelledBy: 'admin', cancelledAt: new Date(), cancellationReason: cleanReason, updatedAt: new Date() } : {}
      await updateDoc(doc(db, 'bookings', b.id), { status, ...assignmentPatch, ...cancellationPatch })
      patchBooking(b.id, { status, ...assignmentPatch, ...localCancellationPatch })
      await syncPublicStats(db)
      if (b.userId && b.userId !== 'walkin') {
        const msgs = {
          confirmed: 'Your booking has been approved.',
          cancelled: `Your appointment has been cancelled by admin. Please reschedule. Reason: ${cleanReason}`,
        }
        if (msgs[status]) {
          await sendNotification(b.userId, {
            userEmail: b.userEmail || b.customerEmail || b.email || '',
            title: status === 'confirmed' ? 'Booking approved' : 'Booking cancelled',
            message: `${b.serviceName} on ${b.date} at ${b.slot} - ${msgs[status]}`,
            type: status,
            bookingId: b.id,
            actionUrl: '/my-bookings',
          })
        }
      }
      setToastType('success')
      setToastMessage(status === 'confirmed' ? 'Booking approved successfully.' : 'Booking cancelled successfully.')
    } catch {
      setToastType('error')
      setToastMessage('Could not update booking status. Please try again.')
    }
    setUpdating(null)
  }

  const openCancelModal = (booking) => {
    setCancelReason('')
    setCancelTarget(booking)
  }

  const resetCompletionUploads = () => {
    setCompletionImageUrls({ before: '', after: '' })
    setCompletionPreviewUrls({ before: '', after: '' })
    setCompletionUploading({ before: false, after: false })
    setCropperState(null)
  }

  const removeCompletionImage = (kind) => {
    const currentPreview = completionPreviewUrls[kind]
    if (currentPreview?.startsWith('blob:')) URL.revokeObjectURL(currentPreview)
    setCompletionImageUrls(prev => ({ ...prev, [kind]: '' }))
    setCompletionPreviewUrls(prev => ({ ...prev, [kind]: '' }))
  }

  const openCompletionCropper = (kind, file) => {
    if (!file) return
    try {
      validateImageFile(file)
    } catch (err) {
      alert(err.message || 'Could not validate this image.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setCropperState({ kind, file, src: reader.result, crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null })
    }
    reader.onerror = () => { alert('Could not read this image.') }
    reader.readAsDataURL(file)
  }

  const confirmCompletionCrop = async () => {
    if (!cropperState?.file || !cropperState?.croppedAreaPixels) return
    const { kind, file } = cropperState
    setCompletionUploading(prev => ({ ...prev, [kind]: true }))
    try {
      const croppedFile = await cropImageFile(file, cropperState.croppedAreaPixels, { outputType: 'image/jpeg', quality: 0.82 })
      const previewUrl = URL.createObjectURL(croppedFile)
      setCompletionPreviewUrls(prev => ({ ...prev, [kind]: previewUrl }))
      setCropperState(null)

      const url = await uploadToCloudinary(croppedFile)
      setCompletionImageUrls(prev => ({ ...prev, [kind]: url }))
    } catch (err) {
      alert(err.message || `Could not upload the ${kind === 'before' ? 'before' : 'after'} image.`)
      setCompletionPreviewUrls(prev => ({ ...prev, [kind]: null }))
      setCropperState(null)
    } finally {
      setCompletionUploading(prev => ({ ...prev, [kind]: false }))
    }
  }

  const closeCompletionModal = () => {
    setCashModal(null)
    setCashAmt('')
    setRecommendedVisitDays('')
    resetCompletionUploads()
  }

  const confirmCancel = async () => {
    if (!cancelTarget) return
    await updateStatus(cancelTarget, 'cancelled', cancelReason)
    setCancelTarget(null)
    setCancelReason('')
  }
  const handleComplete = async () => {
    if (!cashModal || cashModal.status !== 'confirmed') return
    setUpdating(cashModal.id)
    const amt = parseFloat(cashAmt) || 0
    const beforeImageUrl = completionImageUrls.before?.trim() || ''
    const afterImageUrl = completionImageUrls.after?.trim() || ''
    try {
      const patch = {
        status: 'completed',
        amountCollected: amt,
        nextRecommendedVisitDays: recommendedVisitDays ? parseInt(recommendedVisitDays, 10) : null,
        beforeImageUrl: beforeImageUrl || null,
        afterImageUrl: afterImageUrl || null,
        updatedAt: serverTimestamp(),
        completedAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'bookings', cashModal.id), patch)
      patchBooking(cashModal.id, {
        ...patch,
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      await syncPublicStats(db)
      setToastType('success')
      setToastMessage('Appointment marked completed successfully.')
      if (cashModal.userId && cashModal.userId !== 'walkin') {
        await sendNotification(cashModal.userId, {
          userEmail: cashModal.userEmail || cashModal.customerEmail || cashModal.email || '',
          title: 'Appointment completed',
          message: `${cashModal.serviceName} for ${cashModal.petName} completed. Thank you!`,
          type: 'completed',
          bookingId: cashModal.id,
          actionUrl: '/my-bookings',
        })
      }
    } catch {
      setToastType('error')
      setToastMessage('Could not complete appointment. Please try again.')
    }
    closeCompletionModal()
    setUpdating(null)
  }

  const assignBooking = async (booking, assigneeId) => {
    if (!booking?.id || booking.status !== 'confirmed') return
    const assignee = assigneeOptions.find(item => item.id === assigneeId) || ownerAssignee
    const patch = buildAssigneePatch(assignee)
    setUpdating(booking.id)
    try {
      await updateDoc(doc(db, 'bookings', booking.id), patch)
      patchBooking(booking.id, patch)
      setToastType('success')
      setToastMessage('Team member assigned successfully.')
    } catch {
      setToastType('error')
      setToastMessage('Could not assign team member. Please try again.')
      alert('Could not assign team member. Please try again.')
    }
    setUpdating(null)
  }
  const stop = (event) => event.stopPropagation()
  const S = {
    meta: { display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0 },
    iconBtn: (color, bg) => ({ border: `1px solid ${color}`, background: bg, color }),
  }

  return (
    <div className="admin-bookings-page">
      {toastMessage && <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}><Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} /></div>}
      <div className="admin-bookings-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'nowrap' }}>
            <h1 style={{ margin: 0, whiteSpace: 'nowrap' }}>Bookings</h1>
            <div className="admin-view-toggle">
              <button
                type="button"
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => setViewMode('list')}
              >
                <List size={13} />
                <span>List</span>
              </button>
              <button
                type="button"
                className={viewMode === 'timeline' ? 'active' : ''}
                onClick={() => setViewMode('timeline')}
              >
                <CalendarDays size={13} />
                <span>Timeline</span>
              </button>
            </div>
          </div>
          <p style={{ marginTop: '6px' }}>
            {viewMode === 'list' ? (
              <>
                {filtered.length} of {bookings.length} bookings • showing {filtered.length ? pageStart + 1 : 0}-{Math.min(pageStart + PAGE_SIZE, filtered.length)}
              </>
            ) : (
              <>
                Floor Schedule • {formatDateNice(timelineDate)}
                {timelineDayBookings.length > 0 && <span>{timelineDayBookings.length} Bookings ({timelineDayBookings.filter(b => b.status === 'completed').length} Done)</span>}
              </>
            )}
          </p>
        </div>
      </div>

      {viewMode === 'list' && (
        <>
          {/* Search & Filter Bar: Single row with Search and Filter button beside it */}
      <div className="admin-booking-search-row">
        <div className="admin-booking-search">
          <Search size={15} />
          <input
            placeholder="Search name, pet, phone or ID"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="admin-search-clear-btn"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`admin-booking-filter-btn ${hasActiveFilters ? 'active' : ''}`}
          onClick={() => setShowFilterModal(true)}
        >
          <SlidersHorizontal size={15} />
          <span>Filters</span>
          {hasActiveFilters && (
            <span className="admin-filter-count-badge">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Quick Run Sheet Filter Pills */}
      <div className="admin-quick-filter-scroll" role="tablist" aria-label="Quick schedule filter">
        <button
          type="button"
          className={`admin-quick-pill ${quickFilter === 'all' ? 'active' : ''}`}
          onClick={() => setQuickFilter('all')}
        >
          All Bookings
        </button>
        <button
          type="button"
          className={`admin-quick-pill ${quickFilter === 'today' ? 'active' : ''}`}
          onClick={() => {
            setQuickFilter(prev => prev === 'today' ? 'all' : 'today')
            setDateFrom('')
            setDateTo('')
          }}
        >
          <Calendar size={13} />
          <span>Today</span>
          <span className="admin-quick-pill-count">{todayCount}</span>
        </button>
        <button
          type="button"
          className={`admin-quick-pill ${quickFilter === 'upcoming' ? 'active' : ''}`}
          onClick={() => {
            setQuickFilter(prev => prev === 'upcoming' ? 'all' : 'upcoming')
            setDateFrom('')
            setDateTo('')
          }}
        >
          <Clock size={13} />
          <span>Upcoming</span>
          <span className="admin-quick-pill-count">{upcomingCount}</span>
        </button>
      </div>

      {/* Active filters pill summary if any active */}
      {hasActiveFilters && (
        <div className="admin-active-filters-bar">
          <span style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600 }}>Active filters:</span>
          {quickFilter !== 'all' && (
            <span className="admin-filter-pill-tag">
              Schedule: {quickFilter === 'today' ? 'Today' : 'Upcoming'}
              <button type="button" onClick={() => setQuickFilter('all')} aria-label="Clear schedule filter"><X size={11} /></button>
            </span>
          )}
          {statusF !== 'all' && (
            <span className="admin-filter-pill-tag">
              Status: {statusLabel(statusF)}
              <button type="button" onClick={() => setStatusF('all')} aria-label="Clear status filter"><X size={11} /></button>
            </span>
          )}
          {serviceF !== 'all' && (
            <span className="admin-filter-pill-tag">
              Service: {serviceCatalog.find(s => s.id === serviceF)?.name || serviceF}
              <button type="button" onClick={() => setServiceF('all')} aria-label="Clear service filter"><X size={11} /></button>
            </span>
          )}
          {(dateFrom || dateTo) && (
            <span className="admin-filter-pill-tag">
              Dates: {dateFrom || '...'} to {dateTo || '...'}
              <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); setSearchParams({}) }} aria-label="Clear date filter"><X size={11} /></button>
            </span>
          )}
          <button type="button" className="admin-filter-reset-link" onClick={clearAllFilters}>
            Clear all
          </button>
        </div>
      )}

      {loading ? <Spinner text="Loading bookings..." /> : filtered.length === 0 ? (
        <div className="admin-booking-empty">No bookings found.</div>
      ) : (
        <div className="admin-booking-list">
          {paginated.map(b => (
            <div
              key={b.id}
              className="admin-booking-card"
              role="button"
              tabIndex={0}
              onClick={() => setSelectedBooking(b)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedBooking(b)
                }
              }}
            >
              <div className="admin-booking-main">
                <div className="admin-booking-title-row">
                  <strong>{b.ownerName || 'Customer'}</strong>
                  <span>{shortId(b.id)}</span>
                  {b.isWalkIn && <span className="badge badge-walkin">Walk-in</span>}
                  {(() => {
                    const custKey = (b.phone || b.userId || b.ownerName || '').trim().toLowerCase()
                    const custHistory = custKey ? customerHistoryMap.get(custKey) || [] : []
                    const visitCount = custHistory.length
                    if (visitCount > 1) {
                      return (
                        <button
                          type="button"
                          className="admin-booking-history-badge"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedCustomerHistory({
                              customerName: b.ownerName || 'Customer',
                              phone: b.phone || '-',
                              petName: b.petName || 'Pet',
                              history: custHistory,
                            })
                          }}
                          title="View customer visit history"
                        >
                          <Clock size={11} /> {visitCount} visits
                        </button>
                      )
                    }
                    return (
                      <span className="admin-booking-history-badge new-client" title="First-time client">
                        ⭐ New Client
                      </span>
                    )
                  })()}
                </div>
                <p>{b.petName || 'Pet'}{b.petType ? ` (${b.petType}${b.petBreed ? `, ${b.petBreed}` : ''})` : ''}</p>
                <p>{b.serviceName || 'Service'}{b.packageNames?.length > 0 ? ` + ${b.packageNames.join(', ')}` : ''}</p>
                <div className="admin-booking-min-meta">
                  <span style={S.meta}><Calendar size={13} /> {b.date || '-'}</span>
                  <span style={S.meta}><Clock size={13} /> {formatSlot(b.slot)}</span>
                  <span style={S.meta}><Phone size={13} /> {b.phone || '-'}</span>
                  <span style={S.meta}><UserRound size={13} /> Assigned: {getAssigneeLabel(assigneeFor(b))}</span>
                  {b.couponCode && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: 800 }}>
                      <Tag size={10} /> {b.couponCode} {b.discountAmount ? `(-Rs ${money(b.discountAmount)})` : ''}
                    </span>
                  )}
                  {b.amountCollected > 0 && <span className="admin-booking-money">Rs {money(b.amountCollected)}</span>}
                </div>
              </div>

              <div className="admin-booking-actions" onClick={stop}>
                <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`badge ${BADGE[b.status] || 'badge-pending'}`}>{statusLabel(b.status || 'pending')}</span>
                  {(b.rescheduleCount || 0) > 0 && (
                    <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.16)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.24)' }}>
                      Rescheduled
                    </span>
                  )}
                </span>
                {b.status === 'confirmed' && (
                  <select className="admin-booking-assignee-select" value={assigneeFor(b).id || OWNER_ASSIGNEE_ID} onChange={e => assignBooking(b, e.target.value)} disabled={updating === b.id} aria-label="Assign team member">
                    {assigneeOptions.map(member => <option key={member.id} value={member.id}>{getAssigneeLabel(member)}</option>)}
                  </select>
                )}
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginLeft: 'auto' }}>
                  {canRescheduleBooking(b) && (
                    <button type="button" onClick={() => openRescheduleModal(b)} disabled={updating === b.id || reschedulingId === b.id} style={S.iconBtn('#f59e0b', 'rgba(245, 158, 11, 0.12)')} className="admin-action">
                      <Clock size={14} /> <span className="action-label">Reschedule</span>
                    </button>
                  )}
                  {b.status === 'pending' && (
                    <button type="button" onClick={() => updateStatus(b, 'confirmed')} disabled={updating === b.id} style={S.iconBtn('#34d399', 'rgba(52,211,153,0.1)')} className="admin-action">
                      <CheckCircle2 size={14} /> <span className="action-label">Approve</span>
                    </button>
                  )}
                  {b.status === 'completed' && (
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/invoices?mode=appointment&id=${b.id}`)}
                      style={S.iconBtn('var(--accent)', 'var(--accent-bg)')}
                      className="admin-action"
                      title="Invoice"
                    >
                      <ReceiptText size={14} /> <span className="action-label">Invoice</span>
                    </button>
                  )}
                  {/* icon-only secondary actions (shrink on mobile) */}
                  {['pending', 'confirmed'].includes(b.status) && (
                    <button type="button" onClick={() => openCancelModal(b)} disabled={updating === b.id} style={S.iconBtn('#ef4444', 'rgba(239,68,68,0.1)')} className="admin-action icon-only" aria-label="Cancel">
                      <X size={14} /> <span className="action-label">Cancel</span>
                    </button>
                  )}
                  <a
                    href={getCustomerWhatsAppUrl(b, shopName, adminWhatsappNumber)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={S.iconBtn('#25D366', 'rgba(37,211,102,0.1)')}
                    className="admin-action icon-only"
                    aria-label="WA"
                    title={b.phone ? `WhatsApp customer: ${b.phone}` : 'WhatsApp'}
                  >
                    <MessageCircle size={14} /> <span className="action-label">WA</span>
                  </a>

                  {/* overflow removed — all actions shown inline; icon-only used for Cancel and WA on small screens */}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length > PAGE_SIZE && (
        <div className="admin-booking-pagination">
          <button type="button" onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}>Prev</button>
          <span>Page {currentPage} of {pageCount}</span>
          <button type="button" onClick={() => setPage(prev => Math.min(pageCount, prev + 1))} disabled={currentPage === pageCount}>Next</button>
        </div>
      )}

      {!loading && hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '14px', marginBottom: '14px' }}>
          <button
            type="button"
            onClick={loadMoreBookings}
            disabled={loadingMore}
            className="btn btn-outline"
            style={{
              fontSize: '13px',
              padding: '8px 18px',
              borderRadius: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: '600',
              cursor: loadingMore ? 'not-allowed' : 'pointer'
            }}
          >
            {loadingMore ? (
              <>
                <RotateCcw size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading older bookings...
              </>
            ) : (
              <>
                <Clock size={15} /> Load Older Bookings (+60)
              </>
            )}
          </button>
        </div>
      )}

              </>
      )}

      {viewMode === 'timeline' && (
        <div className="admin-timeline-wrapper">
          {/* Timeline Toolbar: Date Navigator + Staff Filter */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '12px 16px',
              marginBottom: '16px',
            }}
          >
            {/* Date Navigator: keep < [ Date ] > grouped together */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '6px 10px', borderRadius: '8px', minWidth: '34px', height: '36px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setTimelineDate(prev => addDaysLocal(prev, -1))}
                  title="Previous Day"
                >
                  <ChevronLeft size={16} />
                </button>

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="date"
                    value={timelineDate}
                    onChange={e => e.target.value && setTimelineDate(e.target.value)}
                    style={{
                      opacity: 0,
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                      zIndex: 2,
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)',
                      fontWeight: '700',
                      fontSize: '13px',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      height: '36px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Calendar size={14} style={{ color: 'var(--accent)' }} />
                    <span>{formatDateNice(timelineDate)}</span>
                    {timelineDate === todayKey && (
                      <span
                        style={{
                          fontSize: '10px',
                          background: 'rgba(52, 211, 153, 0.15)',
                          color: '#34d399',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: '800',
                        }}
                      >
                        TODAY
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '6px 10px', borderRadius: '8px', minWidth: '34px', height: '36px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setTimelineDate(prev => addDaysLocal(prev, 1))}
                  title="Next Day"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {timelineDate !== todayKey && (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', height: '36px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setTimelineDate(todayKey)}
                >
                  <RotateCcw size={13} /> Jump to Today
                </button>
              )}
            </div>

            {/* Staff Filter */}
            {assigneeOptions.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Floor Staff:</span>
                <select
                  value={timelineStaffFilter}
                  onChange={e => setTimelineStaffFilter(e.target.value)}
                  className="admin-select"
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontWeight: 600,
                  }}
                >
                  <option value="all">All Staff & Stations ({timelineDayBookings.length})</option>
                  {assigneeOptions.map(member => (
                    <option key={member.id} value={member.id}>
                      {getAssigneeLabel(member)}
                    </option>
                  ))}
                  <option value="unassigned">Unassigned</option>
                </select>
              </div>
            )}
          </div>

          {/* Day Metrics Quick Bar: 4 small boxes in a single line */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: '6px',
              marginBottom: '16px',
            }}
          >
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 4px', textAlign: 'center' }}>
              <span style={{ fontSize: '9.5px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Total</span>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>{timelineDayBookings.length}</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 4px', textAlign: 'center' }}>
              <span style={{ fontSize: '9.5px', color: '#60a5fa', textTransform: 'uppercase', fontWeight: 700, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>On Floor</span>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#60a5fa', marginTop: '2px' }}>
                {timelineDayBookings.filter(b => b.status === 'confirmed').length}
              </div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 4px', textAlign: 'center' }}>
              <span style={{ fontSize: '9.5px', color: '#34d399', textTransform: 'uppercase', fontWeight: 700, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Completed</span>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
                {timelineDayBookings.filter(b => b.status === 'completed').length}
              </div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 4px', textAlign: 'center' }}>
              <span style={{ fontSize: '9.5px', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 700, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Pending</span>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#fbbf24', marginTop: '2px' }}>
                {timelineDayBookings.filter(b => b.status === 'pending').length}
              </div>
            </div>
          </div>

          {/* Timeline Grid */}
          {loading ? (
            <Spinner text="Loading floor schedule..." />
          ) : (
            <div className="admin-timeline-container">
              {TIMELINE_HOURS.map(({ hour24, label }) => {
                const hourBookings = timelineDayBookings.filter(b => getBookingHour24(b) === hour24)
                const isNow = timelineDate === todayKey && new Date().getHours() === hour24

                return (
                  <div key={hour24} className={`admin-timeline-slot-row ${isNow ? 'active-now' : ''}`}>
                    {/* Time Column */}
                    <div className="admin-timeline-time-col">
                      <span className="admin-timeline-time-label">{label}</span>
                    </div>

                    {/* Content Column */}
                    <div className="admin-timeline-content-col">
                      {isNow && <div className="admin-timeline-now-pill">● LIVE NOW</div>}

                      {hourBookings.length > 0 ? (
                        hourBookings.map(b => {
                          const assignee = assigneeFor(b)
                          const petIcon = b.petType?.toLowerCase() === 'cat' ? '🐱' : '🐶'
                          return (
                            <div
                              key={b.id}
                              className={`admin-timeline-card status-${b.status}`}
                              onClick={() => setSelectedBooking(b)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '18px' }}>{petIcon}</span>
                                  <div>
                                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
                                      {b.petName || 'Pet'}
                                      {b.petBreed ? <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500, marginLeft: '6px' }}>({b.petBreed})</span> : null}
                                    </div>
                                    <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                                      Parent: <strong style={{ color: 'var(--text)' }}>{b.ownerName || 'Customer'}</strong>
                                      {b.phone ? ` • ${b.phone}` : ''}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {b.slot && (
                                    <span style={{ fontSize: '11.5px', fontFamily: 'DM Mono, monospace', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                      {b.slot}
                                    </span>
                                  )}
                                  <span className={`badge ${BADGE[b.status] || 'badge-pending'}`}>
                                    {statusLabel(b.status)}
                                  </span>
                                  {b.isWalkIn && <span className="badge badge-walkin">Walk-in</span>}
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                    ✂️ {b.serviceName || 'Pet Grooming'}
                                  </span>
                                  <span style={{ color: 'var(--muted)' }}>
                                    {b.bookingType === 'home' ? '🏠 Home Visit' : '🏬 In-Store'}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                                  <span style={{
                                    fontSize: '11.5px',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: 'var(--surface-2, rgba(255,255,255,0.04))',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text)',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}>
                                    <User size={12} style={{ color: 'var(--accent)' }} />
                                    {assignee ? getAssigneeLabel(assignee) : 'Unassigned'}
                                  </span>
                                  <span style={{ fontWeight: 800, color: '#34d399', fontFamily: 'DM Mono, monospace' }}>
                                    Rs {money(b.amountCollected || b.estimatedTotal)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <div className="admin-timeline-empty-slot">
                          <span>Slot open • No appointments booked</span>
                          <button
                            type="button"
                            onClick={() => navigate('/admin/dashboard?action=walkin')}
                            className="btn btn-outline"
                            style={{ fontSize: '11.5px', padding: '4px 10px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Plus size={12} /> Walk-in
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          adminWhatsappNumber={adminWhatsappNumber}
          shopName={shopName}
          updating={updating}
          assignee={assigneeFor(selectedBooking)}
          assigneeOptions={assigneeOptions}
          serviceCatalog={serviceCatalog}
          packageOptions={packageOptions}
          bookingSettings={bookingSettings}
          onAssign={assignBooking}
          onSave={saveBookingUpdates}
          onClose={() => { setSelectedBooking(null); if (bookingId) navigate('/admin/bookings') }}
          onStatus={updateStatus}
          onCancelBooking={openCancelModal}
          onReschedule={openRescheduleModal}
          canReschedule={canRescheduleBooking(selectedBooking)}
        />
      )}

      {rescheduleTarget && (
        <div className="modal-overlay" onClick={() => setRescheduleTarget(null)}>
          <div className="modal-box admin-booking-cash-modal" onClick={e => e.stopPropagation()}>
            <div>
              <h2>Reschedule Appointment</h2>
              <p>{rescheduleTarget.ownerName || 'Customer'} · {rescheduleTarget.serviceName || 'Service'} · {rescheduleTarget.date}</p>
              <label>New Date</label>
              <input type="date" className="input" min={dateKeyLocal()} value={rescheduleDate} onChange={e => { setRescheduleDate(e.target.value); setRescheduleSlot('') }} />
              {rescheduleDate && (
                <div style={{ marginTop: '14px' }}>
                  <label>New Time</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', marginTop: '8px' }}>
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
              <div className="admin-booking-modal-actions" style={{ marginTop: '16px' }}>
                <button onClick={() => setRescheduleTarget(null)} className="btn btn-secondary">Cancel</button>
                <button onClick={confirmReschedule} className="btn btn-primary" disabled={!rescheduleDate || !rescheduleSlot || reschedulingId === rescheduleTarget.id || !bookableRescheduleSlots.includes(rescheduleSlot) || rescheduleBookedSlots.includes(rescheduleSlot)}>
                  {reschedulingId === rescheduleTarget.id ? 'Rescheduling...' : 'Confirm Reschedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!cancelTarget}
        title="Cancel booking?"
        message={cancelTarget ? `Cancel ${cancelTarget.serviceName || 'this appointment'} for ${cancelTarget.ownerName || 'this customer'} on ${cancelTarget.date || 'this date'} at ${formatSlot(cancelTarget.slot)}?` : ''}
        confirmText="Yes, cancel"
        cancelText="Keep booking"
        loading={!!cancelTarget && updating === cancelTarget.id}
        onCancel={() => { setCancelTarget(null); setCancelReason('') }}
        onConfirm={confirmCancel}
        reasonLabel="Cancellation reason"
        reasonPlaceholder="Enter the reason for cancelling this appointment"
        reasonValue={cancelReason}
        onReasonChange={setCancelReason}
        reasonRequired
      />

      {/* ============================================================
          BOOKING FILTERS MODAL / BOTTOM SHEET
          ============================================================ */}
      {showFilterModal && (
        <div className="admin-filter-modal-overlay" onClick={() => setShowFilterModal(false)}>
          <div className="admin-filter-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="admin-filter-sheet-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SlidersHorizontal size={18} color="var(--accent)" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text)' }}>Booking Filters</h3>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowFilterModal(false)}
                aria-label="Close filters"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-filter-sheet-body">
              {/* Status filter */}
              <div className="admin-filter-field">
                <label>Status</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {STATUS_OPTS.map(s => {
                    const active = statusF === s
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatusF(s)}
                        style={{
                          padding: '7px 12px',
                          borderRadius: '8px',
                          border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: active ? 'var(--accent-bg)' : 'var(--surface)',
                          color: active ? 'var(--accent)' : 'var(--text)',
                          fontSize: '12.5px',
                          fontWeight: active ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {s === 'all' ? 'All Status' : statusLabel(s)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Service filter */}
              <div className="admin-filter-field">
                <label>Service</label>
                <select
                  className="input"
                  value={serviceF}
                  onChange={e => setServiceF(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px' }}
                >
                  <option value="all">All Services</option>
                  {serviceCatalog.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Date filters */}
              <div className="admin-filter-field">
                <label>Date Range (Optional)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '3px' }}>From Date</span>
                    <input
                      type="date"
                      className="input"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '8px' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '3px' }}>To Date</span>
                    <input
                      type="date"
                      className="input"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '8px' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-filter-sheet-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearAllFilters}
                style={{ fontSize: '13px', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <RotateCcw size={14} /> Reset
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowFilterModal(false)}
                style={{ fontSize: '13px', padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Check size={14} /> Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCustomerHistory && (
        <div className="modal-overlay" onClick={() => setSelectedCustomerHistory(null)}>
          <div className="modal-box" style={{ maxWidth: '520px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                  <UserRound size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                    {selectedCustomerHistory.customerName}
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    Phone: {selectedCustomerHistory.phone} • {selectedCustomerHistory.history.length} Total Visits
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSelectedCustomerHistory(null)}
                aria-label="Close history"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'grid', gap: '10px', flex: 1 }}>
              {selectedCustomerHistory.history.map(item => (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'grid',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <strong style={{ fontSize: '13.5px', color: 'var(--text)' }}>
                      {item.serviceName || 'Grooming Service'}
                    </strong>
                    <span className={`badge ${BADGE[item.status] || 'badge-pending'}`} style={{ fontSize: '10.5px' }}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--muted)', flexWrap: 'wrap' }}>
                    <span>🐾 {item.petName || 'Pet'}{item.petBreed ? ` (${item.petBreed})` : ''}</span>
                    <span>📅 {item.date || '-'} {item.slot ? `• ${formatSlot(item.slot)}` : ''}</span>
                    {item.amountCollected > 0 && <span style={{ fontWeight: 700, color: 'var(--text)' }}>₹{money(item.amountCollected)}</span>}
                  </div>
                  {item.assignedTeamMemberName && (
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Groomer: <strong>{item.assignedTeamMemberName}</strong>
                    </div>
                  )}
                  {item.notes && (
                    <div style={{ fontSize: '11.5px', background: 'rgba(0,0,0,0.03)', padding: '6px 10px', borderRadius: '6px', color: 'var(--text)', borderLeft: '3px solid var(--accent)' }}>
                      <em>"{item.notes}"</em>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedCustomerHistory(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {cashModal && (
        <div className="modal-overlay" onClick={closeCompletionModal}>
          <div className="modal-box admin-booking-cash-modal" onClick={e => e.stopPropagation()}>
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: 'Playfair Display, serif', fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>Complete Appointment</h2>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>{cashModal.ownerName} · {cashModal.serviceName} · {cashModal.date}</p>
                </div>
                <button
                  type="button"
                  onClick={closeCompletionModal}
                  aria-label="Close completion modal"
                  style={{
                    width: '32px',
                    height: '32px',
                    flexShrink: 0,
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Promo / Discount summary breakdown if applied */}
              {(cashModal.couponCode || Number(cashModal.discountAmount) > 0) ? (
                <div style={{
                  background: 'rgba(217, 119, 6, 0.07)',
                  border: '1.5px dashed var(--gold, #d97706)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  margin: '12px 0 16px',
                  fontSize: '13px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--muted)' }}>
                    <span>Estimated Subtotal</span>
                    <span>Rs {money(cashModal.originalSubtotal || ((Number(cashModal.estimatedTotal) || 0) + (Number(cashModal.discountAmount) || 0)))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#16a34a', fontWeight: 700 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <Tag size={13} /> Offer Applied ({cashModal.couponCode || 'PROMO'})
                    </span>
                    <span>-Rs {money(cashModal.discountAmount || 0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(217, 119, 6, 0.2)', paddingTop: '6px', fontWeight: 800, color: 'var(--text)' }}>
                    <span>Estimated Total (Autofilled)</span>
                    <span style={{ color: 'var(--gold-dark, #b45309)' }}>
                      Rs {money(cashModal.estimatedTotal || Math.max(0, (Number(cashModal.originalSubtotal) || 0) - (Number(cashModal.discountAmount) || 0)))}
                    </span>
                  </div>
                </div>
              ) : (Number(cashModal.estimatedTotal) > 0 || cashModal.price) ? (
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  margin: '12px 0 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '13px',
                }}>
                  <span style={{ color: 'var(--muted)' }}>Estimated Appointment Total:</span>
                  <strong style={{ color: 'var(--text)', fontSize: '14px' }}>
                    Rs {money(cashModal.estimatedTotal || parseFloat(String(cashModal.price || '').replace(/[^0-9.]/g, '')) || 0)}
                  </strong>
                </div>
              ) : null}

              {/* Redesigned Cash Collected */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>
                  <IndianRupee size={13} /> Cash Collected (Rs)
                </label>
                <div style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--surface)',
                  border: '1.5px solid var(--accent-border, var(--border))',
                  borderRadius: '12px',
                  padding: '0 12px',
                }}>
                  <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--gold-dark, #b45309)', marginRight: '6px' }}>Rs</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 600"
                    value={cashAmt}
                    onChange={e => setCashAmt(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '10px 0',
                      border: 'none',
                      background: 'transparent',
                      fontSize: '16px',
                      fontWeight: 700,
                      color: 'var(--text)',
                      outline: 'none',
                    }}
                  />
                </div>
                {cashAmt && (
                  <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: 700, marginTop: '5px', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    ✓ Rs {money(cashAmt)} will be recorded
                  </p>
                )}
              </div>

              {/* Redesigned Next Recommended Visit */}
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>
                    <Calendar size={13} /> Next Recommended Visit (Days)
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Optional</span>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--surface)',
                  border: '1.5px solid var(--border)',
                  borderRadius: '12px',
                  padding: '0 12px',
                }}>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 30"
                    value={recommendedVisitDays}
                    onChange={e => setRecommendedVisitDays(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 0',
                      border: 'none',
                      background: 'transparent',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text)',
                      outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>days</span>
                </div>
                {/* 1-tap quick interval chips */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {[15, 30, 45, 60].map(days => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setRecommendedVisitDays(String(days))}
                      style={{
                        padding: '3px 9px',
                        borderRadius: '999px',
                        border: `1px solid ${recommendedVisitDays === String(days) ? 'var(--gold, #d97706)' : 'var(--border)'}`,
                        background: recommendedVisitDays === String(days) ? 'rgba(217, 119, 6, 0.12)' : 'var(--surface)',
                        color: recommendedVisitDays === String(days) ? 'var(--gold-dark, #b45309)' : 'var(--muted)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>

              {/* Redesigned Before & After Images (Side-by-side) */}
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>
                    <Camera size={13} /> Service Photos
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Optional</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                  {/* Before Upload Card */}
                  <div style={{
                    border: '1.5px dashed var(--border)',
                    borderRadius: '12px',
                    padding: '8px',
                    background: 'var(--surface)',
                    textAlign: 'center',
                    minHeight: '105px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}>
                    <span style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Before</span>
                    {completionPreviewUrls.before ? (
                      <div style={{ width: '100%', position: 'relative' }}>
                        <img src={completionPreviewUrls.before} alt="Before" style={{ width: '100%', height: '70px', objectFit: 'cover', borderRadius: '8px' }} />
                        <button
                          type="button"
                          onClick={() => removeCompletionImage('before')}
                          aria-label="Remove before image"
                          style={{
                            position: 'absolute',
                            top: '-5px',
                            right: '-5px',
                            width: '20px',
                            height: '20px',
                            borderRadius: '999px',
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <label style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        cursor: 'pointer',
                        color: 'var(--accent)',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        padding: '6px 4px',
                        width: '100%',
                      }}>
                        <Upload size={16} />
                        <span>{completionUploading.before ? 'Uploading...' : 'Upload'}</span>
                        <input type="file" accept={IMAGE_FILE_ACCEPT} style={{ display: 'none' }} onChange={e => openCompletionCropper('before', e.target.files?.[0])} />
                      </label>
                    )}
                  </div>

                  {/* After Upload Card */}
                  <div style={{
                    border: '1.5px dashed var(--border)',
                    borderRadius: '12px',
                    padding: '8px',
                    background: 'var(--surface)',
                    textAlign: 'center',
                    minHeight: '105px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}>
                    <span style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>After</span>
                    {completionPreviewUrls.after ? (
                      <div style={{ width: '100%', position: 'relative' }}>
                        <img src={completionPreviewUrls.after} alt="After" style={{ width: '100%', height: '70px', objectFit: 'cover', borderRadius: '8px' }} />
                        <button
                          type="button"
                          onClick={() => removeCompletionImage('after')}
                          aria-label="Remove after image"
                          style={{
                            position: 'absolute',
                            top: '-5px',
                            right: '-5px',
                            width: '20px',
                            height: '20px',
                            borderRadius: '999px',
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <label style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        cursor: 'pointer',
                        color: 'var(--accent)',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        padding: '6px 4px',
                        width: '100%',
                      }}>
                        <Upload size={16} />
                        <span>{completionUploading.after ? 'Uploading...' : 'Upload'}</span>
                        <input type="file" accept={IMAGE_FILE_ACCEPT} style={{ display: 'none' }} onChange={e => openCompletionCropper('after', e.target.files?.[0])} />
                      </label>
                    )}
                  </div>
                </div>
                <p style={{ color: 'var(--muted)', fontSize: '10.5px', margin: '6px 0 0', textAlign: 'center' }}>
                  Images optional • Auto-compressed to ~1 MB
                </p>
              </div>

              {/* Single "Mark Complete" Button (Cancel moved to top cross mark) */}
              <div style={{ marginTop: '18px' }}>
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={updating === cashModal.id || completionUploading.before || completionUploading.after}
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '14.5px',
                    fontWeight: 800,
                    borderRadius: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <CheckCircle2 size={17} /> {updating === cashModal.id ? 'Completing...' : 'Mark Complete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cropperState && (
        <div className="modal-overlay" onClick={() => setCropperState(null)}>
          <div className="modal-box" style={{ maxWidth: '720px', width: 'min(720px, calc(100vw - 24px))', padding: '18px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '16px' }}>Crop {cropperState.kind === 'before' ? 'Before' : 'After'} Image</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '12px' }}>Adjust the frame and confirm to upload the cropped image.</p>
              </div>
              <button type="button" onClick={() => setCropperState(null)} aria-label="Close cropper"><X size={18} /></button>
            </div>
            <div style={{ position: 'relative', width: '100%', height: '360px', background: '#111', borderRadius: '12px', overflow: 'hidden' }}>
              <Cropper
                image={cropperState.src}
                crop={cropperState.crop}
                zoom={cropperState.zoom}
                aspect={4 / 3}
                onCropChange={crop => setCropperState(prev => prev ? { ...prev, crop } : prev)}
                onZoomChange={zoom => setCropperState(prev => prev ? { ...prev, zoom } : prev)}
                onCropComplete={(_, croppedAreaPixels) => setCropperState(prev => prev ? { ...prev, croppedAreaPixels } : prev)}
                showGrid={false}
              />
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
              <input type="range" min={1} max={3} step={0.1} value={cropperState.zoom} onChange={e => setCropperState(prev => prev ? { ...prev, zoom: Number(e.target.value) } : prev)} style={{ flex: 1, maxWidth: '220px' }} />
              <button type="button" className="btn btn-secondary" onClick={() => setCropperState(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={confirmCompletionCrop} disabled={completionUploading[cropperState.kind]}>{completionUploading[cropperState.kind] ? 'Uploading...' : 'Confirm Crop'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function cancellationActor(booking) {
  if (booking.cancelledBy === 'admin') return 'Paw Paw'
  if (booking.cancelledBy === 'user') return booking.ownerName || 'Customer'
  return '-'
}

function BookingDetailModal({ booking, adminWhatsappNumber, shopName, updating, assignee, assigneeOptions, serviceCatalog, packageOptions, bookingSettings, onAssign, onSave, onClose, onStatus, onCancelBooking, onReschedule, canReschedule }) {
  const navigate = useNavigate()
  const [lightboxImage, setLightboxImage] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editServiceIds, setEditServiceIds] = useState(Array.isArray(booking.serviceIds) && booking.serviceIds.length ? booking.serviceIds : booking.serviceId ? [booking.serviceId] : [])
  const [editPackageIds, setEditPackageIds] = useState(Array.isArray(booking.selectedPackages) ? booking.selectedPackages : [])
  const [editBookingType, setEditBookingType] = useState(booking.bookingType || 'store')
  const [editAddress, setEditAddress] = useState(booking.address || '')
  const [editDate, setEditDate] = useState(booking.date || '')
  const [editSlot, setEditSlot] = useState(booking.slot || '')
  const [editAmountCollected, setEditAmountCollected] = useState(booking.amountCollected != null ? String(booking.amountCollected) : '')
  const [editVisitCharge, setEditVisitCharge] = useState(booking.visitCharge != null ? String(booking.visitCharge) : '')
  const [editAssignedTeamMemberId, setEditAssignedTeamMemberId] = useState(assignee?.id || OWNER_ASSIGNEE_ID)
  const [editError, setEditError] = useState('')
  const [showServicePackageOptions, setShowServicePackageOptions] = useState(false)

  useEffect(() => {
    const initialServiceIds = Array.isArray(booking.serviceIds) && booking.serviceIds.length
      ? booking.serviceIds
      : booking.serviceId
        ? [booking.serviceId]
        : []
    const initialPackages = Array.isArray(booking.selectedPackages) && booking.selectedPackages.length
      ? booking.selectedPackages
      : Array.isArray(booking.packageNames) && booking.packageNames.length
        ? packageOptions.filter(pkg => booking.packageNames.includes(pkg.name)).map(pkg => pkg.id)
        : []

    setEditServiceIds(initialServiceIds)
    setEditPackageIds(initialPackages)
    setEditBookingType(booking.bookingType || 'store')
    setEditAddress(booking.address || '')
    setEditDate(booking.date || '')
    setEditSlot(booking.slot || '')
    setEditAmountCollected(booking.amountCollected != null ? String(booking.amountCollected) : '')
    setEditVisitCharge(booking.visitCharge != null ? String(booking.visitCharge) : '')
    setEditAssignedTeamMemberId(assignee?.id || OWNER_ASSIGNEE_ID)
    setEditError('')
    setShowServicePackageOptions(false)
    setIsEditing(false)
  }, [booking, packageOptions, assignee])

  const canEditBooking = ['confirmed', 'completed'].includes(booking.status)
  const displayServices = Array.isArray(booking.serviceNames) && booking.serviceNames.length
    ? booking.serviceNames
    : booking.serviceName
      ? [booking.serviceName]
      : []
  const displayPackages = Array.isArray(booking.packageNames) && booking.packageNames.length
    ? booking.packageNames
    : []
  const currentServices = serviceCatalog.filter(service => editServiceIds.includes(service.id))
  const currentServiceNames = currentServices.length ? currentServices.map(service => service.name) : []
  const selectedPackages = packageOptions.filter(pkg => editPackageIds.includes(pkg.id))
  const availability = editDate ? getAvailabilityForDate(bookingSettings || undefined, editDate) : { open: false, storeSlots: [], homeSlots: [] }
  const availableSlots = editBookingType === 'home' ? availability.homeSlots : availability.storeSlots

  const togglePackage = (id) => {
    setEditError('')
    setEditPackageIds(prev => prev.includes(id) ? prev.filter(pkgId => pkgId !== id) : [...prev, id])
  }

  const toggleService = (id) => {
    setEditError('')
    setEditServiceIds(prev => prev.includes(id) ? prev.filter(svcId => svcId !== id) : [...prev, id])
  }

  const saveBookingChanges = async () => {
    if (!editServiceIds.length && !editPackageIds.length) {
      setEditError('Select at least one service or package before saving.')
      return
    }

    const serviceNameValue = currentServiceNames.length
      ? currentServiceNames.join(', ')
      : selectedPackages.map(pkg => pkg.name).join(', ')

    const selectedAssignee = assigneeOptions.find(item => item.id === editAssignedTeamMemberId) || ownerAssignee
    const patch = {
      serviceId: editServiceIds[0] || '',
      serviceName: serviceNameValue,
      serviceIds: editServiceIds,
      serviceNames: currentServiceNames,
      selectedPackages: editPackageIds,
      packageNames: selectedPackages.map(pkg => pkg.name),
      bookingType: editBookingType,
      address: editBookingType === 'home' ? editAddress : '',
      date: editDate,
      slot: editSlot,
      amountCollected: parseFloat(editAmountCollected) || 0,
      visitCharge: parseFloat(editVisitCharge) || 0,
      ...buildAssigneePatch(selectedAssignee),
    }
    const startDate = parseAppointmentStart({ date: editDate, slot: editSlot })
    if (startDate) patch.bookingStartAt = Timestamp.fromDate(startDate)
    await onSave(booking.id, patch)
  }

  const canEditDateTime = !!booking.isWalkIn

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box admin-booking-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="admin-booking-detail-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
              <span className={`badge ${BADGE[booking.status] || 'badge-pending'}`}>{statusLabel(booking.status || 'pending')}</span>
              {(booking.rescheduleCount || 0) > 0 && (
                <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.16)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.24)' }}>
                  Rescheduled {booking.rescheduleCount}x
                </span>
              )}
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', background: 'var(--surface)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                {shortId(booking.id)}
              </span>
            </div>
            <h2>{booking.ownerName || 'Customer'}</h2>
            <p>
              Requested {formatDateTime(booking.createdAt)} • {booking.isWalkIn ? 'Walk-in' : 'Online Booking'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {canEditBooking && !isEditing && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsEditing(true)}
                style={{ fontSize: '12.5px', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <Edit3 size={13} /> <span>Edit</span>
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close booking details"><X size={18} /></button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="admin-booking-detail-body">
          {!isEditing ? (
            <>
              {/* Card 1: Services & Appointment */}
              <div className="admin-detail-card">
                <div className="admin-detail-card-head">
                  <h4 className="admin-detail-card-title">
                    <Scissors size={13} /> Services & Appointment
                  </h4>
                </div>
                <div className="admin-detail-kv-grid">
                  <div className="admin-detail-kv-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="admin-detail-kv-label">Services Selected</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                      {displayServices.length > 0 ? (
                        displayServices.map((svc, i) => (
                          <span key={i} style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'rgba(217, 119, 6, 0.1)',
                            color: 'var(--gold-dark, #b45309)',
                            border: '1px solid rgba(217, 119, 6, 0.28)',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            fontSize: '13px',
                            fontWeight: 700
                          }}>
                            ✂️ {svc}
                          </span>
                        ))
                      ) : (
                        <span className="admin-detail-kv-value">-</span>
                      )}
                    </div>
                  </div>

                  {displayPackages.length > 0 && (
                    <div className="admin-detail-kv-item" style={{ gridColumn: '1 / -1' }}>
                      <span className="admin-detail-kv-label">Packages Selected</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                        {displayPackages.map((pkg, i) => (
                          <span key={i} style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'rgba(59, 130, 246, 0.1)',
                            color: '#1d4ed8',
                            border: '1px solid rgba(59, 130, 246, 0.28)',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            fontSize: '13px',
                            fontWeight: 700
                          }}>
                            📦 {pkg}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Appointment Date</span>
                    <span className="admin-detail-kv-value" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Calendar size={13} /> {booking.date || '-'}
                    </span>
                  </div>

                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Time Slot</span>
                    <span className="admin-detail-kv-value" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Clock size={13} /> {formatSlot(booking.slot)}
                    </span>
                  </div>

                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Visit Type</span>
                    <span className="admin-detail-kv-value" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <MapPin size={13} /> {getBookingTypeLabel(booking.bookingType || 'store')}
                    </span>
                  </div>

                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Estimated Total</span>
                    <span className="admin-detail-kv-value" style={{ fontWeight: 800, color: 'var(--gold-dark, #b45309)', fontSize: '13.5px' }}>
                      Rs {money(booking.estimatedTotal || 0)}
                    </span>
                  </div>

                  {booking.bookingType === 'home' && booking.address && (
                    <div className="admin-detail-kv-item" style={{ gridColumn: '1 / -1' }}>
                      <span className="admin-detail-kv-label">Home Visit Address</span>
                      <span className="admin-detail-kv-value" style={{ fontWeight: 600 }}>📍 {booking.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: Customer & Pet Information */}
              <div className="admin-detail-card">
                <div className="admin-detail-card-head">
                  <h4 className="admin-detail-card-title">
                    <User size={13} /> Customer & Pet Info
                  </h4>
                </div>
                <div className="admin-detail-kv-grid">
                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Pet Owner</span>
                    <span className="admin-detail-kv-value">{booking.ownerName || '-'}</span>
                  </div>
                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Phone</span>
                    <span className="admin-detail-kv-value">
                      {booking.phone ? (
                        <a href={`tel:${booking.phone}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 700 }}>
                          {booking.phone}
                        </a>
                      ) : '-'}
                    </span>
                  </div>
                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Pet Name</span>
                    <span className="admin-detail-kv-value" style={{ fontWeight: 700 }}>
                      {booking.petName || '-'}
                    </span>
                  </div>
                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Pet Type / Breed</span>
                    <span className="admin-detail-kv-value">
                      {booking.petType ? `${booking.petType}${booking.petBreed ? ` • ${booking.petBreed}` : ''}` : '-'}
                    </span>
                  </div>
                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Booking Source</span>
                    <span className="admin-detail-kv-value">{booking.isWalkIn ? 'Walk-in' : 'Online Booking'}</span>
                  </div>
                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Request Sent</span>
                    <span className="admin-detail-kv-value">{formatDateTime(booking.createdAt)}</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Pricing & Payment Breakdown */}
              <div className="admin-detail-card">
                <div className="admin-detail-card-head">
                  <h4 className="admin-detail-card-title">
                    <IndianRupee size={13} /> Pricing & Payment
                  </h4>
                  {booking.couponCode && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(217, 119, 6, 0.1)', color: 'var(--gold-dark, #b45309)', border: '1px solid var(--accent-border)', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: 800 }}>
                      <Tag size={11} /> {booking.couponCode}
                    </span>
                  )}
                </div>
                <div className="admin-detail-kv-grid">
                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Estimated Total</span>
                    <span className="admin-detail-kv-value" style={{ fontWeight: 800, color: 'var(--gold-dark, #b45309)' }}>
                      {booking.estimatedTotal > 0 ? `Rs ${money(booking.estimatedTotal)}` : (booking.price || '-')}
                    </span>
                  </div>
                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Amount Collected</span>
                    <span className="admin-detail-kv-value" style={{ fontWeight: 700, color: booking.amountCollected > 0 ? '#16a34a' : 'var(--muted)' }}>
                      {booking.amountCollected > 0 ? `Rs ${money(booking.amountCollected)}` : 'Pending'}
                    </span>
                  </div>
                  {booking.visitCharge > 0 && (
                    <div className="admin-detail-kv-item">
                      <span className="admin-detail-kv-label">Home Visit Charge</span>
                      <span className="admin-detail-kv-value">Rs {money(booking.visitCharge)}</span>
                    </div>
                  )}
                  {booking.discountAmount > 0 && (
                    <div className="admin-detail-kv-item">
                      <span className="admin-detail-kv-label">Discount Applied</span>
                      <span className="admin-detail-kv-value" style={{ color: '#16a34a', fontWeight: 700 }}>
                        -Rs {money(booking.discountAmount)}
                      </span>
                    </div>
                  )}
                  {booking.nextVisitDays && (
                    <div className="admin-detail-kv-item">
                      <span className="admin-detail-kv-label">Next Recommended Visit</span>
                      <span className="admin-detail-kv-value">In {booking.nextVisitDays} days</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 4: Team Assignment & Operational Info */}
              <div className="admin-detail-card">
                <div className="admin-detail-card-head">
                  <h4 className="admin-detail-card-title">
                    <UserRound size={13} /> Assignment & Status
                  </h4>
                </div>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <div className="admin-detail-kv-item">
                    <span className="admin-detail-kv-label">Assigned Team Member</span>
                    {booking.status === 'confirmed' ? (
                      <select
                        className="input"
                        value={assignee?.id || OWNER_ASSIGNEE_ID}
                        onChange={e => onAssign(booking, e.target.value)}
                        disabled={updating === booking.id}
                        style={{ marginTop: '4px', width: '100%', padding: '7px 10px', fontSize: '13px' }}
                      >
                        {assigneeOptions.map(member => (
                          <option key={member.id} value={member.id}>{getAssigneeLabel(member)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="admin-detail-kv-value" style={{ marginTop: '2px', fontWeight: 600 }}>
                        {getAssigneeLabel(assignee)}
                      </span>
                    )}
                  </div>

                  {booking.notes && (
                    <div className="admin-detail-kv-item" style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                      <span className="admin-detail-kv-label">Customer Notes</span>
                      <span className="admin-detail-kv-value" style={{ fontWeight: 500, fontSize: '12.5px' }}>
                        {booking.notes}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 4: Cancellation Alert (if cancelled) */}
              {booking.status === 'cancelled' && (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '14px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b', fontWeight: 800, fontSize: '12.5px', marginBottom: '6px' }}>
                    <ShieldAlert size={15} /> Appointment Cancelled
                  </div>
                  <div className="admin-detail-kv-grid" style={{ gap: '6px 12px' }}>
                    <div>
                      <span style={{ fontSize: '10.5px', color: '#b91c1c', fontWeight: 700, display: 'block' }}>Cancelled By</span>
                      <span style={{ fontSize: '12px', color: '#7f1d1d', fontWeight: 600 }}>{cancellationActor(booking)}</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '10.5px', color: '#b91c1c', fontWeight: 700, display: 'block' }}>Cancelled At</span>
                      <span style={{ fontSize: '12px', color: '#7f1d1d', fontWeight: 600 }}>{formatDateTime(booking.cancelledAt)}</span>
                    </div>
                    <div style={{ gridColumn: '1 / -1', marginTop: '4px' }}>
                      <span style={{ fontSize: '10.5px', color: '#b91c1c', fontWeight: 700, display: 'block' }}>Reason</span>
                      <span style={{ fontSize: '12.5px', color: '#991b1b', fontWeight: 600 }}>{booking.cancellationReason || 'No reason provided'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Card 5: Before & After Photos */}
              {(booking.beforeImageUrl || booking.afterImageUrl) && (
                <div className="admin-detail-card">
                  <div className="admin-detail-card-head">
                    <h4 className="admin-detail-card-title">
                      <Camera size={13} /> Before & After Photos
                    </h4>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                    {booking.beforeImageUrl && (
                      <button
                        type="button"
                        onClick={() => setLightboxImage({ url: booking.beforeImageUrl, label: 'Before' })}
                        style={{ padding: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Before</span>
                        <img src={booking.beforeImageUrl} alt="Before appointment" style={{ width: '100%', borderRadius: '10px', objectFit: 'cover', aspectRatio: '4/3', border: '1px solid var(--border)' }} />
                      </button>
                    )}
                    {booking.afterImageUrl && (
                      <button
                        type="button"
                        onClick={() => setLightboxImage({ url: booking.afterImageUrl, label: 'After' })}
                        style={{ padding: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>After</span>
                        <img src={booking.afterImageUrl} alt="After appointment" style={{ width: '100%', borderRadius: '10px', objectFit: 'cover', aspectRatio: '4/3', border: '1px solid var(--border)' }} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Edit Panel */
            <div className="admin-booking-edit-panel" style={{ padding: '4px 0' }}>
              <div style={{ marginBottom: '14px' }}>
                <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '15px', fontWeight: 800 }}>
                  {booking.status === 'completed' ? 'Edit completed booking' : 'Edit confirmed booking'}
                </h3>
              </div>

              <div style={{ display: 'grid', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, color: 'var(--muted)', fontSize: '12px' }}>Services / Packages</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', minHeight: '44px', padding: '8px 10px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
                    {currentServices.map(service => (
                      <span key={service.id} style={{ padding: '4px 10px', borderRadius: '999px', background: 'rgba(164, 118, 0, 0.12)', color: '#8f6a00', fontSize: '12px', fontWeight: 700 }}>
                        {service.name}
                      </span>
                    ))}
                    {selectedPackages.map(pkg => (
                      <span key={pkg.id} style={{ padding: '4px 10px', borderRadius: '999px', background: 'rgba(0, 91, 139, 0.12)', color: '#005b8b', fontSize: '12px', fontWeight: 700 }}>
                        {pkg.name}
                      </span>
                    ))}
                    {!currentServices.length && !selectedPackages.length && (
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>No service or package selected</span>
                    )}
                  </div>
                  <button type="button" className="btn btn-secondary" style={{ marginTop: '8px', fontSize: '12px', padding: '6px 12px' }} onClick={() => setShowServicePackageOptions(prev => !prev)}>
                    {showServicePackageOptions ? 'Hide options ▲' : 'Edit services/packages ▼'}
                  </button>
                  {showServicePackageOptions && (
                    <div style={{ marginTop: '10px', display: 'grid', gap: '12px', padding: '12px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, color: 'var(--text)', fontSize: '13px' }}>Services</p>
                        <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
                          {serviceCatalog.map(service => (
                            <label key={service.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={editServiceIds.includes(service.id)} onChange={() => toggleService(service.id)} />
                              <span>{service.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, color: 'var(--text)', fontSize: '13px' }}>Packages</p>
                        <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
                          {packageOptions.map(pkg => (
                            <label key={pkg.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={editPackageIds.includes(pkg.id)} onChange={() => togglePackage(pkg.id)} />
                              <span>{pkg.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, color: 'var(--muted)', fontSize: '12px' }}>Visit Type</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['store', 'home'].map(type => (
                      <button key={type} type="button" onClick={() => setEditBookingType(type)} className={editBookingType === type ? 'btn btn-primary' : 'btn btn-secondary'} style={{ minWidth: '100px', padding: '8px 12px', fontSize: '12.5px' }}>
                        {getBookingTypeLabel(type)}
                      </button>
                    ))}
                  </div>
                </div>

                {editBookingType === 'home' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, color: 'var(--muted)', fontSize: '12px' }}>Home Visit Address</label>
                    <input className="input" type="text" value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="Enter customer address" />
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, color: 'var(--muted)', fontSize: '12px' }}>Assigned Team Member</label>
                  <select className="input" value={editAssignedTeamMemberId} onChange={e => setEditAssignedTeamMemberId(e.target.value)}>
                    {assigneeOptions.map(member => (
                      <option key={member.id} value={member.id}>{getAssigneeLabel(member)}</option>
                    ))}
                  </select>
                </div>

                {canEditDateTime && (
                  <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    <div style={{ minWidth: 0 }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, color: 'var(--muted)', fontSize: '12px' }}>Date *</label>
                      <input className="input" type="date" value={editDate} onChange={e => { setEditDate(e.target.value); setEditSlot('') }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, color: 'var(--muted)', fontSize: '12px' }}>Time *</label>
                      <input className="input" type="time" value={editSlot} onChange={e => setEditSlot(e.target.value)} />
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, color: 'var(--muted)', fontSize: '12px' }}>Amount Collected</label>
                    <input className="input" type="number" min="0" value={editAmountCollected} onChange={e => setEditAmountCollected(e.target.value)} placeholder="Rs 0" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, color: 'var(--muted)', fontSize: '12px' }}>Visit Charge</label>
                    <input className="input" type="number" min="0" value={editVisitCharge} onChange={e => setEditVisitCharge(e.target.value)} placeholder="Rs 0" />
                  </div>
                </div>
              </div>

              {editError && (
                <div style={{ marginTop: '8px', color: '#b91c1c', fontSize: '13px' }}>{editError}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setIsEditing(false); setEditError('') }} disabled={updating === booking.id}>Cancel</button>
                <button type="button" onClick={saveBookingChanges} disabled={updating === booking.id} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                  {updating === booking.id ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Lightbox for Before/After preview */}
        {lightboxImage && (
          <div className="modal-overlay" onClick={() => setLightboxImage(null)} style={{ zIndex: 1400 }}>
            <div style={{ maxWidth: '900px', width: 'min(900px, calc(100vw - 24px))', maxHeight: '90vh', display: 'grid', gap: '10px' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'white', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>{lightboxImage.label}</span>
                <button type="button" onClick={() => setLightboxImage(null)} aria-label="Close image preview" style={{ width: '38px', height: '38px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.24)', background: 'rgba(255,255,255,0.12)', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <img src={lightboxImage.url} alt={lightboxImage.label} style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '16px', background: '#111' }} />
            </div>
          </div>
        )}

        {/* Sticky Actions Footer */}
        {!isEditing && (
          <div className="admin-booking-detail-actions">
            {booking.status === 'pending' && (
              <button
                type="button"
                onClick={() => onStatus(booking, 'confirmed')}
                disabled={updating === booking.id}
                className="btn admin-btn-approve"
              >
                <CheckCircle2 size={15} /> Approve
              </button>
            )}
            {booking.status === 'confirmed' && (
              <button
                type="button"
                onClick={() => onStatus(booking, 'completed')}
                disabled={updating === booking.id}
                className="btn admin-btn-complete"
              >
                <IndianRupee size={15} /> Complete
              </button>
            )}
            {canReschedule && (
              <button
                type="button"
                onClick={() => onReschedule(booking)}
                disabled={updating === booking.id}
                className="btn admin-btn-reschedule"
              >
                <Clock size={15} /> Reschedule
              </button>
            )}
            {['pending', 'confirmed'].includes(booking.status) && (
              <button
                type="button"
                onClick={() => onCancelBooking(booking)}
                disabled={updating === booking.id}
                className="btn admin-btn-cancel"
              >
                <X size={15} /> Cancel
              </button>
            )}
            {booking.status === 'completed' && (
              <button
                type="button"
                onClick={() => navigate(`/admin/invoices?mode=appointment&id=${booking.id}`)}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ReceiptText size={15} /> Invoice
              </button>
            )}
            <a
              className="btn admin-btn-whatsapp"
              href={getCustomerWhatsAppUrl(booking, shopName, adminWhatsappNumber)}
              target="_blank"
              rel="noopener noreferrer"
              title={booking?.phone ? `WhatsApp customer: ${booking.phone}` : 'WhatsApp'}
            >
              <MessageCircle size={15} /> Booking WA
            </a>
          </div>
        )}
      </div>
    </div>
  )
}












