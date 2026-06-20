// import { useEffect, useMemo, useState } from 'react'
// import { deleteDoc, doc, getDocs, collection, serverTimestamp, setDoc } from 'firebase/firestore'
// import { Eye, EyeOff, ImagePlus, Save, Trash2, Upload, X } from 'lucide-react'
// import { db } from '../firebase'
// import Spinner from '../components/Spinner'
// import { SERVICES } from '../utils/services'
// import { uploadToCloudinary } from '../utils/cloudinary'

// const emptyImage = () => ({ url: '', title: '', description: '', alt: '' })
// const emptyImages = () => Array.from({ length: 5 }, emptyImage)

// export default function AdminServices() {
//   const [details, setDetails] = useState({})
//   const [selectedId, setSelectedId] = useState(SERVICES[0]?.id || '')
//   const [form, setForm] = useState(null)
//   const [loading, setLoading] = useState(true)
//   const [saving, setSaving] = useState(false)
//   const [uploading, setUploading] = useState(null)
//   const [message, setMessage] = useState('')
//   const [error, setError] = useState('')

//   useEffect(() => {
//     async function fetchDetails() {
//       try {
//         const snap = await getDocs(collection(db, 'serviceDetails'))
//         const next = {}
//         snap.docs.forEach(d => { next[d.id] = { id: d.id, ...d.data() } })
//         setDetails(next)
//       } catch {
//         setError('Could not load service details.')
//       }
//       setLoading(false)
//     }
//     fetchDetails()
//   }, [])

//   const selectedService = useMemo(() => SERVICES.find(s => s.id === selectedId), [selectedId])

//   useEffect(() => {
//     if (!selectedService) return
//     const saved = details[selectedService.id] || {}
//     const savedImages = Array.isArray(saved.images) ? saved.images : []
//     setForm({
//       name: saved.name || selectedService.name,
//       summary: saved.summary || selectedService.description,
//       description: saved.description || selectedService.description,
//       price: saved.price || selectedService.price,
//       duration: saved.duration || selectedService.duration,
//       active: saved.active !== false,
//       images: emptyImages().map((slot, index) => ({ ...slot, ...(savedImages[index] || {}) })),
//     })
//     setMessage('')
//     setError('')
//   }, [details, selectedService])

//   const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
//   const updateImage = (index, key, value) => {
//     setForm(prev => ({
//       ...prev,
//       images: prev.images.map((image, i) => i === index ? { ...image, [key]: value } : image),
//     }))
//   }

//   const clearImage = (index) => {
//     setForm(prev => ({
//       ...prev,
//       images: prev.images.map((image, i) => i === index ? emptyImage() : image),
//     }))
//   }

//   const uploadFile = async (index, file) => {
//     if (!file) return
//     setUploading(index)
//     setError('')
//     setMessage('')
//     try {
//       const url = await uploadToCloudinary(file)
//       updateImage(index, 'url', url)
//       if (!form.images[index].title) updateImage(index, 'title', `${form.name} photo ${index + 1}`)
//     } catch (err) {
//       setError(err.message || 'Upload failed. Check Cloudinary settings.')
//     }
//     setUploading(null)
//   }

//   const save = async () => {
//     if (!form || !selectedService) return
//     setSaving(true)
//     setError('')
//     setMessage('')
//     try {
//       const cleanImages = form.images
//         .map(image => ({
//           url: image.url.trim(),
//           title: image.title.trim(),
//           description: image.description.trim(),
//           alt: image.alt.trim(),
//         }))
//         .filter(image => image.url)
//         .slice(0, 5)

//       await setDoc(doc(db, 'serviceDetails', selectedService.id), {
//         name: form.name.trim(),
//         summary: form.summary.trim(),
//         description: form.description.trim(),
//         price: form.price.trim(),
//         duration: form.duration.trim(),
//         active: form.active,
//         images: cleanImages,
//         updatedAt: serverTimestamp(),
//       }, { merge: true })
//       setDetails(prev => ({ ...prev, [selectedService.id]: { ...(prev[selectedService.id] || {}), ...form, images: cleanImages } }))
//       setMessage('Service updated.')
//     } catch (err) {
//       setError(err.message || 'Could not save service.')
//     }
//     setSaving(false)
//   }

