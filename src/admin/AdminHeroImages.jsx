import { useEffect, useState } from 'react'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { ImagePlus, Save, Trash2, Upload, X } from 'lucide-react'
import { db } from '../firebase'
import { uploadToCloudinary } from '../utils/cloudinary'
import Spinner from '../components/Spinner'

const EMPTY_IMAGES = Array.from({ length: 5 }, () => ({ url: '', alt: '' }))

export default function AdminHeroImages() {
  const [images, setImages] = useState(EMPTY_IMAGES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [hasSavedImages, setHasSavedImages] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchImages() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'heroImages'))
        const saved = snap.exists() && Array.isArray(snap.data().images) ? snap.data().images : []
        setHasSavedImages(saved.some(image => image?.url))
        setImages(EMPTY_IMAGES.map((slot, index) => ({
          url: saved[index]?.url || slot.url,
          alt: saved[index]?.alt || slot.alt,
        })))
      } catch {
        setError('Could not load hero images.')
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

  const uploadFile = async (index, file) => {
    if (!file) return
    setError('')
    setMessage('')
    setUploading(index)
    try {
      const url = await uploadToCloudinary(file)
      updateImage(index, 'url', url)
      if (!images[index].alt) updateImage(index, 'alt', `Hero image ${index + 1}`)
    } catch (err) {
      setError(err.message || 'Upload failed. Check Cloudinary settings.')
    }
    setUploading(null)
  }

  const saveImages = async () => {
    setError('')
    setMessage('')
    const cleanImages = images
      .map(image => ({ url: image.url.trim(), alt: image.alt.trim() }))
      .filter(image => image.url)

    if (!cleanImages.length) {
      setError('Please add at least 1 image before saving, or delete custom images to use defaults.')
      return
    }

    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'heroImages'), {
        images: cleanImages,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setHasSavedImages(true)
      setMessage('Hero images updated.')
    } catch (err) {
      setError(err.message || 'Could not save hero images.')
    }
    setSaving(false)
  }

  const deleteCustomImages = async () => {
    if (!confirm('Delete custom hero images and show the default home page images?')) return
    setError('')
    setMessage('')
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'settings', 'heroImages'))
      setImages(EMPTY_IMAGES)
      setHasSavedImages(false)
      setMessage('Custom hero images deleted. Default images will show on the home page.')
    } catch (err) {
      setError(err.message || 'Could not delete custom hero images.')
    }
    setDeleting(false)
  }

  const L = { fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }

  if (loading) return <div style={{ padding:'28px' }}><Spinner text="Loading hero images..." /></div>

  return (
    <div style={{ padding:'28px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap', marginBottom:'24px' }}>
        <div>
          <h1 style={{ fontFamily:'"Playfair Display",serif', fontSize:'28px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Hero Images</h1>
          <p style={{ color:'var(--muted)', fontSize:'13px' }}>Manage up to 5 auto-sliding images on the home page hero.</p>
        </div>
        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
          {hasSavedImages && (
            <button onClick={deleteCustomImages} disabled={deleting || saving || uploading !== null} className="btn btn-danger" style={{ fontSize:'13px', padding:'10px 18px' }}>
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

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'16px' }}>
        {images.map((image, index) => (
          <div key={index} className="card" style={{ padding:'16px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', color:'var(--text)', fontWeight:800, fontSize:'14px' }}>
                <ImagePlus size={16} style={{ color:'var(--accent)' }}/> Image {index + 1}
              </div>
              {image.url && (
                <button onClick={() => clearImage(index)} title="Clear image" style={{ width:'28px', height:'28px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--muted)', cursor:'pointer' }}>
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
                <label style={L}>Image URL</label>
                <input className="input" value={image.url} onChange={e => updateImage(index, 'url', e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label style={L}>Alt Text</label>
                <input className="input" value={image.alt} onChange={e => updateImage(index, 'alt', e.target.value)} placeholder="Describe this image" />
              </div>
              <label className="btn btn-secondary" style={{ justifyContent:'center', fontSize:'13px', padding:'10px 14px', opacity:uploading === index ? 0.7 : 1 }}>
                <Upload size={15}/> {uploading === index ? 'Uploading...' : 'Upload File'}
                <input type="file" accept="image/*" style={{ display:'none' }} disabled={uploading !== null || saving} onChange={e => uploadFile(index, e.target.files?.[0])} />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
