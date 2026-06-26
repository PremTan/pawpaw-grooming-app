import { useEffect, useState } from 'react'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { ImagePlus, Save, Trash2, Upload, X } from 'lucide-react'
import { db } from '../firebase'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'

const EMPTY_IMAGES = Array.from({ length: 5 }, () => ({ url: '', alt: '' }))
const EMPTY_VISIT_IMAGES = [
  { url: '', alt: 'Home visit grooming' },
  { url: '', alt: 'Visit our grooming centre' },
]

export default function AdminHeroImages() {
  const [images, setImages] = useState(EMPTY_IMAGES)
  const [visitImages, setVisitImages] = useState(EMPTY_VISIT_IMAGES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [optimizing, setOptimizing] = useState(null)
  const [hasSavedImages, setHasSavedImages] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    async function fetchImages() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'heroImages'))
        const data = snap.exists() ? snap.data() : {}
        const saved = Array.isArray(data.images) ? data.images : []
        const savedVisit = Array.isArray(data.visitImages) ? data.visitImages : []
        setHasSavedImages(saved.some(image => image?.url) || savedVisit.some(image => image?.url))
        setImages(EMPTY_IMAGES.map((slot, index) => ({
          url: saved[index]?.url || slot.url,
          alt: saved[index]?.alt || slot.alt,
        })))
        setVisitImages(EMPTY_VISIT_IMAGES.map((slot, index) => ({
          url: savedVisit[index]?.url || slot.url,
          alt: savedVisit[index]?.alt || slot.alt,
        })))
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

  const updateVisitImage = (index, key, value) => {
    setVisitImages(prev => prev.map((image, i) => i === index ? { ...image, [key]: value } : image))
  }

  const clearImage = (index) => {
    updateImage(index, 'url', '')
    updateImage(index, 'alt', '')
  }

  const clearVisitImage = (index) => {
    updateVisitImage(index, 'url', '')
    updateVisitImage(index, 'alt', EMPTY_VISIT_IMAGES[index].alt)
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
      if (type === 'visit') {
        const index = Number(String(slot).replace('visit-', ''))
        updateVisitImage(index, 'url', url)
        if (!visitImages[index].alt) updateVisitImage(index, 'alt', EMPTY_VISIT_IMAGES[index].alt)
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
    const cleanVisitImages = visitImages
      .map(image => ({ url: image.url.trim(), alt: image.alt.trim() }))
      .filter(image => image.url)

    if (!cleanImages.length) {
      setError('Please add at least 1 hero image before saving.')
      return
    }

    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'heroImages'), {
        images: cleanImages,
        visitImages: cleanVisitImages,
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
      setVisitImages(EMPTY_VISIT_IMAGES)
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
        <h2 style={{ fontFamily:'"Playfair Display",serif', fontSize:'22px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Visit Option Images</h2>
        <p style={{ color:'var(--muted)', fontSize:'13px' }}>Upload the Home Visit and Visit Centre images shown below the hero banner.</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'16px' }}>
        {visitImages.map((image, index) => (
          <div key={index} className="card" style={{ padding:'16px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', color:'var(--text)', fontWeight:800, fontSize:'14px' }}>
                <ImagePlus size={16} style={{ color:'var(--accent)' }}/> {index === 0 ? 'Home Visit' : 'Visit Our Centre'}
              </div>
              {image.url && (
                <button onClick={() => clearVisitImage(index)} title="Clear image" style={{ width:'28px', height:'28px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--muted)', cursor:'pointer' }}>
                  <X size={14}/>
                </button>
              )}
            </div>

            <div style={{ aspectRatio:'4 / 3', borderRadius:'8px', overflow:'hidden', border:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'12px' }}>
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
                <input className="input" value={image.alt} onChange={e => updateVisitImage(index, 'alt', e.target.value)} placeholder="Describe this image" />
              </div>
              <label className="btn btn-secondary" style={{ justifyContent:'center', fontSize:'13px', padding:'10px 14px', opacity:uploading === `visit-${index}` ? 0.7 : 1 }}>
                <Upload size={15}/> {optimizing === `visit-${index}` ? 'Optimizing image...' : uploading === `visit-${index}` ? 'Uploading...' : 'Upload File'}
                <input type="file" accept={IMAGE_FILE_ACCEPT} style={{ display:'none' }} disabled={uploading !== null || saving} onChange={e => uploadFile(`visit-${index}`, e.target.files?.[0], 'visit')} />
              </label>
            </div>
          </div>
        ))}
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
