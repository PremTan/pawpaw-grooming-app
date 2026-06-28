// src/admin/AdminPackages.jsx
import { useCallback, useEffect, useState } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import Cropper from 'react-easy-crop'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import { Plus, X, Pencil, Trash2, Package, Upload } from 'lucide-react'

const EMPTY = { name:'', description:'', services:[], priceRange:'', price:'', duration:'', imageUrl:'', active:true }
const getCroppedPackageImage = async (imageSrc, pixelCrop, fileName) => {
  const image = new Image()
  image.src = imageSrc
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = 900
  canvas.height = 900
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, 900, 900)

  const safeName = (fileName || 'package-image').replace(/\.[^.]+$/, '')
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not crop image. Please try another image.'))
        return
      }
      resolve(new File([blob], `${safeName}-package.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  })
}

export default function AdminPackages() {
  const [packages, setPackages] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]  = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [cropData, setCropData] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [svcInput, setSvcInput] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const fetch = async () => {
    try {
      const snap = await getDocs(collection(db, 'packages'))
      setPackages(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    } catch {}
    setLoading(false)
  }
  useEffect(() => { fetch() }, [])

  const openAdd  = () => { setForm(EMPTY); setEditId(null); setSvcInput(''); setShowModal(true) }
  const openEdit = (pkg) => { setForm({ name:pkg.name, description:pkg.description||'', services:pkg.services||[], priceRange:pkg.priceRange||'', price:pkg.price||'', duration:pkg.duration||'', imageUrl:pkg.imageUrl||'', active:pkg.active!==false }); setEditId(pkg.id); setSvcInput(''); setShowModal(true) }

  const chooseImage = (file) => {
    if (!file) return
    try {
      validateImageFile(file)
    } catch (err) {
      alert(err.message)
      return
    }
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
      setCropData({ src: reader.result, fileName: file.name })
    })
    reader.readAsDataURL(file)
  }

  const onCropComplete = useCallback((_, croppedPixels) => setCroppedAreaPixels(croppedPixels), [])

  const confirmPackageCrop = async () => {
    if (!cropData || !croppedAreaPixels) return
    setUploadingImage(true)
    try {
      const croppedFile = await getCroppedPackageImage(cropData.src, croppedAreaPixels, cropData.fileName)
      setCropData(null)
      const url = await uploadToCloudinary(croppedFile)
      setForm(p => ({ ...p, imageUrl: url }))
    } catch (err) {
      alert(err.message || 'Could not upload package image.')
    }
    setUploadingImage(false)
  }
  const addService = () => {
    if (!svcInput.trim()) return
    setForm(p => ({ ...p, services:[...p.services, svcInput.trim()] }))
    setSvcInput('')
  }
  const removeService = (i) => setForm(p => ({ ...p, services:p.services.filter((_,idx) => idx!==i) }))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const data = { ...form, updatedAt:serverTimestamp() }
      if (editId) { await updateDoc(doc(db,'packages',editId), data) }
      else { await addDoc(collection(db,'packages'), { ...data, createdAt:serverTimestamp() }) }
      setShowModal(false); await fetch()
    } catch {}
    setSaving(false)
  }

  const handleDelete = async (id) => {
    await deleteDoc(doc(db,'packages',id)); setPackages(p => p.filter(x => x.id!==id)); setDeleteTarget(null)
  }

  const toggleActive = async (pkg) => {
    await updateDoc(doc(db,'packages',pkg.id), { active:!pkg.active })
    setPackages(p => p.map(x => x.id===pkg.id ? { ...x, active:!pkg.active } : x))
  }

  const L = { fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }

  return (
    <div style={{ padding:'28px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontFamily:'"Playfair Display",serif', fontSize:'28px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Packages</h1>
          <p style={{ color:'var(--muted)', fontSize:'13px' }}>Create custom service bundles with price ranges</p>
        </div>
        <button onClick={openAdd} className="btn btn-primary" style={{ fontSize:'13px', padding:'10px 18px' }}>
          <Plus size={16}/> New Package
        </button>
      </div>

      {loading ? <Spinner text="Loading packagesÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦" /> : packages.length===0 ? (
        <div style={{ background:'var(--card)', border:'2px dashed var(--border)', borderRadius:'16px', padding:'60px', textAlign:'center' }}>
          <Package size={40} style={{ color:'var(--muted)', margin:'0 auto 16px' }} />
          <p style={{ color:'var(--text)', fontWeight:600, marginBottom:'6px' }}>No packages yet</p>
          <p style={{ color:'var(--muted)', fontSize:'13px', marginBottom:'20px' }}>Create your first custom service bundle</p>
          <button onClick={openAdd} className="btn btn-primary">Create Package</button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px,1fr))', gap:'16px' }}>
          {packages.map(pkg => (
            <div key={pkg.id} style={{ background:'var(--card)', border:`1px solid ${pkg.active!==false?'var(--accent-border)':'var(--border)'}`, borderRadius:'16px', padding:'22px', opacity:pkg.active===false?0.6:1, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:pkg.active!==false?'var(--gradient)':'var(--border)' }} />
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'12px' }}>
                <div>
                  <h3 style={{ color:'var(--text)', fontWeight:700, fontSize:'16px', marginBottom:'4px' }}>{pkg.name}</h3>
                  {pkg.description && <p style={{ color:'var(--muted)', fontSize:'12px' }}>{pkg.description}</p>}
                </div>
                <div style={{ display:'flex', gap:'6px' }}>
                  <button onClick={() => openEdit(pkg)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:'4px' }}><Pencil size={14}/></button>
                  <button onClick={() => setDeleteTarget(pkg)} style={{ background:'none', border:'none', color:'rgba(239,68,68,0.5)', cursor:'pointer', padding:'4px' }}
                    onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='rgba(239,68,68,0.5)'}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>

              {pkg.services?.length > 0 && (
                <div style={{ marginBottom:'14px' }}>
                  {pkg.services.map((s,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'4px 0', borderBottom:i<pkg.services.length-1?'1px solid var(--border)':'none' }}>
                      <span style={{ color:'var(--accent)', fontSize:'11px' }}>ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“</span>
                      <span style={{ color:'var(--text)', fontSize:'13px' }}>{s}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
                <div>
                  <div style={{ color:'var(--accent)', fontFamily:'"DM Mono",monospace', fontWeight:800, fontSize:'18px' }}>{pkg.priceRange || (pkg.price ? `ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹${pkg.price}` : 'Price TBD')}</div>
                  {pkg.duration && <div style={{ color:'var(--muted)', fontSize:'11px', marginTop:'2px' }}>ÃƒÂ¢Ã‚ÂÃ‚Â± {pkg.duration}</div>}
                </div>
                <button onClick={() => toggleActive(pkg)}
                  style={{ padding:'5px 14px', borderRadius:'999px', fontSize:'11px', fontWeight:700, cursor:'pointer', border:'none', background: pkg.active!==false ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)', color: pkg.active!==false ? '#34d399' : '#ef4444' }}
                >
                  {pkg.active!==false ? 'ÃƒÂ¢Ã¢â‚¬â€Ã‚Â Active' : 'ÃƒÂ¢Ã¢â‚¬â€Ã‚Â Inactive'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {cropData && (
        <div className="modal-overlay admin-package-crop-overlay" onClick={() => setCropData(null)}>
          <div className="modal-box admin-package-crop-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-package-crop-head">
              <div>
                <h2>Crop Package Image</h2>
                <p>Use a round crop. Drag to position and zoom in or out.</p>
              </div>
              <button type="button" onClick={() => setCropData(null)} aria-label="Close crop package image"><X size={18} /></button>
            </div>
            <div className="admin-package-crop-stage">
              <Cropper
                image={cropData.src}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            <div className="admin-package-crop-zoom">
              <span>Zoom</span>
              <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))} />
            </div>
            <div className="admin-package-crop-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setCropData(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={uploadingImage} onClick={confirmPackageCrop}>{uploadingImage ? 'Uploading...' : 'Confirm & Upload'}</button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete package?"
        message={deleteTarget ? `Are you sure you want to delete ${deleteTarget.name}?` : ''}
        confirmText="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
      />

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" style={{ maxWidth:'520px' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:'24px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
                <h2 style={{ fontFamily:'"Playfair Display",serif', fontWeight:700, fontSize:'20px', color:'var(--text)' }}>
                  {editId ? 'Edit Package' : 'New Package'}
                </h2>
                <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}><X size={20}/></button>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                <div>
                  <label style={L}>Package Card Image</label>
                  <div className="admin-package-image-row">
                    <div className="admin-package-image-preview">
                      {form.imageUrl ? <img src={form.imageUrl} alt="" /> : <Package size={34} />}
                    </div>
                    <div className="admin-package-image-actions">
                      <label className="btn btn-secondary" style={{ justifyContent:'center', fontSize:'13px', padding:'10px 14px' }}>
                        <Upload size={15} /> {uploadingImage ? 'Uploading...' : 'Upload Image'}
                        <input type="file" accept={IMAGE_FILE_ACCEPT} disabled={uploadingImage || saving} style={{ display:'none' }} onChange={e => { chooseImage(e.target.files?.[0]); e.target.value = null }} />
                      </label>
                      {form.imageUrl && <button type="button" className="btn btn-danger" style={{ justifyContent:'center', fontSize:'13px', padding:'10px 14px' }} onClick={() => setForm(p => ({ ...p, imageUrl:'' }))}><X size={15} /> Remove</button>}
                    </div>
                  </div>
                </div>
                <div>
                  <label style={L}>Package Name *</label>
                  <input className="input" placeholder="e.g. Premium Grooming Bundle" value={form.name} onChange={e => setForm(p => ({ ...p, name:e.target.value }))} />
                </div>
                <div>
                  <label style={L}>Description</label>
                  <textarea className="input" style={{ resize:'none' }} rows={2} placeholder="What's includedÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦" value={form.description} onChange={e => setForm(p => ({ ...p, description:e.target.value }))} />
                </div>

                {/* Services list */}
                <div>
                  <label style={L}>Included Services</label>
                  <div style={{ display:'flex', gap:'8px', marginBottom:'8px' }}>
                    <input className="input" placeholder="e.g. Bath + Hair Cut" value={svcInput} onChange={e => setSvcInput(e.target.value)}
                      onKeyDown={e => e.key==='Enter' && addService()} style={{ flex:1 }} />
                    <button onClick={addService} className="btn btn-ghost" style={{ padding:'10px 16px', flexShrink:0 }}><Plus size={16}/></button>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                    {form.services.map((s,i) => (
                      <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:'5px', background:'var(--accent-bg)', border:'1px solid var(--accent-border)', color:'var(--accent)', padding:'4px 10px', borderRadius:'999px', fontSize:'12px', fontWeight:600 }}>
                        {s}
                        <button onClick={() => removeService(i)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent)', display:'flex', padding:0 }}><X size={11}/></button>
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                  <div>
                    <label style={L}>Price Range</label>
                    <input className="input" placeholder="e.g. ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹800 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹1500" value={form.priceRange} onChange={e => setForm(p => ({ ...p, priceRange:e.target.value }))} />
                  </div>
                  <div>
                    <label style={L}>Duration</label>
                    <input className="input" placeholder="e.g. 2 hrs" value={form.duration} onChange={e => setForm(p => ({ ...p, duration:e.target.value }))} />
                  </div>
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <input type="checkbox" id="active" checked={form.active} onChange={e => setForm(p => ({ ...p, active:e.target.checked }))} style={{ width:'16px', height:'16px', accentColor:'var(--accent)' }} />
                  <label htmlFor="active" style={{ color:'var(--text)', fontSize:'13px', cursor:'pointer' }}>Active (visible to users)</label>
                </div>

                <div style={{ display:'flex', gap:'10px', paddingTop:'4px' }}>
                  <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}>Cancel</button>
                  <button onClick={handleSave} disabled={saving||!form.name.trim()} className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}>
                    {saving ? 'SavingÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦' : editId ? 'Update Package' : 'Create Package'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
