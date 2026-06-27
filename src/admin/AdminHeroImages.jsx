// import { useEffect, useState } from 'react'
// import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
// import { ImagePlus, Save, Trash2, Upload, X } from 'lucide-react'
// import { db } from '../firebase'
// import { uploadToCloudinary } from '../utils/cloudinary'
// import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
// import Spinner from '../components/Spinner'
// import ConfirmModal from '../components/ConfirmModal'

// const EMPTY_IMAGES = Array.from({ length: 5 }, () => ({ url: '', alt: '' }))
// const EMPTY_VISIT_IMAGES = [
//   { url: '', alt: 'Home visit grooming' },
//   { url: '', alt: 'Visit our grooming centre' },
// ]

// export default function AdminHeroImages() {
//   const [images, setImages] = useState(EMPTY_IMAGES)
//   const [visitImages, setVisitImages] = useState(EMPTY_VISIT_IMAGES)
//   const [loading, setLoading] = useState(true)
//   const [saving, setSaving] = useState(false)
//   const [deleting, setDeleting] = useState(false)
//   const [uploading, setUploading] = useState(null)
//   const [optimizing, setOptimizing] = useState(null)
//   const [hasSavedImages, setHasSavedImages] = useState(false)
//   const [message, setMessage] = useState('')
//   const [error, setError] = useState('')
//   const [confirmDelete, setConfirmDelete] = useState(false)

//   useEffect(() => {
//     async function fetchImages() {
//       try {
//         const snap = await getDoc(doc(db, 'settings', 'heroImages'))
//         const data = snap.exists() ? snap.data() : {}
//         const saved = Array.isArray(data.images) ? data.images : []
//         const savedVisit = Array.isArray(data.visitImages) ? data.visitImages : []
//         setHasSavedImages(saved.some(image => image?.url) || savedVisit.some(image => image?.url))
//         setImages(EMPTY_IMAGES.map((slot, index) => ({
//           url: saved[index]?.url || slot.url,
//           alt: saved[index]?.alt || slot.alt,
//         })))
//         setVisitImages(EMPTY_VISIT_IMAGES.map((slot, index) => ({
//           url: savedVisit[index]?.url || slot.url,
//           alt: savedVisit[index]?.alt || slot.alt,
//         })))
//       } catch {
//         setError('Could not load home images.')
//       }
//       setLoading(false)
//     }
//     fetchImages()
//   }, [])

//   const updateImage = (index, key, value) => {
//     setImages(prev => prev.map((image, i) => i === index ? { ...image, [key]: value } : image))
//   }

//   const updateVisitImage = (index, key, value) => {
//     setVisitImages(prev => prev.map((image, i) => i === index ? { ...image, [key]: value } : image))
//   }

//   const clearImage = (index) => {
//     updateImage(index, 'url', '')
//     updateImage(index, 'alt', '')
//   }

//   const clearVisitImage = (index) => {
//     updateVisitImage(index, 'url', '')
//     updateVisitImage(index, 'alt', EMPTY_VISIT_IMAGES[index].alt)
//   }

//   const uploadFile = async (slot, file, type = 'hero') => {
//     if (!file) return
//     try {
//       validateImageFile(file)
//     } catch (err) {
//       setError(err.message)
//       return
//     }
//     setError('')
//     setMessage('')
//     setUploading(slot)
//     try {
//       const url = await uploadToCloudinary(file, {
//         onOptimizeStart: () => setOptimizing(slot),
//         onOptimizeEnd: () => setOptimizing(null),
//       })
//       if (type === 'visit') {
//         const index = Number(String(slot).replace('visit-', ''))
//         updateVisitImage(index, 'url', url)
//         if (!visitImages[index].alt) updateVisitImage(index, 'alt', EMPTY_VISIT_IMAGES[index].alt)
//       } else {
//         updateImage(slot, 'url', url)
//         if (!images[slot].alt) updateImage(slot, 'alt', `Hero image ${slot + 1}`)
//       }
//     } catch (err) {
//       setError(err.message || 'Upload failed. Check Cloudinary settings.')
//     }
//     setOptimizing(null)
//     setUploading(null)
//   }

//   const saveImages = async () => {
//     setError('')
//     setMessage('')
//     const cleanImages = images
//       .map(image => ({ url: image.url.trim(), alt: image.alt.trim() }))
//       .filter(image => image.url)
//     const cleanVisitImages = visitImages
//       .map(image => ({ url: image.url.trim(), alt: image.alt.trim() }))
//       .filter(image => image.url)

