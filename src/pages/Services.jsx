// src/pages/Services.jsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { ArrowRight, Calendar, Clock, Flame, Package, PawPrint, Phone, Star, TrendingUp, Footprints, CheckCircle2, MapPin, X, MessageCircle, Hotel, Utensils } from 'lucide-react'
import { db } from '../firebase'
import { buildServiceCatalog } from '../utils/serviceCatalog'
import Spinner from '../components/Spinner'
import { fetchBusinessInfo } from '../utils/businessInfo'
import { fetchWalkingSettings } from '../utils/walkingSettings'
import { fetchBoardingSettings } from '../utils/boardingSettings'
import { useAuth } from '../context/AuthContext'
import petWalkingHero from '../assets/pet-walking-hero.jpg'
import boardingHeroPets from '../assets/boarding-hero-pets.png'

const cleanPrice = (value) => String(value || 'Price TBD').replace(/Ã¢â€šÂ¹/g, 'Rs ').replace(/Ã¢â‚¬â€œ/g, '-')
const badgeFor = (index, bookingCount, maxBookings, isPackage = false) => {
  if (isPackage) return { label: 'Best Value', tone: 'value', icon: Star }
  if (bookingCount >= maxBookings && bookingCount > 0) return { label: 'Trending', tone: 'trend', icon: TrendingUp }
  if (index % 2 === 1) return { label: 'Popular', tone: 'popular', icon: Flame }
  return { label: index % 3 === 0 ? 'Trending' : 'Popular', tone: index % 3 === 0 ? 'trend' : 'popular', icon: index % 3 === 0 ? TrendingUp : Flame }
}

