// src/pages/Gallery.jsx
import { useEffect, useState } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { Bath, Grid2X2, Heart, PawPrint, Scissors, Sparkles } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'

const CATEGORY_META = {
  all: { label: 'All', icon: Grid2X2 },
  grooming: { label: 'Grooming', icon: Scissors },
  bath: { label: 'Bath', icon: Bath },
  'happy-pets': { label: 'Happy Pets', icon: Heart },
  'before-after': { label: 'Before After', icon: Sparkles },
  haircut: { label: 'Haircut', icon: Scissors },
  styling: { label: 'Styling', icon: Sparkles },
  nail: { label: 'Nail', icon: PawPrint },
  general: { label: 'General', icon: PawPrint },
}

const getCategoryMeta = (category) => {
  if (CATEGORY_META[category]) return CATEGORY_META[category]
  return {
    label: String(category || 'Gallery').replace(/-/g, ' '),
    icon: PawPrint,
  }
}

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
    <div className="gallery-page">
      <div className="gallery-shell">
        <div className="gallery-hero">
          <PawPrint className="gallery-bg-paw paw-one" size={54} />
          <PawPrint className="gallery-bg-paw paw-two" size={46} />
          <PawPrint className="gallery-bg-paw paw-three" size={38} />
          <p className="gallery-kicker"><PawPrint size={16} /> Our Gallery <PawPrint size={16} /></p>
          <h1>Gallery</h1>
          <p>Capturing the joyful moments and wagging tails we cherish every day.</p>
          <div className="gallery-divider"><span /><PawPrint size={18} /><span /></div>
        </div>

        {categories.length > 1 && (
          <div className="gallery-filters">
            {categories.map(cat => {
              const meta = getCategoryMeta(cat)
              const Icon = meta.icon
              return (
                <button key={cat} onClick={() => setFilter(cat)} className={filter === cat ? 'active' : ''}>
                  <Icon size={19} />
                  <span>{meta.label}</span>
                </button>
              )
            })}
          </div>
        )}

        {loading ? <Spinner text="Loading gallery..." /> : filtered.length === 0 ? (
          <div className="gallery-empty">
            <PawPrint size={48} />
            <p>Gallery coming soon! Check back later.</p>
          </div>
        ) : (
          <div className="gallery-tile-grid">
            {filtered.map(img => (
              <button key={img.id} className="gallery-tile" onClick={() => setSelected(img)}>
                <img src={img.url} alt={img.caption || 'Gallery'} loading="lazy" />
                {img.caption && (
                  <div className="gallery-tile-caption">
                    <p>{img.caption}</p>
                    {img.category && <span>{getCategoryMeta(img.category).label}</span>}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div onClick={() => setSelected(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', cursor:'pointer' }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth:'800px', width:'100%', cursor:'default' }}>
            <img src={selected.url} alt={selected.caption || ''} style={{ width:'100%', borderRadius:'16px', maxHeight:'80vh', objectFit:'contain' }} />
            {selected.caption && <p style={{ color:'#fff', textAlign:'center', marginTop:'16px', fontSize:'15px' }}>{selected.caption}</p>}
            <button className="gallery-lightbox-close" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
