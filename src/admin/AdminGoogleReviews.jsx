// src/admin/AdminGoogleReviews.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'
import Toast from '../components/Toast'
import { uploadToCloudinary } from '../utils/cloudinary'
import { isSupportedImage } from '../utils/imageCompression'
import { CheckCircle2, ImagePlus, Pencil, Plus, Trash2, X, PawPrint, Search, ZoomIn } from 'lucide-react'

const MAX_REVIEW_IMAGES = 3

const emptyForm = {
  id: null,
  customerName: '',
  rating: 5,
  review: '',
  reviewDate: '',
  petName: '',
  profileImage: '',
  reviewImages: [],
  displayOrder: 0,
  active: true,
  profileImageUrl: '',
  reviewImageUrls: '',
}

function Stars({ value = 5 }) {
  return (
    <div className="rev-card-stars">
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} style={{ color: n <= value ? '#eab308' : '#e5e7eb' }}>★</span>
      ))}
    </div>
  )
}

export default function AdminGoogleReviews() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [profileFile, setProfileFile] = useState(null)
  const [reviewFiles, setReviewFiles] = useState([])
  const [uploadError, setUploadError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [lightboxImage, setLightboxImage] = useState(null)
  const reviewPhotoInputRef = useRef(null)

  const fetchReviews = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'reviews'))
      const rows = snap.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .filter(item => item.source === 'google')
        .sort((a, b) => Number(b.displayOrder || 0) - Number(a.displayOrder || 0) || ((b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)))
      setReviews(rows)
    } catch (error) {
      console.error(error)
    }
    setLoading(false)
  }

  useEffect(() => { fetchReviews() }, [])

  useEffect(() => {
    if (!toastMessage) return
    const timer = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(timer)
  }, [toastMessage])

  const openCreate = () => {
    setForm({ ...emptyForm, rating: 5, active: true })
    setProfileFile(null)
    setReviewFiles([])
    setUploadError('')
    setModalOpen(true)
  }

  const openEdit = (review) => {
    setForm({
      id: review.id,
      customerName: review.customerName || '',
      rating: Number(review.rating || 5),
      review: review.review || review.comment || '',
      reviewDate: review.reviewDate || '',
      petName: review.petName || '',
      profileImage: review.profileImage || '',
      reviewImages: Array.isArray(review.reviewImages) ? review.reviewImages : (Array.isArray(review.images) ? review.images : []),
      displayOrder: Number(review.displayOrder || 0),
      active: review.active !== false,
      profileImageUrl: '',
      reviewImageUrls: '',
    })
    setProfileFile(null)
    setReviewFiles([])
    setUploadError('')
    setModalOpen(true)
  }

  const handleFiles = (event, kind) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    if (kind === 'profile') {
      const invalid = files.find(file => !isSupportedImage(file))
      if (invalid) {
        setUploadError('Please choose JPG, PNG, or WEBP images only.')
        setToastType('error')
        setToastMessage('Please choose JPG, PNG, or WEBP images only.')
        return
      }
      setProfileFile(files[0])
      setUploadError('')
      return
    }
    const invalid = files.find(file => !isSupportedImage(file))
    if (invalid) {
      setUploadError('Please choose JPG, PNG, or WEBP images only.')
      setToastType('error')
      setToastMessage('Please choose JPG, PNG, or WEBP images only.')
      return
    }
    const existingCount = reviewFiles.length + (Array.isArray(form.reviewImages) ? form.reviewImages.length : 0)
    if (existingCount >= MAX_REVIEW_IMAGES) {
      const message = `You can add up to ${MAX_REVIEW_IMAGES} review photos.`
      setToastType('error')
      setToastMessage(message)
      return
    }
    const nextFiles = files.slice(0, MAX_REVIEW_IMAGES - existingCount)
    const nextList = [...reviewFiles, ...nextFiles]
    setReviewFiles(nextList)
    setUploadError('')
  }

  const addReviewImages = () => {
    const parsedReviewImageUrls = String(form.reviewImageUrls || '')
      .split(/\n|,/)
      .map(item => item.trim())
      .filter(Boolean)

    if (!parsedReviewImageUrls.length) {
      const message = 'Paste at least one image URL first.'
      setUploadError(message)
      setToastType('error')
      setToastMessage(message)
      return
    }

    const existingCount = (Array.isArray(form.reviewImages) ? form.reviewImages.length : 0) + reviewFiles.length
    if (existingCount >= MAX_REVIEW_IMAGES) {
      const message = `You can add up to ${MAX_REVIEW_IMAGES} review photos.`
      setToastType('error')
      setToastMessage(message)
      return
    }

    const nextUrls = parsedReviewImageUrls.slice(0, MAX_REVIEW_IMAGES - existingCount)
    setForm(prev => ({
      ...prev,
      reviewImages: [...(Array.isArray(prev.reviewImages) ? prev.reviewImages : []), ...nextUrls],
      reviewImageUrls: '',
    }))
    setUploadError('')
  }

  const openReviewFilePicker = () => reviewPhotoInputRef.current?.click()

  const removeReviewFile = (index) => {
    setReviewFiles(prev => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  const removeExistingReviewImage = (index) => {
    setForm(prev => ({ ...prev, reviewImages: prev.reviewImages.filter((_, itemIndex) => itemIndex !== index) }))
  }

  const handleSubmit = async () => {
    if (!form.customerName.trim()) {
      setToastType('error')
      setToastMessage('Customer name is required.')
      return
    }
    if (!form.review.trim()) {
      setToastType('error')
      setToastMessage('Review text is required.')
      return
    }
    setSaving(true)
    setUploadError('')
    try {
      let profileImageUrl = form.profileImageUrl || form.profileImage || ''
      if (profileFile) {
        profileImageUrl = await uploadToCloudinary(profileFile)
      }

      const reviewImageUrls = [...(Array.isArray(form.reviewImages) ? form.reviewImages : [])]
      const parsedReviewImageUrls = String(form.reviewImageUrls || '')
        .split(/\n|,/)
        .map(item => item.trim())
        .filter(Boolean)
      reviewImageUrls.push(...parsedReviewImageUrls)
      if (reviewFiles.length) {
        const uploadedReviewImages = []
        for (const file of reviewFiles) {
          uploadedReviewImages.push(await uploadToCloudinary(file))
        }
        reviewImageUrls.push(...uploadedReviewImages)
      }
      const uniqueReviewImages = Array.from(new Set(reviewImageUrls.filter(Boolean))).slice(0, MAX_REVIEW_IMAGES)

      const payload = {
        customerName: form.customerName.trim(),
        rating: Number(form.rating || 5),
        review: form.review.trim(),
        reviewDate: form.reviewDate || '',
        petName: form.petName.trim(),
        profileImage: profileImageUrl,
        reviewImages: uniqueReviewImages,
        source: 'google',
        active: form.active !== false,
        displayOrder: Number(form.displayOrder || 0),
        updatedAt: serverTimestamp(),
      }

      if (form.id) {
        await updateDoc(doc(db, 'reviews', form.id), payload)
        setToastType('success')
        setToastMessage('Google review updated successfully.')
      } else {
        await addDoc(collection(db, 'reviews'), {
          ...payload,
          createdAt: serverTimestamp(),
        })
        setToastType('success')
        setToastMessage('Google review added successfully.')
      }

      setModalOpen(false)
      setForm({ ...emptyForm, rating: 5, active: true, profileImageUrl: '', reviewImageUrls: '' })
      setProfileFile(null)
      setReviewFiles([])
      setUploadError('')
      await fetchReviews()
    } catch (error) {
      console.error(error)
      setToastType('error')
      setToastMessage(error.message || 'We could not save the review.')
    }
    setSaving(false)
  }

  const toggleActive = async (review) => {
    try {
      await updateDoc(doc(db, 'reviews', review.id), {
        active: review.active === false,
        updatedAt: serverTimestamp(),
      })
      setToastType('success')
      setToastMessage(review.active === false ? 'Review enabled.' : 'Review disabled.')
      await fetchReviews()
    } catch (error) {
      console.error(error)
      setToastType('error')
      setToastMessage('Could not update review status.')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteDoc(doc(db, 'reviews', deleteTarget.id))
      setToastType('success')
      setToastMessage('Google review deleted successfully.')
      setDeleteTarget(null)
      await fetchReviews()
    } catch (error) {
      console.error(error)
      setToastType('error')
      setToastMessage('Could not delete the review.')
    }
  }

  const summary = useMemo(() => {
    const activeCount = reviews.filter(item => item.active !== false).length
    const avg = reviews.length ? (reviews.reduce((sum, item) => sum + Number(item.rating || 5), 0) / reviews.length).toFixed(1) : '0.0'
    return { activeCount, avg }
  }, [reviews])

  const filteredReviews = useMemo(() => {
    return reviews.filter(r => {
      if (statusFilter === 'active' && r.active === false) return false
      if (statusFilter === 'disabled' && r.active !== false) return false
      if (statusFilter === 'photos' && !(r.reviewImages?.length || r.images?.length)) return false
      if (['1', '2', '3', '4', '5'].includes(statusFilter)) {
        if (Number(r.rating || 5) !== Number(statusFilter)) return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const name = (r.customerName || '').toLowerCase()
        const pet = (r.petName || '').toLowerCase()
        const text = (r.review || r.comment || '').toLowerCase()
        if (!name.includes(q) && !pet.includes(q) && !text.includes(q)) return false
      }
      return true
    })
  }, [reviews, search, statusFilter])

  const reviewImageCount = useMemo(() => {
    const existingCount = Array.isArray(form.reviewImages) ? form.reviewImages.length : 0
    return existingCount + reviewFiles.length
  }, [form.reviewImages, reviewFiles])

  return (
    <div style={{ padding: '28px', maxWidth: '1400px', margin: '0 auto' }}>
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1600 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', margin: '0 0 4px 0' }}>Google Reviews</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 0 }}>
            {reviews.length} Google reviews · Average rating: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{summary.avg}★</span> · <span style={{ color: '#16a34a', fontWeight: 700 }}>{summary.activeCount} active</span>
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Add Google Review
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="admin-rev-search-bar">
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '220px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            className="input"
            type="text"
            placeholder="Search by customer name, pet, or review..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '34px', fontSize: '13px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { id: 'all', label: `All (${reviews.length})` },
            { id: 'active', label: `Active (${summary.activeCount})` },
            { id: 'disabled', label: `Disabled (${reviews.length - summary.activeCount})` },
            { id: '5', label: '5 ★' },
            { id: '4', label: '4 ★' },
            { id: '3', label: '3 ★' },
            { id: 'photos', label: '📷 Photos' },
          ].map(chip => (
            <button
              key={chip.id}
              type="button"
              className={`admin-rev-filter-chip${statusFilter === chip.id ? ' active' : ''}`}
              onClick={() => setStatusFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reviews Grid */}
      {loading ? (
        <Spinner text="Loading Google reviews…" />
      ) : reviews.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: 0 }}>No Google reviews yet. Click "Add Google Review" to create one.</p>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: 0 }}>No Google reviews match your search or filter.</p>
        </div>
      ) : (
        <div className="rev-grid">
          {filteredReviews.map(review => {
            const authorName = review.customerName || 'Google User'
            const avatarInitial = (authorName || 'G')[0]?.toUpperCase()
            const avatarUrl = review.profileImage || ''
            const ratingNum = Number(review.rating || 5)
            const dateStr = review.reviewDate
              ? new Date(review.reviewDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
              : review.createdAt?.toDate?.()
              ? review.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
              : ''
            const imagesList = Array.isArray(review.reviewImages) && review.reviewImages.length
              ? review.reviewImages
              : (Array.isArray(review.images) ? review.images : [])

            return (
              <div key={review.id} className="rev-card">
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
                      {review.petName ? (
                        <span className="rev-pet-tag"><PawPrint size={10} /> {review.petName}'s parent</span>
                      ) : (
                        <span className="rev-pet-tag"><PawPrint size={10} /> Google Reviewer</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="rev-card-stars-wrap">
                      <Stars value={ratingNum} />
                      <span className="rev-card-score-num">{ratingNum.toFixed(1)}</span>
                    </div>

                    <div className="admin-rev-actions">
                      <button
                        type="button"
                        onClick={() => openEdit(review)}
                        className="admin-rev-btn"
                        title="Edit Google review"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(review)}
                        className="admin-rev-btn delete"
                        title="Delete Google review"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Badges Row */}
                <div className="rev-card-badges-row">
                  <span className="rev-source-pill rev-source-google">
                    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
                      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2h-9.4v3.8h5.4c-.2 1.3-.9 2.4-2 3.1v2.6h3.2c1.9-1.8 3-4.5 3-7.5Z" />
                      <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.6c-.9.6-2.1.9-3.4.9-2.6 0-4.8-1.8-5.6-4.2H3.1v2.6C4.8 19.8 8.2 22 12 22Z" />
                      <path fill="#FBBC05" d="M6.4 13.7c-.2-.6-.3-1.2-.3-1.8s.1-1.3.3-1.8V7.5H3.1C2.4 8.8 2 10.3 2 12s.4 3.2 1.1 4.5l3.3-2.8Z" />
                      <path fill="#EA4335" d="M12 6.2c1.5 0 2.8.5 3.9 1.5l2.9-2.9C16.9 3.1 14.5 2 12 2 8.2 2 4.8 4.2 3.1 7.5l3.3 2.6c.8-2.4 3-4.2 5.6-4.2Z" />
                    </svg>
                    Google
                  </span>

                  <button
                    type="button"
                    onClick={() => toggleActive(review)}
                    title="Click to toggle status"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 700,
                      border: '1px solid',
                      cursor: 'pointer',
                      background: review.active !== false ? 'rgba(22, 163, 74, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                      borderColor: review.active !== false ? 'rgba(22, 163, 74, 0.25)' : 'rgba(107, 114, 128, 0.2)',
                      color: review.active !== false ? '#16a34a' : 'var(--muted)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {review.active !== false ? <><CheckCircle2 size={11} /> Active</> : 'Disabled'}
                  </button>

                  {review.displayOrder !== undefined && Number(review.displayOrder) > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--surface)', padding: '2px 7px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      Order: {review.displayOrder}
                    </span>
                  )}

                  {dateStr && <span className="rev-card-time">{dateStr}</span>}
                </div>

                {/* Review Text */}
                <p className="rev-card-text">"{review.review || review.comment || ''}"</p>

                {/* Photos */}
                {imagesList.length > 0 && (
                  <div className="rev-card-photos">
                    {imagesList.map((imageUrl, index) => (
                      <button
                        key={`${review.id}-${index}`}
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

      {/* Add / Edit Google Review Modal */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7, 10, 18, 0.82)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ width: '100%', maxWidth: '640px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '22px', padding: '24px', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px', gap: '12px' }}>
              <div>
                <h2 style={{ fontFamily: '"Playfair Display",serif', fontWeight: 700, fontSize: '20px', color: 'var(--text)', margin: 0 }}>
                  {form.id ? 'Edit Google Review' : 'Add Google Review'}
                </h2>
                <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>Manage external Google review card details</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setModalOpen(false)}
                style={{ width: '34px', height: '34px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            {uploadError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444', fontSize: '12.5px', padding: '10px 14px', borderRadius: '10px', marginBottom: '14px' }}>
                {uploadError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Customer Name *</label>
                  <input
                    className="input"
                    placeholder="e.g. John Doe"
                    value={form.customerName}
                    onChange={e => setForm(prev => ({ ...prev, customerName: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Rating *</label>
                  <select
                    className="input"
                    value={form.rating}
                    onChange={e => setForm(prev => ({ ...prev, rating: Number(e.target.value) }))}
                  >
                    {[5, 4, 3, 2, 1].map(value => (
                      <option key={value} value={value}>{value} Star{value > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Review Text *</label>
                <textarea
                  className="input"
                  rows={4}
                  style={{ resize: 'vertical' }}
                  placeholder="Paste Google review message..."
                  value={form.review}
                  onChange={e => setForm(prev => ({ ...prev, review: e.target.value }))}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Pet Name (optional)</label>
                  <input
                    className="input"
                    placeholder="e.g. Bruno"
                    value={form.petName}
                    onChange={e => setForm(prev => ({ ...prev, petName: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Review Date (optional)</label>
                  <input
                    type="date"
                    className="input"
                    value={form.reviewDate}
                    onChange={e => setForm(prev => ({ ...prev, reviewDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Display Order</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="0"
                    value={form.displayOrder}
                    onChange={e => setForm(prev => ({ ...prev, displayOrder: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              {/* Profile Image */}
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Profile Photo (optional)</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    placeholder="Paste image URL or choose file below"
                    value={form.profileImageUrl || form.profileImage}
                    onChange={e => setForm(prev => ({ ...prev, profileImageUrl: e.target.value, profileImage: e.target.value }))}
                    style={{ flex: 1, minWidth: '200px' }}
                  />
                  <label className="btn btn-secondary" style={{ cursor: 'pointer', whiteSpace: 'nowrap', padding: '9px 14px', fontSize: '12.5px' }}>
                    <ImagePlus size={14} /> Upload Photo
                    <input type="file" accept=".jpg,.jpeg,.png,.webp,image/*" hidden onChange={e => handleFiles(e, 'profile')} />
                  </label>
                </div>
                {profileFile && (
                  <p style={{ fontSize: '11.5px', color: 'var(--accent)', marginTop: '4px' }}>Selected file: {profileFile.name}</p>
                )}
              </div>

              {/* Review Images */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)' }}>Review Photos (up to 3)</label>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{reviewImageCount} / {MAX_REVIEW_IMAGES}</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    className="input"
                    placeholder="Paste image URL..."
                    value={form.reviewImageUrls}
                    onChange={e => setForm(prev => ({ ...prev, reviewImageUrls: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn btn-secondary" onClick={addReviewImages} style={{ whiteSpace: 'nowrap', padding: '9px 14px', fontSize: '12.5px' }}>
                    Add URL
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={openReviewFilePicker} style={{ whiteSpace: 'nowrap', padding: '9px 14px', fontSize: '12.5px' }}>
                    <ImagePlus size={14} /> Choose File
                  </button>
                  <input ref={reviewPhotoInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/*" multiple hidden onChange={e => handleFiles(e, 'review')} />
                </div>

                {/* Selected Review Images preview */}
                {(form.reviewImages.length > 0 || reviewFiles.length > 0) && (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {form.reviewImages.map((url, idx) => (
                      <div key={`existing-${idx}`} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button type="button" onClick={() => removeExistingReviewImage(idx)} style={{ position: 'absolute', top: '3px', right: '3px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                    {reviewFiles.map((file, idx) => (
                      <div key={`file-${idx}`} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--accent)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--muted)', textAlign: 'center', padding: '4px' }}>
                        <span>{file.name.slice(0, 8)}...</span>
                        <button type="button" onClick={() => removeReviewFile(idx)} style={{ position: 'absolute', top: '3px', right: '3px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active status checkbox */}
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text)', userSelect: 'none', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  checked={form.active !== false}
                  onChange={e => setForm(prev => ({ ...prev, active: e.target.checked }))}
                />
                Show this review publicly on website
              </label>

              {/* Modal Buttons */}
              <div className="rev-modal-actions">
                <button type="button" className="btn btn-secondary rev-modal-btn cancel" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving || !form.customerName.trim() || !form.review.trim()}
                  className="btn btn-primary rev-modal-btn submit"
                >
                  {saving ? 'Saving…' : form.id ? 'Update Review' : 'Save Review'}
                </button>
              </div>
            </div>
          </div>
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
        title="Delete Google review?"
        message={`Are you sure you want to delete the Google review by ${deleteTarget?.customerName || 'this reviewer'}?`}
        confirmText="Delete"
        loading={false}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