export default function Services() {
  const { isAdmin } = useAuth()
  const [counts, setCounts] = useState({})
  const [packages, setPackages] = useState([])
  const [serviceDetails, setServiceDetails] = useState({})
  const [loading, setLoading] = useState(true)
  const [adminPhone, setAdminPhone] = useState('')
  const [walkingSettings, setWalkingSettings] = useState(null)
  const [boardingSettings, setBoardingSettings] = useState(null)
  const [showWalkingModal, setShowWalkingModal] = useState(false)
  const [showBoardingModal, setShowBoardingModal] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsSnap, pSnap, dSnap, businessInfo, walkingSet, boardingSet] = await Promise.all([
          getDoc(doc(db, 'settings', 'homeStats')),
          getDocs(collection(db, 'packages')),
          getDocs(collection(db, 'serviceDetails')),
          fetchBusinessInfo(db),
          fetchWalkingSettings(db),
          fetchBoardingSettings(db),
        ])
        const c = statsSnap.exists() && statsSnap.data().perServiceBookings ? statsSnap.data().perServiceBookings : {}
        const details = {}
        dSnap.docs.forEach(d => { details[d.id] = { id: d.id, ...d.data() } })
        setCounts(c)
        setServiceDetails(details)
        setPackages(pSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false))
        setAdminPhone(businessInfo.whatsappNumber || '')
        setWalkingSettings(walkingSet)
        setBoardingSettings(boardingSet)
      } catch { }
      setLoading(false)
    }
    fetchData()
  }, [])

  const maxBookings = useMemo(() => Math.max(...Object.values(counts).map(Number), 1), [counts])

  // Dynamic durations and prices for Pet Walking
  const walkingDurations = useMemo(() => {
    if (Array.isArray(walkingSettings?.durations) && walkingSettings.durations.length > 0) {
      return walkingSettings.durations
        .map(d => ({
          duration: Number(d.duration),
          price: Number(d.price),
          label: d.label || `${d.duration} Min Walk`,
        }))
        .filter(d => d.duration > 0 && d.price > 0)
        .sort((a, b) => a.duration - b.duration)
    }
    const fallback = []
    if (walkingSettings?.rate30Min) fallback.push({ duration: 30, price: Number(walkingSettings.rate30Min), label: '30 Min Walk' })
    if (walkingSettings?.rate45Min) fallback.push({ duration: 45, price: Number(walkingSettings.rate45Min), label: '45 Min Walk' })
    if (walkingSettings?.rate60Min) fallback.push({ duration: 60, price: Number(walkingSettings.rate60Min), label: '60 Min Walk' })
    return fallback.length > 0 ? fallback : [
      { duration: 30, price: 199, label: '30 Min Walk' },
      { duration: 45, price: 279, label: '45 Min Walk' },
      { duration: 60, price: 349, label: '60 Min Walk' },
    ]
  }, [walkingSettings])

  const minWalkingPrice = useMemo(() => {
    if (!walkingDurations.length) return 199
    return Math.min(...walkingDurations.map(d => d.price))
  }, [walkingDurations])

  const walkingDurationSummary = useMemo(() => {
    if (!walkingDurations.length) return '30 / 45... Mins'
    if (walkingDurations.length > 2) {
      return `${walkingDurations.slice(0, 2).map(d => d.duration).join(' / ')}... Mins`
    }
    return `${walkingDurations.map(d => d.duration).join(' / ')} Mins`
  }, [walkingDurations])

  // Dynamic rates for Pet Boarding
  const boardingRatesList = useMemo(() => {
    const list = []
    if (boardingSettings?.catDailyRate) list.push({ label: 'Cat', rate: Number(boardingSettings.catDailyRate) })
    if (boardingSettings?.dogDailyRate) list.push({ label: 'Dog', rate: Number(boardingSettings.dogDailyRate) })
    if (boardingSettings?.otherDailyRate) list.push({ label: 'Other Pets', rate: Number(boardingSettings.otherDailyRate) })
    if (!list.length) {
      list.push({ label: 'Cat', rate: 600 }, { label: 'Dog', rate: 800 })
    }
    return list
  }, [boardingSettings])

  const minBoardingPrice = useMemo(() => {
    if (!boardingRatesList.length) return 600
    return Math.min(...boardingRatesList.map(r => r.rate))
  }, [boardingRatesList])

  const publicServices = buildServiceCatalog(serviceDetails)
    .map((service, index) => {
      const detailImages = Array.isArray(service.images) ? service.images.filter(img => img?.url) : []
      const bookingCount = Number(counts[service.id] || 0)
      return {
        ...service,
        index,
        description: service.summary || service.description,
        imageUrl: service.iconImageUrl || detailImages[0]?.url || service.image || '',
        bookingCount,
        badge: badgeFor(index, bookingCount, maxBookings),
        bookTo: `/book?service=${service.id}`,
        detailTo: `/services/${service.id}`,
      }
    })

  const packageCards = packages.map((pkg, index) => ({
    id: pkg.id,
    index: publicServices.length + index,
    name: pkg.name,
    description: pkg.description || 'Curated grooming care bundled for a complete pet glow-up.',
    duration: pkg.duration || 'Package',
    price: pkg.priceRange || (pkg.price ? `Rs ${pkg.price}` : 'Price TBD'),
    imageUrl: pkg.imageUrl || '',
    services: Array.isArray(pkg.services) ? pkg.services : [],
    badge: badgeFor(index, 0, 1, true),
    bookTo: `/book?package=${pkg.id}`,
    detailTo: '',
    isPackage: true,
  }))

  const renderCard = (item) => {
    const popularity = item.isPackage ? 100 : Math.max(18, Math.min(((item.bookingCount || 0) / maxBookings) * 100, 100))
    return (
      <article key={`${item.isPackage ? 'pkg' : 'svc'}-${item.id}`} className="services-list-card fade-up" style={{ animationDelay: `${item.index * 0.05}s` }}>
        <div className="services-card-media">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" /> : <PawPrint size={74} />}
          <span className={`services-card-ribbon ${item.badge.tone}`}>{item.badge.label}</span>
        </div>
        <div className="services-card-body">
          <div className="services-card-title-row">
            <div>
              <h2>{item.name}</h2>
              <p>{item.description}</p>
            </div>
            <strong>{cleanPrice(item.price)}</strong>
          </div>
          <div className="services-card-time"><Clock size={16} /> {item.duration}</div>
          <div className="services-card-badges">
            {item.services?.slice(0, 2).map(service => <span key={service}><PawPrint size={14} /> {service}</span>)}
          </div>
          <div className="services-card-mobile-popularity">
            <small>Popularity {isAdmin && !item.isPackage ? `${item.bookingCount} bookings` : ''}</small>
            <i><b style={{ width: `${popularity}%` }} /></i>
          </div>
        </div>
        <div className="services-card-actions">
          {item.detailTo ? <Link to={item.detailTo} className="btn btn-secondary">View Details</Link> : <span />}
          <Link to={item.bookTo} className="btn btn-primary">{item.isPackage ? 'Book Package' : 'Book Now'} <ArrowRight size={16} /></Link>
        </div>
      </article>
    )
  }

  return (
    <div className="services-page-redesign">
      <div className="services-page-shell">
        <header className="services-page-head">
          <p className="section-label"><PawPrint size={14} /> What We Offer <PawPrint size={14} /></p>
          <h1>Our Services</h1>
          <p>Professional grooming tailored to your pet's needs, care, and personality.</p>
        </header>

        {loading ? <Spinner text="Loading services..." /> : (
          <>
            <div className="services-list-redesign">
              {publicServices.map(renderCard)}

              {/* Pet Walking Service Card */}
              <article className="services-list-card fade-up" style={{ animationDelay: `${publicServices.length * 0.05}s` }}>
                <div className="services-card-media">
                  <img
                    src={walkingSettings?.bannerImageUrl || petWalkingHero}
                    alt="Pet Walking Service"
                    loading="lazy"
                    style={{ objectFit: 'cover' }}
                    onError={e => {
                      e.currentTarget.onerror = null
                      e.currentTarget.src = petWalkingHero
                    }}
                  />
                  {(walkingSettings?.showNewBadge !== false) && <span className="services-card-ribbon trend">NEW</span>}
                </div>
                <div className="services-card-body">
                  <div className="services-card-title-row">
                    <div>
                      <h2>Pet Walking</h2>
                      <p>Daily walks, exercise and happy tails for your dog in Dhayari & nearby.</p>
                    </div>
                    <strong>From Rs {minWalkingPrice}</strong>
                  </div>
                  <div className="services-card-time"><Clock size={16} /> {walkingDurationSummary}</div>
                  <div className="services-card-badges">
                    {walkingDurations.map(d => (
                      <span key={d.duration}><Footprints size={14} /> {d.duration}m · Rs {d.price}</span>
                    ))}
                  </div>
                  <div className="services-card-mobile-popularity">
                    <small><MapPin size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> Dhayari & nearby areas</small>
                    <i><b style={{ width: '92%' }} /></i>
                  </div>
                </div>
                <div className="services-card-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowWalkingModal(true)}>
                    View Details
                  </button>
                  <Link to="/book-walking" className="btn btn-primary">
                    Book a Walk <ArrowRight size={16} />
                  </Link>
                </div>
              </article>

              {/* Pet Boarding Service Card */}
              <article className="services-list-card fade-up" style={{ animationDelay: `${(publicServices.length + 1) * 0.05}s` }}>
                <div className="services-card-media">
                  <img
                    src={boardingSettings?.bannerImageUrl || boardingHeroPets}
                    alt="Pet Boarding Service"
                    loading="lazy"
                    style={{ objectFit: 'cover' }}
                    onError={e => {
                      e.currentTarget.onerror = null
                      e.currentTarget.src = boardingHeroPets
                    }}
                  />
                  {(boardingSettings?.showNewBadge !== false) && <span className="services-card-ribbon trend">NEW</span>}
                </div>
                <div className="services-card-body">
                  <div className="services-card-title-row">
                    <div>
                      <h2>Pet Boarding</h2>
                      <p>Safe, cozy overnight stay & daycare with 24/7 loving care & updates.</p>
                    </div>
                    <strong>From Rs {minBoardingPrice} / day</strong>
                  </div>
                  <div className="services-card-time"><Clock size={16} /> Pet Hostelling</div>
                  <div className="services-card-badges">
                    {boardingRatesList.map(item => (
                      <span key={item.label}><Hotel size={14} /> {item.label}: Rs {item.rate}/day</span>
                    ))}
                  </div>
                  <div className="services-card-mobile-popularity">
                    <small><MapPin size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> CCTV supervision · Dhayari</small>
                    <i><b style={{ width: '95%' }} /></i>
                  </div>
                </div>
                <div className="services-card-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowBoardingModal(true)}>
                    View Details
                  </button>
                  <Link to="/boarding" className="btn btn-primary">
                    Book Boarding <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
            </div>

            {packageCards.length > 0 && (
              <section className="services-packages-redesign">
                <header className="services-package-head">
                  <p className="section-label"><Package size={14} /> Special Deals</p>
                  <h2>Custom Packages</h2>
                </header>
                <div className="services-list-redesign">
                  {packageCards.map(renderCard)}
                </div>
              </section>
            )}

            {/* Pet Boarding Spotlight Banner */}
            <div style={{
              margin: '36px 0 24px',
              background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(255,255,255,0.03) 100%), var(--card)',
              border: '1.5px solid var(--accent-border)',
              borderRadius: '20px',
              padding: '24px 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '18px',
            }}>
              <div>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--accent-bg)',
                  border: '1px solid var(--accent-border)',
                  color: 'var(--accent)',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  marginBottom: '8px',
                }}>
                  Overnight Stays
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' }}>
                  Looking for Pet Boarding?
                </h3>
                <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 0, maxWidth: '520px', lineHeight: 1.5 }}>
                  Spacious suites, 24/7 supervision, daily exercise, personalized feeding, and daily WhatsApp updates.
                </p>
              </div>
              <Link to="/boarding" className="btn btn-primary" style={{ padding: '12px 24px', fontSize: '14px', textDecoration: 'none' }}>
                <Calendar size={16} /> Book Pet Boarding
              </Link>
            </div>

            <div className="services-help-strip">
              <span><PawPrint size={34} /></span>
              <div>
                <strong>Not sure which service to choose?</strong>
                <p>Call us and our team will help pick the best care for your pet.</p>
              </div>
              <a href={`tel:${adminPhone}`} className="btn btn-primary"><Phone size={16} /> Call Assistance</a>
            </div>

            {/* Pet Walking Details Modal */}
            {showWalkingModal && (
              <div className="modal-overlay" onClick={() => setShowWalkingModal(false)}>
                <div className="reschedule-modal-card" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
                  <div className="reschedule-modal-header">
                    <div>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Footprints size={20} style={{ color: 'var(--accent)' }} /> Paw Paw Pet Walking Guide
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                        Professional, caring dog walkers right to your doorstep in Dhayari & nearby
                      </p>
                    </div>
                    <button type="button" className="icon-btn" onClick={() => setShowWalkingModal(false)}>
                      <X size={18} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: '12px', margin: '16px 0', maxHeight: '60vh', overflowY: 'auto' }}>
                    <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Footprints size={16} /> 1. Daily Fitness, Exercise & Play
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                        Healthy exercise tailored to your dog's energy level, breed, and age. Energetic play, sniff walks, and proper hydration throughout.
                      </p>
                    </div>

                    <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MessageCircle size={16} /> 2. Real-time WhatsApp Updates
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                        Get pick-up confirmation, walking route photos, pee/poop updates, and drop-off notes directly on WhatsApp after every walk.
                      </p>
                    </div>

                    <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} /> 3. Flexible Morning & Evening Shifts
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                        Choose from flexible {walkingDurations.map(d => `${d.duration}`).join(', ')}-minute sessions during morning (6:30 AM – 9:30 AM) and evening (5:00 PM – 8:00 PM) slots. Custom times also available on request.
                      </p>
                    </div>

                    <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MapPin size={16} /> 4. Serviceable Areas
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                        Available in Dhayari, Vadgaon Budruk, Narhe, Sinhagad Road, and surrounding neighborhoods. Free doorstep pick-up & drop-off.
                      </p>
                    </div>

                    <div style={{ padding: '14px', background: 'var(--accent-bg)', borderRadius: '14px', border: '1px solid var(--accent-border)' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px' }}>
                        Dynamic Per-Session Pricing
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
                        {walkingDurations.map((d, i) => (
                          <span key={d.duration}>
                            {i > 0 && ' · '}
                            <strong>{d.duration} Minutes:</strong> ₹{d.price}
                          </span>
                        ))}. Pay after booking confirmation or in person.
                      </div>
                    </div>
                  </div>

                  <div className="reschedule-modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowWalkingModal(false)}>
                      Close
                    </button>
                    <Link
                      to="/book-walking"
                      className="btn btn-primary"
                      onClick={() => setShowWalkingModal(false)}
                    >
                      <Footprints size={15} /> Book a Walk
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Pet Boarding Details Modal */}
            {showBoardingModal && (
              <div className="modal-overlay" onClick={() => setShowBoardingModal(false)}>
                <div className="reschedule-modal-card" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
                  <div className="reschedule-modal-header">
                    <div>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Hotel size={20} style={{ color: 'var(--accent)' }} /> Paw Paw Pet Boarding Guide
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                        Everything you need to know about our overnight hostelling care for dogs & cats
                      </p>
                    </div>
                    <button type="button" className="icon-btn" onClick={() => setShowBoardingModal(false)}>
                      <X size={18} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: '12px', margin: '16px 0', maxHeight: '60vh', overflowY: 'auto' }}>
                    <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--accent)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Hotel size={16} /> 1. Cozy, Sanitized Suites
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
                        {boardingRatesList.map((item, idx) => (
                          <span key={item.label}>
                            {idx > 0 && ' · '}
                            <strong>{item.label} Boarding:</strong> ₹{item.rate} / day
                          </span>
                        ))}. No online payments required in advance; pay upon check-in or pick-up.
                      </div>
                    </div>
                  </div>

                  <div className="reschedule-modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setShowBoardingModal(false)}>
                      Close
                    </button>
                    {(boardingSettings?.acceptBookings !== false) && (
                      <Link
                        to="/boarding"
                        className="btn btn-primary"
                        onClick={() => setShowBoardingModal(false)}
                      >
                        <Calendar size={15} /> Book Pet Boarding
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
