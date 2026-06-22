// src/pages/Reviews.jsx
import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import { Send } from 'lucide-react'

function Stars({ value, onChange, readonly = false }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" disabled={readonly} onClick={() => !readonly && onChange?.(n)}
          onMouseEnter={() => !readonly && setHover(n)} onMouseLeave={() => !readonly && setHover(0)}
          style={{ fontSize: '24px', background: 'none', border: 'none', cursor: readonly ? 'default' : 'pointer', color: (hover || value) >= n ? 'var(--accent)' : 'var(--border)', transition: 'all 0.1s', transform: !readonly && hover === n ? 'scale(1.2)' : 'scale(1)' }}
        >★</button>
      ))}
    </div>
  )
}

export default function Reviews() {
  const { user, isBlocked } = useAuth()
  const [reviews, setReviews]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [form, setForm]         = useState({ rating: 5, comment: '', petName: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)

  const fetchReviews = async () => {
    try {
      const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'))
      setReviews((await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {}
    setLoading(false)
  }
  useEffect(() => { fetchReviews() }, [])

  const avgRating = reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 5), 0) / reviews.length).toFixed(1) : '5.0'
  const dist = [5,4,3,2,1].map(n => ({ n, count: reviews.filter(r => r.rating === n).length, pct: reviews.length ? Math.round((reviews.filter(r => r.rating === n).length / reviews.length) * 100) : 0 }))

  const handleSubmit = async () => {
    if (isBlocked || !form.comment.trim() || !user) return
    setSubmitting(true)
    try {
      await addDoc(collection(db, 'reviews'), {
        userId: user.uid, userEmail: user.email || '',
        userName: user.displayName || user.email?.split('@')[0] || 'Pet Parent',
        userPhoto: user.photoURL || '',
        rating: form.rating, comment: form.comment.trim(), petName: form.petName,
        createdAt: serverTimestamp(),
      })
      setSubmitted(true); setForm({ rating: 5, comment: '', petName: '' })
      await fetchReviews()
    } catch {}
    setSubmitting(false)
  }

  const L = { fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '6px' }

  return (
    <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 20px 80px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p className="section-label" style={{ marginBottom: '10px' }}>Customer Feedback</p>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: 'clamp(32px,5vw,52px)', fontWeight: 800, color: 'var(--text)' }}>Reviews</h1>
        </div>

        {/* Summary */}
        {reviews.length > 0 && (
          <div className="card" style={{ padding: '28px', marginBottom: '28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: '"Playfair Display",serif', fontSize: '72px', fontWeight: 900, background: 'var(--gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>{avgRating}</div>
              <Stars value={Math.round(parseFloat(avgRating))} readonly />
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '8px' }}>{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
              {dist.map(({ n, count, pct }) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: 'var(--muted)', fontSize: '12px', width: '8px', textAlign: 'right' }}>{n}</span>
                  <span style={{ color: 'var(--accent)', fontSize: '11px' }}>★</span>
                  <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--accent)', borderRadius: '3px', width: `${pct}%`, transition: 'width 0.8s ease' }} />
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: '11px', width: '20px' }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        {user ? (
          <div className="card" style={{ padding: '28px', marginBottom: '28px' }}>
            <h2 style={{ fontFamily: '"Playfair Display",serif', fontWeight: 700, fontSize: '20px', color: 'var(--text)', marginBottom: '20px' }}>Leave a Review</h2>
            {isBlocked && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444', fontSize: '13px', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px' }}>
                Your account is blocked from publishing reviews.
              </div>
            )}
            {submitted && (
              <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399', fontSize: '13px', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px' }}>
                ✓ Thank you! Your review has been published.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div><label style={L}>Your Rating</label><Stars value={form.rating} onChange={v => setForm(p => ({ ...p, rating: v }))} /></div>
              <div>
                <label style={L}>Pet's Name (optional)</label>
                <input className="input" placeholder="e.g. Bruno" value={form.petName} onChange={e => setForm(p => ({ ...p, petName: e.target.value }))} />
              </div>
              <div>
                <label style={L}>Your Review *</label>
                <textarea className="input" style={{ resize: 'none' }} rows={4} placeholder="Share your experience at Paw Paw Pet Grooming..." value={form.comment} onChange={e => setForm(p => ({ ...p, comment: e.target.value }))} />
              </div>
              <button onClick={handleSubmit} disabled={isBlocked || submitting || !form.comment.trim()} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                <Send size={15} /> {submitting ? 'Submitting…' : 'Submit Review'}
              </button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: '28px', marginBottom: '28px', textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', marginBottom: '16px' }}>Login to leave a review</p>
            <a href="/login" className="btn btn-primary" style={{ display: 'inline-flex' }}>Login to Review</a>
          </div>
        )}

        {/* Reviews list */}
        {loading ? <Spinner text="Loading reviews..." /> : reviews.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted)' }}>No reviews yet. Be the first!</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {reviews.map(r => (
              <div key={r.id} className="card" style={{ padding: '22px' }}>
                <div style={{ display: 'flex', gap: '14px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {r.userPhoto ? <img src={r.userPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '16px' }}>{r.userName?.[0]?.toUpperCase()}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '14px' }}>{r.userName}</span>
                        {r.petName && <span style={{ color: 'var(--muted)', fontSize: '12px', marginLeft: '8px' }}>· {r.petName}'s parent</span>}
                      </div>
                      <Stars value={r.rating} readonly />
                    </div>
                    <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.7 }}>"{r.comment}"</p>
                    {r.createdAt?.toDate && (
                      <p style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '8px' }}>
                        {r.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
