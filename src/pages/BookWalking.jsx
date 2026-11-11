// src/pages/BookWalking.jsx
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, addDoc, getDocs, getDoc, query, where, serverTimestamp, doc, setDoc } from 'firebase/firestore'
import { format, addDays, startOfToday } from 'date-fns'
import { ADMIN_EMAIL, db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import { fetchBusinessInfo } from '../utils/businessInfo'
import {
  fetchWalkingSettings,
  DEFAULT_WALKING_SETTINGS,
  isWalkingDayOpen,
  parseSlotTimeToMinutes,
  buildWalkingWhatsAppMessage,
  WALKING_STATUS,
} from '../utils/walkingSettings'
import {
  ArrowRight,
  Calendar,
  Check,
  CheckCircle,
  ChevronLeft,
  Clock,
  Compass,
  Dog,
  Footprints,
  Hourglass,
  IndianRupee,
  Info,
  MapPin,
  MessageCircle,
  Phone,
  ShieldAlert,
  Sparkles,
  User,
  X,
} from 'lucide-react'

export default function BookWalking() {
  const { user, isBlocked } = useAuth()
  const { sendNotification } = useNotifications() || {}
  const navigate = useNavigate()
  const topRef = useRef(null)

  const [step, setStep] = useState(1) // 1: Dog & Address, 2: Duration & Slots, 3: Review & Submit
  const [settings, setSettings] = useState(DEFAULT_WALKING_SETTINGS)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [pets, setPets] = useState([])
  const [selectedPetId, setSelectedPetId] = useState('')
  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState('')
  const [shopName, setShopName] = useState('Paw Paw Pet Grooming')
  const [bookedSlotsForDate, setBookedSlotsForDate] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [hasProfilePhone, setHasProfilePhone] = useState(true)
  const [savePhoneToProfile, setSavePhoneToProfile] = useState(true)
  const [showCustomTimeInput, setShowCustomTimeInput] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedBooking, setSubmittedBooking] = useState(null)
  const [toastMessage, setToastMessage] = useState('')

  const todayStr = format(startOfToday(), 'yyyy-MM-dd')
  const tomorrowStr = format(addDays(startOfToday(), 1), 'yyyy-MM-dd')

  const [form, setForm] = useState({
    // Dog Info
    dogName: '',
    breed: '',
    age: '',
    behaviorNotes: '',
    // Location Info
    pickupAddress: '',
    area: 'Dhayari',
    landmark: '',
    // Booking Details
    duration: 30, // 30 | 45 | 60
    date: tomorrowStr,
    slot: '',
    customTimeRequested: '',
    notes: '',
    // Contact Info
    ownerName: user?.displayName || '',
    phone: '',
    whatsappNumber: '',
    emergencyContact: '',
  })

  // Scroll to top on step change or submission
  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [step, submittedBooking])

  // Fetch settings & business info
  useEffect(() => {
    async function loadData() {
      try {
        const [wSettings, biz] = await Promise.all([
          fetchWalkingSettings(db),
          fetchBusinessInfo(db),
        ])
        setSettings(wSettings)
        if (biz) {
          setAdminWhatsappNumber(biz.whatsappNumber || '')
          setShopName(biz.contact?.shopName || 'Paw Paw Pet Grooming')
        }
      } catch (err) {
        console.warn('Failed to load walking config:', err)
      } finally {
        setLoadingSettings(false)
      }
    }
    loadData()
  }, [])

  // Load user profile & saved pets
  useEffect(() => {
    if (!user?.uid) return

    async function loadProfileAndPets() {
      try {
        const [profSnap, petsSnap] = await Promise.all([
          getDoc(doc(db, 'profiles', user.uid)),
          getDocs(query(collection(db, 'pets'), where('userId', '==', user.uid))),
        ])

        if (profSnap.exists()) {
          const pData = profSnap.data()
          const existingPhone = String(pData.phone || '').trim()
          setHasProfilePhone(Boolean(existingPhone))
          setForm(prev => ({
            ...prev,
            ownerName: prev.ownerName || pData.name || user.displayName || '',
            phone: prev.phone || existingPhone,
            pickupAddress: prev.pickupAddress || pData.address || '',
          }))
        }

        const dogList = petsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => !p.type || p.type.toLowerCase() === 'dog')
        setPets(dogList)

        if (dogList.length === 1) {
          applyPet(dogList[0])
        }
      } catch (err) {
        console.warn('Failed to load profile/pets:', err)
      }
    }

    loadProfileAndPets()
  }, [user])

  // Fetch booked walking slots for selected date to prevent double bookings
  useEffect(() => {
    if (!form.date) return
    let cancelled = false
    setLoadingSlots(true)

    async function checkBookedSlots() {
      try {
        const q = query(
          collection(db, 'walkingBookings'),
          where('date', '==', form.date)
        )
        const snap = await getDocs(q)
        if (cancelled) return

        const counts = {}
        snap.docs.forEach(docSnap => {
          const d = docSnap.data()
          if (d.status !== WALKING_STATUS.CANCELLED && d.slot) {
            counts[d.slot] = (counts[d.slot] || 0) + 1
          }
        })

        const maxCap = settings.maxCapacityPerSlot || 2
        const fullSlots = Object.entries(counts)
          .filter(([, count]) => count >= maxCap)
          .map(([slot]) => slot)

        setBookedSlotsForDate(fullSlots)
      } catch (err) {
        console.warn('Slot availability query failed:', err)
      } finally {
        if (!cancelled) setLoadingSlots(false)
      }
    }

    checkBookedSlots()
    return () => { cancelled = true }
  }, [form.date, settings.maxCapacityPerSlot])

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const applyPet = (pet) => {
    setSelectedPetId(pet.id)
    setForm(prev => ({
      ...prev,
      dogName: pet.name || '',
      breed: pet.breed || '',
      age: pet.dob || pet.age || '',
      behaviorNotes: pet.notes || pet.behaviorNotes || prev.behaviorNotes || '',
    }))
  }

  const durationPrice = () => {
    if (form.duration === 60) return settings.rate60Min || 349
    if (form.duration === 45) return settings.rate45Min || 279
    return settings.rate30Min || 199
  }

  const isToday = form.date === todayStr
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
  const isDayOpen = isWalkingDayOpen(settings, form.date)

  const handleStep1Continue = () => {
    if (!form.dogName.trim()) {
      alert('Please enter your dog\'s name.')
      return
    }
    if (!form.pickupAddress.trim()) {
      alert('Please enter complete pick-up address.')
      return
    }
    if (savePhoneToProfile && user?.uid && form.phone.trim()) {
      const cleanPhone = form.phone.replace(/\D/g, '').slice(0, 10)
      setDoc(doc(db, 'profiles', user.uid), {
        phone: cleanPhone,
        address: form.pickupAddress.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {})
    }
    setStep(2)
  }

  const handleStep2Continue = () => {
    if (!isDayOpen) {
      alert('Pet Walking is closed on this day. Please choose another date.')
      return
    }
    if (!form.slot && !form.customTimeRequested.trim()) {
      alert('Please choose a walking time slot or specify a custom time.')
      return
    }
    setStep(3)
  }

  const handleSubmit = async () => {
    if (isBlocked) {
      alert('Your account is blocked from booking. Please contact admin.')
      return
    }
    if (!form.ownerName.trim() || !form.phone.trim()) {
      alert('Please provide your name and contact phone number.')
      return
    }

    setSubmitting(true)
    try {
      const price = durationPrice()
      const cleanPhone = form.phone.replace(/\D/g, '').slice(0, 10)

      const bookingData = {
        userId: user?.uid || '',
        userEmail: user?.email || '',
        ownerName: form.ownerName.trim(),
        phone: cleanPhone,
        whatsappNumber: form.whatsappNumber.trim() || cleanPhone,
        emergencyContact: form.emergencyContact.trim(),
        dogName: form.dogName.trim(),
        petName: form.dogName.trim(),
        breed: form.breed.trim(),
        petBreed: form.breed.trim(),
        age: form.age.trim(),
        petAge: form.age.trim(),
        petId: selectedPetId || '',
        behaviorNotes: form.behaviorNotes.trim(),
        pickupAddress: form.pickupAddress.trim(),
        address: form.pickupAddress.trim(),
        area: form.area,
        landmark: form.landmark.trim(),
        duration: Number(form.duration),
        durationMinutes: Number(form.duration),
        date: form.date,
        walkingDate: form.date,
        slot: form.slot || (form.customTimeRequested ? `Custom: ${form.customTimeRequested.trim()}` : 'Custom Timing'),
        walkingSlot: form.slot || (form.customTimeRequested ? `Custom: ${form.customTimeRequested.trim()}` : 'Custom Timing'),
        customTimeRequested: form.customTimeRequested.trim(),
        notes: form.notes.trim(),
        walkerInstructions: form.notes.trim(),
        totalPrice: price,
        status: WALKING_STATUS.PENDING,
        serviceType: 'walking',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      const ref = await addDoc(collection(db, 'walkingBookings'), bookingData)
      const finalDoc = { id: ref.id, ...bookingData }
      setSubmittedBooking(finalDoc)

      // Save phone to profile if selected
      if (savePhoneToProfile && user?.uid && cleanPhone) {
        setDoc(doc(db, 'profiles', user.uid), {
          phone: cleanPhone,
          address: form.pickupAddress.trim(),
          updatedAt: serverTimestamp(),
        }, { merge: true }).catch(() => {})
      }

      // Notify Admin
      try {
        if (sendNotification) {
          const timingLabel = form.slot || form.customTimeRequested || 'Custom Timing'
          await sendNotification('', {
            userEmail: ADMIN_EMAIL || '',
            toAdmin: true,
            title: `🐕 New Pet Walk Request: ${form.dogName}`,
            message: `${form.dogName} (${form.duration}m walk) on ${form.date} at ${timingLabel} in ${form.area} by ${form.ownerName}`,
            type: 'walking_request',
            bookingId: ref.id,
            actionUrl: `/admin/walking`,
          })
        }
      } catch (notifErr) {
        console.warn('Admin walking notification dispatch error:', notifErr)
      }

      setToastMessage('Walking request submitted successfully!')
    } catch (err) {
      console.error('Walking submission error:', err)
      alert(err.message || 'Could not submit walking request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  // SUCCESS CONFIRMATION SCREEN (Redesigned luxury confirmation)
  // ─────────────────────────────────────────────────────────────────────────────
  if (submittedBooking) {
    const waUrl = adminWhatsappNumber
      ? `https://wa.me/${adminWhatsappNumber.replace(/\D/g, '')}?text=${buildWalkingWhatsAppMessage(submittedBooking, shopName)}`
      : '#'

    return (
      <div className="page-wrapper" ref={topRef} style={{ background: 'var(--bg)', minHeight: '100vh', padding: '32px 14px 80px', overflowX: 'hidden' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto', width: '100%' }}>
          
          {/* Hero Section with Sunburst Radiance */}
          <div style={{ textAlign: 'center', marginBottom: '22px' }}>
            <div style={{ position: 'relative', width: '92px', height: '92px', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <line x1="50" y1="4" x2="50" y2="13" stroke="#E2B768" strokeWidth="3" strokeLinecap="round" />
                <line x1="75" y1="14" x2="69" y2="22" stroke="#E2B768" strokeWidth="3" strokeLinecap="round" />
                <line x1="88" y1="36" x2="79" y2="40" stroke="#E2B768" strokeWidth="3" strokeLinecap="round" />
                <line x1="25" y1="14" x2="31" y2="22" stroke="#E2B768" strokeWidth="3" strokeLinecap="round" />
                <line x1="12" y1="36" x2="21" y2="40" stroke="#E2B768" strokeWidth="3" strokeLinecap="round" />
              </svg>

              <div style={{ position: 'absolute', left: '-10px', top: '16px', opacity: 0.75, transform: 'rotate(-20deg)' }}>
                <Footprints size={18} color="#DEC49C" />
              </div>
              <div style={{ position: 'absolute', right: '-10px', top: '16px', opacity: 0.75, transform: 'rotate(20deg)' }}>
                <Footprints size={18} color="#DEC49C" />
              </div>

              <div style={{ width: '62px', height: '62px', borderRadius: '50%', background: '#DCFCE7', border: '3px solid #16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(22, 163, 74, 0.22)' }}>
                <Check size={30} strokeWidth={3.5} color="#16A34A" />
              </div>
            </div>

            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: 800, color: 'var(--text)', margin: '0 0 8px', letterSpacing: '-0.2px' }}>
              Dog Walk Request Submitted!
            </h1>
            <p style={{ fontSize: '13.5px', lineHeight: 1.55, color: 'var(--muted)', maxWidth: '440px', margin: '0 auto' }}>
              Thank you, <strong>{submittedBooking.ownerName}</strong>! Your pet walking request for <strong>{submittedBooking.dogName}</strong> has been received. Our team will verify walker availability and confirm your walk shortly.
            </p>
          </div>

          {/* Booking Summary Card */}
          <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: '20px', padding: '20px 18px 16px', margin: '0 auto 20px', boxShadow: '0 8px 30px rgba(0,0,0,0.06)', textAlign: 'left' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', marginBottom: '4px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--accent-bg)', border: '1.2px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                  <Calendar size={16} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                  WALK BOOKING SUMMARY
                </span>
              </div>
              <span style={{ background: 'var(--accent-bg)', border: '1.2px solid var(--accent-border)', color: 'var(--accent)', fontWeight: 800, fontSize: '12px', letterSpacing: '0.6px', padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                #{submittedBooking.id ? submittedBooking.id.slice(0, 8).toUpperCase() : 'PENDING'}
              </span>
            </div>

            {/* 1. Pet Name */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <Dog size={15} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>Pet Name</span>
              </div>
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text)', textAlign: 'right' }}>
                {submittedBooking.dogName?.toUpperCase()} {submittedBooking.breed ? `(${submittedBooking.breed})` : ''}
              </span>
            </div>

            {/* 2. Walk Date & Slot */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <Calendar size={15} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>Walk Schedule</span>
              </div>
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text)', textAlign: 'right' }}>
                {submittedBooking.date} · {submittedBooking.slot}
              </span>
            </div>

            {/* 3. Duration */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <Clock size={15} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>Duration</span>
              </div>
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text)', textAlign: 'right' }}>
                {submittedBooking.duration} Minutes
              </span>
            </div>

            {/* 4. Pick-up Area & Address */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <MapPin size={15} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>Pick-Up Location</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text)' }}>
                  {submittedBooking.area}
                </div>
                {submittedBooking.address && (
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px', maxWidth: '220px', lineHeight: 1.35 }}>
                    {submittedBooking.address}
                  </div>
                )}
              </div>
            </div>

            {/* 5. Total Price */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <IndianRupee size={15} strokeWidth={2.4} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>Estimated Fee</span>
              </div>
              <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.3px', textAlign: 'right' }}>
                ₹{submittedBooking.totalPrice}
              </span>
            </div>

            {/* 6. Status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0 4px', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <Hourglass size={15} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>Status</span>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--accent-bg)', border: '1.2px solid var(--accent-border)', color: 'var(--accent)', padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                <Hourglass size={12} strokeWidth={2.5} />
                <span>Pending Confirmation</span>
              </div>
            </div>
          </div>

          {/* Luxury Info Notice */}
          <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '14px', padding: '14px 16px', marginBottom: '20px', textAlign: 'left', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <Info size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '12.5px', color: 'var(--text)', margin: 0, lineHeight: 1.45 }}>
              Our team will verify walker availability in {submittedBooking.area} and confirm your appointment. No advance online payment is required; pay directly upon walk completion.
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '480px', margin: '0 auto' }}>
            {adminWhatsappNumber && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: '#00A859',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  width: '100%',
                  height: '50px',
                  borderRadius: '14px',
                  fontSize: '15px',
                  fontWeight: 700,
                  textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(0, 168, 89, 0.28)',
                  border: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box'
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.888 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.711 1.457h.004c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.483-8.413z" />
                </svg>
                <span>Send Details on WhatsApp</span>
                <ArrowRight size={18} strokeWidth={2.4} style={{ marginLeft: 2 }} />
              </a>
            )}

            <button
              type="button"
              onClick={() => navigate('/my-bookings?tab=walking', { state: { tab: 'walking', domainTab: 'walking' } })}
              style={{
                background: 'var(--card)',
                border: '1.5px solid var(--accent-border)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                height: '50px',
                borderRadius: '14px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                boxSizing: 'border-box'
              }}
            >
              <span>View My Bookings</span>
              <ArrowRight size={18} strokeWidth={2.4} style={{ marginLeft: 2 }} />
            </button>

            <button
              type="button"
              onClick={() => {
                setSubmittedBooking(null)
                setStep(1)
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '8px 0',
                textDecoration: 'underline'
              }}
            >
              Book Another Walk
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MAIN BOOKING FORM
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="page-wrapper" ref={topRef} style={{ background: 'var(--bg)', minHeight: '100vh', padding: '24px 12px 80px', overflowX: 'hidden' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>

        {/* Back Link & Header */}
        <div style={{ marginBottom: '18px' }}>
          <Link
            to="/services"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--muted)', fontSize: '13px', textDecoration: 'none', marginBottom: '12px' }}
          >
            <ChevronLeft size={16} /> Back to Services
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ width: '38px', height: '38px', borderRadius: '12px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
              <Dog size={20} />
            </span>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                Book Pet Walking
              </h1>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                📍 Dhayari & Nearby Areas · Paw Paw Pet Services
              </span>
            </div>
          </div>
        </div>

        {/* Closed banner if service disabled */}
        {settings.acceptBookings === false && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '14px', padding: '14px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={18} />
            <div style={{ fontSize: '13px' }}>
              <strong>Pet Walking Temporarily Paused:</strong> We are currently not accepting new walk bookings online. Please contact admin on WhatsApp for enquiries.
            </div>
          </div>
        )}

        {/* Progress Stepper - Compact & Responsive */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '6px',
          marginBottom: '20px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {[
            { num: 1, label: 'Dog & Area' },
            { num: 2, label: 'Schedule' },
            { num: 3, label: 'Review' },
          ].map(s => {
            const isActive = step === s.num
            const isDone = step > s.num
            return (
              <div
                key={s.num}
                onClick={() => {
                  if (s.num < step) setStep(s.num)
                }}
                style={{
                  background: isActive ? 'var(--accent-bg)' : 'var(--surface)',
                  border: `1.5px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '10px',
                  padding: '7px 4px',
                  textAlign: 'center',
                  cursor: s.num < step ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                  minWidth: 0,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{
                  fontSize: '9.5px',
                  fontWeight: 800,
                  letterSpacing: '0.4px',
                  color: isActive ? 'var(--accent)' : isDone ? 'var(--text)' : 'var(--muted)',
                  lineHeight: 1.1
                }}>
                  STEP {s.num}
                </div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: isActive ? 'var(--accent)' : 'var(--text)',
                  lineHeight: 1.25,
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {s.label}
                </div>
              </div>
            )
          })}
        </div>

        {/* =========================================================================
            STEP 1: DOG DETAILS & PICK-UP ADDRESS
           ========================================================================= */}
        {step === 1 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: 'clamp(14px, 4vw, 22px)', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', width: '100%', boxSizing: 'border-box' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Dog size={18} color="var(--accent)" /> Dog Details
            </h2>

            {/* Saved Pets Quick-Select */}
            {pets.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                  CHOOSE SAVED PET
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {pets.map(p => {
                    const isSelected = selectedPetId === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPet(p)}
                        style={{
                          background: isSelected ? 'var(--accent-bg)' : 'var(--surface)',
                          border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                          color: isSelected ? 'var(--accent)' : 'var(--text)',
                          borderRadius: '10px',
                          padding: '6px 12px',
                          fontSize: '12.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Dog size={14} /> {p.name} {p.breed ? `(${p.breed})` : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>Dog Name *</label>
                <input
                  className="input"
                  placeholder="e.g. Bruno"
                  value={form.dogName}
                  onChange={e => { setSelectedPetId(''); update('dogName', e.target.value) }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>Breed (optional)</label>
                <input
                  className="input"
                  placeholder="e.g. Golden Retriever"
                  value={form.breed}
                  onChange={e => update('breed', e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>
                Dog Behavior / Walking Habits (optional)
              </label>
              <input
                className="input"
                placeholder="e.g. Friendly, pulls on leash, reactive to other dogs, needs harness"
                value={form.behaviorNotes}
                onChange={e => update('behaviorNotes', e.target.value)}
              />
            </div>

            <hr style={{ borderColor: 'var(--border)', margin: '20px 0' }} />

            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={18} color="var(--accent)" /> Pick-up Location
            </h2>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>
                Serviceable Area / Locality *
              </label>
              <select
                className="input"
                value={form.area}
                onChange={e => update('area', e.target.value)}
              >
                {settings.serviceableAreas.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                📍 Initially serving Dhayari and nearby localities for prompt walker arrival.
              </span>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>
                Complete Address (Flat / House No., Society / Building) *
              </label>
              <textarea
                className="input"
                rows={2}
                placeholder="e.g. Flat 402, B Wing, Green Acres, DSK Vishwa Road, Dhayari"
                value={form.pickupAddress}
                onChange={e => update('pickupAddress', e.target.value)}
                style={{ resize: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>
                Landmark (optional)
              </label>
              <input
                className="input"
                placeholder="e.g. Near Dhayari Maruti Mandir"
                value={form.landmark}
                onChange={e => update('landmark', e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={handleStep1Continue}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '12px' }}
            >
              Continue to Duration & Timing <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* =========================================================================
            STEP 2: DURATION, DATES & TIME SLOTS
           ========================================================================= */}
        {step === 2 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: 'clamp(14px, 4vw, 22px)', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', width: '100%', boxSizing: 'border-box' }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: 0, marginBottom: '14px' }}
            >
              <ChevronLeft size={16} /> Back to Dog Info
            </button>

            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} color="var(--accent)" /> Select Walking Duration
            </h2>

            {/* Duration Selector Buttons with Live Pricing */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '22px', width: '100%', boxSizing: 'border-box' }}>
              {[
                { mins: 30, rate: settings.rate30Min || 199, desc: 'Quick walk' },
                { mins: 45, rate: settings.rate45Min || 279, desc: 'Sniff walk' },
                { mins: 60, rate: settings.rate60Min || 349, desc: 'Full workout' },
              ].map(opt => {
                const isSelected = form.duration === opt.mins
                return (
                  <button
                    key={opt.mins}
                    type="button"
                    onClick={() => update('duration', opt.mins)}
                    style={{
                      background: isSelected ? 'var(--accent-bg)' : 'var(--surface)',
                      border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '12px',
                      padding: '10px 4px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                      minWidth: 0,
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ fontSize: '15px', fontWeight: 800, color: isSelected ? 'var(--accent)' : 'var(--text)', marginBottom: '2px' }}>
                      {opt.mins} Mins
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--accent)', marginBottom: '4px' }}>
                      ₹{opt.rate}
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'var(--muted)', lineHeight: 1.25 }}>
                      {opt.desc}
                    </div>
                  </button>
                )
              })}
            </div>

            <hr style={{ borderColor: 'var(--border)', margin: '20px 0' }} />

            {/* Preferred Walking Date */}
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} color="var(--accent)" /> Walking Date
            </h2>

            <div style={{ marginBottom: '18px' }}>
              <input
                type="date"
                className="input"
                min={todayStr}
                value={form.date}
                onChange={e => {
                  update('date', e.target.value)
                  update('slot', '')
                }}
              />
              {!isDayOpen && (
                <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px', display: 'block', fontWeight: 600 }}>
                  ⚠️ Paw Paw is closed for dog walking on this day. Please select another day.
                </span>
              )}
            </div>

            {/* Time Slots Grid */}
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Footprints size={18} color="var(--accent)" /> Available Walk Slots
              </span>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>
                {loadingSlots ? 'Checking slots...' : `${bookedSlotsForDate.length} slot(s) full`}
              </span>
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '16px' }}>
              {settings.slots.map(s => {
                const isSelected = form.slot === s
                const isFull = bookedSlotsForDate.includes(s)
                const slotMins = parseSlotTimeToMinutes(s)
                const isPast = isToday && slotMins <= nowMins + 30
                const disabled = !isDayOpen || isFull || isPast

                return (
                  <button
                    key={s}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      update('slot', s)
                      setShowCustomTimeInput(false)
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
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {s}
                    {isFull && (
                      <span style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: '#ef4444', marginTop: '2px' }}>Full</span>
                    )}
                    {isPast && (
                      <span style={{ display: 'block', fontSize: '9px', fontWeight: 600, color: 'var(--muted)', marginTop: '2px' }}>Passed</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Custom Timing Option */}
            <div style={{ marginBottom: '24px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '12px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>
                  Can't find a suitable slot?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = !showCustomTimeInput
                    setShowCustomTimeInput(next)
                    if (next) update('slot', '')
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                >
                  {showCustomTimeInput ? 'Use standard slots' : '+ Request Custom Time'}
                </button>
              </div>

              {showCustomTimeInput && (
                <div style={{ marginTop: '10px' }}>
                  <input
                    className="input"
                    placeholder="e.g. Prefer 02:30 PM afternoon walk"
                    value={form.customTimeRequested}
                    onChange={e => update('customTimeRequested', e.target.value)}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                    Admin will review walker availability for this custom time before confirming.
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleStep2Continue}
              disabled={!isDayOpen || (!form.slot && !form.customTimeRequested.trim())}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '12px' }}
            >
              Continue to Review <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* =========================================================================
            STEP 3: CONTACT DETAILS & REVIEW SUBMIT
           ========================================================================= */}
        {step === 3 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: 'clamp(14px, 4vw, 22px)', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', width: '100%', boxSizing: 'border-box' }}>
            <button
              type="button"
              onClick={() => setStep(2)}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: 0, marginBottom: '14px' }}
            >
              <ChevronLeft size={16} /> Back to Slots
            </button>

            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="var(--accent)" /> Contact Information
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>Your Name *</label>
                <input
                  className="input"
                  placeholder="Full name"
                  value={form.ownerName}
                  onChange={e => update('ownerName', e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>Phone Number *</label>
                <input
                  className="input"
                  placeholder="10-digit number"
                  maxLength={10}
                  value={form.phone}
                  onChange={e => update('phone', e.target.value.replace(/\D/g, ''))}
                />
                {!hasProfilePhone && user?.uid && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '11.5px', color: 'var(--muted)', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={savePhoneToProfile}
                      onChange={e => setSavePhoneToProfile(e.target.checked)}
                      style={{ accentColor: 'var(--accent)', cursor: 'pointer', width: '13px', height: '13px' }}
                    />
                    <span>Save to profile</span>
                  </label>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>WhatsApp (if different)</label>
                <input
                  className="input"
                  placeholder="Optional"
                  maxLength={10}
                  value={form.whatsappNumber}
                  onChange={e => update('whatsappNumber', e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>Emergency Contact (optional)</label>
                <input
                  className="input"
                  placeholder="Name / number"
                  value={form.emergencyContact}
                  onChange={e => update('emergencyContact', e.target.value)}
                />
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '4px' }}>Special Instructions for Walker (optional)</label>
              <textarea
                className="input"
                rows={2}
                placeholder="e.g. Ring doorbell, leash is kept by the front shoe rack, please wipe paws before re-entering"
                value={form.notes}
                onChange={e => update('notes', e.target.value)}
                style={{ resize: 'none' }}
              />
            </div>

            {/* Review Summary Card */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--accent-border)', borderRadius: '16px', padding: '16px 18px', marginBottom: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                  🐕 {form.dogName} {form.breed ? `(${form.breed})` : ''}
                </span>
                <span style={{ fontSize: '15px', fontWeight: 900, color: 'var(--accent)' }}>
                  ₹{durationPrice()}
                </span>
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--muted)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div><strong>Duration:</strong> {form.duration} Minutes</div>
                <div><strong>Time:</strong> {form.slot || form.customTimeRequested}</div>
                <div><strong>Date:</strong> {form.date}</div>
                <div><strong>Area:</strong> {form.area}</div>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '8px', borderTop: '1px dashed var(--border)', paddingTop: '6px' }}>
                <strong>Pick-up:</strong> {form.pickupAddress}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !form.ownerName.trim() || !form.phone.trim()}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '14px', fontSize: '15px' }}
            >
              {submitting ? 'Submitting Request...' : `Request Dog Walk (Pay ₹${durationPrice()} Later)`}
            </button>
            <span style={{ display: 'block', textAlign: 'center', fontSize: '11.5px', color: 'var(--muted)', marginTop: '8px' }}>
              No advance payment needed. Admin will confirm your walking schedule shortly.
            </span>
          </div>
        )}

      </div>
    </div>
  )
}

