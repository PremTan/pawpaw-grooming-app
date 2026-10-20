// src/pages/BookBoarding.jsx
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, getDoc } from 'firebase/firestore'
import { format, addDays, startOfToday } from 'date-fns'
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Calendar,
  CalendarCheck,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Coins,
  FileText,
  Heart,
  Home,
  Hourglass,
  IndianRupee,
  Info,
  MessageCircle,
  PawPrint,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  User,
  Utensils,
  X,
} from 'lucide-react'
import { ADMIN_EMAIL, db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { CAT_BREEDS, DOG_BREEDS, PET_TYPES } from '../utils/services'
import {
  BOARDING_STATUS,
  FEEDING_FREQUENCIES,
  FOOD_PROVIDERS,
  FOOD_TYPES,
  TIME_SLOT_OPTIONS,
  WALKING_FREQUENCIES,
  buildBoardingWhatsAppMessage,
  calculateBoardingStay,
  fetchBoardingSettings,
  DEFAULT_BOARDING_TERMS,
  DEFAULT_BOARDING_TERMS_CLOSING,
} from '../utils/boardingSettings'
import { fetchBusinessInfo } from '../utils/businessInfo'
import Toast from '../components/Toast'

function formatReviewDate(dateStr, timeStr) {
  if (!dateStr) return '-'
  try {
    const parts = String(dateStr).split('-')
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      const formatted = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      return timeStr ? `${formatted} at ${timeStr}` : formatted
    }
  } catch { }
  return timeStr ? `${dateStr} at ${timeStr}` : dateStr
}