//   const hideService = async () => {
//     if (!selectedService || !confirm(`Hide ${selectedService.name} from the public site?`)) return
//     update('active', false)
//     setSaving(true)
//     try {
//       await setDoc(doc(db, 'serviceDetails', selectedService.id), { active: false, updatedAt: serverTimestamp() }, { merge: true })
//       setDetails(prev => ({ ...prev, [selectedService.id]: { ...(prev[selectedService.id] || {}), active: false } }))
//       setMessage('Service hidden.')
//     } catch (err) {
//       setError(err.message || 'Could not hide service.')
//     }
//     setSaving(false)
//   }

//   const resetService = async () => {
//     if (!selectedService || !confirm(`Delete custom content for ${selectedService.name}? The default service will remain.`)) return
//     setSaving(true)
//     setError('')
//     setMessage('')
//     try {
//       await deleteDoc(doc(db, 'serviceDetails', selectedService.id))
//       setDetails(prev => {
//         const next = { ...prev }
//         delete next[selectedService.id]
//         return next
//       })
//       setMessage('Custom service content deleted.')
//     } catch (err) {
//       setError(err.message || 'Could not delete custom content.')
//     }
//     setSaving(false)
//   }

//   const L = { fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }

//   if (loading || !form) return <div style={{ padding: '28px' }}><Spinner text="Loading services..." /></div>

//   return (
//     <div style={{ padding: '28px' }}>
//       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
//         <div>
//           <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Services</h1>
//           <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Update public service pages with up to 5 images and descriptions.</p>
//         </div>
//         <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
//           <button onClick={hideService} disabled={saving || uploading !== null || form.active === false} className="btn btn-danger" style={{ fontSize: '13px', padding: '10px 16px' }}>
//             <EyeOff size={16} /> Hide
//           </button>
//           <button onClick={resetService} disabled={saving || uploading !== null} className="btn btn-secondary" style={{ fontSize: '13px', padding: '10px 16px' }}>
//             <Trash2 size={16} /> Reset
//           </button>
//           <button onClick={save} disabled={saving || uploading !== null} className="btn btn-primary" style={{ fontSize: '13px', padding: '10px 18px' }}>
//             <Save size={16} /> {saving ? 'Saving...' : 'Save Service'}
//           </button>
//         </div>
//       </div>

//       {(message || error) && (
//         <div style={{ background:error ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)', border:`1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.25)'}`, color:error ? '#ef4444' : '#34d399', fontSize:'13px', padding:'12px 14px', borderRadius:'12px', marginBottom:'18px' }}>
//           {error || message}
//         </div>
//       )}

//       <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: '18px' }} className="admin-services-layout">
//         <div className="card" style={{ padding: '10px', alignSelf: 'start' }}>
//           {SERVICES.map(service => {
//             const saved = details[service.id]
//             const active = saved?.active !== false
//             const selected = service.id === selectedId
//             return (
//               <button key={service.id} onClick={() => setSelectedId(service.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '11px', borderRadius: '8px', border: selected ? '1px solid var(--accent-border)' : '1px solid transparent', background: selected ? 'var(--accent-bg)' : 'transparent', color: selected ? 'var(--accent)' : 'var(--text)', cursor: 'pointer', textAlign: 'left', marginBottom: '3px' }}>
//                 <span style={{ fontSize: '20px' }}>{service.icon}</span>
//                 <span style={{ flex: 1, fontSize: '13px', fontWeight: 800 }}>{service.name}</span>
//                 {active ? <Eye size={14} /> : <EyeOff size={14} />}
//               </button>
//             )
//           })}
//         </div>

//         <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
//           <div className="card" style={{ padding: '18px' }}>
//             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
//               <div>
//                 <label style={L}>Service Name</label>
//                 <input className="input" value={form.name} onChange={e => update('name', e.target.value)} />
//               </div>
//               <div>
//                 <label style={L}>Price</label>
//                 <input className="input" value={form.price} onChange={e => update('price', e.target.value)} />
//               </div>
//               <div>
//                 <label style={L}>Duration</label>
//                 <input className="input" value={form.duration} onChange={e => update('duration', e.target.value)} />
//               </div>
//               <label style={{ display: 'flex', alignItems: 'center', gap: '9px', color: 'var(--text)', fontSize: '13px', fontWeight: 800, paddingTop: '20px' }}>
//                 <input type="checkbox" checked={form.active} onChange={e => update('active', e.target.checked)} />
//                 Show this service publicly
//               </label>
//             </div>
//             <div style={{ marginTop: '14px' }}>
//               <label style={L}>Short Summary</label>
//               <input className="input" value={form.summary} onChange={e => update('summary', e.target.value)} />
//             </div>
//             <div style={{ marginTop: '14px' }}>
//               <label style={L}>Full Description</label>
//               <textarea className="input" rows={4} value={form.description} onChange={e => update('description', e.target.value)} style={{ resize: 'vertical' }} />
//             </div>
//           </div>

