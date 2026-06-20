// src/pages/Services.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { SERVICES } from '../utils/services'
import { Calendar, Clock, TrendingUp, Package } from 'lucide-react'
import Spinner from '../components/Spinner'
import { fetchBusinessInfo } from '../utils/businessInfo'

export default function Services() {
  const [counts, setCounts]     = useState({})
  const [packages, setPackages] = useState([])
  const [serviceDetails, setServiceDetails] = useState({})
  const [loading, setLoading]   = useState(true)
  const [adminPhone, setAdminPhone] = useState('')

  useEffect(() => {
    async function fetchData() {
      try {
        const [bSnap, pSnap, dSnap, businessInfo] = await Promise.all([
          getDocs(collection(db, 'bookings')),
          getDocs(collection(db, 'packages')),
          getDocs(collection(db, 'serviceDetails')),
          fetchBusinessInfo(db),
        ])
        const c = {}
        bSnap.docs.forEach(d => { const s = d.data().serviceId; if (s) c[s] = (c[s] || 0) + 1 })
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

  return (
    <div style={{ background: 'var(--bg)', paddingTop: '80px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 20px 80px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p className="section-label" style={{ marginBottom: '10px' }}>What We Offer</p>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: 'clamp(32px,5vw,52px)', fontWeight: 800, color: 'var(--text)', marginBottom: '14px' }}>
            Our Services
          </h1>
          <p style={{ color: 'var(--muted)', maxWidth: '480px', margin: '0 auto', fontSize: '15px', lineHeight: 1.7 }}>
            Professional grooming tailored to your pet's breed, size, and personality.
          </p>
        </div>

        {loading ? <Spinner text="Loading services..." /> : (
          <>
            {/* Services grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginBottom: '60px' }}>
              {SERVICES.filter(baseService => serviceDetails[baseService.id]?.active !== false).map((baseService, i) => {
                const detail = serviceDetails[baseService.id]
                const service = {
                  ...baseService,
                  name: detail?.name || baseService.name,
                  description: detail?.summary || detail?.description || baseService.description,
                  duration: detail?.duration || baseService.duration,
                  price: detail?.price || baseService.price,
                }

                return (
                <Link key={service.id} to={`/services/${service.id}`} className="card card-hover fade-up" style={{ padding: '28px', animationDelay: `${i * 0.07}s`, textDecoration: 'none', display: 'block' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', background: `${service.color}18`, border: `1px solid ${service.color}30`, flexShrink: 0 }}>
                        {service.icon}
                      </div>
                      <div>
                        <h3 style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)', marginBottom: '4px' }}>{service.name}</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: 'var(--muted)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Clock size={11} /> {service.duration}
                          </span>
                          {counts[service.id] > 0 && (
                            <span style={{ color: '#34d399', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <TrendingUp size={11} /> {counts[service.id]} bookings
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span style={{ color: 'var(--accent)', fontFamily: '"DM Mono",monospace', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}>{service.price}</span>
                  </div>

                  <p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.7, marginBottom: '18px' }}>{service.description}</p>

                  {/* Popularity bar */}
                  <div style={{ marginBottom: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>
                      <span>Popularity</span>
                      <span>{counts[service.id] || 0} bookings</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '2px', background: service.color,
                        width: `${Math.min(((counts[service.id] || 0) / Math.max(...Object.values(counts), 1)) * 100, 100)}%`,
                        transition: 'width 1s ease',
                      }} />
                    </div>
                  </div>

                  <span className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: '13px', padding: '10px' }}>
                    View Details
                  </span>
                </Link>
              )})}
            </div>

            {/* Custom Packages section */}
            {packages.length > 0 && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '36px' }}>
                  <p className="section-label" style={{ marginBottom: '10px' }}>Special Deals</p>
                  <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: 'clamp(24px,4vw,36px)', fontWeight: 800, color: 'var(--text)' }}>
                    Custom Packages
                  </h2>
                  <p style={{ color: 'var(--muted)', fontSize: '14px', marginTop: '8px' }}>Curated combinations for complete pet care</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '18px' }}>
                  {packages.map(pkg => (
                    <div key={pkg.id} className="card card-hover" style={{ padding: '24px', border: '1px solid var(--accent-border)', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--gradient)' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <Package size={20} style={{ color: 'var(--accent)' }} />
                        <h3 style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>{pkg.name}</h3>
                      </div>
                      {pkg.description && <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '14px', lineHeight: 1.6 }}>{pkg.description}</p>}
                      {pkg.services?.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          {pkg.services.map((s, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 0', borderBottom: i < pkg.services.length - 1 ? '1px solid var(--border)' : 'none' }}>
                              <span style={{ color: 'var(--accent)', fontSize: '12px' }}>✓</span>
                              <span style={{ color: 'var(--text)', fontSize: '13px' }}>{s}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div>
                          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>Package Price</span>
                          <div style={{ color: 'var(--accent)', fontFamily: '"DM Mono",monospace', fontWeight: 800, fontSize: '18px' }}>
                            {pkg.priceRange || `₹${pkg.price}`}
                          </div>
                        </div>
                        {pkg.duration && <span style={{ color: 'var(--muted)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12}/> {pkg.duration}</span>}
                      </div>
                      <Link to={`/book?package=${pkg.id}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: '13px' }}>
                        Book Package
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            <div style={{ marginTop: '56px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '20px', padding: '36px', textAlign: 'center' }}>
              <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>Not sure which service to choose?</p>
              <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '20px' }}>Call us and our team will help pick the best option for your pet.</p>
              <a href={`tel:${adminPhone}`} className="btn btn-primary" style={{ display: 'inline-flex' }}>
                📞 Call: {adminPhone}
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
