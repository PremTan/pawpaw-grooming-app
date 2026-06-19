// src/admin/AdminDashboard.jsx
import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { SERVICES, TIME_SLOTS, PET_TYPES, BOOKING_STATUS, WHATSAPP_NUMBER } from '../utils/services'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import { Calendar, Star, TrendingUp, IndianRupee, Plus, X, UserCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { format, startOfToday } from 'date-fns'
import { calculatePublicStats } from '../utils/publicStats'

const EMPTY = { ownerName:'', phone:'', petName:'', petType:'Dog', petBreed:'', serviceId:'', date:format(startOfToday(),'yyyy-MM-dd'), slot:'', notes:'', amountCollected:'' }

export default function AdminDashboard() {
  const { user } = useAuth()
  const [data, setData]   = useState({ totalBookings:0,pending:0,confirmed:0,completed:0,cancelled:0,totalReviews:0,avgRating:0,byService:{},recentBookings:[],totalEarnings:0,todayEarnings:0,earningsByService:{} })
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [walkin, setWalkin]   = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const today = format(startOfToday(),'yyyy-MM-dd')

  const fetchData = async () => {
    try {
      // Save admin UID to settings so users can be notified
      if (user?.uid) {
        await setDoc(doc(db,'settings','general'), { adminUid: user.uid }, { merge:true })
      }
      const [bSnap, rSnap] = await Promise.all([getDocs(collection(db,'bookings')), getDocs(collection(db,'reviews'))])
      const bookings = bSnap.docs.map(d => ({ id:d.id, ...d.data() }))
      const reviews  = rSnap.docs.map(d => d.data())
      const byService={}, earningsByService={}
      let totalEarnings=0, todayEarnings=0
      bookings.forEach(b => {
        if (b.serviceId) byService[b.serviceId] = (byService[b.serviceId]||0)+1
        if (b.status==='completed' && b.amountCollected) {
          const amt = parseFloat(b.amountCollected)||0
          totalEarnings += amt
          earningsByService[b.serviceId] = (earningsByService[b.serviceId]||0)+amt
          if (b.date===today) todayEarnings += amt
        }
      })
      const avgRating = reviews.length ? (reviews.reduce((s,r) => s+(r.rating||5),0)/reviews.length).toFixed(1) : 0
      const sorted = [...bookings].sort((a,b) => (b.createdAt?.toMillis?.()??0)-(a.createdAt?.toMillis?.()??0))
      setData({ totalBookings:bookings.length, pending:bookings.filter(b=>b.status==='pending').length, confirmed:bookings.filter(b=>b.status==='confirmed').length, completed:bookings.filter(b=>b.status==='completed').length, cancelled:bookings.filter(b=>b.status==='cancelled').length, totalReviews:reviews.length, avgRating, byService, recentBookings:sorted.slice(0,5), totalEarnings, todayEarnings, earningsByService })
      const publicStats = calculatePublicStats(bookings, reviews)
      await Promise.all([
        setDoc(doc(db,'settings','homeStats'), {
          ...publicStats,
          updatedAt: serverTimestamp(),
        }, { merge:true }),
        setDoc(doc(db,'settings','general'), {
          publicStats,
          totalBookings: publicStats.totalBookings,
          totalReviews: publicStats.totalReviews,
          avgRating: publicStats.avgRating,
          daysOpen: publicStats.daysOpen,
          statsUpdatedAt: serverTimestamp(),
        }, { merge:true }),
      ])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const upd = (k,v) => setWalkin(p => ({ ...p, [k]:v }))

  const handleSave = async () => {
    const { ownerName,phone,petName,serviceId,date,slot } = walkin
    if (!ownerName||!phone||!petName||!serviceId||!date||!slot) { setError('Please fill all required fields *'); return }
    setSaving(true); setError('')
    try {
      const svc = SERVICES.find(s => s.id===serviceId)
      await addDoc(collection(db,'bookings'), {
        ...walkin,
        amountCollected: walkin.amountCollected ? parseFloat(walkin.amountCollected) : '',
        serviceName: svc?.name||'',
        userId:'walkin', userEmail:'walkin@offline', isWalkIn:true,
        status: walkin.amountCollected ? BOOKING_STATUS.COMPLETED : BOOKING_STATUS.CONFIRMED,
        createdAt: serverTimestamp(),
      })
      setSuccess(true); setWalkin(EMPTY); await fetchData()
      setTimeout(() => { setSuccess(false); setShowModal(false) }, 2000)
    } catch { setError('Failed to save. Try again.') }
    setSaving(false)
  }

  const maxCount = Math.max(...Object.values(data.byService), 1)
  const statCards = [
    { label:'Total Bookings',   value:data.totalBookings,                                 icon:<Calendar size={20}/>,     color:'var(--accent)' },
    { label:'Pending',          value:data.pending,                                       icon:<TrendingUp size={20}/>,   color:'#fbbf24' },
    { label:'Total Earnings',   value:`₹${data.totalEarnings.toLocaleString('en-IN')}`,  icon:<IndianRupee size={20}/>,  color:'#34d399' },
    { label:"Today's Earnings", value:`₹${data.todayEarnings.toLocaleString('en-IN')}`,  icon:<IndianRupee size={20}/>,  color:'#60a5fa' },
    { label:'Avg Rating',       value:data.avgRating ? `${data.avgRating}★` : 'N/A',     icon:<Star size={20}/>,         color:'#f472b6' },
    { label:'Total Reviews',    value:data.totalReviews,                                  icon:<Star size={20}/>,         color:'#a78bfa' },
  ]

  return (
    <div className="admin-page admin-dashboard">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontFamily:'"Playfair Display",serif', fontSize:'28px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Dashboard</h1>
          <p style={{ color:'var(--muted)', fontSize:'13px' }}>Overview of Paw Paw Grooming Centre</p>
        </div>
        <button onClick={() => { setShowModal(true); setSuccess(false); setError('') }} className="btn btn-primary" style={{ fontSize:'13px', padding:'10px 18px' }}>
          <Plus size={16}/> Add Walk-in
        </button>
      </div>

      {loading ? <Spinner text="Loading dashboard…" /> : (
        <>
          {/* Stat cards */}
          <div className="admin-stats-grid">
            {statCards.map((s,i) => (
              <div key={i} className="stat-card">
                <div style={{ color:s.color, marginBottom:'10px' }}>{s.icon}</div>
                <div style={{ fontSize:'24px', fontWeight:800, color:'var(--text)', fontFamily:'"Playfair Display",serif' }}>{s.value}</div>
                <div style={{ color:'var(--muted)', fontSize:'12px', marginTop:'3px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Status pills */}
          <div className="admin-status-grid">
            {[{l:'Pending',v:data.pending,c:'badge-pending'},{l:'Confirmed',v:data.confirmed,c:'badge-confirmed'},{l:'Completed',v:data.completed,c:'badge-completed'},{l:'Cancelled',v:data.cancelled,c:'badge-cancelled'}].map(s => (
              <div key={s.l} className={`badge ${s.c}`} style={{ padding:'12px', borderRadius:'12px', textAlign:'center', display:'block' }}>
                <div style={{ fontSize:'22px', fontWeight:800 }}>{s.v}</div>
                <div style={{ fontSize:'11px', marginTop:'2px' }}>{s.l}</div>
              </div>
            ))}
          </div>

          <div className="admin-dashboard-grid">
            {/* By service */}
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'16px', padding:'22px' }}>
              <h2 style={{ fontWeight:700, color:'var(--text)', fontSize:'15px', marginBottom:'18px' }}>Bookings & Earnings by Service</h2>
              {SERVICES.map(s => {
                const cnt = data.byService[s.id]||0
                const earned = data.earningsByService[s.id]||0
                return (
                  <div key={s.id} style={{ marginBottom:'14px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'5px' }}>
                      <span style={{ color:'var(--muted)', display:'flex', alignItems:'center', gap:'6px' }}><span>{s.icon}</span>{s.name}</span>
                      <div style={{ display:'flex', gap:'10px' }}>
                        {earned>0 && <span style={{ color:'#34d399', fontFamily:'"DM Mono",monospace', fontSize:'11px' }}>₹{earned.toLocaleString('en-IN')}</span>}
                        <span style={{ color:'var(--accent)', fontFamily:'"DM Mono",monospace', fontWeight:700 }}>{cnt}</span>
                      </div>
                    </div>
                    <div style={{ height:'4px', background:'var(--border)', borderRadius:'2px', overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:'2px', background:s.color, width:`${(cnt/maxCount)*100}%`, transition:'width 1s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Recent bookings */}
            <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'16px', padding:'22px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
                <h2 style={{ fontWeight:700, color:'var(--text)', fontSize:'15px' }}>Recent Bookings</h2>
                <Link to="/admin/bookings" style={{ color:'var(--accent)', fontSize:'12px', textDecoration:'none' }}>View all →</Link>
              </div>
              {data.recentBookings.length===0 ? <p style={{ color:'var(--muted)', fontSize:'13px' }}>No bookings yet.</p> : (
                data.recentBookings.map(b => (
                  <div key={b.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                    <div>
                      <p style={{ color:'var(--text)', fontSize:'13px', fontWeight:600, display:'flex', alignItems:'center', gap:'6px' }}>
                        {b.ownerName}
                        {b.isWalkIn && <span className="badge badge-walkin" style={{ fontSize:'9px' }}>Walk-in</span>}
                      </p>
                      <p style={{ color:'var(--muted)', fontSize:'11px' }}>{b.serviceName} · {b.petName}</p>
                      <p style={{ color:'var(--muted)', fontSize:'11px' }}>{b.date} · {b.slot}</p>
                      {b.amountCollected>0 && <p style={{ color:'#34d399', fontSize:'11px', fontFamily:'"DM Mono",monospace' }}>₹{parseFloat(b.amountCollected).toLocaleString('en-IN')}</p>}
                    </div>
                    <span className={`badge ${b.status==='pending'?'badge-pending':b.status==='confirmed'?'badge-confirmed':b.status==='completed'?'badge-completed':'badge-cancelled'}`} style={{ textTransform:'capitalize', fontSize:'10px' }}>{b.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Walk-in Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" style={{ maxWidth:'560px' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:'24px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
                <div>
                  <h2 style={{ fontFamily:'"Playfair Display",serif', fontWeight:700, fontSize:'20px', color:'var(--text)' }}>Add Walk-in / Offline</h2>
                  <p style={{ color:'var(--muted)', fontSize:'12px', marginTop:'3px' }}>Record an offline or phone appointment</p>
                </div>
                <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}><X size={20}/></button>
              </div>

              {success && <div style={{ background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.2)', color:'#34d399', fontSize:'13px', padding:'12px', borderRadius:'10px', marginBottom:'16px' }}>✓ Walk-in booking saved!</div>}
              {error   && <div style={{ background:'rgba(239,68,68,0.1)',  border:'1px solid rgba(239,68,68,0.2)',  color:'#ef4444', fontSize:'13px', padding:'12px', borderRadius:'10px', marginBottom:'16px' }}>{error}</div>}

              <div style={{ background:'var(--accent-bg)', border:'1px solid var(--accent-border)', borderRadius:'10px', padding:'12px', marginBottom:'20px', display:'flex', gap:'10px' }}>
                <UserCheck size={16} style={{ color:'var(--accent)', flexShrink:0, marginTop:'1px' }}/>
                <p style={{ color:'var(--muted)', fontSize:'12px', lineHeight:1.6 }}>
                  This booking is marked as <strong style={{ color:'var(--accent)' }}>Walk-in</strong>. If amount is entered, status auto-sets to <strong style={{ color:'var(--accent)' }}>Completed</strong>.
                </p>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                <div className="admin-form-grid">
                  <div>
                    <label style={{ fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }}>Owner Name *</label>
                    <input className="input" placeholder="Full name" value={walkin.ownerName} onChange={e => upd('ownerName',e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }}>Phone *</label>
                    <input className="input" placeholder="10-digit" maxLength={10} value={walkin.phone} onChange={e => upd('phone',e.target.value)} />
                  </div>
                </div>
                <div className="admin-form-grid">
                  <div>
                    <label style={{ fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }}>Pet Name *</label>
                    <input className="input" placeholder="e.g. Bruno" value={walkin.petName} onChange={e => upd('petName',e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }}>Pet Type</label>
                    <select className="input" value={walkin.petType} onChange={e => upd('petType',e.target.value)}>
                      {PET_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }}>Service *</label>
                  <select className="input" value={walkin.serviceId} onChange={e => upd('serviceId',e.target.value)}>
                    <option value="">Select a service</option>
                    {SERVICES.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name} — {s.price}</option>)}
                  </select>
                </div>
                <div className="admin-form-grid">
                  <div>
                    <label style={{ fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }}>Date *</label>
                    <input type="date" className="input" value={walkin.date} onChange={e => upd('date',e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }}>Time Slot *</label>
                    <select className="input" value={walkin.slot} onChange={e => upd('slot',e.target.value)}>
                      <option value="">Select slot</option>
                      {TIME_SLOTS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }}>
                    Amount Collected (₹) <span style={{ color:'var(--muted)', fontWeight:400, textTransform:'none' }}>— leave empty if not collected yet</span>
                  </label>
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }}>₹</span>
                    <input className="input" style={{ paddingLeft:'28px' }} type="number" min="0" placeholder="e.g. 600" value={walkin.amountCollected} onChange={e => upd('amountCollected',e.target.value)} />
                  </div>
                  {walkin.amountCollected && <p style={{ color:'#34d399', fontSize:'12px', marginTop:'6px' }}>✓ Status will auto-set to Completed</p>}
                </div>
                <div>
                  <label style={{ fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }}>Notes (optional)</label>
                  <textarea className="input" style={{ resize:'none' }} rows={2} placeholder="Any notes…" value={walkin.notes} onChange={e => upd('notes',e.target.value)} />
                </div>
                <div style={{ display:'flex', gap:'10px', paddingTop:'4px' }}>
                  <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}>Cancel</button>
                  <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}>
                    {saving ? 'Saving…' : 'Save Booking'}
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