//     if (!cleanImages.length) {
//       setError('Please add at least 1 hero image before saving.')
//       return
//     }

//     setSaving(true)
//     try {
//       await setDoc(doc(db, 'settings', 'heroImages'), {
//         images: cleanImages,
//         visitImages: cleanVisitImages,
//         updatedAt: serverTimestamp(),
//       }, { merge: true })
//       setHasSavedImages(true)
//       setMessage('Home images updated.')
//     } catch (err) {
//       setError(err.message || 'Could not save home images.')
//     }
//     setSaving(false)
//   }

//   const deleteCustomImages = async () => {
//     setError('')
//     setMessage('')
//     setDeleting(true)
//     try {
//       await deleteDoc(doc(db, 'settings', 'heroImages'))
//       setImages(EMPTY_IMAGES)
//       setVisitImages(EMPTY_VISIT_IMAGES)
//       setHasSavedImages(false)
//       setConfirmDelete(false)
//       setMessage('Custom home images deleted.')
//     } catch (err) {
//       setError(err.message || 'Could not delete custom home images.')
//     }
//     setDeleting(false)
//   }

//   const L = { fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }

//   if (loading) return <div style={{ padding:'28px' }}><Spinner text="Loading home images..." /></div>

//   return (
//     <div style={{ padding:'28px' }}>
//       <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap', marginBottom:'24px' }}>
//         <div>
//           <h1 style={{ fontFamily:'"Playfair Display",serif', fontSize:'28px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Home Images</h1>
//           <p style={{ color:'var(--muted)', fontSize:'13px' }}>Manage up to 5 hero banners and the 2 visit option images shown on the home page.</p>
//         </div>
//         <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
//           {hasSavedImages && (
//             <button onClick={() => setConfirmDelete(true)} disabled={deleting || saving || uploading !== null} className="btn btn-danger" style={{ fontSize:'13px', padding:'10px 18px' }}>
//               <Trash2 size={16}/> {deleting ? 'Deleting...' : 'Delete Custom Images'}
//             </button>
//           )}
//           <button onClick={saveImages} disabled={saving || deleting || uploading !== null} className="btn btn-primary" style={{ fontSize:'13px', padding:'10px 18px' }}>
//             <Save size={16}/> {saving ? 'Saving...' : 'Save Images'}
//           </button>
//         </div>
//       </div>

//       {(message || error) && (
//         <div style={{ background:error ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)', border:`1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.25)'}`, color:error ? '#ef4444' : '#34d399', fontSize:'13px', padding:'12px 14px', borderRadius:'12px', marginBottom:'18px' }}>
//           {error || message}
//         </div>
//       )}

//       <div style={{ marginBottom:'14px' }}>
//         <h2 style={{ fontFamily:'"Playfair Display",serif', fontSize:'22px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Hero Banners</h2>
//         <p style={{ color:'var(--muted)', fontSize:'13px' }}>Use wide banner images. The home page crops them responsively for mobile.</p>
//       </div>

//       <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'16px' }}>
//         {images.map((image, index) => (
//           <div key={index} className="card" style={{ padding:'16px' }}>
//             <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
//               <div style={{ display:'flex', alignItems:'center', gap:'8px', color:'var(--text)', fontWeight:800, fontSize:'14px' }}>
//                 <ImagePlus size={16} style={{ color:'var(--accent)' }}/> Banner {index + 1}
//               </div>
//               {image.url && (
//                 <button onClick={() => clearImage(index)} title="Clear image" style={{ width:'28px', height:'28px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--muted)', cursor:'pointer' }}>
//                   <X size={14}/>
//                 </button>
//               )}
//             </div>

//             <div style={{ aspectRatio:'16 / 9', borderRadius:'8px', overflow:'hidden', border:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'12px' }}>
//               {image.url ? (
//                 <img src={image.url} alt={image.alt || ''} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
//               ) : (
//                 <div style={{ textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>
//                   <ImagePlus size={28} style={{ margin:'0 auto 8px' }}/>
//                   No image selected
//                 </div>
//               )}
//             </div>

