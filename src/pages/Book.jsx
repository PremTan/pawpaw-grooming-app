// src/pages/Book.jsx
import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import { SERVICES, PET_TYPES, DOG_BREEDS, CAT_BREEDS, BOOKING_STATUS, buildWhatsAppMessage } from '../utils/services'
import { Calendar, Clock, CheckCircle, ChevronLeft, Home, Plus, Store, X } from 'lucide-react'
import { format, addDays, startOfToday } from 'date-fns'
import { fetchBookingSettings, getAvailabilityForDate, getBookingTypeLabel } from '../utils/bookingSettings'
import { fetchBusinessInfo } from '../utils/businessInfo'

const getPackageBasePrice = (pkg) => {
  if (typeof pkg.price === 'number') return pkg.price

  const priceText = String(pkg.price || pkg.priceRange || '')
  const values = priceText
    .match(/\d[\d,]*(?:\.\d+)?/g)
    ?.map(value => Number(value.replace(/,/g, '')))
    .filter(value => Number.isFinite(value) && value > 0) || []

  return values.length ? Math.min(...values) : 0
}

export default function Book() {
  const { user } = useAuth()
  const { sendNotification } = useNotifications()
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
  const [shopName, setShopName] = useState('Pet Grooming')
  const [bookingSettings, setBookingSettings] = useState(null)

  useEffect(() => {
    bookingTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [step, done])

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
      setShopName(businessInfo.contact.shopName || 'Pet Grooming')
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
    if (!form.date || selectedServices.length === 0) {
      setBookedSlots([])
      return
    }
    async function fetchBooked() {
      try {
        const q = query(
          collection(db, 'bookings'),
          where('date', '==', form.date),
          where('status', 'in', [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED])
        )
        const snap = await getDocs(q)
        const slotCounts = {}
        snap.docs
          .map(d => d.data())
          .filter(b => {
            const bookingServices = Array.isArray(b.serviceIds) ? b.serviceIds : [b.serviceId]
            return bookingServices.some(id => selectedServices.includes(id)) && (b.bookingType || 'store') === form.bookingType
          })
          .forEach(b => { slotCounts[b.slot] = (slotCounts[b.slot] || 0) + 1 })
        const capacity = Math.max(1, Number(bookingSettings?.slotCapacity || 1))
        setBookedSlots(Object.entries(slotCounts).filter(([, count]) => count >= capacity).map(([slot]) => slot))
      } catch {}
    }
    fetchBooked()
  }, [form.date, form.bookingType, selectedServices, bookingSettings])

  const availability = getAvailabilityForDate(bookingSettings || undefined, form.date)
  const availableSlots = form.bookingType === 'home' ? availability.homeSlots : availability.storeSlots
  const visitOptions = [
    { type: 'store', label: 'In Store', icon: <Store size={15} />, slots: availability.storeSlots },
    { type: 'home', label: 'Home Visit', icon: <Home size={15} />, slots: availability.homeSlots },
  ].filter(option => option.slots.length > 0)
  const update = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const visibleServices = SERVICES
    .filter(s => serviceDetails[s.id]?.active !== false)
    .map(s => ({
      ...s,
      name: serviceDetails[s.id]?.name || s.name,
      price: serviceDetails[s.id]?.price || s.price,
      duration: serviceDetails[s.id]?.duration || s.duration,
    }))
  const selectedService = visibleServices.find(s => s.id === selectedServices[0])
  const selectedServiceList = visibleServices.filter(s => selectedServices.includes(s.id))
  const serviceLabel = selectedServiceList.map(s => s.name).join(', ')
  const selectedPet = pets.find(p => p.id === selectedPetId)
  const breedSuggestions = form.petType === 'Dog' ? DOG_BREEDS : form.petType === 'Cat' ? CAT_BREEDS : []
  const selectedPkgs = packages.filter(p => selectedPackages.includes(p.id))
  const bookingLabel = serviceLabel || selectedPkgs.map(p => p.name).join(', ')

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

  const serviceTotal = () => {
    let base = selectedServiceList.reduce((sum, service) => sum + (service.basePrice || 0), 0)
    selectedPkgs.forEach(p => { base += getPackageBasePrice(p) })
    return base
  }

  const visitCharge = () => {
    if (!bookingSettings?.fixedVisitCharges) return 0
    const raw = form.bookingType === 'home' ? bookingSettings.homeVisitCharge : bookingSettings.centerVisitCharge
    return Number(raw || 0) || 0
  }

  const totalAmount = () => serviceTotal() + visitCharge()

  const totalPrice = () => {
    const total = totalAmount()
    return total > 0 ? `Rs ${total}+` : selectedService?.price || ''
  }

  const handleSubmit = async () => {
    if ((selectedServices.length === 0 && selectedPackages.length === 0) || !form.petName || !form.ownerName || !form.phone || !form.date || !form.slot || !availableSlots.includes(form.slot) || (form.bookingType === 'home' && !form.address.trim())) return
    setLoading(true)
    try {
      const breed = form.customBreed || form.petBreed
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
        isWalkIn: false,
        status: BOOKING_STATUS.PENDING,
        createdAt: serverTimestamp(),
      }
      const ref = await addDoc(collection(db, 'bookings'), bookingData)
      setBookingRef({ id: ref.id, ...bookingData })



      setDone(true)
    } catch { alert('Booking failed. Please try again.') }
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
            { label: 'Address',    value: form.bookingType === 'home' ? form.address : null },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)', fontSize: '13px' }}>{row.label}</span>
              <span style={{ color: row.gold ? 'var(--accent)' : 'var(--text)', fontSize: '13px', fontWeight: row.gold ? 700 : 500, fontFamily: row.gold ? '"DM Mono",monospace' : 'inherit' }}>{row.value}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="btn" style={{ background: '#25D366', color: '#fff', padding: '12px 24px' }}>💬 Send to WhatsApp</a>
          <button onClick={() => navigate('/my-bookings')} className="btn btn-primary">View My Bookings</button>
          <button onClick={() => { setDone(false); setStep(1); setForm(p => ({ ...p, slot: '' })) }} className="btn btn-secondary">Book Another</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={S.page}>
      <div ref={bookingTopRef} style={S.wrap}>
        <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '32px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>Book Appointment</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '28px', fontSize: '14px' }}>Fill the details below to schedule your visit</p>

        {/* Steps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '28px', flexWrap: 'wrap' }}>
          {[{ n: 1, label: 'Service' }, { n: 2, label: 'Pet Details' }, { n: 3, label: 'Date & Time' }].map((s, i, arr) => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={S.stepNum(s.n)}>{step > s.n ? '✓' : s.n}</div>
                <span style={{ fontSize: '10px', color: step === s.n ? 'var(--accent)' : 'var(--muted)', fontWeight: step === s.n ? 700 : 400 }}>{s.label}</span>
              </div>
              {i < arr.length - 1 && <div style={{ width: '32px', height: '2px', background: step > s.n ? 'var(--accent)' : 'var(--border)', borderRadius: '1px', marginBottom: '16px' }} />}
            </div>
          ))}
        </div>

        <div style={S.card}>
          {/* Step 1 — Service */}
          {step === 1 && (
            <div>
              <h2 style={{ fontWeight: 700, color: 'var(--text)', fontSize: '18px', marginBottom: '6px' }}>Choose a Service</h2>
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>Select one or more services</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', marginBottom: '24px' }}>
                {visibleServices.map(s => {
                  const sel = selectedServices.includes(s.id)
                  return (
                    <button key={s.id} onClick={() => toggleService(s.id)}
                      style={{
                        padding: '14px', borderRadius: '12px', textAlign: 'left', cursor: 'pointer',
                        border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                        background: sel ? 'var(--accent-bg)' : 'var(--surface)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '24px', marginBottom: '8px' }}>{s.icon}</div>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: sel ? 'var(--accent)' : 'var(--text)', marginBottom: '2px' }}>{s.name}</div>
                          <div style={{ color: 'var(--accent)', fontSize: '11px', fontFamily: '"DM Mono",monospace' }}>{s.price}</div>
                        </div>
                        <div style={{
                          width: '22px', height: '22px', borderRadius: '7px', flexShrink: 0,
                          border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                          background: sel ? 'var(--accent)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#000', fontWeight: 700, fontSize: '12px',
                          transition: 'all 0.15s ease',
                        }}>
                          {sel ? '✓' : ''}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Add-on packages */}
              {packages.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontWeight: 700, color: 'var(--text)', fontSize: '15px', marginBottom: '4px' }}>Add-on Packages</h3>
                  <p style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '14px' }}>Select multiple packages to combine services</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {packages.map(pkg => {
                      const sel = selectedPackages.includes(pkg.id)
                      const togglePkg = (pkgId) => {
                        setSelectedPackages(prev =>
                          prev.includes(pkgId)
                            ? prev.filter(id => id !== pkgId)
                            : [...prev, pkgId]
                        )
                      }
                      return (
                        <div
                          key={pkg.id}
                          onClick={() => togglePkg(pkg.id)}
                          style={{
                            border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: '12px',
                            padding: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            background: sel ? 'var(--accent-bg)' : 'var(--surface)',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: sel ? 'var(--accent)' : 'var(--text)', fontSize: '14px', marginBottom: '2px' }}>{pkg.name}</div>
                              {pkg.description && <div style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '4px' }}>{pkg.description}</div>}
                              <div style={{ color: 'var(--accent)', fontFamily: '"DM Mono",monospace', fontWeight: 700, fontSize: '13px' }}>{pkg.priceRange || (pkg.price ? `₹${pkg.price}` : '')}</div>
                            </div>
                            {/* Checkbox */}
                            <div style={{
                              width: '24px', height: '24px', borderRadius: '7px', flexShrink: 0,
                              border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                              background: sel ? 'var(--accent)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#000', fontWeight: 700, fontSize: '13px',
                              transition: 'all 0.15s ease',
                            }}>
                              {sel ? '✓' : ''}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Price estimate */}
              {selectedServices.length > 0 && (
                <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--muted)', fontSize: '13px' }}>Estimated Total</span>
                  <span style={{ color: 'var(--accent)', fontFamily: '"DM Mono",monospace', fontWeight: 800, fontSize: '16px' }}>{totalPrice()}</span>
                </div>
              )}

              <button onClick={() => setStep(2)} disabled={selectedServices.length === 0 && selectedPackages.length === 0} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Continue</button>
            </div>
          )}

          {/* Step 2 — Pet & Owner details */}
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
                              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🐾</div>
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ color: sel ? 'var(--accent)' : 'var(--text)', fontSize: '13px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pet.name}</div>
                              <div style={{ color: 'var(--muted)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pet.type}{pet.breed ? ` · ${pet.breed}` : ''}</div>
                            </div>
                            <div style={{
                              width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                              border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                              background: sel ? 'var(--accent)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#000', fontWeight: 700, fontSize: '11px',
                            }}>
                              {sel ? '✓' : ''}
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

          {/* Step 3 — Date & Slot */}
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
                  {availableSlots.map(slot => (
                    <button key={slot} disabled={bookedSlots.includes(slot)} onClick={() => update('slot', slot)}
                      className={`slot-btn${form.slot === slot ? ' selected' : ''}`}
                      style={{ opacity: bookedSlots.includes(slot) ? 0.3 : 1 }}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
                {availableSlots.length === 0 ? (
                  <p style={{ color: '#ef4444', fontSize: '11px', marginTop: '8px' }}>No slots are enabled for this visit type.</p>
                ) : (
                  <p style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '8px' }}>Faded slots are already booked. Slots are managed by admin.</p>
                )}
              </div>

              {form.slot && (
                <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
                  <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '13px', marginBottom: '12px' }}>📋 Booking Summary</p>
                  {[
                    { k: 'Service', v: serviceLabel },
                    { k: 'Package', v: !serviceLabel && selectedPkgs.length > 0 ? selectedPkgs.map(p => p.name).join(', ') : null },
                    { k: 'Add-ons', v: selectedPkgs.length > 0 ? selectedPkgs.map(p => p.name).join(', ') : null },
                    { k: 'Pet',     v: `${form.petName} (${form.petType})` },
                    { k: 'Visit Type', v: getBookingTypeLabel(form.bookingType) },
                    { k: 'Date',    v: form.date },
                    { k: 'Time',    v: form.slot },
                    { k: 'Address', v: form.bookingType === 'home' ? form.address : null },
                    { k: 'Visit Charge', v: visitCharge() > 0 ? `Rs ${visitCharge()}` : null },
                    { k: 'Est. Total', v: totalPrice() },
                  ].filter(r => r.v).map(row => (
                    <div key={row.k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: 'var(--muted)', fontSize: '13px' }}>{row.k}</span>
                      <span style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500, maxWidth: '200px', textAlign: 'right' }}>{row.v}</span>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={handleSubmit} disabled={!form.slot || !availableSlots.includes(form.slot) || (form.bookingType === 'home' && !form.address.trim()) || loading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Booking…' : 'Confirm Booking'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}





