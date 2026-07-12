// src/pages/Reviews.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import Cropper from 'react-easy-crop'
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import { cropImageFile, isSupportedImage, optimizeImageForUpload, validateImageFile } from '../utils/imageCompression'
import { uploadToCloudinary } from '../utils/cloudinary'
import { Crop as CropIcon, ImagePlus, Send, X, BadgeCheck, Search, Filter, Image as ImageIcon } from 'lucide-react'

function Stars({ value, onChange, readonly = false }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" disabled={readonly} onClick={() => !readonly && onChange?.(n)}
          onMouseEnter={() => !readonly && setHover(n)} onMouseLeave={() => !readonly && setHover(0)}
          style={{ fontSize: '24px', background: 'none', border: 'none', cursor: readonly ? 'default' : 'pointer', color: (hover || value) >= n ? 'var(--accent)' : 'var(--border)', transition: 'all 0.1s', transform: !readonly && hover === n ? 'scale(1.2)' : 'scale(1)' }}
        >★</button>
      ))}
    </div>
  )
}

export default function Reviews() {
  const { user, isBlocked } = useAuth()
  const [reviews, setReviews]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter] = useState('all')
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [form, setForm]         = useState({ rating: 5, comment: '', petName: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [reviewToast, setReviewToast] = useState('')
  const [selectedImages, setSelectedImages] = useState([])
  const [imageError, setImageError] = useState('')
  const [reviewLightbox, setReviewLightbox] = useState(null)
  const [pendingCropFiles, setPendingCropFiles] = useState([])
  const [cropModal, setCropModal] = useState({
    open: false,
    file: null,
    previewUrl: '',
    crop: { x: 0, y: 0 },
    zoom: 1,
    croppedAreaPixels: null,
    processing: false,
    aspect: 1,
  })
  const imageInputRef = useRef(null)

  const fetchReviews = async () => {
    try {
      const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'))
      const rows = (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }))
      const normalized = rows.filter(item => item.active !== false).map(item => ({
        ...item,
        source: item.source || 'website',
        rating: Number(item.rating || item.stars || 5),
        comment: item.comment || item.review || '',
        customerName: item.customerName || item.userName || item.name || 'Pet Parent',
        profileImage: item.profileImage || item.userPhoto || '',
        reviewImages: Array.isArray(item.reviewImages) ? item.reviewImages : (Array.isArray(item.images) ? item.images : []),
        reviewDate: item.reviewDate || '',
        petName: item.petName || '',
        createdAt: item.createdAt,
      }))
      setReviews(normalized)
    } catch {}
    setLoading(false)
  }
  useEffect(() => { fetchReviews() }, [])

  useEffect(() => {
    if (!reviewToast) return
    const t = window.setTimeout(() => setReviewToast(''), 3500)
    return () => window.clearTimeout(t)
  }, [reviewToast])

  const visibleReviews = useMemo(() => {
    const filtered = reviews.filter(item => {
      if (filter === 'google') return item.source === 'google'
      if (filter === 'verified') return item.source === 'website'
      if (filter === 'photos') return (item.reviewImages?.length || item.images?.length || 0) > 0
      return true
    })
    return filtered.sort((a, b) => {
      const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
      const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
      return timeB - timeA
    })
  }, [filter, reviews])
  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 5), 0) / reviews.length).toFixed(1) : '5.0'
  const dist = [5,4,3,2,1].map(n => ({ n, count: reviews.filter(r => r.rating === n).length, pct: reviews.length ? Math.round((reviews.filter(r => r.rating === n).length / reviews.length) * 100) : 0 }))

  const openCropModalForFile = (file) => {
    const previewUrl = URL.createObjectURL(file)
    setCropModal({
      open: true,
      file,
      previewUrl,
      crop: { x: 0, y: 0 },
      zoom: 1,
      croppedAreaPixels: null,
      processing: false,
      aspect: 1,
    })
  }

  const closeCropModal = () => {
    if (cropModal.previewUrl) {
      URL.revokeObjectURL(cropModal.previewUrl)
    }

    if (pendingCropFiles.length > 0) {
      const [nextFile, ...remaining] = pendingCropFiles
      setPendingCropFiles(remaining)
      openCropModalForFile(nextFile)
      return
    }

    setCropModal({
      open: false,
      file: null,
      previewUrl: '',
      crop: { x: 0, y: 0 },
      zoom: 1,
      croppedAreaPixels: null,
      processing: false,
      aspect: 1,
    })
  }

  const handleImageSelection = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const remainingSlots = 3 - selectedImages.length
    if (remainingSlots <= 0) {
      setImageError('You can add up to 3 images to a review.')
      event.target.value = ''
      return
    }

    const nextFiles = files.slice(0, remainingSlots)
    const invalid = nextFiles.find(file => !isSupportedImage(file))
    if (invalid) {
      setImageError('Please choose JPG, PNG, or WEBP images only.')
      event.target.value = ''
      return
    }

    try {
      nextFiles.forEach(file => {
        validateImageFile(file)
      })

      const [firstFile, ...remaining] = nextFiles
      setPendingCropFiles(remaining)
      if (firstFile) {
        openCropModalForFile(firstFile)
      }
      setImageError('')
    } catch (error) {
      setImageError(error.message || 'We could not prepare the image. Please try another image.')
    } finally {
      event.target.value = ''
    }
  }

  const handleCropComplete = (_, croppedAreaPixels) => {
    setCropModal(prev => ({ ...prev, croppedAreaPixels }))
  }

  const handleCropConfirm = async () => {
    if (!cropModal.file) return

    setCropModal(prev => ({ ...prev, processing: true }))
    try {
      const processedFile = cropModal.croppedAreaPixels ? await cropImageFile(cropModal.file, cropModal.croppedAreaPixels) : cropModal.file
      const optimizedFile = await optimizeImageForUpload(processedFile)

      setSelectedImages(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        file: optimizedFile,
        previewUrl: URL.createObjectURL(optimizedFile),
      }])
      setImageError('')
    } catch (error) {
      setImageError(error.message || 'We could not prepare the image. Please try another image.')
    } finally {
      closeCropModal()
    }
  }

  const removeSelectedImage = (id) => {
    setSelectedImages(prev => prev.filter(item => item.id !== id))
  }

  const handleSubmit = async () => {
    if (isBlocked || !form.comment.trim() || !user) return
    setSubmitting(true)
    setImageError('')
    try {
      const imageUrls = []
      if (selectedImages.length) {
        for (const item of selectedImages) {
          const uploadedUrl = await uploadToCloudinary(item.file)
          imageUrls.push(uploadedUrl)
        }
      }

      await addDoc(collection(db, 'reviews'), {
        userId: user.uid, userEmail: user.email || '',
        userName: user.displayName || user.email?.split('@')[0] || 'Pet Parent',
        userPhoto: user.photoURL || '',
        rating: form.rating, comment: form.comment.trim(), petName: form.petName,
        images: imageUrls,
        source: 'website',
        active: true,
        createdAt: serverTimestamp(),
      })
      setSubmitted(true)
      setReviewToast('Thank you! Your review has been submitted successfully.')
      setShowReviewForm(false)
      setForm({ rating: 5, comment: '', petName: '' })
      setSelectedImages([])
      await fetchReviews()
    } catch (error) {
      setImageError(error.message || 'We could not submit your review right now.')
    }
    setSubmitting(false)
  }

  const L = { fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '6px' }

  return (
    <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' }}>
      {reviewToast && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={reviewToast} type="success" onClose={() => setReviewToast('')} />
        </div>
      )}
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 20px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '48px' }}>
          <div style={{ textAlign: 'center' }}>
            <p className="section-label" style={{ marginBottom: '10px' }}>Customer Feedback</p>
            <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: 'clamp(32px,5vw,52px)', fontWeight: 800, color: 'var(--text)' }}>Reviews</h1>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => {
            if (!user) {
              window.location.href = '/login'
              return
            }
            setShowReviewForm(prev => !prev)
          }} style={{ padding: '10px 16px' }}>
            {user ? (showReviewForm ? 'Close Form' : 'Add Review') : 'Login to Review'}
          </button>
        </div>

        {/* Summary */}
        {reviews.length > 0 && (
          <div className="card" style={{ padding: '28px', marginBottom: '28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: '"Playfair Display",serif', fontSize: '72px', fontWeight: 900, background: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>{avgRating}</div>
              <Stars value={Math.round(parseFloat(avgRating))} readonly />
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '8px' }}>{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
              {dist.map(({ n, count, pct }) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: 'var(--muted)', fontSize: '12px', width: '8px', textAlign: 'right' }}>{n}</span>
                  <span style={{ color: 'var(--accent)', fontSize: '11px' }}>★</span>
                  <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--accent)', borderRadius: '3px', width: `${pct}%`, transition: 'width 0.8s ease' }} />
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: '11px', width: '20px' }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card" style={{ padding: '18px 22px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--muted)', fontSize: '12px', flexShrink: 0 }}><Filter size={14} /> Filter</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap', overflowX: 'auto', minWidth: 0, scrollbarWidth: 'none' }}>
            {['all', 'google', 'verified', 'photos'].map(option => {
              const label = option === 'all' ? 'All' : option === 'google' ? 'Google Reviews' : option === 'verified' ? 'Verified Customers' : 'Photos'
              return (
                <button key={option} type="button" onClick={() => setFilter(option)} style={{ border: filter === option ? '1px solid var(--accent)' : '1px solid var(--border)', background: filter === option ? 'var(--accent-bg)' : 'var(--surface)', color: filter === option ? 'var(--accent)' : 'var(--text)', borderRadius: '999px', padding: '7px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Submit */}
        {!user ? (
          <div className="card" style={{ padding: '28px', marginBottom: '28px', textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', marginBottom: '16px' }}>Login to leave a review</p>
            <a href="/login" className="btn btn-primary" style={{ display: 'inline-flex' }}>Login to Review</a>
          </div>
        ) : null}

        {showReviewForm && user && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(7, 10, 18, 0.82)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ width: '100%', maxWidth: '680px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '18px' }}>
                <h2 style={{ fontFamily: '"Playfair Display",serif', fontWeight: 700, fontSize: '20px', color: 'var(--text)', margin: 0 }}>Leave a Review</h2>
                <button type="button" aria-label="Close review form" onClick={() => setShowReviewForm(false)} style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted)' }}>
                  <X size={16} />
                </button>
              </div>
              {isBlocked && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444', fontSize: '13px', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px' }}>
                  Your account is blocked from publishing reviews.
                </div>
              )}
              {imageError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444', fontSize: '13px', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px' }}>
                  {imageError}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div><label style={L}>Your Rating</label><Stars value={form.rating} onChange={v => setForm(p => ({ ...p, rating: v }))} /></div>
                <div>
                  <label style={L}>Pet's Name (optional)</label>
                  <input className="input" placeholder="e.g. Bruno" value={form.petName} onChange={e => setForm(p => ({ ...p, petName: e.target.value }))} />
                </div>
                <div>
                  <label style={L}>Your Review *</label>
                  <textarea className="input" style={{ resize: 'none' }} rows={4} placeholder="Share your experience at Paw Paw Pet Grooming..." value={form.comment} onChange={e => setForm(p => ({ ...p, comment: e.target.value }))} />
                </div>
                <div>
                  <label style={L}>Add up to 3 photos</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => imageInputRef.current?.click()}>
                      <ImagePlus size={15} /> Add Photos
                    </button>
                  </div>
                  <input ref={imageInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple hidden onChange={handleImageSelection} />
                  {selectedImages.length > 0 && (
                    <div className="review-upload-grid">
                      {selectedImages.map((item) => (
                        <div key={item.id} className="review-upload-tile">
                          <img src={item.previewUrl} alt="Review preview" />
                          <button type="button" className="review-upload-remove" onClick={() => removeSelectedImage(item.id)}>
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowReviewForm(false)}>Cancel</button>
                  <button onClick={handleSubmit} disabled={isBlocked || submitting || !form.comment.trim()} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                    <Send size={15} /> {submitting ? 'Submitting…' : 'Submit Review'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reviews list */}
        {loading ? <Spinner text="Loading reviews..." /> : reviews.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted)' }}>No reviews yet. Be the first!</div>
        ) : visibleReviews.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted)' }}>No reviews match this filter right now.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {visibleReviews.map(r => (
              <div key={r.id} className="card" style={{ padding: '22px' }}>
                <div style={{ display: 'flex', gap: '14px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {r.profileImage ? <img src={r.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '16px' }}>{(r.customerName || r.userName || 'P')?.[0]?.toUpperCase()}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '14px' }}>{r.customerName || r.userName}</span>
                        {r.petName && <span style={{ color: 'var(--muted)', fontSize: '12px', marginLeft: '8px' }}>· {r.petName}'s parent</span>}
                      </div>
                      <Stars value={r.rating} readonly />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {r.source === 'google' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(66,133,244,0.12)', color: '#1a73e8', border: '1px solid rgba(66,133,244,0.2)', borderRadius: '999px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
                            <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2h-9.4v3.8h5.4c-.2 1.3-.9 2.4-2 3.1v2.6h3.2c1.9-1.8 3-4.5 3-7.5Z" />
                            <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.6c-.9.6-2.1.9-3.4.9-2.6 0-4.8-1.8-5.6-4.2H3.1v2.6C4.8 19.8 8.2 22 12 22Z" />
                            <path fill="#FBBC05" d="M6.4 13.7c-.2-.6-.3-1.2-.3-1.8s.1-1.3.3-1.8V7.5H3.1C2.4 8.8 2 10.3 2 12s.4 3.2 1.1 4.5l3.3-2.8Z" />
                            <path fill="#EA4335" d="M12 6.2c1.5 0 2.8.5 3.9 1.5l2.9-2.9C16.9 3.1 14.5 2 12 2 8.2 2 4.8 4.2 3.1 7.5l3.3 2.6c.8-2.4 3-4.2 5.6-4.2Z" />
                          </svg>
                          Google Review
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a', border: '1px solid rgba(22, 163, 74, 0.2)', borderRadius: '999px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                          <BadgeCheck size={12} /> Verified Customer
                        </span>
                      )}
                    </div>
                    <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.7 }}>"{r.comment}"</p>
                    {r.reviewImages?.length > 0 && (
                      <div className="review-upload-grid" style={{ marginTop: '12px' }}>
                        {r.reviewImages.map((imageUrl, index) => (
                          <button key={`${r.id}-${index}`} type="button" className="review-upload-tile" onClick={() => setReviewLightbox({ url: imageUrl, alt: `Review photo ${index + 1}` })}>
                            <img src={imageUrl} alt={`Review photo ${index + 1}`} />
                          </button>
                        ))}
                      </div>
                    )}
                    {r.createdAt?.toDate && (
                      <p style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '8px' }}>
                        {r.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {reviewLightbox && (
          <div onClick={() => setReviewLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(7, 10, 18, 0.94)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', cursor: 'pointer' }}>
            <div onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '100%', cursor: 'default' }}>
              <button onClick={() => setReviewLightbox(null)} aria-label="Close review image" style={{ marginLeft: 'auto', marginBottom: '12px', width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={18} />
              </button>
              <img src={reviewLightbox.url} alt={reviewLightbox.alt || 'Review image'} style={{ width: '100%', borderRadius: '10px', maxHeight: '80vh', objectFit: 'contain' }} />
            </div>
          </div>
        )}

        {cropModal.open && cropModal.file && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(7, 10, 18, 0.82)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ width: '100%', maxWidth: '560px', background: '#ffffff', border: '1px solid var(--border)', borderRadius: '24px', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', padding: '18px 18px 0' }}>
                <div>
                  <h2 style={{ color: 'var(--text)', fontSize: '18px', fontWeight: 900, margin: 0 }}>Crop Photo</h2>
                  <p style={{ color: 'var(--muted)', fontSize: '12px', margin: '4px 0 0' }}>Adjust the photo before saving it to your review.</p>
                </div>
                <button type="button" onClick={closeCropModal} aria-label="Close cropper" style={{ width: '34px', height: '34px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>
              <div style={{ position: 'relative', width: '100%', height: 'min(62vh, 420px)', minHeight: '300px', marginTop: '16px', background: '#111' }}>
                <Cropper
                  image={cropModal.previewUrl}
                  crop={cropModal.crop}
                  zoom={cropModal.zoom}
                  aspect={cropModal.aspect}
                  cropShape="rect"
                  onCropChange={(crop) => setCropModal(prev => ({ ...prev, crop }))}
                  onZoomChange={(zoom) => setCropModal(prev => ({ ...prev, zoom }))}
                  onCropComplete={handleCropComplete}
                />
              </div>
              <label style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '12px', alignItems: 'center', padding: '16px 18px 0', color: 'var(--muted)', fontSize: '12px', fontWeight: 800 }}>
                Zoom
                <input type="range" min="1" max="3" step="0.05" value={cropModal.zoom} onChange={(event) => setCropModal(prev => ({ ...prev, zoom: Number(event.target.value) }))} style={{ width: '100%' }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '16px 18px 18px' }}>
                <button type="button" className="btn btn-secondary" onClick={closeCropModal}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={handleCropConfirm} disabled={cropModal.processing}>
                  {cropModal.processing ? 'Preparing…' : 'Use this photo'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
