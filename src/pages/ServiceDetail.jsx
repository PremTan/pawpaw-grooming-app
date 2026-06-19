// import { useEffect, useMemo, useState } from 'react'
// import { Link, Navigate, useParams } from 'react-router-dom'
// import { doc, getDoc } from 'firebase/firestore'
// import { Calendar, ChevronLeft, Clock } from 'lucide-react'
// import { db } from '../firebase'
// import Spinner from '../components/Spinner'
// import { SERVICES } from '../utils/services'

// export default function ServiceDetail() {
//   const { serviceId } = useParams()
//   const baseService = SERVICES.find(s => s.id === serviceId)
//   const [detail, setDetail] = useState(null)
//   const [loading, setLoading] = useState(true)

//   useEffect(() => {
//     async function fetchDetail() {
//       try {
//         const snap = await getDoc(doc(db, 'serviceDetails', serviceId))
//         setDetail(snap.exists() ? { id: snap.id, ...snap.data() } : null)
//       } catch {
//         setDetail(null)
//       }
//       setLoading(false)
//     }
//     if (baseService) fetchDetail()
//   }, [baseService, serviceId])

//   const service = useMemo(() => {
//     if (!baseService) return null
//     return {
//       ...baseService,
//       ...detail,
//       name: detail?.name || baseService.name,
//       description: detail?.description || baseService.description,
//       summary: detail?.summary || baseService.description,
//       price: detail?.price || baseService.price,
//       duration: detail?.duration || baseService.duration,
//       images: Array.isArray(detail?.images) ? detail.images.filter(i => i?.url).slice(0, 5) : [],
//     }
//   }, [baseService, detail])

//   if (!baseService) return <Navigate to="/services" replace />
//   if (loading) return <div style={{ paddingTop: '120px' }}><Spinner text="Loading service..." /></div>
//   if (service?.active === false) return <Navigate to="/services" replace />

//   const images = service.images

//   return (
//     <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' }}>
//       <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '36px 20px 80px' }}>
//         <Link to="/services" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--muted)', textDecoration: 'none', fontSize: '13px', marginBottom: '24px' }}>
//           <ChevronLeft size={16} /> Back to services
//         </Link>

//         <section style={{ maxWidth: '760px', marginBottom: images.length ? '44px' : '0' }}>
//           <div>
//             <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', borderRadius: '999px', padding: '7px 14px', marginBottom: '18px', fontSize: '12px', fontWeight: 800 }}>
//               <span style={{ fontSize: '18px' }}>{service.icon}</span> {service.duration}
//             </div>
//             <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: 'clamp(34px,6vw,64px)', lineHeight: 1.05, fontWeight: 800, color: 'var(--text)', marginBottom: '16px' }}>
//               {service.name}
//             </h1>
//             <p style={{ color: 'var(--muted)', fontSize: '16px', lineHeight: 1.8, maxWidth: '620px', marginBottom: '24px' }}>
//               {service.description}
//             </p>
//             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
//               <Link to={`/book?service=${service.id}`} className="btn btn-primary" style={{ textDecoration: 'none' }}>
//                 <Calendar size={17} /> Book This Service
//               </Link>
//               <span style={{ color: 'var(--accent)', fontFamily: '"DM Mono",monospace', fontWeight: 800, fontSize: '16px' }}>{service.price}</span>
//               <span style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}><Clock size={14} /> {service.duration}</span>
//             </div>
//           </div>
//         </section>

//         {images.length > 0 && (
//           <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
//             {images.map((image, index) => {
//               const imageFirst = index % 2 === 1
//               const textBlock = (
//                 <div style={{ alignSelf: 'center' }}>
//                   <h2 style={{ color: 'var(--text)', fontWeight: 800, fontSize: 'clamp(24px,3vw,34px)', lineHeight: 1.15, marginBottom: '16px' }}>
//                     {image.title || `${service.name} photo ${index + 1}`}
//                   </h2>
//                   <p style={{ color: 'var(--muted)', fontSize: '15px', lineHeight: 1.85 }}>
//                     {image.description || service.summary}
//                   </p>
//                 </div>
//               )
//               const imageBlock = (
//                 <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)', boxShadow: '0 18px 55px rgba(0,0,0,0.18)' }}>
//                   <img src={image.url} alt={image.alt || image.title || service.name} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
//                 </div>
//               )