//           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
//             {form.images.map((image, index) => (
//               <div key={index} className="card" style={{ padding: '14px' }}>
//                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
//                   <strong style={{ color: 'var(--text)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px' }}><ImagePlus size={15} style={{ color: 'var(--accent)' }} /> Image {index + 1}</strong>
//                   {image.url && <button onClick={() => clearImage(index)} title="Clear image" style={{ width:'28px', height:'28px', borderRadius:'50%', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={14}/></button>}
//                 </div>
//                 <div style={{ aspectRatio: '4 / 3', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                   {image.url ? <img src={image.url} alt={image.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImagePlus size={28} style={{ color: 'var(--muted)' }} />}
//                 </div>
//                 <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
//                   <input className="input" placeholder="Title" value={image.title} onChange={e => updateImage(index, 'title', e.target.value)} />
//                   <textarea className="input" rows={3} placeholder="Description for this image" value={image.description} onChange={e => updateImage(index, 'description', e.target.value)} style={{ resize: 'vertical' }} />
//                   <input className="input" placeholder="Alt text" value={image.alt} onChange={e => updateImage(index, 'alt', e.target.value)} />
//                   <label className="btn btn-secondary" style={{ justifyContent: 'center', fontSize: '13px', padding: '10px 14px' }}>
//                     <Upload size={15} /> {uploading === index ? 'Uploading...' : 'Upload File'}
//                     <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading !== null || saving} onChange={e => uploadFile(index, e.target.files?.[0])} />
//                   </label>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>
//     </div>
//   )
// }


import { useEffect, useMemo, useState, useCallback } from 'react'
import { deleteDoc, doc, getDocs, collection, serverTimestamp, setDoc } from 'firebase/firestore'
import { Eye, EyeOff, ImagePlus, Save, Trash2, Upload, X } from 'lucide-react'
import Cropper from 'react-easy-crop'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import { SERVICES } from '../utils/services'
import { uploadToCloudinary } from '../utils/cloudinary'

const emptyImage = () => ({ url: '', title: '', description: '', alt: '' })
const emptyImages = () => Array.from({ length: 5 }, emptyImage)

// --- Helper function to generate the cropped image file ---
const getCroppedImg = async (imageSrc, pixelCrop, fileName) => {
  const image = new Image()
  image.src = imageSrc
  await new Promise(resolve => (image.onload = resolve))

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      blob.name = fileName
      resolve(new File([blob], fileName, { type: 'image/jpeg' }))
    }, 'image/jpeg')
  })
}

