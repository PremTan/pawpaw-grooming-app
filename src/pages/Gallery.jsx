// src/pages/Gallery.jsx
import { useEffect, useState } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import Spinner from '../components/Spinner'

export default function Gallery() {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    async function fetch() {
      try {
        const snap = await getDocs(query(collection(db, 'gallery'), orderBy('createdAt', 'desc')))
        setImages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch {}
      setLoading(false)
    }
    fetch()
  }, [])

  const categories = ['all', ...new Set(images.map(i => i.category).filter(Boolean))]
  const filtered = filter === 'all' ? images : images.filter(i => i.category === filter)

  return (
    <div style={{ background:'var(--bg)', paddingTop:'80px', minHeight:'100vh' }}>
      <div style={{ maxWidth:'1200px', margin:'0 auto', padding:'48px 20px 80px' }}>
        <div style={{ textAlign:'center', marginBottom:'48px' }}>
          <p className="section-label" style={{ marginBottom:'10px' }}>Our Work</p>
          <h1 style={{ fontFamily:'"Playfair Display",serif', fontSize:'clamp(32px,5vw,52px)', fontWeight:800, color:'var(--text)', marginBottom:'12px' }}>Gallery</h1>
          <p style={{ color:'var(--muted)', fontSize:'15px', maxWidth:'420px', margin:'0 auto' }}>See the transformations — happy pets, beautiful results.</p>
        </div>

        {/* Category filter */}
        {categories.length > 1 && (
          <div style={{ display:'flex', gap:'8px', marginBottom:'32px', flexWrap:'wrap', justifyContent:'center' }}>
            {categories.map(cat => (
              <button key={cat} onClick={() => setFilter(cat)}
                style={{ padding:'8px 20px', borderRadius:'999px', fontSize:'13px', fontWeight: filter===cat ? 700 : 400, cursor:'pointer', border:'none', background: filter===cat ? 'var(--gradient)' : 'var(--card)', color: filter===cat ? '#000' : 'var(--muted)', transition:'all 0.2s', textTransform:'capitalize' }}
              >{cat}</button>
            ))}
          </div>
        )}

        {loading ? <Spinner text="Loading gallery..." /> : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px 20px' }}>
            <div style={{ fontSize:'52px', marginBottom:'16px' }}>🖼️</div>
            <p style={{ color:'var(--muted)', fontSize:'15px' }}>Gallery coming soon! Check back later.</p>
          </div>
        ) : (
          <div style={{ columns:'3 260px', gap:'16px' }}>
            {filtered.map(img => (
              <div key={img.id} style={{ breakInside:'avoid', marginBottom:'16px', cursor:'pointer', borderRadius:'14px', overflow:'hidden', border:'1px solid var(--border)', transition:'all 0.3s' }}
                onClick={() => setSelected(img)}
                onMouseEnter={e => { e.currentTarget.style.transform='scale(1.02)'; e.currentTarget.style.borderColor='var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.borderColor='var(--border)' }}
              >
                <img src={img.url} alt={img.caption || 'Gallery'} style={{ width:'100%', display:'block', objectFit:'cover' }} loading="lazy" />
                {img.caption && (
                  <div style={{ padding:'12px 14px', background:'var(--card)' }}>
                    <p style={{ color:'var(--text)', fontSize:'13px', fontWeight:500 }}>{img.caption}</p>
                    {img.category && <p style={{ color:'var(--muted)', fontSize:'11px', marginTop:'3px', textTransform:'capitalize' }}>{img.category}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selected && (
        <div onClick={() => setSelected(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', cursor:'pointer' }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth:'800px', width:'100%', cursor:'default' }}>
            <img src={selected.url} alt={selected.caption || ''} style={{ width:'100%', borderRadius:'16px', maxHeight:'80vh', objectFit:'contain' }} />
            {selected.caption && <p style={{ color:'#fff', textAlign:'center', marginTop:'16px', fontSize:'15px' }}>{selected.caption}</p>}
            <button onClick={() => setSelected(null)} style={{ display:'block', margin:'16px auto 0', background:'none', border:'1px solid rgba(255,255,255,0.2)', color:'#fff', padding:'8px 24px', borderRadius:'8px', cursor:'pointer', fontSize:'13px' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
