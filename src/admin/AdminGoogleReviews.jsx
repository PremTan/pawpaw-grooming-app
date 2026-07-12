// src/admin/AdminGoogleReviews.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'
import Toast from '../components/Toast'
import { uploadToCloudinary } from '../utils/cloudinary'
import { isSupportedImage, validateImageFile } from '../utils/imageCompression'
import { CheckCircle2, ImagePlus, Pencil, Plus, Trash2, X, BadgeCheck } from 'lucide-react'

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

function Stars({ value }) {
  return <span>{[1, 2, 3, 4, 5].map(n => <span key={n} style={{ color: n <= value ? 'var(--accent)' : 'var(--border)', fontSize: '14px' }}>★</span>)}</span>
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

  const reviewImageCount = useMemo(() => {
    const existingCount = Array.isArray(form.reviewImages) ? form.reviewImages.length : 0
    return existingCount + reviewFiles.length
  }, [form.reviewImages, reviewFiles])

  return (
    <div style={{ padding: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Google Reviews</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{reviews.length} Google reviews · Avg rating {summary.avg}★ · {summary.activeCount} active</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={15} /> Add Google Review
        </button>
      </div>

      {loading ? <Spinner text="Loading Google reviews…" /> : reviews.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>No Google reviews yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reviews.map(review => (
            <div key={review.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {review.profileImage ? <img src={review.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{(review.customerName || 'G').slice(0, 1).toUpperCase()}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '14px' }}>{review.customerName}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a', border: '1px solid rgba(22, 163, 74, 0.2)', borderRadius: '999px', padding: '4px 8px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
                          <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2h-9.4v3.8h5.4c-.2 1.3-.9 2.4-2 3.1v2.6h3.2c1.9-1.8 3-4.5 3-7.5Z" />
                          <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.6c-.9.6-2.1.9-3.4.9-2.6 0-4.8-1.8-5.6-4.2H3.1v2.6C4.8 19.8 8.2 22 12 22Z" />
                          <path fill="#FBBC05" d="M6.4 13.7c-.2-.6-.3-1.2-.3-1.8s.1-1.3.3-1.8V7.5H3.1C2.4 8.8 2 10.3 2 12s.4 3.2 1.1 4.5l3.3-2.8Z" />
                          <path fill="#EA4335" d="M12 6.2c1.5 0 2.8.5 3.9 1.5l2.9-2.9C16.9 3.1 14.5 2 12 2 8.2 2 4.8 4.2 3.1 7.5l3.3 2.6c.8-2.4 3-4.2 5.6-4.2Z" />
                        </svg>
                        Google
                      </span>
                      {review.active !== false && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontSize: '11px', fontWeight: 700 }}><CheckCircle2 size={12} /> Active</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button type="button" onClick={() => openEdit(review)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px' }} aria-label="Edit review">
                        <Pencil size={15} />
                      </button>
                      <button type="button" onClick={() => setDeleteTarget(review)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }} aria-label="Delete review">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <Stars value={Number(review.rating || 5)} />
                    {review.petName && <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Pet: {review.petName}</span>}
                    {review.displayOrder !== undefined && <span style={{ color: 'var(--muted)', fontSize: '12px' }}>Order: {review.displayOrder}</span>}
                  </div>
                  <p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.7 }}>{review.review || review.comment}</p>
                  {(review.reviewImages?.length > 0 || review.images?.length > 0) && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap', overflowX: 'auto', alignItems: 'center', marginTop: '12px', paddingBottom: '2px' }}>
                      {(review.reviewImages || review.images || []).slice(0, 5).map((imageUrl, index) => (
                        <img key={`${review.id}-${index}`} src={imageUrl} alt={`Review ${index + 1}`} style={{ width: '56px', height: '56px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
                    <span style={{ color: 'var(--muted)', fontSize: '11px' }}>{review.reviewDate ? new Date(review.reviewDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : review.createdAt?.toDate?.().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <button type="button" onClick={() => toggleActive(review)} className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: '12px' }}>
                      {review.active === false ? 'Enable' : 'Disable'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(7, 10, 18, 0.82)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          {toastMessage && (
            <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1600 }}>
              <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
            </div>
          )}
          <div style={{ width: '100%', maxWidth: '700px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontFamily: '"Playfair Display",serif', fontWeight: 700, fontSize: '20px', color: 'var(--text)', margin: 0 }}>{form.id ? 'Edit Google Review' : 'Add Google Review'}</h2>
                <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>Manually managed Google review content</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setModalOpen(false)} style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Customer Name *</label>
                  <input className="input" value={form.customerName} onChange={e => setForm(prev => ({ ...prev, customerName: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Rating *</label>
                  <select className="input" value={form.rating} onChange={e => setForm(prev => ({ ...prev, rating: Number(e.target.value) }))}>
                    {[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Review Text *</label>
                <textarea className="input" rows={5} value={form.review} onChange={e => setForm(prev => ({ ...prev, review: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Review Date</label>
                  <input type="date" className="input" value={form.reviewDate} onChange={e => setForm(prev => ({ ...prev, reviewDate: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Pet Name (optional)</label>
                  <input className="input" value={form.petName} onChange={e => setForm(prev => ({ ...prev, petName: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Reviewer Profile Image</label>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(event) => handleFiles(event, 'profile')} />
                  <textarea className="input" rows={2} placeholder="Or paste a direct image URL" value={form.profileImageUrl} onChange={e => setForm(prev => ({ ...prev, profileImageUrl: e.target.value }))} style={{ marginTop: '8px', minHeight: '70px' }} />
                  {profileFile && <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop:'6px' }}>{profileFile.name}</p>}
                  {(form.profileImageUrl || form.profileImage) && !profileFile && <img src={form.profileImageUrl || form.profileImage} alt="Profile preview" style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: '50%', marginTop: '8px' }} />}
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Review Photos (max {MAX_REVIEW_IMAGES})</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <button type="button" onClick={addReviewImages} style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid var(--accent-border)', background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} aria-label="Add pasted review image URL">
                      <Plus size={16} />
                    </button>
                    <button type="button" onClick={openReviewFilePicker} style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: '999px', padding: '7px 12px', fontSize: '12px', cursor: 'pointer' }}>
                      Add from device
                    </button>
                    <input ref={reviewPhotoInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" multiple hidden onChange={(event) => handleFiles(event, 'photos')} />
                    <span style={{ color: 'var(--muted)', fontSize: '12px' }}>{reviewImageCount} selected</span>
                  </div>
                  <textarea className="input" rows={2} placeholder="Paste image URL(s), then tap + to add them" value={form.reviewImageUrls} onChange={e => setForm(prev => ({ ...prev, reviewImageUrls: e.target.value }))} style={{ marginTop: '8px', minHeight: '70px' }} />
                </div>
              </div>
              {(form.reviewImages?.length > 0 || reviewFiles.length > 0) && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap', overflowX: 'auto', alignItems: 'center', paddingBottom: '2px' }}>
                  {form.reviewImages?.length > 0 && form.reviewImages.map((imageUrl, index) => (
                    <div key={`existing-${index}`} style={{ position: 'relative', flexShrink: 0 }}>
                      <img src={imageUrl} alt="Existing upload" style={{ width: '54px', height: '54px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                      <button type="button" onClick={() => removeExistingReviewImage(index)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(7,10,18,0.7)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={10} /></button>
                    </div>
                  ))}
                  {reviewFiles.map((file, index) => (
                    <div key={`new-${index}`} style={{ position: 'relative', flexShrink: 0 }}>
                      <img src={URL.createObjectURL(file)} alt="Pending upload" style={{ width: '54px', height: '54px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }} />
                      <button type="button" onClick={() => removeReviewFile(index)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(7,10,18,0.7)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={10} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Status</label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text)', fontSize: '13px', marginTop: '6px' }}>
                    <input type="checkbox" checked={form.active !== false} onChange={e => setForm(prev => ({ ...prev, active: e.target.checked }))} />
                    Active / Inactive
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create Review'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Google review?"
        message="This review will be removed from the website and admin list."
        confirmText="Delete"
        loading={false}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete()}
      />
    </div>
  )
}