export default function AdminServices() {
  const [details, setDetails] = useState({})
  const [selectedId, setSelectedId] = useState(SERVICES[0]?.id || '')
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // --- Cropper State ---
  const [cropData, setCropData] = useState(null) // Holds { src, index, fileName }
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  useEffect(() => {
    async function fetchDetails() {
      try {
        const snap = await getDocs(collection(db, 'serviceDetails'))
        const next = {}
        snap.docs.forEach(d => { next[d.id] = { id: d.id, ...d.data() } })
        setDetails(next)
      } catch {
        setError('Could not load service details.')
      }
      setLoading(false)
    }
    fetchDetails()
  }, [])

  const selectedService = useMemo(() => SERVICES.find(s => s.id === selectedId), [selectedId])

  useEffect(() => {
    if (!selectedService) return
    const saved = details[selectedService.id] || {}
    const savedImages = Array.isArray(saved.images) ? saved.images : []
    setForm({
      name: saved.name || selectedService.name,
      summary: saved.summary || selectedService.description,
      description: saved.description || selectedService.description,
      price: saved.price || selectedService.price,
      duration: saved.duration || selectedService.duration,
      active: saved.active !== false,
      images: emptyImages().map((slot, index) => ({ ...slot, ...(savedImages[index] || {}) })),
    })
    setMessage('')
    setError('')
  }, [details, selectedService])

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const updateImage = (index, key, value) => {
    setForm(prev => ({
      ...prev,
      images: prev.images.map((image, i) => i === index ? { ...image, [key]: value } : image),
    }))
  }

  const clearImage = (index) => {
    setForm(prev => ({
      ...prev,
      images: prev.images.map((image, i) => i === index ? emptyImage() : image),
    }))
  }

  // Intercept the file upload to open the cropper
  const handleFileSelect = (index, file) => {
    if (!file) return
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      setCropData({ src: reader.result, index, fileName: file.name })
    })
    reader.readAsDataURL(file)
  }

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  // Process the crop and actually upload to Cloudinary
  const handleCropConfirm = async () => {
    if (!cropData || !croppedAreaPixels) return
    
    setUploading(cropData.index)
    setError('')
    setMessage('')
    const currentIndex = cropData.index
    
    try {
      const croppedFile = await getCroppedImg(cropData.src, croppedAreaPixels, cropData.fileName)
      
      // Close the modal immediately so user sees the "Uploading..." state on the main screen
      setCropData(null) 
      setCrop({ x: 0, y: 0 })
      setZoom(1)

      const url = await uploadToCloudinary(croppedFile)
      updateImage(currentIndex, 'url', url)
      if (!form.images[currentIndex].title) updateImage(currentIndex, 'title', `${form.name} photo ${currentIndex + 1}`)
    } catch (err) {
      setError(err.message || 'Upload failed. Check Cloudinary settings.')
      setCropData(null)
    }
    setUploading(null)
  }

  const save = async () => {
    if (!form || !selectedService) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const cleanImages = form.images
        .map(image => ({
          url: image.url.trim(),
          title: image.title.trim(),
          description: image.description.trim(),
          alt: image.alt.trim(),
        }))
        .filter(image => image.url)
        .slice(0, 5)

      await setDoc(doc(db, 'serviceDetails', selectedService.id), {
        name: form.name.trim(),
        summary: form.summary.trim(),
        description: form.description.trim(),
        price: form.price.trim(),
        duration: form.duration.trim(),
        active: form.active,
        images: cleanImages,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setDetails(prev => ({ ...prev, [selectedService.id]: { ...(prev[selectedService.id] || {}), ...form, images: cleanImages } }))
      setMessage('Service updated.')
    } catch (err) {
      setError(err.message || 'Could not save service.')
    }
    setSaving(false)
  }

  const hideService = async () => {
    if (!selectedService || !confirm(`Hide ${selectedService.name} from the public site?`)) return
    update('active', false)
    setSaving(true)
    try {
      await setDoc(doc(db, 'serviceDetails', selectedService.id), { active: false, updatedAt: serverTimestamp() }, { merge: true })
      setDetails(prev => ({ ...prev, [selectedService.id]: { ...(prev[selectedService.id] || {}), active: false } }))
      setMessage('Service hidden.')
    } catch (err) {
      setError(err.message || 'Could not hide service.')
    }
    setSaving(false)
  }

  const resetService = async () => {
    if (!selectedService || !confirm(`Delete custom content for ${selectedService.name}? The default service will remain.`)) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await deleteDoc(doc(db, 'serviceDetails', selectedService.id))
      setDetails(prev => {
        const next = { ...prev }
        delete next[selectedService.id]
        return next
      })
      setMessage('Custom service content deleted.')
    } catch (err) {
      setError(err.message || 'Could not delete custom content.')
    }
    setSaving(false)
  }

  const L = { fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }

  if (loading || !form) return <div style={{ padding: '28px' }}><Spinner text="Loading services..." /></div>

  return (
    <div style={{ padding: '28px' }}>
      
      {/* --- CROP MODAL OVERLAY --- */}
      {cropData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '90%', maxWidth: '600px', background: 'var(--bg)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--text)' }}>Crop Image</h3>
              <button onClick={() => setCropData(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={20}/></button>
            </div>
            
            <div style={{ position: 'relative', width: '100%', height: '400px', background: '#333' }}>
              <Cropper
                image={cropData.src}
                crop={crop}
                zoom={zoom}
                aspect={4 / 3} // Forces the crop box to be your specific rectangle shape
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div style={{ padding: '16px', display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary" onClick={() => setCropData(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCropConfirm}>Confirm & Upload</button>
            </div>
          </div>
        </div>
      )}
      {/* --------------------------- */}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Services</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Update public service pages with up to 5 images and descriptions.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={hideService} disabled={saving || uploading !== null || form.active === false} className="btn btn-danger" style={{ fontSize: '13px', padding: '10px 16px' }}>
            <EyeOff size={16} /> Hide
          </button>
          <button onClick={resetService} disabled={saving || uploading !== null} className="btn btn-secondary" style={{ fontSize: '13px', padding: '10px 16px' }}>
            <Trash2 size={16} /> Reset
          </button>
          <button onClick={save} disabled={saving || uploading !== null} className="btn btn-primary" style={{ fontSize: '13px', padding: '10px 18px' }}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Service'}
          </button>
        </div>
      </div>

      {(message || error) && (
        <div style={{ background:error ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)', border:`1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.25)'}`, color:error ? '#ef4444' : '#34d399', fontSize:'13px', padding:'12px 14px', borderRadius:'12px', marginBottom:'18px' }}>
          {error || message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: '18px' }} className="admin-services-layout">
        <div className="card" style={{ padding: '10px', alignSelf: 'start' }}>
          {SERVICES.map(service => {
            const saved = details[service.id]
            const active = saved?.active !== false
            const selected = service.id === selectedId
            return (
              <button key={service.id} onClick={() => setSelectedId(service.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '11px', borderRadius: '8px', border: selected ? '1px solid var(--accent-border)' : '1px solid transparent', background: selected ? 'var(--accent-bg)' : 'transparent', color: selected ? 'var(--accent)' : 'var(--text)', cursor: 'pointer', textAlign: 'left', marginBottom: '3px' }}>
                <span style={{ fontSize: '20px' }}>{service.icon}</span>
                <span style={{ flex: 1, fontSize: '13px', fontWeight: 800 }}>{service.name}</span>
                {active ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card" style={{ padding: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={L}>Service Name</label>
                <input className="input" value={form.name} onChange={e => update('name', e.target.value)} />
              </div>
              <div>
                <label style={L}>Price</label>
                <input className="input" value={form.price} onChange={e => update('price', e.target.value)} />
              </div>
              <div>
                <label style={L}>Duration</label>
                <input className="input" value={form.duration} onChange={e => update('duration', e.target.value)} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '9px', color: 'var(--text)', fontSize: '13px', fontWeight: 800, paddingTop: '20px' }}>
                <input type="checkbox" checked={form.active} onChange={e => update('active', e.target.checked)} />
                Show this service publicly
              </label>
            </div>
            <div style={{ marginTop: '14px' }}>
              <label style={L}>Short Summary</label>
              <input className="input" value={form.summary} onChange={e => update('summary', e.target.value)} />
            </div>
            <div style={{ marginTop: '14px' }}>
              <label style={L}>Full Description</label>
              <textarea className="input" rows={4} value={form.description} onChange={e => update('description', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            {form.images.map((image, index) => (
              <div key={index} className="card" style={{ padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <strong style={{ color: 'var(--text)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '7px' }}><ImagePlus size={15} style={{ color: 'var(--accent)' }} /> Image {index + 1}</strong>
                  {image.url && <button onClick={() => clearImage(index)} title="Clear image" style={{ width:'28px', height:'28px', borderRadius:'50%', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={14}/></button>}
                </div>
                <div style={{ aspectRatio: '4 / 3', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {image.url ? <img src={image.url} alt={image.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImagePlus size={28} style={{ color: 'var(--muted)' }} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  <input className="input" placeholder="Title" value={image.title} onChange={e => updateImage(index, 'title', e.target.value)} />
                  <textarea className="input" rows={3} placeholder="Description for this image" value={image.description} onChange={e => updateImage(index, 'description', e.target.value)} style={{ resize: 'vertical' }} />
                  <input className="input" placeholder="Alt text" value={image.alt} onChange={e => updateImage(index, 'alt', e.target.value)} />
                  
                  {/* UPDATE: File input now calls handleFileSelect to open the cropper */}
                  <label className="btn btn-secondary" style={{ justifyContent: 'center', fontSize: '13px', padding: '10px 14px' }}>
                    <Upload size={15} /> {uploading === index ? 'Uploading...' : 'Upload File'}
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                      disabled={uploading !== null || saving} 
                      // Reset the target value so you can upload the same file twice if needed
                      onChange={e => {
                        handleFileSelect(index, e.target.files?.[0]);
                        e.target.value = null; 
                      }} 
                    />
                  </label>
                  
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}