//             <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
//               <div>
//                 <label style={L}>Alt Text</label>
//                 <input className="input" value={image.alt} onChange={e => updateImage(index, 'alt', e.target.value)} placeholder="Describe this image" />
//               </div>
//               <label className="btn btn-secondary" style={{ justifyContent:'center', fontSize:'13px', padding:'10px 14px', opacity:uploading === index ? 0.7 : 1 }}>
//                 <Upload size={15}/> {optimizing === index ? 'Optimizing image...' : uploading === index ? 'Uploading...' : 'Upload File'}
//                 <input type="file" accept={IMAGE_FILE_ACCEPT} style={{ display:'none' }} disabled={uploading !== null || saving} onChange={e => uploadFile(index, e.target.files?.[0])} />
//               </label>
//             </div>
//           </div>
//         ))}
//       </div>

//       <div style={{ marginTop:'28px', marginBottom:'14px' }}>
//         <h2 style={{ fontFamily:'"Playfair Display",serif', fontSize:'22px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Visit Option Images</h2>
//         <p style={{ color:'var(--muted)', fontSize:'13px' }}>Upload the Home Visit and Visit Centre images shown below the hero banner.</p>
//       </div>

//       <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'16px' }}>
//         {visitImages.map((image, index) => (
//           <div key={index} className="card" style={{ padding:'16px' }}>
//             <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
//               <div style={{ display:'flex', alignItems:'center', gap:'8px', color:'var(--text)', fontWeight:800, fontSize:'14px' }}>
//                 <ImagePlus size={16} style={{ color:'var(--accent)' }}/> {index === 0 ? 'Home Visit' : 'Visit Our Centre'}
//               </div>
//               {image.url && (
//                 <button onClick={() => clearVisitImage(index)} title="Clear image" style={{ width:'28px', height:'28px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--muted)', cursor:'pointer' }}>
//                   <X size={14}/>
//                 </button>
//               )}
//             </div>

//             <div style={{ aspectRatio:'4 / 3', borderRadius:'8px', overflow:'hidden', border:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'12px' }}>
//               {image.url ? (
//                 <img src={image.url} alt={image.alt || ''} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
//               ) : (
//                 <div style={{ textAlign:'center', color:'var(--muted)', fontSize:'12px' }}>
//                   <ImagePlus size={28} style={{ margin:'0 auto 8px' }}/>
//                   No image selected
//                 </div>
//               )}
//             </div>

//             <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
//               <div>
//                 <label style={L}>Alt Text</label>
//                 <input className="input" value={image.alt} onChange={e => updateVisitImage(index, 'alt', e.target.value)} placeholder="Describe this image" />
//               </div>
//               <label className="btn btn-secondary" style={{ justifyContent:'center', fontSize:'13px', padding:'10px 14px', opacity:uploading === `visit-${index}` ? 0.7 : 1 }}>
//                 <Upload size={15}/> {optimizing === `visit-${index}` ? 'Optimizing image...' : uploading === `visit-${index}` ? 'Uploading...' : 'Upload File'}
//                 <input type="file" accept={IMAGE_FILE_ACCEPT} style={{ display:'none' }} disabled={uploading !== null || saving} onChange={e => uploadFile(`visit-${index}`, e.target.files?.[0], 'visit')} />
//               </label>
//             </div>
//           </div>
//         ))}
//       </div>

//       <ConfirmModal
//         open={confirmDelete}
//         title="Delete custom home images?"
//         message="Are you sure you want to delete the saved hero and visit option images?"
//         confirmText="Delete"
//         loading={deleting}
//         onCancel={() => setConfirmDelete(false)}
//         onConfirm={deleteCustomImages}
//       />
//     </div>
//   )
// }

import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { ImagePlus, Save, Trash2, Upload, X, ZoomIn, ZoomOut, Check, RotateCcw } from 'lucide-react'
import { db } from '../firebase'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'
import Cropper from 'react-easy-crop'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', e => reject(e))
    img.setAttribute('crossOrigin', 'anonymous')
    img.src = url
  })
}

async function getCroppedBlob(imageSrc, pixelCrop, type = 'image/jpeg') {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y,
    pixelCrop.width, pixelCrop.height,
    0, 0,
    pixelCrop.width, pixelCrop.height,
  )
  return new Promise(resolve => canvas.toBlob(resolve, type, 0.92))
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_IMAGES       = Array.from({ length: 5 }, () => ({ url: '', alt: '' }))
const EMPTY_VISIT_IMAGES = [
  { url: '', alt: 'Home visit grooming' },
  { url: '', alt: 'Visit our grooming centre' },
]

