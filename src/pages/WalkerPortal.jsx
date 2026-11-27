// src/pages/WalkerPortal.jsx
import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  getDocs,
  getDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore'
import { ADMIN_EMAIL, db } from '../firebase'
import {
  Footprints,
  Play,
  Square,
  Phone,
  MessageCircle,
  MapPin,
  Calendar,
  Clock,
  Navigation,
  CheckCircle,
  AlertTriangle,
  UserCheck,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Info,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Bell,
  X,
  ListOrdered,
  Camera,
  Droplets,
  Bone,
  Share2,
  Car,
  Gauge,
  Zap,
  Flame,
  Star,
  AlertOctagon,
  PhoneCall,
  ShieldAlert,
} from 'lucide-react'
import LiveWalkTrackerMap from '../components/LiveWalkTrackerMap'
import Toast from '../components/Toast'
import { uploadToCloudinary } from '../utils/cloudinary'
import { validateImageFile } from '../utils/imageCompression'
import {
  calculateDistanceMeters,
  calculateTotalRouteDistance,
  formatDistance,
  formatDurationMMSS,
  formatDurationHuman,
  calculatePace,
  calculateSpeed,
  calculateCalories,
  getGpsQuality,
} from '../utils/geoUtils'
import { WALKING_STATUS, WALKING_STATUS_LABELS } from '../utils/walkingSettings'
import {
  normalizePhone,
  verifyPassword,
  generateUniqueToken,
  getSavedWalkerSession,
  saveWalkerSession,
  clearWalkerSession,
} from '../utils/walkerAuth'

const SOS_REASON_OPTIONS = [
  '🐕 Pet Medical / Sickness / Injury',
  '🏃 Pet Slipped Leash / Escaped',
  '⚡ Dog Fight / Aggressive Animal',
  '🚶 Walker Medical Emergency',
  '⚠️ Traffic / Safety Incident',
  '🚨 Other Immediate Emergency',
]

// Gentle Web Audio chime for assignment notification
function playAssignmentChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.14) // A5
    gain.gain.setValueAtTime(0.35, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
  } catch {}
}

