// src/pages/Home.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, orderBy, limit, where, updateDoc, serverTimestamp, Timestamp, getCountFromServer } from 'firebase/firestore'
import { format } from 'date-fns'
import { ADMIN_EMAIL, db } from '../firebase'
import BrandLogo from '../components/BrandLogo'
import Toast from '../components/Toast'
import { buildServiceCatalog } from '../utils/serviceCatalog'
import { DEFAULT_FEATURES, normalizeFeature } from '../utils/siteContent'
import { countOpenDays, fetchBookingSettings, getAvailabilityForDate, getCachedBookingSettings } from '../utils/bookingSettings'
import { fetchBoardingSettings, getCachedBoardingSettings } from '../utils/boardingSettings'
import { fetchWalkingSettings, getCachedWalkingSettings } from '../utils/walkingSettings'
import { buildGeneralWhatsAppMessage, fetchBusinessInfo } from '../utils/businessInfo'
import { optimizeCloudinary } from '../utils/imageOptimizer'
import { getHomeCache, setHomeCache, preloadImage, prefetchImages } from '../utils/homeCache'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import { BOOKING_STATUS } from '../utils/services'
import boardingHeroPets from '../assets/boarding-hero-pets.png'
import boardingDogAvatar from '../assets/boarding-dog-avatar.png'
import boardingCatAvatar from '../assets/boarding-cat-avatar.png'
import petWalkingHero from '../assets/pet-walking-hero.jpg'
import petGroomingCroppedHero from '../assets/pet-grooming-cropped-hero.jpg'
import { Calendar, MapPin, Phone, ChevronRight, ChevronDown, ChevronUp, Award, Clock, Shield, Star, ChevronLeft, ArrowRight, Images, X, Package, Scissors, Heart, ExternalLink, Home as HomeIcon, Store, Crown, BadgeCheck, Sparkles, PawPrint, Navigation, Instagram, Facebook, Youtube, Twitter, Linkedin, MessageCircle, Utensils, Footprints, Hotel, Users, Coins, History, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { DEFAULT_SUPERCOIN_SETTINGS, fetchSuperCoinSettings, getUserTier } from '../utils/superCoins'

const HERO_FALLBACK_IMAGE = '/hero-fallback.jpg'
const DEFAULT_HERO_IMAGES = [
  { src: HERO_FALLBACK_IMAGE, alt: 'Paw Paw Pet Grooming Salon & Spa' }
]
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

function getRecommendedVisitRelativeText(date) {
  if (!date) return ''
  const today = new Date()
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((date.getTime() - todayDay.getTime()) / 86400000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays <= 7) return `In ${diffDays} days`
  const weeks = Math.round(diffDays / 7)
  return `In about ${weeks} week${weeks === 1 ? '' : 's'}`
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

// High-performance client-side cache hydration (Instant 0ms initial render)
let cachedHeroImages = getHomeCache('heroImages', null)
let cachedVisitImages = getHomeCache('visitImages', null)
let cachedGroomingChoiceImage = getHomeCache('groomingChoiceImage', null)
let cachedBookingSettings = getCachedBookingSettings()
let cachedBoardingSettings = getCachedBoardingSettings()
let cachedWalkingSettings = getCachedWalkingSettings()

// Eagerly prefetch the first hero image immediately on module initialization
if (cachedHeroImages && cachedHeroImages[0]?.src) {
  preloadImage(cachedHeroImages[0].src, 'high')
}
if (cachedGroomingChoiceImage) {
  preloadImage(cachedGroomingChoiceImage, 'low')
}

function HeroSlider() {
  const { user, profile } = useAuth()
  const { sendNotification } = useNotifications() || {}
  const [current, setCurrent] = useState(0)
  const [heroImages, setHeroImages] = useState(() => cachedHeroImages)
  const [loadedMap, setLoadedMap] = useState({})
  const [errorMap, setErrorMap] = useState({})
  const [visitImages, setVisitImages] = useState(() => cachedVisitImages || DEFAULT_VISIT_IMAGES)
  const [groomingChoiceImage, setGroomingChoiceImage] = useState(() => cachedGroomingChoiceImage || '')
  const [paused, setPaused] = useState(false)
  const [upcomingAppointment, setUpcomingAppointment] = useState(null)
  const [upcomingPetProfile, setUpcomingPetProfile] = useState(null)
  const [recommendedVisit, setRecommendedVisit] = useState(null)
  const [upcomingLoading, setUpcomingLoading] = useState(true)
  const [bookingSettings, setBookingSettings] = useState(() => cachedBookingSettings)
  const [boardingSettings, setBoardingSettings] = useState(() => cachedBoardingSettings)
  const [showBoardingLearnMore, setShowBoardingLearnMore] = useState(false)
  const [walkingSettings, setWalkingSettings] = useState(() => cachedWalkingSettings)
  const [showWalkingLearnMore, setShowWalkingLearnMore] = useState(false)
  const [superCoinsSettings, setSuperCoinsSettings] = useState(DEFAULT_SUPERCOIN_SETTINGS)
  const [showCoinsModal, setShowCoinsModal] = useState(false)
  const [showHowCoinsWork, setShowHowCoinsWork] = useState(false)
  const [rescheduleToast, setRescheduleToast] = useState('')
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleSlot, setRescheduleSlot] = useState('')
  const [rescheduleBookedSlots, setRescheduleBookedSlots] = useState([])
  const [reschedulingId, setReschedulingId] = useState('')

  const isGroomingClosed = Boolean(bookingSettings && (bookingSettings.acceptBookings === false || bookingSettings.emergencyClosure === true))
  const isHeroImagesLoading = heroImages === null
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
            src: optimizeCloudinary(image.url, 1200),
            alt: image.alt || `Pet grooming hero image ${index + 1}`,
          }))
          : []
        const savedVisitImages = Array.isArray(data.visitImages) ? data.visitImages : []
        const cleanVisitImages = DEFAULT_VISIT_IMAGES.map((fallback, index) => ({
          ...fallback,
          url: savedVisitImages[index]?.url ? optimizeCloudinary(savedVisitImages[index].url, 800) : '',
          alt: savedVisitImages[index]?.alt || fallback.alt,
        }))
        const rawGroomingUrl = data.groomingChoiceImage?.url || (Array.isArray(data.visitImages) && data.visitImages[0]?.url ? data.visitImages[0].url : '')
        const savedGroomingUrl = rawGroomingUrl ? optimizeCloudinary(rawGroomingUrl, 1000) : ''

        cachedHeroImages = cleanImages
        cachedVisitImages = cleanVisitImages
        cachedGroomingChoiceImage = savedGroomingUrl

        // Save to persistent localStorage cache for instant future loads
        setHomeCache('heroImages', cleanImages)
        setHomeCache('visitImages', cleanVisitImages)
        setHomeCache('groomingChoiceImage', savedGroomingUrl)

        setGroomingChoiceImage(savedGroomingUrl)
        setHeroImages(cleanImages)
        setVisitImages(cleanVisitImages)

        // Preload next hero slides in idle time
        if (cleanImages.length > 1) {
          prefetchImages(cleanImages.slice(1).map(img => img.src))
        }
      } catch {
        if (!cachedHeroImages) {
          setHeroImages(DEFAULT_HERO_IMAGES)
          setVisitImages(DEFAULT_VISIT_IMAGES)
        }
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
    fetchBookingSettings(db).then(setBookingSettings).catch(() => { })
    fetchBoardingSettings(db).then(setBoardingSettings).catch(() => { })
    fetchWalkingSettings(db).then(setWalkingSettings).catch(() => { })
    fetchSuperCoinSettings(db).then(setSuperCoinsSettings).catch(() => { })
  }, [])

  useEffect(() => {
    async function fetchUpcomingAppointment() {
      if (!user?.uid && !user?.email) {
        setUpcomingAppointment(null)
        setUpcomingPetProfile(null)
        setRecommendedVisit(null)
        setUpcomingLoading(false)
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
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const recommendationCandidates = bookings
          .filter(booking => String(booking?.status || '').toLowerCase() === 'completed')
          .map(booking => {
            const days = Number(booking?.nextRecommendedVisitDays)
            if (!Number.isFinite(days) || days <= 0) return null
            const completedAt = booking?.completedAt?.toDate ? booking.completedAt.toDate() : parseAppointmentStart(booking) || (booking?.date ? new Date(`${booking.date}T00:00:00`) : null)
            if (!completedAt || Number.isNaN(completedAt.getTime())) return null
            const recommendedDate = new Date(completedAt)
            recommendedDate.setDate(recommendedDate.getDate() + days)
            return { ...booking, recommendedDate }
          })
          .filter(Boolean)
          .filter(booking => booking.recommendedDate.getTime() >= today.getTime())
          .sort((a, b) => a.recommendedDate.getTime() - b.recommendedDate.getTime())
        const nextRecommendation = recommendationCandidates[0] || null
        setUpcomingAppointment(nextBooking)
        setUpcomingPetProfile(findPetProfileForBooking(nextBooking, petLookup))
        setRecommendedVisit(nextRecommendation)
      } catch {
        setUpcomingAppointment(null)
        setUpcomingPetProfile(null)
        setRecommendedVisit(null)
      } finally {
        setUpcomingLoading(false)
      }
    }

    fetchUpcomingAppointment()
  }, [user?.uid, user?.email])

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
  const recommendedDateLabel = recommendedVisit?.recommendedDate ? recommendedVisit.recommendedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const recommendedDateRelativeText = recommendedVisit?.recommendedDate ? getRecommendedVisitRelativeText(recommendedVisit.recommendedDate) : ''
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
  const recommendedPetImageCandidates = [
    recommendedVisit?.petPhotoUrl,
    recommendedVisit?.petPhoto,
    recommendedVisit?.photoUrl,
    recommendedVisit?.pet?.photoUrl,
    recommendedVisit?.pet?.photo,
    recommendedVisit?.pet?.imageUrl,
  ]
  const petImageUrl = petImageCandidates.find(Boolean) || ''
  const recommendedPetImageUrl = recommendedPetImageCandidates.find(Boolean) || ''
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

  const buildRecommendedBookingLink = (booking) => {
    if (!booking) return '/book'
    const params = new URLSearchParams()
    const serviceIds = Array.isArray(booking.serviceIds) && booking.serviceIds.length
      ? booking.serviceIds
      : booking.serviceId
        ? [booking.serviceId]
        : []
    if (serviceIds.length) {
      serviceIds.forEach(id => { if (id) params.append('service', id) })
    } else if (booking.serviceName) {
      params.set('serviceName', booking.serviceName)
    }
    params.set('visit', booking.bookingType === 'home' ? 'home' : 'centre')
    const recommendedDate = booking.recommendedDate && booking.recommendedDate.toDate ? booking.recommendedDate.toDate() : booking.recommendedDate
    if (recommendedDate instanceof Date && !Number.isNaN(recommendedDate.getTime())) {
      params.set('date', format(recommendedDate, 'yyyy-MM-dd'))
    }
    if (booking.petName) params.set('petName', booking.petName)
    if (booking.petType) params.set('petType', booking.petType)
    if (booking.petBreed) params.set('petBreed', booking.petBreed)
    if (booking.customBreed) params.set('customBreed', booking.customBreed)
    if (booking.address) params.set('address', booking.address)
    const query = params.toString()
    return query ? `/book?${query}` : '/book'
  }

  const confirmReschedule = async () => {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleSlot) return
    const previousDate = rescheduleTarget.date || ''
    const previousSlot = rescheduleTarget.slot || ''
    const sameAsCurrent = String(rescheduleDate || '') === String(previousDate) && String(rescheduleSlot || '') === String(previousSlot)
    if (sameAsCurrent) {
      setRescheduleToast('Cannot reschedule to the same slot. Please choose a different slot.')
      return
    }
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
      if (sendNotification) {
        await sendNotification('', {
          userEmail: ADMIN_EMAIL || '',
          toAdmin: true,
          title: 'Appointment rescheduled',
          message: `${rescheduleTarget.petName || 'Pet'} (${rescheduleTarget.serviceName || 'Grooming'}) was moved from ${previousDate} at ${previousSlot} to ${rescheduleDate} at ${rescheduleSlot}.`,
          type: 'rescheduled',
          bookingId: rescheduleTarget.id,
          actionUrl: `/admin/bookings/${rescheduleTarget.id}`,
        })
      }
      setRescheduleTarget(null)
      setRescheduleDate('')
      setRescheduleSlot('')
      setRescheduleBookedSlots([])
      setRescheduleToast('Appointment rescheduled successfully.')
    } catch {
      alert('Could not reschedule booking. Please try again.')
    }
    setReschedulingId('')
  }

  const visitCards = [
    {
      title: 'Home Visit',
      text: 'We come directly to your doorstep with our sanitized equipment. Zero travel stress for your pet.',
      cta: 'Choose Home Visit',
      to: '/book?visit=home',
      icon: <HomeIcon size={20} />,
      image: visitImages[0],
    },
    {
      title: 'Visit Centre',
      text: 'Bring your pet to our fully equipped salon centre for a relaxing spa & grooming day in Dhayari.',
      cta: 'Choose Centre',
      to: '/book?visit=centre',
      icon: <Store size={20} />,
      image: visitImages[1],
    },
  ]

  return (
    <section className="home-redesign" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {rescheduleToast && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={rescheduleToast} type={rescheduleToast.includes('Cannot') ? 'error' : 'success'} onClose={() => setRescheduleToast('')} />
        </div>
      )}
      <div className="home-redesign-inner">
        <div className="mobile-hero-card">
          <div className="mobile-hero-media" aria-label="Pet grooming hero images">
            {/* Fallback hero image displayed immediately while loading or when image fails */}
            <img
              src={HERO_FALLBACK_IMAGE}
              alt="Paw Paw Pet Grooming"
              className="mobile-hero-fallback-img"
              loading="eager"
              fetchpriority="high"
              decoding="async"
              onError={e => {
                if (!e.currentTarget.dataset.retried) {
                  e.currentTarget.dataset.retried = 'true'
                  e.currentTarget.src = '/hero-fallback.jpg'
                }
              }}
            />
            {images.map((image, i) => {
              const isLoaded = Boolean(loadedMap[image.src])
              const isError = Boolean(errorMap[image.src])
              const isActive = i === current

              if (isError) return null

              return (
                <img
                  key={image.src}
                  src={image.src}
                  alt={image.alt}
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchpriority={i === 0 ? "high" : "auto"}
                  decoding="async"
                  onLoad={() => setLoadedMap(prev => prev[image.src] ? prev : ({ ...prev, [image.src]: true }))}
                  onError={() => setErrorMap(prev => prev[image.src] ? prev : ({ ...prev, [image.src]: true }))}
                  className={`mobile-hero-slide-img ${isActive ? 'active' : ''} ${isLoaded ? 'is-loaded' : ''}`}
                />
              )
            })}
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

        {/* 🪙 SuperCoins Loyalty Feature Card (Position 1 - Static) */}
        {superCoinsSettings.enabled && (() => {
          const userCoins = Math.max(0, Number(profile?.superCoins) || 0)
          const coinVal = superCoinsSettings.coinValueInRupees || 1
          return (
            <div
              onClick={() => setShowCoinsModal(true)}
              style={{
                margin: '12px 0 8px',
                padding: '10px 14px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #FFFDF5 0%, #FEF9C3 60%, #FFFBEB 100%)',
                border: '1.2px solid #FDE68A',
                boxShadow: '0 2px 10px rgba(217, 119, 6, 0.07)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    background: '#FEF3C7',
                    border: '1px solid #FCD34D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    flexShrink: 0,
                    boxShadow: '0 1px 3px rgba(245, 158, 11, 0.2)',
                  }}
                >
                  🪙
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong style={{ fontSize: '13px', color: '#78350F', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {user ? `Paw Paw SuperCoins (${userCoins})` : 'Paw Paw SuperCoins Loyalty'}
                    </strong>
                    <span style={{ fontSize: '10px', fontWeight: 800, background: '#FEF3C7', color: '#92400E', padding: '1px 7px', borderRadius: '999px', border: '1px solid #FDE68A', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {user ? `₹${userCoins * coinVal} OFF` : `${superCoinsSettings.earnPercentage}% CASHBACK`}
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#92400E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user
                      ? `Save up to ${superCoinsSettings.maxRedeemPercentage}% on bookings · Tap to view passbook`
                      : `Earn coins on Grooming, Walking & Boarding · 1 Coin = ₹1`}
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#B45309',
                  flexShrink: 0,
                }}
              >
                <span>View</span>
                <ChevronRight size={14} />
              </div>
            </div>
          )
        })()}

        <div className="mobile-hero-copy" key={`hero-copy-${current}`}>
          <div className="mobile-hero-text">
            <h1>{slideCopy.title} <span>{slideCopy.highlight}<PawPrint className="hero-title-paw" size={26} /></span></h1>
            <p>{slideCopy.sub}</p>
            <div className="mobile-hero-location-pill">
              <span>📍 Premium Pet Grooming & Boarding · Dhayri, Pune</span>
            </div>
          </div>
          <div className="mobile-hero-actions">
            {!isGroomingClosed ? (
              <Link to="/book" className="btn btn-primary"><Calendar size={16} /> Book Appointment</Link>
            ) : (
              <div className="home-boarding-closed-pill" style={{ margin: 0, padding: '10px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '999px', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                <Clock size={15} /> Grooming Bookings Temporarily Closed
              </div>
            )}
            <Link to="/services" className="btn btn-secondary">View Services <ArrowRight size={16} /></Link>
          </div>
        </div>

        {/* Pet Boarding — Your Pet's Home Away From Home (Matches Reference Mockup) */}
        <section className="home-boarding-section" aria-label="Pet Boarding Suites">
          <div className="home-boarding-card">
            <div className="home-boarding-content home-fade-up">
              {/* Top Bar with PET BOARDING pill and NEW badge */}
              <div className="home-boarding-top-bar">
                <div className="home-boarding-pill">
                  <PawPrint size={13} /> PET BOARDING
                </div>
                {(boardingSettings?.showNewBadge !== false) && (
                  <div className="home-boarding-new-badge" aria-label="New feature announcement">
                    <Sparkles size={11} /> NEW
                  </div>
                )}
              </div>

              <h2 className="home-boarding-title">
                Your Pet's Home <br />
                <span className="gold-accent">Away From Home</span>
              </h2>

              <p className="home-boarding-desc">
                Safe, clean and comfortable stay for your furry family with loving care while you are away.
              </p>

              {/* Pricing Cards */}
              <div className="home-boarding-prices">
                <div className="home-boarding-price-card home-fade-up stagger-1">
                  <img
                    src={boardingSettings?.dogImageUrl ? optimizeCloudinary(boardingSettings.dogImageUrl, 200) : boardingDogAvatar}
                    alt="Dog Boarding"
                    className="home-boarding-avatar"
                    onError={e => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = boardingDogAvatar;
                    }}
                  />
                  <div className="home-boarding-price-info">
                    <div className="home-boarding-price-label">Dog Boarding</div>
                    <div className="home-boarding-price-amount">
                      ₹{boardingSettings?.dogDailyRate || 800} <span className="home-boarding-price-unit">/ day</span>
                    </div>
                  </div>
                </div>

                <div className="home-boarding-price-card home-fade-up stagger-2">
                  <img
                    src={boardingSettings?.catImageUrl ? optimizeCloudinary(boardingSettings.catImageUrl, 200) : boardingCatAvatar}
                    alt="Cat Boarding"
                    className="home-boarding-avatar"
                    onError={e => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = boardingCatAvatar;
                    }}
                  />
                  <div className="home-boarding-price-info">
                    <div className="home-boarding-price-label">Cat Boarding</div>
                    <div className="home-boarding-price-amount">
                      ₹{boardingSettings?.catDailyRate || 600} <span className="home-boarding-price-unit">/ day</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className={`home-boarding-actions home-fade-up stagger-3 ${boardingSettings?.acceptBookings === false ? 'is-closed' : ''}`}>
                {(boardingSettings?.acceptBookings !== false) ? (
                  <Link to="/boarding" className="home-boarding-btn-primary">
                    <Calendar size={16} /> Book Pet Boarding <ArrowRight size={15} />
                  </Link>
                ) : (
                  <div className="home-boarding-closed-pill" title="Boarding reservations are temporarily closed">
                    <Clock size={15} /> {boardingSettings?.buttonLabel || 'Boarding Bookings Temporarily Closed'}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowBoardingLearnMore(true)}
                  className="home-boarding-btn-secondary"
                >
                  Learn More <ArrowRight size={15} />
                </button>

                {boardingSettings?.acceptBookings === false && (
                  <>
                    {boardingSettings?.emergencyNotice && (
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)', textAlign: 'center', fontStyle: 'italic', maxWidth: '420px', width: '100%' }}>
                        &ldquo;{boardingSettings.emergencyNotice}&rdquo;
                      </p>
                    )}
                    {boardingSettings?.reopenDate && (
                      <span style={{ fontSize: '11.5px', color: '#059669', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '3px 12px', borderRadius: '999px', fontWeight: 700 }}>
                        Expected reopening: {boardingSettings.reopenDate}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Large Hero Image (Default illustration as background to prevent blank box while custom image loads) */}
            <div
              className="home-boarding-hero-wrap home-fade-up stagger-2"
              style={{
                backgroundImage: `url(${boardingHeroPets})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center 25%',
              }}
            >
              <img
                src={boardingSettings?.bannerImageUrl ? optimizeCloudinary(boardingSettings.bannerImageUrl, 800) : boardingHeroPets}
                alt="Dog and cat resting comfortably together in cozy pet boarding suite"
                className="home-boarding-pets-img"
                loading="eager"
                decoding="async"
                onError={e => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = boardingHeroPets;
                }}
              />
            </div>
          </div>
        </section>

        {/* Learn More Modal */}
        {showBoardingLearnMore && (
          <div className="modal-overlay" onClick={() => setShowBoardingLearnMore(false)}>
            <div className="reschedule-modal-card" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
              <div className="reschedule-modal-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                    Paw Paw Pet Boarding Guide
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                    Everything you need to know about our overnight care for dogs & cats
                  </p>
                </div>
                <button type="button" className="icon-btn" onClick={() => setShowBoardingLearnMore(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: '12px', margin: '16px 0', maxHeight: '60vh', overflowY: 'auto' }}>
                <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <HomeIcon size={16} /> 1. Cozy, Sanitized Suites
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Climate-controlled, clean, and spacious rooms designed to feel like home. Separate quiet spaces for cats and lively play zones for dogs.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Utensils size={16} /> 2. Tailored Meals & Fresh Water
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    We follow your pet's exact feeding routine. Bring their favorite food or choose Paw Paw's nutritious fresh home food or packaged kibble.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <PawPrint size={16} /> 3. Daily Walks, Play & Cuddles
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Dogs enjoy morning and evening walks plus outdoor playtime. Cats receive interactive indoor play, scratching posts, and gentle attention.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageCircle size={16} /> 4. Daily WhatsApp Updates
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Stay connected while you travel with daily photos and videos showing your furry family eating, playing, and relaxing happily.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--accent-bg)', borderRadius: '14px', border: '1px solid var(--accent-border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px' }}>
                    Transparent Daily Rates & No Advance Fees
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>
                    <strong>Dog Boarding:</strong> ₹{boardingSettings?.dogDailyRate || 800} / day · <strong>Cat Boarding:</strong> ₹{boardingSettings?.catDailyRate || 600} / day. No online payments required in advance; pay upon check-in or pick-up.
                  </div>
                </div>
              </div>

              <div className="reschedule-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowBoardingLearnMore(false)}>
                  Close
                </button>
                {(boardingSettings?.acceptBookings !== false) && (
                  <Link
                    to="/boarding"
                    className="btn btn-primary"
                    onClick={() => setShowBoardingLearnMore(false)}
                  >
                    <Calendar size={15} /> Book Pet Boarding
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Pet Walking — Daily Walks & Exercise */}
        <section className="home-boarding-section home-walking-section" aria-label="Pet Walking Service" style={{ marginTop: '16px' }}>
          <div className="home-boarding-card">
            <div className="home-boarding-content home-fade-up">
              {/* Top Bar with PET WALKING pill and NEW badge */}
              <div className="home-boarding-top-bar">
                <div className="home-boarding-pill">
                  <Footprints size={13} /> PET WALKING
                </div>
                {(walkingSettings?.showNewBadge !== false) && (
                  <div className="home-boarding-new-badge" aria-label="New feature announcement">
                    <Sparkles size={11} /> NEW
                  </div>
                )}
              </div>

              <h2 className="home-boarding-title">
                Daily Walks & Exercise <br />
                <span className="gold-accent">Happy Tails Every Day</span>
              </h2>

              <p
                className="home-boarding-desc"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: '1.45',
                  marginBottom: '16px'
                }}
              >
                {walkingSettings?.description || 'Reliable, loving dog walkers around Dhayari with morning & evening shifts.'}
              </p>

              {/* Pricing Cards */}
              <div className="home-boarding-prices" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                {((walkingSettings?.durations && walkingSettings.durations.length > 0)
                  ? walkingSettings.durations
                  : [
                      { duration: 30, price: walkingSettings?.rate30Min || 199, label: '30 Min Walk' },
                      { duration: 45, price: walkingSettings?.rate45Min || 279, label: '45 Min Walk' },
                      { duration: 60, price: walkingSettings?.rate60Min || 349, label: '60 Min Walk' },
                    ]
                ).map((tier, i) => (
                  <div key={tier.duration} className={`home-boarding-price-card home-fade-up stagger-${i + 1}`}>
                    <div className="home-boarding-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                      <Footprints size={22} />
                    </div>
                    <div className="home-boarding-price-info">
                      <div className="home-boarding-price-label">{tier.label || `${tier.duration} Min Walk`}</div>
                      <div className="home-boarding-price-amount">
                        ₹{tier.price} <span className="home-boarding-price-unit">/ session</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className={`home-boarding-actions home-fade-up stagger-3 ${walkingSettings?.acceptBookings === false ? 'is-closed' : ''}`}>
                {(walkingSettings?.acceptBookings !== false) ? (
                  <Link to="/book-walking" className="home-boarding-btn-primary">
                    <Footprints size={16} /> Book a Walk <ArrowRight size={15} />
                  </Link>
                ) : (
                  <div className="home-boarding-closed-pill" title="Pet walking bookings are temporarily closed">
                    <Clock size={15} /> {walkingSettings?.buttonLabel || 'Walking Bookings Temporarily Closed'}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowWalkingLearnMore(true)}
                  className="home-boarding-btn-secondary"
                >
                  Learn More <ArrowRight size={15} />
                </button>

                {walkingSettings?.acceptBookings === false && (
                  <>
                    {walkingSettings?.emergencyNotice && (
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)', textAlign: 'center', fontStyle: 'italic', maxWidth: '420px', width: '100%' }}>
                        &ldquo;{walkingSettings.emergencyNotice}&rdquo;
                      </p>
                    )}
                    {walkingSettings?.reopenDate && (
                      <span style={{ fontSize: '11.5px', color: '#059669', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '3px 12px', borderRadius: '999px', fontWeight: 700 }}>
                        Expected reopening: {walkingSettings.reopenDate}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Large Hero Image */}
            <div
              className="home-boarding-hero-wrap home-fade-up stagger-2"
              style={{
                backgroundImage: `url(${petWalkingHero})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <img
                src={walkingSettings?.bannerImageUrl ? optimizeCloudinary(walkingSettings.bannerImageUrl, 800) : petWalkingHero}
                alt="Happy dog enjoying daily outdoor walk"
                className="home-boarding-pets-img"
                loading="eager"
                decoding="async"
                onError={e => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = petWalkingHero;
                }}
              />
            </div>
          </div>
        </section>

        {/* Pet Walking Learn More Modal */}
        {showWalkingLearnMore && (
          <div className="modal-overlay" onClick={() => setShowWalkingLearnMore(false)}>
            <div className="reschedule-modal-card" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
              <div className="reschedule-modal-header">
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Footprints size={20} style={{ color: 'var(--accent)' }} /> Paw Paw Pet Walking Guide
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                    Daily energetic walks & exercise for dogs in Dhayari & nearby
                  </p>
                </div>
                <button type="button" className="icon-btn" onClick={() => setShowWalkingLearnMore(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: '12px', margin: '16px 0', maxHeight: '60vh', overflowY: 'auto' }}>
                <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Footprints size={16} /> 1. Dedicated & Trained Dog Walkers
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Individual attention, gentle handling, and safe leash walking adapted to your dog's size, temperament, and walking speed.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={16} /> 2. Flexible Morning & Evening Shifts
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Choose 30, 45, or 60 minutes across convenient morning (6:30 AM – 9:30 AM) and evening (5:00 PM – 8:00 PM) slots.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageCircle size={16} /> 3. WhatsApp Route & Photo Updates
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Instant updates sent right to your phone so you know your dog had their pee, poop, hydration, and happy workout.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={16} /> 4. Dhayari & Nearby Areas Covered
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Doorstep pick-up & drop-off in Dhayari, Vadgaon Budruk, Narhe, Sinhagad Road, and nearby neighborhoods.
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--accent-bg)', borderRadius: '14px', border: '1px solid var(--accent-border)' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px' }}>
                    Simple Per-Walk Pricing
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>
                    {((walkingSettings?.durations && walkingSettings.durations.length > 0)
                      ? walkingSettings.durations
                      : [
                          { duration: 30, price: walkingSettings?.rate30Min || 199 },
                          { duration: 45, price: walkingSettings?.rate45Min || 279 },
                          { duration: 60, price: walkingSettings?.rate60Min || 349 },
                        ]
                    ).map(d => `${d.duration} Min: ₹${d.price}`).join(' · ')}. Pay after confirmation or at pickup.
                  </div>
                </div>
              </div>

              <div className="reschedule-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowWalkingLearnMore(false)}>
                  Close
                </button>
                {(walkingSettings?.acceptBookings !== false) && (
                  <Link
                    to="/book-walking"
                    className="btn btn-primary"
                    onClick={() => setShowWalkingLearnMore(false)}
                  >
                    <Footprints size={15} /> Book a Walk
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SuperCoins Loyalty Modal */}
        {showCoinsModal && (() => {
          const userCoins = Math.max(0, Number(profile?.superCoins) || 0)
          const coinVal = superCoinsSettings.coinValueInRupees || 1
          const historyList = Array.isArray(profile?.superCoinHistory) ? [...profile.superCoinHistory].reverse() : []

          return (
            <div className="modal-overlay profile-modal-overlay" onClick={() => setShowCoinsModal(false)}>
              <div
                className="modal-box profile-modal-box"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: '480px', borderRadius: '24px', overflow: 'hidden' }}
              >
                {/* Head */}
                <div
                  style={{
                    padding: '14px 18px',
                    background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)',
                    color: '#fff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>🪙</span>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#fff' }}>
                        Paw Paw SuperCoins
                      </h2>
                      <span style={{ fontSize: '11px', color: '#C7D2FE' }}>
                        Loyalty Rewards & Passbook
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCoinsModal(false)}
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                    aria-label="Close SuperCoins passbook"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Body */}
                <div style={{ padding: '14px 16px', maxHeight: '72vh', overflowY: 'auto' }}>
                  {/* Compact Balance Card */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                      border: '1.2px solid #FCD34D',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      marginBottom: '12px',
                      boxShadow: '0 2px 8px rgba(245, 158, 11, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'block' }}>
                        {user ? 'Available Balance' : 'Loyalty Cashback'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '2px 0 1px' }}>
                        <span style={{ fontSize: '20px', lineHeight: 1 }}>🪙</span>
                        <strong style={{ fontSize: '22px', fontWeight: 900, color: '#78350F', lineHeight: 1 }}>
                          {user ? userCoins : `${superCoinsSettings.earnPercentage}%`}
                        </strong>
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#B45309', marginLeft: '4px' }}>
                          {user ? `(₹${userCoins * coinVal})` : 'Cashback on every service'}
                        </span>
                      </div>
                      <span style={{ fontSize: '10.5px', color: '#92400E' }}>
                        {user ? 'Applicable for booking discounts' : 'Earn coins on Grooming, Walking & Boarding'}
                      </span>
                    </div>

                    <span style={{ background: '#fff', border: '1px solid #FCD34D', borderRadius: '999px', padding: '3px 9px', fontSize: '10.5px', fontWeight: 800, color: '#92400E', flexShrink: 0 }}>
                      1 Coin = ₹{coinVal}
                    </span>
                  </div>

                  {/* Collapsible Label for How SuperCoins Work */}
                  <div style={{ marginBottom: '14px' }}>
                    <button
                      type="button"
                      onClick={() => setShowHowCoinsWork(p => !p)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px 2px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#B45309',
                      }}
                    >
                      <span style={{ fontSize: '13px', lineHeight: 1 }}>💡</span>
                      <span>How SuperCoins Work</span>
                      {showHowCoinsWork ? <ChevronUp size={14} color="#B45309" /> : <ChevronDown size={14} color="#B45309" />}
                    </button>

                    {showHowCoinsWork && (
                      <div
                        style={{
                          marginTop: '6px',
                          background: 'var(--surface, #F8FAFC)',
                          border: '1px solid var(--border)',
                          borderRadius: '12px',
                          padding: '10px 12px',
                          fontSize: '11px',
                          boxSizing: 'border-box',
                          width: '100%',
                        }}
                      >
                        <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--muted)', display: 'grid', gap: '4px', lineHeight: 1.4 }}>
                          <li>
                            <strong>Earn {superCoinsSettings.earnPercentage}%:</strong> Automatically after each completed service.
                          </li>
                          <li>
                            <strong>Redeem:</strong> Apply at checkout to save up to <strong>{superCoinsSettings.maxRedeemPercentage}%</strong> (1 coin = ₹1).
                          </li>
                          <li>
                            <strong>Tier Boost:</strong> Silver & Gold members earn up to <strong>{superCoinsSettings.tiers?.goldMultiplier || 1.5}x</strong> extra.
                          </li>
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Passbook History or Login Prompt */}
                  {user ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '12.5px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <History size={14} color="var(--accent)" />
                          Passbook History
                        </strong>
                        <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 600 }}>
                          {historyList.length} {historyList.length === 1 ? 'Entry' : 'Entries'}
                        </span>
                      </div>

                      {historyList.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '16px 10px', background: 'var(--surface)', borderRadius: '10px', border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: '11px' }}>
                          No coin transactions yet. Complete bookings to earn SuperCoins! 🐾
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: '6px' }}>
                          {historyList.slice(0, 5).map((tx, idx) => {
                            const isCredit = tx.type === 'credit'
                            const dateStr = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
                            const timeStr = tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''

                            return (
                              <div
                                key={tx.id || idx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '8px 10px',
                                  borderRadius: '10px',
                                  background: 'var(--card)',
                                  border: '1px solid var(--border)',
                                  fontSize: '11.5px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <div
                                    style={{
                                      width: '26px',
                                      height: '26px',
                                      borderRadius: '50%',
                                      background: isCredit ? '#DCFCE7' : '#FEE2E2',
                                      color: isCredit ? '#15803D' : '#DC2626',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {isCredit ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                                  </div>
                                  <div>
                                    <strong style={{ fontSize: '11.5px', color: 'var(--text)', display: 'block' }}>
                                      {tx.description || (isCredit ? 'Coins Earned' : 'Coins Redeemed')}
                                    </strong>
                                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                                      {dateStr} {timeStr ? `• ${timeStr}` : ''}
                                    </span>
                                  </div>
                                </div>

                                <strong
                                  style={{
                                    fontSize: '12.5px',
                                    fontWeight: 800,
                                    color: isCredit ? '#16A34A' : '#DC2626',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {isCredit ? `+${tx.coins}` : `-${tx.coins}`}
                                </strong>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                        <Link
                          to="/profile"
                          onClick={() => setShowCoinsModal(false)}
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 700,
                            color: '#4338CA',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            textDecoration: 'none',
                          }}
                        >
                          <span>View full profile & loyalty tier</span>
                          <ArrowRight size={12} />
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '16px 14px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text)', lineHeight: 1.4 }}>
                        Sign in to check your SuperCoin balance, earn cashback on bookings, and unlock higher tier multipliers!
                      </p>
                      <Link
                        to="/login"
                        onClick={() => setShowCoinsModal(false)}
                        className="btn btn-primary"
                        style={{ padding: '8px 16px', fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        Sign In / Register <ArrowRight size={14} />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {(user?.uid || user?.email) && (
          <section className="upcoming-appointment-section home-fade-up">
            <div className="upcoming-appointment-card">
              <div className="upcoming-appointment-header">
                <div className="upcoming-appointment-title-wrap">
                  <p className="section-label upcoming-appointment-title">
                    <Calendar size={14} className="upcoming-appointment-icon" />
                    Upcoming Appointment
                  </p>
                </div>
                <Link to="/my-bookings" className="home-pill-link">View All <ArrowRight size={16} /></Link>
              </div>
              {upcomingLoading ? (
                <div className="upcoming-appointment-body" style={{ cursor: 'default' }}>
                  <div className="upcoming-appointment-main">
                    <div className="upcoming-appointment-photo-stack">
                      <div className="upcoming-appointment-photo">
                        <div className="upcoming-appointment-photo-fallback">
                          <PawPrint size={28} />
                        </div>
                      </div>
                    </div>
                    <div className="upcoming-appointment-details">
                      <div className="upcoming-appointment-meta">
                        <span className="upcoming-appointment-status">Checking appointments...</span>
                      </div>
                      <h4>Please wait</h4>
                      <div className="upcoming-appointment-meta-column">
                        <span className="upcoming-appointment-info-item">
                          Fetching your latest booking data.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : upcomingAppointment ? (
                <div
                  className="upcoming-appointment-body"
                  role="button"
                  tabIndex={0}
                  onClick={handleAppointmentCardClick}
                  onKeyDown={handleAppointmentCardKeyDown}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="upcoming-appointment-main">
                    <div className="upcoming-appointment-photo-stack">
                      <div className="upcoming-appointment-photo">
                        {petImageUrl ? (
                          <img src={optimizeCloudinary(petImageUrl, 200)} alt={petNameLabel} loading="lazy" decoding="async" />
                        ) : (
                          <PawPrint size={28} />
                        )}
                      </div>
                      <div className="upcoming-appointment-petname">{petNameLabel}</div>
                    </div>
                    <div className="upcoming-appointment-details">
                      <div className="upcoming-appointment-meta">
                        <span className="upcoming-appointment-status">{getUpcomingStatusLabel(upcomingAppointment)}</span>
                        <span
                          className="upcoming-appointment-type"
                          style={{ border: '1px solid rgba(0,0,0,0.06)', padding: '6px 10px', borderRadius: '999px', display: 'inline-flex', gap: '8px', alignItems: 'center', fontSize: '13px' }}
                        >
                          {(upcomingAppointment?.bookingType || 'store') === 'home' ? (
                            <>
                              <HomeIcon size={14} />
                              <span>Home Visit</span>
                            </>
                          ) : (
                            <>
                              <Store size={14} />
                              <span>At Centre</span>
                            </>
                          )}
                        </span>
                      </div>
                      <h4>{upcomingAppointment?.serviceName || 'Service'}</h4>
                      <div className="upcoming-appointment-meta-column">
                        <span className="upcoming-appointment-info-item">
                          <Calendar size={14} /> <strong>{appointmentDateParts.dateLabel} • {appointmentDateParts.timeLabel}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                  {canRescheduleBooking(upcomingAppointment) ? (
                    <button className="btn btn-secondary" onClick={handleRescheduleClick} onKeyDown={e => e.stopPropagation()}>Reschedule</button>
                  ) : (
                    <div style={{ width: 120 }} />
                  )}
                </div>
              ) : recommendedVisit ? (
                <div className="upcoming-appointment-body" style={{ cursor: 'default' }}>
                  <div className="upcoming-appointment-main">
                    <div className="upcoming-appointment-photo-stack">
                      <div className="upcoming-appointment-photo">
                        {recommendedPetImageUrl ? (
                          <img src={optimizeCloudinary(recommendedPetImageUrl, 200)} alt={recommendedVisit?.petName || recommendedVisit?.pet?.name || 'Pet'} loading="lazy" decoding="async" />
                        ) : (
                          <PawPrint size={28} />
                        )}
                      </div>
                      <div className="upcoming-appointment-petname">{recommendedVisit?.petName || recommendedVisit?.pet?.name || 'Pet'}</div>
                    </div>
                    <div className="upcoming-appointment-details">
                      <div className="upcoming-appointment-meta">
                        <span className="upcoming-appointment-status">NEXT VISIT RECOMMENDED</span>
                      </div>
                      <h4>{recommendedVisit?.petName || recommendedVisit?.pet?.name || 'Pet'} · {recommendedVisit?.serviceName || 'Service'}</h4>
                      <div className="upcoming-appointment-meta-column">
                        <span className="upcoming-appointment-info-item">
                          Recommended around <strong>{recommendedDateLabel}</strong>
                        </span>
                        <span className="upcoming-appointment-info-item">
                          {recommendedDateRelativeText}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Link to={buildRecommendedBookingLink(recommendedVisit)} className="btn btn-primary">Book Appointment</Link>
                </div>
              ) : (
                <div className="upcoming-appointment-body" style={{ cursor: 'default' }}>
                  <div className="upcoming-appointment-main">
                    <div className="upcoming-appointment-photo-stack">
                      <div className="upcoming-appointment-photo upcoming-appointment-photo-empty">
                        <img
                          src={boardingHeroPets}
                          alt="No upcoming appointments"
                          className="upcoming-appointment-empty-img"
                          onError={e => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = boardingHeroPets;
                          }}
                        />
                      </div>
                    </div>
                    <div className="upcoming-appointment-details">
                      <h4>No Upcoming Appointments</h4>
                      <div className="upcoming-appointment-meta-column">
                        <span className="upcoming-appointment-info-item">
                          Book an appointment and give them the care they deserve.
                        </span>
                      </div>
                    </div>
                  </div>
                  <Link to="/book" className="btn btn-primary">Book Appointment</Link>
                </div>
              )}
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
                      <input type="date" className="input" value={rescheduleDate} onChange={event => { setRescheduleDate(event.target.value); setRescheduleSlot('') }} min={dateKeyLocal()} />
                    </label>
                    {rescheduleDate && rescheduleAvailability.open && (
                      <div className="reschedule-slot-grid">
                        {bookableRescheduleSlots.map(slot => {
                          const disabled = rescheduleBookedSlots.includes(slot)
                          const isPast = isRescheduleToday && !isFutureSlotForDate(rescheduleDate, slot)
                          const isSameAsCurrent = rescheduleTarget?.date === rescheduleDate && rescheduleTarget?.slot === slot
                          return (
                            <button
                              key={slot}
                              type="button"
                              className={`reschedule-slot-btn${isPast ? ' reschedule-slot-btn-past' : ''}${disabled ? ' reschedule-slot-btn-booked' : ' reschedule-slot-btn-available'}${rescheduleSlot === slot ? ' selected' : ''}`}
                              disabled={disabled || isPast}
                              onClick={() => {
                                if (isSameAsCurrent) {
                                  setRescheduleToast('Cannot reschedule to the same slot. Please choose a different slot.')
                                  return
                                }
                                setRescheduleSlot(slot)
                              }}
                            >
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
                    {rescheduleDate && rescheduleAvailability.open && (
                      <p className="helper-text">Choose a different time from your current booking to avoid the same-slot conflict.</p>
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

        {/* Professional Pet Grooming — Unified Master Card (Matches User Mockup 1:1) */}
        <section className="home-boarding-section home-grooming-choice-section" aria-label="Professional Pet Grooming">
          <div className="home-grooming-master-card home-fade-up">
            {/* Header Content with Fade Up */}
            <div className="home-grooming-header home-fade-up">
              {/* Top Bar with PET GROOMING pill only (NEW badge removed as requested) */}
              <div className="home-boarding-top-bar" style={{ marginBottom: '10px' }}>
                <div className="home-boarding-pill">
                  <PawPrint size={13} /> PET GROOMING
                </div>
              </div>

              <h2 className="home-boarding-title">
                Professional <br />
                <span className="gold-accent">Pet Grooming</span>
              </h2>

              <p className="home-boarding-desc">
                Keep your furry friend clean, healthy and happy.
              </p>
            </div>

            <div className="home-grooming-paw-decor" aria-hidden="true">
              <PawPrint size={32} className="home-paw-decor-1" />
              <PawPrint size={22} className="home-paw-decor-2" />
              <PawPrint size={18} className="home-paw-decor-3" />
            </div>

            {/* Single Hero Illustration Banner */}
            <div className="home-choice-banner-wrap home-fade-up stagger-1">
              <img
                src={groomingChoiceImage ? optimizeCloudinary(groomingChoiceImage, 1000) : petGroomingCroppedHero}
                alt="Pet Grooming Home Visit and Salon Centre"
                className="home-choice-banner-img"
                loading="lazy"
                decoding="async"
              />
            </div>

            {/* Two Columns Grid with overlapping icons */}
            <div className={`home-choice-columns home-fade-up stagger-2 ${isGroomingClosed ? 'is-closed' : ''}`}>
              {/* Left Column: Home Visit */}
              {isGroomingClosed ? (
                <div className="home-choice-col home-fade-up stagger-2" style={{ cursor: 'default' }}>
                  <div className="home-choice-icon-wrap">
                    <div className="home-choice-icon-rays">
                      <span className="ray ray-1" />
                      <span className="ray ray-2" />
                      <span className="ray ray-3" />
                    </div>
                    <div className="home-choice-icon-circle">
                      <HomeIcon size={24} />
                    </div>
                  </div>
                  <h3 className="home-choice-col-title">Home Visit</h3>
                  <p className="home-choice-col-sub">We come to your doorstep</p>
                </div>
              ) : (
                <Link to="/book?visit=home" className="home-choice-col home-fade-up stagger-2">
                  <div className="home-choice-icon-wrap">
                    <div className="home-choice-icon-rays">
                      <span className="ray ray-1" />
                      <span className="ray ray-2" />
                      <span className="ray ray-3" />
                    </div>
                    <div className="home-choice-icon-circle">
                      <HomeIcon size={24} />
                    </div>
                  </div>
                  <h3 className="home-choice-col-title">Home Visit</h3>
                  <p className="home-choice-col-sub">We come to your doorstep</p>
                  <span className="home-choice-col-btn">
                    Book Now <ArrowRight size={14} />
                  </span>
                </Link>
              )}

              {/* Center Divider / OR Circle */}
              <div className="home-choice-divider-wrap home-fade-up stagger-2">
                <span className="home-choice-divider-line" />
                <span className="home-choice-center-or">OR</span>
                <span className="home-choice-divider-line" />
              </div>

              {/* Right Column: Visit Centre */}
              {isGroomingClosed ? (
                <div className="home-choice-col home-fade-up stagger-3" style={{ cursor: 'default' }}>
                  <div className="home-choice-icon-wrap">
                    <div className="home-choice-icon-rays">
                      <span className="ray ray-1" />
                      <span className="ray ray-2" />
                      <span className="ray ray-3" />
                    </div>
                    <div className="home-choice-icon-circle">
                      <Store size={24} />
                    </div>
                  </div>
                  <h3 className="home-choice-col-title">Visit Centre</h3>
                  <p className="home-choice-col-sub">Bring your pet to our salon.</p>
                </div>
              ) : (
                <Link to="/book?visit=centre" className="home-choice-col home-fade-up stagger-3">
                  <div className="home-choice-icon-wrap">
                    <div className="home-choice-icon-rays">
                      <span className="ray ray-1" />
                      <span className="ray ray-2" />
                      <span className="ray ray-3" />
                    </div>
                    <div className="home-choice-icon-circle">
                      <Store size={24} />
                    </div>
                  </div>
                  <h3 className="home-choice-col-title">Visit Centre</h3>
                  <p className="home-choice-col-sub">Bring your pet to our salon.</p>
                  <span className="home-choice-col-btn">
                    Book Now <ArrowRight size={14} />
                  </span>
                </Link>
              )}
            </div>

            {/* When Closed: Actions block matching Boarding and Walking 1:1 */}
            {isGroomingClosed && (
              <div
                className="home-boarding-actions home-fade-up stagger-3 is-closed"
                style={{ marginTop: '22px' }}
              >
                <div
                  className="home-boarding-closed-pill"
                  title="Grooming bookings are temporarily closed"
                >
                  <Clock size={15} /> {bookingSettings?.buttonLabel || 'Grooming Bookings Temporarily Closed'}
                </div>

                <Link to="/services" className="home-boarding-btn-secondary">
                  View All Services <ArrowRight size={15} />
                </Link>

                {bookingSettings?.emergencyNotice && (
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)', textAlign: 'center', fontStyle: 'italic', maxWidth: '420px', width: '100%' }}>
                    &ldquo;{bookingSettings.emergencyNotice}&rdquo;
                  </p>
                )}
                {bookingSettings?.reopenDate && (
                  <span style={{ fontSize: '11.5px', color: '#059669', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '3px 12px', borderRadius: '999px', fontWeight: 700 }}>
                    Expected reopening: {bookingSettings.reopenDate}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="home-trust-strip home-fade-up">
          <span><Shield size={24} /> Trained & Verified Groomers</span>
          <span><BadgeCheck size={24} /> Safe, Hygienic & Loving Care</span>
          <span><Award size={24} /> Premium Quality Products</span>
          <span><Heart size={24} /> 100% Happiness Guarantee</span>
        </div>
      </div>
    </section>
  )
}
// Module-level and localStorage persistent caches for Home page sections
let cachedHomeSectionsData = getHomeCache('sections_data', null)
let cachedHomeSectionsTime = 0
const HOME_SECTIONS_TTL = 3 * 60 * 1000

export default function Home() {
  const [stats, setStats] = useState(() => cachedHomeSectionsData?.stats || { totalBookings: 0, totalReviews: 0, avgRating: 5, daysOpen: 7 })
  const [reviews, setReviews] = useState(() => cachedHomeSectionsData?.reviews || [])
  const [serviceDetails, setServiceDetails] = useState(() => cachedHomeSectionsData?.serviceDetails || {})
  const [galleryImages, setGalleryImages] = useState(() => cachedHomeSectionsData?.galleryImages || [])
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [galleryLightbox, setGalleryLightbox] = useState(null)
  const [reviewLightbox, setReviewLightbox] = useState(null)
  const [features, setFeatures] = useState(() => cachedHomeSectionsData?.features || DEFAULT_FEATURES)
  const [packages, setPackages] = useState(() => cachedHomeSectionsData?.packages || [])
  const [adminPhone, setAdminPhone] = useState(() => cachedHomeSectionsData?.adminPhone || '')
  const [contactAddress, setContactAddress] = useState(() => cachedHomeSectionsData?.contactAddress || '')
  const [contactHours, setContactHours] = useState(() => cachedHomeSectionsData?.contactHours || '')
  const [shopName, setShopName] = useState(() => cachedHomeSectionsData?.shopName || 'Paw Paw Pet Grooming')
  const [googleReviewUrl, setGoogleReviewUrl] = useState(() => cachedHomeSectionsData?.googleReviewUrl || '')
  const [homePetImages, setHomePetImages] = useState(() => cachedHomeSectionsData?.homePetImages || { cta: '', follow: '' })
  const [teamMembers, setTeamMembers] = useState(() => cachedHomeSectionsData?.teamMembers || [])
  const [teamSettings, setTeamSettings] = useState(() => cachedHomeSectionsData?.teamSettings || {
    badge: 'Certified & Passionate',
    title: 'Meet Our Pet Care Team',
    description: 'Loving groomers, certified dog walkers, and devoted caretakers who treat every furry guest like family.',
    enabled: true,
  })
  const [footerInfo, setFooterInfo] = useState(() => cachedHomeSectionsData?.footerInfo || { tagline: '', socials: [], phones: [], email: '' })
  const [walkingSettings, setWalkingSettings] = useState(() => cachedWalkingSettings)
  const [boardingSettings, setBoardingSettings] = useState(() => cachedBoardingSettings)
  const [bookingSettings, setBookingSettings] = useState(() => cachedBookingSettings)
  const homeContainerRef = useRef(null)
  const teamSliderRef = useRef(null)
  const [activeTeamIndex, setActiveTeamIndex] = useState(0)

  const handleTeamSlide = (direction) => {
    const list = teamMembers.slice(0, 8)
    if (!list.length) return
    setActiveTeamIndex(prev => {
      let nextIndex
      if (direction === 'left') {
        nextIndex = prev > 0 ? prev - 1 : list.length - 1
      } else {
        nextIndex = prev < list.length - 1 ? prev + 1 : 0
      }
      if (teamSliderRef.current) {
        const cards = teamSliderRef.current.querySelectorAll('.home-team-card')
        if (cards[nextIndex]) {
          cards[nextIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
          })
        }
      }
      return nextIndex
    })
  }

  const handleSelectTeamMember = (index) => {
    setActiveTeamIndex(index)
    if (teamSliderRef.current) {
      const cards = teamSliderRef.current.querySelectorAll('.home-team-card')
      if (cards[index]) {
        cards[index].scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        })
      }
    }
  }

  const handleTeamContainerScroll = () => {
    if (!teamSliderRef.current) return
    const container = teamSliderRef.current
    const cards = container.querySelectorAll('.home-team-card')
    const containerCenter = container.scrollLeft + container.offsetWidth / 2
    let closestIndex = 0
    let minDiff = Infinity

    cards.forEach((card, idx) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2
      const diff = Math.abs(containerCenter - cardCenter)
      if (diff < minDiff) {
        minDiff = diff
        closestIndex = idx
      }
    })

    if (closestIndex !== activeTeamIndex && minDiff < 180) {
      setActiveTeamIndex(closestIndex)
    }
  }

  // Premium Fade-Up on Scroll with IntersectionObserver
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Fallback for older browsers without IntersectionObserver
    if (typeof IntersectionObserver === 'undefined') {
      const container = homeContainerRef.current || document
      container.querySelectorAll('.home-fade-up').forEach(el => el.classList.add('is-visible'))
      return
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            obs.unobserve(entry.target)
          }
        })
      },
      {
        root: null,
        rootMargin: '0px 0px -20px 0px',
        threshold: 0.05,
      }
    )

    const observeNewElements = () => {
      const container = homeContainerRef.current || document
      const elements = container.querySelectorAll('.home-fade-up:not(.is-visible)')
      elements.forEach(el => observer.observe(el))
    }

    observeNewElements()

    // MutationObserver observes dynamically rendered elements (reviews, gallery, services, etc.)
    const mutationObserver = new MutationObserver(() => {
      observeNewElements()
    })

    const container = homeContainerRef.current || document.body
    mutationObserver.observe(container, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      mutationObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    fetchWalkingSettings(db).then(setWalkingSettings).catch(() => {})
    fetchBoardingSettings(db).then(setBoardingSettings).catch(() => {})
    fetchBookingSettings(db).then(setBookingSettings).catch(() => {})
  }, [])

  useEffect(() => {
    async function fetchStats() {
      const [
        reviewsResult,
        galleryResult,
        detailsResult,
        packagesResult,
        featuresResult,
        homeStatsResult,
        businessInfoResult,
        teamResult,
        teamSettingsResult,
      ] = await Promise.allSettled([
        getDocs(collection(db, 'reviews')),
        getDocs(collection(db, 'gallery')),
        getDocs(collection(db, 'serviceDetails')),
        getDocs(collection(db, 'packages')),
        getDoc(doc(db, 'settings', 'whyChooseUs')),
        getDoc(doc(db, 'settings', 'homeStats')),
        fetchBusinessInfo(db),
        getDocs(collection(db, 'teamMembers')),
        getDoc(doc(db, 'settings', 'teamSection')),
      ])

      try {
        const details = {}
        if (detailsResult.status === 'fulfilled') {
          detailsResult.value.docs.forEach(d => {
            const data = d.data()
            details[d.id] = { id: d.id, ...data, iconImageUrl: data.iconImageUrl ? optimizeCloudinary(data.iconImageUrl, 300) : '' }
          })
        }

        const revs = reviewsResult.status === 'fulfilled'
          ? reviewsResult.value.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(item => item.active !== false)
              .map(item => ({
                ...item,
                source: item.source || 'website',
                rating: Number(item.rating || item.stars || 5),
                comment: item.comment || item.review || '',
                customerName: item.customerName || item.userName || item.name || 'Pet Parent',
                profileImage: item.profileImage || item.userPhoto || '',
                reviewImages: Array.isArray(item.reviewImages) ? item.reviewImages : (Array.isArray(item.images) ? item.images : []),
                reviewDate: item.reviewDate || '',
                petName: item.petName || '',
              }))
              .sort((a, b) => {
                const rDiff = (b.rating || 5) - (a.rating || 5)
                if (rDiff !== 0) return rDiff
                const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0)
                const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0)
                return timeB - timeA
              })
          : []

        const publicStats = homeStatsResult.status === 'fulfilled' && homeStatsResult.value.exists()
          ? homeStatsResult.value.data()
          : {}

        let fallbackBookingsCount = publicStats.totalBookings
        let fallbackReviewsCount = publicStats.totalReviews
        if (fallbackBookingsCount === undefined || fallbackReviewsCount === undefined) {
          try {
            const [bCountSnap, rCountSnap] = await Promise.allSettled([
              getCountFromServer(collection(db, 'bookings')),
              getCountFromServer(collection(db, 'reviews')),
            ])
            if (bCountSnap.status === 'fulfilled') fallbackBookingsCount = bCountSnap.value.data().count
            if (rCountSnap.status === 'fulfilled') fallbackReviewsCount = rCountSnap.value.data().count
          } catch { }
        }

        const revAvg = revs.length
          ? (revs.reduce((s, r) => s + (r.rating || 5), 0) / revs.length).toFixed(1)
          : 5.0

        const scheduleDaysOpen = businessInfoResult.status === 'fulfilled'
          ? countOpenDays(businessInfoResult.value.bookingSettings)
          : null

        const calculatedStats = {
          totalBookings: Number(publicStats.totalBookings ?? fallbackBookingsCount ?? 0),
          totalReviews: Number(publicStats.totalReviews ?? fallbackReviewsCount ?? revs.length),
          avgRating: Number(publicStats.avgRating ?? revAvg),
          daysOpen: scheduleDaysOpen ?? Number(publicStats.daysOpen ?? 7),
        }

        setStats(calculatedStats)
        setReviews(revs)
        setServiceDetails(details)

        if (teamSettingsResult?.status === 'fulfilled' && teamSettingsResult.value.exists()) {
          setTeamSettings(prev => ({ ...prev, ...teamSettingsResult.value.data() }))
        }

        const allTeam = teamResult?.status === 'fulfilled'
          ? teamResult.value.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(m => m.active !== false)
          : []

        // If admin has explicitly chosen members to show on home screen, prioritize only those
        const homeFeatured = allTeam.filter(m => m.showOnHome === true)
        let candidates = homeFeatured.length > 0
          ? homeFeatured
          : allTeam.filter(m => m.showOnWeb !== false)

        // Sort by admin order (1, 2, 3...)
        candidates.sort((a, b) => {
          const orderA = typeof a.order === 'number' ? a.order : (typeof a.homeOrder === 'number' ? a.homeOrder : 999)
          const orderB = typeof b.order === 'number' ? b.order : (typeof b.homeOrder === 'number' ? b.homeOrder : 999)
          return orderA - orderB
        })

        if (!candidates.length && cachedHomeSectionsData?.teamMembers?.length && teamResult?.status !== 'fulfilled') {
          candidates = cachedHomeSectionsData.teamMembers
        }

        setTeamMembers(candidates)

        let loadedPackages = []
        if (packagesResult.status === 'fulfilled') {
          loadedPackages = packagesResult.value.docs.map(d => ({ id: d.id, ...d.data() })).filter(pkg => pkg.active !== false)
          setPackages(loadedPackages)
        }

        let sortedGallery = []
        if (galleryResult.status === 'fulfilled') {
          const galleryItems = galleryResult.value.docs.map(d => {
            const data = d.data()
            const type = data.type || (data.duration ? 'video' : 'image')
            const rawUrl = data.mediaUrl || data.url || ''
            return {
              id: d.id,
              ...data,
              type,
              url: type === 'video' ? rawUrl : optimizeCloudinary(rawUrl, 900),
              rawUrl
            }
          }).filter(image => image.url && image.active !== false && image.type !== 'video' && !image.url.match(/\.(mp4|webm|mov|m4v|avi)(\?.*)?$/i))

          const sorted = galleryItems.sort((a, b) => {
            const aPos = Number(a.position ?? -1)
            const bPos = Number(b.position ?? -1)
            if (bPos !== aPos) return bPos - aPos
            const aCreated = a.createdAt?.toMillis ? a.createdAt.toMillis() : a.createdAt ? a.createdAt.seconds * 1000 : 0
            const bCreated = b.createdAt?.toMillis ? b.createdAt.toMillis() : b.createdAt ? b.createdAt.seconds * 1000 : 0
            return bCreated - aCreated
          })

          sortedGallery = sorted
          setGalleryImages(sortedGallery)
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

        let loadedPhone = ''
        let loadedAddress = ''
        let loadedHours = ''
        let loadedShop = 'Paw Paw Pet Grooming'
        let loadedReviewUrl = ''
        let loadedPetImages = { cta: '', follow: '' }
        let loadedFooter = { tagline: '', socials: [], phones: [], email: '' }

        if (businessInfoResult.status === 'fulfilled') {
          const info = businessInfoResult.value
          loadedPhone = info.whatsappNumber || ''
          loadedAddress = info.contact?.address || ''
          loadedHours = info.hoursText || ''
          loadedShop = info.contact?.shopName || 'Paw Paw Pet Grooming'
          loadedReviewUrl = info.contact?.googleReviewUrl || ''
          loadedPetImages = {
            cta: info.contact?.ctaPetImageUrl ? optimizeCloudinary(info.contact.ctaPetImageUrl, 400) : '',
            follow: info.contact?.followPetImageUrl ? optimizeCloudinary(info.contact.followPetImageUrl, 400) : '',
          }
          loadedFooter = info.footer || { tagline: '', socials: [], phones: [], email: '' }

          setAdminPhone(loadedPhone)
          setContactAddress(loadedAddress)
          setContactHours(loadedHours)
          setShopName(loadedShop)
          setGoogleReviewUrl(loadedReviewUrl)
          setHomePetImages(loadedPetImages)
          setFooterInfo(loadedFooter)
        }

        // Snapshot to persistent localStorage cache for instant future loads
        const homeSectionsSnapshot = {
          stats: calculatedStats,
          reviews: revs,
          serviceDetails: details,
          packages: loadedPackages,
          galleryImages: sortedGallery,
          features: cleanFeatures,
          teamMembers: candidates,
          teamSettings: teamSettingsResult?.status === 'fulfilled' && teamSettingsResult.value.exists()
            ? { ...teamSettings, ...teamSettingsResult.value.data() }
            : teamSettings,
          adminPhone: loadedPhone,
          contactAddress: loadedAddress,
          contactHours: loadedHours,
          shopName: loadedShop,
          googleReviewUrl: loadedReviewUrl,
          homePetImages: loadedPetImages,
          footerInfo: loadedFooter,
        }
        cachedHomeSectionsData = homeSectionsSnapshot
        setHomeCache('sections_data', homeSectionsSnapshot)
      } catch { }
    }
    fetchStats()
  }, [])

  const [galleryPaused, setGalleryPaused] = useState(false)
  const [galleryTouchX, setGalleryTouchX] = useState(null)

  useEffect(() => {
    if (galleryImages.length <= 1 || galleryPaused) return
    const t = setInterval(() => {
      setGalleryIndex(i => (i + 1) % galleryImages.length)
    }, 4500)
    return () => clearInterval(t)
  }, [galleryImages.length, galleryPaused])

  const handleGalleryTouchStart = (e) => {
    setGalleryTouchX(e.touches[0]?.clientX ?? null)
  }

  const handleGalleryTouchEnd = (e) => {
    if (galleryTouchX === null) return
    const delta = (e.changedTouches[0]?.clientX ?? galleryTouchX) - galleryTouchX
    if (delta > 40) {
      setGalleryIndex(i => (i - 1 + galleryImages.length) % galleryImages.length)
    } else if (delta < -40) {
      setGalleryIndex(i => (i + 1) % galleryImages.length)
    }
    setGalleryTouchX(null)
  }

  const getCoverflowCardStyle = (offset, isCenter, isVisible) => {
    if (!isVisible) {
      return {
        opacity: 0,
        pointerEvents: 'none',
        transform: `translate3d(${offset > 0 ? 250 : -250}%, -50%, 0) scale(0.4)`,
        zIndex: 1,
      }
    }

    const absOffset = Math.abs(offset)
    const direction = offset > 0 ? 1 : -1

    let xPercent = 0
    let scale = 1
    let opacity = 1
    let zIndex = 12 - absOffset * 2
    let brightness = 1

    if (absOffset === 0) {
      xPercent = 0
      scale = 1
      opacity = 1
      brightness = 1
    } else if (absOffset === 1) {
      xPercent = direction * 62
      scale = 0.85
      opacity = 0.85
      brightness = 0.85
    } else if (absOffset === 2) {
      xPercent = direction * 115
      scale = 0.70
      opacity = 0.55
      brightness = 0.65
    } else if (absOffset === 3) {
      xPercent = direction * 162
      scale = 0.55
      opacity = 0.28
      brightness = 0.50
    }

    return {
      transform: `translate3d(calc(-50% + ${xPercent}%), -50%, 0) scale(${scale})`,
      zIndex,
      opacity,
      filter: `brightness(${brightness})`,
    }
  }

  const homeServices = buildServiceCatalog(serviceDetails)

  const proofStats = useMemo(() => {
    const rawBookings = Number(stats?.totalBookings) || 0
    const bookingsStr = rawBookings > 100 ? `${rawBookings.toLocaleString('en-IN')}+` : '1,500+'

    const rawRating = Number(stats?.avgRating) || 4.9
    const ratingStr = `${rawRating.toFixed(1)}★`

    const rawReviews = Number(stats?.totalReviews) || (Array.isArray(reviews) ? reviews.length : 0)
    const reviewsStr = rawReviews > 50 ? `${rawReviews}+` : '150+'

    return [
      {
        stat: bookingsStr,
        title: 'Happy Pets Pampered',
        desc: 'Dogs and cats of all breeds & sizes treated with gentle care',
        icon: '🐾',
        colorTheme: 'paw',
      },
      {
        stat: ratingStr,
        title: 'Pet Parent Rating',
        desc: `Top-rated salon with ${reviewsStr} verified 5-star customer reviews`,
        icon: '⭐',
        colorTheme: 'star',
      },
      {
        stat: '100%',
        title: 'Cage-Free & Gentle',
        desc: 'Fear-free handling with 1-on-1 loving personal attention',
        icon: '💖',
        colorTheme: 'heart',
      },
      {
        stat: '100%',
        title: 'Organic & Pet-Safe',
        desc: 'Hypoallergenic, tearless & vet-approved natural products',
        icon: '🛡️',
        colorTheme: 'shield',
      },
    ]
  }, [stats?.totalBookings, stats?.avgRating, stats?.totalReviews, reviews])

  const allMarqueeReviews = useMemo(() => {
    if (!Array.isArray(reviews) || reviews.length === 0) return []
    // Use exclusively real reviews from the database, prioritizing top ratings (top 20 to 30)
    const sorted = [...reviews].sort((a, b) => (Number(b.rating) || 5) - (Number(a.rating) || 5))
    const topReviews = sorted.filter(r => (Number(r.rating) || 5) >= 4)
    const list = topReviews.length > 0 ? topReviews : sorted
    return list.slice(0, 30)
  }, [reviews])

  const { row1List, row2List } = useMemo(() => {
    if (!allMarqueeReviews.length) return { row1List: [], row2List: [] }
    const r1 = []
    const r2 = []
    allMarqueeReviews.forEach((item, idx) => {
      if (idx % 2 === 0) r1.push(item)
      else r2.push(item)
    })
    if (r2.length === 0) r2.push(...r1)

    // Duplicate real reviews so each row has 12 to 15 cards (24 to 30 cards total)
    const fillRow = (arr) => {
      if (!arr.length) return []
      let res = [...arr]
      while (res.length < 12) {
        res = [...res, ...arr]
      }
      res = res.slice(0, 15)
      return [...res, ...res]
    }

    return {
      row1List: fillRow(r1),
      row2List: fillRow(r2)
    }
  }, [allMarqueeReviews])

  const renderReviewPill = (r, key) => {
    const avatarUrl = r.profileImage || r.userPhoto
    const name = r.customerName || r.userName || 'Pet Parent'
    const initial = name.slice(0, 1).toUpperCase()
    const comment = cleanReviewText(r.comment || r.review || '')
    const rating = Math.min(5, Math.max(1, Math.round(Number(r.rating || 5))))
    const isGoogle = r.source === 'google'

    return (
      <Link key={key} to="/reviews" className="review-pill-card" title="Click to view reviews">
        <div className="review-pill-avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} loading="lazy" decoding="async" />
          ) : (
            <span className="review-pill-initial">{initial}</span>
          )}
        </div>
        <div className="review-pill-body">
          <div className="review-pill-top">
            <span className="review-pill-name">{name}</span>
            <span className="review-pill-badge" title={isGoogle ? 'Google Review' : 'Verified Customer'} aria-label={isGoogle ? 'Google Review' : 'Verified Customer'}>
              {isGoogle ? (
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2h-9.4v3.8h5.4c-.2 1.3-.9 2.4-2 3.1v2.6h3.2c1.9-1.8 3-4.5 3-7.5Z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.6c-.9.6-2.1.9-3.4.9-2.6 0-4.8-1.8-5.6-4.2H3.1v2.6C4.8 19.8 8.2 22 12 22Z" />
                  <path fill="#FBBC05" d="M6.4 13.7c-.2-.6-.3-1.2-.3-1.8s.1-1.3.3-1.8V7.5H3.1C2.4 8.8 2 10.3 2 12s.4 3.2 1.1 4.5l3.3-2.8Z" />
                  <path fill="#EA4335" d="M12 6.2c1.5 0 2.8.5 3.9 1.5l2.9-2.9C16.9 3.1 14.5 2 12 2 8.2 2 4.8 4.2 3.1 7.5l3.3 2.6c.8-2.4 3-4.2 5.6-4.2Z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="#1e293b" />
                  <path d="m8.5 12.5 2.5 2.5 5-5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <div className="review-pill-stars" aria-label={`${rating} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={13}
                  fill={n <= rating ? '#f59e0b' : 'none'}
                  color={n <= rating ? '#f59e0b' : '#cbd5e1'}
                />
              ))}
            </div>
          </div>
          <p className="review-pill-text">
            {comment}
          </p>
        </div>
      </Link>
    )
  }

  const homeWalkingDurations = useMemo(() => {
    if (Array.isArray(walkingSettings?.durations) && walkingSettings.durations.length > 0) {
      return walkingSettings.durations
    }
    return [
      { duration: 30, price: walkingSettings?.rate30Min || 199 },
      { duration: 45, price: walkingSettings?.rate45Min || 279 },
      { duration: 60, price: walkingSettings?.rate60Min || 349 },
    ]
  }, [walkingSettings])
  const homeMinWalkingPrice = useMemo(() => Math.min(...homeWalkingDurations.map(d => Number(d.price) || 0).filter(p => p > 0)) || 199, [homeWalkingDurations])
  const homeWalkingDurationSummary = useMemo(() => {
    if (homeWalkingDurations.length > 2) {
      return `${homeWalkingDurations.slice(0, 2).map(d => d.duration).join(' / ')}... Mins`
    }
    return `${homeWalkingDurations.map(d => d.duration).join(' / ')} Mins`
  }, [homeWalkingDurations])
  const homeMinBoardingPrice = useMemo(() => {
    const list = [boardingSettings?.catDailyRate, boardingSettings?.dogDailyRate, boardingSettings?.otherDailyRate].map(Number).filter(r => r > 0)
    return list.length ? Math.min(...list) : 600
  }, [boardingSettings])

  const shownServices = [
    {
      id: 'pet-walking',
      name: 'Pet Walking',
      description: 'Daily walks, exercise and happy tails for your dog in Dhayari.',
      price: `From Rs. ${homeMinWalkingPrice}`,
      duration: homeWalkingDurationSummary,
      icon: <Footprints size={30} />,
      iconImageUrl: walkingSettings?.bannerImageUrl || petWalkingHero,
      to: '/book-walking',
    },
    {
      id: 'pet-boarding',
      name: 'Pet Boarding',
      description: 'Safe, cozy overnight stay and daycare with 24/7 loving care.',
      price: `From Rs. ${homeMinBoardingPrice} / day`,
      duration: 'Pet Hostelling',
      icon: <Hotel size={30} />,
      iconImageUrl: boardingSettings?.bannerImageUrl || boardingHeroPets,
      to: '/boarding',
    },
    ...homeServices.slice(0, 3),
    ...packages.slice(0, Math.max(0, 3 - homeServices.slice(0, 3).length)).map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description || 'Complete grooming for a clean, fresh and happy pet.',
      price: pkg.priceRange || (pkg.price ? `Rs. ${pkg.price}` : 'Price TBD'),
      duration: pkg.duration || 'Package',
      icon: <Package size={30} />,
      to: `/book?package=${pkg.id}`,
    })),
  ]

  const socialIcon = (platform) => {
    if (platform === 'instagram') return <Instagram size={18} />
    if (platform === 'facebook') return <Facebook size={18} />
    if (platform === 'youtube') return <Youtube size={18} />
    if (platform === 'twitter') return <Twitter size={18} />
    if (platform === 'linkedin') return <Linkedin size={18} />
    return <MessageCircle size={18} />
  }
  return (
    <div ref={homeContainerRef} style={{ background: 'var(--bg)' }}>
      {/* Hero slider */}
      <HeroSlider />

      {/* Services preview */}
      <section className="home-services-mobile-section">
        <div className="home-section-card home-services-panel">
          <div className="home-section-head split home-fade-up">
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
                className="home-service-row home-fade-up"
                style={{ '--fade-delay': `${Math.min(i * 120, 600)}ms`, '--service-color': s.color || 'var(--accent)' }}
              >
                <span className="home-service-visual">
                  {s.iconImageUrl && <img src={s.iconImageUrl} alt="" loading="lazy" decoding="async" />}
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
          <div className="home-gallery-head home-fade-up">
            <p className="section-label">Our Work</p>
            <div className="home-gallery-title-row">
              <h2>Gallery</h2>
              <Link to="/gallery" className="home-pill-link">View All <ArrowRight size={17} /></Link>
            </div>
            <p className="home-gallery-sub">Recent grooming moments from the salon.</p>
          </div>

          <div
            className="home-coverflow-wrapper home-fade-up stagger-1"
            onTouchStart={handleGalleryTouchStart}
            onTouchEnd={handleGalleryTouchEnd}
            onMouseEnter={() => setGalleryPaused(true)}
            onMouseLeave={() => setGalleryPaused(false)}
          >
            <div className="home-coverflow-stage">
              {galleryImages.map((image, index) => {
                const total = galleryImages.length
                let offset = index - galleryIndex
                if (offset > total / 2) offset -= total
                if (offset < -total / 2) offset += total

                const isCenter = offset === 0
                const isVisible = Math.abs(offset) <= 3

                return (
                  <div
                    key={image.id || index}
                    className={`home-coverflow-card ${isCenter ? 'active' : ''}`}
                    style={getCoverflowCardStyle(offset, isCenter, isVisible)}
                    onClick={() => {
                      if (isCenter) {
                        setGalleryLightbox(image)
                      } else {
                        setGalleryIndex(index)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={isCenter ? 'Active gallery photo' : 'Gallery photo'}
                  >
                    <img
                      src={image.url}
                      alt={image.caption || 'Paw Paw Gallery'}
                      loading={Math.abs(offset) <= 1 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                    {isCenter && image.caption && (
                      <div className="home-coverflow-caption">
                        <span>{image.caption}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Circular navigation arrows centered below matching user screenshot */}
            <div className="home-coverflow-nav">
              <button
                type="button"
                className="home-coverflow-nav-btn"
                onClick={() => setGalleryIndex(i => (i - 1 + galleryImages.length) % galleryImages.length)}
                aria-label="Previous photo"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                className="home-coverflow-nav-btn"
                onClick={() => setGalleryIndex(i => (i + 1) % galleryImages.length)}
                aria-label="Next photo"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Reviews section */}
      {allMarqueeReviews.length > 0 && (
        <section className="home-reviews-section">
          <div className="home-section-head centered decorated home-fade-up">
            <p className="section-label">Real Reviews</p>
            <h2>Our Customers Love Us <PawPrint size={24} /></h2>
          </div>

          <div className="reviews-marquee-container home-fade-up stagger-1">
            {/* Row 1 - scrolling left */}
            <div className="reviews-marquee-row">
              <div className="reviews-marquee-track reviews-marquee-left">
                {row1List.map((r, index) => renderReviewPill(r, `r1-${index}`))}
              </div>
            </div>

            {/* Row 2 - scrolling right */}
            <div className="reviews-marquee-row">
              <div className="reviews-marquee-track reviews-marquee-right">
                {row2List.map((r, index) => renderReviewPill(r, `r2-${index}`))}
              </div>
            </div>
          </div>

          <div className="home-review-actions home-fade-up stagger-2">
            <Link to="/reviews" className="btn btn-secondary">See All Reviews <ArrowRight size={16} /></Link>
            {googleReviewUrl && (
              <a href={googleReviewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                Rate Us on Google <ExternalLink size={15} />
              </a>
            )}
          </div>
        </section>
      )}

      {/* Meet Our Team Section */}
      {teamMembers.length > 0 && teamSettings.enabled !== false && (
        <section className="home-team-section">
          <div className="home-team-head home-fade-up">
            <p className="section-label"><PawPrint size={13} /> {teamSettings.badge || 'Certified & Passionate'} <PawPrint size={13} /></p>
            <h2 className="home-team-title">{teamSettings.title || 'Meet Our Pet Care Team'}</h2>
            <p className="home-team-sub">
              {teamSettings.description || 'Loving groomers, certified dog walkers, and devoted caretakers who treat every furry guest like family.'}
            </p>
          </div>

          <div className="home-team-slider-wrapper home-fade-up">
            <div className="home-team-grid" ref={teamSliderRef} onScroll={handleTeamContainerScroll}>
              {teamMembers.slice(0, 8).map((member, i) => {
                const roleLower = (member.role || '').toLowerCase()
                const isWalker = roleLower.includes('walk')
                const isGroomer = roleLower.includes('groom')
                const isBoarding = roleLower.includes('board') || roleLower.includes('care')
                const badgeClass = isWalker ? 'badge-walker' : isGroomer ? 'badge-groomer' : isBoarding ? 'badge-boarding' : 'badge-specialist'
                const isActive = activeTeamIndex === i

                return (
                  <div
                    key={member.id || i}
                    className={`home-team-card ${isActive ? 'is-active' : ''}`}
                    style={{ '--fade-delay': `${i * 80}ms` }}
                    onClick={() => handleSelectTeamMember(i)}
                  >
                    {/* Role Badge with pulsing dot */}
                    <div className={`home-team-pill ${badgeClass}`}>
                      <span className="home-team-dot" />
                      {isWalker ? <Footprints size={12} /> : isGroomer ? <Scissors size={12} /> : <PawPrint size={12} />}
                      <span>{member.role || 'Pet Specialist'}</span>
                    </div>

                    {/* Avatar with Double Ring Frame & Verified Badge */}
                    <div className="home-team-avatar-frame">
                      <div className="home-team-avatar-inner">
                        {member.photoUrl ? (
                          <img src={member.photoUrl} alt={member.name} className="home-team-avatar-img" loading="lazy" />
                        ) : (
                          <div className="home-team-avatar-fallback">
                            <Users size={32} />
                          </div>
                        )}
                      </div>
                      <span className="home-team-verified-badge" title="Certified Pet Expert">
                        <BadgeCheck size={16} />
                      </span>
                    </div>

                    <h3 className="home-team-name">{member.name}</h3>

                    <div className="home-team-stats-pill">
                      <span className="home-team-star"><Star size={11} fill="currentColor" /> 5.0</span>
                      <span className="home-team-sep">•</span>
                      <span className="home-team-exp-text">
                        <Sparkles size={11} /> {member.experience || '3+ Yrs Exp'}
                      </span>
                    </div>

                    <p className="home-team-bio">
                      {member.bio ? `"${member.bio}"` : 'Dedicated to treating every pet with patient kindness, safety, and loving care.'}
                    </p>

                    <Link
                      to={isWalker ? '/walking' : isBoarding ? '/boarding' : '/book'}
                      className="home-team-card-btn"
                    >
                      <span>{isWalker ? 'Book Walk' : isBoarding ? 'Book Stay' : 'Book Grooming'}</span>
                      <ArrowRight size={13} className="team-btn-arrow" />
                    </Link>
                  </div>
                )
              })}
            </div>

            {/* Slider Navigation Arrows & Interactive Animated Dots */}
            <div className="home-team-nav-row">
              <button
                type="button"
                className="home-team-nav-btn"
                onClick={() => handleTeamSlide('left')}
                aria-label="Previous team member"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="home-team-dots" role="tablist" aria-label="Team member pagination">
                {teamMembers.slice(0, 8).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`home-team-dot-pill ${activeTeamIndex === idx ? 'active' : ''}`}
                    onClick={() => handleSelectTeamMember(idx)}
                    aria-label={`View team member ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                type="button"
                className="home-team-nav-btn"
                onClick={() => handleTeamSlide('right')}
                aria-label="Next team member"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="home-team-actions home-fade-up stagger-1">
            <Link to="/team" className="btn btn-secondary">
              Meet All Team Members <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      )}

      {/* Social Proof & Trusted by Pet Parents Section */}
      <section className="home-why-section home-proof-section">
        <div className="home-why-head home-fade-up">
          <p className="section-label"><PawPrint size={14} /> Proven Track Record <PawPrint size={14} /></p>
          <h2>Trusted by Pet Parents</h2>
          <p className="home-why-sub">Real care, real results, and hundreds of happy wagging tails every month.</p>
        </div>
        <div className="home-proof-grid">
          {proofStats.map((item, idx) => (
            <div key={idx} className={`home-proof-card proof-${item.colorTheme} home-fade-up`} style={{ '--fade-delay': `${idx * 80}ms` }}>
              <div className="home-proof-card-top">
                <span className={`home-proof-icon icon-${item.colorTheme}`} aria-hidden="true">{item.icon}</span>
                <span className="home-proof-stat">{item.stat}</span>
              </div>
              <h3 className="home-proof-title">{item.title}</h3>
              <p className="home-proof-desc">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Call CTA Section */}
      <section className="home-help-cta">
        <div className="home-help-card home-fade-up">
          <div className="home-help-image">
            {homePetImages.cta ? <img src={homePetImages.cta} alt="Happy pet" loading="lazy" decoding="async" /> : <PawPrint size={72} />}
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
        <div className="home-location-info home-fade-up">
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
            {(!bookingSettings || bookingSettings?.acceptBookings !== false) ? (
              <Link to="/book" className="btn btn-primary"><Calendar size={16} /> Book Now</Link>
            ) : (
              <span className="btn btn-secondary disabled" style={{ cursor: 'not-allowed', opacity: 0.85, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={15} /> Bookings Closed
              </span>
            )}
            <a href={contactAddress ? `https://maps.google.com/?q=${encodeURIComponent(contactAddress)}` : '#'} target="_blank" rel="noopener noreferrer" className="btn btn-secondary"><Navigation size={16} /> Get Directions</a>
          </div>
        </div>
        <div className="home-map-card home-fade-up stagger-1">
          <iframe
            title="Location"
            src={contactAddress ? `https://www.google.com/maps?q=${encodeURIComponent(contactAddress)}&output=embed` : 'about:blank'}
            allowFullScreen loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>

      <section className="home-follow-card home-fade-up">
        <div className="home-follow-brand">
          <div className="home-follow-logo"><BrandLogo size="admin" showText={false} /></div>
          <div>
            <h2>{shopName}</h2>
            <p>{footerInfo.tagline || 'Trusted pet grooming and spa salon with love, care and professional expertise.'}</p>
          </div>
        </div>
        <div className="home-follow-pet">
          {homePetImages.follow ? <img src={homePetImages.follow} alt="Paw Paw pet" loading="lazy" decoding="async" /> : <PawPrint size={80} />}
        </div>
        <div className="home-follow-actions">
          <h3>Follow Us</h3>
          <div>
            {footerInfo.socials?.slice(0, 3).map((social, i) => (
              <a key={i} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.platform}>{socialIcon(social.platform)}</a>
            ))}

          </div>
          {(!bookingSettings || bookingSettings?.acceptBookings !== false) ? (
            <Link to="/book" className="btn btn-primary"><Calendar size={16} /> Book Appointment</Link>
          ) : (
            <span className="btn btn-secondary disabled" style={{ cursor: 'not-allowed', opacity: 0.85, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={15} /> Bookings Closed
            </span>
          )}
        </div>
      </section>
      {/* WhatsApp float button */}
      <a href={`https://wa.me/${adminPhone}?text=${encodeURIComponent(`Hi ${shopName}, I'm interested in booking a service for my pet. Could you help me with more details?`)}`} target="_blank" rel="noopener noreferrer" className="whatsapp-btn" title="Chat on WhatsApp" aria-label="Chat on WhatsApp"><MessageCircle size={24} /></a>

      {galleryLightbox && (
        <div onClick={() => setGalleryLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', cursor: 'pointer' }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '100%', cursor: 'default' }}>
            <button onClick={() => setGalleryLightbox(null)} aria-label="Close gallery image" style={{ marginLeft: 'auto', marginBottom: '12px', width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={18} />
            </button>
            {galleryLightbox.type === 'video' ? (
              <video
                src={galleryLightbox.url}
                controls
                autoPlay
                playsInline
                style={{ width: '100%', borderRadius: '8px', maxHeight: '80vh', objectFit: 'contain', background: '#000' }}
              />
            ) : (
              <img src={galleryLightbox.rawUrl || galleryLightbox.url} alt={galleryLightbox.caption || ''} style={{ width: '100%', borderRadius: '8px', maxHeight: '80vh', objectFit: 'contain' }} />
            )}
            {galleryLightbox.caption && <p style={{ color: '#fff', textAlign: 'center', marginTop: '14px', fontSize: '15px' }}>{galleryLightbox.caption}</p>}
          </div>
        </div>
      )}

      {reviewLightbox && (
        <div onClick={() => setReviewLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', cursor: 'pointer' }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '100%', cursor: 'default' }}>
            <button onClick={() => setReviewLightbox(null)} aria-label="Close review image" style={{ marginLeft: 'auto', marginBottom: '12px', width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={18} />
            </button>
            <img src={reviewLightbox.url} alt={reviewLightbox.alt || 'Review image'} style={{ width: '100%', borderRadius: '8px', maxHeight: '80vh', objectFit: 'contain' }} />
          </div>
        </div>
      )}
    </div>
  )
}



























