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
import { db } from '../firebase'
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
} from 'lucide-react'
import LiveWalkTrackerMap from '../components/LiveWalkTrackerMap'
import {
  calculateDistanceMeters,
  calculateTotalRouteDistance,
  formatDistance,
  formatDurationMMSS,
  formatDurationHuman,
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

  // Notifications State
  const [newAssignmentAlert, setNewAssignmentAlert] = useState(null)
  const initialNotifCheckDoneRef = useRef(false)

  const watchIdRef = useRef(null)
  const wakeLockRef = useRef(null)
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
      setElapsedSeconds(elapsed)
    }

    updateTimer()
    timerIntervalRef.current = setInterval(updateTimer, 1000)

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [activeWalk?.id, activeWalk?.status, activeWalk?.walkStartedAt])

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

      if (distFromLast >= 6 || timeSinceLastPush > 20000 || !last) {
        lastTrailPointRef.current = point
        lastServerPushTime = now

        setRouteTrail(prev => {
          const updated = [...prev, point]
          const newDistance = calculateTotalRouteDistance(updated)
          setTotalDistanceMeters(newDistance)

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
      await updateDoc(doc(db, 'teamMembers', matched.id), {
        activeSessionId: newSessionId,
        lastLoginAt: serverTimestamp(),
        lastActiveDevice: typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 80) : 'Mobile',
        updatedAt: serverTimestamp(),
      })

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
      const confirmLog = window.confirm('You have a walk currently in progress. Logging out will pause your tracking. Are you sure?')
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

  // START WALK
  const handleStartWalk = async (booking) => {
    if (!booking) return
    setActionLoading(true)
    setGpsError('')

    try {
      if (!navigator.geolocation) {
        alert('Your device does not support GPS geolocation.')
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
          lastTrailPointRef.current = initialPoint
          setActionLoading(false)
          setMainPortalTab('live') // Switch to live view immediately
        },
        async (err) => {
          console.warn('Initial GPS permission error:', err)
          if (err.code === 1) {
            alert('Location access is required to track the dog walk live for pet parents. Please allow location permissions in your browser settings.')
          } else {
            const patch = {
              status: WALKING_STATUS.IN_PROGRESS,
              walkStartedAt: serverTimestamp(),
              routeTrail: [],
              walkDistanceMeters: 0,
            }
            await updateDoc(doc(db, 'walkingBookings', booking.id), patch)
            setActiveWalkId(booking.id)
            setMainPortalTab('live')
          }
          setActionLoading(false)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    } catch (err) {
      alert(`Could not start walk: ${err.message}`)
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

      const patch = {
        status: WALKING_STATUS.COMPLETED,
        walkCompletedAt: serverTimestamp(),
        walkDurationSeconds: finalDuration,
        walkDistanceMeters: finalDistance,
        updatedAt: serverTimestamp(),
      }

      await updateDoc(doc(db, 'walkingBookings', activeWalk.id), patch)

      if (activeWalk.userId) {
        addDoc(collection(db, 'notifications'), {
          userId: activeWalk.userId,
          title: `🎉 ${activeWalk.dogName || activeWalk.petName || 'Your pet'}'s walk is completed!`,
          message: `Walk finished! Total time: ${formatDurationHuman(finalDuration)}, Distance: ${formatDistance(finalDistance)}.`,
          actionUrl: '/my-bookings?tab=walking',
          type: 'walking_completed',
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {})
      }

      setCompletionSuccess({
        dogName: activeWalk.dogName || activeWalk.petName || 'Dog',
        durationSec: finalDuration,
        distanceM: finalDistance,
        ownerPhone: activeWalk.phone || '',
      })

      setActiveWalkId('')
      setCompletingConfirm(false)
      setElapsedSeconds(0)
      setRouteTrail([])
      setTotalDistanceMeters(0)
    } catch (err) {
      alert(`Could not complete walk: ${err.message}`)
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

  // Group walks by category
  const categorizedWalks = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    const active = []
    const upcoming = []
    const completed = []

    walks.forEach(w => {
      if (w.status === WALKING_STATUS.IN_PROGRESS) {
        active.unshift(w)
      } else if (w.status === WALKING_STATUS.COMPLETED) {
        completed.push(w)
      } else {
        const walkDate = w.date || w.walkingDate || ''
        if (walkDate === todayStr || !walkDate) {
          active.push(w)
        } else if (walkDate > todayStr) {
          upcoming.push(w)
        } else {
          active.push(w)
        }
      }
    })

    return { active, upcoming, completed }
  }, [walks])

  // Recent 5 walks for the home/active screen
  const recentWalks = useMemo(() => {
    // Show active and upcoming walks, up to 5 items max
    const combined = [...categorizedWalks.active, ...categorizedWalks.upcoming]
    return combined.slice(0, 5)
  }, [categorizedWalks])

  // Reusable Walk Card Renderer
  const renderWalkCard = (w) => {
    const isThisActive = w.status === WALKING_STATUS.IN_PROGRESS
    const isCompleted = w.status === WALKING_STATUS.COMPLETED
    const mapLink = w.mapPinUrl || (w.lat && w.lng ? `https://www.google.com/maps?q=${w.lat},${w.lng}` : '')

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

          <span className={`badge ${isThisActive ? 'badge-confirmed' : isCompleted ? 'badge-completed' : 'badge-pending'}`} style={{ fontSize: '11px' }}>
            {isThisActive ? '🟢 In Progress' : isCompleted ? 'Completed' : (WALKING_STATUS_LABELS[w.status] || 'Scheduled')}
          </span>
        </div>

        <div style={{ background: 'var(--surface, #F7F2E7)', borderRadius: '12px', padding: '10px 12px', marginBottom: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text, #221711)' }}>
            <Calendar size={13} color="var(--accent, #C08820)" />
            <strong>{w.date || w.walkingDate || 'Today'}</strong>
            <span style={{ color: 'var(--muted, #7E7067)' }}>·</span>
            <Clock size={13} color="var(--accent, #C08820)" />
            <strong>{w.slot || w.walkingSlot || '-'}</strong>
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

        {/* Action Button: Start Walk */}
        {!isCompleted && !isThisActive && (
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
            }}
          >
            <Play size={15} fill="currentColor" />
            {activeWalkId ? 'Another Walk Is Currently Active' : 'Start This Dog Walk'}
          </button>
        )}

        {isCompleted && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted, #7E7067)', paddingTop: '4px' }}>
            <span>⏱️ {formatDurationHuman(w.walkDurationSeconds || 1800)}</span>
            <span>🚶‍♂️ {formatDistance(w.walkDistanceMeters || 1000)}</span>
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
      
      {/* Top Walker Header Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(252, 250, 246, 0.96)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--border, #F0EAE1)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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
            <div style={{ fontSize: '11px', color: 'var(--muted, #7E7067)' }}>
              {currentWalker.phone || 'Paw Paw Partner'}
            </div>
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
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e', padding: '5px 12px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 800, color: '#4ade80' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', animation: 'pawpaw-gps-pulse 1.5s infinite' }} />
                    WALK IN PROGRESS · LIVE GPS
                  </div>

                  {gpsAccuracy !== null && (
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ShieldCheck size={13} color="#4ade80" /> GPS accuracy: ±{gpsAccuracy}m
                    </div>
                  )}
                </div>

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

                {/* Live Stats */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '16px',
                    padding: '14px 16px',
                    marginBottom: '16px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                      Elapsed Walk Time
                    </span>
                    <div style={{ fontSize: '28px', fontWeight: 900, color: '#fff', letterSpacing: '-1px', fontFamily: 'monospace' }}>
                      {formatDurationMMSS(elapsedSeconds)}
                    </div>
                    <span style={{ fontSize: '11px', color: '#D49B2E', fontWeight: 700 }}>
                      Target: {activeWalk.duration || 30} Mins
                    </span>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                      Distance Walked
                    </span>
                    <div style={{ fontSize: '28px', fontWeight: 900, color: '#4ade80', letterSpacing: '-1px', fontFamily: 'monospace' }}>
                      {formatDistance(totalDistanceMeters)}
                    </div>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                      {routeTrail.length} GPS trail points
                    </span>
                  </div>
                </div>

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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 900, color: 'var(--text, #221711)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={16} color="var(--accent, #C08820)" /> Upcoming Walks (Recent {Math.min(5, recentWalks.length)})
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
                    No upcoming walks scheduled
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted, #7E7067)', marginTop: '2px' }}>
                    New walks assigned by Paw Paw admin will appear here automatically.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {recentWalks.map(renderWalkCard)}

                  {walks.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setMainPortalTab('all_walks')}
                      className="btn btn-secondary"
                      style={{
                        width: '100%',
                        padding: '11px',
                        fontSize: '13px',
                        fontWeight: 800,
                        marginTop: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>View All {walks.length} Assigned Walks</span>
                      <ChevronRight size={15} />
                    </button>
                  )}
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
                Today & Active ({categorizedWalks.active.length})
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
                Upcoming ({categorizedWalks.upcoming.length})
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
            </div>

            {/* Walks list */}
            {loadingWalks ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted, #7E7067)' }}>
                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
                <div>Loading walks...</div>
              </div>
            ) : categorizedWalks[activeTab].length === 0 ? (
              <div style={{ background: 'var(--card, #fff)', borderRadius: '18px', padding: '32px 20px', textAlign: 'center', border: '1.5px dashed var(--border, #F0EAE1)' }}>
                <Footprints size={32} color="var(--muted, #7E7067)" style={{ marginBottom: '8px', opacity: 0.5 }} />
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text, #221711)', marginBottom: '4px' }}>
                  No walks in this tab
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted, #7E7067)' }}>
                  {activeTab === 'active' ? 'You have no pending walks scheduled for today.' : activeTab === 'upcoming' ? 'No future walks assigned yet.' : 'No completed walks logged yet.'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {categorizedWalks[activeTab].map(renderWalkCard)}
              </div>
            )}
          </div>
        )}

        {/* Walk Completed Celebration Popup */}
        {completionSuccess && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: 'var(--card, #fff)', maxWidth: '420px', width: '100%', borderRadius: '24px', padding: '24px', textAlign: 'center', border: '1.5px solid var(--border, #F0EAE1)', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <CheckCircle size={36} />
              </div>

              <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text, #221711)', margin: '0 0 6px' }}>
                Walk Completed! 🎉
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--muted, #7E7067)', margin: '0 0 16px' }}>
                Great walk with <strong>{completionSuccess.dogName}</strong>! All live route data has been saved.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--surface, #F7F2E7)', borderRadius: '14px', padding: '12px', marginBottom: '18px', textAlign: 'center' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted, #7E7067)', display: 'block' }}>Total Time</span>
                  <strong style={{ fontSize: '16px', color: 'var(--text, #221711)' }}>{formatDurationHuman(completionSuccess.durationSec)}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--muted, #7E7067)', display: 'block' }}>Distance</span>
                  <strong style={{ fontSize: '16px', color: 'var(--accent, #C08820)' }}>{formatDistance(completionSuccess.distanceM)}</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCompletionSuccess(null)}
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '13.5px', padding: '11px' }}
              >
                Back to Schedule
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
