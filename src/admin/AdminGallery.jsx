// src/admin/AdminGallery.jsx
import { useCallback, useEffect, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, orderBy, query, updateDoc } from 'firebase/firestore'
import Cropper from 'react-easy-crop'
import { Bath, Grid2X2, Heart, Image, PawPrint, Plus, Scissors, Sparkles, Trash2, Upload, X, Pencil } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'

const CATEGORIES = ['grooming', 'bath', 'happy-pets', 'before-after', 'haircut', 'styling', 'nail', 'general']
const EMPTY = { url: '', caption: '', category: 'grooming' }
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
  const [editingId, setEditingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [cropData, setCropData] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const fetchImages = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'gallery'), orderBy('createdAt', 'desc')))
      setImages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {
      try {
        const snap = await getDocs(collection(db, 'gallery'))
        setImages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch {}
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

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0]
    e.target.value = ''
    if (!selectedFile) return
    try {
      validateImageFile(selectedFile)
    } catch (err) {
      setError(err.message)
      return
    }
    setError('')
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
      setCropData({ src: reader.result, fileName: selectedFile.name })
    })
    reader.readAsDataURL(selectedFile)
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
      let url = form.url
      if (file) {
        url = await uploadToCloudinary(file, {
          onOptimizeStart: () => setOptimizing(true),
          onOptimizeEnd: () => setOptimizing(false),
        })
      }
      if (!url) {
        setError('Please provide an image.')
        setSaving(false)
        return
      }
      const payload = { url, caption: form.caption.trim(), category: form.category, updatedAt: serverTimestamp() }
      if (editingId) {
        await updateDoc(doc(db, 'gallery', editingId), payload)
      } else {
        await addDoc(collection(db, 'gallery'), { ...payload, createdAt: serverTimestamp() })
      }
      closeModal()
      setForm(EMPTY)
      setFile(null)
      setPreview('')
      await fetchImages()
    } catch (e) {
      console.error('Gallery upload error:', e)
      setError(e.message || 'Upload failed. Check Cloudinary settings.')
    }
    setOptimizing(false)
    setSaving(false)
  }

  const handleDelete = async (id) => {
    setDeleting(id)
    try {
      await deleteDoc(doc(db, 'gallery', id))
      setImages(p => p.filter(i => i.id !== id))
      setDeleteTarget(null)
    } catch {}
    setDeleting(null)
  }

  const handleEdit = (img) => {
    setEditingId(img.id)
    setForm({ url: img.url || '', caption: img.caption || '', category: img.category || 'general' })
    setFile(null)
    setPreview('')
    setError('')
    setShowModal(true)
  }

  const clearImage = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview('')
    setForm(p => ({ ...p, url: '' }))
  }

  const filtered = filterCat === 'all' ? images : images.filter(i => i.category === filterCat)
  const filterOptions = ['all', ...new Set([...CATEGORIES, ...images.map(i => i.category).filter(Boolean)])]
  const L = { fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }

  return (
    <div className="admin-gallery-page">
      <div className="admin-gallery-header">
        <div>
          <p className="gallery-kicker"><PawPrint size={14} /> Paw Paw Gallery <PawPrint size={14} /></p>
          <h1>Gallery</h1>
          <p>{images.length} images shown to customers. New uploads are cropped to 900 x 1200.</p>
        </div>
        <button onClick={openAddModal} className="btn btn-primary">
          <Plus size={16} /> Add Image
        </button>
      </div>

      <div className="gallery-filters admin-gallery-filters">
        {filterOptions.map(cat => {
          const meta = getCategoryMeta(cat)
          const Icon = meta.icon
          return (
            <button key={cat} onClick={() => setFilterCat(cat)} className={filterCat === cat ? 'active' : ''}>
              <Icon size={17} />
              <span>{meta.label}</span>
            </button>
          )
        })}
      </div>

      {loading ? <Spinner text="Loading gallery..." /> : filtered.length === 0 ? (
        <div className="admin-gallery-empty">
          <Image size={40} />
          <p>No images yet</p>
          <span>Upload grooming, bath, and happy pet photos.</span>
          <button onClick={openAddModal} className="btn btn-primary"><Upload size={16} /> Upload Image</button>
        </div>
      ) : (
        <div className="gallery-tile-grid admin-gallery-grid">
          {filtered.map(img => (
            <div key={img.id} className="gallery-tile admin-gallery-tile">
              <button type="button" className="admin-gallery-image-button" onClick={() => setLightbox(img)}>
                <img src={img.url} alt={img.caption || 'Gallery image'} loading="lazy" />
              </button>
              {img.caption && (
                <div className="gallery-tile-caption">
                  <p>{img.caption}</p>
                  <span>{getCategoryMeta(img.category).label}</span>
                </div>
              )}
              <div className="admin-gallery-actions">
                <button type="button" onClick={() => handleEdit(img)} title="Edit image"><Pencil size={14} /></button>
                <button type="button" onClick={() => setDeleteTarget(img)} disabled={deleting === img.id} title="Delete image"><Trash2 size={14} /></button>
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
                <h2>{editingId ? 'Edit Image' : 'Add Image'}</h2>
                <p>Crop every gallery image to the same portrait size.</p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close"><X size={20} /></button>
            </div>

            {error && <div className="admin-gallery-error">{error}</div>}

            <div className="admin-gallery-form">
              <div>
                <label style={L}>Image File</label>
                {preview || form.url ? (
                  <div className="admin-gallery-preview">
                    <img src={preview || form.url} alt="" />
                    <button type="button" onClick={clearImage} aria-label="Remove image"><X size={14} /></button>
                  </div>
                ) : (
                  <label className="admin-gallery-upload-drop">
                    <PawPrint size={28} />
                    <span>Click to choose and crop image</span>
                    <small>JPG, PNG, WEBP up to 10MB</small>
                    <input type="file" accept={IMAGE_FILE_ACCEPT} onChange={handleFileChange} />
                  </label>
                )}
                {(preview || form.url) && (
                  <label className="btn btn-secondary admin-gallery-replace">
                    <Upload size={15} /> Replace and Crop
                    <input type="file" accept={IMAGE_FILE_ACCEPT} onChange={handleFileChange} />
                  </label>
                )}
              </div>

              <div>
                <label style={L}>Caption (optional)</label>
                <input className="input" placeholder="e.g. Bruno after full grooming" value={form.caption} onChange={e => setForm(p => ({ ...p, caption: e.target.value }))} />
              </div>

              <div>
                <label style={L}>Category</label>
                <select className="input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{getCategoryMeta(c).label}</option>)}
                </select>
              </div>

              <div className="admin-gallery-modal-actions">
                <button type="button" onClick={closeModal} className="btn btn-secondary">Cancel</button>
                <button type="button" onClick={handleSave} disabled={saving || (!file && !form.url)} className="btn btn-primary">
                  {optimizing ? 'Optimizing image...' : saving ? 'Uploading...' : 'Save Image'}
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
            <img src={lightbox.url} alt={lightbox.caption || ''} style={{ width:'100%', borderRadius:'16px', maxHeight:'80vh', objectFit:'contain' }} />
            {lightbox.caption && <p style={{ color:'#fff', textAlign:'center', marginTop:'14px', fontSize:'15px' }}>{lightbox.caption}</p>}
            <button className="gallery-lightbox-close" onClick={() => setLightbox(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
