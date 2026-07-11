// src/pages/Book.jsx
import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { collection, addDoc, getDocs, onSnapshot, query, where, serverTimestamp, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { ADMIN_EMAIL, db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { PET_TYPES, DOG_BREEDS, CAT_BREEDS, BOOKING_STATUS, buildWhatsAppMessage } from '../utils/services'
import { ArrowRight, Calendar, Clock, CheckCircle, ChevronLeft, Home, MessageCircle, Package as PackageIcon, PawPrint, Plus, Store } from 'lucide-react'
import { format, addDays, startOfToday } from 'date-fns'
import { fetchBookingSettings, getAvailabilityForDate, getBookingTypeLabel, getPaymentModeLabel } from '../utils/bookingSettings'
import { fetchBusinessInfo } from '../utils/businessInfo'
import { buildServiceCatalog } from '../utils/serviceCatalog'
import { renderServiceIcon } from '../utils/serviceIcons.jsx'
import Toast from '../components/Toast'

const parseSlotStart = (dateString, slotLabel) => {
  const match = String(slotLabel || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!dateString || !match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const suffix = match[3].toUpperCase()
  if (suffix === 'PM' && hour !== 12) hour += 12
  if (suffix === 'AM' && hour === 12) hour = 0
  const date = new Date(`${dateString}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

const dateKeyLocal = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const isFutureSlotForDate = (dateString, slotLabel) => {
  const start = parseSlotStart(dateString, slotLabel)
  if (!start) return false
  return start.getTime() > Date.now()
}

const getPriceRange = (value) => {
  const values = String(value || '')
    .match(/\d[\d,]*(?:\.\d+)?/g)
    ?.map(item => Number(item.replace(/,/g, '')))
    .filter(item => Number.isFinite(item) && item > 0) || []
  if (!values.length) return { min: 0, max: 0 }
  return { min: Math.min(...values), max: Math.max(...values) }
}

const getPackagePriceRange = (pkg) => getPriceRange(pkg.priceRange || pkg.price)
const SERVICE_PASTELS = ['#fde8ec', '#e8f4ff', '#fff4cf', '#e8f7ed', '#ffe9dd', '#f2e8ff', '#e8fbf7', '#fff0da']

export default function Book() {
  const { user, isBlocked } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preService = searchParams.get('service') || ''
  const prePackage = searchParams.get('package') || ''

  const bookingTopRef = useRef(null)

  const [step, setStep] = useState(1)
  const [packages, setPackages] = useState([])
  const [pets, setPets] = useState([])
  const [serviceDetails, setServiceDetails] = useState({})
  const [selectedPetId, setSelectedPetId] = useState('')
  const [selectedServices, setSelectedServices] = useState(preService ? [preService] : [])
  const [selectedPackages, setSelectedPackages] = useState([])
  const [form, setForm] = useState({
    serviceId: preService, petName: '', petType: 'Dog', petBreed: '', customBreed: '',
    ownerName: user?.displayName || '', phone: '',
    date: format(addDays(startOfToday(), 1), 'yyyy-MM-dd'), slot: '', bookingType: 'store', address: '', notes: '',
  })
  const [bookedSlots, setBookedSlots] = useState([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [bookingRef, setBookingRef] = useState(null)
  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState('')
  const [shopName, setShopName] = useState('Paw Paw Pet Grooming')
  const [bookingSettings, setBookingSettings] = useState(null)
  const [bookingToast, setBookingToast] = useState('')

  useEffect(() => {
    bookingTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [step, done])

  useEffect(() => {
    if (!bookingToast) return
    const t = window.setTimeout(() => setBookingToast(''), 3500)
    return () => window.clearTimeout(t)
  }, [bookingToast])

  // Fetch packages and service details
  useEffect(() => {
    async function init() {
      try {
        const [pSnap, dSnap] = await Promise.all([
          getDocs(collection(db, 'packages')),
          getDocs(collection(db, 'serviceDetails')),
        ])
        const details = {}
        dSnap.docs.forEach(d => { details[d.id] = { id: d.id, ...d.data() } })
        setServiceDetails(details)
        setPackages(pSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false))
      } catch {}
    }
    init()
    if (prePackage) setSelectedPackages([prePackage])
  }, [prePackage])

  useEffect(() => {
    async function fetchAdminBookingConfig() {
      const [settings, businessInfo] = await Promise.all([
        fetchBookingSettings(db),
        fetchBusinessInfo(db),
      ])
      setBookingSettings(settings)
      setAdminWhatsappNumber(businessInfo.whatsappNumber || '')
      setShopName(businessInfo.contact.shopName || 'Paw Paw Pet Grooming')
    }
    fetchAdminBookingConfig()
  }, [])
  useEffect(() => {
    async function fetchPets() {
      try {
        const q = query(collection(db, 'pets'), where('userId', '==', user.uid))
        const snap = await getDocs(q)
        const results = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        results.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        setPets(results)
      } catch {}
    }
    fetchPets()
  }, [user])

  useEffect(() => {
    async function fetchProfile() {
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
    fetchProfile()
  }, [user])

  // Fetch booked slots
  useEffect(() => {
    if (!form.date) {
      setBookedSlots([])
      return
    }
    const q = query(
      collection(db, 'bookings'),
      where('date', '==', form.date)
    )
    const unsubscribe = onSnapshot(q, (snap) => {
      const slotCounts = {}
      snap.docs
        .map(d => d.data())
        .filter(b => {
          const status = String(b.status || '').toLowerCase()
          return status !== BOOKING_STATUS.CANCELLED
        })
        .forEach(b => {
          const slot = String(b.slot || '').trim()
          if (!slot) return
          slotCounts[slot] = (slotCounts[slot] || 0) + 1
        })
      const capacity = Math.max(1, Number(bookingSettings?.slotCapacity || 1))
      const nextBooked = Object.entries(slotCounts).filter(([, count]) => count >= capacity).map(([slot]) => slot)
      setBookedSlots(nextBooked)
      setForm(prev => (prev.slot && nextBooked.includes(prev.slot) ? { ...prev, slot: '' } : prev))
    }, () => {
      setBookedSlots([])
    })
    return () => unsubscribe()
  }, [form.date, form.bookingType, bookingSettings?.slotCapacity])

  const availability = getAvailabilityForDate(bookingSettings || undefined, form.date)
  const availableSlots = form.bookingType === 'home' ? availability.homeSlots : availability.storeSlots
  const blockedDateSlots = Array.isArray(bookingSettings?.blockedSlots?.[form.date]) ? bookingSettings.blockedSlots[form.date] : []
  const isToday = form.date === dateKeyLocal()
  const bookableSlots = isToday ? availableSlots.filter(slot => isFutureSlotForDate(form.date, slot)) : availableSlots
  const visitOptions = [
    { type: 'store', label: 'In Store', icon: <Store size={15} />, slots: availability.storeSlots },
    { type: 'home', label: 'Home Visit', icon: <Home size={15} />, slots: availability.homeSlots },
  ].filter(option => option.slots.length > 0)
  const update = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const visibleServices = buildServiceCatalog(serviceDetails)
  const selectedService = visibleServices.find(s => s.id === selectedServices[0])
  const selectedServiceList = visibleServices.filter(s => selectedServices.includes(s.id))
  const serviceLabel = selectedServiceList.map(s => s.name).join(', ')
  const selectedPet = pets.find(p => p.id === selectedPetId)
  const breedSuggestions = form.petType === 'Dog' ? DOG_BREEDS : form.petType === 'Cat' ? CAT_BREEDS : []
  const selectedPkgs = packages.filter(p => selectedPackages.includes(p.id))
  const bookingLabel = serviceLabel || selectedPkgs.map(p => p.name).join(', ')
  const paymentMode = bookingSettings?.paymentMode || 'cash'

  useEffect(() => {
    if (!Object.keys(serviceDetails).length) return
    const visibleIds = new Set(visibleServices.map(s => s.id))
    setSelectedServices(prev => prev.filter(id => visibleIds.has(id)))
  }, [serviceDetails])

  const applyPet = (pet) => {
    const petBreedOptions = pet.type === 'Dog' ? DOG_BREEDS : pet.type === 'Cat' ? CAT_BREEDS : []
    setSelectedPetId(pet.id)
    setForm(prev => ({
      ...prev,
      petName: pet.name || '',
      petType: pet.type || 'Dog',
      petBreed: pet.breed && petBreedOptions.includes(pet.breed) ? pet.breed : '',
      customBreed: pet.breed && !petBreedOptions.includes(pet.breed) ? pet.breed : '',
      notes: prev.notes || pet.notes || '',
    }))
  }

  const toggleService = (serviceId) => {
    setSelectedServices(prev => {
      const next = prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]

      setForm(formPrev => ({ ...formPrev, serviceId: next[0] || '', slot: '' }))
      return next
    })
  }

  const servicePriceRange = () => selectedServiceList.reduce((total, service) => {
    const range = getPriceRange(service.price)
    const fallback = Number(service.basePrice || 0)
    const min = range.min || fallback
    const max = range.max || min
    return { min: total.min + min, max: total.max + max }
  }, { min: 0, max: 0 })

  const packagePriceRange = () => selectedPkgs.reduce((total, pkg) => {
    const range = getPackagePriceRange(pkg)
    return { min: total.min + range.min, max: total.max + (range.max || range.min) }
  }, { min: 0, max: 0 })

  const serviceTotal = () => servicePriceRange().min + packagePriceRange().min

  const visitCharge = () => {
    if (!bookingSettings?.fixedVisitCharges) return 0
    const raw = form.bookingType === 'home' ? bookingSettings.homeVisitCharge : bookingSettings.centerVisitCharge
    return Number(raw || 0) || 0
  }

  const totalAmount = () => serviceTotal() + visitCharge()

  const totalAmountMax = () => servicePriceRange().max + packagePriceRange().max + visitCharge()

  const totalPrice = () => {
    const min = totalAmount()
    const max = totalAmountMax()
    if (min > 0 && max > min) return `Rs ${min} - Rs ${max}+`
    return min > 0 ? `Rs ${min}+` : selectedService?.price || ''
  }

  const checkSlotCapacity = async (slotLabel) => {
    if (!slotLabel || !form.date) return false
    try {
      const latestSettings = await fetchBookingSettings(db)
      const q = query(
        collection(db, 'bookings'),
        where('date', '==', form.date)
      )
      const snap = await getDocs(q)
      const capacity = Math.max(1, Number(latestSettings?.slotCapacity || bookingSettings?.slotCapacity || 1))
      const count = snap.docs
        .map(d => d.data())
        .filter(b => {
          const status = String(b.status || '').toLowerCase()
          return status !== BOOKING_STATUS.CANCELLED && String(b.slot || '').trim() === String(slotLabel || '').trim()
        })
        .length
      return count >= capacity
    } catch {
      return false
    }
  }

  const pastelFor = (index) => ({ '--service-pastel': SERVICE_PASTELS[index % SERVICE_PASTELS.length] })
  const handleSubmit = async () => {
    if (isBlocked) {
      alert('Your account is blocked from booking. Please contact the admin.')
      return
    }
    if ((selectedServices.length === 0 && selectedPackages.length === 0) || !form.petName || !form.ownerName || !form.phone || !form.date || !form.slot || !bookableSlots.includes(form.slot) || bookedSlots.includes(form.slot) || blockedDateSlots.includes(form.slot) || (form.bookingType === 'home' && !form.address.trim())) return
    setLoading(true)
    try {
      const capacityReached = await checkSlotCapacity(form.slot)
      if (capacityReached) {
        alert('That time slot is no longer available. Please choose another time.')
        setLoading(false)
        return
      }
      const breed = form.customBreed || form.petBreed
      const bookingStart = parseSlotStart(form.date, form.slot)
      const bookingData = {
        ...form, serviceId: selectedServices[0] || '', petBreed: breed,
        petId: selectedPetId,
        petPhotoUrl: selectedPet?.photoUrl || '',
        petDob: selectedPet?.dob || '',
        petWeight: selectedPet?.weight || '',
        petGender: selectedPet?.gender || '',
        serviceIds: selectedServices,
        serviceNames: selectedServiceList.map(s => s.name),
        selectedPackages,
        packageNames: selectedPkgs.map(p => p.name),
        userId: user.uid, userEmail: user.email,
        serviceName: bookingLabel,
        serviceTotal: serviceTotal(),
        visitCharge: visitCharge(),
        estimatedTotal: totalAmount(),
        estimatedTotalMax: totalAmountMax(),
        paymentMode,
        isWalkIn: false,
        status: BOOKING_STATUS.PENDING,
        bookingStartAt: bookingStart ? Timestamp.fromDate(bookingStart) : null,
        createdAt: serverTimestamp(),
      }
      const ref = await addDoc(collection(db, 'bookings'), bookingData)
      setBookingRef({ id: ref.id, ...bookingData })
      setBookingToast('Thank you! Your appointment request has been submitted successfully.')
      setDone(true)
    } catch (err) { alert(err?.message || 'Booking failed. Please try again.') }
    setLoading(false)
  }

  const whatsappLink = bookingRef
    ? (adminWhatsappNumber ? `https://wa.me/${adminWhatsappNumber}?text=${buildWhatsAppMessage({ ...bookingRef, id: bookingRef.id }, shopName)}` : '#')
    : '#'

  const today  = format(startOfToday(), 'yyyy-MM-dd')
  const maxDate = format(addDays(startOfToday(), 30), 'yyyy-MM-dd')

  const S = {
    page:  { background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' },
    wrap:  { maxWidth: '680px', margin: '0 auto', padding: '40px 20px 80px' },
    card:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '32px' },
    label: { fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '6px' },
    back:  { display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', marginBottom: '20px', padding: 0 },
    stepNum: (s) => ({
      width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '13px', fontWeight: 700,
      background: step > s ? 'var(--gradient)' : step === s ? 'var(--accent-bg)' : 'var(--surface)',
      color: step > s ? '#000' : step === s ? 'var(--accent)' : 'var(--muted)',
      border: step > s ? 'none' : step === s ? '2px solid var(--accent)' : '1px solid var(--border)',
    }),
  }

  if (done && bookingRef) return (
    <div style={S.page}>
      {bookingToast && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={bookingToast} type="success" onClose={() => setBookingToast('')} />
        </div>
      )}
      <div ref={bookingTopRef} style={{ ...S.wrap, textAlign: 'center' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(52,211,153,0.1)', border: '2px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', color: '#34d399' }}>
          <CheckCircle size={36} />
        </div>
        <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: '32px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Booking Request Sent!</h2>
        <p style={{ color: 'var(--muted)', marginBottom: '28px' }}>Your appointment request has been received. We'll confirm it shortly.</p>

        <div style={{ ...S.card, textAlign: 'left', marginBottom: '20px' }}>
          {[
            { label: 'Booking ID', value: `#${bookingRef.id.slice(0, 8).toUpperCase()}`, gold: true },
            { label: 'Service',    value: bookingLabel },
            { label: 'Pet',        value: `${form.petName} (${form.petType})` },
            { label: 'Visit Type', value: getBookingTypeLabel(form.bookingType) },
            { label: 'Date',       value: form.date },
            { label: 'Time',       value: form.slot },
            { label: 'Visit Charge', value: visitCharge() > 0 ? `Rs ${visitCharge()}` : null },
            { label: 'Est. Total', value: totalPrice() },
            { label: 'Payment',    value: getPaymentModeLabel(bookingRef.paymentMode || paymentMode) },
            { label: 'Address',    value: form.bookingType === 'home' ? form.address : null },
          ].filter(row => row.value).map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)', fontSize: '13px' }}>{row.label}</span>
              <span style={{ color: row.gold ? 'var(--accent)' : 'var(--text)', fontSize: '13px', fontWeight: row.gold ? 700 : 500, fontFamily: row.gold ? '"DM Mono",monospace' : 'inherit' }}>{row.value}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="btn" style={{ background: '#25D366', color: '#fff', padding: '12px 24px' }}><MessageCircle size={16} /> Send to WhatsApp</a>
          <button onClick={() => navigate('/my-bookings')} className="btn btn-primary">View My Bookings</button>
          <button onClick={() => { setDone(false); setStep(1); setForm(p => ({ ...p, slot: '' })) }} className="btn btn-secondary">Book Another</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={S.page}>
      {bookingToast && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={bookingToast} type="success" onClose={() => setBookingToast('')} />
        </div>
      )}
      <div ref={bookingTopRef} style={S.wrap}>
        <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '32px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>Book Appointment</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '28px', fontSize: '14px' }}>Fill the details below to schedule your visit</p>
        {isBlocked && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444', fontSize: '13px', padding: '12px 14px', borderRadius: '12px', marginBottom: '18px' }}>
            Your account is blocked from creating new bookings. You can still log in and view your account.
          </div>
        )}

        {/* Steps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }}>
          {[{ n: 1, label: 'Service' }, { n: 2, label: 'Pet Details' }, { n: 3, label: 'Date & Time' }].map((s, i, arr) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={S.stepNum(s.n)}>{step > s.n ? <CheckCircle size={16} /> : s.n}</div>
                <span style={{ fontSize: '10px', color: step === s.n ? 'var(--accent)' : 'var(--muted)', fontWeight: step === s.n ? 700 : 400 }}>{s.label}</span>
              </div>
              {i < arr.length - 1 && <div style={{ width: '32px', height: '2px', background: step > s.n ? 'var(--accent)' : 'var(--border)', borderRadius: '1px', marginBottom: '16px' }} />}
            </div>
          ))}
        </div>

        <div className={step === 1 ? 'book-step-one' : undefined} style={step === 1 ? undefined : S.card}>
          {/* Step 1 - Service */}
          {step === 1 && (
            <div className="book-step-one-inner">
              <section className="book-service-panel">
                <div className="book-section-head">
                  <h2>Choose a Service</h2>
                  <p>Select one or more services</p>
                </div>

                <div className="book-service-grid">
                  {visibleServices.map((s, index) => {
                    const sel = selectedServices.includes(s.id)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleService(s.id)}
                        className={`book-selection-card${sel ? ' selected' : ''}`}
                        style={pastelFor(index)}
                      >
                        <div className="book-selection-icon" aria-hidden="true">
                          {s.iconImageUrl ? (
                            <img className="book-selection-icon-image" src={s.iconImageUrl} alt="" loading="lazy" />
                          ) : (
                            <span className="book-selection-fallback-icon">{renderServiceIcon(s.iconKey, s.icon, 28)}</span>
                          )}
                        </div>
                        <div className="book-selection-copy">
                          <strong>{s.name}</strong>
                          <span>{s.price}</span>
                        </div>
                        <div className="book-card-checkbox" aria-hidden="true">
                          {sel && <CheckCircle size={15} />}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {packages.length > 0 && (
                  <div className="book-packages-section">
                    <div className="book-section-head book-section-head-compact">
                      <h2>Add-on Packages</h2>
                      <p>Select multiple packages to combine services</p>
                    </div>
                    <div className="book-package-grid">
                      {packages.map((pkg, index) => {
                        const sel = selectedPackages.includes(pkg.id)
                        const togglePkg = (pkgId) => {
                          setSelectedPackages(prev =>
                            prev.includes(pkgId)
                              ? prev.filter(id => id !== pkgId)
                              : [...prev, pkgId]
                          )
                        }
                        return (
                          <button
                            key={pkg.id}
                            type="button"
                            onClick={() => togglePkg(pkg.id)}
                            className={`book-selection-card book-package-card${sel ? ' selected' : ''}`}
                            style={pastelFor(index + visibleServices.length)}
                          >
                            <div className="book-selection-icon" aria-hidden="true">
                              {(pkg.iconImageUrl || pkg.imageUrl || pkg.image) ? (
                                <img className="book-selection-icon-image" src={pkg.iconImageUrl || pkg.imageUrl || pkg.image} alt="" loading="lazy" />
                              ) : (
                                <span className="book-selection-fallback-icon"><PackageIcon size={28} /></span>
                              )}
                            </div>
                            <div className="book-selection-copy">
                              <strong>{pkg.name}</strong>
                              {pkg.description && <small>{pkg.description}</small>}
                              <span>{pkg.priceRange || (pkg.price ? `Rs ${pkg.price}` : '')}</span>
                            </div>
                            <div className="book-card-checkbox" aria-hidden="true">
                              {sel && <CheckCircle size={15} />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {(selectedServices.length > 0 || selectedPackages.length > 0) && (
                  <div className="book-estimate-card">
                    <span>Estimated Total</span>
                    <strong>{totalPrice()}</strong>
                  </div>
                )}

                <button onClick={() => setStep(2)} disabled={selectedServices.length === 0 && selectedPackages.length === 0} className="book-panel-continue-btn">
                  Continue <ArrowRight size={22} />
                </button>
              </section>
            </div>
          )}

          {/* Step 2 - Pet & Owner details */}
          {step === 2 && (
            <div>
              <button style={S.back} onClick={() => setStep(1)}><ChevronLeft size={16} /> Back</button>
              <h2 style={{ fontWeight: 700, color: 'var(--text)', fontSize: '18px', marginBottom: '20px' }}>Your Details</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                    <label style={{ ...S.label, marginBottom: 0 }}>Select Pet Profile</label>
                    <Link to="/my-pets" style={{ color: 'var(--accent)', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>Manage pets</Link>
                  </div>
                  {pets.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                      {pets.map(pet => {
                        const sel = selectedPetId === pet.id
                        return (
                          <button key={pet.id} onClick={() => applyPet(pet)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '10px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer',
                              border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                              background: sel ? 'var(--accent-bg)' : 'var(--surface)',
                              transition: 'all 0.15s',
                            }}
                          >
                            {pet.photoUrl ? (
                              <img src={pet.photoUrl} alt={pet.name} style={{ width: '44px', height: '44px', borderRadius: '12px', objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><PawPrint size={18} /></div>
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ color: sel ? 'var(--accent)' : 'var(--text)', fontSize: '13px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pet.name}</div>
                              <div style={{ color: 'var(--muted)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pet.type}{pet.breed ? ` - ${pet.breed}` : ''}</div>
                            </div>
                            <div style={{
                              width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                              border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                              background: sel ? 'var(--accent)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#000', fontWeight: 700, fontSize: '11px',
                            }}>
                              {sel ? <CheckCircle size={13} /> : ''}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '12px', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--muted)', fontSize: '13px' }}>No saved pets yet. You can add one or continue manually.</span>
                      <Link to="/my-pets" className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '12px' }}>
                        <Plus size={14} /> Add Pet
                      </Link>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={S.label}>Your Name *</label>
                    <input className="input" placeholder="Full name" value={form.ownerName} onChange={e => update('ownerName', e.target.value)} />
                  </div>
                  <div>
                    <label style={S.label}>Phone *</label>
                    <input className="input" placeholder="10-digit number" value={form.phone} maxLength={10} onChange={e => update('phone', e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={S.label}>Pet Name *</label>
                    <input className="input" placeholder="e.g. Bruno" value={form.petName} onChange={e => { setSelectedPetId(''); update('petName', e.target.value) }} />
                  </div>
                  <div>
                    <label style={S.label}>Pet Type *</label>
                    <select className="input" value={form.petType} onChange={e => { setSelectedPetId(''); update('petType', e.target.value); update('petBreed', ''); update('customBreed', '') }}>
                      {PET_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Breed selection */}
                <div>
                  <label style={S.label}>Breed {breedSuggestions.length > 0 ? '(select or type)' : '(optional)'}</label>
                  {breedSuggestions.length > 0 ? (
                    <div>
                      <select className="input" value={form.petBreed} onChange={e => { setSelectedPetId(''); update('petBreed', e.target.value); if (e.target.value !== 'other') update('customBreed', '') }} style={{ marginBottom: '8px' }}>
                        <option value="">Select breed</option>
                        {breedSuggestions.map(b => <option key={b}>{b}</option>)}
                        <option value="other">Other / Mixed</option>
                      </select>
                      {(form.petBreed === 'other' || !breedSuggestions.includes(form.petBreed)) && (
                        <input className="input" placeholder="Type breed name..." value={form.customBreed} onChange={e => { setSelectedPetId(''); update('customBreed', e.target.value) }} />
                      )}
                    </div>
                  ) : (
                    <input className="input" placeholder="Enter breed (optional)" value={form.customBreed} onChange={e => { setSelectedPetId(''); update('customBreed', e.target.value) }} />
                  )}
                </div>

                <div>
                  <label style={S.label}>Special Notes (optional)</label>
                  <textarea className="input" style={{ resize: 'none' }} rows={3} placeholder="Allergies, behaviour notes, special requests..." value={form.notes} onChange={e => update('notes', e.target.value)} />
                </div>
              </div>
              <button onClick={() => setStep(3)} disabled={!form.ownerName || !form.phone || !form.petName} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '20px' }}>Continue</button>
            </div>
          )}

          {/* Step 3 - Date & Slot */}
          {step === 3 && (
            <div>
              <button style={S.back} onClick={() => setStep(2)}><ChevronLeft size={16} /> Back</button>
              <h2 style={{ fontWeight: 700, color: 'var(--text)', fontSize: '18px', marginBottom: '20px' }}>Pick Date & Time</h2>

              <div style={{ marginBottom: '20px' }}>
                <label style={S.label}><Calendar size={11} style={{ display: 'inline', marginRight: '4px' }} /> Date *</label>
                <input type="date" className="input" min={today} max={maxDate} value={form.date} onChange={e => { update('date', e.target.value); update('slot', '') }} />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={S.label}>Visit Type *</label>
                {visitOptions.length === 0 ? (
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', borderRadius: '12px', padding: '12px', fontSize: '13px' }}>No appointments are available for this date.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                    {visitOptions.map(option => (
                      <button key={option.type} type="button" onClick={() => setForm(p => ({ ...p, bookingType: option.type, slot: '' }))}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', borderRadius: '12px', cursor: 'pointer', border: `1.5px solid ${form.bookingType === option.type ? 'var(--accent)' : 'var(--border)'}`, background: form.bookingType === option.type ? 'var(--accent-bg)' : 'var(--surface)', color: form.bookingType === option.type ? 'var(--accent)' : 'var(--text)', fontWeight: 700 }}>
                        {option.icon} {option.label}
                      </button>
                    ))}
                  </div>
                )}
                {bookingSettings?.fixedVisitCharges && (
                  <div style={{ marginTop: '10px', padding: '11px 12px', borderRadius: '12px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--text)', fontSize: '13px', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <span>{getBookingTypeLabel(form.bookingType)} charge</span>
                    <strong style={{ color: 'var(--accent)' }}>{visitCharge() > 0 ? 'Rs ' + visitCharge() : 'No extra charge'}</strong>
                  </div>
                )}
              </div>

              {form.bookingType === 'home' && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={S.label}>Home Visit Address *</label>
                  <textarea className="input" rows={3} value={form.address} onChange={e => update('address', e.target.value)} placeholder="Enter complete visit address" style={{ resize: 'vertical' }} />
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={S.label}><Clock size={11} style={{ display: 'inline', marginRight: '4px' }} /> Time Slot *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '8px' }}>
                  {availableSlots.map(slot => {
                    const isPast = isToday && !isFutureSlotForDate(form.date, slot)
                    const isBooked = bookedSlots.includes(slot)
                    const isBlocked = blockedDateSlots.includes(slot)
                    const isFull = isBooked
                    const disabled = isPast || isFull || isBlocked
                    return (
                      <button
                        key={slot}
                        disabled={disabled}
                        onClick={() => {
                          if (!disabled) update('slot', slot)
                        }}
                        className={`slot-btn slot-btn-available${isPast ? ' slot-btn-past' : ''}${isFull ? ' slot-btn-full' : ''}${isBlocked ? ' slot-btn-blocked' : ''}${form.slot === slot ? ' selected' : ''}`}
                        title={isBlocked ? 'Blocked by admin' : isFull ? 'This slot is full' : undefined}
                      >
                        {slot}
                      </button>
                    )
                  })}
                </div>
                {availableSlots.length === 0 ? (
                  <p style={{ color: '#ef4444', fontSize: '11px', marginTop: '8px' }}>No slots are available for this visit type.</p>
                ) : bookableSlots.length === 0 ? (
                  <p style={{ color: '#ef4444', fontSize: '11px', marginTop: '8px' }}>No future slots are available for this visit type today.</p>
                ) : (
                  <p style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '8px' }}>Green slots are available. Gray slots are past or already booked. Red slots are unavailable/blocked by admin.</p>
                )}
              </div>

              <div style={{ marginBottom: '20px', padding: '14px', borderRadius: '14px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <label style={S.label}>Payment Accepted</label>
                <div style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 800, marginBottom: '4px' }}>Owner accepts {getPaymentModeLabel(paymentMode)}</div>
                <p style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: 1.5 }}>Payment is handled directly with the owner.</p>
              </div>
              {form.slot && (
                <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
                  <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '13px', marginBottom: '12px' }}>Booking Summary</p>
                  {[
                    { k: 'Service', v: serviceLabel },
                    { k: 'Package', v: !serviceLabel && selectedPkgs.length > 0 ? selectedPkgs.map(p => p.name).join(', ') : null },
                    { k: 'Add-ons', v: serviceLabel && selectedPkgs.length > 0 ? selectedPkgs.map(p => p.name).join(', ') : null },
                    { k: 'Pet',     v: `${form.petName} (${form.petType})` },
                    { k: 'Visit Type', v: getBookingTypeLabel(form.bookingType) },
                    { k: 'Date',    v: form.date },
                    { k: 'Time',    v: form.slot },
                    { k: 'Address', v: form.bookingType === 'home' ? form.address : null },
                    { k: 'Visit Charge', v: visitCharge() > 0 ? `Rs ${visitCharge()}` : null },
                    { k: 'Est. Total', v: totalPrice() },
                    { k: 'Payment', v: getPaymentModeLabel(paymentMode) },
                  ].filter(r => r.v).map(row => (
                    <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: 'var(--muted)', fontSize: '13px' }}>{row.k}</span>
                      <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500, maxWidth: '200px', textAlign: 'right' }}>{row.v}</span>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={handleSubmit} disabled={isBlocked || !form.slot || !bookableSlots.includes(form.slot) || bookedSlots.includes(form.slot) || (form.bookingType === 'home' && !form.address.trim()) || loading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}