//               return (
//                 <section key={`${image.url}-${index}`} className="service-story-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '44px', alignItems: 'center' }}>
//                   {imageFirst ? imageBlock : textBlock}
//                   {imageFirst ? textBlock : imageBlock}
//                 </section>
//               )
//             })}
//           </div>
//         )}
//       </div>
//     </div>
//   )
// }


// -----------------------------------------------------------------
// import { useEffect, useMemo, useState } from 'react'
// import { Link, Navigate, useParams } from 'react-router-dom'
// import { doc, getDoc } from 'firebase/firestore'
// import { Calendar, ChevronLeft, Clock } from 'lucide-react'
// import { db } from '../firebase'
// import Spinner from '../components/Spinner'
// import { SERVICES } from '../utils/services'

// export default function ServiceDetail() {
//   const { serviceId } = useParams()
//   const baseService = SERVICES.find(s => s.id === serviceId)
//   const [detail, setDetail] = useState(null)
//   const [loading, setLoading] = useState(true)

//   useEffect(() => {
//     async function fetchDetail() {
//       try {
//         const snap = await getDoc(doc(db, 'serviceDetails', serviceId))
//         setDetail(snap.exists() ? { id: snap.id, ...snap.data() } : null)
//       } catch {
//         setDetail(null)
//       }
//       setLoading(false)
//     }
//     if (baseService) fetchDetail()
//   }, [baseService, serviceId])

//   const service = useMemo(() => {
//     if (!baseService) return null
//     return {
//       ...baseService,
//       ...detail,
//       name: detail?.name || baseService.name,
//       description: detail?.description || baseService.description,
//       summary: detail?.summary || baseService.description,
//       price: detail?.price || baseService.price,
//       duration: detail?.duration || baseService.duration,
//       images: Array.isArray(detail?.images) ? detail.images.filter(i => i?.url).slice(0, 5) : [],
//     }
//   }, [baseService, detail])

//   if (!baseService) return <Navigate to="/services" replace />
//   if (loading) return <div style={{ paddingTop: '120px' }}><Spinner text="Loading service..." /></div>
//   if (service?.active === false) return <Navigate to="/services" replace />

//   const images = service.images

//   return (
//     <>
//       <style>{`
//         .sd-hero { max-width: 760px; margin-bottom: 44px; }
//         .sd-hero.no-images { margin-bottom: 0; }

//         /* Story rows */
//         .sd-story-list { display: flex; flex-direction: column; gap: 56px; }

//         .sd-row {
//           display: grid;
//           grid-template-columns: 1fr 1fr;
//           gap: 44px;
//           align-items: center;
//         }

//         .sd-img-wrap {
//           border-radius: 12px;
//           overflow: hidden;
//           border: 1px solid var(--border);
//           background: var(--surface);
//           box-shadow: 0 18px 55px rgba(0,0,0,0.18);
//           width: 100%;
//         }

//         .sd-img-wrap img {
//           width: 100%;
//           aspect-ratio: 4 / 3;
//           object-fit: cover;
//           display: block;
//         }

//         .sd-text { align-self: center; }

//         .sd-text h2 {
//           color: var(--text);
//           font-weight: 800;
//           font-size: clamp(22px, 3vw, 34px);
//           line-height: 1.15;
//           margin-bottom: 14px;
//         }

//         .sd-text p {
//           color: var(--muted);
//           font-size: 15px;
//           line-height: 1.85;
//         }

//         /* Mobile: stack image ABOVE text, always */
//         @media (max-width: 700px) {
//           .sd-hero { margin-bottom: 32px; }

