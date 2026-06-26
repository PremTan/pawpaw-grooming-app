// src/pages/Home.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase'
import BrandLogo from '../components/BrandLogo'
import { SERVICES } from '../utils/services'
import { DEFAULT_FEATURES, normalizeFeature } from '../utils/siteContent'
import { countOpenDays } from '../utils/bookingSettings'
import { buildGeneralWhatsAppMessage, fetchBusinessInfo } from '../utils/businessInfo'
import { Calendar, MapPin, Phone, ChevronRight, Award, Clock, Shield, Star, ChevronLeft, ArrowRight, Images, X, Package, Scissors, Heart, ExternalLink, Home as HomeIcon, Store, Crown, BadgeCheck, Sparkles, PawPrint, Navigation, Instagram, Facebook, Youtube, Twitter, Linkedin, MessageCircle } from 'lucide-react'

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

function cleanReviewText(value) {
  return String(value || '')
    .replace(/\uFFFD/g, '')
    .replace(/[?]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
}
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
  const [homePetImages, setHomePetImages] = useState({ cta: '', follow: '' })
  const [footerInfo, setFooterInfo] = useState({ tagline: '', socials: [], phones: [], email: '' })

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
        const cleanFeatures = DEFAULT_FEATURES.slice(0, 4).map((fallback, index) => {
          const saved = savedFeatures[index]
          const normalized = normalizeFeature(saved, fallback)
          return {
            icon: FEATURE_ICONS[normalized.icon] ? normalized.icon : fallback.icon,
            title: normalized.title,
            desc: normalized.desc,
          }
        })
        setFeatures(cleanFeatures)
        if (businessInfoResult.status === 'fulfilled') {
          const info = businessInfoResult.value
          setAdminPhone(info.whatsappNumber || '')
          setContactAddress(info.contact.address || '')
          setContactHours(info.hoursText || '')
          setShopName(info.contact.shopName || 'Paw Paw Pet Grooming')
          setGoogleReviewUrl(info.contact.googleReviewUrl || '')
          setHomePetImages({
            cta: info.contact.ctaPetImageUrl || '',
            follow: info.contact.followPetImageUrl || '',
          })
          setFooterInfo(info.footer || { tagline: '', socials: [], phones: [], email: '' })
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

  const shownServices = [
    ...homeServices.slice(0, 5),
    ...packages.slice(0, Math.max(0, 5 - homeServices.slice(0, 5).length)).map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description || 'Complete grooming for a clean, fresh and happy pet.',
      price: pkg.priceRange || (pkg.price ? `Rs. ${pkg.price}` : 'Price TBD'),
      duration: pkg.duration || 'Package',
      icon: <Package size={30} />,
      to: `/book?package=${pkg.id}`,
    })),
  ]

  const socialIcon = (platform) => {
    if (platform === 'instagram') return <Instagram size={18} />
    if (platform === 'facebook') return <Facebook size={18} />
    if (platform === 'youtube') return <Youtube size={18} />
    if (platform === 'twitter') return <Twitter size={18} />
    if (platform === 'linkedin') return <Linkedin size={18} />
    return <MessageCircle size={18} />
  }
  return (
    <div style={{ background: 'var(--bg)' }}>
      {/* Hero slider */}
      <HeroSlider />

      {/* Features */}
      <section className="home-why-section">
        <div className="home-why-head">
          <p className="section-label"><PawPrint size={14} /> Why Choose Us <PawPrint size={14} /></p>
          <h2>Trusted by Pet Parents</h2>
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
      </section>
      {/* Services preview */}
      <section className="home-services-mobile-section">
        <div className="home-section-card home-services-panel">
          <div className="home-section-head split">
            <div>
              <p className="section-label">What We Offer</p>
              <h2>Our Services</h2>
            </div>
            <Link to="/services" className="home-pill-link">View All <ArrowRight size={17} /></Link>
          </div>

          <div className="home-service-list">
            {shownServices.map((s, i) => (
              <Link
                key={s.id}
                to={s.to || `/services/${s.id}`}
                className="home-service-row fade-up"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <span className="home-service-icon">{s.icon}</span>
                <span className="home-service-main">
                  <strong>{s.name}</strong>
                  <small>{s.description}</small>
                </span>
                <span className="home-service-arrow"><ArrowRight size={19} /></span>
                <span className="home-service-meta">
                  <b>{s.price}</b>
                  <em><Clock size={14} /> {s.duration}</em>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery preview */}
      {galleryImages.length > 0 && (
        <section className="home-gallery-section">
          <div className="home-section-head split">
            <div>
              <p className="section-label">Our Work</p>
              <h2>Gallery</h2>
              <p>Recent grooming moments from the salon.</p>
            </div>
            <Link to="/gallery" className="home-pill-link">View All <ArrowRight size={17} /></Link>
          </div>

          <div className="gallery-mobile-slider">
            <div className="home-gallery-slider-frame">
              {galleryImages.map((image, index) => (
                <img
                  key={image.id}
                  src={image.url}
                  alt={image.caption || 'Gallery image'}
                  onClick={() => setGalleryLightbox(image)}
                  className={index === galleryIndex ? 'active' : ''}
                />
              ))}
              {galleryImages.length > 1 && <>
                <button onClick={() => setGalleryIndex(i => (i - 1 + galleryImages.length) % galleryImages.length)} aria-label="Previous gallery image"><ChevronLeft size={16} /></button>
                <button onClick={() => setGalleryIndex(i => (i + 1) % galleryImages.length)} aria-label="Next gallery image"><ChevronRight size={16} /></button>
              </>}
              <div className="home-gallery-caption">
                {galleryImages[galleryIndex]?.category && <span><Images size={14} /> {galleryImages[galleryIndex].category}</span>}
                {galleryImages[galleryIndex]?.caption && <strong>{galleryImages[galleryIndex].caption}</strong>}
              </div>
            </div>
            {galleryImages.length > 1 && (
              <div className="home-gallery-dots">
                {galleryImages.map((_, i) => (
                  <button key={i} onClick={() => setGalleryIndex(i)} className={i === galleryIndex ? 'active' : ''} aria-label={`Show gallery image ${i + 1}`} />
                ))}
              </div>
            )}
          </div>

          <div className="gallery-desktop-grid home-gallery-grid">
            {galleryImages.map((image) => (
              <button key={image.id} onClick={() => setGalleryLightbox(image)}>
                <img src={image.url} alt={image.caption || 'Gallery image'} loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Reviews section */}
      {reviews.length > 0 && (
        <section className="home-reviews-section">
          <div className="home-section-head centered decorated">
            <p className="section-label">What Customers Say</p>
            <h2>Real Reviews <PawPrint size={24} /></h2>
          </div>
          <div className="home-review-list">
            {reviews.slice(0, 3).map((r, i) => (
              <article key={r.id} className="home-review-card fade-up" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="home-review-person">
                  <div className="home-review-avatar">
                    {r.userPhoto
                      ? <img src={r.userPhoto} alt="" />
                      : <span>{r.userName?.[0]?.toUpperCase() || 'P'}</span>}
                  </div>
                  <div>
                    <strong>{r.userName || 'Pet Parent'}</strong>
                    <span>{[1,2,3,4,5].map(n => <Star key={n} size={14} fill={n <= (r.rating || 5) ? 'currentColor' : 'none'} />)}</span>
                  </div>
                </div>
                <p>&quot;{cleanReviewText(r.comment)}&quot;</p>
              </article>
            ))}
          </div>
          <div className="home-review-actions">
            <Link to="/reviews" className="btn btn-secondary">See All Reviews <ArrowRight size={16} /></Link>
            {googleReviewUrl && (
              <a href={googleReviewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                Rate Us on Google <ExternalLink size={15} />
              </a>
            )}
          </div>
        </section>
      )}

      {/* Call CTA Section */}
      <section className="home-help-cta">
        <div className="home-help-card">
          <div className="home-help-image">
            {homePetImages.cta ? <img src={homePetImages.cta} alt="Happy pet" /> : <PawPrint size={72} />}
          </div>
          <div className="home-help-copy">
            <h2>Not sure which service to choose? <PawPrint size={20} /></h2>
            <p>Call us - we're happy to help you find the best option for your pet.</p>
            <a href={`tel:${adminPhone}`} className="btn btn-primary"><Phone size={16} /> Call: {adminPhone}</a>
          </div>
        </div>
      </section>

      {/* Location */}
      <section id="contact" className="home-location-section">
        <div className="home-location-info">
          <p className="section-label">Find Us</p>
          <h2>Visit Our Centre <PawPrint size={24} /></h2>
          {[
            { icon: <MapPin size={18} />, text: contactAddress },
            { icon: <Phone size={18} />, text: adminPhone },
            { icon: <Clock size={18} />, text: contactHours },
          ].filter(item => item.text).map((item, i) => (
            <div key={i} className="home-location-line">
              {item.icon}<p>{item.text}</p>
            </div>
          ))}
          <div className="home-location-actions">
            <Link to="/book" className="btn btn-primary"><Calendar size={16} /> Book Now</Link>
            <a href={contactAddress ? `https://maps.google.com/?q=${encodeURIComponent(contactAddress)}` : '#'} target="_blank" rel="noopener noreferrer" className="btn btn-secondary"><Navigation size={16} /> Get Directions</a>
          </div>
        </div>
        <div className="home-map-card">
          <iframe
            title="Location"
            src={contactAddress ? `https://www.google.com/maps?q=${encodeURIComponent(contactAddress)}&output=embed` : 'about:blank'}
            width="100%" height="100%"
            style={{ border: 0 }}
            allowFullScreen loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>

      <section className="home-follow-card">
        <div className="home-follow-brand">
          <div className="home-follow-logo"><BrandLogo size="admin" showText={false} /></div>
          <div>
            <h2>{shopName}</h2>
            <p>{footerInfo.tagline || 'Trusted pet grooming and spa salon with love, care and professional expertise.'}</p>
          </div>
        </div>
        <div className="home-follow-pet">
          {homePetImages.follow ? <img src={homePetImages.follow} alt="Paw Paw pet" /> : <PawPrint size={80} />}
        </div>
        <div className="home-follow-actions">
          <h3>Follow Us</h3>
          <div>
            {footerInfo.socials?.slice(0, 3).map((social, i) => (
              <a key={i} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.platform}>{socialIcon(social.platform)}</a>
            ))}

          </div>
          <Link to="/book" className="btn btn-primary"><Calendar size={16} /> Book Appointment</Link>
        </div>
      </section>
      {/* WhatsApp float button */}
      <a href={`https://wa.me/${adminPhone}?text=${encodeURIComponent(`Hi ${shopName}, I'm interested in booking a service for my pet. Could you help me with more details?`)}`} target="_blank" rel="noopener noreferrer" className="whatsapp-btn" title="Chat on WhatsApp">
        ðŸ’¬
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



























