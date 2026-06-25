// src/admin/AdminGallery.jsx
import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, orderBy, query, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import { Plus, X, Trash2, Image, Upload, Pencil } from 'lucide-react'

const CATEGORIES = ['before-after', 'haircut', 'bath', 'styling', 'nail', 'general']
const EMPTY = { url:'', caption:'', category:'general' }

export default function AdminGallery() {
  const [images, setImages]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [file, setFile]         = useState(null)
  const [preview, setPreview]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [error, setError]       = useState('')
  const [deleting, setDeleting] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [filterCat, setFilterCat] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const fetchImages = async () => {
    try {
      const snap = await getDocs(query(collection(db,'gallery'), orderBy('createdAt','desc')))
      setImages(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    } catch {
      try {
        const snap = await getDocs(collection(db,'gallery'))
        setImages(snap.docs.map(d => ({ id:d.id, ...d.data() })))
      } catch {}
    }
    setLoading(false)
  }
  useEffect(() => { fetchImages() }, [])

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      validateImageFile(f)
    } catch (err) {
      setError(err.message)
      e.target.value = ''
      return
    }
    setError('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const handleSave = async () => {
    setError(''); setSaving(true)
    try {
      let url = form.url
      if (file) {
        url = await uploadToCloudinary(file, {
          onOptimizeStart: () => setOptimizing(true),
          onOptimizeEnd: () => setOptimizing(false),
        })
      }
      if (!url) { setError('Please provide an image.'); setSaving(false); return }
      if (editingId) {
        await updateDoc(doc(db,'gallery',editingId), { url, caption:form.caption, category:form.category, updatedAt:serverTimestamp() })
      } else {
        await addDoc(collection(db,'gallery'), { url, caption:form.caption, category:form.category, createdAt:serverTimestamp() })
      }
      setShowModal(false); setForm(EMPTY); setFile(null); setPreview('')
      setEditingId(null)
      await fetchImages()
    } catch(e) {   console.error("FULL ERROR:", e);
  console.error("ERROR CODE:", e.code);
  console.error("ERROR MESSAGE:", e.message);
  setError(e.message || 'Upload failed. Check Cloudinary settings.'); }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    setDeleting(id)
    try { await deleteDoc(doc(db,'gallery',id)); setImages(p => p.filter(i => i.id!==id)); setDeleteTarget(null) } catch {}
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

  const filtered = filterCat === 'all' ? images : images.filter(i => i.category === filterCat)

  const L = { fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }
  const tabStyle = (active) => ({ padding:'7px 16px', borderRadius:'8px', fontSize:'12px', fontWeight:active?700:400, cursor:'pointer', border:'none', background:active?'var(--accent-bg)':'transparent', color:active?'var(--accent)':'var(--muted)', transition:'all 0.15s' })

  return (
    <div style={{ padding:'28px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontFamily:'"Playfair Display",serif', fontSize:'28px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Gallery</h1>
          <p style={{ color:'var(--muted)', fontSize:'13px' }}>{images.length} images · shown to customers</p>
        </div>
        <button onClick={() => { setShowModal(true); setEditingId(null); setForm(EMPTY); setFile(null); setPreview(''); setError('') }} className="btn btn-primary" style={{ fontSize:'13px', padding:'10px 18px' }}>
          <Plus size={16}/> Add Image
        </button>
      </div>

      {/* Category filter */}
      <div style={{ display:'flex', gap:'6px', marginBottom:'20px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'4px', flexWrap:'wrap' }}>
        {['all', ...CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)} style={tabStyle(filterCat===cat)}>{cat}</button>
        ))}
      </div>

      {loading ? <Spinner text="Loading gallery…" /> : filtered.length===0 ? (
        <div style={{ background:'var(--card)', border:'2px dashed var(--border)', borderRadius:'16px', padding:'60px', textAlign:'center' }}>
          <Image size={40} style={{ color:'var(--muted)', margin:'0 auto 16px' }}/>
          <p style={{ color:'var(--text)', fontWeight:600, marginBottom:'6px' }}>No images yet</p>
          <p style={{ color:'var(--muted)', fontSize:'13px', marginBottom:'20px' }}>Upload before/after shots and service photos</p>
          <button onClick={() => { setShowModal(true); setError('') }} className="btn btn-primary">Upload Image</button>
        </div>
      ) : (
        <div style={{ columns:'4 200px', gap:'14px' }}>
          {filtered.map(img => (
            // <div key={img.id} style={{ breakInside:'avoid', marginBottom:'14px', position:'relative', borderRadius:'12px', overflow:'hidden', border:'1px solid var(--border)', cursor:'pointer', transition:'all 0.2s' }}
            <div key={img.id} style={{ breakInside:'avoid', marginBottom:'14px', position:'relative', borderRadius:'12px', overflow:'hidden', border:'1px solid var(--border)', cursor:'pointer', transition:'all 0.2s', minHeight:'60px', background:'var(--surface)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor='var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
            >
              <img src={img.url} alt={img.caption||''} style={{ width:'100%', display:'block', objectFit:'cover' }} loading="lazy" onClick={() => setLightbox(img)} />
              {img.caption && (
                <div style={{ padding:'8px 10px', background:'var(--card)' }}>
                  <p style={{ color:'var(--text)', fontSize:'12px', fontWeight:500 }}>{img.caption}</p>
                  <p style={{ color:'var(--muted)', fontSize:'10px', textTransform:'capitalize', marginTop:'2px' }}>{img.category}</p>
                </div>
              )}
              {/* Edit/delete overlay */}
              <button onClick={() => handleEdit(img)}
                // style={{ position:'absolute', top:'6px', right:'40px', background:'rgba(0,0,0,0.7)', border:'none', color:'#fff', width:'28px', height:'28px', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:0, transition:'opacity 0.2s' }}
                style={{ position:'absolute', top:'6px', right:'40px', background:'rgba(0,0,0,0.7)', border:'none', color:'#fff', width:'28px', height:'28px', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                onMouseEnter={e => e.currentTarget.style.opacity='1'} onFocus={e => e.currentTarget.style.opacity='1'}
                className="delete-img-btn"
                title="Edit image"
              >
                <Pencil size={13}/>
              </button>
              <button onClick={() => setDeleteTarget(img)} disabled={deleting===img.id}
                // style={{ position:'absolute', top:'6px', right:'6px', background:'rgba(0,0,0,0.7)', border:'none', color:'#fff', width:'28px', height:'28px', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity:0, transition:'opacity 0.2s' }}
                // onMouseEnter={e => e.currentTarget.style.opacity='1'} onFocus={e => e.currentTarget.style.opacity='1'}
                style={{ position:'absolute', top:'6px', right:'6px', background:'rgba(0,0,0,0.7)', border:'none', color:'#fff', width:'28px', height:'28px', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                className="delete-img-btn"
              >
                <Trash2 size={13}/>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Show delete button on hover via CSS */}
      {/* <style>{`.delete-img-btn { opacity: 0 !important; } div:hover > .delete-img-btn { opacity: 1 !important; }`}</style> */}

      {/* Add Image Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditingId(null) }}>
          <div className="modal-box" style={{ maxWidth:'480px' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:'24px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
                <h2 style={{ fontFamily:'"Playfair Display",serif', fontWeight:700, fontSize:'20px', color:'var(--text)' }}>{editingId ? 'Edit Image' : 'Add Image'}</h2>
                <button onClick={() => { setShowModal(false); setEditingId(null) }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}><X size={20}/></button>
              </div>

              {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', color:'#ef4444', fontSize:'13px', padding:'10px', borderRadius:'10px', marginBottom:'16px' }}>{error}</div>}

              <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                <div>
                  <label style={L}>Image File</label>
                  {preview || form.url ? (
                    <div style={{ position:'relative', borderRadius:'12px', overflow:'hidden', marginBottom:'8px' }}>
                      <img src={preview || form.url} alt="" style={{ width:'100%', maxHeight:'200px', objectFit:'cover', display:'block' }}/>
                      <button onClick={() => { setFile(null); setPreview(''); setForm(p => ({ ...p, url:'' })) }} style={{ position:'absolute', top:'8px', right:'8px', background:'rgba(0,0,0,0.7)', border:'none', color:'#fff', width:'28px', height:'28px', borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <X size={14}/>
                      </button>
                    </div>
                  ) : (
                    <label style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', padding:'32px', border:'2px dashed var(--border)', borderRadius:'12px', cursor:'pointer', background:'var(--surface)', transition:'all 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor='var(--accent)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
                    >
                      <Upload size={28} style={{ color:'var(--muted)' }}/>
                      <span style={{ color:'var(--muted)', fontSize:'13px' }}>Click to upload image</span>
                      <span style={{ color:'var(--muted)', fontSize:'11px' }}>JPG, PNG, WEBP up to 10MB</span>
                      <input type="file" accept={IMAGE_FILE_ACCEPT} style={{ display:'none' }} onChange={handleFileChange}/>
                    </label>
                  )}
                  {(preview || form.url) && (
                    <label className="btn btn-secondary" style={{ justifyContent:'center', fontSize:'13px', padding:'10px 14px', marginTop:'8px' }}>
                      <Upload size={15}/> Replace Image
                      <input type="file" accept={IMAGE_FILE_ACCEPT} style={{ display:'none' }} onChange={handleFileChange}/>
                    </label>
                  )}
                  <p style={{ color:'var(--muted)', fontSize:'11px', marginTop:'6px' }}>
                    Requires Cloudinary setup in .env file
                  </p>
                </div>

                <div>
                  <label style={L}>Caption (optional)</label>
                  <input className="input" placeholder="e.g. Bruno after full grooming" value={form.caption} onChange={e => setForm(p => ({ ...p, caption:e.target.value }))}/>
                </div>

                <div>
                  <label style={L}>Category</label>
                  <select className="input" value={form.category} onChange={e => setForm(p => ({ ...p, category:e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c} style={{ textTransform:'capitalize' }}>{c}</option>)}
                  </select>
                </div>

                <div style={{ display:'flex', gap:'10px', paddingTop:'4px' }}>
                  <button onClick={() => { setShowModal(false); setEditingId(null) }} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}>Cancel</button>
                  <button onClick={handleSave} disabled={saving || (!file && !form.url)} className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}>
                    {optimizing ? 'Optimizing image...' : saving ? 'Uploading...' : 'Save Image'}
                  </button>
                </div>
              </div>
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

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.95)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth:'900px', width:'100%' }}>
            <img src={lightbox.url} alt={lightbox.caption||''} style={{ width:'100%', borderRadius:'16px', maxHeight:'80vh', objectFit:'contain' }}/>
            {lightbox.caption && <p style={{ color:'#fff', textAlign:'center', marginTop:'14px', fontSize:'15px' }}>{lightbox.caption}</p>}
            <button onClick={() => setLightbox(null)} style={{ display:'block', margin:'14px auto 0', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', color:'#fff', padding:'8px 28px', borderRadius:'8px', cursor:'pointer', fontSize:'13px' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