//           .sd-story-list { gap: 40px; }

//           .sd-row {
//             grid-template-columns: 1fr;
//             gap: 16px;
//           }

//           /* Force image always on top regardless of DOM order */
//           .sd-img-wrap { order: -1 !important; }
//           .sd-text     { order:  1 !important; }

//           .sd-img-wrap img {
//             aspect-ratio: 16 / 10;
//           }

//           .sd-text h2 { font-size: 20px; }
//           .sd-text p  { font-size: 14px; }
//         }
//       `}</style>

//       <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' }}>
//         <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '36px 20px 80px' }}>

//           <Link
//             to="/services"
//             style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--muted)', textDecoration: 'none', fontSize: '13px', marginBottom: '24px' }}
//           >
//             <ChevronLeft size={16} /> Back to services
//           </Link>

//           {/* Hero / intro */}
//           <section className={`sd-hero${images.length ? '' : ' no-images'}`}>
//             <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', borderRadius: '999px', padding: '7px 14px', marginBottom: '18px', fontSize: '12px', fontWeight: 800 }}>
//               <span style={{ fontSize: '18px' }}>{service.icon}</span> {service.duration}
//             </div>
//             <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: 'clamp(30px,6vw,64px)', lineHeight: 1.05, fontWeight: 800, color: 'var(--text)', marginBottom: '16px' }}>
//               {service.name}
//             </h1>
//             <p style={{ color: 'var(--muted)', fontSize: '16px', lineHeight: 1.8, maxWidth: '620px', marginBottom: '24px' }}>
//               {service.description}
//             </p>
//             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
//               <Link to={`/book?service=${service.id}`} className="btn btn-primary" style={{ textDecoration: 'none' }}>
//                 <Calendar size={17} /> Book This Service
//               </Link>
//               <span style={{ color: 'var(--accent)', fontFamily: '"DM Mono",monospace', fontWeight: 800, fontSize: '16px' }}>
//                 {service.price}
//               </span>
//               <span style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
//                 <Clock size={14} /> {service.duration}
//               </span>
//             </div>
//           </section>

//           {/* Story rows */}
//           {images.length > 0 && (
//             <div className="sd-story-list">
//               {images.map((image, index) => {
//                 const imageFirst = index % 2 === 1

//                 return (
//                   <section key={`${image.url}-${index}`} className="sd-row">
//                     {/* On desktop: alternate. On mobile: CSS order forces image on top */}
//                     <div className="sd-img-wrap" style={{ order: imageFirst ? 0 : 1 }}>
//                       <img
//                         src={image.url}
//                         alt={image.alt || image.title || service.name}
//                       />
//                     </div>
//                     <div className="sd-text" style={{ order: imageFirst ? 1 : 0 }}>
//                       <h2>{image.title || `${service.name} — Step ${index + 1}`}</h2>
//                       <p>{image.description || service.summary}</p>
//                     </div>
//                   </section>
//                 )
//               })}
//             </div>
//           )}

//         </div>
//       </div>
//     </>
//   )
// }


