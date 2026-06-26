// src/pages/Home.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'
import { SERVICES } from '../utils/services'
import { DEFAULT_FEATURES, normalizeFeature } from '../utils/siteContent'
import { countOpenDays } from '../utils/bookingSettings'
import { buildGeneralWhatsAppMessage, fetchBusinessInfo } from '../utils/businessInfo'
import { Calendar, MapPin, Phone, ChevronRight, Award, Clock, Shield, Star, ChevronLeft, ArrowRight, Images, X, Package, Scissors, Heart, ExternalLink, Home as HomeIcon, Store, Crown, BadgeCheck, Sparkles, PawPrint } from 'lucide-react'

const DEFAULT_HERO_IMAGES = []
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

function HeroSlider() {
  const [current, setCurrent] = useState(0)
  const [heroImages, setHeroImages] = useState(null)
  const [visitImages, setVisitImages] = useState(DEFAULT_VISIT_IMAGES)
  const [paused, setPaused] = useState(false)

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
              src: image.url,
              alt: image.alt || `Pet grooming hero image ${index + 1}`,
            }))
          : []
        const savedVisitImages = Array.isArray(data.visitImages) ? data.visitImages : []
        const cleanVisitImages = DEFAULT_VISIT_IMAGES.map((fallback, index) => ({
          ...fallback,
          url: savedVisitImages[index]?.url || '',
          alt: savedVisitImages[index]?.alt || fallback.alt,
        }))
        setHeroImages(cleanImages)
        setVisitImages(cleanVisitImages)
      } catch {
        setHeroImages(DEFAULT_HERO_IMAGES)
        setVisitImages(DEFAULT_VISIT_IMAGES)
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

  const slideCopy = HERO_COPY[current % HERO_COPY.length]



  const visitCards = [
    {
      title: 'Home Visit',
      text: 'We come to your doorstep',
      cta: 'Choose Home Visit',
      to: '/book?visit=home',
      icon: <HomeIcon size={30} />,
      image: visitImages[0],
    },
    {
      title: 'Visit Our Centre',
      text: 'Bring your pet to our salon',
      cta: 'Choose Our Centre',
      to: '/book?visit=centre',
      icon: <Store size={28} />,
      image: visitImages[1],
    },
  ]

  return (
    <section className="home-redesign" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="home-redesign-inner">
        <div className="mobile-hero-card">
          <div className="mobile-hero-media" aria-label="Pet grooming hero images">
            {images.length ? images.map((image, i) => (
              <img
                key={image.src}
                src={image.src}
                alt={image.alt}
                className={i === current ? 'active' : ''}
              />
            )) : <div className="mobile-hero-empty"><Scissors size={34} /><span>Add hero banners from admin</span></div>}
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
        <div className="mobile-hero-copy" key={`hero-copy-${current}`}>
          <div className="mobile-hero-text">
            <span className="mobile-hero-badge">{slideCopy.icon} {slideCopy.tag}</span>
            <h1>{slideCopy.title} <span>{slideCopy.highlight}<PawPrint className="hero-title-paw" size={34} /></span></h1>
            <p>{slideCopy.sub}</p>
          </div>
          <div className="mobile-hero-actions">
            <Link to="/book" className="btn btn-primary"><Calendar size={16} /> Book Appointment</Link>
            <Link to="/services" className="btn btn-secondary">View Services <ArrowRight size={16} /></Link>
          </div>
        </div>

        <div className="visit-choice-section">
          <div className="visit-choice-title">
            <span />
            <h2>Where would you like your pet groomed?</h2>
            <span />
          </div>
          <div className="visit-choice-grid">
            {visitCards.map((card, index) => (
              <Link key={card.title} to={card.to} className="visit-choice-card">
                <div className="visit-choice-icon">{card.icon}</div>
                <div className="visit-choice-image">
                  {card.image?.url ? (
                    <img src={card.image.url} alt={card.image.alt} />
                  ) : (
                    <div className="visit-choice-placeholder">{card.icon}</div>
                  )}
                </div>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
                <span className="visit-choice-button">{card.cta} <ArrowRight size={16} /></span>
                {index === 0 && <b className="visit-choice-or">OR</b>}
              </Link>
            ))}
          </div>
        </div>

        <div className="home-trust-strip">
          <span><Shield size={24} /> Trained & Verified Groomers</span>
          <span><BadgeCheck size={24} /> Safe, Hygienic & Loving Care</span>
          <span><Award size={24} /> Premium Quality Products</span>
          <span><Heart size={24} /> 100% Happiness Guarantee</span>
        </div>
      </div>
    </section>
  )
}
export default function Home() {
  const [stats, setStats]   = useState({ totalBookings: 0, totalReviews: 0, avgRating: 5, daysOpen: 7 })
  const [reviews, setReviews] = useState([])
  const [serviceDetails, setServiceDetails] = useState({})
  const [galleryImages, setGalleryImages] = useState([])
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [galleryLightbox, setGalleryLightbox] = useState(null)
  const [features, setFeatures] = useState(DEFAULT_FEATURES)
  const [packages, setPackages] = useState([])
  const [adminPhone, setAdminPhone] = useState('')
  const [contactAddress, setContactAddress] = useState('')
  const [contactHours, setContactHours] = useState('')
  const [shopName, setShopName] = useState('Paw Paw Pet Grooming')
  const [googleReviewUrl, setGoogleReviewUrl] = useState('')

  useEffect(() => {
    async function fetchStats() {
      const [
        bookingsResult,
        reviewsResult,
        galleryResult,
        detailsResult,
        packagesResult,
        featuresResult,
        allReviewsResult,
        homeStatsResult,
        businessInfoResult,
      ] = await Promise.allSettled([
        getDocs(collection(db, 'bookings')),
        getDocs(query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(6))),
        getDocs(query(collection(db, 'gallery'), orderBy('createdAt', 'desc'), limit(5))),
        getDocs(collection(db, 'serviceDetails')),
        getDocs(collection(db, 'packages')),
        getDoc(doc(db, 'settings', 'whyChooseUs')),
        getDocs(collection(db, 'reviews')),
        getDoc(doc(db, 'settings', 'homeStats')),
        fetchBusinessInfo(db),
      ])

      try {
        const details = {}
        if (detailsResult.status === 'fulfilled') {
          detailsResult.value.docs.forEach(d => { details[d.id] = { id: d.id, ...d.data() } })
        }

        const revs = reviewsResult.status === 'fulfilled'
          ? reviewsResult.value.docs.map(d => ({ id: d.id, ...d.data() }))
          : []
        const allRevs = allReviewsResult.status === 'fulfilled'
          ? allReviewsResult.value.docs.map(d => d.data())
          : revs
        const avg = allRevs.length
          ? (allRevs.reduce((s, r) => s + (r.rating || 5), 0) / allRevs.length).toFixed(1)
          : 5.0
        const publicStats = homeStatsResult.status === 'fulfilled' && homeStatsResult.value.exists()
          ? homeStatsResult.value.data()
          : {}
        const scheduleDaysOpen = businessInfoResult.status === 'fulfilled'
          ? countOpenDays(businessInfoResult.value.bookingSettings)
          : null
        setStats({
          totalBookings: Number(publicStats.totalBookings ?? (bookingsResult.status === 'fulfilled' ? bookingsResult.value.size : 0)),
          totalReviews: Number(publicStats.totalReviews ?? allRevs.length),
          avgRating: publicStats.avgRating ?? avg,
          daysOpen: scheduleDaysOpen ?? Number(publicStats.daysOpen ?? 7),
        })
        setReviews(revs)
        setServiceDetails(details)
        if (packagesResult.status === 'fulfilled') {
          setPackages(packagesResult.value.docs.map(d => ({ id: d.id, ...d.data() })).filter(pkg => pkg.active !== false))
        }
        if (galleryResult.status === 'fulfilled') {
          setGalleryImages(galleryResult.value.docs.map(d => ({ id: d.id, ...d.data() })).filter(image => image.url).slice(0, 5))
        }
        const savedFeatures = featuresResult.status === 'fulfilled' && featuresResult.value.exists() && Array.isArray(featuresResult.value.data().features)
          ? featuresResult.value.data().features
          : []
        const cleanFeatures = savedFeatures
          .filter(item => item?.title || item?.desc)
          .slice(0, 3)
          .map((item, index) => {
            const fallback = DEFAULT_FEATURES[index] || { icon: 'star', title: 'Trusted Care', desc: 'Thoughtful service for every pet' }
            const normalized = normalizeFeature(item, fallback)
            return {
              icon: FEATURE_ICONS[normalized.icon] ? normalized.icon : fallback.icon,
              title: normalized.title,
              desc: normalized.desc,
            }
          })
        if (cleanFeatures.length) setFeatures(cleanFeatures)
        if (businessInfoResult.status === 'fulfilled') {
          const info = businessInfoResult.value
          setAdminPhone(info.whatsappNumber || '')
          setContactAddress(info.contact.address || '')
          setContactHours(info.hoursText || '')
          setShopName(info.contact.shopName || 'Paw Paw Pet Grooming')
          setGoogleReviewUrl(info.contact.googleReviewUrl || '')
        }
      } catch {}
    }
    fetchStats()
  }, [])

  useEffect(() => {
    if (galleryImages.length <= 1) return
    const t = setInterval(() => {
      setGalleryIndex(i => (i + 1) % galleryImages.length)
    }, 4200)
    return () => clearInterval(t)
  }, [galleryImages.length])

  const homeServices = SERVICES
    .filter(s => serviceDetails[s.id]?.active !== false)
    .map(s => ({
      ...s,
      name: serviceDetails[s.id]?.name || s.name,
      description: serviceDetails[s.id]?.summary || serviceDetails[s.id]?.description || s.description,
      price: serviceDetails[s.id]?.price || s.price,
      duration: serviceDetails[s.id]?.duration || s.duration,
    }))

  return (
    <div style={{ background: 'var(--bg)' }}>
      {/* Hero slider */}
      <HeroSlider />

      {/* Features */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '76px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p className="section-label" style={{ marginBottom: '10px' }}>Why Choose Us</p>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 800, color: 'var(--text)' }}>
            Trusted by Pet Parents
          </h2>
        </div>
        <div className="why-choose-grid">
          {features.map((f, i) => (
            <div key={`${f.title}-${i}`} className="why-choose-card fade-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="why-choose-icon">
                {FEATURE_ICONS[f.icon] || FEATURE_ICONS.star}
              </div>
              <span className="why-choose-number">0{i + 1}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Services preview */}
      <div style={{ background: 'var(--surface)', padding: '70px 0', borderTop: '1px solid var(--border)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '44px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <p className="section-label" style={{ marginBottom: '10px' }}>What We Offer</p>
              <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 800, color: 'var(--text)' }}>
                Our Services
              </h2>
            </div>
            <Link to="/services" className="btn btn-secondary" style={{ fontSize: '13px', padding: '9px 20px' }}>
              View All <ArrowRight size={15} />
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '18px' }}>
            {homeServices.slice(0, 6).map((s, i) => (
              <Link
                key={s.id}
                to={`/services/${s.id}`}
                className="service-preview-card fade-up"
                style={{ animationDelay: `${i * 0.08}s`, '--service-color': s.color || 'var(--accent)' }}
              >
                <div className="service-preview-top">
                  <div className="service-preview-icon">{s.icon}</div>
                  <span className="service-preview-arrow"><ArrowRight size={16} /></span>
                </div>
                <h3 className="service-preview-title">{s.name}</h3>
                <p className="service-preview-desc">{s.description}</p>
                <div className="service-preview-meta">
                  <span className="service-preview-price">{s.price}</span>
                  <span className="service-preview-duration">
                    <Clock size={11} /> {s.duration}
                  </span>
                </div>
              </Link>
            ))}
            {packages.map((pkg, i) => (
              <Link
                key={pkg.id}
                to={`/book?package=${pkg.id}`}
                className="service-preview-card fade-up"
                style={{ animationDelay: `${(homeServices.slice(0, 6).length + i) * 0.08}s`, '--service-color': 'var(--accent)' }}
              >
                <div className="service-preview-top">
                  <div className="service-preview-icon"><Package size={30} /></div>
                  <span className="service-preview-arrow"><ArrowRight size={16} /></span>
                </div>
                <h3 className="service-preview-title">{pkg.name}</h3>
                <p className="service-preview-desc">
                  {pkg.description || 'Custom grooming package'}
                </p>
                {pkg.services?.length > 0 && (
                  <div style={{ display: 'grid', gap: '5px', margin: '-4px 0 16px' }}>
                    {pkg.services.slice(0, 4).map((item, index) => (
                      <span key={index} style={{ color: 'var(--text)', fontSize: '12px', lineHeight: 1.45 }}>
                        <span style={{ color: 'var(--accent)', fontWeight: 900 }}>+</span> {item}
                      </span>
                    ))}
                  </div>
                )}
                <div className="service-preview-meta">
                  <span className="service-preview-price">{pkg.priceRange || (pkg.price ? `Rs. ${pkg.price}` : 'Price TBD')}</span>
                  <span className="service-preview-duration">
                    <Clock size={11} /> {pkg.duration || 'Package'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Gallery preview */}
{galleryImages.length > 0 && (
  <div style={{ padding: '70px 0' }}>
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div>
          <p className="section-label" style={{ marginBottom: '10px' }}>Our Work</p>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 800, color: 'var(--text)' }}>Gallery</h2>
          <p style={{ color: 'var(--muted)', fontSize: '14px', marginTop: '8px' }}>Recent grooming moments from the salon.</p>
        </div>
        <Link to="/gallery" className="btn btn-secondary" style={{ fontSize: '13px', padding: '9px 20px' }}>
          View All <ArrowRight size={15} />
        </Link>
      </div>

      {/* Mobile: single image slider */}
      <div className="gallery-mobile-slider">
        <div style={{
          position: 'relative',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          aspectRatio: '4/3',
          background: 'var(--surface)',
        }}>
          {galleryImages.map((image, index) => (
            <img
              key={image.id}
              src={image.url}
              alt={image.caption || 'Gallery image'}
              onClick={() => setGalleryLightbox(image)}
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover', objectPosition: 'center top',
                opacity: index === galleryIndex ? 1 : 0,
                transition: 'opacity 0.6s ease',
                cursor: 'pointer',
              }}
            />
          ))}
          {/* Overlay info */}
          <div style={{ position: 'absolute', inset: 'auto 0 0 0', padding: '16px', background: 'linear-gradient(0deg,rgba(0,0,0,0.7),transparent)' }}>
            {galleryImages[galleryIndex]?.category && (
              <div style={{ display:'inline-flex', alignItems:'center', gap:'5px', color:'#fff', background:'rgba(0,0,0,0.4)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:'999px', padding:'4px 10px', fontSize:'11px', marginBottom:'6px' }}>
                <Images size={11} /> {galleryImages[galleryIndex].category}
              </div>
            )}
            {galleryImages[galleryIndex]?.caption && (
              <p style={{ color:'#fff', fontWeight:700, fontSize:'15px' }}>{galleryImages[galleryIndex].caption}</p>
            )}
          </div>
          {/* Arrows */}
          {galleryImages.length > 1 && <>
            <button onClick={() => setGalleryIndex(i => (i - 1 + galleryImages.length) % galleryImages.length)}
              style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', width:'34px', height:'34px', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.3)', background:'rgba(0,0,0,0.45)', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setGalleryIndex(i => (i + 1) % galleryImages.length)}
              style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)', width:'34px', height:'34px', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.3)', background:'rgba(0,0,0,0.45)', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <ChevronRight size={16} />
            </button>
          </>}
        </div>
        {/* Dots */}
        {galleryImages.length > 1 && (
          <div style={{ display:'flex', justifyContent:'center', gap:'6px', marginTop:'12px' }}>
            {galleryImages.map((_, i) => (
              <button key={i} onClick={() => setGalleryIndex(i)}
                style={{ width: i === galleryIndex ? '20px' : '7px', height:'7px', borderRadius:'4px', border:'none', background: i === galleryIndex ? 'var(--accent)' : 'var(--border)', cursor:'pointer', transition:'all 0.3s', padding:0 }} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: grid */}
      <div className="gallery-desktop-grid" style={{
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: '12px',
}}>
        {galleryImages.map((image, index) => (
          <div key={image.id} onClick={() => setGalleryLightbox(image)}
            style={{ borderRadius:'14px', overflow:'hidden', border:'1px solid var(--border)', cursor:'pointer', background:'var(--surface)', position:'relative', aspectRatio:'1/1', transition:'transform 0.25s, border-color 0.25s' }}
            onMouseEnter={e => { e.currentTarget.style.transform='scale(1.03)'; e.currentTarget.style.borderColor='var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.borderColor='var(--border)' }}
          >
            <img src={image.url} alt={image.caption || 'Gallery image'}
              style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', objectPosition:'center top' }}
              loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  </div>
)}

      {/* Reviews section */}
      {reviews.length > 0 && (
        <div style={{ padding: '44px 0 52px' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
            <div style={{ textAlign: 'center', marginBottom: '44px' }}>
              <p className="section-label" style={{ marginBottom: '10px' }}>What Customers Say</p>
              <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 800, color: 'var(--text)' }}>
                Real Reviews
              </h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '18px' }}>
              {reviews.map((r, i) => (
                <div key={r.id} className="card fade-up" style={{ padding: '22px', animationDelay: `${i * 0.08}s` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {r.userPhoto
                        ? <img src={r.userPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '14px' }}>{r.userName?.[0]?.toUpperCase()}</span>
                      }
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{r.userName}</p>
                      <div style={{ display: 'flex', gap: '2px' }}>
                        {[1,2,3,4,5].map(n => (
                          <span key={n} style={{ color: n <= r.rating ? 'var(--accent)' : 'var(--border)', fontSize: '13px' }}>★</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6, fontStyle: 'italic' }}>
                    "{r.comment}"
                  </p>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <div style={{ display: 'inline-flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link to="/reviews" className="btn btn-secondary">See All Reviews <ArrowRight size={15} /></Link>
                {googleReviewUrl && (
                  <a href={googleReviewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                    Rate Us on Google <ExternalLink size={15} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Call CTA Section */}
      <div style={{ marginTop: '56px', marginBottom: '56px', maxWidth: '1200px', margin: '56px auto 56px', padding: '0 20px' }}>
        <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '20px', padding: '36px', textAlign: 'center' }}>
          <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>Not sure which service to choose?</p>
          <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '20px' }}>Call us and our team will help pick the best option for your pet.</p>
          <a href={`tel:${adminPhone}`} className="btn btn-primary" style={{ display: 'inline-flex' }}>
            📞 Call: {adminPhone}
          </a>
        </div>
      </div>

      {/* Location */}
      <div id="contact" style={{ background: 'var(--surface)', padding: '70px 0', borderTop: '1px solid var(--border)', scrollMarginTop: '84px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }} className="grid-cols-1 md:grid-cols-2">
            <div>
              <p className="section-label" style={{ marginBottom: '10px' }}>Find Us</p>
              <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 'clamp(24px,3vw,36px)', fontWeight: 800, color: 'var(--text)', marginBottom: '28px' }}>
                Visit Our Centre
              </h2>
              {[
                { icon: <MapPin size={16} />, text: contactAddress },
                { icon: <Phone size={16} />,  text: adminPhone },
                { icon: <Clock size={16} />,  text: contactHours },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '18px' }}>
                  <div style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }}>{item.icon}</div>
                  <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.6 }}>{item.text}</p>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '12px', marginTop: '28px', flexWrap: 'wrap' }}>
                <Link to="/book" className="btn btn-primary">
                  <Calendar size={16} /> Book Now
                </Link>
                <a
                  href={contactAddress ? `https://maps.google.com/?q=${encodeURIComponent(contactAddress)}` : '#'}
                  target="_blank" rel="noopener noreferrer"
                  className="btn btn-secondary"
                >
                  <MapPin size={16} /> Get Directions
                </a>
              </div>
            </div>
            <div style={{ borderRadius: '20px', overflow: 'hidden', border: '1px solid var(--border)', height: '320px' }}>
              <iframe
                title="Location"
                src={contactAddress ? `https://www.google.com/maps?q=${encodeURIComponent(contactAddress)}&output=embed` : "about:blank"}
                width="100%" height="100%"
                style={{ border: 0, filter: 'grayscale(70%) hue-rotate(180deg) invert(5%)' }}
                allowFullScreen loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp float button */}
      <a href={`https://wa.me/${adminPhone}?text=${encodeURIComponent(`Hi ${shopName}, I'm interested in booking a service for my pet. Could you help me with more details?`)}`} target="_blank" rel="noopener noreferrer" className="whatsapp-btn" title="Chat on WhatsApp">
        💬
      </a>

      {galleryLightbox && (
        <div onClick={() => setGalleryLightbox(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', cursor:'pointer' }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth:'900px', width:'100%', cursor:'default' }}>
            <button onClick={() => setGalleryLightbox(null)} aria-label="Close gallery image" style={{ marginLeft: 'auto', marginBottom: '12px', width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={18} />
            </button>
            <img src={galleryLightbox.url} alt={galleryLightbox.caption || ''} style={{ width:'100%', borderRadius:'8px', maxHeight:'80vh', objectFit:'contain' }} />
            {galleryLightbox.caption && <p style={{ color:'#fff', textAlign:'center', marginTop:'14px', fontSize:'15px' }}>{galleryLightbox.caption}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

















