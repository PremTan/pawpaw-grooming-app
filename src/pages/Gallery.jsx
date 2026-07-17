import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, orderBy, limit, startAfter, where } from 'firebase/firestore'
import { Circle, Grid2X2, Play } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import { formatVideoDuration } from '../utils/videoCompression'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Photos' },
  { key: 'video', label: 'Videos' },
]
const PAGE_SIZE = 12

const buildQuery = (cursor) => {
  const galleryRef = collection(db, 'gallery')
  const base = query(galleryRef, orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
  return cursor ? query(base, startAfter(cursor)) : base
}

const matchesFilter = (item, filter) => filter === 'all' || item.type === filter

const mapDoc = (doc) => {
  const data = doc.data()
  const type = data.type || (data.duration ? 'video' : 'image')
  return {
    id: doc.id,
    type,
    title: data.title || data.caption || '',
    category: data.category || '',
    mediaUrl: data.mediaUrl || data.url || '',
    thumbnailUrl: data.thumbnailUrl || '',
    duration: data.duration || '',
    createdAt: data.createdAt,
    active: data.active !== false,
    raw: data,
  }
}

export default function Gallery() {
  const [filter, setFilter] = useState('all')
  const [state, setState] = useState({
    all: { items: [], lastDoc: null, hasMore: true, fetched: false },
    image: { items: [], lastDoc: null, hasMore: true, fetched: false },
    video: { items: [], lastDoc: null, hasMore: true, fetched: false },
  })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState(null)

  const current = state[filter]
  const mediaItems = current.items.filter(item => item.active && matchesFilter(item, filter))

  const fetchPage = async (pageFilter, nextPage = false) => {
    const pageState = state[pageFilter]
    if (nextPage && !pageState.hasMore) return

    if (nextPage) setLoadingMore(true)
    else setLoading(true)

    try {
      const q = buildQuery(nextPage ? pageState.lastDoc : null)
      const snap = await getDocs(q)
      const newItems = snap.docs.map(mapDoc)
      const lastDoc = snap.docs[snap.docs.length - 1] || pageState.lastDoc
      const hasMore = snap.docs.length === PAGE_SIZE

      setState(prev => ({
        ...prev,
        [pageFilter]: {
          items: nextPage ? [...prev[pageFilter].items, ...newItems] : newItems,
          lastDoc,
          hasMore,
          fetched: true,
        },
      }))
    } catch (error) {
      console.error('Gallery fetch error', error)
    } finally {
      if (nextPage) setLoadingMore(false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    if (!state[filter].fetched) {
      fetchPage(filter)
    } else {
      setLoading(false)
    }
  }, [filter])

  const handleLoadMore = () => fetchPage(filter, true)

  const displayedItems = useMemo(() => mediaItems, [mediaItems])

  return (
    <div className="gallery-page">
      <div className="gallery-shell">
        <div className="gallery-hero">
          <p className="gallery-kicker"><Circle size={14} /> Our happy moments <Circle size={14} /></p>
          <h1>Gallery</h1>
          <p>Capturing the special moments and wagging tails with love, every day.</p>
        </div>

        <div className="gallery-filters gallery-type-filters">
          {FILTERS.map(item => (
            <button key={item.key} type="button" className={filter === item.key ? 'active' : ''} onClick={() => setFilter(item.key)}>
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="gallery-tile-grid">
            {Array.from({ length: PAGE_SIZE }).map((_, idx) => (
              <div key={idx} className="gallery-skeleton" />
            ))}
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="gallery-empty">
            <Grid2X2 size={48} />
            <p>No media found yet.</p>
            <span>New gallery content will appear here soon.</span>
          </div>
        ) : (
          <>
            <div className="gallery-tile-grid">
              {displayedItems.map(item => (
                <button key={item.id} type="button" className="gallery-tile" onClick={() => setSelectedMedia(item)}>
                  <div className="gallery-tile-media">
                    {item.type === 'video' ? (
                      <>
                        {item.thumbnailUrl ? (
                          <img src={item.thumbnailUrl} alt={item.title || 'Video thumbnail'} loading="lazy" />
                        ) : (
                          <div className="gallery-video-placeholder" />
                        )}
                        <div className="gallery-video-overlay"><Play size={28} /></div>
                        {item.duration && (
                          <span className="gallery-video-duration">{formatVideoDuration(Number(item.duration))}</span>
                        )}
                      </>
                    ) : (
                      <img src={item.mediaUrl} alt={item.title || 'Gallery image'} loading="lazy" />
                    )}
                  </div>
                  {item.title && <div className="gallery-tile-caption"><p>{item.title}</p></div>}
                </button>
              ))}
            </div>

            {current.hasMore && (
              <div style={{ textAlign: 'center', marginTop: '28px' }}>
                <button type="button" className="btn btn-primary" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedMedia && (
        <div onClick={() => setSelectedMedia(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(7, 10, 18, 0.94)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', cursor: 'pointer' }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '960px', width: '100%', cursor: 'default' }}>
            {selectedMedia.type === 'video' ? (
              <video controls autoPlay poster={selectedMedia.thumbnailUrl || undefined} style={{ width: '100%', borderRadius: '16px', maxHeight: '80vh', background: '#000' }}>
                <source src={selectedMedia.mediaUrl} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            ) : (
              <img src={selectedMedia.mediaUrl} alt={selectedMedia.title || ''} style={{ width: '100%', borderRadius: '16px', maxHeight: '80vh', objectFit: 'contain' }} />
            )}
            {selectedMedia.title && <p style={{ color: '#fff', textAlign: 'center', marginTop: '16px', fontSize: '15px' }}>{selectedMedia.title}</p>}
            <button className="gallery-lightbox-close" onClick={() => setSelectedMedia(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
