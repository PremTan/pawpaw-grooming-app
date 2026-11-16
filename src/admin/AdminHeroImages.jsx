import { useCallback, useEffect, useState } from 'react'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import Cropper from 'react-easy-crop'
import { Crop, ImagePlus, Save, Trash2, Upload, X, ZoomIn } from 'lucide-react'
import { db } from '../firebase'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'

const EMPTY_IMAGES = Array.from({ length: 5 }, () => ({ url: '', alt: '' }))
const EMPTY_GROOMING_IMAGE = { url: '', alt: 'Pet Grooming - Home Visit & Salon' }
const DEFAULT_GROOMING_ASPECT = 16 / 9.6

// Helper to generate a sharp cropped image file from canvas
const getCroppedImg = async (imageSrc, pixelCrop, fileName = 'grooming-banner.jpg') => {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  if (imageSrc.startsWith('http')) {
    image.src = imageSrc.includes('?') ? `${imageSrc}&_cors=${Date.now()}` : `${imageSrc}?_cors=${Date.now()}`
  } else {
    image.src = imageSrc
  }

  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = (e) => reject(new Error('Failed to load image for cropping: ' + (e?.message || 'cross-origin error')))
  })

  const maxDim = 1600
  let targetWidth = Math.round(pixelCrop.width)
  let targetHeight = Math.round(pixelCrop.height)
  if (targetWidth > maxDim || targetHeight > maxDim) {
    if (targetWidth >= targetHeight) {
      targetHeight = Math.round((targetHeight * maxDim) / targetWidth)
      targetWidth = maxDim
    } else {
      targetWidth = Math.round((targetWidth * maxDim) / targetHeight)
      targetHeight = maxDim
    }
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = targetWidth
  canvas.height = targetHeight
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetWidth,
    targetHeight
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas export failed'))
        return
      }
      const baseName = (fileName || 'grooming-banner').replace(/\.[^/.]+$/, '')
      resolve(new File([blob], `${baseName}-cropped.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.90)
  })
}

export default function AdminHeroImages() {
  const [images, setImages] = useState(EMPTY_IMAGES)
  const [groomingChoiceImage, setGroomingChoiceImage] = useState(EMPTY_GROOMING_IMAGE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [optimizing, setOptimizing] = useState(null)
  const [hasSavedImages, setHasSavedImages] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Cropper state
  const [cropData, setCropData] = useState(null) // { src, fileName, slot, type }
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [cropperAspect, setCropperAspect] = useState(DEFAULT_GROOMING_ASPECT)

  const onCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleFileSelect = (slot, file, type = 'grooming') => {
    if (!file) return
    try {
      validateImageFile(file)
    } catch (err) {
      setError(err.message)
      return
    }
    setError('')
    setMessage('')

    const reader = new FileReader()
    reader.onload = () => {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
      setCropperAspect(type === 'grooming' ? DEFAULT_GROOMING_ASPECT : 16 / 9)
      setCropData({
        src: reader.result,
        fileName: file.name,
        slot,
        type,
      })
    }
    reader.readAsDataURL(file)
  }

  const handleOpenExistingCropper = (imageUrl, slot = 'grooming', type = 'grooming') => {
    if (!imageUrl) return
    setError('')
    setMessage('')
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setCropperAspect(type === 'grooming' ? DEFAULT_GROOMING_ASPECT : 16 / 9)
    setCropData({
      src: imageUrl,
      fileName: type === 'grooming' ? 'grooming-choice-banner.jpg' : `hero-banner-${slot + 1}.jpg`,
      slot,
      type,
    })
  }

  const handleCropConfirm = async () => {
    if (!cropData || !croppedAreaPixels) return

    const { slot, type, fileName, src } = cropData
    setUploading(slot)
    setError('')
    setMessage('')

    try {
      const croppedFile = await getCroppedImg(src, croppedAreaPixels, fileName)

      const url = await uploadToCloudinary(croppedFile, {
        onOptimizeStart: () => setOptimizing(slot),
        onOptimizeEnd: () => setOptimizing(null),
      })

      if (type === 'grooming') {
        setGroomingChoiceImage(prev => ({
          ...prev,
          url,
          alt: prev.alt || EMPTY_GROOMING_IMAGE.alt,
        }))
        setMessage('Cropped grooming banner uploaded! Remember to click "Save Images" to apply changes.')
      } else {
        updateImage(slot, 'url', url)
        if (!images[slot]?.alt) updateImage(slot, 'alt', `Hero image ${slot + 1}`)
        setMessage('Cropped hero banner uploaded! Remember to click "Save Images" to apply changes.')
      }

      setCropData(null)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
    } catch (err) {
      setError(err.message || 'Crop upload failed. Please try again.')
    } finally {
      setOptimizing(null)
      setUploading(null)
    }
  }

  useEffect(() => {
    async function fetchImages() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'heroImages'))
        const data = snap.exists() ? snap.data() : {}
        const saved = Array.isArray(data.images) ? data.images : []
        const savedGrooming = data.groomingChoiceImage || (Array.isArray(data.visitImages) && data.visitImages[0]?.url ? data.visitImages[0] : null)
        setHasSavedImages(saved.some(image => image?.url) || Boolean(savedGrooming?.url))
        setImages(EMPTY_IMAGES.map((slot, index) => ({
          url: saved[index]?.url || slot.url,
          alt: saved[index]?.alt || slot.alt,
        })))
        setGroomingChoiceImage(savedGrooming?.url ? {
          url: savedGrooming.url || '',
          alt: savedGrooming.alt || EMPTY_GROOMING_IMAGE.alt,
        } : EMPTY_GROOMING_IMAGE)
      } catch {
        setError('Could not load home images.')
      }
      setLoading(false)
    }
    fetchImages()
  }, [])

  const updateImage = (index, key, value) => {
    setImages(prev => prev.map((image, i) => i === index ? { ...image, [key]: value } : image))
  }

  const clearImage = (index) => {
    updateImage(index, 'url', '')
    updateImage(index, 'alt', '')
  }

  const clearGroomingImage = () => {
    setGroomingChoiceImage(EMPTY_GROOMING_IMAGE)
  }

  const uploadFile = async (slot, file, type = 'hero') => {
    if (!file) return
    try {
      validateImageFile(file)
    } catch (err) {
      setError(err.message)
      return
    }
    setError('')
    setMessage('')
    setUploading(slot)
    try {
      const url = await uploadToCloudinary(file, {
        onOptimizeStart: () => setOptimizing(slot),
        onOptimizeEnd: () => setOptimizing(null),
      })
      if (type === 'grooming') {
        setGroomingChoiceImage(prev => ({
          ...prev,
          url,
          alt: prev.alt || EMPTY_GROOMING_IMAGE.alt,
        }))
      } else {
        updateImage(slot, 'url', url)
        if (!images[slot].alt) updateImage(slot, 'alt', `Hero image ${slot + 1}`)
      }
    } catch (err) {
      setError(err.message || 'Upload failed. Check Cloudinary settings.')
    }
    setOptimizing(null)
    setUploading(null)
  }

  const saveImages = async () => {
    setError('')
    setMessage('')
    const cleanImages = images
      .map(image => ({ url: image.url.trim(), alt: image.alt.trim() }))
      .filter(image => image.url)
    const cleanGrooming = groomingChoiceImage.url
      ? { url: groomingChoiceImage.url.trim(), alt: (groomingChoiceImage.alt || EMPTY_GROOMING_IMAGE.alt).trim() }
      : { url: '', alt: '' }

    if (!cleanImages.length) {
      setError('Please add at least 1 hero image before saving.')
      return
    }

    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'heroImages'), {
        images: cleanImages,
        groomingChoiceImage: cleanGrooming,
        visitImages: cleanGrooming.url ? [cleanGrooming] : [],
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setHasSavedImages(true)
      setMessage('Home images updated.')
    } catch (err) {
      setError(err.message || 'Could not save home images.')
    }
    setSaving(false)
  }

  const deleteCustomImages = async () => {
    setError('')
    setMessage('')
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'settings', 'heroImages'))
      setImages(EMPTY_IMAGES)
      setGroomingChoiceImage(EMPTY_GROOMING_IMAGE)
      setHasSavedImages(false)
      setConfirmDelete(false)
      setMessage('Custom home images deleted.')
    } catch (err) {
      setError(err.message || 'Could not delete custom home images.')
    }
    setDeleting(false)
  }

  const L = { fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }

  if (loading) return <div style={{ padding:'28px' }}><Spinner text="Loading home images..." /></div>

  return (
    <div style={{ padding:'28px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontFamily:'"Playfair Display",serif', fontSize:'28px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Home Images</h1>
          <p style={{ color:'var(--muted)', fontSize:'13px' }}>Manage up to 5 hero banners and the 2 visit option images shown on the home page.</p>
        </div>
        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
          {hasSavedImages && (
            <button onClick={() => setConfirmDelete(true)} disabled={deleting || saving || uploading !== null} className="btn btn-danger" style={{ fontSize:'13px', padding:'10px 18px' }}>
              <Trash2 size={16}/> {deleting ? 'Deleting...' : 'Delete Custom Images'}
            </button>
          )}
          <button onClick={saveImages} disabled={saving || deleting || uploading !== null} className="btn btn-primary" style={{ fontSize:'13px', padding:'10px 18px' }}>
            <Save size={16}/> {saving ? 'Saving...' : 'Save Images'}
          </button>
        </div>
      </div>

      {(message || error) && (
        <div style={{ background:error ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)', border:`1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.25)'}`, color:error ? '#ef4444' : '#34d399', fontSize:'13px', padding:'12px 14px', borderRadius:'12px', marginBottom:'18px' }}>
          {error || message}
        </div>
      )}

      <div style={{ marginBottom:'14px' }}>
        <h2 style={{ fontFamily:'"Playfair Display",serif', fontSize:'22px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Hero Banners</h2>
        <p style={{ color:'var(--muted)', fontSize:'13px' }}>Use wide banner images. The home page crops them responsively for mobile.</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'16px' }}>
        {images.map((image, index) => (
          <div key={index} className="card" style={{ padding:'16px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', color:'var(--text)', fontWeight:800, fontSize:'14px' }}>
                <ImagePlus size={16} style={{ color:'var(--accent)' }}/> Banner {index + 1}
              </div>
              {image.url && (
                <button onClick={() => clearImage(index)} title="Clear image" style={{ width:'28px', height:'28px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--muted)', cursor:'pointer' }}>
                  <X size={14}/>
                </button>
              )}
            </div>

            <div style={{ aspectRatio:'16 / 9', borderRadius:'8px', overflow:'hidden', border:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'12px' }}>
              {image.url ? (
                <img src={image.url} alt={image.alt || ''} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              ) : (
                <div style={{ textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>
                  <ImagePlus size={28} style={{ margin:'0 auto 8px' }}/>
                  No image selected
                </div>
              )}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              <div>
                <label style={L}>Alt Text</label>
                <input className="input" value={image.alt} onChange={e => updateImage(index, 'alt', e.target.value)} placeholder="Describe this image" />
              </div>
              <label className="btn btn-secondary" style={{ justifyContent:'center', fontSize:'13px', padding:'10px 14px', opacity:uploading === index ? 0.7 : 1 }}>
                <Upload size={15}/> {optimizing === index ? 'Optimizing image...' : uploading === index ? 'Uploading...' : 'Upload File'}
                <input type="file" accept={IMAGE_FILE_ACCEPT} style={{ display:'none' }} disabled={uploading !== null || saving} onChange={e => uploadFile(index, e.target.files?.[0])} />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop:'28px', marginBottom:'14px' }}>
        <h2 style={{ fontFamily:'"Playfair Display",serif', fontSize:'22px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Grooming Location Banner</h2>
        <p style={{ color:'var(--muted)', fontSize:'13px' }}>Upload the single banner image shown for the Home Visit vs Visit Our Centre grooming section.</p>
      </div>

      <div style={{ maxWidth:'520px' }}>
        <div className="card" style={{ padding:'16px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', color:'var(--text)', fontWeight:800, fontSize:'14px' }}>
              <ImagePlus size={16} style={{ color:'var(--accent)' }}/> Grooming Choice Banner
            </div>
            {groomingChoiceImage.url && (
              <button onClick={clearGroomingImage} title="Clear image" style={{ width:'28px', height:'28px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--muted)', cursor:'pointer' }}>
                <X size={14}/>
              </button>
            )}
          </div>

          <div style={{ aspectRatio:'16 / 9.6', borderRadius:'10px', overflow:'hidden', border:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'12px' }}>
            {groomingChoiceImage.url ? (
              <img src={groomingChoiceImage.url} alt={groomingChoiceImage.alt || ''} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            ) : (
              <div style={{ textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>
                <ImagePlus size={32} style={{ margin:'0 auto 8px' }}/>
                Default illustration active
              </div>
            )}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            <div>
              <label style={L}>Alt Text</label>
              <input className="input" value={groomingChoiceImage.alt} onChange={e => setGroomingChoiceImage(prev => ({ ...prev, alt: e.target.value }))} placeholder="Describe this banner image" />
            </div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
              <label className="btn btn-secondary" style={{ flex:1, minWidth:'140px', justifyContent:'center', fontSize:'13px', padding:'10px 14px', opacity:uploading === 'grooming' ? 0.7 : 1, cursor: uploading !== null || saving ? 'not-allowed' : 'pointer' }}>
                <Upload size={15}/> {optimizing === 'grooming' ? 'Optimizing image...' : uploading === 'grooming' ? 'Uploading...' : 'Upload & Crop'}
                <input
                  type="file"
                  accept={IMAGE_FILE_ACCEPT}
                  style={{ display:'none' }}
                  disabled={uploading !== null || saving}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect('grooming', file, 'grooming')
                    e.target.value = ''
                  }}
                />
              </label>

              {groomingChoiceImage.url && (
                <button
                  type="button"
                  onClick={() => handleOpenExistingCropper(groomingChoiceImage.url, 'grooming', 'grooming')}
                  disabled={uploading !== null || saving}
                  className="btn btn-secondary"
                  style={{ fontSize:'13px', padding:'10px 14px', display:'inline-flex', alignItems:'center', gap:'6px' }}
                  title="Crop or re-frame current banner"
                >
                  <Crop size={15}/> Re-crop
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- CROP MODAL OVERLAY --- */}
      {cropData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => !uploading && setCropData(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '640px',
              background: '#FCFAF6',
              borderRadius: '16px',
              border: '1px solid #EADBBE',
              boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '92vh',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #EADBBE',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#FAF5EC',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontFamily: '"Playfair Display",serif', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                  Crop Grooming Location Banner
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                  Position & zoom image to fit the Home Visit & Salon section
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCropData(null)}
                disabled={uploading !== null}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '50%',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Aspect Ratio Selector */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: '#fff',
                borderBottom: '1px solid #F0E6D2',
                overflowX: 'auto',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)' }}>
                Aspect:
              </span>
              {[
                { label: '16:9.6 (Default)', val: DEFAULT_GROOMING_ASPECT },
                { label: '16:9 (Wide)', val: 16 / 9 },
                { label: '16:10', val: 16 / 10 },
                { label: '4:3', val: 4 / 3 },
                { label: 'Free', val: undefined },
              ].map(opt => {
                const active = cropperAspect === opt.val || (cropperAspect === undefined && opt.val === undefined)
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setCropperAspect(opt.val)}
                    style={{
                      border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                      background: active ? 'var(--accent)' : 'var(--surface)',
                      color: active ? '#fff' : 'var(--text)',
                      borderRadius: '20px',
                      padding: '4px 12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {/* Cropper Canvas Stage */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '380px',
                background: '#1A1412',
              }}
            >
              <Cropper
                image={cropData.src}
                crop={crop}
                zoom={zoom}
                aspect={cropperAspect}
                showGrid={true}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            {/* Zoom Slider */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 20px',
                background: '#fff',
                borderTop: '1px solid #F0E6D2',
              }}
            >
              <ZoomIn size={16} style={{ color: 'var(--muted)' }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', minWidth: '40px' }}>Zoom</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                onChange={e => setZoom(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', minWidth: '34px', textAlign: 'right' }}>
                {zoom.toFixed(1)}x
              </span>
            </div>

            {/* Modal Actions */}
            <div
              style={{
                padding: '14px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#FAF5EC',
                borderTop: '1px solid #EADBBE',
              }}
            >
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)' }}>
                Drag image to position. Scroll or slider to zoom.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCropData(null)}
                  disabled={uploading !== null}
                  style={{ fontSize: '13px', padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCropConfirm}
                  disabled={uploading !== null}
                  style={{ fontSize: '13px', padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Crop size={15} />
                  {uploading === 'grooming' ? (optimizing === 'grooming' ? 'Optimizing...' : 'Uploading...') : 'Confirm & Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDelete}
        title="Delete custom home images?"
        message="Are you sure you want to delete the saved hero and visit option images?"
        confirmText="Delete"
        loading={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteCustomImages}
      />
    </div>
  )
}
