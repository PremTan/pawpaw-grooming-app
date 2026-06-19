// src/admin/AdminReviews.jsx
import { useEffect, useState } from 'react'
import { collection, getDocs, doc, deleteDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import { Trash2 } from 'lucide-react'

function Stars({ value }) {
  return <span>{[1,2,3,4,5].map(n => <span key={n} style={{ color: n<=value ? 'var(--accent)' : 'var(--border)', fontSize:'14px' }}>★</span>)}</span>
}

export default function AdminReviews() {
  const [reviews, setReviews]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState(null)

  const fetchReviews = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'reviews'), orderBy('createdAt','desc')))
      setReviews(snap.docs.map(d => ({ id:d.id, ...d.data() })))
    } catch {}
    setLoading(false)
  }
  useEffect(() => { fetchReviews() }, [])

  const handleDelete = async (id) => {
    if (!confirm('Delete this review?')) return
    setDeleting(id)
    try { await deleteDoc(doc(db, 'reviews', id)); setReviews(prev => prev.filter(r => r.id !== id)) } catch {}
    setDeleting(null)
  }

  const avg = reviews.length ? (reviews.reduce((s,r) => s+(r.rating||5), 0)/reviews.length).toFixed(1) : 0

  return (
    <div style={{ padding:'28px' }}>
      <div style={{ marginBottom:'24px' }}>
        <h1 style={{ fontFamily:'"Playfair Display",serif', fontSize:'28px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Reviews</h1>
        <p style={{ color:'var(--muted)', fontSize:'13px' }}>
          {reviews.length} reviews · Avg rating: <span style={{ color:'var(--accent)', fontWeight:700 }}>{avg}★</span>
        </p>
      </div>

      {loading ? <Spinner text="Loading reviews…" /> : reviews.length === 0 ? (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'14px', padding:'48px', textAlign:'center' }}>
          <p style={{ color:'var(--muted)' }}>No reviews yet.</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          {reviews.map(r => (
            <div key={r.id} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'14px', padding:'18px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:'12px' }}>
                <div style={{ width:'38px', height:'38px', borderRadius:'50%', background:'var(--accent-bg)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
                  {r.userPhoto ? <img src={r.userPhoto} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <span style={{ color:'var(--accent)', fontWeight:700 }}>{r.userName?.[0]?.toUpperCase()}</span>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'8px', marginBottom:'6px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
                      <span style={{ color:'var(--text)', fontWeight:600, fontSize:'14px' }}>{r.userName}</span>
                      {r.petName && <span style={{ color:'var(--muted)', fontSize:'12px' }}>· {r.petName}'s parent</span>}
                      <Stars value={r.rating} />
                    </div>
                    <button onClick={() => handleDelete(r.id)} disabled={deleting===r.id}
                      style={{ background:'none', border:'none', color:'rgba(239,68,68,0.5)', cursor:'pointer', padding:'4px', borderRadius:'6px', transition:'all 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.color='#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color='rgba(239,68,68,0.5)'}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <p style={{ color:'var(--muted)', fontSize:'13px', lineHeight:1.6 }}>{r.comment}</p>
                  <div style={{ display:'flex', gap:'16px', marginTop:'8px', fontSize:'11px', color:'var(--muted)' }}>
                    {r.createdAt?.toDate && <span>{r.createdAt.toDate().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span>}
                    <span style={{ fontFamily:'"DM Mono",monospace' }}>{r.userEmail}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
