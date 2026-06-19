// src/admin/AdminPackages.jsx
import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import { Plus, X, Pencil, Trash2, Package } from 'lucide-react'

const EMPTY = { name:'', description:'', services:[], priceRange:'', price:'', duration:'', active:true }

export default function AdminPackages() {
  const [packages, setPackages] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]  = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [svcInput, setSvcInput] = useState('')

  const fetch = async () => {
    try {
      const snap = await getDocs(collection(db, 'packages'))
      setPackages(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    } catch {}
    setLoading(false)
  }
  useEffect(() => { fetch() }, [])

  const openAdd  = () => { setForm(EMPTY); setEditId(null); setSvcInput(''); setShowModal(true) }
  const openEdit = (pkg) => { setForm({ name:pkg.name, description:pkg.description||'', services:pkg.services||[], priceRange:pkg.priceRange||'', price:pkg.price||'', duration:pkg.duration||'', active:pkg.active!==false }); setEditId(pkg.id); setSvcInput(''); setShowModal(true) }

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
    if (!confirm('Delete this package?')) return
    await deleteDoc(doc(db,'packages',id)); setPackages(p => p.filter(x => x.id!==id))
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

      {loading ? <Spinner text="Loading packages…" /> : packages.length===0 ? (
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
                  <button onClick={() => handleDelete(pkg.id)} style={{ background:'none', border:'none', color:'rgba(239,68,68,0.5)', cursor:'pointer', padding:'4px' }}
                    onMouseEnter={e=>e.currentTarget.style.color='#ef4444'} onMouseLeave={e=>e.currentTarget.style.color='rgba(239,68,68,0.5)'}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>

              {pkg.services?.length > 0 && (
                <div style={{ marginBottom:'14px' }}>
                  {pkg.services.map((s,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', padding:'4px 0', borderBottom:i<pkg.services.length-1?'1px solid var(--border)':'none' }}>
                      <span style={{ color:'var(--accent)', fontSize:'11px' }}>✓</span>
                      <span style={{ color:'var(--text)', fontSize:'13px' }}>{s}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
                <div>
                  <div style={{ color:'var(--accent)', fontFamily:'"DM Mono",monospace', fontWeight:800, fontSize:'18px' }}>{pkg.priceRange || (pkg.price ? `₹${pkg.price}` : 'Price TBD')}</div>
                  {pkg.duration && <div style={{ color:'var(--muted)', fontSize:'11px', marginTop:'2px' }}>⏱ {pkg.duration}</div>}
                </div>
                <button onClick={() => toggleActive(pkg)}
                  style={{ padding:'5px 14px', borderRadius:'999px', fontSize:'11px', fontWeight:700, cursor:'pointer', border:'none', background: pkg.active!==false ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)', color: pkg.active!==false ? '#34d399' : '#ef4444' }}
                >
                  {pkg.active!==false ? '● Active' : '● Inactive'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
                  <label style={L}>Package Name *</label>
                  <input className="input" placeholder="e.g. Premium Grooming Bundle" value={form.name} onChange={e => setForm(p => ({ ...p, name:e.target.value }))} />
                </div>
                <div>
                  <label style={L}>Description</label>
                  <textarea className="input" style={{ resize:'none' }} rows={2} placeholder="What's included…" value={form.description} onChange={e => setForm(p => ({ ...p, description:e.target.value }))} />
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
                    <input className="input" placeholder="e.g. ₹800 – ₹1500" value={form.priceRange} onChange={e => setForm(p => ({ ...p, priceRange:e.target.value }))} />
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
                    {saving ? 'Saving…' : editId ? 'Update Package' : 'Create Package'}
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