// Hero banners: wide landscape  1920 × 680  (ratio 16 / 6.55)
const HERO_ASPECT  = 16 / 6.55
// Visit cards: 4 / 3 portrait
const VISIT_ASPECT = 4 / 3

const L = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '1px',
  textTransform: 'uppercase', color: 'var(--muted)',
  display: 'block', marginBottom: '5px',
}

// ─── CropModal ─────────────────────────────────────────────────────────────────

function CropModal({ src, aspect, onCancel, onConfirm }) {
  const [crop, setCrop]           = useState({ x: 0, y: 0 })
  const [zoom, setZoom]           = useState(1)
  const [rotation, setRotation]   = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [processing, setProcessing] = useState(false)

  const onCropComplete = useCallback((_, cap) => {
    setCroppedAreaPixels(cap)
  }, [])

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return
    setProcessing(true)
    try {
      const blob = await getCroppedBlob(src, croppedAreaPixels)
      onConfirm(blob)
    } catch {
      setProcessing(false)
    }
  }

  const label = aspect > 3 ? '1920 × 680 px (hero banner)' : '800 × 600 px (visit image)'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div style={{
        width: '100%', maxWidth: '680px',
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px',
        overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <p style={{ color: 'var(--text)', fontWeight: 800, fontSize: '15px', marginBottom: '2px' }}>Crop &amp; Zoom Image</p>
            <p style={{ color: 'var(--muted)', fontSize: '11px' }}>Recommended: {label}</p>
          </div>
          <button onClick={onCancel} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={15} />
          </button>
        </div>

        {/* Crop area */}
        <div style={{ position: 'relative', width: '100%', height: '300px', background: '#111' }}>
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            style={{ containerStyle: { borderRadius: 0 } }}
          />
        </div>

        {/* Controls */}
        <div style={{ padding: '14px 18px', background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'grid', gap: '12px' }}>
          {/* Zoom */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '10px', alignItems: 'center' }}>
            <button onClick={() => setZoom(z => Math.max(1, +(z - 0.1).toFixed(1)))} style={iconBtn}><ZoomOut size={16} /></button>
            <input
              type="range" min={1} max={3} step={0.05}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer', width: '100%' }}
            />
            <button onClick={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(1)))} style={iconBtn}><ZoomIn size={16} /></button>
          </div>

          {/* Rotation */}
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '10px', alignItems: 'center' }}>
            <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 700, minWidth: '28px' }}>0°</span>
            <input
              type="range" min={-180} max={180} step={1}
              value={rotation}
              onChange={e => setRotation(Number(e.target.value))}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer', width: '100%' }}
            />
            <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 700, minWidth: '34px', textAlign: 'right' }}>{rotation}°</span>
          </div>

          {/* Reset + Confirm */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '2px' }}>
            <button
              onClick={() => { setZoom(1); setRotation(0); setCrop({ x: 0, y: 0 }) }}
              className="btn btn-secondary"
              style={{ fontSize: '13px', padding: '10px 14px', gap: '7px' }}
            >
              <RotateCcw size={14} /> Reset
            </button>
            <button
              onClick={handleConfirm}
              disabled={processing}
              className="btn btn-primary"
              style={{ fontSize: '13px', padding: '10px 14px', gap: '7px' }}
            >
              <Check size={14} /> {processing ? 'Processing…' : 'Use This Crop'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const iconBtn = {
  width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)',
  color: 'var(--accent)', cursor: 'pointer', flexShrink: 0,
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function AdminHeroImages() {
  const [images, setImages]           = useState(EMPTY_IMAGES)
  const [visitImages, setVisitImages] = useState(EMPTY_VISIT_IMAGES)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [uploading, setUploading]     = useState(null)
  const [optimizing, setOptimizing]   = useState(null)
  const [hasSavedImages, setHasSavedImages] = useState(false)
  const [message, setMessage]         = useState('')
  const [error, setError]             = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Crop modal state
  const [cropModal, setCropModal] = useState(null)
  // { src: objectUrl, slot, type: 'hero'|'visit', aspect }

  useEffect(() => {
    async function fetchImages() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'heroImages'))
        const data = snap.exists() ? snap.data() : {}
        const saved      = Array.isArray(data.images)      ? data.images      : []
        const savedVisit = Array.isArray(data.visitImages) ? data.visitImages : []
        setHasSavedImages(saved.some(i => i?.url) || savedVisit.some(i => i?.url))
        setImages(EMPTY_IMAGES.map((slot, idx) => ({
          url: saved[idx]?.url || slot.url,
          alt: saved[idx]?.alt || slot.alt,
        })))
        setVisitImages(EMPTY_VISIT_IMAGES.map((slot, idx) => ({
          url: savedVisit[idx]?.url || slot.url,
          alt: savedVisit[idx]?.alt || slot.alt,
        })))
      } catch {
        setError('Could not load home images.')
      }
      setLoading(false)
    }
    fetchImages()
  }, [])

  const updateImage      = (idx, key, val) => setImages(prev => prev.map((img, i) => i === idx ? { ...img, [key]: val } : img))
  const updateVisitImage = (idx, key, val) => setVisitImages(prev => prev.map((img, i) => i === idx ? { ...img, [key]: val } : img))
  const clearImage       = idx => { updateImage(idx, 'url', ''); updateImage(idx, 'alt', '') }
  const clearVisitImage  = idx => { updateVisitImage(idx, 'url', ''); updateVisitImage(idx, 'alt', EMPTY_VISIT_IMAGES[idx].alt) }

  // ── File chosen → open crop modal ──────────────────────────────────────────
  const openCrop = (file, slot, type) => {
    try { validateImageFile(file) } catch (err) { setError(err.message); return }
    setError('')
    setMessage('')
    const src = URL.createObjectURL(file)
    const aspect = type === 'visit' ? VISIT_ASPECT : HERO_ASPECT
    setCropModal({ src, slot, type, aspect })
  }

  // ── Crop confirmed → upload blob ────────────────────────────────────────────
  const handleCropConfirm = async (blob) => {
    const { src, slot, type } = cropModal
    setCropModal(null)
    URL.revokeObjectURL(src)

    setUploading(slot)
    try {
      const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' })
      const url = await uploadToCloudinary(file, {
        onOptimizeStart: () => setOptimizing(slot),
        onOptimizeEnd:   () => setOptimizing(null),
      })
      if (type === 'visit') {
        const idx = Number(String(slot).replace('visit-', ''))
        updateVisitImage(idx, 'url', url)
        if (!visitImages[idx].alt) updateVisitImage(idx, 'alt', EMPTY_VISIT_IMAGES[idx].alt)
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

  const handleCropCancel = () => {
    if (cropModal?.src) URL.revokeObjectURL(cropModal.src)
    setCropModal(null)
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const saveImages = async () => {
    setError(''); setMessage('')
    const cleanImages      = images.map(i => ({ url: i.url.trim(), alt: i.alt.trim() })).filter(i => i.url)
    const cleanVisitImages = visitImages.map(i => ({ url: i.url.trim(), alt: i.alt.trim() })).filter(i => i.url)
    if (!cleanImages.length) { setError('Please add at least 1 hero image before saving.'); return }
    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'heroImages'), {
        images: cleanImages, visitImages: cleanVisitImages, updatedAt: serverTimestamp(),
      }, { merge: true })
      setHasSavedImages(true)
      setMessage('Home images updated.')
    } catch (err) { setError(err.message || 'Could not save home images.') }
    setSaving(false)
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteCustomImages = async () => {
    setError(''); setMessage('')
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'settings', 'heroImages'))
      setImages(EMPTY_IMAGES); setVisitImages(EMPTY_VISIT_IMAGES)
      setHasSavedImages(false); setConfirmDelete(false)
      setMessage('Custom home images deleted.')
    } catch (err) { setError(err.message || 'Could not delete custom home images.') }
    setDeleting(false)
  }

  if (loading) return <div style={{ padding: '28px' }}><Spinner text="Loading home images…" /></div>

  const busy = saving || deleting || uploading !== null

  return (
    <div style={{ padding: '28px' }}>

      {/* ── Crop modal ── */}
      {cropModal && (
        <CropModal
          src={cropModal.src}
          aspect={cropModal.aspect}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Home Images</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
            Manage up to 5 hero banners and the 2 visit option images shown on the home page.
            <br />
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Hero banners:</span> 1920 × 680 px &nbsp;|&nbsp;
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Visit images:</span> 800 × 600 px
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {hasSavedImages && (
            <button onClick={() => setConfirmDelete(true)} disabled={busy} className="btn btn-danger" style={{ fontSize: '13px', padding: '10px 18px' }}>
              <Trash2 size={16} /> {deleting ? 'Deleting…' : 'Delete Custom Images'}
            </button>
          )}
          <button onClick={saveImages} disabled={busy} className="btn btn-primary" style={{ fontSize: '13px', padding: '10px 18px' }}>
            <Save size={16} /> {saving ? 'Saving…' : 'Save Images'}
          </button>
        </div>
      </div>

      {/* ── Alert ── */}
      {(message || error) && (
        <div style={{
          background: error ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)',
          border: `1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.25)'}`,
          color: error ? '#ef4444' : '#34d399', fontSize: '13px',
          padding: '12px 14px', borderRadius: '12px', marginBottom: '18px',
        }}>{error || message}</div>
      )}

      {/* ── Hero Banners ── */}
      <div style={{ marginBottom: '14px' }}>
        <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Hero Banners</h2>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
          Use wide banner images — <strong style={{ color: 'var(--accent)' }}>1920 × 680 px</strong> recommended (16:6.55 ratio).
          After choosing a file, use the crop tool to fit it perfectly.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {images.map((image, idx) => (
          <div key={idx} className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', fontWeight: 800, fontSize: '14px' }}>
                <ImagePlus size={16} style={{ color: 'var(--accent)' }} /> Banner {idx + 1}
              </div>
              {image.url && (
                <button onClick={() => clearImage(idx)} title="Clear image" style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Preview */}
            <div style={{ aspectRatio: '16 / 6.55', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              {image.url
                ? <img src={image.url} alt={image.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}><ImagePlus size={28} style={{ margin: '0 auto 8px' }} />No image selected<br /><span style={{ fontSize: '10px', opacity: .7 }}>1920 × 680 px</span></div>}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={L}>Alt Text</label>
                <input className="input" value={image.alt} onChange={e => updateImage(idx, 'alt', e.target.value)} placeholder="Describe this image" />
              </div>
              <label className="btn btn-secondary" style={{ justifyContent: 'center', fontSize: '13px', padding: '10px 14px', opacity: uploading === idx ? 0.7 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
                <Upload size={15} />
                {optimizing === idx ? 'Optimizing…' : uploading === idx ? 'Uploading…' : 'Upload & Crop'}
                <input type="file" accept={IMAGE_FILE_ACCEPT} style={{ display: 'none' }} disabled={busy}
                  onChange={e => { if (e.target.files?.[0]) openCrop(e.target.files[0], idx, 'hero'); e.target.value = '' }} />
              </label>
            </div>
          </div>
        ))}
      </div>

      {/* ── Visit Option Images ── */}
      <div style={{ marginTop: '28px', marginBottom: '14px' }}>
        <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Visit Option Images</h2>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
          Upload the Home Visit and Visit Centre images — <strong style={{ color: 'var(--accent)' }}>800 × 600 px</strong> (4:3 ratio) recommended.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {visitImages.map((image, idx) => {
          const slotKey = `visit-${idx}`
          return (
            <div key={idx} className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)', fontWeight: 800, fontSize: '14px' }}>
                  <ImagePlus size={16} style={{ color: 'var(--accent)' }} /> {idx === 0 ? 'Home Visit' : 'Visit Our Centre'}
                </div>
                {image.url && (
                  <button onClick={() => clearVisitImage(idx)} title="Clear image" style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' }}>
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Preview */}
              <div style={{ aspectRatio: '4 / 3', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                {image.url
                  ? <img src={image.url} alt={image.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}><ImagePlus size={28} style={{ margin: '0 auto 8px' }} />No image selected<br /><span style={{ fontSize: '10px', opacity: .7 }}>800 × 600 px</span></div>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={L}>Alt Text</label>
                  <input className="input" value={image.alt} onChange={e => updateVisitImage(idx, 'alt', e.target.value)} placeholder="Describe this image" />
                </div>
                <label className="btn btn-secondary" style={{ justifyContent: 'center', fontSize: '13px', padding: '10px 14px', opacity: uploading === slotKey ? 0.7 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
                  <Upload size={15} />
                  {optimizing === slotKey ? 'Optimizing…' : uploading === slotKey ? 'Uploading…' : 'Upload & Crop'}
                  <input type="file" accept={IMAGE_FILE_ACCEPT} style={{ display: 'none' }} disabled={busy}
                    onChange={e => { if (e.target.files?.[0]) openCrop(e.target.files[0], slotKey, 'visit'); e.target.value = '' }} />
                </label>
              </div>
            </div>
          )
        })}
      </div>

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