export default function BookBoarding() {
  const { user, isBlocked } = useAuth()
  const navigate = useNavigate()
  const bookingTopRef = useRef(null)

  const [step, setStep] = useState(1)
  const [pets, setPets] = useState([])
  const [selectedPetId, setSelectedPetId] = useState('')
  const [boardingSettings, setBoardingSettings] = useState(null)
  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState('')
  const [shopName, setShopName] = useState('Paw Paw Pet Grooming')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [bookingRef, setBookingRef] = useState(null)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsExpanded, setTermsExpanded] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)

  const todayStr = format(startOfToday(), 'yyyy-MM-dd')
  const tomorrowStr = format(addDays(startOfToday(), 1), 'yyyy-MM-dd')

  const [form, setForm] = useState({
    // Step 1: Pet Details
    ownerName: user?.displayName || '',
    phone: '',
    petName: '',
    petType: 'Dog',
    petBreed: '',
    customBreed: '',
    petDob: '',
    petWeight: '',
    petGender: 'Male',
    vaccinationStatus: 'Fully Vaccinated',
    vaccinationNotes: '',
    medicalConditions: '',
    allergies: '',
    medicines: '',

    // Step 2: Stay Details
    checkInDate: todayStr,
    checkInTime: '10:00 AM',
    checkOutDate: tomorrowStr,
    checkOutTime: '12:00 PM',

    // Step 3: Food and Feeding
    regularFoodIncluded: true,
    specialFoodRequired: false,
    specialFoodProvider: 'customer',
    foodType: 'Regular Food (Included)',
    foodProvider: 'Paw Paw (Regular Food Included)',
    feedingSchedule: 'Twice a day (Morning & Evening)',
    specialDietInstructions: '',
    waterInstructions: '',

    // Step 4: Additional Care
    walkingFrequency: '2 walks per day (Standard)',
    sleepingHabits: '',
    toiletHabits: 'Outdoor breaks',
    behaviorNotes: '',
    separationAnxiety: 'None / Mild',
    emergencyContactName: '',
    emergencyContactPhone: '',
    additionalInstructions: '',
  })

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step, done])

  useEffect(() => {
    async function init() {
      const [settings, biz] = await Promise.all([
        fetchBoardingSettings(db),
        fetchBusinessInfo(db),
      ])
      setBoardingSettings(settings)
      setAdminWhatsappNumber(biz.whatsappNumber || '')
      setShopName(biz.contact.shopName || 'Paw Paw Pet Grooming')
    }
    init()
  }, [])

  useEffect(() => {
    async function loadPets() {
      if (!user?.uid) return
      try {
        const q = query(collection(db, 'pets'), where('userId', '==', user.uid))
        const snap = await getDocs(q)
        const petList = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        petList.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        setPets(petList)
      } catch { }
    }
    loadPets()
  }, [user])

  useEffect(() => {
    async function loadProfile() {
      if (!user?.uid) return
      try {
        const snap = await getDoc(doc(db, 'profiles', user.uid))
        if (!snap.exists()) return
        const data = snap.data()
        setForm(prev => ({
          ...prev,
          ownerName: prev.ownerName || data.name || '',
          phone: prev.phone || data.phone || '',
        }))
      } catch { }
    }
    loadProfile()
  }, [user])

  const update = (key, val) => setForm(p => ({ ...p, [key]: val }))

  const breedOptions = form.petType === 'Dog' ? DOG_BREEDS : form.petType === 'Cat' ? CAT_BREEDS : []

  const applyPet = (pet) => {
    const breedList = pet.type === 'Dog' ? DOG_BREEDS : pet.type === 'Cat' ? CAT_BREEDS : []
    const isStandard = pet.breed && breedList.includes(pet.breed)
    setSelectedPetId(pet.id)
    setForm(prev => ({
      ...prev,
      petName: pet.name || '',
      petType: pet.type || 'Dog',
      petBreed: isStandard ? pet.breed : (breedList.length ? 'other' : ''),
      customBreed: isStandard ? '' : (pet.breed || ''),
      petDob: pet.dob || '',
      petWeight: pet.weight || '',
      petGender: pet.gender || 'Male',
      medicalConditions: '',
    }))
  }

  const stayCalculation = calculateBoardingStay(
    form.checkInDate,
    form.checkInTime,
    form.checkOutDate,
    form.checkOutTime,
    form.petType,
    boardingSettings
  )

  const handleSubmit = async () => {
    if (boardingSettings?.acceptBookings === false) {
      alert('Boarding reservations are temporarily closed. Please check back soon.')
      return
    }

    if (isBlocked) {
      alert('Your account is blocked from making reservations. Please contact Paw Paw support.')
      return
    }

    if (!stayCalculation.valid) {
      alert(stayCalculation.error || 'Please provide valid stay dates.')
      return
    }

    if (!form.petName || !form.ownerName || !form.phone) {
      alert('Please fill in all required pet and contact information.')
      return
    }

    if (!termsAccepted) {
      setToastType('error')
      setToastMessage('Please read and agree to the Pet Boarding Terms & Conditions to submit your request.')
      return
    }

    setLoading(true)
    try {
      const selectedPet = pets.find(p => p.id === selectedPetId)
      const finalBreed = form.customBreed || form.petBreed || ''

      const activeTerms = (boardingSettings?.terms && boardingSettings.terms.length > 0)
        ? boardingSettings.terms
        : DEFAULT_BOARDING_TERMS
      const activeClosing = boardingSettings?.termsClosingMessage || DEFAULT_BOARDING_TERMS_CLOSING

      const boardingData = {
        userId: user.uid,
        userEmail: user.email || '',
        ownerName: form.ownerName.trim(),
        phone: form.phone.trim(),
        emergencyContactName: form.emergencyContactName.trim(),
        emergencyContactPhone: form.emergencyContactPhone.trim(),

        // Pet Info
        petId: selectedPetId || '',
        petName: form.petName.trim(),
        petType: form.petType,
        petBreed: finalBreed,
        petPhotoUrl: selectedPet?.photoUrl || '',
        petDob: form.petDob || '',
        petWeight: form.petWeight || '',
        petGender: form.petGender || '',

        // Health & Vaccine
        vaccinationStatus: form.vaccinationStatus,
        vaccinationNotes: form.vaccinationNotes.trim(),
        medicalConditions: form.medicalConditions.trim(),
        allergies: form.allergies.trim(),
        medicines: form.medicines.trim(),

        // Stay Schedule
        checkInDate: form.checkInDate,
        checkInTime: form.checkInTime,
        checkOutDate: form.checkOutDate,
        checkOutTime: form.checkOutTime,
        stayDays: stayCalculation.days,
        stayNights: stayCalculation.nights,
        dailyRate: stayCalculation.dailyRate,
        estimatedTotal: stayCalculation.estimatedTotal,

        // Food & Diet
        regularFoodIncluded: true,
        specialFoodRequired: Boolean(form.specialFoodRequired),
        specialFoodProvider: form.specialFoodRequired ? (form.specialFoodProvider || 'customer') : 'none',
        foodType: form.specialFoodRequired ? 'Regular Food + Special Food' : 'Regular Food (Included)',
        foodProvider: form.specialFoodRequired
          ? (form.specialFoodProvider === 'pawpaw' ? 'Paw Paw will provide it' : 'Customer will provide the food')
          : 'Paw Paw (Regular Food Included)',
        feedingSchedule: form.feedingSchedule,
        foodAllergies: form.allergies.trim(),
        specialDietInstructions: form.specialDietInstructions.trim(),
        waterInstructions: form.waterInstructions.trim(),

        // Terms & Conditions Acceptance Snapshot
        termsAccepted: true,
        termsAcceptedAt: serverTimestamp(),
        termsSnapshot: activeTerms,
        termsClosingMessage: activeClosing,

        // Daily Care & Behavior
        walkingFrequency: form.petType === 'Dog' ? form.walkingFrequency : 'N/A',
        sleepingHabits: form.sleepingHabits.trim(),
        toiletHabits: form.toiletHabits.trim(),
        behaviorNotes: form.behaviorNotes.trim(),
        separationAnxiety: form.separationAnxiety,
        additionalInstructions: form.additionalInstructions.trim(),

        // Status & Metadata
        status: BOARDING_STATUS.PENDING,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      const ref = await addDoc(collection(db, 'boardingBookings'), boardingData)
      const savedDoc = { id: ref.id, ...boardingData }
      setBookingRef(savedDoc)

      // Notify Admin via notifications collection
      try {
        const settingsSnap = await getDoc(doc(db, 'settings', 'general'))
        const adminUid = settingsSnap.exists() ? settingsSnap.data().adminUid || '' : ''
        await addDoc(collection(db, 'notifications'), {
          userId: adminUid,
          userEmail: ADMIN_EMAIL,
          title: `New Pet Boarding Request: ${form.petName}`,
          message: `${form.petName} (${form.petType}) - ${stayCalculation.days} day(s) from ${form.checkInDate} to ${form.checkOutDate} by ${form.ownerName}`,
          type: 'boarding_request',
          bookingId: ref.id,
          actionUrl: `/admin/boarding`,
          read: false,
          createdAt: serverTimestamp(),
        })
      } catch { }

      setToastMessage('Boarding request sent successfully!')
      setDone(true)
    } catch (err) {
      alert(err.message || 'Failed to submit boarding request. Please try again.')
    }
    setLoading(false)
  }

  const selectedPet = pets.find(p => p.id === selectedPetId)
  const displayBreed = form.customBreed || form.petBreed || ''

  const whatsappLink = bookingRef
    ? (adminWhatsappNumber ? `https://wa.me/${adminWhatsappNumber}?text=${buildBoardingWhatsAppMessage(bookingRef, shopName)}` : '#')
    : '#'

  return (
    <div className="boarding-flow-page">
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}

      {/* Success view */}
      {done && bookingRef ? (
        <div ref={bookingTopRef} className="boarding-flow-container boarding-success-page">
          {/* Success Hero Header */}
          <div className="boarding-success-hero">
            {/* Soft decorative background paws */}
            <div className="boarding-success-bg-paw paw-tl" aria-hidden="true">
              <PawPrint size={32} />
            </div>
            <div className="boarding-success-bg-paw paw-tr" aria-hidden="true">
              <PawPrint size={32} />
            </div>
            <div className="boarding-success-bg-paw paw-far-l" aria-hidden="true">
              <PawPrint size={24} />
            </div>
            <div className="boarding-success-bg-paw paw-far-r" aria-hidden="true">
              <PawPrint size={24} />
            </div>

            {/* Green Success Badge with Gold Sunburst Radiance */}
            <div className="boarding-success-badge-wrap">
              <svg className="boarding-sunburst-rays" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <line x1="50" y1="4" x2="50" y2="13" stroke="#E2B768" strokeWidth="3" strokeLinecap="round" />
                <line x1="75" y1="14" x2="69" y2="22" stroke="#E2B768" strokeWidth="3" strokeLinecap="round" />
                <line x1="88" y1="36" x2="79" y2="40" stroke="#E2B768" strokeWidth="3" strokeLinecap="round" />
                <line x1="25" y1="14" x2="31" y2="22" stroke="#E2B768" strokeWidth="3" strokeLinecap="round" />
                <line x1="12" y1="36" x2="21" y2="40" stroke="#E2B768" strokeWidth="3" strokeLinecap="round" />
              </svg>

              <div className="boarding-badge-paw badge-paw-left" aria-hidden="true">
                <PawPrint size={22} color="#DEC49C" />
              </div>
              <div className="boarding-badge-paw badge-paw-right" aria-hidden="true">
                <PawPrint size={22} color="#DEC49C" />
              </div>

              <div className="boarding-success-circle-outer">
                <div className="boarding-success-circle-inner">
                  <Check size={26} strokeWidth={3.4} color="#16A34A" />
                </div>
              </div>
            </div>

            <h1 className="boarding-success-title">
              Boarding Request Submitted!
            </h1>
            <p className="boarding-success-subtitle">
              Thank you! Your pet boarding request has been received. Our team will review your stay requirements and confirm your pet’s stay shortly.
            </p>
          </div>

          {/* Booking Summary Card */}
          <div className="boarding-summary-card">
            {/* Card Header */}
            <div className="boarding-summary-card-header">
              <div className="boarding-summary-header-left">
                <div className="boarding-summary-header-icon">
                  <Calendar size={17} color="#B8860B" />
                </div>
                <span className="boarding-summary-header-title">BOOKING SUMMARY</span>
              </div>
              <span className="boarding-summary-badge-id">
                #{bookingRef?.id ? bookingRef.id.slice(0, 8).toUpperCase() : 'DZGSFWKF'}
              </span>
            </div>

            {/* 1. Pet Name */}
            <div className="boarding-summary-row">
              <div className="boarding-row-left">
                <div className="boarding-row-icon-wrap">
                  <PawPrint size={15} color="#A6731B" />
                </div>
                <span className="boarding-row-label">Pet Name</span>
              </div>
              <span className="boarding-row-value">
                {form.petName ? form.petName.toUpperCase() : 'PET'} ({form.petType || 'Pet'}{displayBreed ? ` · ${displayBreed}` : ''})
              </span>
            </div>

            {/* 2. Check-In */}
            <div className="boarding-summary-row">
              <div className="boarding-row-left">
                <div className="boarding-row-icon-wrap">
                  <Calendar size={15} color="#A6731B" />
                </div>
                <span className="boarding-row-label">Check-In</span>
              </div>
              <span className="boarding-row-value">
                {formatReviewDate(form.checkInDate, form.checkInTime)}
              </span>
            </div>

            {/* 3. Check-Out */}
            <div className="boarding-summary-row">
              <div className="boarding-row-left">
                <div className="boarding-row-icon-wrap">
                  <CalendarCheck size={15} color="#A6731B" />
                </div>
                <span className="boarding-row-label">Check-Out</span>
              </div>
              <span className="boarding-row-value">
                {formatReviewDate(form.checkOutDate, form.checkOutTime)}
              </span>
            </div>

            {/* 4. Stay Duration */}
            <div className="boarding-summary-row">
              <div className="boarding-row-left">
                <div className="boarding-row-icon-wrap">
                  <Clock size={15} color="#A6731B" />
                </div>
                <span className="boarding-row-label">Stay Duration</span>
              </div>
              <span className="boarding-row-value">
                {stayCalculation.days} Day(s) · {stayCalculation.nights} Night(s)
              </span>
            </div>

            {/* 5. Daily Rate */}
            <div className="boarding-summary-row">
              <div className="boarding-row-left">
                <div className="boarding-row-icon-wrap">
                  <Coins size={15} color="#A6731B" />
                </div>
                <span className="boarding-row-label">Daily Rate</span>
              </div>
              <span className="boarding-row-value">
                ₹{stayCalculation.dailyRate} / day
              </span>
            </div>

            {/* 6. Estimated Total */}
            <div className="boarding-summary-row">
              <div className="boarding-row-left">
                <div className="boarding-row-icon-wrap">
                  <IndianRupee size={15} color="#A6731B" strokeWidth={2.4} />
                </div>
                <span className="boarding-row-label">Estimated Total</span>
              </div>
              <span className="boarding-row-value estimated-total">
                ₹{stayCalculation.estimatedTotal}
              </span>
            </div>

            {/* 7. Food Plan */}
            <div className="boarding-summary-row align-top">
              <div className="boarding-row-left">
                <div className="boarding-row-icon-wrap">
                  <Utensils size={15} color="#A6731B" />
                </div>
                <span className="boarding-row-label">Food Plan</span>
              </div>
              <div className="boarding-food-plan-wrap">
                <div className="boarding-food-plan-title">
                  {form.foodType || 'Packaged Pet Food (Kibble/Wet)'}
                </div>
                {form.foodProvider && (
                  <div className="boarding-food-plan-sub">
                    ({form.foodProvider})
                  </div>
                )}
              </div>
            </div>

            {/* 8. Status */}
            <div className="boarding-summary-row">
              <div className="boarding-row-left">
                <div className="boarding-row-icon-wrap">
                  <FileText size={15} color="#A6731B" />
                </div>
                <span className="boarding-row-label">Status</span>
              </div>
              <div className="boarding-status-pill">
                <Hourglass size={13} color="#B07616" strokeWidth={2.4} />
                <span>Pending Admin Review</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="boarding-success-action-group">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="boarding-btn-primary-whatsapp"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.888 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.711 1.457h.004c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.483-8.413z" />
              </svg>
              <span>Send Details to WhatsApp</span>
              <ArrowRight size={18} strokeWidth={2.4} style={{ marginLeft: 2 }} />
            </a>

            <button
              type="button"
              onClick={() => navigate('/my-bookings')}
              className="boarding-btn-secondary-bookings"
            >
              <span>View My Bookings</span>
              <ArrowRight size={18} strokeWidth={2.4} style={{ marginLeft: 2 }} />
            </button>

            <button
              type="button"
              onClick={() => { setDone(false); setStep(1) }}
              className="boarding-btn-tertiary-link"
            >
              Book Another Stay
            </button>
          </div>
        </div>
      ) : (
        <div ref={bookingTopRef} className="boarding-flow-container">
          {/* Top Suite Badge */}
          <div className="suite-tag-row">
          <span className="suite-gold-tag">PAW PAW SUITES</span>
        </div>

        {/* Dynamic Step Title */}
        <h1 className="boarding-heading">
          {step === 5 ? 'Review Boarding Request' : 'Pet Boarding Reservation'}
        </h1>
        <p className="boarding-subheading">
          {step === 5
            ? 'Please verify your pet\'s stay details before submitting.'
            : 'Your pet\'s cozy home away from home. Complete the care profile below to request a stay.'}
        </p>

        {boardingSettings?.acceptBookings === false && (
          <div className="boarding-notice-warn">
            <Info size={16} /> Boarding reservations are temporarily closed. You may view care and diet details, but new requests cannot be submitted at this time.
          </div>
        )}

        {isBlocked && (
          <div className="boarding-notice-error">
            Your account is currently blocked from making bookings. Please contact Paw Paw support.
          </div>
        )}

        {/* Compact 5-step progress tracker */}
        <div className="boarding-stepper" role="navigation" aria-label="Booking steps">
          {[
            { n: 1, label: 'Pet Details' },
            { n: 2, label: 'Stay Dates' },
            { n: 3, label: 'Food & Diet' },
            { n: 4, label: 'Daily Care' },
            { n: 5, label: 'Review' },
          ].map((s, idx, arr) => {
            const isCompleted = step > s.n
            const isActive = step === s.n
            return (
              <div key={s.n} className="stepper-item-wrap">
                <button
                  type="button"
                  className={`stepper-circle ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                  onClick={() => {
                    if (s.n < step) setStep(s.n)
                  }}
                  aria-label={`Step ${s.n}: ${s.label}`}
                >
                  {isCompleted ? <Check size={13} strokeWidth={3} /> : s.n}
                </button>
                <span className={`stepper-label ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                  {s.label}
                </span>
                {idx < arr.length - 1 && (
                  <div className={`stepper-connector ${step > s.n ? 'completed' : ''}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* MAIN FORM CARD */}
        <div className="boarding-card">
          {/* ==========================================================
              SCREEN 1: PET DETAILS
              ========================================================== */}
          {step === 1 && (
            <div>
              <div className="card-header-row">
                <div className="card-header-icon-box">
                  <img
                    src="/boarding-hero-pets.png"
                    alt="Dog and Cat"
                    className="card-header-pet-img"
                    onError={e => { e.currentTarget.src = '/booking-pets.svg' }}
                  />
                </div>
                <div>
                  <h2 className="card-title">Pet & Owner Information</h2>
                  <p className="card-subtitle single-line-sub">Choose a pet or enter details below.</p>
                </div>
              </div>

              {/* Saved pets section */}
              <div className="form-section">
                <div className="section-head-split">
                  <label className="section-sublabel">SAVED PETS</label>
                  <Link to="/my-pets" className="manage-pets-link">+ Add or manage pets</Link>
                </div>

                {pets.length > 0 ? (
                  <div className="saved-pets-list">
                    {pets.map(pet => {
                      const sel = selectedPetId === pet.id
                      return (
                        <div
                          key={pet.id}
                          onClick={() => applyPet(pet)}
                          className={`saved-pet-card ${sel ? 'selected' : ''}`}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') applyPet(pet) }}
                        >
                          <div className={`custom-radio ${sel ? 'checked' : ''}`}>
                            {sel && <div className="radio-dot" />}
                          </div>

                          {pet.photoUrl ? (
                            <img src={pet.photoUrl} alt={pet.name} className="pet-thumb-img" />
                          ) : (
                            <div className="pet-thumb-placeholder">
                              <PawPrint size={18} color="#C08820" />
                            </div>
                          )}

                          <div className="pet-card-text">
                            <div className="pet-card-name">{pet.name}</div>
                            <div className="pet-card-meta">
                              {pet.type} {pet.breed ? `• ${pet.breed}` : ''}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="empty-saved-pets">
                    No saved pet profiles yet. Fill in details below to continue.
                  </div>
                )}
              </div>

              {/* Owner details */}
              <div className="field-grid-2">
                <div className="form-group">
                  <label className="field-label">YOUR NAME *</label>
                  <input
                    className="boarding-input"
                    placeholder="Prem Tandalekar"
                    value={form.ownerName}
                    onChange={e => update('ownerName', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="field-label">PHONE NUMBER *</label>
                  <input
                    className="boarding-input"
                    placeholder="9021459467"
                    value={form.phone}
                    maxLength={10}
                    onChange={e => update('phone', e.target.value)}
                  />
                </div>
              </div>

              {/* Pet basic info */}
              <div className="field-grid-2">
                <div className="form-group">
                  <label className="field-label">PET NAME *</label>
                  <input
                    className="boarding-input"
                    placeholder="Bruno"
                    value={form.petName}
                    onChange={e => { setSelectedPetId(''); update('petName', e.target.value) }}
                  />
                </div>
                <div className="form-group">
                  <label className="field-label">PET TYPE *</label>
                  <select
                    className="boarding-select"
                    value={form.petType}
                    onChange={e => {
                      setSelectedPetId('')
                      update('petType', e.target.value)
                      update('petBreed', '')
                      update('customBreed', '')
                    }}
                  >
                    {PET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Pet Breed & Date of Birth in single line */}
              <div className="field-grid-2">
                <div className="form-group">
                  <label className="field-label">BREED</label>
                  {breedOptions.length > 0 ? (
                    <div>
                      <select
                        className="boarding-select"
                        value={form.petBreed}
                        onChange={e => { setSelectedPetId(''); update('petBreed', e.target.value) }}
                      >
                        <option value="">Select breed</option>
                        {breedOptions.map(b => <option key={b} value={b}>{b}</option>)}
                        <option value="other">Other / Mixed</option>
                      </select>
                      {form.petBreed === 'other' && (
                        <input
                          className="boarding-input"
                          placeholder="Type breed name..."
                          value={form.customBreed}
                          onChange={e => update('customBreed', e.target.value)}
                          style={{ marginTop: '6px' }}
                        />
                      )}
                    </div>
                  ) : (
                    <input
                      className="boarding-input"
                      placeholder="German Shepherd"
                      value={form.customBreed}
                      onChange={e => update('customBreed', e.target.value)}
                    />
                  )}
                </div>

                <div className="form-group">
                  <label className="field-label">DATE OF BIRTH / AGE</label>
                  <input
                    type="date"
                    className="boarding-input"
                    value={form.petDob}
                    onChange={e => update('petDob', e.target.value)}
                  />
                </div>
              </div>

              {/* Weight & Gender in single line */}
              <div className="field-grid-2">
                <div className="form-group">
                  <label className="field-label">WEIGHT (KG)</label>
                  <input
                    className="boarding-input"
                    placeholder="12"
                    value={form.petWeight}
                    onChange={e => update('petWeight', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="field-label">GENDER</label>
                  <select
                    className="boarding-select"
                    value={form.petGender}
                    onChange={e => update('petGender', e.target.value)}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>

              {/* Health & Vaccination Safety subcard */}
              <div className="sub-group-card">
                <div className="sub-group-header">
                  <ShieldCheck size={16} color="#C08820" />
                  <span>Health & Vaccination Safety</span>
                </div>

                <div className="field-grid-2">
                  <div className="form-group">
                    <label className="field-label">VACCINATION STATUS *</label>
                    <select
                      className="boarding-select"
                      value={form.vaccinationStatus}
                      onChange={e => update('vaccinationStatus', e.target.value)}
                    >
                      <option value="Fully Vaccinated">Fully Vaccinated</option>
                      <option value="Partially Vaccinated">Partially Vaccinated</option>
                      <option value="Due Soon / Needs Verification">Due Soon / Needs Verification</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="field-label">LAST VACCINATION</label>
                    <input
                      className="boarding-input"
                      placeholder="e.g. Rabies 2025"
                      value={form.vaccinationNotes}
                      onChange={e => update('vaccinationNotes', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="field-label">EXISTING MEDICAL CONDITIONS OR REGULAR MEDICINES (IF ANY)</label>
                  <input
                    className="boarding-input"
                    placeholder="e.g. Arthritis, skin allergy, ear drops, etc."
                    value={form.medicalConditions}
                    onChange={e => update('medicalConditions', e.target.value)}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!form.ownerName.trim() || !form.phone.trim() || !form.petName.trim()}
                className="boarding-primary-btn"
              >
                Continue to Stay Dates <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* ==========================================================
              SCREEN 2: STAY DATES
              ========================================================== */}
          {step === 2 && (
            <div>
              <div className="card-header-row">
                <div className="card-header-icon-box">
                  <Calendar size={18} color="#C08820" />
                </div>
                <div>
                  <h2 className="card-title">Stay Duration & Schedule</h2>
                  <p className="card-subtitle">Choose check-in and check-out dates for your pet's boarding stay.</p>
                </div>
              </div>

              {/* Rate Card (Screenshot 2 Match) */}
              <div className="rate-highlight-card">
                <div className="rate-icon-badge">
                  <PawPrint size={20} color="#C08820" />
                </div>
                <div className="rate-content">
                  <div className="rate-main-text">
                    {form.petType} Boarding Rate: ₹{stayCalculation.dailyRate} / day
                  </div>
                  <div className="rate-sub-text">
                    Cats: ₹600/day • 24/7 care included
                  </div>
                </div>
              </div>

              {/* Check-in Schedule */}
              <div className="schedule-box">
                <div className="schedule-header-label">
                  <Calendar size={14} color="#C08820" />
                  <span>CHECK-IN SCHEDULE *</span>
                </div>
                <div className="field-grid-2">
                  <div className="form-group">
                    <label className="field-label">DATE</label>
                    <input
                      type="date"
                      className="boarding-input"
                      min={todayStr}
                      value={form.checkInDate}
                      onChange={e => {
                        update('checkInDate', e.target.value)
                        if (e.target.value > form.checkOutDate) update('checkOutDate', e.target.value)
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="field-label">APPROX. TIME</label>
                    <select
                      className="boarding-select"
                      value={form.checkInTime}
                      onChange={e => update('checkInTime', e.target.value)}
                    >
                      {TIME_SLOT_OPTIONS.map(slot => (
                        <option key={`in-${slot}`} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Check-out Schedule */}
              <div className="schedule-box">
                <div className="schedule-header-label">
                  <Calendar size={14} color="#C08820" />
                  <span>CHECK-OUT SCHEDULE *</span>
                </div>
                <div className="field-grid-2">
                  <div className="form-group">
                    <label className="field-label">DATE</label>
                    <input
                      type="date"
                      className="boarding-input"
                      min={form.checkInDate || todayStr}
                      value={form.checkOutDate}
                      onChange={e => update('checkOutDate', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="field-label">APPROX. TIME</label>
                    <select
                      className="boarding-select"
                      value={form.checkOutTime}
                      onChange={e => update('checkOutTime', e.target.value)}
                    >
                      {TIME_SLOT_OPTIONS.map(slot => (
                        <option key={`out-${slot}`} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Duration & Estimated Total Card */}
              {!stayCalculation.valid ? (
                <div className="boarding-notice-error" style={{ marginBottom: '18px' }}>
                  {stayCalculation.error}
                </div>
              ) : (
                <div className="stay-summary-card">
                  <div className="summary-line">
                    <span className="summary-label">
                      <Calendar size={14} color="#C08820" /> Calculated Duration
                    </span>
                    <strong className="summary-value">
                      {stayCalculation.days} Day(s) {stayCalculation.nights > 0 ? `(${stayCalculation.nights} Night${stayCalculation.nights > 1 ? 's' : ''})` : '(Day Stay)'}
                    </strong>
                  </div>
                  <div className="summary-line">
                    <span className="summary-label">Rate per day</span>
                    <span className="summary-value">₹{stayCalculation.dailyRate}</span>
                  </div>
                  <div className="summary-line total-line">
                    <strong className="summary-total-label">Estimated Boarding Total</strong>
                    <strong className="summary-total-value">₹{stayCalculation.estimatedTotal}</strong>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!stayCalculation.valid}
                className="boarding-primary-btn"
              >
                Continue to Food & Diet <ArrowRight size={16} />
              </button>

              <button type="button" onClick={() => setStep(1)} className="boarding-back-btn">
                ← Back
              </button>
            </div>
          )}

          {/* ==========================================================
              SCREEN 3: FOOD & DIET
              ========================================================== */}
          {step === 3 && (
            <div>
              <div className="card-header-row">
                <div className="card-header-icon-box">
                  <Utensils size={18} color="#C08820" />
                </div>
                <div>
                  <h2 className="card-title">Food & Dietary Preferences</h2>
                  <p className="card-subtitle">Tell us about your pet's food needs.</p>
                </div>
              </div>

              {/* A. Regular Food — Always Selected and Locked */}
              <div className="regular-food-card">
                <div className="food-bowl-icon-wrap">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C08820" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 11c0 5 4 9 9 9s9-4 9-9H3z" />
                    <path d="M7 11V8a5 5 0 0 1 10 0v3" />
                    <circle cx="12" cy="15" r="1.5" fill="#C08820" stroke="none" />
                  </svg>
                </div>
                <div className="regular-food-text">
                  <strong className="regular-food-title">Regular food (Included)</strong>
                  <p className="regular-food-desc">Nutritious and balanced food is provided by Paw Paw and is included in the boarding price.</p>
                </div>
                <div className="regular-food-check">
                  <Check size={14} color="#FFFFFF" strokeWidth={3} />
                </div>
              </div>

              {/* B. Ask Whether Special Food Is Needed */}
              <div className="special-food-section">
                <label className="field-label-prominent">Does your pet need special food?</label>
                <p className="field-subtext">e.g. prescription diet, specific brand, homemade diet, or any other special requirements.</p>

                <div className="special-food-choice-grid">
                  <div
                    onClick={() => {
                      update('specialFoodRequired', false)
                      update('foodType', 'Regular Food (Included)')
                      update('foodProvider', 'Paw Paw (Regular Food Included)')
                    }}
                    className={`special-choice-card ${!form.specialFoodRequired ? 'selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') {
                      update('specialFoodRequired', false)
                      update('foodType', 'Regular Food (Included)')
                      update('foodProvider', 'Paw Paw (Regular Food Included)')
                    } }}
                  >
                    <div className={`choice-radio ${!form.specialFoodRequired ? 'checked' : ''}`}>
                      {!form.specialFoodRequired && <Check size={11} color="#FFF" strokeWidth={3.5} />}
                    </div>
                    <div className="choice-text">
                      <strong className="choice-title">No</strong>
                      <span className="choice-desc">Regular food is fine</span>
                    </div>
                  </div>

                  <div
                    onClick={() => {
                      update('specialFoodRequired', true)
                      const provider = form.specialFoodProvider || 'customer'
                      update('specialFoodProvider', provider)
                      update('foodType', 'Regular Food + Special Food')
                      update('foodProvider', provider === 'pawpaw' ? 'Paw Paw will provide it' : 'Customer will provide the food')
                    }}
                    className={`special-choice-card ${form.specialFoodRequired ? 'selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') {
                      update('specialFoodRequired', true)
                      const provider = form.specialFoodProvider || 'customer'
                      update('specialFoodProvider', provider)
                      update('foodType', 'Regular Food + Special Food')
                      update('foodProvider', provider === 'pawpaw' ? 'Paw Paw will provide it' : 'Customer will provide the food')
                    } }}
                  >
                    <div className={`choice-radio ${form.specialFoodRequired ? 'checked' : ''}`}>
                      {form.specialFoodRequired && <Check size={11} color="#FFF" strokeWidth={3.5} />}
                    </div>
                    <div className="choice-text">
                      <strong className="choice-title">Yes</strong>
                      <span className="choice-desc">My pet needs special food</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* C. Special-Food Provider Choices (Revealed when Yes) */}
              {form.specialFoodRequired && (
                <div className="special-provider-section">
                  <label className="field-label-prominent">Who will provide the special food?</label>

                  <div className="special-provider-grid">
                    {/* Option 1: Customer provides */}
                    <div
                      onClick={() => {
                        update('specialFoodProvider', 'customer')
                        update('foodProvider', 'Customer will provide the food')
                      }}
                      className={`provider-card ${form.specialFoodProvider === 'customer' ? 'selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') {
                        update('specialFoodProvider', 'customer')
                        update('foodProvider', 'Customer will provide the food')
                      } }}
                    >
                      <div className="provider-card-head">
                        <div className="provider-icon-circle">
                          <PawPrint size={14} color="#C08820" />
                        </div>
                        <strong className="provider-title">I will provide the special food</strong>
                      </div>
                      <p className="provider-desc">
                        I will bring my pet's food for the entire stay. <strong>No extra food charge.</strong>
                      </p>
                    </div>

                    {/* Option 2: Paw Paw provides */}
                    <div
                      onClick={() => {
                        update('specialFoodProvider', 'pawpaw')
                        update('foodProvider', 'Paw Paw will provide it')
                      }}
                      className={`provider-card ${form.specialFoodProvider === 'pawpaw' ? 'selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') {
                        update('specialFoodProvider', 'pawpaw')
                        update('foodProvider', 'Paw Paw will provide it')
                      } }}
                    >
                      <div className="provider-card-head">
                        <div className="provider-icon-circle">
                          <Building2 size={14} color="#C08820" />
                        </div>
                        <strong className="provider-title">Paw Paw will provide it</strong>
                      </div>
                      <p className="provider-desc">
                        Any extra charge will be confirmed by the hostel and collected at check-in or checkout (as per hostel).
                      </p>
                    </div>
                  </div>

                  {/* Info alert banner */}
                  <div className="food-policy-alert">
                    <Info size={16} color="#0284C7" className="food-alert-icon" />
                    <span>
                      If Paw Paw provides the special food, the extra charge will be decided by the hostel and collected at check-in or checkout depending on their policy.
                    </span>
                  </div>
                </div>
              )}

              {/* Feeding Schedule & Times */}
              <div className="form-group" style={{ marginTop: '18px' }}>
                <label className="field-label">FEEDING SCHEDULE & TIMES *</label>
                <select
                  className="boarding-select"
                  value={form.feedingSchedule}
                  onChange={e => update('feedingSchedule', e.target.value)}
                >
                  {FEEDING_FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              {/* Food allergies */}
              <div className="form-group">
                <label className="field-label">FOOD ALLERGIES OR DISLIKES (OPTIONAL)</label>
                <input
                  className="boarding-input"
                  placeholder="e.g. Allergic to chicken, avoids beef, loves vegetables..."
                  value={form.allergies}
                  onChange={e => update('allergies', e.target.value)}
                />
              </div>

              {/* Diet & drinking water */}
              <div className="form-group">
                <label className="field-label">DIET & DRINKING WATER INSTRUCTIONS (OPTIONAL)</label>
                <textarea
                  className="boarding-textarea"
                  rows={3}
                  placeholder="Any meal portions, preparation, or water instructions..."
                  value={form.specialDietInstructions}
                  onChange={e => update('specialDietInstructions', e.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={() => setStep(4)}
                className="boarding-primary-btn"
              >
                Continue to Daily Care <ArrowRight size={16} />
              </button>

              <button type="button" onClick={() => setStep(2)} className="boarding-back-btn">
                ← Back
              </button>
            </div>
          )}

          {/* ==========================================================
              SCREEN 4: DAILY CARE
              ========================================================== */}
          {step === 4 && (
            <div>
              <div className="card-header-row">
                <div className="card-header-icon-box">
                  <Heart size={18} color="#C08820" />
                </div>
                <div>
                  <h2 className="card-title">Care Habits & Safety</h2>
                  <p className="card-subtitle">Ensure your pet feels secure, active, and happy throughout their stay.</p>
                </div>
              </div>

              {/* Walking Schedule (if Dog) */}
              {form.petType === 'Dog' && (
                <div className="form-group">
                  <label className="field-label">WALKING SCHEDULE</label>
                  <select
                    className="boarding-select"
                    value={form.walkingFrequency}
                    onChange={e => update('walkingFrequency', e.target.value)}
                  >
                    {WALKING_FREQUENCIES.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
              )}

              {/* Sleeping & Toilet Habits */}
              <div className="field-grid-2">
                <div className="form-group">
                  <label className="field-label">SLEEPING HABITS</label>
                  <input
                    className="boarding-input"
                    placeholder="e.g. Needs own blanket"
                    value={form.sleepingHabits}
                    onChange={e => update('sleepingHabits', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="field-label">TOILET HABITS</label>
                  <input
                    className="boarding-input"
                    placeholder="Outdoor breaks"
                    value={form.toiletHabits}
                    onChange={e => update('toiletHabits', e.target.value)}
                  />
                </div>
              </div>

              {/* Behaviour & Anxiety */}
              <div className="field-grid-2 behaviour-separation-row">
                <div className="form-group">
                  <label className="field-label">BEHAVIOUR AROUND OTHER PETS</label>
                  <input
                    className="boarding-input"
                    placeholder="e.g. Friendly, shy, etc."
                    value={form.behaviorNotes}
                    onChange={e => update('behaviorNotes', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="field-label">SEPARATION ANXIETY</label>
                  <select
                    className="boarding-select"
                    value={form.separationAnxiety}
                    onChange={e => update('separationAnxiety', e.target.value)}
                  >
                    <option value="None / Mild">None / Mild</option>
                    <option value="Moderate (needs extra cuddles)">Moderate (needs extra cuddles)</option>
                    <option value="High (gets vocal or anxious)">High (gets vocal or anxious)</option>
                  </select>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="sub-group-card">
                <div className="sub-group-header">
                  <Phone size={15} color="#C08820" />
                  <span>Emergency Contact (Relative / Friend)</span>
                </div>
                <div className="field-grid-2">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="field-label">CONTACT NAME *</label>
                    <input
                      className="boarding-input"
                      placeholder="e.g. John Doe (Relative / Friend)"
                      value={form.emergencyContactName}
                      onChange={e => update('emergencyContactName', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="field-label">PHONE NUMBER *</label>
                    <input
                      className="boarding-input"
                      placeholder="9876543210"
                      maxLength={10}
                      value={form.emergencyContactPhone}
                      onChange={e => update('emergencyContactPhone', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Additional instructions */}
              <div className="form-group">
                <label className="field-label">ADDITIONAL INSTRUCTIONS OR FAVORITE TOYS/TREATS</label>
                <textarea
                  className="boarding-textarea"
                  rows={2}
                  placeholder="Anything else we should know to make your pet feel at home..."
                  value={form.additionalInstructions}
                  onChange={e => update('additionalInstructions', e.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={() => setStep(5)}
                className="boarding-primary-btn"
              >
                Continue to Review <ArrowRight size={16} />
              </button>

              <button type="button" onClick={() => setStep(3)} className="boarding-back-btn">
                ← Back
              </button>
            </div>
          )}

          {/* ==========================================================
              SCREEN 5: REVIEW BOARDING REQUEST
              ========================================================== */}
          {step === 5 && (
            <div>
              {/* Pet & Owner Header Pill (Matches Screen 5) */}
              <div className="review-pet-header-pill">
                {selectedPet?.photoUrl ? (
                  <img src={selectedPet.photoUrl} alt={form.petName} className="review-pet-avatar" />
                ) : (
                  <div className="review-pet-avatar placeholder">
                    <PawPrint size={22} color="#C08820" />
                  </div>
                )}
                <div className="review-pet-info">
                  <h3 className="review-pet-title">
                    {form.petName} <span className="review-pet-breed">({form.petType}{displayBreed ? ` · ${displayBreed}` : ''})</span>
                  </h3>
                  <div className="review-owner-line">
                    Owner: {form.ownerName}
                  </div>
                  <div className="review-owner-phone">
                    <Phone size={11} color="#C08820" /> {form.phone}
                  </div>
                </div>
              </div>

              {/* 1. Stay Schedule Card */}
              <div className="review-section-card">
                <div className="review-card-head">
                  <Calendar size={16} color="#C08820" />
                  <h4>Stay Schedule</h4>
                </div>
                <div className="review-grid">
                  <div className="review-spec-row">
                    <span className="spec-label">Check-In:</span>
                    <strong className="spec-val">{formatReviewDate(form.checkInDate, form.checkInTime)}</strong>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Check-Out:</span>
                    <strong className="spec-val">{formatReviewDate(form.checkOutDate, form.checkOutTime)}</strong>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Duration:</span>
                    <span className="spec-val">{stayCalculation.days} Day(s) ({stayCalculation.nights} Night{stayCalculation.nights === 1 ? '' : 's'})</span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Daily Rate:</span>
                    <span className="spec-val">₹{stayCalculation.dailyRate}</span>
                  </div>
                  <div className="review-spec-row total-highlight">
                    <strong className="spec-label">Estimated Total:</strong>
                    <strong className="spec-val gold">₹{stayCalculation.estimatedTotal}</strong>
                  </div>
                </div>
              </div>

              {/* 2. Food & Diet Card */}
              <div className="review-section-card">
                <div className="review-card-head">
                  <Utensils size={16} color="#C08820" />
                  <h4>Food & Diet</h4>
                </div>
                <div className="review-grid">
                  <div className="review-spec-row">
                    <span className="spec-label">Regular Food:</span>
                    <span className="spec-val">Included (Paw Paw)</span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Special Food:</span>
                    <span className="spec-val">
                      {form.specialFoodRequired
                        ? `Yes (${form.specialFoodProvider === 'pawpaw' ? 'Paw Paw provides' : 'Customer provides'})`
                        : 'No (Regular food fine)'}
                    </span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Feeding:</span>
                    <span className="spec-val">{form.feedingSchedule}</span>
                  </div>
                  {(form.allergies || form.specialDietInstructions) && (
                    <div className="review-spec-row">
                      <span className="spec-label">Diet Notes:</span>
                      <span className="spec-val">
                        {[form.allergies ? `Allergies: ${form.allergies}` : null, form.specialDietInstructions].filter(Boolean).join(' • ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Care & Safety Card */}
              <div className="review-section-card">
                <div className="review-card-head">
                  <PawPrint size={16} color="#C08820" />
                  <h4>Care & Safety</h4>
                </div>
                <div className="review-grid">
                  {form.petType === 'Dog' && (
                    <div className="review-spec-row">
                      <span className="spec-label">Walking:</span>
                      <span className="spec-val">{form.walkingFrequency}</span>
                    </div>
                  )}
                  <div className="review-spec-row">
                    <span className="spec-label">Sleeping:</span>
                    <span className="spec-val">{form.sleepingHabits || 'Needs own blanket'}</span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Toilet:</span>
                    <span className="spec-val">{form.toiletHabits || 'Outdoor breaks'}</span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Behaviour:</span>
                    <span className="spec-val">{form.behaviorNotes || 'Friendly'}</span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Separation Anxiety:</span>
                    <span className="spec-val">{form.separationAnxiety}</span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Emergency Contact:</span>
                    <span className="spec-val">{form.emergencyContactPhone || '9876543210'}</span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Additional Notes:</span>
                    <span className="spec-val">{form.additionalInstructions || '-'}</span>
                  </div>
                </div>
              </div>

              {/* 4. Health & Vaccinations Card */}
              <div className="review-section-card">
                <div className="review-card-head">
                  <ShieldCheck size={16} color="#C08820" />
                  <h4>Health & Vaccinations</h4>
                </div>
                <div className="review-grid">
                  <div className="review-spec-row">
                    <span className="spec-label">Vaccination:</span>
                    <span className="spec-val">{form.vaccinationStatus}</span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Last Vaccination:</span>
                    <span className="spec-val">{form.vaccinationNotes || 'Rabies 2025'}</span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Medical Conditions:</span>
                    <span className="spec-val">{form.medicalConditions || '-'}</span>
                  </div>
                </div>
              </div>

              {/* No advance payment notice (Screen 5 Match) */}
              <div className="payment-notice-card">
                <div className="notice-icon-box">
                  <Info size={17} color="#0D9488" />
                </div>
                <div className="notice-text">
                  <strong>No advance payment required.</strong>
                  <p>Your request will be reviewed by our team to ensure suite availability. Payment is settled directly during pet check-in / check-out.</p>
                </div>
              </div>

              {/* Pet Boarding Terms & Conditions (Collapsible Preview + Full Modal) */}
              {(() => {
                const activeTerms = (boardingSettings?.terms && boardingSettings.terms.length > 0)
                  ? boardingSettings.terms
                  : DEFAULT_BOARDING_TERMS
                const activeClosingMessage = boardingSettings?.termsClosingMessage || DEFAULT_BOARDING_TERMS_CLOSING

                return (
                  <div className="review-terms-card">
                    <div
                      className="review-terms-header"
                      onClick={() => setTermsExpanded(p => !p)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setTermsExpanded(p => !p) }}
                    >
                      <div className="terms-header-left">
                        <div className="terms-icon-circle">
                          <FileText size={16} color="#C08820" />
                        </div>
                        <div>
                          <h4 className="terms-card-title">Pet Boarding Terms & Conditions</h4>
                          <span className="terms-card-subtitle">
                            {termsExpanded ? 'Click to collapse terms preview' : `${activeTerms.length} conditions · Click to preview`}
                          </span>
                        </div>
                      </div>
                      <div className={`terms-expand-btn ${termsExpanded ? 'expanded' : ''}`}>
                        <ChevronDown size={18} />
                      </div>
                    </div>

                    <div className="review-terms-content">
                      <ul className="terms-preview-list">
                        {(termsExpanded ? activeTerms : activeTerms.slice(0, 3)).map((term, idx) => (
                          <li key={idx} className="terms-preview-item">
                            <span className="terms-bullet-num">{idx + 1}.</span>
                            <span className="terms-bullet-text">{term}</span>
                          </li>
                        ))}
                      </ul>

                      {!termsExpanded && activeTerms.length > 3 && (
                        <div className="terms-more-indicator">
                          + {activeTerms.length - 3} more condition{activeTerms.length - 3 > 1 ? 's' : ''}...
                        </div>
                      )}

                      {termsExpanded && activeClosingMessage && (
                        <div className="terms-closing-banner">
                          {activeClosingMessage}
                        </div>
                      )}

                      <div style={{ marginTop: '10px' }}>
                        <button
                          type="button"
                          className="view-all-terms-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowTermsModal(true)
                          }}
                        >
                          <span>View All Terms & Conditions</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Mandatory Customer Acceptance Checkbox */}
                    <div className="terms-acceptance-row">
                      <label className="terms-accept-label" htmlFor="petBoardingAcceptTerms">
                        <input
                          type="checkbox"
                          checked={termsAccepted}
                          onChange={e => setTermsAccepted(e.target.checked)}
                          className="terms-accept-checkbox"
                          id="petBoardingAcceptTerms"
                        />
                        <span className="terms-accept-text">
                          I have read and agree to the <strong>Pet Boarding Terms & Conditions</strong>.
                        </span>
                      </label>

                      {!termsAccepted && (
                        <div className="terms-validation-hint">
                          <AlertCircle size={14} color="#B45309" />
                          <span>Please accept the terms and conditions above to submit your booking.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {boardingSettings?.acceptBookings === false ? (
                <div className="boarding-notice-warn text-center">
                  Boarding Bookings Temporarily Closed
                </div>
              ) : (
                <div
                  className="submit-btn-wrap"
                  onClick={() => {
                    if (!termsAccepted && !loading && !isBlocked) {
                      setToastType('error')
                      setToastMessage('Please read and agree to the Pet Boarding Terms & Conditions to submit your request.')
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading || isBlocked || !termsAccepted}
                    className={`boarding-primary-btn ${!termsAccepted ? 'disabled-terms' : ''}`}
                  >
                    {loading ? 'Submitting Boarding Request...' : 'Submit Boarding Request →'}
                  </button>
                </div>
              )}

              <button type="button" onClick={() => setStep(4)} className="boarding-back-btn">
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Full Terms & Conditions Modal */}
      {showTermsModal && (() => {
        const activeTerms = (boardingSettings?.terms && boardingSettings.terms.length > 0)
          ? boardingSettings.terms
          : DEFAULT_BOARDING_TERMS
        const activeClosingMessage = boardingSettings?.termsClosingMessage || DEFAULT_BOARDING_TERMS_CLOSING

        return (
          <div className="modal-overlay" onClick={() => setShowTermsModal(false)}>
            <div
              className="terms-full-modal-card"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="terms-modal-heading"
            >
              <div className="terms-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="#C08820" />
                  <h3 id="terms-modal-heading" className="terms-modal-title">
                    Pet Boarding Terms & Conditions
                  </h3>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowTermsModal(false)}
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="terms-modal-body">
                <p style={{ fontSize: '13px', color: '#6B5E55', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Please review Paw Paw Pet Grooming&apos;s boarding policies and care guidelines before confirming your reservation.
                </p>

                <ol className="terms-modal-list">
                  {activeTerms.map((term, idx) => (
                    <li key={idx} className="terms-modal-item">
                      <span className="terms-modal-index">{idx + 1}.</span>
                      <span className="terms-modal-text">{term}</span>
                    </li>
                  ))}
                </ol>

                {activeClosingMessage && (
                  <div className="terms-modal-closing">
                    {activeClosingMessage}
                  </div>
                )}
              </div>

              <div className="terms-modal-footer">
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '12px 18px', fontWeight: 700 }}
                  onClick={() => setShowTermsModal(false)}
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Scoped CSS Styles strictly for the 5 Booking Screens */}
      <style>{`
        .boarding-flow-page {
          background-color: #FAF7F2;
          min-height: auto;
          padding: 124px 16px 24px;
          color: #221711;
          font-family: 'DM Sans', sans-serif;
        }

        .text-center {
          text-align: center;
        }

        .boarding-flow-container {
          max-width: 540px;
          margin: 0 auto;
          scroll-margin-top: 130px;
        }

        /* ==========================================================================
           Redesigned Pet Boarding Booking Success Confirmation Screen
           ========================================================================== */
        .boarding-success-page {
          position: relative;
          max-width: 520px;
          margin: 0 auto;
          padding: 8px 6px 24px;
          text-align: center;
        }

        .boarding-success-hero {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 22px;
          padding-top: 6px;
        }

        /* Subtle decorative background paws */
        .boarding-success-bg-paw {
          position: absolute;
          color: #D6BA8F;
          opacity: 0.32;
          pointer-events: none;
          z-index: 1;
        }
        .boarding-success-bg-paw.paw-tl {
          top: -2px;
          left: 20%;
          transform: rotate(-15deg);
        }
        .boarding-success-bg-paw.paw-tr {
          top: -2px;
          right: 20%;
          transform: rotate(15deg);
        }
        .boarding-success-bg-paw.paw-far-l {
          top: 55px;
          left: 4%;
          opacity: 0.22;
          transform: rotate(-25deg);
        }
        .boarding-success-bg-paw.paw-far-r {
          top: 60px;
          right: 4%;
          opacity: 0.22;
          transform: rotate(25deg);
        }

        /* Success circular badge with radiating accents */
        .boarding-success-badge-wrap {
          position: relative;
          width: 88px;
          height: 88px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          z-index: 2;
        }

        .boarding-sunburst-rays {
          position: absolute;
          width: 104px;
          height: 104px;
          top: -8px;
          left: -8px;
          pointer-events: none;
        }

        .boarding-badge-paw {
          position: absolute;
          pointer-events: none;
          opacity: 0.45;
        }
        .boarding-badge-paw.badge-paw-left {
          left: -14px;
          top: 24px;
          transform: rotate(-20deg);
        }
        .boarding-badge-paw.badge-paw-right {
          right: -14px;
          top: 24px;
          transform: rotate(20deg);
        }

        .boarding-success-circle-outer {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: #DCFCE7;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(22, 163, 74, 0.16);
        }

        .boarding-success-circle-inner {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 2.8px solid #16A34A;
          background: #DCFCE7;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .boarding-success-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 27px;
          font-weight: 800;
          color: #241711;
          margin: 0 0 10px 0;
          line-height: 1.25;
          letter-spacing: -0.2px;
          text-align: center;
        }

        .boarding-success-subtitle {
          font-size: 14px;
          line-height: 1.55;
          color: #6B5E52;
          max-width: 450px;
          margin: 0 auto;
          font-weight: 400;
          text-align: center;
        }

        /* Booking Summary Card */
        .boarding-summary-card {
          background: #FFFFFF;
          border: 1.5px solid #EFE8DD;
          border-radius: 20px;
          padding: 22px 22px 16px;
          margin: 0 auto 24px;
          box-shadow: 0 8px 30px rgba(60, 42, 20, 0.05);
          text-align: left;
        }

        .boarding-summary-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 14px;
          margin-bottom: 2px;
          border-bottom: 1px solid #F3EDE4;
        }

        .boarding-summary-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .boarding-summary-header-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: #FAF3E5;
          border: 1.2px solid #F0DEC0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #B8860B;
        }

        .boarding-summary-header-title {
          font-size: 13.5px;
          font-weight: 800;
          color: #B07C24;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .boarding-summary-badge-id {
          background: #FAF3E5;
          border: 1.2px solid #EEDBC2;
          color: #9E6B18;
          font-weight: 800;
          font-size: 12.5px;
          letter-spacing: 0.6px;
          padding: 4px 12px;
          border-radius: 999px;
          white-space: nowrap;
        }

        /* Rows */
        .boarding-summary-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 13px 0;
          border-bottom: 1px solid #F6F0E7;
          gap: 14px;
        }

        .boarding-summary-row:last-child {
          border-bottom: none;
          padding-bottom: 4px;
        }

        .boarding-summary-row.align-top {
          align-items: flex-start;
        }

        .boarding-row-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .boarding-row-icon-wrap {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #FAF4EB;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #B37D20;
          flex-shrink: 0;
        }

        .boarding-row-label {
          font-size: 13.5px;
          font-weight: 500;
          color: #786C62;
          white-space: nowrap;
        }

        .boarding-row-value {
          font-size: 13.5px;
          font-weight: 700;
          color: #1E140E;
          text-align: right;
          word-break: break-word;
        }

        .boarding-row-value.estimated-total {
          font-size: 21px;
          font-weight: 800;
          color: #B07C24;
          letter-spacing: -0.3px;
        }

        .boarding-food-plan-wrap {
          text-align: right;
        }

        .boarding-food-plan-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #1E140E;
          line-height: 1.35;
        }

        .boarding-food-plan-sub {
          font-size: 12px;
          font-weight: 500;
          color: #6E6259;
          margin-top: 2px;
          line-height: 1.3;
        }

        .boarding-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #FEF7EA;
          border: 1.2px solid #F6DFB6;
          color: #B07616;
          padding: 6px 14px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
        }

        /* Action Buttons */
        .boarding-success-action-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          max-width: 480px;
          margin: 0 auto;
        }

        .boarding-btn-primary-whatsapp {
          background: #00A859;
          color: #FFFFFF !important;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          height: 52px;
          border-radius: 14px;
          font-size: 15.5px;
          font-weight: 700;
          text-decoration: none !important;
          box-shadow: 0 4px 14px rgba(0, 168, 89, 0.28);
          transition: all 0.2s ease;
          border: none;
          cursor: pointer;
        }

        .boarding-btn-primary-whatsapp:hover {
          background: #00964F;
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(0, 168, 89, 0.35);
          color: #FFFFFF !important;
        }

        .boarding-btn-secondary-bookings {
          background: #FFFFFF;
          border: 1.5px solid #C08820;
          color: #9C6810;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          height: 52px;
          border-radius: 14px;
          font-size: 15.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .boarding-btn-secondary-bookings:hover {
          background: #FFFDF9;
          border-color: #9C6810;
          transform: translateY(-1px);
        }

        .boarding-btn-tertiary-link {
          background: transparent;
          border: none;
          color: #9C6810;
          font-size: 14.5px;
          font-weight: 700;
          text-decoration: underline;
          text-underline-offset: 4px;
          cursor: pointer;
          padding: 8px 0;
          margin-top: 2px;
          transition: color 0.15s ease;
        }

        .boarding-btn-tertiary-link:hover {
          color: #744A06;
        }

        @media (max-width: 600px) {
          .boarding-success-page {
            padding: 4px 0 20px;
          }
          .boarding-summary-card {
            padding: 18px 16px 14px;
            border-radius: 18px;
          }
          .boarding-success-title {
            font-size: 23px;
          }
          .boarding-success-subtitle {
            font-size: 13px;
            padding: 0 4px;
          }
          .boarding-summary-header-title {
            font-size: 12.5px;
          }
          .boarding-summary-badge-id {
            font-size: 11.5px;
            padding: 3px 10px;
          }
          .boarding-row-label {
            font-size: 13px;
          }
          .boarding-row-value {
            font-size: 13px;
          }
          .boarding-row-value.estimated-total {
            font-size: 18px;
          }
          .boarding-food-plan-title {
            font-size: 13px;
          }
          .boarding-food-plan-sub {
            font-size: 11.5px;
          }
          .boarding-status-pill {
            font-size: 12px;
            padding: 5px 11px;
          }
          .boarding-btn-primary-whatsapp,
          .boarding-btn-secondary-bookings {
            height: 48px;
            font-size: 14.5px;
          }
        }

        .suite-tag-row {
          margin-bottom: 8px;
          position: relative;
          z-index: 2;
        }

        .suite-gold-tag {
          display: inline-block;
          background: #FAF3E3;
          border: 1.2px solid #E6D2AB;
          color: #B8860B;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          padding: 4px 10px;
          border-radius: 999px;
        }

        .boarding-heading {
          font-family: 'Playfair Display', serif;
          font-size: 25px;
          font-weight: 800;
          color: #221711;
          margin: 0 0 6px 0;
          line-height: 1.25;
        }

        .boarding-subheading {
          font-size: 13px;
          color: #7A6E63;
          margin: 0 0 20px 0;
          line-height: 1.45;
        }

        .boarding-notice-warn {
          background: #FEF9C3;
          border: 1px solid #FDE047;
          color: #854D0E;
          font-size: 12.5px;
          padding: 10px 14px;
          border-radius: 12px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .boarding-notice-error {
          background: #FEE2E2;
          border: 1px solid #FCA5A5;
          color: #991B1B;
          font-size: 12.5px;
          padding: 10px 14px;
          border-radius: 12px;
          margin-bottom: 16px;
        }

        /* 5-Step Compact Progress Tracker */
        .boarding-stepper {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          position: relative;
          margin-bottom: 22px;
          width: 100%;
        }

        .stepper-item-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          flex: 1;
          text-align: center;
        }

        .stepper-circle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          border: 1.5px solid #D8CCBA;
          background: #FFFFFF;
          color: #8E7E6E;
          margin-bottom: 5px;
          z-index: 2;
          transition: all 0.2s ease;
          cursor: pointer;
          outline: none;
        }

        .stepper-circle.active {
          background: #C08820;
          border-color: #C08820;
          color: #FFFFFF;
          box-shadow: 0 2px 8px rgba(192, 136, 32, 0.35);
        }

        .stepper-circle.completed {
          background: #C08820;
          border-color: #C08820;
          color: #FFFFFF;
        }

        .stepper-label {
          font-size: 9.5px;
          font-weight: 600;
          color: #9C8E7F;
          white-space: nowrap;
        }

        .stepper-label.active,
        .stepper-label.completed {
          color: #221711;
          font-weight: 800;
        }

        .stepper-connector {
          position: absolute;
          top: 14px;
          left: 50%;
          width: 100%;
          height: 2px;
          background: #E5DDD0;
          z-index: 1;
        }

        .stepper-connector.completed {
          background: #C08820;
        }

        /* Main Form Card */
        .boarding-card {
          background: #FFFFFF;
          border: 1.5px solid #EFE8DC;
          border-radius: 20px;
          padding: 20px 16px;
          box-shadow: 0 4px 20px rgba(60, 40, 20, 0.04);
        }

        .card-header-row {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 18px;
        }

        .card-header-icon-box {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: #FAF3E3;
          border: 1px solid #E6D2AB;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 1px;
          overflow: hidden;
        }

        .card-header-pet-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .card-title {
          font-size: 17px;
          font-weight: 800;
          color: #221711;
          margin: 0 0 3px 0;
        }

        .card-subtitle {
          font-size: 12.5px;
          color: #7A6E63;
          margin: 0;
          line-height: 1.4;
        }

        .card-subtitle.single-line-sub {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .form-section {
          margin-bottom: 18px;
        }

        .section-head-split {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .section-sublabel {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: #8C7D70;
        }

        .manage-pets-link {
          color: #B8860B;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
        }
        .manage-pets-link:hover {
          text-decoration: underline;
        }

        /* Saved Pets Stack */
        .saved-pets-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .saved-pet-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          border-radius: 12px;
          border: 1.2px solid #EFE8DC;
          background: #FFFFFF;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s ease;
        }

        .saved-pet-card:hover {
          border-color: #D8CCBA;
        }

        .saved-pet-card.selected {
          border-color: #C08820;
          background: #FAF5EB;
        }

        .custom-radio {
          width: 17px;
          height: 17px;
          border-radius: 50%;
          border: 1.5px solid #C5B8A5;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: #FFFFFF;
        }

        .custom-radio.checked {
          border-color: #C08820;
        }

        .custom-radio .radio-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #C08820;
        }

        .pet-thumb-img {
          width: 38px;
          height: 38px;
          border-radius: 9px;
          object-fit: cover;
          flex-shrink: 0;
          border: 1px solid #EFE8DC;
        }

        .pet-thumb-placeholder {
          width: 38px;
          height: 38px;
          border-radius: 9px;
          background: #FAF3E3;
          border: 1px solid #E6D2AB;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .pet-card-text {
          min-width: 0;
          flex: 1;
        }

        .pet-card-name {
          font-size: 13.5px;
          font-weight: 800;
          color: #221711;
        }

        .pet-card-meta {
          font-size: 11.5px;
          color: #7A6E63;
        }

        .empty-saved-pets {
          background: #FAF7F2;
          border: 1px dashed #E0D5C5;
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 12.5px;
          color: #7A6E63;
        }

        /* Form Controls */
        .form-group {
          margin-bottom: 14px;
        }

        .field-label {
          display: block;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: #7A6E63;
          margin-bottom: 5px;
        }

        .boarding-input,
        .boarding-select,
        .boarding-textarea {
          width: 100%;
          background: #FFFFFF;
          border: 1.2px solid #E0D5C5;
          border-radius: 10px;
          padding: 0 12px;
          font-size: 13.5px;
          color: #221711;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s;
        }

        .boarding-input,
        .boarding-select {
          height: 42px;
        }

        .boarding-textarea {
          padding: 10px 12px;
          resize: vertical;
        }

        .boarding-input:focus,
        .boarding-select:focus,
        .boarding-textarea:focus {
          border-color: #C08820;
          box-shadow: 0 0 0 2px rgba(192, 136, 32, 0.15);
        }

        .field-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .field-grid-2 > * {
          min-width: 0;
        }

        .field-grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        /* Subcard containers */
        .sub-group-card {
          background: #FAF7F2;
          border: 1.2px solid #EFE8DC;
          border-radius: 14px;
          padding: 14px;
          margin-bottom: 18px;
        }

        .sub-group-header {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          font-weight: 800;
          color: #221711;
          margin-bottom: 12px;
        }

        /* Primary and Back Buttons */
        .boarding-primary-btn {
          width: 100%;
          height: 46px;
          background: linear-gradient(135deg, #C58B24 0%, #B27B1B 100%);
          border: none;
          border-radius: 12px;
          color: #FFFFFF;
          font-size: 13.5px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 3px 12px rgba(184, 134, 11, 0.28);
          transition: transform 0.15s, opacity 0.15s;
        }

        .boarding-primary-btn:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .boarding-primary-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          box-shadow: none;
        }

        .boarding-secondary-btn {
          width: 100%;
          height: 44px;
          background: #FAF5EB;
          border: 1.2px solid #C08820;
          border-radius: 12px;
          color: #B8860B;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
        }

        .boarding-back-btn {
          width: 100%;
          background: none;
          border: none;
          color: #7A6E63;
          font-size: 12.5px;
          font-weight: 700;
          padding: 10px 0 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s;
        }

        .boarding-back-btn:hover {
          color: #221711;
        }

        /* SCREEN 2: Rate Card & Schedules */
        .rate-highlight-card {
          background: #FAF3E3;
          border: 1.5px solid #E6D2AB;
          border-radius: 14px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 18px;
        }

        .rate-icon-badge {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: #FFFFFF;
          border: 1px solid #E6D2AB;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .rate-main-text {
          font-size: 14px;
          font-weight: 800;
          color: #7A4F0B;
        }

        .rate-sub-text {
          font-size: 11.5px;
          color: #8C7355;
          margin-top: 1px;
        }

        .schedule-box {
          margin-bottom: 14px;
        }

        .schedule-header-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.6px;
          color: #7A6E63;
          margin-bottom: 8px;
        }

        .stay-summary-card {
          background: #FAF7F2;
          border: 1.2px solid #EFE8DC;
          border-radius: 14px;
          padding: 14px 16px;
          margin-bottom: 18px;
        }

        .summary-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          margin-bottom: 7px;
        }

        .summary-label {
          color: #7A6E63;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .summary-value {
          color: #221711;
          font-weight: 700;
        }

        .summary-line.total-line {
          margin-top: 10px;
          padding-top: 9px;
          border-top: 1px solid #E5DDD0;
          margin-bottom: 0;
        }

        .summary-total-label {
          font-size: 14px;
          color: #221711;
          font-weight: 800;
        }

        .summary-total-value {
          font-size: 18px;
          color: #C08820;
          font-weight: 800;
        }

        /* SCREEN 3: New Food & Diet UI (Matching Approved Reference) */
        .regular-food-card {
          background: #FEF9EE;
          border: 1.5px solid #EADBBE;
          border-radius: 16px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 20px;
          user-select: none;
        }

        .food-bowl-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: #FAF3E3;
          border: 1px solid #E6D2AB;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #C08820;
        }

        .regular-food-text {
          flex: 1;
          min-width: 0;
        }

        .regular-food-title {
          font-size: 15px;
          font-weight: 800;
          color: #221711;
          display: block;
          margin-bottom: 3px;
        }

        .regular-food-desc {
          font-size: 12.5px;
          color: #7D6B60;
          margin: 0;
          line-height: 1.4;
        }

        .regular-food-check {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #C08820;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #FFFFFF;
        }

        .special-food-section {
          margin-bottom: 20px;
        }

        .field-label-prominent {
          font-size: 14px;
          font-weight: 800;
          color: #221711;
          display: block;
          margin-bottom: 3px;
        }

        .field-subtext {
          font-size: 12px;
          color: #8C786E;
          margin: 0 0 10px;
          line-height: 1.4;
        }

        .special-food-choice-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          width: 100%;
        }

        .special-choice-card {
          background: #FFFFFF;
          border: 1.5px solid #E0D5C5;
          border-radius: 14px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
          min-width: 0;
        }

        .special-choice-card.selected {
          border-color: #C08820;
          background: #FEF9EE;
          box-shadow: 0 2px 8px rgba(192, 136, 32, 0.12);
        }

        .choice-radio {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 1.5px solid #D5CBBF;
          background: #FFFFFF;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s;
        }

        .choice-radio.checked {
          border-color: #C08820;
          background: #C08820;
        }

        .choice-text {
          display: flex;
          flex-direction: column;
          min-width: 0;
          text-align: left;
        }

        .choice-title {
          font-size: 14px;
          font-weight: 800;
          color: #221711;
          line-height: 1.25;
        }

        .choice-desc {
          font-size: 11.5px;
          color: #7D6B60;
          line-height: 1.35;
          margin-top: 1px;
        }

        .special-provider-section {
          margin-top: 16px;
          margin-bottom: 20px;
          animation: fadeIn 0.2s ease;
        }

        .special-provider-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 10px;
          margin-bottom: 12px;
          width: 100%;
        }

        .provider-card {
          background: #FFFFFF;
          border: 1.5px solid #E0D5C5;
          border-radius: 14px;
          padding: 13px 12px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
          min-width: 0;
        }

        .provider-card.selected {
          border-color: #C08820;
          background: #FEF9EE;
          box-shadow: 0 2px 8px rgba(192, 136, 32, 0.12);
        }

        .provider-card-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
          width: 100%;
        }

        .provider-icon-circle {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #FAF3E3;
          border: 1px solid #E6D2AB;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .provider-title {
          font-size: 13px;
          font-weight: 800;
          color: #221711;
          line-height: 1.3;
        }

        .provider-desc {
          font-size: 11.5px;
          color: #7D6B60;
          line-height: 1.4;
          margin: 0;
        }

        .food-policy-alert {
          background: #F0F9FF;
          border: 1px solid #BAE6FD;
          border-radius: 12px;
          padding: 10px 12px;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #0369A1;
          line-height: 1.45;
        }

        .food-alert-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }

        /* SCREEN 4: Behaviour & Separation row alignment */
        .behaviour-separation-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          align-items: start;
          margin-bottom: 18px;
        }

        .behaviour-separation-row .form-group {
          min-width: 0;
          margin-bottom: 0;
        }

        .behaviour-separation-row .field-label {
          min-height: 28px;
          display: flex;
          align-items: flex-start;
          line-height: 1.25;
          margin-bottom: 6px;
        }

        .behaviour-separation-row .boarding-input,
        .behaviour-separation-row .boarding-select {
          width: 100%;
          height: 42px;
          box-sizing: border-box;
          margin-top: 0;
        }

        .radio-options-stack {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .provider-option-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 12px;
          border-radius: 12px;
          border: 1.2px solid #E0D5C5;
          background: #FFFFFF;
          cursor: pointer;
          transition: all 0.15s;
        }

        .provider-option-card.selected {
          border-color: #C08820;
          background: #FAF5EB;
        }

        .provider-option-text {
          font-size: 13px;
          font-weight: 700;
          color: #221711;
        }

        .provider-option-card.selected .provider-option-text {
          color: #7A4F0B;
        }

        /* SCREEN 5: Review Cards */
        .review-pet-header-pill {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #FFFFFF;
          border: 1.2px solid #EFE8DC;
          border-radius: 14px;
          padding: 12px 14px;
          margin-bottom: 16px;
        }

        .review-pet-avatar {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          object-fit: cover;
          flex-shrink: 0;
          border: 1px solid #EFE8DC;
        }

        .review-pet-avatar.placeholder {
          background: #FAF3E3;
          border: 1px solid #E6D2AB;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .review-pet-title {
          font-size: 14.5px;
          font-weight: 800;
          color: #221711;
          margin: 0 0 2px 0;
        }

        .review-pet-breed {
          color: #C08820;
          font-weight: 700;
          font-size: 13px;
        }

        .review-owner-line {
          font-size: 12px;
          color: #7A6E63;
        }

        .review-owner-phone {
          font-size: 12px;
          font-weight: 700;
          color: #221711;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 1px;
        }

        .review-section-card {
          background: #FFFFFF;
          border: 1.2px solid #EFE8DC;
          border-radius: 14px;
          padding: 14px;
          margin-bottom: 12px;
        }

        .review-card-head {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid #F3EDE3;
        }

        .review-card-head h4 {
          margin: 0;
          font-size: 13.5px;
          font-weight: 800;
          color: #221711;
        }

        .review-grid {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .review-spec-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          font-size: 12.5px;
          gap: 12px;
        }

        .spec-label {
          color: #7A6E63;
          flex-shrink: 0;
        }

        .spec-val {
          color: #221711;
          font-weight: 600;
          text-align: right;
          word-break: break-word;
        }

        .spec-val.highlight {
          color: #C08820;
          font-weight: 800;
        }

        .spec-val.gold {
          color: #C08820;
          font-size: 16px;
        }

        .review-spec-row.total-highlight {
          margin-top: 6px;
          padding-top: 8px;
          border-top: 1px solid #F3EDE3;
        }

        /* Payment Notice (Screen 5 Match) */
        .payment-notice-card {
          background: #F0FDF4;
          border: 1.2px solid #BBF7D0;
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 18px;
        }

        .notice-icon-box {
          margin-top: 1px;
          flex-shrink: 0;
        }

        .notice-text strong {
          display: block;
          font-size: 12.5px;
          color: #166534;
          margin-bottom: 2px;
        }

        .notice-text p {
          margin: 0;
          font-size: 11.5px;
          color: #15803D;
          line-height: 1.4;
        }

        .boarding-success-icon-wrap {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: #DCFCE7;
          border: 2px solid #86EFAC;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        }

        /* ==========================================================================
           Step 5: Pet Boarding Terms & Conditions Preview Card & Acceptance
           ========================================================================== */
        .review-terms-card {
          background: #FCFAF6;
          border: 1.2px solid #E6D8C3;
          border-radius: 14px;
          margin-bottom: 16px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(43, 29, 20, 0.04);
          transition: border-color 0.2s ease;
        }

        .review-terms-card:hover {
          border-color: #DEC8A3;
        }

        .review-terms-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          cursor: pointer;
          user-select: none;
          background: #F7EFE2;
          border-bottom: 1px solid #EBDBC5;
          transition: background-color 0.15s ease;
        }

        .review-terms-header:hover {
          background: #F3E7D3;
        }

        .terms-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .terms-icon-circle {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #FAF5EB;
          border: 1px solid #DEC8A3;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .terms-card-title {
          margin: 0;
          font-size: 13.5px;
          font-weight: 800;
          color: #2B1D14;
          line-height: 1.25;
        }

        .terms-card-subtitle {
          font-size: 11.5px;
          color: #8C7866;
          display: block;
          margin-top: 2px;
        }

        .terms-expand-btn {
          color: #8C7866;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease, color 0.2s ease;
        }

        .terms-expand-btn.expanded {
          transform: rotate(180deg);
          color: #B07616;
        }

        .review-terms-content {
          padding: 12px 14px;
        }

        .terms-preview-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .terms-preview-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #4B3C32;
          line-height: 1.45;
        }

        .terms-bullet-num {
          font-weight: 700;
          color: #B07616;
          flex-shrink: 0;
          min-width: 16px;
        }

        .terms-bullet-text {
          flex: 1;
        }

        .terms-more-indicator {
          font-size: 11.5px;
          color: #9A7B56;
          font-style: italic;
          margin-top: 6px;
          padding-left: 24px;
        }

        .terms-closing-banner {
          margin-top: 10px;
          padding: 8px 12px;
          background: #FAF5EB;
          border: 1px dashed #DFCFB4;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 600;
          color: #785215;
          text-align: center;
        }

        .view-all-terms-btn {
          background: transparent;
          border: 1px solid #D8C3A0;
          border-radius: 8px;
          color: #8F5E11;
          font-weight: 700;
          font-size: 12px;
          padding: 7px 12px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: inherit;
        }

        .view-all-terms-btn:hover {
          background: #F3E7D3;
          border-color: #B07616;
          color: #704707;
        }

        .terms-acceptance-row {
          padding: 12px 14px;
          background: #FFFFFF;
          border-top: 1px solid #EFE4D2;
        }

        .terms-accept-label {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          cursor: pointer;
          user-select: none;
        }

        .terms-accept-checkbox {
          width: 18px;
          height: 18px;
          accent-color: #C08820;
          margin-top: 2px;
          cursor: pointer;
          flex-shrink: 0;
        }

        .terms-accept-text {
          font-size: 12.5px;
          color: #2B1D14;
          line-height: 1.4;
        }

        .terms-accept-text strong {
          color: #8F5E11;
        }

        .terms-validation-hint {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          padding: 6px 10px;
          background: #FFFBEB;
          border: 1px solid #FDE68A;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 600;
          color: #92400E;
          line-height: 1.35;
        }

        .submit-btn-wrap {
          width: 100%;
        }

        .boarding-primary-btn.disabled-terms {
          opacity: 0.55;
          cursor: not-allowed;
          background: #C5B69F !important;
          box-shadow: none !important;
        }

        /* Full Terms Modal */
        .terms-full-modal-card {
          background: #FFFFFF;
          border-radius: 18px;
          border: 1.5px solid #DEC8A3;
          width: 100%;
          max-width: 580px;
          max-height: calc(100dvh - 36px);
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 45px rgba(43, 29, 20, 0.25);
          overflow: hidden;
          margin: 16px;
          animation: termsModalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes termsModalPop {
          from {
            opacity: 0;
            transform: scale(0.97) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .terms-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: #FAF6EF;
          border-bottom: 1.2px solid #EFE1CC;
        }

        .terms-modal-title {
          margin: 0;
          font-size: 15.5px;
          font-weight: 800;
          color: #2B1D14;
        }

        .terms-modal-body {
          padding: 18px 20px;
          overflow-y: auto;
          flex: 1;
          -webkit-overflow-scrolling: touch;
        }

        .terms-modal-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .terms-modal-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 13px;
          color: #382D24;
          line-height: 1.5;
        }

        .terms-modal-index {
          font-weight: 800;
          color: #B07616;
          background: #F8EFE1;
          border: 1px solid #EADCC8;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .terms-modal-text {
          flex: 1;
        }

        .terms-modal-closing {
          margin-top: 18px;
          padding: 12px 14px;
          background: #FAF5EB;
          border: 1.5px dashed #DEC8A3;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          color: #785215;
          text-align: center;
        }

        .terms-modal-footer {
          padding: 14px 20px;
          background: #FAF6EF;
          border-top: 1.2px solid #EFE1CC;
        }

        /* Responsive Breakpoints */
        @media (max-width: 360px) {
          .boarding-flow-page {
            padding: 118px 10px 20px;
          }
          .boarding-card {
            padding: 16px 12px;
          }
          .field-grid-2 {
            gap: 8px;
          }
          .field-grid-3 {
            grid-template-columns: 1fr;
          }
          .food-type-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px;
          }
          .food-type-card {
            padding: 10px 8px;
            gap: 6px;
            min-height: 92px;
          }
          .food-card-label {
            font-size: 11px;
            line-height: 1.25;
          }
          .behaviour-separation-row {
            gap: 8px;
            margin-bottom: 16px;
          }
          .behaviour-separation-row .field-label {
            font-size: 10px;
            letter-spacing: 0.4px;
            min-height: 26px;
            margin-bottom: 5px;
          }
          .stepper-label {
            font-size: 8.5px;
          }
          .stepper-circle {
            width: 25px;
            height: 25px;
            font-size: 11px;
          }
        }

        @media (max-width: 290px) {
          .behaviour-separation-row {
            grid-template-columns: 1fr;
            margin-bottom: 16px;
          }
          .behaviour-separation-row .form-group:first-child {
            margin-bottom: 10px;
          }
        }

        @media (min-width: 641px) {
          .boarding-flow-page {
            padding: 132px 16px 32px;
          }
        }
      `}</style>
    </div>
  )
}
