// src/admin/AdminReviews.jsx
import { useEffect, useState, useMemo } from 'react'
import { collection, getDocs, doc, deleteDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'
import Toast from '../components/Toast'
import { Trash2, PawPrint, BadgeCheck, Mail, Search, ZoomIn, X, Star } from 'lucide-react'

function Stars({ value = 5 }) {
  return (
    <div className="rev-card-stars">
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ color: n <= value ? '#eab308' : '#e5e7eb' }}>★</span>
      ))}
    </div>
  )
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [search, setSearch] = useState('')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [lightboxImage, setLightboxImage] = useState(null)
  const [toastMessage, setToastMessage] = useState('')

  const fetchReviews = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'reviews'), orderBy('createdAt', 'desc')))
      // Customer reviews are non-Google reviews
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.source !== 'google')
      setReviews(list)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    fetchReviews()
  }, [])

  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => setToastMessage(''), 3000)
    return () => clearTimeout(timer)
  }, [toastMessage])

  const handleDelete = async (id) => {
    setDeleting(id)
    try {
      await deleteDoc(doc(db, 'reviews', id))
      setReviews(prev => prev.filter(r => r.id !== id))
      setDeleteTarget(null)
      setToastMessage('Review deleted successfully.')
    } catch {
      setToastMessage('Failed to delete review.')
    }
    setDeleting(null)
  }

  const avg = reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 5), 0) / reviews.length).toFixed(1) : '0.0'

  const filteredReviews = useMemo(() => {
    return reviews.filter(r => {
      if (ratingFilter !== 'all') {
        if (ratingFilter === 'photos') {
          if (!r.reviewImages?.length) return false
        } else if (Number(r.rating || 5) !== Number(ratingFilter)) {
          return false
        }
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const name = (r.userName || r.customerName || '').toLowerCase()
        const pet = (r.petName || '').toLowerCase()
        const email = (r.userEmail || '').toLowerCase()
        const text = (r.comment || r.review || '').toLowerCase()
        if (!name.includes(q) && !pet.includes(q) && !email.includes(q) && !text.includes(q)) return false
      }
      return true
    })
  }, [reviews, search, ratingFilter])

  return (
    <div style={{ padding: '28px', maxWidth: '1400px', margin: '0 auto' }}>
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1600 }}>
          <Toast message={toastMessage} onClose={() => setToastMessage('')} />
        </div>
      )}

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', margin: '0 0 4px 0' }}>Customer Reviews</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 0 }}>
            {reviews.length} customer reviews · Average rating: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{avg}★</span>
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="admin-rev-search-bar">
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '220px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            className="input"
            type="text"
            placeholder="Search by name, pet, email, or comment..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '34px', fontSize: '13px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { id: 'all', label: `All (${reviews.length})` },
            { id: '5', label: '5 ★' },
            { id: '4', label: '4 ★' },
            { id: '3', label: '3 ★' },
            { id: '2', label: '2 ★' },
            { id: '1', label: '1 ★' },
            { id: 'photos', label: '📷 With Photos' },
          ].map(chip => (
            <button
              key={chip.id}
              type="button"
              className={`admin-rev-filter-chip${ratingFilter === chip.id ? ' active' : ''}`}
              onClick={() => setRatingFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Listing Grid */}
      {loading ? (
        <Spinner text="Loading customer reviews…" />
      ) : reviews.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: 0 }}>No customer reviews found.</p>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: 0 }}>No reviews match your search or filter.</p>
        </div>
      ) : (
        <div className="rev-grid">
          {filteredReviews.map(r => {
            const authorName = r.userName || r.customerName || 'Pet Parent'
            const avatarInitial = (authorName || 'P')[0]?.toUpperCase()
            const avatarUrl = r.userPhoto || r.profileImage || ''
            const ratingNum = Number(r.rating || 5)
            const dateStr = r.createdAt?.toDate
              ? r.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
              : ''

            return (
              <div key={r.id} className="rev-card">
                {/* Header */}
                <div className="rev-card-head">
                  <div className="rev-card-author">
                    <div className="rev-avatar">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" onError={e => { e.currentTarget.style.display = 'none' }} />
                      ) : (
                        <span>{avatarInitial}</span>
                      )}
                    </div>
                    <div className="rev-author-info">
                      <span className="rev-author-name">{authorName}</span>
                      {r.petName ? (
                        <span className="rev-pet-tag"><PawPrint size={10} /> {r.petName}'s parent</span>
                      ) : (
                        <span className="rev-pet-tag"><PawPrint size={10} /> Pet Parent</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="rev-card-stars-wrap">
                      <Stars value={ratingNum} />
                      <span className="rev-card-score-num">{ratingNum.toFixed(1)}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(r)}
                      disabled={deleting === r.id}
                      className="admin-rev-btn delete"
                      title="Delete review"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Badges Row */}
                <div className="rev-card-badges-row">
                  <span className="rev-source-pill rev-source-verified">
                    <BadgeCheck size={12} /> Verified Customer
                  </span>

                  {dateStr && <span className="rev-card-time">{dateStr}</span>}

                  {r.userEmail && (
                    <span className="admin-rev-user-meta" title={r.userEmail}>
                      <Mail size={10} /> {r.userEmail}
                    </span>
                  )}
                </div>

                {/* Review Text */}
                <p className="rev-card-text">"{r.comment || r.review || ''}"</p>

                {/* Compact Photos Thumbnails */}
                {r.reviewImages?.length > 0 && (
                  <div className="rev-card-photos">
                    {r.reviewImages.map((imageUrl, index) => (
                      <button
                        key={`${r.id}-${index}`}
                        type="button"
                        className="rev-photo-thumb"
                        onClick={() => setLightboxImage(imageUrl)}
                        title="Click to view photo"
                      >
                        <img
                          src={imageUrl}
                          alt="Review attachment"
                          onError={e => { e.currentTarget.style.display = 'none' }}
                        />
                        <div className="rev-photo-overlay"><ZoomIn size={14} /></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox Preview */}
      {lightboxImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.86)',
            zIndex: 3000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setLightboxImage(null)}
        >
          <img
            src={lightboxImage}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: '16px', objectFit: 'contain' }}
          />
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: '#fff',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete customer review?"
        message={`Are you sure you want to delete this review by ${deleteTarget?.userName || deleteTarget?.customerName || 'this customer'}?`}
        confirmText="Delete"
        loading={!!deleteTarget && deleting === deleteTarget.id}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
      />
    </div>
  )
}
