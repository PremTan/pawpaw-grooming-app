// src/pages/Home.jsx
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, orderBy, limit, where, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import BrandLogo from '../components/BrandLogo'
import { buildServiceCatalog } from '../utils/serviceCatalog'
import { DEFAULT_FEATURES, normalizeFeature } from '../utils/siteContent'
import { countOpenDays, fetchBookingSettings, getAvailabilityForDate } from '../utils/bookingSettings'
import { buildGeneralWhatsAppMessage, fetchBusinessInfo } from '../utils/businessInfo'
import { useAuth } from '../context/AuthContext'
import { BOOKING_STATUS } from '../utils/services'
import { Calendar, MapPin, Phone, ChevronRight, Award, Clock, Shield, Star, ChevronLeft, ArrowRight, Images, X, Package, Scissors, Heart, ExternalLink, Home as HomeIcon, Store, Crown, BadgeCheck, Sparkles, PawPrint, Navigation, Instagram, Facebook, Youtube, Twitter, Linkedin, MessageCircle } from 'lucide-react'

const DEFAULT_HERO_IMAGES = []
const DEFAULT_VISIT_IMAGES = [
  { key: 'homeVisit', url: '', alt: 'Home visit grooming' },
  { key: 'centreVisit', url: '', alt: 'Visit our grooming centre' },
]
const FEATURE_ICONS = {
  award: <Award size={24} />,
  shield: <Shield size={24} />,
  clock: <Clock size={24} />,
  star: <Star size={24} />,
}

const HERO_COPY = [
  {
    tag: 'Salon Experience',
    icon: <Sparkles size={13} />,
    title: 'Visit Our Salon,',
    highlight: 'Premium Care.',
    sub: 'State-of-the-art grooming care for a calm, polished pet experience.',
  },
  {
    tag: 'Spa & Wellness',
    icon: <PawPrint size={13} />,
    title: 'Relax. Refresh.',
    highlight: 'Rejuvenate.',
    sub: 'From spa baths to de-shedding treatments - full wellness care for dogs & cats.',
  },
  {
    tag: 'Doorstep Grooming',
    icon: <HomeIcon size={13} />,
    title: 'Care Comes',
    highlight: 'Home.',
    sub: 'Professional grooming at your doorstep with comfort, safety, and less travel stress.',
  },
  {
    tag: 'Expert Groomers',
    icon: <Scissors size={13} />,
    title: 'Styled With',
    highlight: 'Gentle Hands.',
    sub: 'Breed-aware grooming, careful handling, and thoughtful finishing for every pet.',
  },
  {
    tag: 'Happy Results',
    icon: <Heart size={13} />,
    title: 'Clean. Cute.',
    highlight: 'Confident.',
    sub: 'Premium products and loving care for pets who look good and feel even better.',
  },
]

function cleanReviewText(value) {
  return String(value || '')
    .replace(/\uFFFD/g, '')
    .replace(/[?]/g, '')
    .replace(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â]/g, '"')
    .replace(/[ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢]/g, "'")
    .trim()
}

