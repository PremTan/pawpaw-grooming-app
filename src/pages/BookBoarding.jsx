// src/pages/BookBoarding.jsx
import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, getDoc } from 'firebase/firestore'
import { format, addDays, startOfToday } from 'date-fns'
import {
  AlertCircle,
  ArrowRight,
  Calendar,
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
  Utensils,
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
    bookingTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      } catch {}
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
      } catch {}
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
      medicalConditions: pet.notes || '',
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
      } catch {}

      setToastMessage('Boarding request sent successfully!')
      setDone(true)
    } catch (err) {
      alert(err.message || 'Failed to submit boarding request. Please try again.')
    }
    setLoading(false)
  }

  const S = {
    page: { background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' },
    wrap: { maxWidth: '720px', margin: '0 auto', padding: '36px 20px 80px' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '28px' },
    label: { fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '6px' },
    back: { display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', marginBottom: '20px', padding: 0 },
    stepNum: (s) => ({
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '13px',
      fontWeight: 700,
      background: step > s ? 'var(--gradient)' : step === s ? 'var(--accent-bg)' : 'var(--surface)',
      color: step > s ? '#000' : step === s ? 'var(--accent)' : 'var(--muted)',
      border: step > s ? 'none' : step === s ? '2px solid var(--accent)' : '1px solid var(--border)',
    }),
  }

  const whatsappLink = bookingRef
    ? (adminWhatsappNumber ? `https://wa.me/${adminWhatsappNumber}?text=${buildBoardingWhatsAppMessage(bookingRef, shopName)}` : '#')
    : '#'

  // Success view
  if (done && bookingRef) {
    return (
      <div style={S.page}>
        {toastMessage && (
          <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
            <Toast message={toastMessage} type="success" onClose={() => setToastMessage('')} />
          </div>
        )}
        <div ref={bookingTopRef} style={{ ...S.wrap, textAlign: 'center' }}>
          <div style={{ width: '84px', height: '84px', borderRadius: '50%', background: 'rgba(52,211,153,0.1)', border: '2px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', color: '#34d399' }}>
            <CheckCircle size={40} />
          </div>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '32px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>
            Boarding Request Submitted!
          </h1>
          <p style={{ color: 'var(--muted)', marginBottom: '28px', maxWidth: '520px', margin: '0 auto 28px', lineHeight: 1.6 }}>
            Thank you! Your pet boarding request has been received. The Paw Paw team will review your stay requirements and confirm your pet's suite shortly.
          </p>

          <div style={{ ...S.card, textAlign: 'left', marginBottom: '24px' }}>
            {[
              { label: 'Boarding ID', value: `#${bookingRef.id.slice(0, 8).toUpperCase()}`, highlight: true },
              { label: 'Pet Name', value: `${form.petName} (${form.petType}${form.customBreed || form.petBreed ? ` · ${form.customBreed || form.petBreed}` : ''})` },
              { label: 'Check-In', value: `${form.checkInDate} at ${form.checkInTime}` },
              { label: 'Check-Out', value: `${form.checkOutDate} at ${form.checkOutTime}` },
              { label: 'Stay Duration', value: `${stayCalculation.days} Day(s) · ${stayCalculation.nights} Night(s)` },
              { label: 'Daily Rate', value: `₹${stayCalculation.dailyRate} / day` },
              { label: 'Estimated Total', value: `₹${stayCalculation.estimatedTotal}`, highlight: true },
              { label: 'Food Plan', value: `${form.foodType} (${form.foodProvider})` },
              { label: 'Status', value: 'Pending Admin Review' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)', fontSize: '13px' }}>{row.label}</span>
                <span style={{ color: row.highlight ? 'var(--accent)' : 'var(--text)', fontSize: '13px', fontWeight: row.highlight ? 700 : 500 }}>{row.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="btn" style={{ background: '#25D366', color: '#fff', padding: '12px 24px' }}>
              <MessageCircle size={16} /> Send Details to WhatsApp
            </a>
            <button onClick={() => navigate('/my-bookings')} className="btn btn-primary">
              View My Bookings
            </button>
            <button onClick={() => { setDone(false); setStep(1) }} className="btn btn-secondary">
              Book Another Stay
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <div ref={bookingTopRef} style={S.wrap}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Paw Paw Suites
          </span>
        </div>
        <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '32px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>
          Pet Boarding Reservation
        </h1>
        <p style={{ color: 'var(--muted)', marginBottom: '24px', fontSize: '14px' }}>
          Your pet's cozy home away from home. Complete the care profile below to request a stay.
        </p>

        {boardingSettings?.acceptBookings === false && (
          <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', color: '#ca8a04', fontSize: '13px', padding: '12px 14px', borderRadius: '12px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info size={16} /> Boarding reservations are temporarily closed. You may view care and diet details, but new requests cannot be submitted at this time.
          </div>
        )}

        {isBlocked && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444', fontSize: '13px', padding: '12px 14px', borderRadius: '12px', marginBottom: '18px' }}>
            Your account is currently blocked from making bookings. Please contact Paw Paw support.
          </div>
        )}

        {/* Multi-step progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '28px', flexWrap: 'wrap' }}>
          {[
            { n: 1, label: 'Pet Details' },
            { n: 2, label: 'Stay Dates' },
            { n: 3, label: 'Food & Diet' },
            { n: 4, label: 'Daily Care' },
            { n: 5, label: 'Review' },
          ].map((s, i, arr) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={S.stepNum(s.n)}>{step > s.n ? <CheckCircle size={16} /> : s.n}</div>
                <span style={{ fontSize: '10px', color: step === s.n ? 'var(--accent)' : 'var(--muted)', fontWeight: step === s.n ? 700 : 400 }}>{s.label}</span>
              </div>
              {i < arr.length - 1 && <div style={{ width: '24px', height: '2px', background: step > s.n ? 'var(--accent)' : 'var(--border)', borderRadius: '1px', marginBottom: '16px' }} />}
            </div>
          ))}
        </div>

        <div style={S.card}>
          {/* STEP 1: PET DETAILS */}
          {step === 1 && (
            <div>
              <h2 style={{ fontWeight: 800, color: 'var(--text)', fontSize: '18px', marginBottom: '4px' }}>Pet & Owner Information</h2>
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>Choose a saved pet profile or enter details for this stay.</p>

              {/* Saved pets */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <label style={{ ...S.label, marginBottom: 0 }}>Saved Pets</label>
                  <Link to="/my-pets" style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>+ Add or manage pets</Link>
                </div>
                {pets.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                    {pets.map(pet => {
                      const sel = selectedPetId === pet.id
                      return (
                        <button
                          key={pet.id}
                          type="button"
                          onClick={() => applyPet(pet)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '10px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer',
                            border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                            background: sel ? 'var(--accent-bg)' : 'var(--surface)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {pet.photoUrl ? (
                            <img src={pet.photoUrl} alt={pet.name} style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><PawPrint size={18} /></div>
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ color: sel ? 'var(--accent)' : 'var(--text)', fontSize: '13px', fontWeight: 800 }}>{pet.name}</div>
                            <div style={{ color: 'var(--muted)', fontSize: '11px' }}>{pet.type} {pet.breed ? `· ${pet.breed}` : ''}</div>
                          </div>
                          {sel && <CheckCircle size={14} style={{ color: 'var(--accent)' }} />}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '12px', padding: '14px', fontSize: '13px', color: 'var(--muted)' }}>
                    No saved pets found. Fill in details below to continue.
                  </div>
                )}
              </div>

              {/* Owner details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={S.label}>Your Name *</label>
                  <input className="input" placeholder="Full name" value={form.ownerName} onChange={e => update('ownerName', e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Phone Number *</label>
                  <input className="input" placeholder="10-digit number" value={form.phone} maxLength={10} onChange={e => update('phone', e.target.value)} />
                </div>
              </div>

              {/* Pet basic info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={S.label}>Pet Name *</label>
                  <input className="input" placeholder="e.g. Bella" value={form.petName} onChange={e => { setSelectedPetId(''); update('petName', e.target.value) }} />
                </div>
                <div>
                  <label style={S.label}>Pet Type *</label>
                  <select className="input" value={form.petType} onChange={e => { setSelectedPetId(''); update('petType', e.target.value); update('petBreed', ''); update('customBreed', '') }}>
                    {PET_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Breed */}
              <div style={{ marginBottom: '16px' }}>
                <label style={S.label}>Breed</label>
                {breedOptions.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: form.petBreed === 'other' ? '1fr 1fr' : '1fr', gap: '10px' }}>
                    <select className="input" value={form.petBreed} onChange={e => { setSelectedPetId(''); update('petBreed', e.target.value) }}>
                      <option value="">Select breed</option>
                      {breedOptions.map(b => <option key={b}>{b}</option>)}
                      <option value="other">Other / Mixed</option>
                    </select>
                    {form.petBreed === 'other' && (
                      <input className="input" placeholder="Type breed name..." value={form.customBreed} onChange={e => update('customBreed', e.target.value)} />
                    )}
                  </div>
                ) : (
                  <input className="input" placeholder="Breed (optional)" value={form.customBreed} onChange={e => update('customBreed', e.target.value)} />
                )}
              </div>

              {/* Age, Weight, Gender */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                <div>
                  <label style={S.label}>Date of Birth / Age</label>
                  <input type="date" className="input" value={form.petDob} onChange={e => update('petDob', e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Weight (Kg)</label>
                  <input className="input" placeholder="e.g. 12" value={form.petWeight} onChange={e => update('petWeight', e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Gender</label>
                  <select className="input" value={form.petGender} onChange={e => update('petGender', e.target.value)}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
              </div>

              {/* Vaccination & Health */}
              <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <ShieldCheck size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>Health & Vaccination Safety</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={S.label}>Vaccination Status *</label>
                    <select className="input" value={form.vaccinationStatus} onChange={e => update('vaccinationStatus', e.target.value)}>
                      <option>Fully Vaccinated</option>
                      <option>Partially Vaccinated</option>
                      <option>Due Soon / Needs Verification</option>
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Last Vaccination Date / Notes</label>
                    <input className="input" placeholder="e.g. Rabies & DHPPiL on Jan 2026" value={form.vaccinationNotes} onChange={e => update('vaccinationNotes', e.target.value)} />
                  </div>
                </div>
                <div>
                  <label style={S.label}>Existing Medical Conditions or Regular Medicines (if any)</label>
                  <input className="input" placeholder="e.g. Arthritis, skin allergy, ear drops twice a day" value={form.medicalConditions} onChange={e => update('medicalConditions', e.target.value)} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!form.ownerName.trim() || !form.phone.trim() || !form.petName.trim()}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Continue to Stay Details <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* STEP 2: STAY DETAILS */}
          {step === 2 && (
            <div>
              <button style={S.back} onClick={() => setStep(1)}><ChevronLeft size={16} /> Back</button>
              <h2 style={{ fontWeight: 800, color: 'var(--text)', fontSize: '18px', marginBottom: '4px' }}>Stay Duration & Schedule</h2>
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>Choose check-in and check-out dates for your pet's boarding stay.</p>

              {/* Pricing banner */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: '14px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ color: 'var(--accent)', fontWeight: 800, fontSize: '14px' }}>
                    {form.petType} Boarding Rate: ₹{stayCalculation.dailyRate} / day
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '12px' }}>
                    Dogs ₹800/day · Cats ₹600/day · 24/7 care included
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>ESTIMATED TOTAL</span>
                  <strong style={{ fontSize: '18px', color: 'var(--accent)' }}>₹{stayCalculation.estimatedTotal}</strong>
                </div>
              </div>

              {/* Check-in */}
              <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '14px' }}>
                <label style={{ ...S.label, color: 'var(--text)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={13} style={{ color: 'var(--accent)' }} /> Check-In Schedule *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={S.label}>Date</label>
                    <input
                      type="date"
                      className="input"
                      min={todayStr}
                      value={form.checkInDate}
                      onChange={e => {
                        update('checkInDate', e.target.value)
                        if (e.target.value > form.checkOutDate) update('checkOutDate', e.target.value)
                      }}
                    />
                  </div>
                  <div>
                    <label style={S.label}>Approx. Time</label>
                    <select className="input" value={form.checkInTime} onChange={e => update('checkInTime', e.target.value)}>
                      {TIME_SLOT_OPTIONS.map(slot => <option key={`in-${slot}`}>{slot}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Check-out */}
              <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '20px' }}>
                <label style={{ ...S.label, color: 'var(--text)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={13} style={{ color: 'var(--accent)' }} /> Check-Out Schedule *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={S.label}>Date</label>
                    <input
                      type="date"
                      className="input"
                      min={form.checkInDate || todayStr}
                      value={form.checkOutDate}
                      onChange={e => update('checkOutDate', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={S.label}>Approx. Time</label>
                    <select className="input" value={form.checkOutTime} onChange={e => update('checkOutTime', e.target.value)}>
                      {TIME_SLOT_OPTIONS.map(slot => <option key={`out-${slot}`}>{slot}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Calculation summary */}
              {!stayCalculation.valid ? (
                <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '12px', borderRadius: '12px', fontSize: '13px', marginBottom: '20px' }}>
                  {stayCalculation.error}
                </div>
              ) : (
                <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                    <span style={{ color: 'var(--muted)' }}>Calculated Duration:</span>
                    <strong style={{ color: 'var(--text)' }}>{stayCalculation.days} Day(s) {stayCalculation.nights > 0 ? `(${stayCalculation.nights} Nights)` : '(Day Stay)'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                    <span style={{ color: 'var(--muted)' }}>Rate per day:</span>
                    <span style={{ color: 'var(--text)' }}>₹{stayCalculation.dailyRate}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)', fontSize: '14px' }}>
                    <strong style={{ color: 'var(--text)' }}>Estimated Boarding Total:</strong>
                    <strong style={{ color: 'var(--accent)', fontSize: '16px' }}>₹{stayCalculation.estimatedTotal}</strong>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!stayCalculation.valid}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Continue to Food & Feeding <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* STEP 3: FOOD AND FEEDING */}
          {step === 3 && (
            <div>
              <button style={S.back} onClick={() => setStep(2)}><ChevronLeft size={16} /> Back</button>
              <h2 style={{ fontWeight: 800, color: 'var(--text)', fontSize: '18px', marginBottom: '4px' }}>Food & Dietary Preferences</h2>
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>Help us ensure your pet gets their favorite, familiar meals.</p>

              {/* Food Type */}
              <div style={{ marginBottom: '16px' }}>
                <label style={S.label}>Type of Food *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {FOOD_TYPES.map(ft => {
                    const sel = form.foodType === ft.label
                    return (
                      <button
                        key={ft.id}
                        type="button"
                        onClick={() => update('foodType', ft.label)}
                        style={{
                          textAlign: 'left', padding: '12px', borderRadius: '12px', cursor: 'pointer',
                          border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                          background: sel ? 'var(--accent-bg)' : 'var(--surface)',
                          color: sel ? 'var(--accent)' : 'var(--text)',
                          fontSize: '13px', fontWeight: sel ? 700 : 500,
                        }}
                      >
                        {ft.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Food Provider */}
              <div style={{ marginBottom: '16px' }}>
                <label style={S.label}>Who Provides the Food? *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {FOOD_PROVIDERS.map(fp => {
                    const sel = form.foodProvider === fp.label
                    return (
                      <button
                        key={fp.id}
                        type="button"
                        onClick={() => update('foodProvider', fp.label)}
                        style={{
                          textAlign: 'left', padding: '12px', borderRadius: '12px', cursor: 'pointer',
                          border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                          background: sel ? 'var(--accent-bg)' : 'var(--surface)',
                          color: sel ? 'var(--accent)' : 'var(--text)',
                          fontSize: '13px', fontWeight: sel ? 700 : 500,
                        }}
                      >
                        {fp.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Feeding Schedule */}
              <div style={{ marginBottom: '16px' }}>
                <label style={S.label}>Feeding Schedule & Times</label>
                <select className="input" value={form.feedingSchedule} onChange={e => update('feedingSchedule', e.target.value)}>
                  {FEEDING_FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>

              {/* Special Instructions & Allergies */}
              <div style={{ marginBottom: '16px' }}>
                <label style={S.label}>Food Allergies or Dislikes</label>
                <input className="input" placeholder="e.g. Allergic to chicken, loves boiled pumpkin / curd" value={form.allergies} onChange={e => update('allergies', e.target.value)} />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={S.label}>Diet & Drinking Water Instructions</label>
                <textarea
                  className="input"
                  rows={3}
                  style={{ resize: 'vertical' }}
                  placeholder="e.g. 1 cup kibble with warm water at 8 AM, boiled chicken & rice at 7 PM. Please provide filtered water only."
                  value={form.specialDietInstructions}
                  onChange={e => update('specialDietInstructions', e.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={() => setStep(4)}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Continue to Daily Care & Habits <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* STEP 4: ADDITIONAL CARE & BEHAVIOR */}
          {step === 4 && (
            <div>
              <button style={S.back} onClick={() => setStep(3)}><ChevronLeft size={16} /> Back</button>
              <h2 style={{ fontWeight: 800, color: 'var(--text)', fontSize: '18px', marginBottom: '4px' }}>Care Habits & Safety</h2>
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>Ensure your pet feels secure, active, and happy throughout their stay.</p>

              {/* Dog walking if Dog */}
              {form.petType === 'Dog' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={S.label}>Walking Schedule</label>
                  <select className="input" value={form.walkingFrequency} onChange={e => update('walkingFrequency', e.target.value)}>
                    {WALKING_FREQUENCIES.map(w => <option key={w}>{w}</option>)}
                  </select>
                </div>
              )}

              {/* Sleeping & Toilet Habits */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={S.label}>Sleeping Habits</label>
                  <input className="input" placeholder="e.g. Needs own bed/blanket" value={form.sleepingHabits} onChange={e => update('sleepingHabits', e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Toilet Habits</label>
                  <input className="input" placeholder="e.g. Outdoor grass, pee pad, litter" value={form.toiletHabits} onChange={e => update('toiletHabits', e.target.value)} />
                </div>
              </div>

              {/* Social Behavior & Separation anxiety */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={S.label}>Behavior around other pets</label>
                  <input className="input" placeholder="e.g. Friendly, shy, prefers solo" value={form.behaviorNotes} onChange={e => update('behaviorNotes', e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>Separation Anxiety Level</label>
                  <select className="input" value={form.separationAnxiety} onChange={e => update('separationAnxiety', e.target.value)}>
                    <option>None / Mild</option>
                    <option>Moderate (needs extra cuddles)</option>
                    <option>High (gets vocal or anxious)</option>
                  </select>
                </div>
              </div>

              {/* Emergency Contact */}
              <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                <label style={{ ...S.label, color: 'var(--text)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Phone size={13} style={{ color: 'var(--accent)' }} /> Emergency Contact (Relative / Friend)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <input className="input" placeholder="Emergency contact name" value={form.emergencyContactName} onChange={e => update('emergencyContactName', e.target.value)} />
                  <input className="input" placeholder="Emergency contact phone" maxLength={10} value={form.emergencyContactPhone} onChange={e => update('emergencyContactPhone', e.target.value)} />
                </div>
              </div>

              {/* Additional notes */}
              <div style={{ marginBottom: '20px' }}>
                <label style={S.label}>Additional Instructions or Favorite Toys/Treats</label>
                <textarea
                  className="input"
                  rows={2}
                  style={{ resize: 'vertical' }}
                  placeholder="Anything else we should know to make your pet feel at home..."
                  value={form.additionalInstructions}
                  onChange={e => update('additionalInstructions', e.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={() => setStep(5)}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Review Reservation <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* STEP 5: REVIEW AND SUBMIT */}
          {step === 5 && (
            <div>
              <button style={S.back} onClick={() => setStep(4)}><ChevronLeft size={16} /> Back</button>
              <h2 style={{ fontWeight: 800, color: 'var(--text)', fontSize: '18px', marginBottom: '4px' }}>Review Boarding Request</h2>
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>Please verify your pet's stay details before submitting.</p>

              {/* Summary card */}
              <div style={{ padding: '20px', borderRadius: '16px', background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '16px', borderBottom: '1px solid var(--border)', marginBottom: '14px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                    <PawPrint size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                      {form.petName} <span style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 600 }}>({form.petType}{form.customBreed || form.petBreed ? ` · ${form.customBreed || form.petBreed}` : ''})</span>
                    </h3>
                    <p style={{ color: 'var(--muted)', fontSize: '12px', margin: 0 }}>
                      Owner: {form.ownerName} · {form.phone}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '10px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>Check-In:</span>
                    <strong style={{ color: 'var(--text)' }}>{form.checkInDate} at {form.checkInTime}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>Check-Out:</span>
                    <strong style={{ color: 'var(--text)' }}>{form.checkOutDate} at {form.checkOutTime}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>Duration:</span>
                    <strong style={{ color: 'var(--text)' }}>{stayCalculation.days} Day(s) {stayCalculation.nights > 0 ? `(${stayCalculation.nights} Nights)` : ''}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>Food Plan:</span>
                    <span style={{ color: 'var(--text)' }}>{form.foodType} ({form.foodProvider})</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>Vaccination:</span>
                    <span style={{ color: 'var(--text)' }}>{form.vaccinationStatus}</span>
                  </div>
                  {form.emergencyContactPhone && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--muted)' }}>Emergency Contact:</span>
                      <span style={{ color: 'var(--text)' }}>{form.emergencyContactName} ({form.emergencyContactPhone})</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--border)', fontSize: '15px' }}>
                    <strong style={{ color: 'var(--text)' }}>Estimated Total:</strong>
                    <strong style={{ color: 'var(--accent)', fontSize: '18px' }}>₹{stayCalculation.estimatedTotal}</strong>
                  </div>
                </div>
              </div>

              {/* No advance payment notice */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '14px', borderRadius: '12px', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', marginBottom: '22px' }}>
                <Info size={18} style={{ color: '#34d399', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }}>
                  <strong>No advance payment required.</strong> Your request will be reviewed by our team to ensure suite availability. Payment is settled directly during pet check-in / check-out.
                </div>
              </div>

              {boardingSettings?.acceptBookings === false ? (
                <div style={{ textAlign: 'center', padding: '14px', borderRadius: '12px', background: '#F4EFE6', border: '1px solid #DFD5C5', color: '#7D6A5C', fontWeight: 700, fontSize: '14px' }}>
                  Boarding Bookings Temporarily Closed
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || isBlocked}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
                >
                  {loading ? 'Submitting Request...' : 'Submit Boarding Request'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
