// src/pages/BookBoarding.jsx
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, getDoc } from 'firebase/firestore'
import { format, addDays, startOfToday } from 'date-fns'
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle,
  ChevronLeft,
  Clock,
  Heart,
  Home,
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
    foodType: 'Packaged Pet Food (Kibble/Wet)',
    foodProvider: 'Owner will provide pet food',
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

    setLoading(true)
    try {
      const selectedPet = pets.find(p => p.id === selectedPetId)
      const finalBreed = form.customBreed || form.petBreed || ''

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
        foodType: form.foodType,
        foodProvider: form.foodProvider,
        feedingSchedule: form.feedingSchedule,
        specialDietInstructions: form.specialDietInstructions.trim(),
        waterInstructions: form.waterInstructions.trim(),

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

  // Success view
  if (done && bookingRef) {
    return (
      <div className="boarding-flow-page">
        {toastMessage && (
          <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
            <Toast message={toastMessage} type="success" onClose={() => setToastMessage('')} />
          </div>
        )}
        <div ref={bookingTopRef} className="boarding-flow-container text-center">
          <div className="boarding-success-icon-wrap">
            <CheckCircle size={44} color="#15803D" />
          </div>
          <h1 className="boarding-heading" style={{ fontSize: '26px', marginBottom: '8px' }}>
            Boarding Request Submitted!
          </h1>
          <p className="boarding-subheading" style={{ maxWidth: '480px', margin: '0 auto 24px' }}>
            Thank you! Your pet boarding request has been received. Our team will review your stay requirements and confirm your pet's suite shortly.
          </p>

          <div className="boarding-review-card" style={{ textAlign: 'left', marginBottom: '22px' }}>
            {[
              { label: 'Boarding ID', value: `#${bookingRef.id.slice(0, 8).toUpperCase()}`, highlight: true },
              { label: 'Pet Name', value: `${form.petName} (${form.petType}${displayBreed ? ` · ${displayBreed}` : ''})` },
              { label: 'Check-In', value: `${formatReviewDate(form.checkInDate, form.checkInTime)}` },
              { label: 'Check-Out', value: `${formatReviewDate(form.checkOutDate, form.checkOutTime)}` },
              { label: 'Stay Duration', value: `${stayCalculation.days} Day(s) · ${stayCalculation.nights} Night(s)` },
              { label: 'Daily Rate', value: `₹${stayCalculation.dailyRate} / day` },
              { label: 'Estimated Total', value: `₹${stayCalculation.estimatedTotal}`, highlight: true },
              { label: 'Food Plan', value: `${form.foodType} (${form.foodProvider})` },
              { label: 'Status', value: 'Pending Admin Review' },
            ].map(row => (
              <div key={row.label} className="review-spec-row">
                <span className="spec-label">{row.label}</span>
                <span className={row.highlight ? 'spec-val highlight' : 'spec-val'}>{row.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="boarding-primary-btn" style={{ background: '#25D366', textDecoration: 'none' }}>
              <MessageCircle size={16} /> Send Details to WhatsApp
            </a>
            <button onClick={() => navigate('/my-bookings')} className="boarding-secondary-btn">
              View My Bookings
            </button>
            <button onClick={() => { setDone(false); setStep(1) }} className="boarding-back-btn">
              Book Another Stay
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="boarding-flow-page">
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
                  <p className="card-subtitle">Help us ensure your pet gets their favorite, familiar meals.</p>
                </div>
              </div>

              {/* Type of Food 2x2 Grid */}
              <div className="form-section">
                <label className="field-label">TYPE OF FOOD *</label>
                <div className="food-type-grid">
                  {FOOD_TYPES.map(ft => {
                    const sel = form.foodType === ft.label
                    let IconComponent = Utensils
                    if (ft.id === 'home') IconComponent = Home
                    if (ft.id === 'mixed') IconComponent = Sparkles
                    if (ft.id === 'special') IconComponent = ShieldCheck

                    return (
                      <button
                        key={ft.id}
                        type="button"
                        onClick={() => update('foodType', ft.label)}
                        className={`food-type-card ${sel ? 'selected' : ''}`}
                      >
                        <div className="food-card-icon">
                          <IconComponent size={20} color={sel ? '#C08820' : '#8A7A68'} />
                        </div>
                        <span className="food-card-label">{ft.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Who Provides Food (Radio Stack) */}
              <div className="form-section">
                <label className="field-label">WHO PROVIDES THE FOOD? *</label>
                <div className="radio-options-stack">
                  {FOOD_PROVIDERS.map(fp => {
                    const sel = form.foodProvider === fp.label
                    return (
                      <div
                        key={fp.id}
                        onClick={() => update('foodProvider', fp.label)}
                        className={`provider-option-card ${sel ? 'selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') update('foodProvider', fp.label) }}
                      >
                        <div className={`custom-radio ${sel ? 'checked' : ''}`}>
                          {sel && <div className="radio-dot" />}
                        </div>
                        <span className="provider-option-text">{fp.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Feeding Schedule & Times */}
              <div className="form-group">
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
                <label className="field-label">FOOD ALLERGIES OR DISLIKES</label>
                <input
                  className="boarding-input"
                  placeholder="e.g. Allergic to chicken, loves boiled vegetables"
                  value={form.allergies}
                  onChange={e => update('allergies', e.target.value)}
                />
              </div>

              {/* Diet & drinking water */}
              <div className="form-group">
                <label className="field-label">DIET & DRINKING WATER INSTRUCTIONS</label>
                <textarea
                  className="boarding-textarea"
                  rows={3}
                  placeholder="e.g. 1 cup kibble with warm water at 8 AM, boiled chicken & rice at 7 PM. Please provide filtered water only."
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
                    <span className="spec-label">Food Type:</span>
                    <span className="spec-val">{form.foodType}</span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Provider:</span>
                    <span className="spec-val">{form.foodProvider}</span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Feeding:</span>
                    <span className="spec-val">{form.feedingSchedule}</span>
                  </div>
                  <div className="review-spec-row">
                    <span className="spec-label">Water / Diet Notes:</span>
                    <span className="spec-val">{form.specialDietInstructions || '1 cup kibble with warm boiled chicken & rice at 7 PM.'}</span>
                  </div>
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

              {boardingSettings?.acceptBookings === false ? (
                <div className="boarding-notice-warn text-center">
                  Boarding Bookings Temporarily Closed
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || isBlocked}
                  className="boarding-primary-btn"
                >
                  {loading ? 'Submitting Boarding Request...' : 'Submit Boarding Request →'}
                </button>
              )}

              <button type="button" onClick={() => setStep(4)} className="boarding-back-btn">
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scoped CSS Styles strictly for the 5 Booking Screens */}
      <style>{`
        .boarding-flow-page {
          background-color: #FAF7F2;
          min-height: auto;
          padding: 124px 16px 24px;
          color: #221711;
          font-family: 'DM Sans', sans-serif;
        }

        .boarding-flow-container {
          max-width: 540px;
          margin: 0 auto;
          scroll-margin-top: 130px;
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

        /* SCREEN 3: Food 2x2 Grid & Radio options */
        .food-type-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 10px;
          width: 100%;
        }

        .food-type-card {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          background: #FFFFFF;
          border: 1.2px solid #E0D5C5;
          border-radius: 12px;
          padding: 12px 10px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s ease;
          min-height: 98px;
        }

        .food-type-card.selected {
          border-color: #C08820;
          background: #FAF5EB;
        }

        .food-card-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #FAF7F2;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .food-type-card.selected .food-card-icon {
          background: #FAF3E3;
        }

        .food-card-label {
          font-size: 12px;
          font-weight: 700;
          color: #221711;
          line-height: 1.35;
          word-break: normal;
          overflow-wrap: break-word;
          white-space: normal;
        }

        .food-type-card.selected .food-card-label {
          color: #7A4F0B;
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
