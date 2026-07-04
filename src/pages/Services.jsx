// src/pages/Services.jsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { ArrowRight, Calendar, Clock, Flame, Package, PawPrint, Phone, Star, TrendingUp } from 'lucide-react'
import { db } from '../firebase'
import { buildServiceCatalog } from '../utils/serviceCatalog'
import Spinner from '../components/Spinner'
import { fetchBusinessInfo } from '../utils/businessInfo'
import { useAuth } from '../context/AuthContext'

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

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsSnap, pSnap, dSnap, businessInfo] = await Promise.all([
          getDoc(doc(db, 'settings', 'homeStats')),
          getDocs(collection(db, 'packages')),
          getDocs(collection(db, 'serviceDetails')),
          fetchBusinessInfo(db),
        ])
        const c = statsSnap.exists() && statsSnap.data().perServiceBookings ? statsSnap.data().perServiceBookings : {}
        const details = {}
        dSnap.docs.forEach(d => { details[d.id] = { id: d.id, ...d.data() } })
        setCounts(c)
        setServiceDetails(details)
        setPackages(pSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false))
        setAdminPhone(businessInfo.whatsappNumber || '')
      } catch {}
      setLoading(false)
    }
    fetchData()
  }, [])

  const maxBookings = useMemo(() => Math.max(...Object.values(counts).map(Number), 1), [counts])

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

            <div className="services-help-strip">
              <span><PawPrint size={34} /></span>
              <div>
                <strong>Not sure which service to choose?</strong>
                <p>Call us and our team will help pick the best care for your pet.</p>
              </div>
              <a href={`tel:${adminPhone}`} className="btn btn-primary"><Phone size={16} /> Call Assistance</a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
