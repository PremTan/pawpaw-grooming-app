import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { Calendar, ChevronLeft, Clock, Heart, Leaf, PawPrint, Scissors, ShieldCheck, Sparkles } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import { SERVICES } from '../utils/services'
import { buildServiceCatalog } from '../utils/serviceCatalog'
import { defaultServiceIconKey, renderServiceIcon } from '../utils/serviceIcons.jsx'

export default function ServiceDetail() {
  const { serviceId } = useParams()
  const baseService = SERVICES.find(s => s.id === serviceId)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDetail() {
      try {
        const snap = await getDoc(doc(db, 'serviceDetails', serviceId))
        setDetail(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      } catch {
        setDetail(null)
      }
      setLoading(false)
    }
    fetchDetail()
  }, [serviceId])

  const service = useMemo(() => {
    if (!baseService && !detail) return null
    const found = buildServiceCatalog(detail ? { [serviceId]: detail } : {}, { includeInactive: true }).find(item => item.id === serviceId)
    if (!found) return null
    return {
      ...found,
      description: found.description || found.summary,
      summary: found.summary || found.description,
      iconKey: found.iconKey || defaultServiceIconKey(found.id),
      images: Array.isArray(found.images) ? found.images.filter(i => i?.url).slice(0, 5) : [],
    }
  }, [baseService, detail, serviceId])

  if (!service && !loading) return <Navigate to="/services" replace />
  if (loading) return <div style={{ paddingTop: '120px' }}><Spinner text="Loading service..." /></div>
  if (service?.active === false) return <Navigate to="/services" replace />

  const images = service.images

  return (
    <>
      <style>{`
        .sd-page { background: var(--bg); padding-top: 80px; min-height: 100vh; }
        .sd-shell { max-width: 1200px; margin: 0 auto; padding: 36px 20px 80px; }
        .sd-back { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); text-decoration: none; font-size: 13px; margin-bottom: 24px; }
        .sd-hero { max-width: 760px; margin-bottom: 44px; }
        .sd-hero.no-images { margin-bottom: 0; }
        .sd-kicker { display: inline-flex; align-items: center; gap: 10px; background: var(--accent-bg); border: 1px solid var(--accent-border); color: var(--accent); border-radius: 999px; padding: 7px 14px; margin-bottom: 18px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .9px; }
        .sd-title { font-family: "Playfair Display", serif; font-size: clamp(30px,6vw,64px); line-height: 1.05; font-weight: 800; color: var(--text); margin-bottom: 16px; }
        .sd-title-paw { color: var(--accent); fill: color-mix(in srgb, var(--accent) 22%, transparent); margin-left: 8px; vertical-align: middle; }
        .sd-desc { color: var(--muted); font-size: 16px; line-height: 1.8; max-width: 620px; margin-bottom: 24px; }
        .sd-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
        .sd-price { color: var(--accent); font-weight: 900; font-size: 19px; display: inline-flex; align-items: center; gap: 7px; }
        .sd-duration { color: var(--muted); display: inline-flex; align-items: center; gap: 5px; font-size: 13px; }
        .sd-benefits { display: none; }
        .sd-story-list { display: flex; flex-direction: column; gap: 56px; }
        .sd-row { display: grid; grid-template-columns: 1fr 1fr; gap: 44px; align-items: center; }
        .sd-img-wrap { border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: var(--surface); box-shadow: 0 18px 55px rgba(0,0,0,0.18); width: 100%; }
        .sd-img-wrap img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; }
        .sd-text { align-self: center; }
        .sd-text-icon { display: none; }
        .sd-text h2 { color: var(--text); font-weight: 800; font-size: clamp(22px, 3vw, 34px); line-height: 1.15; margin-bottom: 14px; }
        .sd-text p { color: var(--muted); font-size: 15px; line-height: 1.85; }
        .sd-mobile-footer { display: none; }

        @media (max-width: 700px) {
          .sd-page { padding-top: 76px; background: linear-gradient(180deg, #fffaf2 0%, #f8f4ec 100%); }
          .sd-shell { padding: 34px 20px 28px; }
          .sd-back { display: none; }
          .sd-hero { max-width: none; margin-bottom: 28px; }
          .sd-kicker { padding: 9px 16px; margin-bottom: 26px; background: rgba(255,255,255,.72); color: #b98104; border-color: rgba(190,129,4,.45); font-size: 13px; letter-spacing: 1.2px; }
          .sd-title { color: #211a15; font-size: clamp(48px, 14vw, 62px); margin-bottom: 20px; }
          .sd-title-paw { width: 32px; height: 32px; }
          .sd-desc { color: #66615d; font-size: 22px; line-height: 1.55; margin-bottom: 28px; }
          .sd-actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; margin-bottom: 24px; }
          .sd-actions .btn { min-height: 78px; border-radius: 12px; font-size: 24px; font-weight: 900; box-shadow: 0 12px 24px rgba(184,128,0,.24); }
          .sd-price { color: #b98104; font-size: 28px; justify-content: center; min-width: 110px; }
          .sd-duration { display: none; }
          .sd-benefits { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #5f554c; font-size: 16px; margin: 8px 0 30px; }
          .sd-benefits span { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
          .sd-benefits svg { color: #bd890d; }
          .sd-benefits i { width: 1px; height: 24px; background: rgba(139,119,90,.25); }
          .sd-story-list { gap: 12px; }
          .sd-row { grid-template-columns: 39% minmax(0, 1fr); gap: 16px; align-items: center; padding: 14px; border: 1px solid rgba(188,151,86,.16); border-radius: 18px; background: rgba(255,255,255,.92); box-shadow: 0 8px 24px rgba(86,62,28,.08); }
          .sd-img-wrap { order: 0 !important; border: 0; border-radius: 14px; box-shadow: none; background: #f3eadc; }
          .sd-img-wrap img { width: 100%; aspect-ratio: 1 / .92; height: auto; object-fit: cover; }
          .sd-text { order: 1 !important; min-width: 0; }
          .sd-text-head { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: start; margin-bottom: 10px; }
          .sd-text-icon { width: 54px; height: 54px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: #fff7e8; color: #b98104; flex: 0 0 auto; }
          .sd-text h2 { color: #191511; font-size: 24px; line-height: 1.18; margin: 0; }
          .sd-text p { color: #3f3934; font-size: 18px; line-height: 1.45; }
          .sd-mobile-footer { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px; margin-top: 30px; padding: 18px 20px; border: 1px solid rgba(188,151,86,.22); border-radius: 16px; background: rgba(255,255,255,.72); color: #211a15; overflow: hidden; }
          .sd-mobile-footer > svg { color: #c08b0a; fill: color-mix(in srgb, #c08b0a 18%, transparent); }
          .sd-mobile-footer strong { display: block; font-size: 18px; margin-bottom: 4px; }
          .sd-mobile-footer p { color: #5f554c; font-size: 15px; line-height: 1.35; }
          .sd-mobile-pet { color: #c08b0a; opacity: .9; }
        }

        @media (max-width: 430px) {
          .sd-shell { padding-left: 16px; padding-right: 16px; }
          .sd-title { font-size: 44px; }
          .sd-desc { font-size: 18px; }
          .sd-actions .btn { min-height: 58px; font-size: 16px; }
          .sd-price { font-size: 20px; min-width: 86px; }
          .sd-benefits { font-size: 12px; gap: 6px; }
          .sd-benefits span { gap: 5px; }
          .sd-benefits svg { width: 16px; height: 16px; }
          .sd-row { grid-template-columns: 42% minmax(0, 1fr); gap: 12px; padding: 10px; border-radius: 14px; }
          .sd-img-wrap { border-radius: 12px; }
          .sd-text-head { gap: 8px; margin-bottom: 7px; }
          .sd-text-icon { width: 38px; height: 38px; }
          .sd-text-icon svg { width: 20px; height: 20px; }
          .sd-text h2 { font-size: 17px; }
          .sd-text p { font-size: 13px; line-height: 1.38; }
          .sd-mobile-footer { grid-template-columns: auto minmax(0, 1fr); padding: 14px; }
          .sd-mobile-pet { display: none; }
        }
      `}</style>

      <div className="sd-page">
        <div className="sd-shell">
          <Link to="/services" className="sd-back"><ChevronLeft size={16} /> Back to services</Link>

          <section className={`sd-hero${images.length ? '' : ' no-images'}`}>
            <div className="sd-kicker"><PawPrint size={17} /> Our Services</div>
            <h1 className="sd-title">{service.name}<PawPrint className="sd-title-paw" size={38} /></h1>
            <p className="sd-desc">{service.description}</p>
            <div className="sd-actions">
              <Link to={`/book?service=${service.id}`} className="btn btn-primary" style={{ textDecoration: 'none' }}>
                <Calendar size={22} /> Book This Service
              </Link>
              <span className="sd-price"><PawPrint size={22} /> {service.price}</span>
              <span className="sd-duration"><Clock size={14} /> {service.duration}</span>
            </div>
            <div className="sd-benefits">
              <span><ShieldCheck size={18} /> Safe & Gentle</span>
              <i />
              <span><Leaf size={18} /> Premium Products</span>
              <i />
              <span><Heart size={18} /> Happy Pets</span>
            </div>
          </section>

          {images.length > 0 && (
            <div className="sd-story-list">
              {images.map((image, index) => {
                const imageFirst = index % 2 === 1
                return (
                  <section key={`${image.url}-${index}`} className="sd-row">
                    <div className="sd-img-wrap" style={{ order: imageFirst ? 0 : 1 }}>
                      <img src={image.url} alt={image.alt || image.title || service.name} />
                    </div>
                    <div className="sd-text" style={{ order: imageFirst ? 1 : 0 }}>
                      <div className="sd-text-head">
                        <span className="sd-text-icon">{renderServiceIcon(service.iconKey, <Scissors size={26} />, 26)}</span>
                        <h2>{image.title || `${service.name} - Step ${index + 1}`}</h2>
                      </div>
                      <p>{image.description || service.summary}</p>
                    </div>
                  </section>
                )
              })}
            </div>
          )}

          <div className="sd-mobile-footer">
            <PawPrint size={28} />
            <div>
              <strong>Every Pet Deserves the Best!</strong>
              <p>Hygienic care &bull; Expert groomers &bull; Happy tails</p>
            </div>
            <Sparkles className="sd-mobile-pet" size={46} />
          </div>
        </div>
      </div>
    </>
  )
}