function parseAppointmentStart(booking) {
  if (booking?.bookingStartAt?.toDate) return booking.bookingStartAt.toDate()
  if (!booking?.date) return null
  const match = String(booking.slot || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const suffix = match[3].toUpperCase()
  if (suffix === 'PM' && hour !== 12) hour += 12
  if (suffix === 'AM' && hour === 12) hour = 0
  const date = new Date(`${booking.date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatAppointmentDateTime(booking) {
  const start = parseAppointmentStart(booking)
  if (!start) return booking?.date ? `${booking.date}${booking?.slot ? ` • ${booking.slot}` : ''}` : 'Awaiting schedule'
  return start.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\b(am|pm)\b/i, value => value.toUpperCase())
}

function getAppointmentDateParts(booking) {
  const start = parseAppointmentStart(booking)
  if (!start) {
    return {
      dateLabel: booking?.date || 'Awaiting schedule',
      timeLabel: booking?.slot || '',
    }
  }

  return {
    dateLabel: start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    timeLabel: start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\b(am|pm)\b/i, value => value.toUpperCase()),
  }
}

function getUpcomingStatusLabel(booking) {
  const start = parseAppointmentStart(booking)
  if (!start) return 'Scheduled'
  const today = new Date()
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((startDay - todayDay) / 86400000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays <= 7) return `In ${diffDays} days`
  return start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function getUpcomingStatusText(booking) {
  const start = parseAppointmentStart(booking)
  if (!start) return 'Scheduled'
  const today = new Date()
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((startDay - todayDay) / 86400000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === 2) return 'In 2 days'
  if (diffDays === 3) return 'In 3 days'
  if (diffDays === 4) return 'In 4 days'
  if (diffDays === 5) return 'In 5 days'
  if (diffDays === 6) return 'In 6 days'
  if (diffDays === 7) return 'In 7 days'
  return start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function dateKeyLocal(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isFutureSlotForDate(dateString, slotLabel) {
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

function canRescheduleBooking(booking) {
  if (!booking) return false
  if (booking.status === 'completed') return false
  return ['pending', 'confirmed'].includes(String(booking.status || '').toLowerCase())
}

function isAppointmentUpcoming(booking) {
  const status = String(booking?.status || '').toLowerCase()
  if (!['pending', 'confirmed'].includes(status)) return false
  const start = parseAppointmentStart(booking)
  if (start) return start.getTime() >= Date.now()
  if (!booking?.date) return false
  return booking.date >= dateKeyLocal()
}

function findPetProfileForBooking(booking, petLookup) {
  if (!booking) return null
  const candidates = []
  if (booking.petId) candidates.push(petLookup?.[booking.petId])
  if (booking.petName) candidates.push(petLookup?.[String(booking.petName).toLowerCase()])
  if (booking.pet?.id) candidates.push(petLookup?.[booking.pet.id])
  if (booking.pet?.name) candidates.push(petLookup?.[String(booking.pet.name).toLowerCase()])
  return candidates.find(Boolean) || null
}

function matchesCurrentUserBooking(booking, user) {
  if (!booking || !user) return false
  const uid = String(user?.uid || '').trim().toLowerCase()
  const email = String(user?.email || '').trim().toLowerCase()
  const candidates = [
    booking.userId,
    booking.ownerId,
    booking.customerId,
    booking.userEmail,
    booking.ownerEmail,
    booking.email,
    booking.customerEmail,
    booking.user?.uid,
    booking.user?.id,
    booking.owner?.email,
    booking.customer?.email,
  ].filter(Boolean).map(value => String(value).trim().toLowerCase())

  if (uid && candidates.includes(uid)) return true
  if (email && candidates.includes(email)) return true
  return false
}

function HeroSlider() {
  const { user } = useAuth()
  const [current, setCurrent] = useState(0)
  const [heroImages, setHeroImages] = useState(null)
  const [visitImages, setVisitImages] = useState(DEFAULT_VISIT_IMAGES)
  const [paused, setPaused] = useState(false)
  const [upcomingAppointment, setUpcomingAppointment] = useState(null)
  const [upcomingPetProfile, setUpcomingPetProfile] = useState(null)
  const [bookingSettings, setBookingSettings] = useState(null)
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleSlot, setRescheduleSlot] = useState('')
  const [rescheduleBookedSlots, setRescheduleBookedSlots] = useState([])
  const [reschedulingId, setReschedulingId] = useState('')

  const images = heroImages || []

  const next = () => {
    if (images.length) setCurrent(c => (c + 1) % images.length)
  }

  const prev = () => {
    if (images.length) setCurrent(c => (c - 1 + images.length) % images.length)
  }

  useEffect(() => {
    async function fetchHeroImages() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'heroImages'))
        const data = snap.exists() ? snap.data() : {}
        const savedImages = data.images || []
        const cleanImages = Array.isArray(savedImages)
          ? savedImages.filter(image => image?.url).slice(0, 5).map((image, index) => ({
              src: image.url,
              alt: image.alt || `Pet grooming hero image ${index + 1}`,
            }))
          : []
        const savedVisitImages = Array.isArray(data.visitImages) ? data.visitImages : []
        const cleanVisitImages = DEFAULT_VISIT_IMAGES.map((fallback, index) => ({
          ...fallback,
          url: savedVisitImages[index]?.url || '',
          alt: savedVisitImages[index]?.alt || fallback.alt,
        }))
        setHeroImages(cleanImages)
        setVisitImages(cleanVisitImages)
      } catch {
        setHeroImages(DEFAULT_HERO_IMAGES)
        setVisitImages(DEFAULT_VISIT_IMAGES)
      }
    }
    fetchHeroImages()
  }, [])

  useEffect(() => {
    if (paused || images.length <= 1) return
    const t = setInterval(() => {
      setCurrent(c => (c + 1) % images.length)
    }, 5000)
    return () => clearInterval(t)
  }, [paused, images.length])

  useEffect(() => {
    setCurrent(0)
  }, [heroImages])

  useEffect(() => {
    fetchBookingSettings(db).then(setBookingSettings).catch(() => {})
  }, [])

  useEffect(() => {
    async function fetchUpcomingAppointment() {
      if (!user?.uid && !user?.email) {
        setUpcomingAppointment(null)
        setUpcomingPetProfile(null)
        return
      }

      try {
        const [bookingSnap, petSnap] = await Promise.all([
          getDocs(query(collection(db, 'bookings'), where('userId', '==', user.uid))),
          getDocs(query(collection(db, 'pets'), where('userId', '==', user.uid)))
        ])

        const bookings = bookingSnap.docs
          .map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() }))
          .filter(booking => matchesCurrentUserBooking(booking, user))

        const petLookup = {}
        petSnap.docs.forEach(petDoc => {
          const pet = { id: petDoc.id, ...petDoc.data() }
          petLookup[pet.id] = pet
          if (pet.name) petLookup[String(pet.name).toLowerCase()] = pet
        })

        const filtered = bookings
          .filter(booking => isAppointmentUpcoming(booking))
          .sort((a, b) => {
            const aTime = parseAppointmentStart(a) || new Date(a.date || '2099-12-31')
            const bTime = parseAppointmentStart(b) || new Date(b.date || '2099-12-31')
            return aTime - bTime
          })

        const nextBooking = filtered[0] || null
        setUpcomingAppointment(nextBooking)
        setUpcomingPetProfile(findPetProfileForBooking(nextBooking, petLookup))
      } catch {
        setUpcomingAppointment(null)
        setUpcomingPetProfile(null)
      }
    }

    fetchUpcomingAppointment()
  }, [user?.uid, user?.email])

  useEffect(() => {
    if (!rescheduleTarget?.id || !rescheduleDate) {
      setRescheduleBookedSlots([])
      return
    }
    let ignore = false
    async function fetchBookedSlots() {
      try {
        const q = query(
          collection(db, 'bookings'),
          where('date', '==', rescheduleDate),
          where('status', 'in', [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED])
        )
        const snap = await getDocs(q)
        const slotCounts = {}
        snap.docs
          .map(item => item.data())
          .filter(item => item.id !== rescheduleTarget.id && (item.status || '') !== BOOKING_STATUS.CANCELLED)
          .forEach(item => { slotCounts[item.slot] = (slotCounts[item.slot] || 0) + 1 })
        const capacity = Math.max(1, Number(bookingSettings?.slotCapacity || 1))
        if (!ignore) setRescheduleBookedSlots(Object.entries(slotCounts).filter(([, count]) => count >= capacity).map(([slot]) => slot))
      } catch {
        if (!ignore) setRescheduleBookedSlots([])
      }
    }
    fetchBookedSlots()
    return () => { ignore = true }
  }, [rescheduleTarget?.id, rescheduleDate, bookingSettings, rescheduleTarget?.bookingType])

  const navigate = useNavigate()
  const slideCopy = HERO_COPY[current % HERO_COPY.length]
  const appointmentDateParts = getAppointmentDateParts(upcomingAppointment)
  const petImageCandidates = [
    upcomingAppointment?.petPhotoUrl,
    upcomingAppointment?.petPhoto,
    upcomingAppointment?.photoUrl,
    upcomingAppointment?.pet?.photoUrl,
    upcomingAppointment?.pet?.photo,
    upcomingAppointment?.pet?.imageUrl,
    upcomingPetProfile?.photoUrl,
    upcomingPetProfile?.photo,
    upcomingPetProfile?.imageUrl,
  ]
  const petImageUrl = petImageCandidates.find(Boolean) || ''
  const petNameLabel = upcomingAppointment?.petName || upcomingPetProfile?.name || upcomingAppointment?.pet?.name || 'Pet details'
  const rescheduleAvailability = rescheduleDate ? getAvailabilityForDate(bookingSettings || undefined, rescheduleDate) : { open: false, storeSlots: [], homeSlots: [] }
  const rescheduleSlots = (rescheduleTarget?.bookingType || 'store') === 'home' ? rescheduleAvailability.homeSlots : rescheduleAvailability.storeSlots
  const isRescheduleToday = rescheduleDate === dateKeyLocal()
  const bookableRescheduleSlots = isRescheduleToday ? rescheduleSlots.filter(slot => isFutureSlotForDate(rescheduleDate, slot)) : rescheduleSlots

  const handleAppointmentCardClick = () => {
    navigate('/my-bookings')
  }

  const handleAppointmentCardKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigate('/my-bookings')
    }
  }

  const openRescheduleModal = (booking) => {
    setRescheduleTarget(booking)
    setRescheduleDate(booking.date || '')
    setRescheduleSlot(booking.slot || '')
    setRescheduleBookedSlots([])
  }

  const handleRescheduleClick = (event) => {
    event.stopPropagation()
    openRescheduleModal(upcomingAppointment)
  }

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
        rescheduledBy: 'user',
        previousDate,
        previousSlot,
        bookingStartAt: newBookingStart ? Timestamp.fromDate(newBookingStart) : null,
      }
      await updateDoc(doc(db, 'bookings', rescheduleTarget.id), patch)
      setUpcomingAppointment(current => current?.id === rescheduleTarget.id ? { ...current, ...patch, bookingStartAt: newBookingStart ? { toDate: () => newBookingStart } : current.bookingStartAt } : current)
      setRescheduleTarget(null)
      setRescheduleDate('')
      setRescheduleSlot('')
      setRescheduleBookedSlots([])
    } catch {
      alert('Could not reschedule booking. Please try again.')
    }
    setReschedulingId('')
  }

  const visitCards = [
    {
      title: 'Home Visit',
      text: 'We come to your doorstep',
      cta: 'Choose Home Visit',
      to: '/book?visit=home',
      icon: <HomeIcon size={30} />,
      image: visitImages[0],
    },
    {
      title: 'Visit Our Centre',
      text: 'Bring your pet to our salon',
      cta: 'Choose Our Centre',
      to: '/book?visit=centre',
      icon: <Store size={28} />,
      image: visitImages[1],
    },
  ]

  return (
    <section className="home-redesign" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="home-redesign-inner">
        <div className="mobile-hero-card">
          <div className="mobile-hero-media" aria-label="Pet grooming hero images">
            {images.length ? images.map((image, i) => (
              <img
                key={image.src}
                src={image.src}
                alt={image.alt}
                className={i === current ? 'active' : ''}
              />
            )) : <div className="mobile-hero-empty"><Scissors size={34} /><span>Add hero banners from admin</span></div>}
          </div>
          {images.length > 1 && (
            <>
              <button className="mobile-hero-arrow left" onClick={prev} aria-label="Previous hero banner"><ChevronLeft size={18} /></button>
              <button className="mobile-hero-arrow right" onClick={next} aria-label="Next hero banner"><ChevronRight size={18} /></button>
              <div className="mobile-hero-dots">
                {images.map((_, i) => (
                  <button key={i} onClick={() => setCurrent(i)} className={i === current ? 'active' : ''} aria-label={`Show hero banner ${i + 1}`} />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="mobile-hero-copy" key={`hero-copy-${current}`}>
          <div className="mobile-hero-text">
            <span className="mobile-hero-badge">{slideCopy.icon} {slideCopy.tag}</span>
            <h1>{slideCopy.title} <span>{slideCopy.highlight}<PawPrint className="hero-title-paw" size={34} /></span></h1>
            <p>{slideCopy.sub}</p>
          </div>
          <div className="mobile-hero-actions">
            <Link to="/book" className="btn btn-primary"><Calendar size={16} /> Book Appointment</Link>
            <Link to="/services" className="btn btn-secondary">View Services <ArrowRight size={16} /></Link>
          </div>
        </div>

        {upcomingAppointment && (
          <section className="upcoming-appointment-section">
            <div
              className="upcoming-appointment-card"
              onClick={handleAppointmentCardClick}
              onKeyDown={handleAppointmentCardKeyDown}
              role="button"
              tabIndex={0}
            >
              <div className="upcoming-appointment-header">
                <div className="upcoming-appointment-title-wrap">
                  <p className="section-label upcoming-appointment-title">
                    <Calendar size={14} className="upcoming-appointment-icon" />
                    Upcoming Appointment
                  </p>
                </div>
                <Link to="/my-bookings" className="home-pill-link" onClick={event => event.stopPropagation()}>View All <ArrowRight size={16} /></Link>
              </div>
              <div className="upcoming-appointment-body">
                <div className="upcoming-appointment-main">
                  <div className="upcoming-appointment-photo-stack">
                    <div className="upcoming-appointment-photo">
                      {petImageUrl ? (
                        <img src={petImageUrl} alt={petNameLabel || 'Pet'} />
                      ) : (
                        <div className="upcoming-appointment-photo-fallback">
                          <PawPrint size={28} />
                        </div>
                      )}
                    </div>
                    <div className="upcoming-appointment-photo-caption">{petNameLabel}</div>
                  </div>
                  <div className="upcoming-appointment-details">
                    <div className="upcoming-appointment-meta">
                      <span className="upcoming-appointment-status">{getUpcomingStatusText(upcomingAppointment)}</span>
                      <span className="upcoming-appointment-visit-pill">
                        {(upcomingAppointment.bookingType || 'store') === 'home' ? <HomeIcon size={14} /> : <Store size={14} />}
                        {(upcomingAppointment.bookingType || 'store') === 'home' ? 'Home Visit' : 'At Centre'}
                      </span>
                    </div>
                    <h4>{upcomingAppointment.serviceName || 'Appointment'}</h4>
                    <div className="upcoming-appointment-meta-column">
                      <span className="upcoming-appointment-info-item">
                        <Calendar size={14} />
                        <span className="upcoming-appointment-info-text">
                          <span className="upcoming-appointment-info-date-time">
                            {appointmentDateParts.dateLabel}
                            <span className="upcoming-appointment-info-separator">•</span>
                            {appointmentDateParts.timeLabel}
                          </span>
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                {canRescheduleBooking(upcomingAppointment) && (
                  <button type="button" className="upcoming-appointment-reschedule-btn" onClick={handleRescheduleClick}>
                    Reschedule
                  </button>
                )}
              </div>
            </div>
            {rescheduleTarget && (
              <div className="modal-overlay" onClick={() => { setRescheduleTarget(null); setRescheduleDate(''); setRescheduleSlot(''); setRescheduleBookedSlots([]) }}>
                <div className="reschedule-modal-card" onClick={event => event.stopPropagation()}>
                  <div className="reschedule-modal-header">
                    <div>
                      <h3>Reschedule Appointment</h3>
                      <p>Pick a new date and time for your visit.</p>
                    </div>
                    <button type="button" className="icon-btn" onClick={() => { setRescheduleTarget(null); setRescheduleDate(''); setRescheduleSlot(''); setRescheduleBookedSlots([]) }}><X size={18} /></button>
                  </div>
                  <div className="reschedule-modal-body">
                    <label className="reschedule-field">
                      <span>Date</span>
                      <input type="date" className="input" value={rescheduleDate} onChange={event => setRescheduleDate(event.target.value)} min={dateKeyLocal()} />
                    </label>
                    {rescheduleDate && rescheduleAvailability.open && (
                      <div className="reschedule-slot-grid">
                        {bookableRescheduleSlots.map(slot => {
                          const disabled = rescheduleBookedSlots.includes(slot)
                          return (
                            <button key={slot} type="button" className={`reschedule-slot-btn ${rescheduleSlot === slot ? 'active' : ''}`} disabled={disabled} onClick={() => setRescheduleSlot(slot)}>
                              {slot}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {rescheduleDate && !rescheduleAvailability.open && (
                      <p className="helper-text">No availability for this date.</p>
                    )}
                    {rescheduleDate && rescheduleAvailability.open && rescheduleBookedSlots.length === 0 && bookableRescheduleSlots.length === 0 && (
                      <p className="helper-text">No slots available for this date.</p>
                    )}
                  </div>
                  <div className="reschedule-modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => { setRescheduleTarget(null); setRescheduleDate(''); setRescheduleSlot(''); setRescheduleBookedSlots([]) }}>Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={!rescheduleDate || !rescheduleSlot || reschedulingId === rescheduleTarget.id} onClick={confirmReschedule}>
                      {reschedulingId === rescheduleTarget.id ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="visit-choice-section">
          <div className="visit-choice-title">
            <span />
            <h2>Where would you like your pet groomed?</h2>
            <span />
          </div>
          <div className="visit-choice-grid">
            {visitCards.map((card, index) => (
              <Link key={card.title} to={card.to} className="visit-choice-card">
                <div className="visit-choice-icon">{card.icon}</div>
                <div className="visit-choice-image">
                  {card.image?.url ? (
                    <img src={card.image.url} alt={card.image.alt} />
                  ) : (
                    <div className="visit-choice-placeholder">{card.icon}</div>
                  )}
                </div>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
                <span className="visit-choice-button">{card.cta} <ArrowRight size={16} /></span>
                {index === 0 && <b className="visit-choice-or">OR</b>}
              </Link>
            ))}
          </div>
        </div>

        <div className="home-trust-strip">
          <span><Shield size={24} /> Trained & Verified Groomers</span>
          <span><BadgeCheck size={24} /> Safe, Hygienic & Loving Care</span>
          <span><Award size={24} /> Premium Quality Products</span>
          <span><Heart size={24} /> 100% Happiness Guarantee</span>
        </div>
      </div>
    </section>
  )
}
export default function Home() {
  const [stats, setStats]   = useState({ totalBookings: 0, totalReviews: 0, avgRating: 5, daysOpen: 7 })
  const [reviews, setReviews] = useState([])
  const [serviceDetails, setServiceDetails] = useState({})
  const [galleryImages, setGalleryImages] = useState([])
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [galleryLightbox, setGalleryLightbox] = useState(null)
  const [reviewLightbox, setReviewLightbox] = useState(null)
  const [features, setFeatures] = useState(DEFAULT_FEATURES)
  const [packages, setPackages] = useState([])
  const [adminPhone, setAdminPhone] = useState('')
  const [contactAddress, setContactAddress] = useState('')
  const [contactHours, setContactHours] = useState('')
  const [shopName, setShopName] = useState('Paw Paw Pet Grooming')
  const [googleReviewUrl, setGoogleReviewUrl] = useState('')
  const [homePetImages, setHomePetImages] = useState({ cta: '', follow: '' })
  const [footerInfo, setFooterInfo] = useState({ tagline: '', socials: [], phones: [], email: '' })
  const [reviewIndex, setReviewIndex] = useState(0)
  const [reviewCarouselHeight, setReviewCarouselHeight] = useState(0)
  const [touchStartX, setTouchStartX] = useState(null)
  const reviewCarouselRef = useRef(null)
  const reviewSlideRefs = useRef([])

  useEffect(() => {
    async function fetchStats() {
      const [
        bookingsResult,
        reviewsResult,
        galleryResult,
        detailsResult,
        packagesResult,
        featuresResult,
        allReviewsResult,
        homeStatsResult,
        businessInfoResult,
      ] = await Promise.allSettled([
        getDocs(collection(db, 'bookings')),
        getDocs(query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(6))),
        getDocs(query(collection(db, 'gallery'), orderBy('createdAt', 'desc'), limit(5))),
        getDocs(collection(db, 'serviceDetails')),
        getDocs(collection(db, 'packages')),
        getDoc(doc(db, 'settings', 'whyChooseUs')),
        getDocs(collection(db, 'reviews')),
        getDoc(doc(db, 'settings', 'homeStats')),
        fetchBusinessInfo(db),
      ])

      try {
        const details = {}
        if (detailsResult.status === 'fulfilled') {
          detailsResult.value.docs.forEach(d => { details[d.id] = { id: d.id, ...d.data() } })
        }

        const revs = reviewsResult.status === 'fulfilled'
          ? reviewsResult.value.docs.map(d => ({ id: d.id, ...d.data() }))
          : []
        const allRevs = allReviewsResult.status === 'fulfilled'
          ? allReviewsResult.value.docs.map(d => d.data())
          : revs
        const avg = allRevs.length
          ? (allRevs.reduce((s, r) => s + (r.rating || 5), 0) / allRevs.length).toFixed(1)
          : 5.0
        const publicStats = homeStatsResult.status === 'fulfilled' && homeStatsResult.value.exists()
          ? homeStatsResult.value.data()
          : {}
        const scheduleDaysOpen = businessInfoResult.status === 'fulfilled'
          ? countOpenDays(businessInfoResult.value.bookingSettings)
          : null
        setStats({
          totalBookings: Number(publicStats.totalBookings ?? (bookingsResult.status === 'fulfilled' ? bookingsResult.value.size : 0)),
          totalReviews: Number(publicStats.totalReviews ?? allRevs.length),
          avgRating: publicStats.avgRating ?? avg,
          daysOpen: scheduleDaysOpen ?? Number(publicStats.daysOpen ?? 7),
        })
        setReviews(revs)
        setServiceDetails(details)
        if (packagesResult.status === 'fulfilled') {
          setPackages(packagesResult.value.docs.map(d => ({ id: d.id, ...d.data() })).filter(pkg => pkg.active !== false))
        }
        if (galleryResult.status === 'fulfilled') {
          setGalleryImages(galleryResult.value.docs.map(d => ({ id: d.id, ...d.data() })).filter(image => image.url).slice(0, 5))
        }
        const savedFeatures = featuresResult.status === 'fulfilled' && featuresResult.value.exists() && Array.isArray(featuresResult.value.data().features)
          ? featuresResult.value.data().features
          : []
        const cleanFeatures = DEFAULT_FEATURES.slice(0, 4).map((fallback, index) => {
          const saved = savedFeatures[index]
          const normalized = normalizeFeature(saved, fallback)
          return {
            icon: FEATURE_ICONS[normalized.icon] ? normalized.icon : fallback.icon,
            title: normalized.title,
            desc: normalized.desc,
          }
        })
        setFeatures(cleanFeatures)
        if (businessInfoResult.status === 'fulfilled') {
          const info = businessInfoResult.value
          setAdminPhone(info.whatsappNumber || '')
          setContactAddress(info.contact.address || '')
          setContactHours(info.hoursText || '')
          setShopName(info.contact.shopName || 'Paw Paw Pet Grooming')
          setGoogleReviewUrl(info.contact.googleReviewUrl || '')
          setHomePetImages({
            cta: info.contact.ctaPetImageUrl || '',
            follow: info.contact.followPetImageUrl || '',
          })
          setFooterInfo(info.footer || { tagline: '', socials: [], phones: [], email: '' })
        }
      } catch {}
    }
    fetchStats()
  }, [])

  useEffect(() => {
    if (galleryImages.length <= 1) return
    const t = setInterval(() => {
      setGalleryIndex(i => (i + 1) % galleryImages.length)
    }, 4200)
    return () => clearInterval(t)
  }, [galleryImages.length])

  const homeServices = buildServiceCatalog(serviceDetails)
  const featuredReviews = reviews.slice(0, 5)

  useEffect(() => {
    setReviewIndex(0)
  }, [featuredReviews.length])

  useEffect(() => {
    if (!featuredReviews.length) {
      setReviewCarouselHeight(0)
      return
    }

    const updateCarouselHeight = () => {
      const activeSlide = reviewSlideRefs.current[reviewIndex]
      if (activeSlide) {
        setReviewCarouselHeight(activeSlide.offsetHeight)
      }
    }

    const frame = window.requestAnimationFrame(updateCarouselHeight)
    window.addEventListener('resize', updateCarouselHeight)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateCarouselHeight)
    }
  }, [featuredReviews.length, reviewIndex])

  const shownServices = [
    ...homeServices.slice(0, 5),
    ...packages.slice(0, Math.max(0, 5 - homeServices.slice(0, 5).length)).map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description || 'Complete grooming for a clean, fresh and happy pet.',
      price: pkg.priceRange || (pkg.price ? `Rs. ${pkg.price}` : 'Price TBD'),
      duration: pkg.duration || 'Package',
      icon: <Package size={30} />,
      to: `/book?package=${pkg.id}`,
    })),
  ]

  const goToReview = (index) => {
    if (!featuredReviews.length) return
    setReviewIndex((index + featuredReviews.length) % featuredReviews.length)
  }

  const handleReviewTouchStart = (event) => {
    setTouchStartX(event.touches[0]?.clientX ?? null)
  }

  const handleReviewTouchEnd = (event) => {
    if (touchStartX === null) return
    const delta = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX
    if (delta > 50) {
      goToReview(reviewIndex - 1)
    } else if (delta < -50) {
      goToReview(reviewIndex + 1)
    }
    setTouchStartX(null)
  }

  const socialIcon = (platform) => {
    if (platform === 'instagram') return <Instagram size={18} />
    if (platform === 'facebook') return <Facebook size={18} />
    if (platform === 'youtube') return <Youtube size={18} />
    if (platform === 'twitter') return <Twitter size={18} />
    if (platform === 'linkedin') return <Linkedin size={18} />
    return <MessageCircle size={18} />
  }
  return (
    <div style={{ background: 'var(--bg)' }}>
      {/* Hero slider */}
      <HeroSlider />

      {/* Features */}
      <section className="home-why-section">
        <div className="home-why-head">
          <p className="section-label"><PawPrint size={14} /> Why Choose Us <PawPrint size={14} /></p>
          <h2>Trusted by Pet Parents</h2>
        </div>
        <div className="why-choose-grid">
          {features.map((f, i) => (
            <div key={`${f.title}-${i}`} className="why-choose-card fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="why-choose-icon">
                {FEATURE_ICONS[f.icon] || FEATURE_ICONS.star}
              </div>
              <span className="why-choose-number">0{i + 1}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      {/* Services preview */}
      <section className="home-services-mobile-section">
        <div className="home-section-card home-services-panel">
          <div className="home-section-head split">
            <div>
              <p className="section-label">What We Offer</p>
              <h2>Our Services</h2>
            </div>
            <Link to="/services" className="home-pill-link">View All <ArrowRight size={17} /></Link>
          </div>

          <div className="home-service-list">
            {shownServices.map((s, i) => (
              <Link
                key={s.id}
                to={s.to || `/services/${s.id}`}
                className="home-service-row fade-up"
                style={{ animationDelay: `${i * 0.06}s`, '--service-color': s.color || 'var(--accent)' }}
              >
                <span className="home-service-visual">
                  {s.iconImageUrl && <img src={s.iconImageUrl} alt="" loading="lazy" />}
                </span>
                <span className="home-service-main">
                  <strong>{s.name}</strong>
                  <small>{s.description}</small>
                </span>
                <span className="home-service-arrow"><ArrowRight size={19} /></span>
                <span className="home-service-meta">
                  <b><PawPrint size={16} /> {s.price}</b>
                  <em><Clock size={14} /> {s.duration}</em>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery preview */}
      {galleryImages.length > 0 && (
        <section className="home-gallery-section">
          <div className="home-section-head split">
            <div>
              <p className="section-label">Our Work</p>
              <h2>Gallery</h2>
              <p>Recent grooming moments from the salon.</p>
            </div>
            <Link to="/gallery" className="home-pill-link">View All <ArrowRight size={17} /></Link>
          </div>

          <div className="gallery-mobile-slider">
            <div className="home-gallery-slider-frame">
              {galleryImages.map((image, index) => (
                <img
                  key={image.id}
                  src={image.url}
                  alt={image.caption || 'Gallery image'}
                  onClick={() => { setGalleryIndex(index); setGalleryLightbox(galleryImages[index]) }}
                  className={index === galleryIndex ? 'active' : ''}
                />
              ))}
              {galleryImages.length > 1 && <>
                <button onClick={() => setGalleryIndex(i => (i - 1 + galleryImages.length) % galleryImages.length)} aria-label="Previous gallery image"><ChevronLeft size={16} /></button>
                <button onClick={() => setGalleryIndex(i => (i + 1) % galleryImages.length)} aria-label="Next gallery image"><ChevronRight size={16} /></button>
              </>}
              <div className="home-gallery-caption">
                {galleryImages[galleryIndex]?.category && <span><Images size={14} /> {galleryImages[galleryIndex].category}</span>}
                {galleryImages[galleryIndex]?.caption && <strong>{galleryImages[galleryIndex].caption}</strong>}
              </div>
            </div>
            {galleryImages.length > 1 && (
              <div className="home-gallery-dots">
                {galleryImages.map((_, i) => (
                  <button key={i} onClick={() => setGalleryIndex(i)} className={i === galleryIndex ? 'active' : ''} aria-label={`Show gallery image ${i + 1}`} />
                ))}
              </div>
            )}
          </div>

          <div className="gallery-desktop-grid home-gallery-grid">
            {galleryImages.map((image) => (
              <button key={image.id} onClick={() => setGalleryLightbox(image)}>
                <img src={image.url} alt={image.caption || 'Gallery image'} loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Reviews section */}
      {featuredReviews.length > 0 && (
        <section className="home-reviews-section">
          <div className="home-section-head centered decorated">
            <p className="section-label">What Customers Say</p>
            <h2>Real Reviews <PawPrint size={24} /></h2>
          </div>
          <div className="home-review-carousel" ref={reviewCarouselRef} onTouchStart={handleReviewTouchStart} onTouchEnd={handleReviewTouchEnd} style={{ height: reviewCarouselHeight ? `${reviewCarouselHeight}px` : 'auto' }}>
            <div className="home-review-carousel-track" style={{ transform: `translateX(-${reviewIndex * 100}%)` }}>
              {featuredReviews.map((r, index) => {
                const hasReviewImages = Array.isArray(r.images) && r.images.length > 0;
                return (
                <article
                  key={r.id}
                  ref={(el) => {
                    reviewSlideRefs.current[index] = el
                  }}
                  className={`home-review-card home-review-slide ${hasReviewImages ? 'has-images' : 'no-images'}`}
                >
                  <div className="home-review-person">
                    <div className="home-review-avatar">
                      {r.userPhoto
                        ? <img src={r.userPhoto} alt="" />
                        : <span>{r.userName?.[0]?.toUpperCase() || 'P'}</span>}
                    </div>
                    <div>
                      <strong>{r.userName || 'Pet Parent'}</strong>
                      <span>{[1,2,3,4,5].map(n => <Star key={n} size={14} fill={n <= (r.rating || 5) ? 'currentColor' : 'none'} />)}</span>
                    </div>
                  </div>
                  <p>&quot;{cleanReviewText(r.comment)}&quot;</p>
                  {hasReviewImages && (
                    <div className="home-review-image-grid">
                      {r.images.slice(0, 3).map((image, index) => (
                        <button
                          key={`${r.id}-${index}`}
                          type="button"
                          className="home-review-image-thumb-btn"
                          onClick={() => setReviewLightbox({ url: image, alt: `${r.userName || 'Review'} image ${index + 1}` })}
                          aria-label={`Open review image ${index + 1}`}
                        >
                          <img className="home-review-image-thumb" src={image} alt={`${r.userName || 'Review'} image ${index + 1}`} loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                </article>
                );
              })}
            </div>
          </div>
          {featuredReviews.length > 1 && (
            <div className="home-review-nav">
              <button type="button" className="home-review-nav-btn" onClick={() => goToReview(reviewIndex - 1)} aria-label="Previous review">
                <ChevronLeft size={16} />
              </button>
              <div className="home-review-dots">
                {featuredReviews.map((_, index) => (
                  <button key={index} type="button" className={index === reviewIndex ? 'active' : ''} onClick={() => goToReview(index)} aria-label={`Go to review ${index + 1}`} />
                ))}
              </div>
              <button type="button" className="home-review-nav-btn" onClick={() => goToReview(reviewIndex + 1)} aria-label="Next review">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          <div className="home-review-actions">
            <Link to="/reviews" className="btn btn-secondary">See All Reviews <ArrowRight size={16} /></Link>
            {googleReviewUrl && (
              <a href={googleReviewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                Rate Us on Google <ExternalLink size={15} />
              </a>
            )}
          </div>
        </section>
      )}

      {/* Call CTA Section */}
      <section className="home-help-cta">
        <div className="home-help-card">
          <div className="home-help-image">
            {homePetImages.cta ? <img src={homePetImages.cta} alt="Happy pet" /> : <PawPrint size={72} />}
          </div>
          <div className="home-help-copy">
            <h2>Not sure which service to choose? <PawPrint size={20} /></h2>
            <p>Call us - we're happy to help you find the best option for your pet.</p>
            <a href={`tel:${adminPhone}`} className="btn btn-primary"><Phone size={16} /> Call: {adminPhone}</a>
          </div>
        </div>
      </section>

      {/* Location */}
      <section id="contact" className="home-location-section">
        <div className="home-location-info">
          <p className="section-label">Find Us</p>
          <h2>Visit Our Centre <PawPrint size={24} /></h2>
          {[
            { icon: <MapPin size={18} />, text: contactAddress },
            { icon: <Phone size={18} />, text: adminPhone },
            { icon: <Clock size={18} />, text: contactHours },
          ].filter(item => item.text).map((item, i) => (
            <div key={i} className="home-location-line">
              {item.icon}<p>{item.text}</p>
            </div>
          ))}
          <div className="home-location-actions">
            <Link to="/book" className="btn btn-primary"><Calendar size={16} /> Book Now</Link>
            <a href={contactAddress ? `https://maps.google.com/?q=${encodeURIComponent(contactAddress)}` : '#'} target="_blank" rel="noopener noreferrer" className="btn btn-secondary"><Navigation size={16} /> Get Directions</a>
          </div>
        </div>
        <div className="home-map-card">
          <iframe
            title="Location"
            src={contactAddress ? `https://www.google.com/maps?q=${encodeURIComponent(contactAddress)}&output=embed` : 'about:blank'}
            allowFullScreen loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>

      <section className="home-follow-card">
        <div className="home-follow-brand">
          <div className="home-follow-logo"><BrandLogo size="admin" showText={false} /></div>
          <div>
            <h2>{shopName}</h2>
            <p>{footerInfo.tagline || 'Trusted pet grooming and spa salon with love, care and professional expertise.'}</p>
          </div>
        </div>
        <div className="home-follow-pet">
          {homePetImages.follow ? <img src={homePetImages.follow} alt="Paw Paw pet" /> : <PawPrint size={80} />}
        </div>
        <div className="home-follow-actions">
          <h3>Follow Us</h3>
          <div>
            {footerInfo.socials?.slice(0, 3).map((social, i) => (
              <a key={i} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.platform}>{socialIcon(social.platform)}</a>
            ))}

          </div>
          <Link to="/book" className="btn btn-primary"><Calendar size={16} /> Book Appointment</Link>
        </div>
      </section>
      {/* WhatsApp float button */}
      <a href={`https://wa.me/${adminPhone}?text=${encodeURIComponent(`Hi ${shopName}, I'm interested in booking a service for my pet. Could you help me with more details?`)}`} target="_blank" rel="noopener noreferrer" className="whatsapp-btn" title="Chat on WhatsApp" aria-label="Chat on WhatsApp"><MessageCircle size={24} /></a>

      {galleryLightbox && (
        <div onClick={() => setGalleryLightbox(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', cursor:'pointer' }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth:'900px', width:'100%', cursor:'default' }}>
            <button onClick={() => setGalleryLightbox(null)} aria-label="Close gallery image" style={{ marginLeft: 'auto', marginBottom: '12px', width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={18} />
            </button>
            <img src={galleryLightbox.url} alt={galleryLightbox.caption || ''} style={{ width:'100%', borderRadius:'8px', maxHeight:'80vh', objectFit:'contain' }} />
            {galleryLightbox.caption && <p style={{ color:'#fff', textAlign:'center', marginTop:'14px', fontSize:'15px' }}>{galleryLightbox.caption}</p>}
          </div>
        </div>
      )}

      {reviewLightbox && (
        <div onClick={() => setReviewLightbox(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.94)', zIndex:220, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', cursor:'pointer' }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth:'900px', width:'100%', cursor:'default' }}>
            <button onClick={() => setReviewLightbox(null)} aria-label="Close review image" style={{ marginLeft: 'auto', marginBottom: '12px', width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={18} />
            </button>
            <img src={reviewLightbox.url} alt={reviewLightbox.alt || 'Review image'} style={{ width:'100%', borderRadius:'8px', maxHeight:'80vh', objectFit:'contain' }} />
          </div>
        </div>
      )}
    </div>
  )
}



























