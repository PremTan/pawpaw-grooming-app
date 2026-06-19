// src/admin/AdminBookings.jsx
import { useEffect, useState } from 'react'
import { collection, getDocs, doc, updateDoc, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import { SERVICES, WHATSAPP_NUMBER, buildWhatsAppMessage } from '../utils/services'
import { useNotifications } from '../context/NotificationContext'
import Spinner from '../components/Spinner'
import { Search, IndianRupee, MessageCircle } from 'lucide-react'
import { syncPublicStats } from '../utils/publicStats'

const STATUS_OPTS = ['all','pending','confirmed','completed','cancelled']
const BADGE = { pending:'badge-pending', confirmed:'badge-confirmed', completed:'badge-completed', cancelled:'badge-cancelled' }

export default function AdminBookings() {
  const { sendNotification } = useNotifications()
  const [bookings, setBookings]   = useState([])
  const [filtered, setFiltered]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [statusF, setStatusF]     = useState('all')
  const [serviceF, setServiceF]   = useState('all')
  const [updating, setUpdating]   = useState(null)
  // Cash modal
  const [cashModal, setCashModal] = useState(null) // booking obj
  const [cashAmt, setCashAmt]     = useState('')

  const fetchBookings = async () => {
    try {
      const q = query(collection(db, 'bookings'), orderBy('createdAt','desc'))
      const snap = await getDocs(q)
      setBookings(snap.docs.map(d => ({ id:d.id, ...d.data() })))
      await syncPublicStats(db)
    } catch {
      // fallback without orderBy
      try {
        const snap = await getDocs(collection(db, 'bookings'))
        const r = snap.docs.map(d => ({ id:d.id, ...d.data() }))
        r.sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        setBookings(r)
        await syncPublicStats(db)
      } catch {}
    }
    setLoading(false)
  }

  useEffect(() => { fetchBookings() }, [])

  useEffect(() => {
    let r = [...bookings]
    if (statusF  !== 'all') r = r.filter(b => b.status  === statusF)
    if (serviceF !== 'all') r = r.filter(b => b.serviceId === serviceF)
    if (search.trim()) {
      const s = search.toLowerCase()
      r = r.filter(b => b.ownerName?.toLowerCase().includes(s) || b.petName?.toLowerCase().includes(s) || b.phone?.includes(s) || b.serviceName?.toLowerCase().includes(s))
    }
    setFiltered(r)
  }, [bookings, statusF, serviceF, search])

  const updateStatus = async (b, status) => {
    if (status === 'completed') { setCashModal(b); setCashAmt(''); return }
    setUpdating(b.id)
    try {
      await updateDoc(doc(db, 'bookings', b.id), { status })
      setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status } : x))
      // notify user
      if (b.userId && b.userId !== 'walkin') {
        const msgs = { confirmed:'Your booking has been confirmed! ✅', cancelled:'Your booking was cancelled. ❌' }
        if (msgs[status]) await sendNotification(b.userId, { title:`Booking ${status}`, message:`${b.serviceName} on ${b.date} at ${b.slot} — ${msgs[status]}`, type:status, bookingId:b.id })
      }
    } catch {}
    setUpdating(null)
  }

  const handleComplete = async () => {
    if (!cashModal) return
    setUpdating(cashModal.id)
    const amt = parseFloat(cashAmt) || 0
    try {
      await updateDoc(doc(db, 'bookings', cashModal.id), { status:'completed', amountCollected: amt })
      setBookings(prev => prev.map(x => x.id === cashModal.id ? { ...x, status:'completed', amountCollected: amt } : x))
      if (cashModal.userId && cashModal.userId !== 'walkin') {
        await sendNotification(cashModal.userId, { title:'Appointment Completed 🎉', message:`${cashModal.serviceName} for ${cashModal.petName} completed. Thank you!`, type:'completed', bookingId:cashModal.id })
      }
    } catch {}
    setCashModal(null); setCashAmt(''); setUpdating(null)
  }

  const S = {
    page: { padding:'28px' },
    filters: { display:'flex', flexWrap:'wrap', gap:'10px', marginBottom:'20px' },
    input: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', color:'var(--text)', padding:'9px 12px 9px 36px', fontSize:'13px', outline:'none', flex:1, minWidth:'200px' },
    select: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', color:'var(--text)', padding:'9px 12px', fontSize:'13px', outline:'none' },
    card: { background:'var(--card)', border:'1px solid var(--border)', borderRadius:'14px', padding:'18px', marginBottom:'12px' },
    actionBtn: (color, bg) => ({ padding:'5px 12px', borderRadius:'8px', fontSize:'11px', fontWeight:600, cursor:'pointer', border:`1px solid ${color}`, background:bg, color, transition:'all 0.15s' }),
  }

  const totalEarnings = bookings.filter(b => b.status==='completed' && b.amountCollected).reduce((s,b) => s + (parseFloat(b.amountCollected)||0), 0)

  return (
    <div style={S.page}>
      <div style={{ marginBottom:'24px' }}>
        <h1 style={{ fontFamily:'"Playfair Display",serif', fontSize:'28px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Bookings</h1>
        <p style={{ color:'var(--muted)', fontSize:'13px' }}>
          {filtered.length} of {bookings.length} bookings
          {totalEarnings > 0 && <span style={{ marginLeft:'16px', color:'#34d399', fontFamily:'"DM Mono",monospace', fontWeight:700 }}>Total Collected: ₹{totalEarnings.toLocaleString('en-IN')}</span>}
        </p>
      </div>

      {/* Filters */}
      <div style={S.filters}>
        <div style={{ position:'relative', flex:1, minWidth:'200px' }}>
          <Search size={14} style={{ position:'absolute', left:'10px', top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }} />
          <input style={S.input} placeholder="Search name, pet, phone…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select style={S.select} value={statusF} onChange={e => setStatusF(e.target.value)}>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s==='all'?'All Status':s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
        </select>
        <select style={S.select} value={serviceF} onChange={e => setServiceF(e.target.value)}>
          <option value="all">All Services</option>
          {SERVICES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {loading ? <Spinner text="Loading bookings…" /> : filtered.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:'48px' }}>
          <p style={{ color:'var(--muted)' }}>No bookings found.</p>
        </div>
      ) : (
        filtered.map(b => (
          <div key={b.id} style={S.card}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'4px' }}>
                  <span style={{ color:'var(--text)', fontWeight:700, fontSize:'15px' }}>{b.ownerName}</span>
                  <span style={{ color:'var(--muted)', fontSize:'11px', fontFamily:'"DM Mono",monospace' }}>#{b.id.slice(0,8).toUpperCase()}</span>
                  {b.isWalkIn && <span className="badge badge-walkin">Walk-in</span>}
                </div>
                <p style={{ color:'var(--muted)', fontSize:'13px', marginBottom:'6px' }}>
                  🐾 {b.petName} ({b.petType}{b.petBreed ? `, ${b.petBreed}` : ''}) · ✂️ {b.serviceName}
                  {b.packageNames?.length > 0 && <span style={{ color:'var(--accent)' }}> + {b.packageNames.join(', ')}</span>}
                </p>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'14px', fontSize:'12px', color:'var(--muted)' }}>
                  <span>📅 {b.date}</span>
                  <span>🕐 {b.slot}</span>
                  <span>📞 {b.phone}</span>
                  {b.amountCollected > 0 && <span style={{ color:'#34d399', fontFamily:'"DM Mono",monospace', fontWeight:700 }}>₹{parseFloat(b.amountCollected).toLocaleString('en-IN')} collected</span>}
                </div>
                {b.notes && <p style={{ color:'var(--muted)', fontSize:'12px', marginTop:'6px', fontStyle:'italic' }}>"{b.notes}"</p>}
              </div>

              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'8px', flexShrink:0 }}>
                <span className={`badge ${BADGE[b.status] || 'badge-pending'}`} style={{ textTransform:'capitalize' }}>{b.status}</span>

                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', justifyContent:'flex-end' }}>
                  {b.status==='pending' && (
                    <button onClick={() => updateStatus(b,'confirmed')} disabled={updating===b.id}
                      style={S.actionBtn('rgba(52,211,153,1)','rgba(52,211,153,0.1)')}>Confirm</button>
                  )}
                  {['pending','confirmed'].includes(b.status) && (
                    <button onClick={() => updateStatus(b,'completed')} disabled={updating===b.id}
                      style={S.actionBtn('var(--accent)','var(--accent-bg)')}>
                      <IndianRupee size={11} style={{ display:'inline', marginRight:'2px' }} />Complete
                    </button>
                  )}
                  {!['cancelled','completed'].includes(b.status) && (
                    <button onClick={() => updateStatus(b,'cancelled')} disabled={updating===b.id}
                      style={S.actionBtn('#ef4444','rgba(239,68,68,0.1)')}>Cancel</button>
                  )}
                  {/* WhatsApp */}
                  <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${buildWhatsAppMessage(b)}`} target="_blank" rel="noopener noreferrer"
                    style={{ ...S.actionBtn('#25D366','rgba(37,211,102,0.1)'), display:'flex', alignItems:'center', gap:'3px', textDecoration:'none' }}>
                    <MessageCircle size={11} /> WA
                  </a>
                </div>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Cash Collected Modal */}
      {cashModal && (
        <div className="modal-overlay" onClick={() => setCashModal(null)}>
          <div className="modal-box" style={{ maxWidth:'400px' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:'24px' }}>
              <h2 style={{ fontFamily:'"Playfair Display",serif', fontWeight:700, fontSize:'20px', color:'var(--text)', marginBottom:'6px' }}>Complete Appointment</h2>
              <p style={{ color:'var(--muted)', fontSize:'13px', marginBottom:'24px' }}>
                {cashModal.ownerName} · {cashModal.serviceName} · {cashModal.date}
              </p>
              <label style={{ fontSize:'11px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'8px' }}>
                Cash Collected (₹) *
              </label>
              <div style={{ position:'relative', marginBottom:'20px' }}>
                <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'var(--muted)', fontFamily:'"DM Mono",monospace' }}>₹</span>
                <input className="input" style={{ paddingLeft:'28px' }} type="number" min="0" placeholder="e.g. 600" value={cashAmt} onChange={e => setCashAmt(e.target.value)} autoFocus />
              </div>
              {cashAmt && <p style={{ color:'#34d399', fontSize:'12px', marginBottom:'16px' }}>✓ ₹{parseFloat(cashAmt).toLocaleString('en-IN')} will be recorded</p>}
              <div style={{ display:'flex', gap:'10px' }}>
                <button onClick={() => setCashModal(null)} className="btn btn-secondary" style={{ flex:1, justifyContent:'center' }}>Cancel</button>
                <button onClick={handleComplete} className="btn btn-primary" style={{ flex:1, justifyContent:'center' }}>
                  Mark Complete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
