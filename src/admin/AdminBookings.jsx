// src/admin/AdminBookings.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDocs, orderBy, query, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore'
import Cropper from 'react-easy-crop'
import { Calendar, Camera, CheckCircle2, Clock, IndianRupee, MessageCircle, Phone, Search, Upload, UserRound, X } from 'lucide-react'
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

export default function AdminBookings() {
  const { user } = useAuth()
  const { sendNotification } = useNotifications()
  const navigate = useNavigate()
  const { bookingId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDate = searchParams.get('date') || ''
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [serviceF, setServiceF] = useState('all')
  const [dateFrom, setDateFrom] = useState(requestedDate)
  const [dateTo, setDateTo] = useState(requestedDate)
  const [page, setPage] = useState(1)
  const [updating, setUpdating] = useState(null)
  const [cashModal, setCashModal] = useState(null)
  const [cashAmt, setCashAmt] = useState('')
  const [completionImageUrls, setCompletionImageUrls] = useState({ before: '', after: '' })
  const [completionPreviewUrls, setCompletionPreviewUrls] = useState({ before: '', after: '' })
  const [completionUploading, setCompletionUploading] = useState({ before: false, after: false })
  const [cropperState, setCropperState] = useState(null)
  const [completionToast, setCompletionToast] = useState('')
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState('')
  const [shopName, setShopName] = useState('Paw Paw Pet Grooming')
  const [teamMembers, setTeamMembers] = useState([])
  const [serviceDetails, setServiceDetails] = useState({})
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [bookingSettings, setBookingSettings] = useState(null)
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleSlot, setRescheduleSlot] = useState('')
  const [rescheduleBookedSlots, setRescheduleBookedSlots] = useState([])
  const [reschedulingId, setReschedulingId] = useState('')

  const fetchBookings = async () => {
    setLoading(true)
    try {
      const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'))
      const [snap, serviceSnap] = await Promise.all([getDocs(q), getDocs(collection(db, 'serviceDetails'))])
      const nextServiceDetails = {}
      serviceSnap.docs.forEach(d => { nextServiceDetails[d.id] = { id: d.id, ...d.data() } })
      setServiceDetails(nextServiceDetails)
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      await syncPublicStats(db)
    } catch {
      try {
        const [snap, serviceSnap] = await Promise.all([getDocs(collection(db, 'bookings')), getDocs(collection(db, 'serviceDetails'))])
        const nextServiceDetails = {}
        serviceSnap.docs.forEach(d => { nextServiceDetails[d.id] = { id: d.id, ...d.data() } })
        setServiceDetails(nextServiceDetails)
        const r = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        r.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        setBookings(r)
        await syncPublicStats(db)
      } catch {}
    }
    setLoading(false)
  }

  useEffect(() => { fetchBookings() }, [])

  useEffect(() => {
    async function fetchTeamMembers() {
      try {
        const snap = await getDocs(query(collection(db, 'teamMembers'), orderBy('createdAt', 'desc')))
        setTeamMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch {
        try {
          const snap = await getDocs(collection(db, 'teamMembers'))
          setTeamMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        } catch {}
      }
    }
    fetchTeamMembers()
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
    if (!completionToast) return
    const t = window.setTimeout(() => setCompletionToast(''), 3500)
    return () => window.clearTimeout(t)
  }, [completionToast])

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
        b.assignedTeamMemberName?.toLowerCase().includes(s) ||
        b.id?.toLowerCase().includes(s)
      )
    }
    return r
  }, [bookings, serviceF, statusF, search, dateFrom, dateTo])

  useEffect(() => { setPage(1) }, [serviceF, statusF, search, dateFrom, dateTo])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE)

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const totalEarnings = useMemo(() => (
    bookings
      .filter(b => b.status === 'completed' && b.amountCollected)
      .reduce((sum, b) => sum + (parseFloat(b.amountCollected) || 0), 0)
  ), [bookings])

  const patchBooking = (id, patch) => {
    setBookings(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))
    setSelectedBooking(prev => prev?.id === id ? { ...prev, ...patch } : prev)
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
    } catch (err) {
      console.error('FIREBASE ERROR:', err)
      alert('Could not reschedule booking. Please try again.')
    }
    setReschedulingId('')
  }

  const updateStatus = async (b, status, reason = '') => {
    if (!b?.id) return
    if (status === 'completed') {
      if (b.status !== 'confirmed') return
      resetCompletionUploads()
      setCashAmt('')
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
            title: status === 'confirmed' ? 'Booking approved' : 'Booking cancelled',
            message: `${b.serviceName} on ${b.date} at ${b.slot} - ${msgs[status]}`,
            type: status,
            bookingId: b.id,
            actionUrl: '/my-bookings',
          })
        }
      }
    } catch {}
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
      const croppedFile = await cropImageFile(file, cropperState.croppedAreaPixels, { outputType: file.type || 'image/jpeg' })
      const url = await uploadToCloudinary(croppedFile)
      setCompletionImageUrls(prev => ({ ...prev, [kind]: url }))
      setCompletionPreviewUrls(prev => ({ ...prev, [kind]: url }))
      setCropperState(null)
    } catch (err) {
      alert(err.message || `Could not upload the ${kind === 'before' ? 'before' : 'after'} image.`)
    } finally {
      setCompletionUploading(prev => ({ ...prev, [kind]: false }))
    }
  }

  const closeCompletionModal = () => {
    setCashModal(null)
    setCashAmt('')
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
      setCompletionToast('Appointment marked completed successfully.')
      if (cashModal.userId && cashModal.userId !== 'walkin') {
        await sendNotification(cashModal.userId, {
          title: 'Appointment completed',
          message: `${cashModal.serviceName} for ${cashModal.petName} completed. Thank you!`,
          type: 'completed',
          bookingId: cashModal.id,
          actionUrl: '/my-bookings',
        })
      }
    } catch {}
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
    } catch {
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
      {completionToast && <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}><Toast message={completionToast} type="success" onClose={() => setCompletionToast('')} /></div>}
      <div className="admin-bookings-header">
        <div>
          <h1>Bookings</h1>
          <p>
            {filtered.length} of {bookings.length} bookings � showing {filtered.length ? pageStart + 1 : 0}-{Math.min(pageStart + PAGE_SIZE, filtered.length)}
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
          {serviceCatalog.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="date" aria-label="From date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" aria-label="To date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        {(dateFrom || dateTo) && <button type="button" className="admin-booking-clear-filter" onClick={() => { setDateFrom(''); setDateTo(''); setSearchParams({}) }}>Clear dates</button>}
      </div>

      {loading ? <Spinner text="Loading bookings..." /> : filtered.length === 0 ? (
        <div className="admin-booking-empty">No bookings found.</div>
      ) : (
        <div className="admin-booking-list">
          {paginated.map(b => (
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
                  <span style={S.meta}><Clock size={13} /> {formatSlot(b.slot)}</span>
                  <span style={S.meta}><Phone size={13} /> {b.phone || '-'}</span>
                  <span style={S.meta}><UserRound size={13} /> {getAssigneeLabel(assigneeFor(b))}</span>
                  {b.amountCollected > 0 && <span className="admin-booking-money">Rs {money(b.amountCollected)}</span>}
                </div>
              </div>

              <div className="admin-booking-actions" onClick={stop}>
                <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
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
                <div style={{ position: 'relative' }}>
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
                  {/* icon-only secondary actions (shrink on mobile) */}
                  {['pending', 'confirmed'].includes(b.status) && (
                    <button type="button" onClick={() => openCancelModal(b)} disabled={updating === b.id} style={S.iconBtn('#ef4444', 'rgba(239,68,68,0.1)')} className="admin-action icon-only" aria-label="Cancel">
                      <X size={14} /> <span className="action-label">Cancel</span>
                    </button>
                  )}
                  <a href={adminWhatsappNumber ? `https://wa.me/${adminWhatsappNumber}?text=${buildWhatsAppMessage(b, shopName)}` : '#'} target="_blank" rel="noopener noreferrer" style={S.iconBtn('#25D366', 'rgba(37,211,102,0.1)')} className="admin-action icon-only" aria-label="WA">
                    <MessageCircle size={14} /> <span className="action-label">WA</span>
                  </a>

                  {/* overflow removed — all actions shown inline; icon-only used for Cancel and WA on small screens */}
                </div>
              </div>
            </button>
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

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          adminWhatsappNumber={adminWhatsappNumber}
          shopName={shopName}
          updating={updating}
          assignee={assigneeFor(selectedBooking)}
          assigneeOptions={assigneeOptions}
          onAssign={assignBooking}
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

      {cashModal && (
        <div className="modal-overlay" onClick={closeCompletionModal}>
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
              <div style={{ marginTop: '16px', display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--muted)', marginBottom: '8px' }}>Before image (optional)</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '10px 14px' }}>
                      <Upload size={15} /> {completionUploading.before ? 'Uploading...' : completionImageUrls.before ? 'Change Before Image' : 'Upload Before Image'}
                      <input type="file" accept={IMAGE_FILE_ACCEPT} style={{ display: 'none' }} onChange={e => openCompletionCropper('before', e.target.files?.[0])} />
                    </label>
                    {completionImageUrls.before && <button type="button" className="btn btn-danger" style={{ fontSize: '13px', padding: '10px 14px' }} onClick={() => removeCompletionImage('before')}>Remove</button>}
                  </div>
                  {completionPreviewUrls.before && <img src={completionPreviewUrls.before} alt="Before appointment" style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '10px' }} />}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--muted)', marginBottom: '8px' }}>After image (optional)</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '10px 14px' }}>
                      <Upload size={15} /> {completionUploading.after ? 'Uploading...' : completionImageUrls.after ? 'Change After Image' : 'Upload After Image'}
                      <input type="file" accept={IMAGE_FILE_ACCEPT} style={{ display: 'none' }} onChange={e => openCompletionCropper('after', e.target.files?.[0])} />
                    </label>
                    {completionImageUrls.after && <button type="button" className="btn btn-danger" style={{ fontSize: '13px', padding: '10px 14px' }} onClick={() => removeCompletionImage('after')}>Remove</button>}
                  </div>
                  {completionPreviewUrls.after && <img src={completionPreviewUrls.after} alt="After appointment" style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '10px' }} />}
                </div>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '10px' }}>Images are optional. Uploads up to 10 MB are auto-resized to around 1 MB.</p>
              <div className="admin-booking-modal-actions">
                <button onClick={closeCompletionModal} className="btn btn-secondary">Cancel</button>
                <button onClick={handleComplete} className="btn btn-primary">Mark Complete</button>
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

function BookingDetailModal({ booking, adminWhatsappNumber, shopName, updating, assignee, assigneeOptions, onAssign, onClose, onStatus, onCancelBooking, onReschedule, canReschedule }) {
  const [lightboxImage, setLightboxImage] = useState(null)
  const detailRows = [
    ['Booking ID', shortId(booking.id)],
    ['Owner', booking.ownerName || '-'],
    ['Phone', booking.phone || '-'],
    ['Pet', `${booking.petName || '-'}${booking.petType ? ` (${booking.petType}${booking.petBreed ? `, ${booking.petBreed}` : ''})` : ''}`],
    ['Service', booking.serviceName || '-'],
    ['Packages', booking.packageNames?.length ? booking.packageNames.join(', ') : '-'],
    ['Visit Type', getBookingTypeLabel(booking.bookingType || 'store')],
    ['Date', booking.date || '-'],
    ['Time', formatSlot(booking.slot)],
    ['Request Sent', formatDateTime(booking.createdAt)],
    ['Appointment Date & Time', formatAppointmentStart(booking)],
    ['Address', booking.bookingType === 'home' ? (booking.address || '-') : '-'],
    ['Visit Charge', booking.visitCharge > 0 ? `Rs ${money(booking.visitCharge)}` : '-'],
    ['Estimated Total', booking.estimatedTotal > 0 ? `Rs ${money(booking.estimatedTotal)}` : '-'],
    ['Reschedules', booking.rescheduleCount ? `${booking.rescheduleCount} time${booking.rescheduleCount === 1 ? '' : 's'}` : '0'],
    ['Source', booking.isWalkIn ? 'Walk-in' : 'Online'],
    ['Assigned To', getAssigneeLabel(assignee)],
    ['Amount Collected', booking.amountCollected > 0 ? `Rs ${money(booking.amountCollected)}` : '-'],
    ...(booking.status === 'cancelled' ? [
      ['Cancelled By', cancellationActor(booking)],
      ['Cancelled At', formatDateTime(booking.cancelledAt)],
      ['Reason', booking.cancellationReason || '-'],
    ] : []),
    ['Notes', booking.notes || '-'],
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box admin-booking-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-booking-detail-head">
          <div>
            <span className={`badge ${BADGE[booking.status] || 'badge-pending'}`}>{statusLabel(booking.status || 'pending')}</span>
            {(booking.rescheduleCount || 0) > 0 && (
              <span className="badge" style={{ marginLeft: '8px', background: 'rgba(245, 158, 11, 0.16)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.24)' }}>
                Rescheduled
              </span>
            )}
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

        {(booking.beforeImageUrl || booking.afterImageUrl) && (
          <div className="admin-booking-image-section" style={{ marginTop: '16px' }}>
            <h3 style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 900, marginBottom: '10px' }}>Before & After</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
              {booking.beforeImageUrl && <button type="button" onClick={() => setLightboxImage({ url: booking.beforeImageUrl, label: 'Before' })} style={{ padding: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}><span style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Before</span><img src={booking.beforeImageUrl} alt="Before appointment" style={{ width: '100%', borderRadius: '12px', objectFit: 'cover', aspectRatio: '4/3', border: '1px solid var(--border)' }} /></button>}
              {booking.afterImageUrl && <button type="button" onClick={() => setLightboxImage({ url: booking.afterImageUrl, label: 'After' })} style={{ padding: 0, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}><span style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>After</span><img src={booking.afterImageUrl} alt="After appointment" style={{ width: '100%', borderRadius: '12px', objectFit: 'cover', aspectRatio: '4/3', border: '1px solid var(--border)' }} /></button>}
            </div>
          </div>
        )}

        <div className="admin-booking-assignee-panel">
          <label>Assigned Team Member</label>
          <select className="input" value={assignee?.id || OWNER_ASSIGNEE_ID} onChange={e => onAssign(booking, e.target.value)} disabled={booking.status !== 'confirmed' || updating === booking.id}>
            {assigneeOptions.map(member => <option key={member.id} value={member.id}>{getAssigneeLabel(member)}</option>)}
          </select>
          {booking.status !== 'confirmed' && <p>Assignments can be changed after an appointment is confirmed.</p>}
        </div>

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

        <div className="admin-booking-detail-actions">
          {booking.status === 'pending' && (
            <button type="button" onClick={() => onStatus(booking, 'confirmed')} disabled={updating === booking.id} className="btn btn-secondary">
              <CheckCircle2 size={15} /> Approve
            </button>
          )}
          {canReschedule && (
            <button type="button" onClick={() => onReschedule(booking)} disabled={updating === booking.id} className="btn btn-secondary">
              <Clock size={15} /> Reschedule
            </button>
          )}
          {booking.status === 'confirmed' && (
            <button type="button" onClick={() => onStatus(booking, 'completed')} disabled={updating === booking.id} className="btn btn-primary">
              <IndianRupee size={15} /> Complete
            </button>
          )}
          {['pending', 'confirmed'].includes(booking.status) && (
            <button type="button" onClick={() => onCancelBooking(booking)} disabled={updating === booking.id} className="btn btn-danger">
              <X size={15} /> Cancel
            </button>
          )}
          <a className="btn btn-secondary" href={adminWhatsappNumber ? `https://wa.me/${adminWhatsappNumber}?text=${buildWhatsAppMessage(booking, shopName)}` : '#'} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={15} /> Booking WA
          </a>
        </div>
      </div>
    </div>
  )
}












