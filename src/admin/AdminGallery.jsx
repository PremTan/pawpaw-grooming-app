// src/admin/AdminGallery.jsx
import { useCallback, useEffect, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, orderBy, query, updateDoc } from 'firebase/firestore'
import Cropper from 'react-easy-crop'
import { Bath, Grid2X2, Heart, Image, PawPrint, Plus, Scissors, Sparkles, Trash2, Upload, X, Pencil, Play } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import { VIDEO_FILE_ACCEPT, validateVideoFile, getVideoMetadata } from '../utils/videoCompression'

const FILTERS = [
  { key: 'all', label: 'All', icon: Grid2X2 },
  { key: 'image', label: 'Images', icon: Image },
  { key: 'video', label: 'Videos', icon: Play },
]
const EMPTY = { type: 'image', url: '', title: '', caption: '', thumbnailUrl: '', duration: '', publicId: '', position: null }
const GALLERY_ASPECT = 3 / 4
const GALLERY_OUTPUT = { width: 900, height: 1200 }

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

const getCategoryMeta = (category) => CATEGORY_META[category] || { label: String(category || 'Gallery').replace(/-/g, ' '), icon: PawPrint }

const getCroppedGalleryImage = async (imageSrc, pixelCrop, fileName) => {
  const image = new window.Image()
  image.src = imageSrc
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = GALLERY_OUTPUT.width
  canvas.height = GALLERY_OUTPUT.height

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    GALLERY_OUTPUT.width,
    GALLERY_OUTPUT.height
  )

  const safeName = fileName.replace(/\.[^.]+$/, '') || 'gallery-image'
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not crop image. Please try another image.'))
        return
      }
      resolve(new File([blob], `${safeName}-gallery.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  })
}

export default function AdminGallery() {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [filterCat, setFilterCat] = useState('all')
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [editingId, setEditingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [cropData, setCropData] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const mapGalleryDoc = (doc) => {
    const data = doc.data()
    const type = data.type || (data.url || data.mediaUrl ? 'image' : 'video')
    return {
      id: doc.id,
      type,
      url: data.mediaUrl || data.url || '',
      thumbnailUrl: data.thumbnailUrl || '',
      title: data.title || data.caption || '',
      caption: data.caption || '',
      category: data.category || 'general',
      duration: data.duration || '',
      position: Number(data.position || 0),
      publicId: data.publicId || '',
      active: data.active !== false,
      createdAt: data.createdAt,
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

  const fetchImages = async () => {
    try {
      const snap = await getDocs(collection(db, 'gallery'))
      setImages(sortGalleryItems(snap.docs.map(mapGalleryDoc)))
    } catch {
      setImages([])
    }
    setLoading(false)
  }

  useEffect(() => { fetchImages() }, [])

  const openAddModal = () => {
    setShowModal(true)
    setEditingId(null)
    setForm(EMPTY)
    setFile(null)
    setPreview('')
    setError('')
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setCropData(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
  }

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0]
    e.target.value = ''
    if (!selectedFile) return
    setError('')

    try {
      if (form.type === 'video') {
        validateVideoFile(selectedFile)
        const metadata = await getVideoMetadata(selectedFile)
        if (metadata.duration > 30) {
          throw new Error('Video must be 30 seconds or shorter.')
        }
        setForm(prev => ({ ...prev, url: '', duration: metadata.duration }))
        setFile(selectedFile)
        if (preview) URL.revokeObjectURL(preview)
        setPreview(URL.createObjectURL(selectedFile))
        return
      }

      validateImageFile(selectedFile)
      const reader = new FileReader()
      reader.addEventListener('load', () => {
        setCrop({ x: 0, y: 0 })
        setZoom(1)
        setCroppedAreaPixels(null)
        setCropData({ src: reader.result, fileName: selectedFile.name })
      })
      reader.readAsDataURL(selectedFile)
    } catch (err) {
      setError(err.message)
    }
  }

  const onCropComplete = useCallback((_, croppedPixels) => setCroppedAreaPixels(croppedPixels), [])

  const confirmCrop = async () => {
    if (!cropData || !croppedAreaPixels) return
    try {
      const croppedFile = await getCroppedGalleryImage(cropData.src, croppedAreaPixels, cropData.fileName)
      setFile(croppedFile)
      if (preview) URL.revokeObjectURL(preview)
      setPreview(URL.createObjectURL(croppedFile))
      setForm(prev => ({ ...prev, url: '' }))
      setCropData(null)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
    } catch (err) {
      setError(err.message || 'Could not crop image.')
      setCropData(null)
    }
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      let mediaUrl = form.url
      let thumbnailUrl = form.thumbnailUrl
      let duration = form.duration

      if (file) {
        if (form.type === 'video') {
          const videoMeta = await getVideoMetadata(file)
          duration = Math.round(videoMeta.duration)

          const uploadResult = await uploadToCloudinary(file, { resourceType: 'video', returnJson: true })
          mediaUrl = uploadResult.secure_url
          form.publicId = uploadResult.public_id || form.publicId
          if (!mediaUrl) {
            throw new Error('Video upload failed. No Cloudinary URL returned.')
          }
        } else {
          const uploadResult = await uploadToCloudinary(file, {
            onOptimizeStart: () => setOptimizing(true),
            onOptimizeEnd: () => setOptimizing(false),
            returnJson: true,
          })
          mediaUrl = uploadResult.secure_url
          form.publicId = uploadResult.public_id || form.publicId
        }
      }

      if (!mediaUrl) {
        setError(form.type === 'video' ? 'Please provide a video.' : 'Please provide an image.')
        setSaving(false)
        return
      }

      const payload = {
        type: form.type,
        mediaUrl,
        url: mediaUrl,
        title: form.title.trim(),
        caption: form.caption.trim(),
        duration: form.type === 'video' ? duration : '',
        thumbnailUrl: form.type === 'video' ? thumbnailUrl : '',
        position: form.position ? Number(form.position) : null,
        publicId: form.publicId || '',
        active: true,
        updatedAt: serverTimestamp(),
      }

      if (editingId) {
        await updateDoc(doc(db, 'gallery', editingId), payload)
        setToastType('success')
        setToastMessage('Gallery media updated successfully.')
      } else {
        await addDoc(collection(db, 'gallery'), { ...payload, createdAt: serverTimestamp() })
        setToastType('success')
        setToastMessage('Gallery media added successfully.')
      }

      closeModal()
      setForm(EMPTY)
      setFile(null)
      setPreview('')
      await fetchImages()
    } catch (e) {
      console.error('Gallery upload error:', e)
      setError(e.message || 'Upload failed. Check Cloudinary settings.')
      setToastType('error')
      setToastMessage(e.message || 'Upload failed. Check Cloudinary settings.')
    }
    setOptimizing(false)
    setSaving(false)
  }

  const handleDelete = async (id) => {
    setDeleting(id)
    const deletingItem = images.find(i => i.id === id)
    try {
      if (deletingItem) {
        console.log('Deleting gallery media:', { id, publicId: deletingItem.publicId, url: deletingItem.url })
      }
      await deleteDoc(doc(db, 'gallery', id))
      setImages(p => p.filter(i => i.id !== id))
      setDeleteTarget(null)
      setToastType('success')
      setToastMessage('Gallery media deleted successfully.')
    } catch (e) {
      console.error('Gallery delete error:', e)
      setToastType('error')
      setToastMessage('Could not delete gallery media. Please try again.')
    }
    setDeleting(null)
  }

  const handleEdit = (img) => {
    setEditingId(img.id)
    setForm({
      type: img.type || (img.url || img.mediaUrl ? 'image' : 'video'),
      url: img.url || img.mediaUrl || '',
      title: img.title || img.caption || '',
      caption: img.caption || '',
      category: img.category || 'general',
      thumbnailUrl: img.thumbnailUrl || '',
      duration: img.duration || '',
      publicId: img.publicId || '',
      position: img.position ?? null,
    })
    setFile(null)
    setPreview(img.thumbnailUrl || img.url || img.mediaUrl || '')
    setError('')
    setShowModal(true)
  }

  const clearImage = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview('')
    setForm(p => ({ ...p, url: '', thumbnailUrl: '', duration: '' }))
  }

  const filtered = filterCat === 'all' ? images : images.filter(i => i.type === filterCat)
  const filterOptions = FILTERS
  const L = { fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }

  return (
    <div className="admin-gallery-page">
      <div className="admin-gallery-header">
        <div>
          <p className="gallery-kicker"><PawPrint size={14} /> Paw Paw Gallery <PawPrint size={14} /></p>
          <h1>Gallery</h1>
          <p>{images.length} items shown to customers.</p>
        </div>
        <button onClick={openAddModal} className="btn btn-primary">
          <Plus size={16} /> Add Media
        </button>
      </div>

      <div className="gallery-filters admin-gallery-filters">
        {filterOptions.map(option => {
          const Icon = option.icon
          return (
            <button key={option.key} onClick={() => setFilterCat(option.key)} className={filterCat === option.key ? 'active' : ''}>
              <Icon size={17} />
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>

      {loading ? <Spinner text="Loading gallery..." /> : filtered.length === 0 ? (
        <div className="admin-gallery-empty">
          <Image size={40} />
          <p>No media yet</p>
          <span>Upload grooming, bath, and happy pet photos and videos.</span>
          <button onClick={openAddModal} className="btn btn-primary"><Upload size={16} /> Upload Media</button>
        </div>
      ) : (
        <div className="gallery-tile-grid admin-gallery-grid">
          {filtered.map(img => (
            <div key={img.id} className="gallery-tile admin-gallery-tile">
              <button type="button" className="admin-gallery-image-button" onClick={() => setLightbox(img)}>
                {img.type === 'video' ? (
                  <div className="admin-gallery-video-preview">
                    {img.thumbnailUrl ? (
                      <img src={img.thumbnailUrl} alt={img.title || img.caption || 'Video thumbnail'} loading="lazy" />
                    ) : (
                      <div className="admin-gallery-video-placeholder" />
                    )}
                    <div className="admin-gallery-video-overlay"><Play size={22} /></div>
                  </div>
                ) : (
                  <img src={img.url} alt={img.caption || 'Gallery image'} loading="lazy" />
                )}
              </button>
              {(img.title || img.caption) && (
                <div className="gallery-tile-caption">
                  <p>{img.title || img.caption}</p>
                  <span>{getCategoryMeta(img.category).label}</span>
                </div>
              )}
              <div className="admin-gallery-actions">
                <button type="button" onClick={() => handleEdit(img)} title="Edit media"><Pencil size={14} /></button>
                <button type="button" onClick={() => setDeleteTarget(img)} disabled={deleting === img.id} title="Delete media"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box admin-gallery-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-gallery-modal-head">
              <div>
                <h2>{editingId ? `Edit ${form.type === 'video' ? 'Video' : 'Image'}` : `Add ${form.type === 'video' ? 'Video' : 'Image'}`}</h2>
                <p>{form.type === 'video' ? 'Upload and compress a short video for the gallery.' : 'Crop every gallery image to the same portrait size.'}</p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close"><X size={20} /></button>
            </div>

            {error && <div className="admin-gallery-error">{error}</div>}

            <div className="admin-gallery-form">
              <div>
                <label style={L}>Media Type</label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button type="button" className={`btn ${form.type === 'image' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setForm(p => ({ ...p, type: 'image', url: '', thumbnailUrl: '', duration: '' }))}>Image</button>
                  <button type="button" className={`btn ${form.type === 'video' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setForm(p => ({ ...p, type: 'video', url: '', thumbnailUrl: '', duration: '' }))}>Video</button>
                </div>
              </div>

              <div>
                <label style={L}>{form.type === 'video' ? 'Video File' : 'Image File'}</label>
                {preview || form.url ? (
                  <div className="admin-gallery-preview" style={{ position: 'relative' }}>
                    {form.type === 'video' ? (
                      <video controls src={preview || form.url} style={{ width: '100%', borderRadius: '10px' }} />
                    ) : (
                      <img src={preview || form.url} alt="" />
                    )}
                    <button type="button" onClick={clearImage} aria-label="Remove media"><X size={14} /></button>
                  </div>
                ) : (
                  <label className="admin-gallery-upload-drop">
                    <PawPrint size={28} />
                    <span>{form.type === 'video' ? 'Click to choose a video' : 'Click to choose and crop image'}</span>
                    <small>{form.type === 'video' ? 'MP4, MOV, WEBM up to 30s and 20MB' : 'JPG, PNG, WEBP up to 10MB'}</small>
                    <input type="file" accept={form.type === 'video' ? VIDEO_FILE_ACCEPT : IMAGE_FILE_ACCEPT} onChange={handleFileChange} />
                  </label>
                )}
                {(preview || form.url) && (
                  <label className="btn btn-secondary admin-gallery-replace">
                    <Upload size={15} /> Replace {form.type === 'video' ? 'Video' : 'Image'}
                    <input type="file" accept={form.type === 'video' ? VIDEO_FILE_ACCEPT : IMAGE_FILE_ACCEPT} onChange={handleFileChange} />
                  </label>
                )}
              </div>

              <div>
                <label style={L}>Title</label>
                <input className="input" placeholder="Title for gallery media" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              </div>

              <div>
                <label style={L}>Caption (optional)</label>
                <input className="input" placeholder="e.g. Bruno after full grooming" value={form.caption} onChange={e => setForm(p => ({ ...p, caption: e.target.value }))} />
              </div>

              <div>
                <label style={L}>Position (optional, 1-5)</label>
                <select className="input" value={form.position ?? ''} onChange={e => setForm(p => ({ ...p, position: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">None</option>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <small style={{ color: 'var(--muted)', display: 'block', marginTop: '6px' }}>Only use positions 1–5 for featured home gallery placement.</small>
              </div>

              <div className="admin-gallery-modal-actions">
                <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
                <button type="button" onClick={handleSave} disabled={saving || (!file && !form.url)} className="btn btn-primary">
                  {optimizing ? (form.type === 'video' ? 'Preparing video...' : 'Optimizing image...') : saving ? (form.type === 'video' ? 'Uploading video...' : 'Uploading...') : `Save ${form.type === 'video' ? 'Video' : 'Image'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cropData && (
        <div className="modal-overlay admin-gallery-crop-overlay" onClick={() => setCropData(null)}>
          <div className="modal-box admin-gallery-crop-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-gallery-modal-head">
              <div>
                <h2>Crop Gallery Image</h2>
                <p>Portrait crop: 900 x 1200 for consistent tiles.</p>
              </div>
              <button type="button" onClick={() => setCropData(null)} aria-label="Close crop"><X size={20} /></button>
            </div>
            <div className="admin-gallery-crop-stage">
              <Cropper image={cropData.src} crop={crop} zoom={zoom} aspect={GALLERY_ASPECT} showGrid={false} onCropChange={setCrop} onCropComplete={onCropComplete} onZoomChange={setZoom} />
            </div>
            <div className="admin-gallery-zoom-row">
              <span>Zoom</span>
              <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))} />
            </div>
            <div className="admin-gallery-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setCropData(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={confirmCrop}>Use Crop</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete image?"
        message="Are you sure you want to delete this gallery image?"
        confirmText="Delete"
        loading={!!deleteTarget && deleting === deleteTarget.id}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
      />

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.95)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth:'900px', width:'100%' }}>
            {lightbox.type === 'video' ? (
              <video controls autoPlay poster={lightbox.thumbnailUrl || undefined} style={{ width:'100%', borderRadius:'16px', maxHeight:'80vh', objectFit:'contain', background: '#000' }}>
                <source src={lightbox.url} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            ) : (
              <img src={lightbox.url} alt={lightbox.caption || ''} style={{ width:'100%', borderRadius:'16px', maxHeight:'80vh', objectFit:'contain' }} />
            )}
            {lightbox.caption && <p style={{ color:'#fff', textAlign:'center', marginTop:'14px', fontSize:'15px' }}>{lightbox.caption}</p>}
            <button className="gallery-lightbox-close" onClick={() => setLightbox(null)}>Close</button>
          </div>
        </div>
      )}

      {toastMessage && <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />}
    </div>
  )
}