export default function WalkerPortal() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Primary navigation tabs: 'live' (Active Walk + Recent 5) | 'all_walks' (Dedicated All Assigned Walks)
  const [mainPortalTab, setMainPortalTab] = useState('live')

  // Session & Auth state
  const [session, setSession] = useState(() => getSavedWalkerSession())
  const [currentWalker, setCurrentWalker] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [deviceLoggedOutModal, setDeviceLoggedOutModal] = useState(false)

  // Login Form State
  const [loginPhone, setLoginPhone] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Walks data
  const [walks, setWalks] = useState([])
  const [loadingWalks, setLoadingWalks] = useState(true)
  const [activeTab, setActiveTab] = useState('active') // 'active' | 'upcoming' | 'completed' in All Walks

  // Live GPS Walk State
  const [activeWalkId, setActiveWalkId] = useState('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [currentGps, setCurrentGps] = useState(null)
  const [gpsAccuracy, setGpsAccuracy] = useState(null)
  const [gpsError, setGpsError] = useState('')
  const [routeTrail, setRouteTrail] = useState([])
  const [totalDistanceMeters, setTotalDistanceMeters] = useState(0)
  const [actionLoading, setActionLoading] = useState(false)
  const [completingConfirm, setCompletingConfirm] = useState(false)
  const [completionSuccess, setCompletionSuccess] = useState(null)

  // Walk Activity Log & Report Card State
  const [activities, setActivities] = useState({ pee: 0, poo: 0, water: false, treats: 0 })
  const [walkPhotos, setWalkPhotos] = useState([])
  const [walkerNotes, setWalkerNotes] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Walker SOS / Emergency State
  const [showSosModal, setShowSosModal] = useState(false)
  const [sosReason, setSosReason] = useState('🐕 Pet Medical / Sickness / Injury')
  const [sosNote, setSosNote] = useState('')
  const [broadcastingSos, setBroadcastingSos] = useState(false)

  // In-app Toast popup state
  const [portalToast, setPortalToast] = useState(null)
  const [expandedCardReports, setExpandedCardReports] = useState({})

  useEffect(() => {
    if (!portalToast) return
    const t = window.setTimeout(() => setPortalToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [portalToast])

  // Notifications State
  const [newAssignmentAlert, setNewAssignmentAlert] = useState(null)
  const initialNotifCheckDoneRef = useRef(false)

  const watchIdRef = useRef(null)
  const wakeLockRef = useRef(null)
  const elapsedSecondsRef = useRef(0)
  const lastTrailPointRef = useRef(null)
  const timerIntervalRef = useRef(null)

  // 1. Initial Session Load and Validation
  useEffect(() => {
    async function verifyInitialSession() {
      const saved = getSavedWalkerSession()
      if (!saved?.walkerId || !saved?.sessionId) {
        setSession(null)
        setLoadingAuth(false)
        return
      }

      try {
        const snap = await getDoc(doc(db, 'teamMembers', saved.walkerId))
        if (!snap.exists()) {
          clearWalkerSession()
          setSession(null)
          setLoadingAuth(false)
          return
        }

        const data = snap.data()
        // Single device check: does remote session match local?
        if (data.activeSessionId && data.activeSessionId !== saved.sessionId) {
          clearWalkerSession()
          setSession(null)
          setDeviceLoggedOutModal(true)
          setLoadingAuth(false)
          return
        }

        setCurrentWalker({ id: snap.id, ...data })
        setSession(saved)
      } catch (err) {
        console.warn('Session verification error:', err)
      } finally {
        setLoadingAuth(false)
      }
    }

    verifyInitialSession()
  }, [])

  // 2. Real-time Single Device Enforcer: Listen to walker doc for concurrent logins
  useEffect(() => {
    if (!session?.walkerId || !session?.sessionId) return

    const unsub = onSnapshot(doc(db, 'teamMembers', session.walkerId), (snap) => {
      if (!snap.exists()) {
        clearWalkerSession()
        setSession(null)
        return
      }

      const data = snap.data()
      if (data.activeSessionId && data.activeSessionId !== session.sessionId) {
        // Logged in from another device!
        clearWalkerSession()
        setSession(null)
        setCurrentWalker(null)
        setDeviceLoggedOutModal(true)

        // Stop active GPS if any
        if (watchIdRef.current !== null && navigator.geolocation) {
          navigator.geolocation.clearWatch(watchIdRef.current)
          watchIdRef.current = null
        }
        if (wakeLockRef.current) {
          wakeLockRef.current.release().catch(() => {})
          wakeLockRef.current = null
        }
      } else {
        setCurrentWalker(prev => ({ ...prev, ...data }))
      }
    })

    return () => unsub()
  }, [session?.walkerId, session?.sessionId])

  // 3. Real-time Walks Subscription for current walker
  useEffect(() => {
    if (!session?.walkerId) {
      setWalks([])
      setLoadingWalks(false)
      return
    }

    setLoadingWalks(true)
    const q1 = query(
      collection(db, 'walkingBookings'),
      where('assignedTeamMemberId', '==', session.walkerId)
    )

    const unsub = onSnapshot(
      q1,
      (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        list.sort((a, b) => {
          if (a.status === WALKING_STATUS.IN_PROGRESS) return -1
          if (b.status === WALKING_STATUS.IN_PROGRESS) return 1
          const dateA = a.date || a.walkingDate || ''
          const dateB = b.date || b.walkingDate || ''
          return dateB.localeCompare(dateA)
        })
        setWalks(list)
        setLoadingWalks(false)

        // Detect if any walk is currently IN_PROGRESS
        const inProgress = list.find(w => w.status === WALKING_STATUS.IN_PROGRESS)
        if (inProgress && (!activeWalkId || activeWalkId === inProgress.id)) {
          setActiveWalkId(inProgress.id)
          if (Array.isArray(inProgress.routeTrail)) {
            setRouteTrail(inProgress.routeTrail)
            setTotalDistanceMeters(inProgress.walkDistanceMeters || calculateTotalRouteDistance(inProgress.routeTrail))
          }
          if (inProgress.liveLocation) {
            setCurrentGps(inProgress.liveLocation)
          }
        }
      },
      (err) => {
        console.warn('Walks snapshot error:', err)
        setLoadingWalks(false)
      }
    )

    return () => unsub()
  }, [session?.walkerId, activeWalkId])

  // 4. Real-time Assignment Notifications Listener
  useEffect(() => {
    if (!session?.walkerId) return

    const q = query(
      collection(db, 'walkerNotifications'),
      where('walkerId', '==', session.walkerId),
      where('read', '==', false)
    )

    const unsub = onSnapshot(q, (snapshot) => {
      if (!initialNotifCheckDoneRef.current) {
        initialNotifCheckDoneRef.current = true
        return
      }

      const newDocs = snapshot.docChanges().filter(c => c.type === 'added')
      if (newDocs.length > 0) {
        const first = newDocs[0].doc.data()
        setNewAssignmentAlert({ id: newDocs[0].doc.id, ...first })
        playAssignmentChime()
      }
    })

    return () => unsub()
  }, [session?.walkerId])

  // Active walk object if one is in progress
  const activeWalk = useMemo(() => {
    return walks.find(w => w.id === activeWalkId) || null
  }, [walks, activeWalkId])

  // Keep alive Wake Lock to avoid phone screen turning off during walks
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch (err) {
      console.warn('Wake Lock error:', err)
    }
  }

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release()
        wakeLockRef.current = null
      }
    } catch {}
  }

  // Timer for active walk
  useEffect(() => {
    if (!activeWalk || activeWalk.status !== WALKING_STATUS.IN_PROGRESS) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      return
    }

    const startMs = activeWalk.walkStartedAt?.toMillis
      ? activeWalk.walkStartedAt.toMillis()
      : activeWalk.walkStartedAt?.seconds
      ? activeWalk.walkStartedAt.seconds * 1000
      : Date.now()

    const updateTimer = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
      elapsedSecondsRef.current = elapsed
      setElapsedSeconds(elapsed)
    }

    updateTimer()
    timerIntervalRef.current = setInterval(updateTimer, 1000)

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [activeWalk?.id, activeWalk?.status, activeWalk?.walkStartedAt])

  // Sync walk activities & notes from activeWalk
  useEffect(() => {
    if (activeWalk?.id) {
      if (activeWalk.walkActivities) {
        setActivities({
          pee: Number(activeWalk.walkActivities.pee || 0),
          poo: Number(activeWalk.walkActivities.poo || 0),
          water: Boolean(activeWalk.walkActivities.water),
          treats: Number(activeWalk.walkActivities.treats || 0),
        })
      } else {
        setActivities({ pee: 0, poo: 0, water: false, treats: 0 })
      }
      if (Array.isArray(activeWalk.walkPhotos)) {
        setWalkPhotos(activeWalk.walkPhotos)
      } else {
        setWalkPhotos([])
      }
      if (typeof activeWalk.walkerNotes === 'string') {
        setWalkerNotes(activeWalk.walkerNotes)
      } else {
        setWalkerNotes('')
      }
    }
  }, [activeWalk?.id])

  // Log one-tap activity during walk
  const handleLogActivity = async (type) => {
    if (!activeWalk?.id) return
    const next = { ...activities }
    if (type === 'pee') next.pee = (next.pee || 0) + 1
    if (type === 'poo') next.poo = (next.poo || 0) + 1
    if (type === 'water') next.water = !next.water
    if (type === 'treats') next.treats = (next.treats || 0) + 1

    setActivities(next)
    try {
      await updateDoc(doc(db, 'walkingBookings', activeWalk.id), {
        walkActivities: next,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.warn('Failed to save activity:', err)
    }
  }

  // Upload photo taken during walk
  const handleAddWalkPhoto = async (file) => {
    if (!file || !activeWalk?.id) return
    try {
      validateImageFile(file)
    } catch (err) {
      setPortalToast({ message: err.message, type: 'error' })
      return
    }
    setUploadingPhoto(true)
    try {
      const url = await uploadToCloudinary(file)
      const nextPhotos = [...walkPhotos, url]
      setWalkPhotos(nextPhotos)
      await updateDoc(doc(db, 'walkingBookings', activeWalk.id), {
        walkPhotos: arrayUnion(url),
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      setPortalToast({ message: err.message || 'Photo upload failed. Please try again.', type: 'error' })
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleRemoveWalkPhoto = async (index) => {
    if (!activeWalk?.id) return
    const nextPhotos = walkPhotos.filter((_, i) => i !== index)
    setWalkPhotos(nextPhotos)
    try {
      await updateDoc(doc(db, 'walkingBookings', activeWalk.id), {
        walkPhotos: nextPhotos,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.warn('Failed to remove photo:', err)
    }
  }

  // Generate WhatsApp message with report card details
  const generateWhatsAppReportMessage = (success) => {
    if (!success) return ''
    const { dogName, breed, durationSec, distanceM, report } = success
    let msg = `🐾 *Paw Paw Pet Walking - Walk Report Card* 🐾\n`
    msg += `------------------------------------\n`
    msg += `🐶 *Pet:* ${dogName}${breed ? ` (${breed})` : ''}\n`
    if (report?.walkerName) {
      msg += `🚶 *Walker:* ${report.walkerName}\n`
    }
    msg += `⏱️ *Duration:* ${formatDurationHuman(durationSec)}\n`
    msg += `📍 *Distance Walked:* ${formatDistance(distanceM)}\n`
    const pace = calculatePace(distanceM, durationSec).formatted
    const calories = calculateCalories(distanceM, durationSec)
    msg += `⚡ *Avg Pace:* ${pace}\n`
    msg += `🔥 *Estimated Burn:* ~${calories} kcal\n`
    msg += `💧 *Pee Breaks:* ${report?.peeCount || 0}\n`
    msg += `💩 *Poop Breaks:* ${report?.pooCount || 0}\n`
    msg += `🥤 *Hydrated:* ${report?.waterGiven ? 'Yes 💧' : 'No'}\n`
    msg += `🦴 *Treats:* ${report?.treatCount || 0}\n`
    if (report?.notes) {
      msg += `📝 *Walker Note:* "${report.notes}"\n`
    }
    if (report?.photos?.length) {
      msg += `📸 *Photos (${report.photos.length}):*\n`
      report.photos.forEach((url, i) => {
        msg += `Photo ${i + 1}: ${url}\n`
      })
    }
    msg += `------------------------------------\n`
    msg += `Thank you for choosing Paw Paw Pet Care! ❤️🐕\n`
    msg += `Tracked with real-time GPS & care monitoring.`
    return encodeURIComponent(msg)
  }

  // GPS Watcher for Active Walk
  useEffect(() => {
    if (!activeWalk || activeWalk.status !== WALKING_STATUS.IN_PROGRESS) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      releaseWakeLock()
      return
    }

    requestWakeLock()

    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.')
      return
    }

    let lastServerPushTime = 0

    const handlePosSuccess = async (pos) => {
      const { latitude: lat, longitude: lng, accuracy, heading, speed } = pos.coords
      setGpsAccuracy(Math.round(accuracy || 0))
      setGpsError('')

      const point = { lat, lng, t: Date.now() }
      setCurrentGps({ lat, lng, heading, speed, accuracy })

      const last = lastTrailPointRef.current
      const distFromLast = last ? calculateDistanceMeters(last.lat, last.lng, lat, lng) : 999
      const now = Date.now()
      const timeSinceLastPush = now - lastServerPushTime

      // GPS Drift / Jump Filtering: Reject wild jumps (> 45m accuracy or impossible speed)
      if (last && accuracy && accuracy > 45) {
        return
      }
      if (last && distFromLast > 70 && (now - (last.t || 0)) < 5000) {
        return
      }

      if (distFromLast >= 6 || timeSinceLastPush > 20000 || !last) {
        lastTrailPointRef.current = point
        lastServerPushTime = now

        setRouteTrail(prev => {
          const updated = [...prev, point]
          const newDistance = calculateTotalRouteDistance(updated)
          setTotalDistanceMeters(newDistance)

          const secs = elapsedSecondsRef.current || 1
          const currentPaceObj = calculatePace(newDistance, secs)
          const currentSpeedObj = calculateSpeed(newDistance, secs, speed)
          const estCalories = calculateCalories(newDistance, secs)

          updateDoc(doc(db, 'walkingBookings', activeWalk.id), {
            liveLocation: {
              lat,
              lng,
              heading: heading || null,
              speed: speed || null,
              accuracy: accuracy || null,
              updatedAt: serverTimestamp(),
            },
            routeTrail: arrayUnion(point),
            walkDistanceMeters: newDistance,
            walkPace: currentPaceObj.formatted,
            walkSpeedKmh: currentSpeedObj.speedKmH,
            estimatedCalories: estCalories,
          }).catch(err => console.warn('Could not stream GPS update:', err))

          return updated
        })
      }
    }

    const handlePosError = (err) => {
      console.warn('Geolocation watch error:', err)
      if (err.code === 1) {
        setGpsError('Location permission denied. Please allow GPS access in your browser settings to track this walk.')
      } else {
        setGpsError('Searching for GPS signal...')
      }
    }

    const options = {
      enableHighAccuracy: true,
      maximumAge: 4000,
      timeout: 15000,
    }

    watchIdRef.current = navigator.geolocation.watchPosition(handlePosSuccess, handlePosError, options)

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      releaseWakeLock()
    }
  }, [activeWalk?.id, activeWalk?.status])

  // LOGIN HANDLER
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    const cleanNumber = normalizePhone(loginPhone)
    if (!cleanNumber || cleanNumber.length < 10) {
      setLoginError('Please enter a valid 10-digit mobile number.')
      return
    }
    if (!loginPassword.trim()) {
      setLoginError('Please enter your password or PIN.')
      return
    }

    setLoginLoading(true)
    try {
      const snap = await getDocs(collection(db, 'teamMembers'))
      const allMembers = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      const matched = allMembers.find(m => {
        const mPhone = normalizePhone(m.phone)
        return mPhone === cleanNumber
      })

      if (!matched) {
        setLoginError('No walker account found for this mobile number. Please check the number or contact Paw Paw Admin.')
        setLoginLoading(false)
        return
      }

      if (matched.active === false) {
        setLoginError('This account is currently inactive. Please contact Paw Paw Admin.')
        setLoginLoading(false)
        return
      }

      if (!matched.isActivated || !matched.passwordHash) {
        setLoginError('Your account has not been activated yet. Please click the setup link sent to your WhatsApp by Admin to create your password.')
        setLoginLoading(false)
        return
      }

      const isCorrect = await verifyPassword(loginPassword.trim(), matched.passwordHash, matched.salt)
      if (!isCorrect) {
        setLoginError('Incorrect password or PIN. Please try again or ask Admin to reset it.')
        setLoginLoading(false)
        return
      }

      const newSessionId = generateUniqueToken()
      try {
        await updateDoc(doc(db, 'teamMembers', matched.id), {
          activeSessionId: newSessionId,
          lastLoginAt: serverTimestamp(),
          lastActiveDevice: typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 80) : 'Mobile',
          updatedAt: serverTimestamp(),
        })
      } catch (sessionErr) {
        console.warn('Could not record activeSessionId on teamMembers (non-admin device):', sessionErr)
      }

      const newSession = {
        walkerId: matched.id,
        sessionId: newSessionId,
        name: matched.name,
        phone: matched.phone,
      }

      saveWalkerSession(newSession)
      setSession(newSession)
      setCurrentWalker(matched)
      setDeviceLoggedOutModal(false)
    } catch (err) {
      setLoginError(`Login failed: ${err.message}`)
    } finally {
      setLoginLoading(false)
    }
  }

  // LOGOUT HANDLER
  const handleLogout = async () => {
    if (activeWalk) {
      const confirmLog = window.confirm('You have a walk currently in progress. Logging out will pause your tracking. Are you sure you want to log out?')
      if (!confirmLog) return
    } else {
      const confirmLog = window.confirm('Are you sure you want to log out of the Walker Portal?')
      if (!confirmLog) return
    }

    if (session?.walkerId) {
      try {
        await updateDoc(doc(db, 'teamMembers', session.walkerId), {
          activeSessionId: null,
          updatedAt: serverTimestamp(),
        })
      } catch {}
    }

    clearWalkerSession()
    setSession(null)
    setCurrentWalker(null)
  }

  // UPDATE ARRIVAL STATUS (On My Way / Arrived at Doorstep)
  const handleUpdateArrivalStatus = async (booking, newStatus) => {
    if (!booking?.id) return
    setActionLoading(true)
    try {
      const isArrived = newStatus === 'arrived'
      const patch = {
        walkerArrivalStatus: newStatus,
        updatedAt: serverTimestamp(),
      }
      if (newStatus === 'on_the_way') {
        patch.walkerOnTheWayAt = serverTimestamp()
      } else if (newStatus === 'arrived') {
        patch.walkerArrivedAt = serverTimestamp()
      }

      await updateDoc(doc(db, 'walkingBookings', booking.id), patch)

      // Notify Pet Parent
      if (booking.userId) {
        addDoc(collection(db, 'notifications'), {
          userId: booking.userId,
          title: isArrived
            ? `🔔 Your Walker has arrived at your doorstep!`
            : `🚗 Your Walker is on the way!`,
          message: isArrived
            ? `${currentWalker?.name || 'Your walker'} has reached your doorstep for ${booking.dogName || booking.petName || 'your dog'}'s walk! Please hand over when ready.`
            : `${currentWalker?.name || 'Your walker'} is heading towards your location for ${booking.dogName || booking.petName || 'your dog'}'s walk.`,
          actionUrl: '/my-bookings?tab=walking',
          type: isArrived ? 'walker_arrived' : 'walker_on_the_way',
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {})
      }
    } catch (err) {
      setPortalToast({ message: `Could not update arrival status: ${err.message}`, type: 'error' })
    } finally {
      setActionLoading(false)
    }
  }

  // START WALK
  const handleStartWalk = async (booking) => {
    if (!booking) return
    setActionLoading(true)
    setGpsError('')

    try {
      if (!navigator.geolocation) {
        setPortalToast({ message: 'Your device does not support GPS geolocation.', type: 'error' })
        setActionLoading(false)
        return
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng, accuracy } = pos.coords
          const initialPoint = { lat, lng, t: Date.now() }

          const patch = {
            status: WALKING_STATUS.IN_PROGRESS,
            walkStartedAt: serverTimestamp(),
            liveLocation: {
              lat,
              lng,
              accuracy: accuracy || null,
              updatedAt: serverTimestamp(),
            },
            routeTrail: [initialPoint],
            walkDistanceMeters: 0,
            assignedWalkerStartedAt: serverTimestamp(),
            walkActivities: { pee: 0, poo: 0, water: false, treats: 0 },
            walkPhotos: [],
            walkerNotes: '',
          }

          await updateDoc(doc(db, 'walkingBookings', booking.id), patch)

          if (booking.userId) {
            addDoc(collection(db, 'notifications'), {
              userId: booking.userId,
              title: `🐾 ${booking.dogName || booking.petName || 'Your pet'}'s walk started!`,
              message: `${currentWalker?.name || 'Your walker'} has started the walking session with real-time GPS tracking.`,
              actionUrl: '/my-bookings?tab=walking',
              type: 'walking_started',
              read: false,
              createdAt: serverTimestamp(),
            }).catch(() => {})
          }

          setActiveWalkId(booking.id)
          setRouteTrail([initialPoint])
          setCurrentGps({ lat, lng, accuracy })
          setTotalDistanceMeters(0)
          setElapsedSeconds(0)
          setActivities({ pee: 0, poo: 0, water: false, treats: 0 })
          setWalkPhotos([])
          setWalkerNotes('')
          lastTrailPointRef.current = initialPoint
          setActionLoading(false)
          setMainPortalTab('live') // Switch to live view immediately
        },
        async (err) => {
          console.warn('Initial GPS permission error:', err)
          if (err.code === 1) {
            setPortalToast({ message: 'Location access is required to track the dog walk live for pet parents. Please allow location permissions in your browser settings.', type: 'error' })
          } else {
            const patch = {
              status: WALKING_STATUS.IN_PROGRESS,
              walkStartedAt: serverTimestamp(),
              routeTrail: [],
              walkDistanceMeters: 0,
              walkActivities: { pee: 0, poo: 0, water: false, treats: 0 },
              walkPhotos: [],
              walkerNotes: '',
            }
            await updateDoc(doc(db, 'walkingBookings', booking.id), patch)
            setActiveWalkId(booking.id)
            setRouteTrail([])
            setTotalDistanceMeters(0)
            setElapsedSeconds(0)
            setActivities({ pee: 0, poo: 0, water: false, treats: 0 })
            setWalkPhotos([])
            setWalkerNotes('')
            setMainPortalTab('live')
          }
          setActionLoading(false)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    } catch (err) {
      setPortalToast({ message: `Could not start walk: ${err.message}`, type: 'error' })
      setActionLoading(false)
    }
  }

  // COMPLETE WALK
  const handleCompleteWalk = async () => {
    if (!activeWalk) return
    setActionLoading(true)

    try {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      releaseWakeLock()

      const finalDuration = elapsedSeconds
      const finalDistance = totalDistanceMeters
      const finalPace = calculatePace(finalDistance, finalDuration).formatted
      const finalCalories = calculateCalories(finalDistance, finalDuration)

      const isMultiDay = Boolean(activeWalk.planType && activeWalk.planType !== 'single')
      const totalExpected = Number(activeWalk.totalWalks || (activeWalk.planType === 'monthly' ? (activeWalk.frequency === 'twice_daily' ? 52 : 26) : (activeWalk.frequency === 'twice_daily' ? 14 : 7)))
      const currentCompleted = Math.max(Number(activeWalk.completedWalks || 0), (Array.isArray(activeWalk.walkReports) ? activeWalk.walkReports.length : (activeWalk.walkReport || activeWalk.walkCompletedAt ? 1 : 0)))
      const newCompleted = currentCompleted + 1
      const isFullyFinished = !isMultiDay || (newCompleted >= totalExpected)

      const completedIso = new Date().toISOString()
      const now = new Date()
      const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const currentHour = now.getHours()
      const sessionPeriod = activeWalk.frequency === 'twice_daily'
        ? (currentHour < 14 ? 'Morning' : 'Evening')
        : (currentHour < 12 ? 'Morning' : currentHour < 17 ? 'Afternoon' : 'Evening')
      const sessionTimeFormatted = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      const sessionSlot = activeWalk.frequency === 'twice_daily'
        ? (currentHour < 14 ? (activeWalk.morningSlot || activeWalk.slot || 'Morning') : (activeWalk.eveningSlot || 'Evening'))
        : (activeWalk.slot || activeWalk.walkingSlot || sessionTimeFormatted)

      const walkReport = {
        id: `rep_${Date.now()}`,
        walkIndex: newCompleted,
        totalWalks: totalExpected,
        date: todayDateStr, // Actual completion date
        completedAt: completedIso,
        sessionPeriod,
        walkTime: sessionTimeFormatted,
        slot: sessionSlot,
        durationSeconds: finalDuration,
        distanceMeters: finalDistance,
        pace: finalPace,
        calories: finalCalories,
        peeCount: Number(activities.pee || 0),
        pooCount: Number(activities.poo || 0),
        waterGiven: Boolean(activities.water),
        treatCount: Number(activities.treats || 0),
        photos: walkPhotos || [],
        notes: String(walkerNotes || '').trim(),
        walkerName: currentWalker?.name || 'Walker',
        walkerPhone: currentWalker?.phone || '',
        walkerRating: null,
        walkerFeedback: '',
      }

      const existingReports = Array.isArray(activeWalk.walkReports)
        ? activeWalk.walkReports
        : (activeWalk.walkReport ? [activeWalk.walkReport] : [])
      const updatedReports = [...existingReports, walkReport]

      const patch = {
        status: isFullyFinished ? WALKING_STATUS.COMPLETED : WALKING_STATUS.CONFIRMED,
        completedWalks: newCompleted,
        walkCompletedAt: serverTimestamp(),
        lastWalkCompletedAt: serverTimestamp(),
        walkerArrivalStatus: 'idle',
        routeTrail: [],
        liveLocation: null,
        walkDurationSeconds: finalDuration,
        walkDistanceMeters: finalDistance,
        walkPace: finalPace,
        estimatedCalories: finalCalories,
        walkActivities: activities,
        walkPhotos: walkPhotos,
        walkerNotes: String(walkerNotes || '').trim(),
        walkReport,
        walkReports: updatedReports,
        updatedAt: serverTimestamp(),
      }

      await updateDoc(doc(db, 'walkingBookings', activeWalk.id), patch)

      if (activeWalk.userId) {
        const notifTitle = isMultiDay
          ? `🎉 Walk #${newCompleted} of ${totalExpected} completed for ${activeWalk.dogName || activeWalk.petName || 'your pet'}!`
          : `🎉 ${activeWalk.dogName || activeWalk.petName || 'Your pet'}'s walk is completed!`
        addDoc(collection(db, 'notifications'), {
          userId: activeWalk.userId,
          title: notifTitle,
          message: `Walk #${newCompleted} finished! Time: ${formatDurationHuman(finalDuration)}, Distance: ${formatDistance(finalDistance)}. Tap to view Walk Report Card & Rate your walker!`,
          actionUrl: '/my-bookings?tab=walking',
          type: 'walking_completed',
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {})
      }

      setCompletionSuccess({
        dogName: activeWalk.dogName || activeWalk.petName || 'Dog',
        breed: activeWalk.breed || activeWalk.dogBreed || '',
        petPhotoUrl: activeWalk.petPhotoUrl || '',
        durationSec: finalDuration,
        distanceM: finalDistance,
        ownerPhone: activeWalk.phone || activeWalk.customerPhone || '',
        ownerName: activeWalk.ownerName || activeWalk.customerName || '',
        report: walkReport,
      })

      setActiveWalkId('')
      setCompletingConfirm(false)
      setElapsedSeconds(0)
      setRouteTrail([])
      setTotalDistanceMeters(0)
      setActivities({ pee: 0, poo: 0, water: false, treats: 0 })
      setWalkPhotos([])
      setWalkerNotes('')
    } catch (err) {
      setPortalToast({ message: `Could not complete walk: ${err.message}`, type: 'error' })
    } finally {
      setActionLoading(false)
    }
  }

  // Dismiss new assignment alert banner
  const handleDismissAlert = async () => {
    if (newAssignmentAlert?.id) {
      try {
        await updateDoc(doc(db, 'walkerNotifications', newAssignmentAlert.id), { read: true })
      } catch {}
    }
    setNewAssignmentAlert(null)
  }

  // BROADCAST SOS ALERT
  const handleBroadcastSos = async () => {
    if (!activeWalk) return
    setBroadcastingSos(true)
    try {
      const emergencyData = {
        hasEmergency: true,
        emergencyReason: sosReason,
        emergencyNote: String(sosNote || '').trim(),
        emergencyTriggeredAt: serverTimestamp(),
        emergencyStatus: 'active',
        emergencyWalkerLocation: currentGps ? {
          lat: currentGps.lat,
          lng: currentGps.lng,
          accuracy: currentGps.accuracy || null,
        } : null,
        updatedAt: serverTimestamp(),
      }

      await updateDoc(doc(db, 'walkingBookings', activeWalk.id), emergencyData)

      // Notify Pet Parent with High Priority
      if (activeWalk.userId) {
        addDoc(collection(db, 'notifications'), {
          userId: activeWalk.userId,
          title: `🚨 EMERGENCY ALERT: ${activeWalk.dogName || activeWalk.petName || 'Dog'}'s Walk`,
          message: `Walker ${currentWalker?.name || 'Walker'} reported an emergency: "${sosReason}" ${sosNote ? `(${sosNote})` : ''}. Please call walker immediately!`,
          actionUrl: '/my-bookings?tab=walking',
          type: 'walker_sos_alert',
          priority: 'high',
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {})
      }

      // Notify Admin
      addDoc(collection(db, 'notifications'), {
        userEmail: ADMIN_EMAIL || '',
        toAdmin: true,
        title: `🚨 SOS EMERGENCY: Walk #${activeWalk.id.slice(0, 8).toUpperCase()}`,
        message: `Walker ${currentWalker?.name || 'Walker'} triggered SOS for ${activeWalk.dogName || 'Dog'}: "${sosReason}". Walker phone: ${currentWalker?.phone || '-'}, Owner: ${activeWalk.phone || '-'}`,
        actionUrl: '/admin/walking',
        type: 'walking_sos_admin',
        priority: 'high',
        read: false,
        createdAt: serverTimestamp(),
      }).catch(() => {})

      setPortalToast({
        message: '🚨 Emergency broadcast sent! Pet parent and admin have been notified.',
        type: 'success',
      })
    } catch (err) {
      setPortalToast({
        message: `Could not broadcast SOS: ${err.message}`,
        type: 'error',
      })
    } finally {
      setBroadcastingSos(false)
    }
  }

  // RESOLVE SOS EMERGENCY
  const handleResolveSos = async () => {
    if (!activeWalk) return
    setBroadcastingSos(true)
    try {
      await updateDoc(doc(db, 'walkingBookings', activeWalk.id), {
        hasEmergency: false,
        emergencyStatus: 'resolved',
        emergencyResolvedAt: serverTimestamp(),
        emergencyResolvedBy: currentWalker?.name || 'Walker',
        updatedAt: serverTimestamp(),
      })

      if (activeWalk.userId) {
        addDoc(collection(db, 'notifications'), {
          userId: activeWalk.userId,
          title: `✅ Emergency Resolved: ${activeWalk.dogName || 'Dog'}'s Walk`,
          message: `Walker ${currentWalker?.name || 'Walker'} marked the previous safety alert as resolved. The walk is continuing safely.`,
          actionUrl: '/my-bookings?tab=walking',
          type: 'walker_sos_resolved',
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {})
      }

      setShowSosModal(false)
      setPortalToast({
        message: '✅ Emergency marked as resolved.',
        type: 'success',
      })
    } catch (err) {
      setPortalToast({
        message: `Could not resolve SOS: ${err.message}`,
        type: 'error',
      })
    } finally {
      setBroadcastingSos(false)
    }
  }

  // Group walks by category
  const categorizedWalks = useMemo(() => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const active = []
    const upcoming = []
    const completed = []
    const skipped = []

    walks.forEach(w => {
      const isSkippedToday = Array.isArray(w.skippedDates) && (
        w.skippedDates.includes(todayStr) ||
        (w.date && w.skippedDates.includes(w.date)) ||
        (w.walkingDate && w.skippedDates.includes(w.walkingDate))
      )

      const isMulti = Boolean(w.planType && w.planType !== 'single')
      const totalExpected = Number(w.totalWalks || (w.planType === 'monthly' ? (w.frequency === 'twice_daily' ? 52 : 26) : (w.frequency === 'twice_daily' ? 14 : 7)))
      const completedCount = Math.max(Number(w.completedWalks || 0), (Array.isArray(w.walkReports) ? w.walkReports.length : (w.walkReport || w.walkCompletedAt ? 1 : 0)))
      const isFullyFinished = !isMulti ? w.status === WALKING_STATUS.COMPLETED : (completedCount >= totalExpected)

      if (isFullyFinished) {
        completed.push(w)
      } else if (isSkippedToday && w.status !== WALKING_STATUS.IN_PROGRESS) {
        // Automatically exclude from daily active route
        skipped.push(w)
      } else if (w.status === WALKING_STATUS.IN_PROGRESS) {
        // Walk actively streaming right now
        active.unshift(w)
      } else {
        const startDate = w.date || w.walkingDate || ''
        const endDate = w.estimatedEndDate || startDate

        if (isMulti) {
          // Multi-day pass:
          if (startDate > todayStr) {
            // Future pass not yet started
            upcoming.push(w)
          } else if (endDate >= todayStr || !endDate) {
            // Active pass running today!
            active.push(w)
          } else {
            // Expired pass
            completed.push(w)
          }
        } else {
          // Single walk:
          if (startDate === todayStr || !startDate) {
            // Scheduled for TODAY
            active.push(w)
          } else if (startDate > todayStr) {
            // Scheduled for FUTURE
            upcoming.push(w)
          } else {
            // Scheduled for PAST date (yesterday or older)
            completed.push(w)
          }
        }
      }
    })

    return { active, upcoming, completed, skipped }
  }, [walks])

  // Today's active walks for the active screen (strictly today only, no past/future)
  const recentWalks = useMemo(() => {
    return categorizedWalks.active
  }, [categorizedWalks])

  // Reusable Walk Card Renderer
  const renderWalkCard = (w) => {
    const isThisActive = w.status === WALKING_STATUS.IN_PROGRESS
    const isMulti = Boolean(w.planType && w.planType !== 'single')
    const totalExpected = Number(w.totalWalks || (w.planType === 'monthly' ? (w.frequency === 'twice_daily' ? 52 : 26) : (w.frequency === 'twice_daily' ? 14 : 7)))
    const completedCount = Math.max(Number(w.completedWalks || 0), (Array.isArray(w.walkReports) ? w.walkReports.length : (w.walkReport || w.walkCompletedAt ? 1 : 0)))
    const isFullyFinished = !isMulti ? w.status === WALKING_STATUS.COMPLETED : (completedCount >= totalExpected)
    const isCompleted = isFullyFinished
    const mapLink = w.mapPinUrl || (w.lat && w.lng ? `https://www.google.com/maps?q=${w.lat},${w.lng}` : '')
    const todayStr = new Date().toISOString().split('T')[0]
    const isSkippedToday = Array.isArray(w.skippedDates) && (
      w.skippedDates.includes(todayStr) ||
      w.skippedDates.includes(w.date || w.walkingDate)
    )
    const allReports = Array.isArray(w.walkReports) && w.walkReports.length > 0
      ? w.walkReports
      : (w.walkReport ? [w.walkReport] : [])
    const areReportsExpanded = Boolean(expandedCardReports[w.id])

    return (
      <div
        key={w.id}
        style={{
          background: 'var(--card, #fff)',
          borderRadius: '18px',
          padding: '16px',
          border: `1.5px solid ${isThisActive ? 'var(--accent, #C08820)' : 'var(--border, #F0EAE1)'}`,
          boxShadow: isThisActive ? '0 8px 24px rgba(192, 136, 32, 0.15)' : '0 4px 12px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: 'var(--accent-bg, #FFF9ED)', border: '1px solid var(--accent-border, #F2D99E)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
              {w.petPhotoUrl || w.photoUrl ? (
                <img src={w.petPhotoUrl || w.photoUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '14px', objectFit: 'cover' }} />
              ) : (
                <span>🐶</span>
              )}
            </div>
            <div>
              <strong style={{ fontSize: '15px', color: 'var(--text, #221711)', display: 'block' }}>
                {w.dogName || w.petName || 'Dog'}
              </strong>
              <span style={{ fontSize: '12px', color: 'var(--muted, #7E7067)' }}>
                {w.breed || w.petBreed || 'Dog'} · {w.duration || 30} Mins
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <span className={`badge ${isSkippedToday ? 'badge-cancelled' : isThisActive ? 'badge-confirmed' : isCompleted ? 'badge-completed' : (isMulti && completedCount > 0 ? 'badge-confirmed' : 'badge-pending')}`} style={{ fontSize: '11px' }}>
              {isSkippedToday ? '⏸️ Skipped Today' : isThisActive ? '🟢 In Progress' : isCompleted ? 'Completed' : (isMulti && completedCount > 0 ? `Active Pass (${completedCount}/${totalExpected} Done)` : (WALKING_STATUS_LABELS[w.status] || 'Scheduled'))}
            </span>
            {w.planType && w.planType !== 'single' && (
              <span className="badge" style={{ background: '#FFF9ED', color: '#B45309', border: '1px solid #FCD34D', fontSize: '10px', fontWeight: 800 }}>
                {w.planType === 'monthly' ? '🌟 Monthly Pass' : '📦 7-Day Pass'} ({completedCount}/{totalExpected})
              </span>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--surface, #F7F2E7)', borderRadius: '12px', padding: '10px 12px', marginBottom: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text, #221711)', flexWrap: 'wrap' }}>
            <Calendar size={13} color="var(--accent, #C08820)" />
            <strong>{w.date || w.walkingDate || 'Today'}</strong>
            <span style={{ color: 'var(--muted, #7E7067)' }}>·</span>
            <Clock size={13} color="var(--accent, #C08820)" />
            {w.frequency === 'twice_daily' || (w.morningSlot && w.eveningSlot) ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: '#b45309', fontWeight: 800 }}>🌅 Morning: {w.morningSlot || w.slot || 'Morning'}</span>
                <span style={{ color: '#4338ca', fontWeight: 800 }}>🌆 Evening: {w.eveningSlot || 'Evening'}</span>
              </span>
            ) : (
              <strong>{w.slot || w.walkingSlot || '-'}</strong>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', color: 'var(--text, #221711)', lineHeight: 1.4 }}>
            <MapPin size={13} color="var(--accent, #C08820)" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <strong>{w.area || 'Dhayari'}:</strong> {w.pickupAddress || w.address || 'Address provided on call'}
              {w.landmark && (
                <span style={{ color: 'var(--muted, #7E7067)', display: 'block', fontSize: '11px' }}>
                  Landmark: {w.landmark}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Contact & Navigation Row */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {w.phone && (
            <a
              href={`tel:${w.phone}`}
              className="btn btn-secondary"
              style={{ flex: 1, minWidth: '90px', padding: '7px 10px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', textDecoration: 'none' }}
            >
              <Phone size={12} /> Call Owner
            </a>
          )}
          {mapLink && (
            <a
              href={mapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ flex: 1, minWidth: '110px', padding: '7px 10px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', textDecoration: 'none' }}
            >
              <Navigation size={12} /> Navigate ↗
            </a>
          )}
        </div>

        {/* Behavior notes */}
        {w.behaviorNotes && (
          <div style={{ fontSize: '11.5px', color: '#b45309', background: '#fef3c7', padding: '6px 10px', borderRadius: '8px', marginBottom: '12px' }}>
            <strong>⚠️ Note:</strong> {w.behaviorNotes}
          </div>
        )}

        {/* 📋 Past Walk Reports (Expandable) */}
        {allReports.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <button
              type="button"
              onClick={() => setExpandedCardReports(prev => ({ ...prev, [w.id]: !prev[w.id] }))}
              style={{
                width: '100%',
                background: areReportsExpanded ? 'rgba(192, 136, 32, 0.1)' : 'var(--surface, #F7F2E7)',
                border: '1px solid var(--border, #F0EAE1)',
                borderRadius: '10px',
                padding: '7px 12px',
                fontSize: '11.5px',
                fontWeight: 700,
                color: 'var(--accent, #C08820)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
            >
              <span>📋 Past Walk Reports ({allReports.length}{isMulti ? ` / ${totalExpected}` : ''})</span>
              <span>{areReportsExpanded ? '▲ Hide' : '▼ View'}</span>
            </button>

            {areReportsExpanded && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {allReports.map((rep, idx) => (
                  <div
                    key={rep.id || idx}
                    style={{
                      background: '#fff',
                      border: '1px solid #E5E7EB',
                      borderRadius: '10px',
                      padding: '10px',
                      fontSize: '11.5px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ color: 'var(--text, #221711)' }}>
                        Walk #{rep.walkIndex || (idx + 1)}{isMulti ? ` of ${totalExpected}` : ''}
                      </strong>
                      <span style={{ color: 'var(--muted, #7E7067)', fontSize: '10.5px' }}>
                        {(() => {
                          const dateObj = rep.completedAt ? new Date(rep.completedAt) : (rep.date ? new Date(rep.date) : null)
                          const dateStr = dateObj && !isNaN(dateObj.getTime())
                            ? dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                            : (rep.date || '')
                          const timeStr = dateObj && !isNaN(dateObj.getTime())
                            ? dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                            : (rep.walkTime || '')
                          const period = rep.sessionPeriod ? ` (${rep.sessionPeriod})` : ''
                          return `${dateStr}${timeStr ? ` · ${timeStr}` : ''}${period}`
                        })()}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '6px' }}>
                      <div style={{ background: '#EFF6FF', borderRadius: '6px', padding: '3px 2px', fontSize: '10px', color: '#1E40AF', fontWeight: 700 }}>
                        💧 {rep.peeCount || 0} Pee
                      </div>
                      <div style={{ background: '#FEF3C7', borderRadius: '6px', padding: '3px 2px', fontSize: '10px', color: '#92400E', fontWeight: 700 }}>
                        💩 {rep.pooCount || 0} Poo
                      </div>
                      <div style={{ background: '#ECFDF5', borderRadius: '6px', padding: '3px 2px', fontSize: '10px', color: '#065F46', fontWeight: 700 }}>
                        🥤 {rep.waterGiven ? 'Yes' : 'No'}
                      </div>
                      <div style={{ background: '#FFFBEB', borderRadius: '6px', padding: '3px 2px', fontSize: '10px', color: '#78350F', fontWeight: 700 }}>
                        🦴 {rep.treatCount || 0}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted, #7E7067)', fontSize: '11px', marginBottom: rep.notes ? '4px' : '0' }}>
                      <span>⏱️ {formatDurationHuman(rep.durationSeconds || 0)}</span>
                      <span>🚶‍♂️ {formatDistance(rep.distanceMeters || 0)}</span>
                    </div>

                    {rep.notes && (
                      <div style={{ fontStyle: 'italic', color: 'var(--text, #221711)', background: 'var(--surface, #F7F2E7)', padding: '4px 8px', borderRadius: '6px', marginTop: '4px' }}>
                        "{rep.notes}"
                      </div>
                    )}

                    {Array.isArray(rep.photos) && rep.photos.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginTop: '6px' }}>
                        {rep.photos.map((ph, pi) => (
                          <img
                            key={pi}
                            src={ph}
                            alt=""
                            style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Skipped Today Notice */}
        {isSkippedToday && (
          <div style={{
            background: '#FFFBEB',
            border: '1.5px dashed #F59E0B',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#92400E',
            marginBottom: '12px',
          }}>
            <span style={{ fontSize: '22px', flexShrink: 0 }}>⏸️</span>
            <div>
              <strong style={{ fontSize: '13px', display: 'block' }}>Walk Skipped by Parent for Today</strong>
              <span style={{ fontSize: '11.5px', color: '#B45309', lineHeight: 1.4, display: 'block' }}>
                Pet parent is out of town / requested a skip for today. No visit needed. Their pass validity was automatically extended.
              </span>
            </div>
          </div>
        )}

        {/* Arrival Status & Start Walk Pipeline */}
        {!isCompleted && !isThisActive && !isSkippedToday && (() => {
          const arrivalStatus = w.walkerArrivalStatus || 'idle'
          const ownerPhoneClean = (w.phone || w.userPhone || '').replace(/\D/g, '')
          const waNumber = ownerPhoneClean ? (ownerPhoneClean.length === 10 ? `91${ownerPhoneClean}` : ownerPhoneClean) : ''
          const waOnTheWayMsg = encodeURIComponent(`Hi ${w.userName || 'Pet Parent'}! 🐾 This is ${currentWalker?.name || 'your Paw Paw Walker'}. I am on my way to pick up ${w.dogName || 'your pet'} for the scheduled walk! 🚗`)
          const waArrivedMsg = encodeURIComponent(`Hi ${w.userName || 'Pet Parent'}! 🔔 This is ${currentWalker?.name || 'your Paw Paw Walker'}. I have arrived at your doorstep for ${w.dogName || 'your pet'}'s walk! Please hand over when ready. 🐕`)

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Status Banner when On The Way or Arrived */}
              {arrivalStatus === 'on_the_way' && (
                <div style={{
                  background: '#eff6ff',
                  border: '1.5px solid #bfdbfe',
                  borderRadius: '12px',
                  padding: '9px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: '18px' }}>🚗</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e40af' }}>You're On The Way</div>
                      <div style={{ fontSize: '11px', color: '#3b82f6' }}>Parent notified in real-time</div>
                    </div>
                  </div>
                  {waNumber && (
                    <a
                      href={`https://wa.me/${waNumber}?text=${waOnTheWayMsg}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      style={{
                        padding: '5px 9px',
                        fontSize: '11px',
                        background: '#25D366',
                        color: '#fff',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        textDecoration: 'none',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      <MessageCircle size={12} /> WhatsApp
                    </a>
                  )}
                </div>
              )}

              {arrivalStatus === 'arrived' && (
                <div style={{
                  background: '#f0fdf4',
                  border: '1.5px solid #bbf7d0',
                  borderRadius: '12px',
                  padding: '9px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: '18px' }}>🔔</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#166534' }}>At Doorstep!</div>
                      <div style={{ fontSize: '11px', color: '#15803d' }}>Ready to pick up {w.dogName || 'dog'}</div>
                    </div>
                  </div>
                  {waNumber && (
                    <a
                      href={`https://wa.me/${waNumber}?text=${waArrivedMsg}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      style={{
                        padding: '5px 9px',
                        fontSize: '11px',
                        background: '#25D366',
                        color: '#fff',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        textDecoration: 'none',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      <MessageCircle size={12} /> WhatsApp
                    </a>
                  )}
                </div>
              )}

              {/* Arrival Quick Action Buttons */}
              {arrivalStatus === 'idle' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleUpdateArrivalStatus(w, 'on_the_way')}
                    disabled={actionLoading}
                    className="btn btn-secondary"
                    style={{
                      padding: '8px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      borderColor: '#bfdbfe',
                    }}
                  >
                    <Car size={13} /> On My Way
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateArrivalStatus(w, 'arrived')}
                    disabled={actionLoading}
                    className="btn btn-secondary"
                    style={{
                      padding: '8px 10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      background: '#f0fdf4',
                      color: '#15803d',
                      borderColor: '#bbf7d0',
                    }}
                  >
                    <MapPin size={13} /> At Doorstep
                  </button>
                </div>
              )}

              {arrivalStatus === 'on_the_way' && (
                <button
                  type="button"
                  onClick={() => handleUpdateArrivalStatus(w, 'arrived')}
                  disabled={actionLoading}
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    background: '#f0fdf4',
                    color: '#15803d',
                    borderColor: '#bbf7d0',
                  }}
                >
                  <MapPin size={13} /> Tap When You Reach Doorstep
                </button>
              )}

              {/* Primary Action Button: Start Walk */}
              <button
                type="button"
                onClick={() => handleStartWalk(w)}
                disabled={actionLoading || !!activeWalkId}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '11px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  opacity: !!activeWalkId ? 0.6 : 1,
                  background: arrivalStatus === 'arrived' ? '#16a34a' : 'var(--accent, #C08820)',
                  borderColor: arrivalStatus === 'arrived' ? '#15803d' : 'var(--accent, #C08820)',
                }}
              >
                <Play size={15} fill="currentColor" />
                {activeWalkId
                  ? 'Another Walk Is Currently Active'
                  : isMulti
                    ? `Start Live GPS Walk (Walk #${completedCount + 1} of ${totalExpected})`
                    : 'Start Live GPS Walk'}
              </button>
            </div>
          )
        })()}

        {isCompleted && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted, #7E7067)' }}>
              <span>⏱️ {formatDurationHuman(w.walkDurationSeconds || 1800)}</span>
              <span>🚶‍♂️ {formatDistance(w.walkDistanceMeters || 1000)}</span>
            </div>

            {w.walkerRating ? (
              <div style={{ background: '#FFFDF5', border: '1px solid #FDE68A', borderRadius: '10px', padding: '8px 10px', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        size={12}
                        fill={star <= w.walkerRating ? '#F59E0B' : 'none'}
                        color={star <= w.walkerRating ? '#F59E0B' : '#D1D5DB'}
                      />
                    ))}
                    <strong style={{ marginLeft: '4px', fontSize: '11.5px', color: '#B45309' }}>
                      {w.walkerRating} / 5 Stars
                    </strong>
                  </span>
                  <span style={{ fontSize: '10px', color: '#B45309', fontWeight: 700 }}>Parent Review</span>
                </div>
                {Array.isArray(w.walkerCompliments) && w.walkerCompliments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                    {w.walkerCompliments.map((comp, i) => (
                      <span key={i} style={{ background: '#FEF3C7', borderRadius: '6px', padding: '1px 6px', fontSize: '10px', fontWeight: 700, color: '#92400E' }}>
                        {comp}
                      </span>
                    ))}
                  </div>
                )}
                {w.walkerFeedback && (
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--text)', fontStyle: 'italic', lineHeight: 1.35 }}>
                    "{w.walkerFeedback}"
                  </p>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--muted, #7E7067)', fontStyle: 'italic', paddingTop: '2px' }}>
                ⭐ Awaiting parent review
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // --- VIEW: Loading Auth Check ---
  if (loadingAuth) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg, #FCFAF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted, #7E7067)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
      </div>
    )
  }

  // --- VIEW: Walker Login Form (if not logged in) ---
  if (!session || !currentWalker) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg, #FCFAF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', boxSizing: 'border-box' }}>
        {portalToast && (
          <div style={{ position: 'fixed', top: '18px', right: '16px', zIndex: 99999, maxWidth: 'min(420px, calc(100vw - 32px))' }}>
            <Toast message={portalToast.message} type={portalToast.type || 'success'} onClose={() => setPortalToast(null)} />
          </div>
        )}
        <div style={{ width: '100%', maxWidth: '420px', background: 'var(--card, #FFFFFF)', borderRadius: '24px', padding: '28px 22px', border: '1.5px solid var(--border, #F0EAE1)', boxShadow: '0 16px 40px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          
          <div style={{ width: '64px', height: '64px', background: 'linear-gradient(135deg, #C08820 0%, #D49B2E 100%)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#fff', boxShadow: '0 6px 18px rgba(192, 136, 32, 0.35)' }}>
            <Footprints size={32} />
          </div>

          <h1 style={{ fontSize: '21px', fontWeight: 900, color: 'var(--text, #221711)', margin: '0 0 6px' }}>
            Paw Paw Walker Portal
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--muted, #7E7067)', margin: '0 0 20px', lineHeight: 1.5 }}>
            Log in with your registered mobile number and password to view your assigned dog walks.
          </p>

          {deviceLoggedOutModal && (
            <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '14px', padding: '12px 14px', marginBottom: '16px', textAlign: 'left', display: 'flex', gap: '10px', alignItems: 'flex-start', color: '#991b1b', fontSize: '12.5px' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#dc2626' }} />
              <div>
                <strong>Logged Out:</strong> Your account was opened on another phone. You have been logged out from this device. Please log in again if you are using this device.
              </div>
            </div>
          )}

          {loginError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '10px 12px', marginBottom: '16px', textAlign: 'left', color: '#b91c1c', fontSize: '12.5px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--text, #221711)', marginBottom: '5px' }}>
                Registered Mobile Number
              </label>
              <input
                type="tel"
                className="input"
                placeholder="10-digit mobile number"
                value={loginPhone}
                onChange={e => setLoginPhone(e.target.value)}
                maxLength={14}
                required
                style={{ width: '100%', boxSizing: 'border-box', fontSize: '14px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--text, #221711)', marginBottom: '5px' }}>
                Password / PIN
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  className="input"
                  placeholder="Enter your password or PIN"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box', paddingRight: '40px', fontSize: '14px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(p => !p)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted, #7E7067)', cursor: 'pointer', padding: '4px' }}
                >
                  {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '13px',
                fontSize: '14.5px',
                fontWeight: 900,
                marginTop: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {loginLoading ? 'Verifying...' : 'Log In to Portal'} <ChevronRight size={16} />
            </button>
          </form>

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border, #F0EAE1)', fontSize: '12px', color: 'var(--muted, #7E7067)' }}>
            <span>First time using the portal? Ask Paw Paw Admin to send your WhatsApp setup link.</span>
          </div>

        </div>
      </div>
    )
  }

  // --- VIEW: Authenticated Walker Dashboard ---
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #FCFAF6)', paddingBottom: '70px' }}>
      {portalToast && (
        <div style={{ position: 'fixed', top: '18px', right: '16px', zIndex: 99999, maxWidth: 'min(420px, calc(100vw - 32px))' }}>
          <Toast message={portalToast.message} type={portalToast.type || 'success'} onClose={() => setPortalToast(null)} />
        </div>
      )}
      
      {/* Top Walker Header Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 300,
          background: '#FCFAF6',
          borderBottom: '1px solid var(--border, #F0EAE1)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 10px rgba(34, 23, 17, 0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, #C08820 0%, #D49B2E 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: '15px', flexShrink: 0 }}>
            🐾
          </div>
          <div>
            <div style={{ fontSize: '14.5px', fontWeight: 900, color: 'var(--text, #221711)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {currentWalker.name}
              <span style={{ fontSize: '10.5px', background: 'var(--accent-bg, #FFF9ED)', color: 'var(--accent, #C08820)', border: '1px solid var(--accent-border, #F2D99E)', padding: '1px 6px', borderRadius: '999px', fontWeight: 800 }}>
                Walker
              </span>
            </div>
            {(() => {
              const completedRatedWalks = walks.filter(w => w.status === WALKING_STATUS.COMPLETED && w.walkerRating)
              const walkerAvgRating = completedRatedWalks.length > 0
                ? (completedRatedWalks.reduce((sum, w) => sum + Number(w.walkerRating || 0), 0) / completedRatedWalks.length).toFixed(1)
                : null

              return (
                <div style={{ fontSize: '11px', color: 'var(--muted, #7E7067)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{currentWalker.phone || 'Paw Paw Partner'}</span>
                  {walkerAvgRating && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#B45309', fontWeight: 800, background: '#FFFDF5', border: '1px solid #FDE68A', padding: '1px 6px', borderRadius: '6px' }}>
                      <Star size={11} fill="#F59E0B" color="#F59E0B" /> {walkerAvgRating} ({completedRatedWalks.length})
                    </span>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          title="Log out of Walker Portal"
          style={{
            background: 'none',
            border: '1px solid var(--border, #F0EAE1)',
            borderRadius: '999px',
            padding: '6px 12px',
            fontSize: '11.5px',
            color: 'var(--muted, #7E7067)',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <LogOut size={13} /> Log Out
        </button>
      </header>

      {/* Primary Portal Navigation Tabs (Active Walk vs My Assigned Walks) */}
      <div
        style={{
          display: 'flex',
          background: 'var(--card, #FFFFFF)',
          borderBottom: '1.5px solid var(--border, #F0EAE1)',
          padding: '0 16px',
        }}
      >
        <button
          type="button"
          onClick={() => setMainPortalTab('live')}
          style={{
            flex: 1,
            padding: '12px 8px',
            fontSize: '13px',
            fontWeight: 800,
            border: 'none',
            borderBottom: `3px solid ${mainPortalTab === 'live' ? 'var(--accent, #C08820)' : 'transparent'}`,
            background: 'none',
            color: mainPortalTab === 'live' ? 'var(--accent, #C08820)' : 'var(--muted, #7E7067)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <Play size={13} fill={mainPortalTab === 'live' ? 'currentColor' : 'none'} />
          <span>Active Walk</span>
          {activeWalk && (
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', animation: 'pawpaw-gps-pulse 1.5s infinite' }} />
          )}
        </button>

        <button
          type="button"
          onClick={() => setMainPortalTab('all_walks')}
          style={{
            flex: 1,
            padding: '12px 8px',
            fontSize: '13px',
            fontWeight: 800,
            border: 'none',
            borderBottom: `3px solid ${mainPortalTab === 'all_walks' ? 'var(--accent, #C08820)' : 'transparent'}`,
            background: 'none',
            color: mainPortalTab === 'all_walks' ? 'var(--accent, #C08820)' : 'var(--muted, #7E7067)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
          }}
        >
          <Footprints size={14} />
          <span>My Assigned Walks ({walks.length})</span>
        </button>
      </div>

      {/* Floating New Assignment Alert Banner */}
      {newAssignmentAlert && (
        <div
          style={{
            position: 'sticky',
            top: '110px',
            zIndex: 99,
            margin: '10px 16px',
            background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
            color: '#fff',
            borderRadius: '16px',
            padding: '12px 16px',
            boxShadow: '0 8px 24px rgba(22, 163, 74, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            animation: 'fadeIn 0.25s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={16} />
            </div>
            <div>
              <strong style={{ display: 'block', fontSize: '13px' }}>
                {newAssignmentAlert.title || 'New Dog Walk Assigned!'}
              </strong>
              <span style={{ fontSize: '11.5px', opacity: 0.9 }}>
                {newAssignmentAlert.message || 'Check your schedule below'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismissAlert}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '26px', height: '26px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Container */}
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '16px' }}>

        {/* ======================================================== */}
        {/* VIEW 1: ACTIVE WALK TAB (HERO + RECENT 5 WALKS)          */}
        {/* ======================================================== */}
        {mainPortalTab === 'live' && (
          <div>
            {/* Active Walk In Progress Hero Card */}
            {activeWalk && activeWalk.status === WALKING_STATUS.IN_PROGRESS && (
              <div
                style={{
                  background: '#221711',
                  color: '#FCFAF6',
                  borderRadius: '24px',
                  padding: '20px',
                  marginBottom: '22px',
                  boxShadow: '0 16px 36px rgba(34, 23, 17, 0.35)',
                  border: '2px solid rgba(192, 136, 32, 0.6)',
                  position: 'relative',
                  overflow: 'hidden',
                  isolation: 'isolate',
                  zIndex: 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e', padding: '5px 12px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 800, color: '#4ade80' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', animation: 'pawpaw-gps-pulse 1.5s infinite' }} />
                    WALK IN PROGRESS · LIVE GPS
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* 🚨 SOS Emergency Button */}
                    <button
                      type="button"
                      onClick={() => setShowSosModal(true)}
                      style={{
                        background: activeWalk.hasEmergency ? '#dc2626' : 'rgba(239, 68, 68, 0.25)',
                        border: '1.5px solid #ef4444',
                        color: '#fff',
                        borderRadius: '999px',
                        padding: '4px 12px',
                        fontSize: '11.5px',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        boxShadow: activeWalk.hasEmergency ? '0 0 14px rgba(239, 68, 68, 0.8)' : 'none',
                      }}
                    >
                      <AlertOctagon size={13} color="#fff" />
                      {activeWalk.hasEmergency ? '🚨 SOS ACTIVE' : '🚨 SOS Emergency'}
                    </button>

                    {gpsAccuracy !== null && (
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ShieldCheck size={13} color="#4ade80" /> ±{gpsAccuracy}m
                      </div>
                    )}
                  </div>
                </div>

                {/* Active Emergency Banner */}
                {activeWalk.hasEmergency && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.25)',
                    border: '1.5px solid #ef4444',
                    borderRadius: '14px',
                    padding: '10px 14px',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    animation: 'fadeIn 0.2s ease',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>🚨</span>
                      <div>
                        <strong style={{ color: '#fca5a5', fontSize: '12px', display: 'block' }}>
                          Emergency Alert Broadcast Active
                        </strong>
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)' }}>
                          {activeWalk.emergencyReason || 'Safety incident reported'} · Parent & Admin Notified
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSosModal(true)}
                      className="btn"
                      style={{ background: '#ef4444', color: '#fff', fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '8px' }}
                    >
                      Manage SOS
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '18px', background: 'rgba(255,255,255,0.1)', border: '2px solid #C08820', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', flexShrink: 0, overflow: 'hidden' }}>
                    {activeWalk.petPhotoUrl || activeWalk.photoUrl ? (
                      <img src={activeWalk.petPhotoUrl || activeWalk.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span>🐶</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: '19px', fontWeight: 900, margin: '0 0 2px', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {activeWalk.dogName || activeWalk.petName || 'Dog'}
                    </h2>
                    <div style={{ fontSize: '12.5px', color: '#D49B2E', fontWeight: 700 }}>
                      {activeWalk.breed || activeWalk.petBreed || 'Breed not specified'} · {activeWalk.duration || 30} Min Session
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>
                      Parent: {activeWalk.ownerName || 'Pet Parent'} ({activeWalk.phone || '-'})
                    </div>
                  </div>
                </div>

                {/* Live GPS & Fitness Stats HUD */}
                {(() => {
                  const pace = calculatePace(totalDistanceMeters, elapsedSeconds)
                  const speed = calculateSpeed(totalDistanceMeters, elapsedSeconds, currentGps?.speed)
                  const calories = calculateCalories(totalDistanceMeters, elapsedSeconds)
                  const gpsQuality = getGpsQuality(gpsAccuracy)

                  return (
                    <div style={{ marginBottom: '16px' }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: '10px',
                          background: 'rgba(255,255,255,0.06)',
                          borderRadius: '16px',
                          padding: '14px 14px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          textAlign: 'center',
                        }}
                      >
                        {/* 1. Time */}
                        <div>
                          <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
                            <Clock size={11} /> Walk Time
                          </span>
                          <div style={{ fontSize: '26px', fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', fontFamily: 'monospace' }}>
                            {formatDurationMMSS(elapsedSeconds)}
                          </div>
                          <span style={{ fontSize: '10.5px', color: '#D49B2E', fontWeight: 700 }}>
                            Target: {activeWalk.duration || 30} Mins
                          </span>
                        </div>

                        {/* 2. Distance */}
                        <div>
                          <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
                            <Footprints size={11} /> Distance
                          </span>
                          <div style={{ fontSize: '26px', fontWeight: 900, color: '#4ade80', letterSpacing: '-0.5px', fontFamily: 'monospace' }}>
                            {formatDistance(totalDistanceMeters)}
                          </div>
                          <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.6)' }}>
                            {routeTrail.length} GPS points
                          </span>
                        </div>

                        {/* 3. Pace */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
                          <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
                            <Gauge size={11} /> Avg Pace
                          </span>
                          <div style={{ fontSize: '20px', fontWeight: 900, color: '#38bdf8', fontFamily: 'monospace' }}>
                            {pace.formatted}
                          </div>
                          <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.5)' }}>
                            Minutes / km
                          </span>
                        </div>

                        {/* 4. Speed */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
                          <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '4px' }}>
                            <Zap size={11} /> Speed
                          </span>
                          <div style={{ fontSize: '20px', fontWeight: 900, color: '#fbbf24', fontFamily: 'monospace' }}>
                            {speed.formatted}
                          </div>
                          <span style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.5)' }}>
                            Walking pace
                          </span>
                        </div>
                      </div>

                      {/* Extra fitness strip: Calories + GPS Signal */}
                      <div style={{
                        marginTop: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 12px',
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: '12px',
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.7)',
                      }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#fb923c', fontWeight: 700 }}>
                          <Flame size={13} /> Active Burn: ~{calories} kcal
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: gpsQuality.color }} />
                          <span style={{ color: gpsQuality.color, fontWeight: 700 }}>GPS: {gpsQuality.label}</span>
                        </span>
                      </div>
                    </div>
                  )
                })()}

                {/* GPS Warning if error */}
                {gpsError && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', borderRadius: '12px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>{gpsError}</span>
                  </div>
                )}

                {/* Interactive Live Mini-Map */}
                <div style={{ marginBottom: '16px' }}>
                  <LiveWalkTrackerMap
                    pickupCoords={activeWalk.locationCoords || (activeWalk.lat && activeWalk.lng ? { lat: activeWalk.lat, lng: activeWalk.lng } : null)}
                    currentCoords={currentGps}
                    routeTrail={routeTrail}
                    isLive={true}
                    dogName={activeWalk.dogName || activeWalk.petName || 'Dog'}
                    walkerName={currentWalker.name}
                    height="240px"
                  />
                </div>

                {/* Emergency / Contact Owner Bar */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  {activeWalk.phone && (
                    <a
                      href={`tel:${activeWalk.phone}`}
                      style={{
                        flex: 1,
                        background: 'rgba(255,255,255,0.12)',
                        color: '#fff',
                        borderRadius: '12px',
                        padding: '10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Phone size={14} /> Call Owner
                    </a>
                  )}
                  {activeWalk.phone && (
                    <a
                      href={`https://wa.me/91${String(activeWalk.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`Hi, I am currently walking ${activeWalk.dogName || 'your dog'}! 🐾`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1,
                        background: '#25D366',
                        color: '#fff',
                        borderRadius: '12px',
                        padding: '10px',
                        fontSize: '12px',
                        fontWeight: 700,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  )}
                </div>

                {/* 🐾 Live Walk Activity Log & Photos */}
                <div style={{ background: 'rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '14px', marginBottom: '16px', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🐾 Care & Activity Tracker
                    </span>
                    <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.65)' }}>
                      Tap to log for pet parent
                    </span>
                  </div>

                  {/* Quick Action Chips: Pee, Poo, Water, Treat */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px' }}>
                    {/* Pee Button */}
                    <button
                      type="button"
                      onClick={() => handleLogActivity('pee')}
                      style={{
                        background: activities.pee > 0 ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                        border: `1.5px solid ${activities.pee > 0 ? '#60a5fa' : 'rgba(255, 255, 255, 0.15)'}`,
                        borderRadius: '12px',
                        padding: '8px 4px',
                        color: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ fontSize: '18px', lineHeight: 1 }}>💧</span>
                      <span style={{ fontSize: '11px', fontWeight: 800 }}>
                        {activities.pee > 0 ? `${activities.pee} Pee` : 'Pee'}
                      </span>
                      <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.65)' }}>+1 Tap</span>
                    </button>

                    {/* Poo Button */}
                    <button
                      type="button"
                      onClick={() => handleLogActivity('poo')}
                      style={{
                        background: activities.poo > 0 ? 'rgba(217, 119, 6, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                        border: `1.5px solid ${activities.poo > 0 ? '#f59e0b' : 'rgba(255, 255, 255, 0.15)'}`,
                        borderRadius: '12px',
                        padding: '8px 4px',
                        color: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ fontSize: '18px', lineHeight: 1 }}>💩</span>
                      <span style={{ fontSize: '11px', fontWeight: 800 }}>
                        {activities.poo > 0 ? `${activities.poo} Poo` : 'Poop'}
                      </span>
                      <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.65)' }}>+1 Tap</span>
                    </button>

                    {/* Water Button */}
                    <button
                      type="button"
                      onClick={() => handleLogActivity('water')}
                      style={{
                        background: activities.water ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                        border: `1.5px solid ${activities.water ? '#34d399' : 'rgba(255, 255, 255, 0.15)'}`,
                        borderRadius: '12px',
                        padding: '8px 4px',
                        color: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ fontSize: '18px', lineHeight: 1 }}>🥤</span>
                      <span style={{ fontSize: '11px', fontWeight: 800 }}>
                        {activities.water ? 'Hydrated' : 'Water'}
                      </span>
                      <span style={{ fontSize: '9px', color: activities.water ? '#34d399' : 'rgba(255, 255, 255, 0.65)' }}>
                        {activities.water ? '✓ Given' : 'Tap to log'}
                      </span>
                    </button>

                    {/* Treat Button */}
                    <button
                      type="button"
                      onClick={() => handleLogActivity('treats')}
                      style={{
                        background: activities.treats > 0 ? 'rgba(234, 179, 8, 0.3)' : 'rgba(255, 255, 255, 0.08)',
                        border: `1.5px solid ${activities.treats > 0 ? '#facc15' : 'rgba(255, 255, 255, 0.15)'}`,
                        borderRadius: '12px',
                        padding: '8px 4px',
                        color: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{ fontSize: '18px', lineHeight: 1 }}>🦴</span>
                      <span style={{ fontSize: '11px', fontWeight: 800 }}>
                        {activities.treats > 0 ? `${activities.treats} Treats` : 'Treat'}
                      </span>
                      <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.65)' }}>+1 Tap</span>
                    </button>
                  </div>

                  {/* Snap Photo & Photo Thumbnails */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'rgba(255, 255, 255, 0.15)',
                          color: '#fff',
                          borderRadius: '10px',
                          padding: '8px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: uploadingPhoto ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Camera size={14} />
                        {uploadingPhoto ? 'Uploading photo...' : '📸 Snap / Add Photo'}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={uploadingPhoto}
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) handleAddWalkPhoto(f)
                            e.target.value = ''
                          }}
                        />
                      </label>

                      {walkPhotos.length > 0 && (
                        <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)' }}>
                          {walkPhotos.length} photo{walkPhotos.length > 1 ? 's' : ''} attached
                        </span>
                      )}
                    </div>

                    {/* Photo Strip */}
                    {walkPhotos.length > 0 && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                        {walkPhotos.map((url, i) => (
                          <div key={i} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.3)' }}>
                            <img src={url} alt={`Walk photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button
                              type="button"
                              onClick={() => handleRemoveWalkPhoto(i)}
                              style={{
                                position: 'absolute',
                                top: '2px',
                                right: '2px',
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                background: 'rgba(0,0,0,0.7)',
                                color: '#fff',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                padding: 0,
                              }}
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Walker's Note for Pet Parent */}
                  <div>
                    <textarea
                      value={walkerNotes}
                      onChange={(e) => {
                        setWalkerNotes(e.target.value)
                        if (activeWalk?.id) {
                          updateDoc(doc(db, 'walkingBookings', activeWalk.id), {
                            walkerNotes: e.target.value,
                          }).catch(() => {})
                        }
                      }}
                      placeholder="Add note for owner (e.g. Bruno walked gently & made friends in the park!)..."
                      rows={2}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '10px',
                        padding: '8px 10px',
                        fontSize: '12px',
                        color: '#fff',
                        resize: 'none',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                </div>

                {/* Complete Walk Button */}
                {!completingConfirm ? (
                  <button
                    type="button"
                    onClick={() => setCompletingConfirm(true)}
                    disabled={actionLoading}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '16px',
                      padding: '15px',
                      fontSize: '15px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 8px 20px rgba(220, 38, 38, 0.4)',
                    }}
                  >
                    <Square size={18} fill="#fff" /> Finish & End Walk
                  </button>
                ) : (
                  <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1.5px solid #ef4444', borderRadius: '16px', padding: '14px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                      Finish walking {activeWalk.dogName || 'dog'}? Total time: {formatDurationHuman(elapsedSeconds)}
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setCompletingConfirm(false)}
                        style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                      >
                        Keep Walking
                      </button>
                      <button
                        type="button"
                        onClick={handleCompleteWalk}
                        disabled={actionLoading}
                        style={{ flex: 1, padding: '10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 900, fontSize: '13px', cursor: 'pointer' }}
                      >
                        {actionLoading ? 'Saving...' : 'Yes, End Walk'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Standby Banner if no walk active */}
            {(!activeWalk || activeWalk.status !== WALKING_STATUS.IN_PROGRESS) && (
              <div
                style={{
                  background: 'var(--card, #fff)',
                  borderRadius: '20px',
                  padding: '20px',
                  marginBottom: '20px',
                  border: '1.5px solid var(--border, #F0EAE1)',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                }}
              >
                <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'var(--accent-bg, #FFF9ED)', border: '1px solid var(--accent-border, #F2D99E)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent, #C08820)', flexShrink: 0 }}>
                  <Footprints size={24} />
                </div>
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: 900, color: 'var(--text, #221711)' }}>
                    Ready for your next walk?
                  </h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--muted, #7E7067)' }}>
                    Select an assigned dog walk below to start live GPS streaming.
                  </p>
                </div>
              </div>
            )}

            {/* RECENT WALKS (MAX 5) SECTION */}
            <div style={{ marginBottom: '16px' }}>
              {categorizedWalks.skipped.length > 0 && (
                <div style={{
                  background: 'rgba(217, 119, 6, 0.08)',
                  border: '1.5px solid rgba(217, 119, 6, 0.3)',
                  borderRadius: '14px',
                  padding: '10px 14px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⏸️</span>
                    <span>{categorizedWalks.skipped.length} walk{categorizedWalks.skipped.length > 1 ? 's' : ''} skipped today by pet parent (excluded from active route)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMainPortalTab('all_walks'); setActiveTab('skipped') }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent, #C08820)',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    View →
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 900, color: 'var(--text, #221711)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={16} color="var(--accent, #C08820)" /> Today's Scheduled Walks ({recentWalks.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setMainPortalTab('all_walks')}
                  style={{ background: 'none', border: 'none', color: 'var(--accent, #C08820)', fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                >
                  View All ({walks.length}) →
                </button>
              </div>

              {loadingWalks ? (
                <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--muted, #7E7067)' }}>
                  <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
                  <div>Loading walks...</div>
                </div>
              ) : recentWalks.length === 0 ? (
                <div style={{ background: 'var(--card, #fff)', borderRadius: '18px', padding: '28px 16px', textAlign: 'center', border: '1.5px dashed var(--border, #F0EAE1)' }}>
                  <Footprints size={30} color="var(--muted, #7E7067)" style={{ marginBottom: '6px', opacity: 0.5 }} />
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text, #221711)' }}>
                    No walks scheduled for today
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted, #7E7067)', marginTop: '2px' }}>
                    {categorizedWalks.upcoming.length > 0
                      ? `You have ${categorizedWalks.upcoming.length} upcoming future walk${categorizedWalks.upcoming.length > 1 ? 's' : ''}. Switch to "My Assigned Walks" to view them.`
                      : 'New walks assigned by Paw Paw admin will appear here automatically.'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {recentWalks.map(renderWalkCard)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 2: ALL ASSIGNED WALKS DEDICATED TAB                 */}
        {/* ======================================================== */}
        {mainPortalTab === 'all_walks' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: 'var(--text, #221711)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Footprints size={18} color="var(--accent, #C08820)" /> All Assigned Walks ({walks.length})
              </h3>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ background: 'none', border: 'none', color: 'var(--muted, #7E7067)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', overflowX: 'auto', paddingBottom: '4px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('active')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: '1.5px solid',
                  borderColor: activeTab === 'active' ? 'var(--accent, #C08820)' : 'var(--border, #F0EAE1)',
                  background: activeTab === 'active' ? 'var(--accent, #C08820)' : 'var(--card, #fff)',
                  color: activeTab === 'active' ? '#fff' : 'var(--text, #221711)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Today ({categorizedWalks.active.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('upcoming')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: '1.5px solid',
                  borderColor: activeTab === 'upcoming' ? 'var(--accent, #C08820)' : 'var(--border, #F0EAE1)',
                  background: activeTab === 'upcoming' ? 'var(--accent, #C08820)' : 'var(--card, #fff)',
                  color: activeTab === 'upcoming' ? '#fff' : 'var(--text, #221711)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Upcoming Future ({categorizedWalks.upcoming.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('completed')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: '1.5px solid',
                  borderColor: activeTab === 'completed' ? 'var(--accent, #C08820)' : 'var(--border, #F0EAE1)',
                  background: activeTab === 'completed' ? 'var(--accent, #C08820)' : 'var(--card, #fff)',
                  color: activeTab === 'completed' ? '#fff' : 'var(--text, #221711)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Completed ({categorizedWalks.completed.length})
              </button>
              {categorizedWalks.skipped.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('skipped')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 700,
                    border: '1.5px solid',
                    borderColor: activeTab === 'skipped' ? '#d97706' : '#fde68a',
                    background: activeTab === 'skipped' ? '#d97706' : '#fffbeb',
                    color: activeTab === 'skipped' ? '#fff' : '#92400e',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ⏸️ Skipped ({categorizedWalks.skipped.length})
                </button>
              )}
            </div>

            {/* Walks list */}
            {loadingWalks ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted, #7E7067)' }}>
                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
                <div>Loading walks...</div>
              </div>
            ) : (categorizedWalks[activeTab] || []).length === 0 ? (
              <div style={{ background: 'var(--card, #fff)', borderRadius: '18px', padding: '32px 20px', textAlign: 'center', border: '1.5px dashed var(--border, #F0EAE1)' }}>
                <Footprints size={32} color="var(--muted, #7E7067)" style={{ marginBottom: '8px', opacity: 0.5 }} />
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text, #221711)', marginBottom: '4px' }}>
                  No walks in this tab
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted, #7E7067)' }}>
                  {activeTab === 'active' ? 'You have no pending walks scheduled for today.' : activeTab === 'upcoming' ? 'No future walks assigned yet.' : activeTab === 'skipped' ? 'No walks skipped today.' : 'No completed walks logged yet.'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {(categorizedWalks[activeTab] || []).map(renderWalkCard)}
              </div>
            )}
          </div>
        )}

        {/* Walk Completed Celebration & Report Card Modal */}
        {completionSuccess && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: '#FCFAF6', maxWidth: '440px', width: '100%', maxHeight: '92vh', overflowY: 'auto', borderRadius: '24px', padding: '24px', border: '1.5px solid #EADBBE', boxShadow: '0 20px 48px rgba(0,0,0,0.3)', boxSizing: 'border-box' }}>
              {/* Top Banner */}
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                  <CheckCircle size={32} />
                </div>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--accent, #C08820)' }}>
                  Official Walk Report Card
                </span>
                <h3 style={{ fontSize: '22px', fontWeight: 900, color: '#221711', margin: '4px 0 2px' }}>
                  {completionSuccess.dogName}'s Walk Report 🐾
                </h3>
                <p style={{ fontSize: '12px', color: '#7E7067', margin: 0 }}>
                  Completed by {completionSuccess.report?.walkerName || currentWalker?.name || 'Walker'}
                </p>
              </div>

              {/* Primary Metrics: Duration, Distance, Pace, Calories */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', background: '#F7F2E7', borderRadius: '16px', padding: '12px 6px', marginBottom: '14px', textAlign: 'center' }}>
                <div>
                  <span style={{ fontSize: '10px', color: '#7E7067', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Duration</span>
                  <strong style={{ fontSize: '14px', color: '#221711' }}>{formatDurationHuman(completionSuccess.durationSec)}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: '#7E7067', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Distance</span>
                  <strong style={{ fontSize: '14px', color: '#16a34a' }}>{formatDistance(completionSuccess.distanceM)}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: '#7E7067', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Avg Pace</span>
                  <strong style={{ fontSize: '14px', color: '#0284c7' }}>{completionSuccess.report?.pace || calculatePace(completionSuccess.distanceM, completionSuccess.durationSec).formatted}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: '#7E7067', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Calories</span>
                  <strong style={{ fontSize: '14px', color: '#ea580c' }}>~{completionSuccess.report?.calories || calculateCalories(completionSuccess.distanceM, completionSuccess.durationSec)} kcal</strong>
                </div>
              </div>

              {/* Activity Chips: Pee, Poo, Water, Treats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px', textAlign: 'center' }}>
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '12px', padding: '8px 4px' }}>
                  <span style={{ fontSize: '16px', display: 'block' }}>💧</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E40AF' }}>{completionSuccess.report?.peeCount || 0} Pee</span>
                </div>
                <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '12px', padding: '8px 4px' }}>
                  <span style={{ fontSize: '16px', display: 'block' }}>💩</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#92400E' }}>{completionSuccess.report?.pooCount || 0} Poo</span>
                </div>
                <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '12px', padding: '8px 4px' }}>
                  <span style={{ fontSize: '16px', display: 'block' }}>🥤</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#065F46' }}>{completionSuccess.report?.waterGiven ? 'Yes' : 'No'}</span>
                </div>
                <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '12px', padding: '8px 4px' }}>
                  <span style={{ fontSize: '16px', display: 'block' }}>🦴</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#78350F' }}>{completionSuccess.report?.treatCount || 0} Treats</span>
                </div>
              </div>

              {/* Walker's Personal Note */}
              {completionSuccess.report?.notes && (
                <div style={{ background: '#fff', border: '1px solid #EADBBE', borderRadius: '12px', padding: '12px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#7E7067', display: 'block', marginBottom: '4px' }}>Walker's Note:</span>
                  <p style={{ margin: 0, fontSize: '13px', color: '#221711', fontStyle: 'italic', lineHeight: 1.4 }}>
                    "{completionSuccess.report.notes}"
                  </p>
                </div>
              )}

              {/* Walk Photos Gallery */}
              {completionSuccess.report?.photos?.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#7E7067', display: 'block', marginBottom: '6px' }}>Walk Photos:</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: '8px' }}>
                    {completionSuccess.report.photos.map((pUrl, idx) => (
                      <a key={idx} href={pUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden', border: '1px solid #EADBBE' }}>
                        <img src={pUrl} alt="Walk memory" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {completionSuccess.ownerPhone && (
                  <a
                    href={`https://wa.me/91${String(completionSuccess.ownerPhone).replace(/\D/g, '')}?text=${generateWhatsAppReportMessage(completionSuccess)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: '#25D366',
                      color: '#fff',
                      borderRadius: '14px',
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 800,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 14px rgba(37, 211, 102, 0.3)',
                    }}
                  >
                    <MessageCircle size={18} /> Share Report Card on WhatsApp
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setCompletionSuccess(null)}
                  className="btn btn-secondary"
                  style={{ width: '100%', fontSize: '13px', padding: '10px', justifyContent: 'center' }}
                >
                  Back to Schedule
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 🚨 WALKER EMERGENCY / SOS MODAL                         */}
        {/* ======================================================== */}
        {showSosModal && activeWalk && (() => {
          const dogName = activeWalk.dogName || activeWalk.petName || 'Dog'
          const breed = activeWalk.breed || activeWalk.dogBreed || ''
          const ownerPhone = activeWalk.phone || activeWalk.customerPhone || ''
          const emergencyPhone = activeWalk.emergencyContact || ''
          const mapsLink = currentGps?.lat ? `https://maps.google.com/?q=${currentGps.lat},${currentGps.lng}` : ''
          const vetSearchLink = currentGps?.lat
            ? `https://www.google.com/maps/search/veterinary+clinic+near+me/@${currentGps.lat},${currentGps.lng},15z`
            : 'https://www.google.com/maps/search/veterinary+clinic+near+me'

          const waSosText = encodeURIComponent(
            `🚨 *URGENT EMERGENCY ALERT - Paw Paw Pet Walking* 🚨\n\n` +
            `🐶 *Pet:* ${dogName}${breed ? ` (${breed})` : ''}\n` +
            `🚶 *Walker:* ${currentWalker?.name || 'Walker'} (${currentWalker?.phone || ''})\n` +
            `⚠️ *Emergency:* ${sosReason}\n` +
            (sosNote ? `📝 *Details:* "${sosNote}"\n` : '') +
            (mapsLink ? `📍 *My Current Location Pin:* ${mapsLink}\n\n` : '\n') +
            `Please contact me or meet me immediately!`
          )

          const ownerPhoneClean = ownerPhone.replace(/\D/g, '')
          const waNumber = ownerPhoneClean ? (ownerPhoneClean.length === 10 ? `91${ownerPhoneClean}` : ownerPhoneClean) : ''

          return (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 100000,
                background: 'rgba(20, 15, 12, 0.85)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                boxSizing: 'border-box',
                animation: 'fadeIn 0.2s ease-out',
              }}
              onClick={() => !broadcastingSos && setShowSosModal(false)}
            >
              <div
                style={{
                  background: '#FFFFFF',
                  width: '100%',
                  maxWidth: '460px',
                  maxHeight: '92vh',
                  overflowY: 'auto',
                  borderRadius: '24px',
                  padding: '24px 20px',
                  boxShadow: '0 24px 60px rgba(220, 38, 38, 0.35)',
                  border: '2.5px solid #ef4444',
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#fee2e2', border: '1.5px solid #fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                      <AlertOctagon size={24} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#dc2626', margin: 0 }}>
                        Emergency / SOS
                      </h2>
                      <span style={{ fontSize: '12px', color: '#7E7067' }}>
                        Active Walk: <strong>{dogName}</strong> ({activeWalk.ownerName || 'Parent'})
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSosModal(false)}
                    disabled={broadcastingSos}
                    style={{ background: '#F0EAE1', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#221711' }}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Status notice if active */}
                {activeWalk.hasEmergency ? (
                  <div style={{ background: '#fee2e2', border: '1.5px solid #ef4444', borderRadius: '14px', padding: '12px', marginBottom: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#991b1b', marginBottom: '4px' }}>
                      🚨 SOS Broadcast is Currently ACTIVE
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#b91c1c', marginBottom: '10px' }}>
                      Reason: "{activeWalk.emergencyReason}" · Owner & Admin were notified.
                    </div>
                    <button
                      type="button"
                      onClick={handleResolveSos}
                      disabled={broadcastingSos}
                      className="btn"
                      style={{ background: '#16a34a', color: '#fff', fontSize: '12px', fontWeight: 800, padding: '7px 16px', borderRadius: '10px' }}
                    >
                      {broadcastingSos ? 'Updating...' : '✅ Mark Emergency Resolved'}
                    </button>
                  </div>
                ) : null}

                {/* SECTION 1: 1-Tap Urgent Calls */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#991b1b', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                    ⚡ Instant Emergency Calls
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                    {ownerPhone && (
                      <a
                        href={`tel:${ownerPhone}`}
                        style={{
                          background: '#16a34a',
                          color: '#fff',
                          textDecoration: 'none',
                          borderRadius: '12px',
                          padding: '11px 14px',
                          fontSize: '13.5px',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <PhoneCall size={16} /> Call Pet Parent ({activeWalk.ownerName || 'Parent'})
                        </span>
                        <span style={{ fontSize: '12px', opacity: 0.9 }}>{ownerPhone}</span>
                      </a>
                    )}

                    {emergencyPhone && (
                      <a
                        href={`tel:${emergencyPhone}`}
                        style={{
                          background: '#ea580c',
                          color: '#fff',
                          textDecoration: 'none',
                          borderRadius: '12px',
                          padding: '11px 14px',
                          fontSize: '13.5px',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <PhoneCall size={16} /> Call Emergency Contact
                        </span>
                        <span style={{ fontSize: '12px', opacity: 0.9 }}>{emergencyPhone}</span>
                      </a>
                    )}

                    <a
                      href={vetSearchLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1.5px solid #bfdbfe',
                        textDecoration: 'none',
                        borderRadius: '12px',
                        padding: '10px 14px',
                        fontSize: '13px',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🏥 Find Nearest Vet Clinic (GPS Map)
                      </span>
                      <span>↗</span>
                    </a>
                  </div>
                </div>

                {/* SECTION 2: Broadcast SOS Alert */}
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '16px', padding: '14px', marginBottom: '14px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#991b1b', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                    🚨 Broadcast Urgent Alert (Notify Parent & Admin)
                  </label>

                  <div style={{ marginBottom: '10px' }}>
                    <span style={{ fontSize: '11.5px', color: '#7f1d1d', fontWeight: 700, display: 'block', marginBottom: '6px' }}>Select Reason:</span>
                    <select
                      className="input"
                      value={sosReason}
                      onChange={e => setSosReason(e.target.value)}
                      style={{ width: '100%', fontSize: '12.5px', padding: '9px', borderRadius: '10px', border: '1.5px solid #f87171' }}
                    >
                      {SOS_REASON_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <textarea
                      className="input"
                      rows={2}
                      value={sosNote}
                      onChange={e => setSosNote(e.target.value)}
                      placeholder="Brief details (e.g. dog bleeding paw, dog slipped collar at park)..."
                      style={{ width: '100%', fontSize: '12px', padding: '8px 10px', borderRadius: '10px', resize: 'none' }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleBroadcastSos}
                    disabled={broadcastingSos}
                    className="btn"
                    style={{
                      width: '100%',
                      background: '#dc2626',
                      borderColor: '#b91c1c',
                      color: '#fff',
                      fontSize: '13.5px',
                      fontWeight: 900,
                      padding: '11px',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
                    }}
                  >
                    <AlertOctagon size={16} />
                    {broadcastingSos ? 'Sending High-Priority SOS...' : 'Broadcast SOS Alert 🚨'}
                  </button>

                  {waNumber && (
                    <a
                      href={`https://wa.me/${waNumber}?text=${waSosText}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        marginTop: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        background: '#25D366',
                        color: '#fff',
                        textDecoration: 'none',
                        fontSize: '12.5px',
                        fontWeight: 800,
                        padding: '9px',
                        borderRadius: '10px',
                      }}
                    >
                      <MessageCircle size={15} /> Send WhatsApp SOS with Live GPS Pin
                    </a>
                  )}
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => setShowSosModal(false)}
                  disabled={broadcastingSos}
                  className="btn btn-secondary"
                  style={{ width: '100%', fontSize: '13px', padding: '10px', justifyContent: 'center' }}
                >
                  Close
                </button>
              </div>
            </div>
          )
        })()}
      </main>
    </div>
  )
}
