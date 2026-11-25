import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { Grid2X2, Play, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import { formatVideoDuration } from '../utils/videoCompression'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Photos' },
  { key: 'video', label: 'Videos' },
]
const PAGE_SIZE = 12

const matchesFilter = (item, filter) => filter === 'all' || item.type === filter

const mapDoc = (doc) => {
  const data = doc.data()
  const rawUrl = data.mediaUrl || data.url || ''
  const isVideoExt = Boolean(rawUrl.match(/\.(mp4|webm|mov|m4v|avi)(\?.*)?$/i))
  const type = data.type || (data.duration || isVideoExt ? 'video' : 'image')
  return {
    id: doc.id,
    type,
    title: data.title || data.caption || '',
    category: data.category || '',
    mediaUrl: rawUrl,
    thumbnailUrl: data.thumbnailUrl || '',
    duration: data.duration || '',
    position: Number(data.position ?? 0),
    createdAt: data.createdAt,
    active: data.active !== false,
    raw: data,
  }
}

const sortGalleryItems = (items) => items.slice().sort((a, b) => {
  const aPos = Number(a.position ?? -1)
  const bPos = Number(b.position ?? -1)
  if (bPos !== aPos) return bPos - aPos
  const aCreated = a.createdAt?.toMillis ? a.createdAt.toMillis() : a.createdAt ? a.createdAt.seconds * 1000 : 0
  const bCreated = b.createdAt?.toMillis ? b.createdAt.toMillis() : b.createdAt ? b.createdAt.seconds * 1000 : 0
  return bCreated - aCreated
})

export default function Gallery() {
  const [filter, setFilter] = useState('all')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [selectedIndex, setSelectedIndex] = useState(null)

  const touchStartX = useRef(null)
  const touchStartY = useRef(null)

  useEffect(() => {
    async function fetchGallery() {
      setLoading(true)
      try {
        const snap = await getDocs(collection(db, 'gallery'))
        const mapped = snap.docs.map(mapDoc)
        setItems(sortGalleryItems(mapped))
      } catch (error) {
        console.error('Gallery fetch error', error)
      } finally {
        setLoading(false)
      }
    }
    fetchGallery()
  }, [])

  // Filter items matching active tab
  const filteredItems = useMemo(() => {
    return items.filter(item => item.active && matchesFilter(item, filter))
  }, [items, filter])

  // Paginated items
  const displayedItems = useMemo(() => {
    return filteredItems.slice(0, page * PAGE_SIZE)
  }, [filteredItems, page])

  // Only show Load More if there are genuinely more items left in this filter
  const hasMore = displayedItems.length < filteredItems.length

  const handleLoadMore = () => {
    setPage(p => p + 1)
  }

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter)
    setPage(1)
    setSelectedIndex(null)
  }

  const selectedMedia = selectedIndex !== null ? displayedItems[selectedIndex] : null

  const handlePrevMedia = () => {
    if (selectedIndex === null || !displayedItems.length) return
    setSelectedIndex(prev => (prev > 0 ? prev - 1 : displayedItems.length - 1))
  }

  const handleNextMedia = () => {
    if (selectedIndex === null || !displayedItems.length) return
    setSelectedIndex(prev => (prev < displayedItems.length - 1 ? prev + 1 : 0))
  }

  // Touch Swipe navigation (finger sliding)
  const handleTouchStart = (e) => {
    if (!e.touches?.length) return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null || !e.changedTouches?.length) return
    const diffX = touchStartX.current - e.changedTouches[0].clientX
    const diffY = touchStartY.current - e.changedTouches[0].clientY

    // Horizontal swipe threshold
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
      if (diffX > 0) {
        handleNextMedia()
      } else {
        handlePrevMedia()
      }
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  // Keyboard navigation
  useEffect(() => {
    if (selectedIndex === null) return
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') handleNextMedia()
      if (e.key === 'ArrowLeft') handlePrevMedia()
      if (e.key === 'Escape') setSelectedIndex(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndex, displayedItems.length])

  return (
    <div className="gallery-page">
      <div className="gallery-shell">
        <div className="gallery-hero">
          <h1>Gallery</h1>
          <p className="gallery-desc">Special moments & wagging tails, captured with love.</p>
        </div>

        <div className="gallery-filters gallery-type-filters">
          {FILTERS.map(item => (
            <button
              key={item.key}
              type="button"
              className={filter === item.key ? 'active' : ''}
              onClick={() => handleFilterChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="gallery-tile-grid">
            {Array.from({ length: 6 }).map((_, idx) => (
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
              {displayedItems.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  className="gallery-tile"
                  onClick={() => setSelectedIndex(idx)}
                >
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

            {/* Only display Load More if there are actually remaining items */}
            {hasMore && (
              <div style={{ textAlign: 'center', marginTop: '28px' }}>
                <button type="button" className="btn btn-primary" onClick={handleLoadMore}>
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Swipeable Lightbox with finger gesture support */}
      {selectedMedia && selectedIndex !== null && (
        <div
          className="gallery-lightbox"
          onClick={() => setSelectedIndex(null)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Top Bar with Counter & Close Button */}
          <div className="gallery-lightbox-top" onClick={e => e.stopPropagation()}>
            <span className="gallery-lightbox-counter">
              {selectedIndex + 1} / {displayedItems.length}
            </span>
            <button
              type="button"
              className="gallery-lightbox-close-btn"
              onClick={() => setSelectedIndex(null)}
              aria-label="Close media preview"
            >
              <X size={20} />
            </button>
          </div>

          {/* Desktop Left Nav Arrow */}
          {displayedItems.length > 1 && (
            <button
              type="button"
              className="gallery-lightbox-nav prev"
              onClick={(e) => {
                e.stopPropagation()
                handlePrevMedia()
              }}
              aria-label="Previous image"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          {/* Center Media Box */}
          <div className="gallery-lightbox-content" onClick={e => e.stopPropagation()}>
            {selectedMedia.type === 'video' ? (
              <video
                key={selectedMedia.id}
                controls
                autoPlay
                poster={selectedMedia.thumbnailUrl || undefined}
                className="gallery-lightbox-video"
              >
                <source src={selectedMedia.mediaUrl} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            ) : (
              <img
                key={selectedMedia.id}
                src={selectedMedia.mediaUrl}
                alt={selectedMedia.title || 'Gallery image'}
                className="gallery-lightbox-img"
              />
            )}
            {selectedMedia.title && (
              <p className="gallery-lightbox-caption">{selectedMedia.title}</p>
            )}
          </div>

          {/* Desktop Right Nav Arrow */}
          {displayedItems.length > 1 && (
            <button
              type="button"
              className="gallery-lightbox-nav next"
              onClick={(e) => {
                e.stopPropagation()
                handleNextMedia()
              }}
              aria-label="Next image"
            >
              <ChevronRight size={24} />
            </button>
          )}

          {/* Mobile Swipe Hint */}
          <div className="gallery-lightbox-hint" onClick={e => e.stopPropagation()}>
            Swipe left or right to browse
          </div>
        </div>
      )}
    </div>
  )
}