// -------------------------------------
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { Calendar, ChevronLeft, Clock } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import { SERVICES } from '../utils/services'

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
    if (baseService) fetchDetail()
  }, [baseService, serviceId])

  const service = useMemo(() => {
    if (!baseService) return null
    return {
      ...baseService,
      ...detail,
      name: detail?.name || baseService.name,
      description: detail?.description || baseService.description,
      summary: detail?.summary || baseService.description,
      price: detail?.price || baseService.price,
      duration: detail?.duration || baseService.duration,
      images: Array.isArray(detail?.images) ? detail.images.filter(i => i?.url).slice(0, 5) : [],
    }
  }, [baseService, detail])

  if (!baseService) return <Navigate to="/services" replace />
  if (loading) return <div style={{ paddingTop: '120px' }}><Spinner text="Loading service..." /></div>
  if (service?.active === false) return <Navigate to="/services" replace />

  const images = service.images

  return (
    <>
      <style>{`
        .sd-hero { max-width: 760px; margin-bottom: 44px; }
        .sd-hero.no-images { margin-bottom: 0; }

        /* Story rows */
        .sd-story-list { display: flex; flex-direction: column; gap: 56px; }

        .sd-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 44px;
          align-items: center;
        }

        .sd-img-wrap {
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid var(--border);
          background: var(--surface);
          box-shadow: 0 18px 55px rgba(0,0,0,0.18);
          width: 100%;
        }

        .sd-img-wrap img {
          width: 100%;
          aspect-ratio: 4 / 3;
          object-fit: cover;
          display: block;
        }

        .sd-text { align-self: center; }

        .sd-text h2 {
          color: var(--text);
          font-weight: 800;
          font-size: clamp(22px, 3vw, 34px);
          line-height: 1.15;
          margin-bottom: 14px;
        }

        .sd-text p {
          color: var(--muted);
          font-size: 15px;
          line-height: 1.85;
        }

        /* Mobile: stack image ABOVE text, always */
        @media (max-width: 700px) {
          .sd-hero { margin-bottom: 32px; }

          .sd-story-list { gap: 40px; }

          .sd-row {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          /* Force image always on top regardless of DOM order */
          .sd-img-wrap { order: -1 !important; }
          .sd-text     { order:  1 !important; }

          /* Let image show at its natural height — no cropping */
          .sd-img-wrap img {
            aspect-ratio: unset;
            width: 100%;
            height: auto;
            max-height: none;
            object-fit: contain;
            background: var(--surface);
          }

          .sd-text h2 { font-size: 20px; }
          .sd-text p  { font-size: 14px; }
        }
      `}</style>

      <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '36px 20px 80px' }}>

          <Link
            to="/services"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--muted)', textDecoration: 'none', fontSize: '13px', marginBottom: '24px' }}
          >
            <ChevronLeft size={16} /> Back to services
          </Link>

          {/* Hero / intro */}
          <section className={`sd-hero${images.length ? '' : ' no-images'}`}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', borderRadius: '999px', padding: '7px 14px', marginBottom: '18px', fontSize: '12px', fontWeight: 800 }}>
              <span style={{ fontSize: '18px' }}>{service.icon}</span> {service.duration}
            </div>
            <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: 'clamp(30px,6vw,64px)', lineHeight: 1.05, fontWeight: 800, color: 'var(--text)', marginBottom: '16px' }}>
              {service.name}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '16px', lineHeight: 1.8, maxWidth: '620px', marginBottom: '24px' }}>
              {service.description}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <Link to={`/book?service=${service.id}`} className="btn btn-primary" style={{ textDecoration: 'none' }}>
                <Calendar size={17} /> Book This Service
              </Link>
              <span style={{ color: 'var(--accent)', fontFamily: '"DM Mono",monospace', fontWeight: 800, fontSize: '16px' }}>
                {service.price}
              </span>
              <span style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
                <Clock size={14} /> {service.duration}
              </span>
            </div>
          </section>

          {/* Story rows */}
          {images.length > 0 && (
            <div className="sd-story-list">
              {images.map((image, index) => {
                const imageFirst = index % 2 === 1

                return (
                  <section key={`${image.url}-${index}`} className="sd-row">
                    {/* On desktop: alternate. On mobile: CSS order forces image on top */}
                    <div className="sd-img-wrap" style={{ order: imageFirst ? 0 : 1 }}>
                      <img
                        src={image.url}
                        alt={image.alt || image.title || service.name}
                      />
                    </div>
                    <div className="sd-text" style={{ order: imageFirst ? 1 : 0 }}>
                      <h2>{image.title || `${service.name} — Step ${index + 1}`}</h2>
                      <p>{image.description || service.summary}</p>
                    </div>
                  </section>
                )
              })}
            </div>
          )}

        </div>
      </div>
    </>
  )
}