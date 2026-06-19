// src/admin/AdminCustomers.jsx
import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import { Search, ChevronRight, X } from 'lucide-react'

export default function AdminCustomers() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null) // customer detail modal

  useEffect(() => {
    async function fetch() {
      try {
        const snap = await getDocs(collection(db, 'bookings'))
        setBookings(snap.docs.map(d => ({ id:d.id, ...d.data() })))
      } catch {}
      setLoading(false)
    }
    fetch()
  }, [])

  // Group bookings by customer (phone number)
  const customerMap = {}
  bookings.forEach(b => {
    const key = b.phone || b.userId || 'unknown'
    if (!customerMap[key]) {
      customerMap[key] = {
        phone: b.phone,
        ownerName: b.ownerName,
        userId: b.userId,
        isWalkIn: b.isWalkIn,
        bookings: [],
        pets: new Set(),
        totalSpent: 0,
      }
    }
    customerMap[key].bookings.push(b)
    if (b.petName) customerMap[key].pets.add(`${b.petName} (${b.petType})`)
    if (b.amountCollected) customerMap[key].totalSpent += parseFloat(b.amountCollected) || 0
    // Keep most recent name
    if (b.ownerName) customerMap[key].ownerName = b.ownerName
    if (!b.isWalkIn) customerMap[key].isWalkIn = false
  })

  let customers = Object.values(customerMap).sort((a,b) => b.bookings.length - a.bookings.length)

  if (search.trim()) {
    const s = search.toLowerCase()
    customers = customers.filter(c => c.ownerName?.toLowerCase().includes(s) || c.phone?.includes(s))
  }

  const sel = selected ? customers.find(c => c.phone === selected) : null

  return (
    <div style={{ padding:'28px' }}>
      <div style={{ marginBottom:'24px' }}>
        <h1 style={{ fontFamily:'"Playfair Display",serif', fontSize:'28px', fontWeight:800, color:'var(--text)', marginBottom:'4px' }}>Customers</h1>
        <p style={{ color:'var(--muted)', fontSize:'13px' }}>{customers.length} unique customers</p>
      </div>

      {/* Search */}
      <div style={{ position:'relative', maxWidth:'400px', marginBottom:'20px' }}>
        <Search size={14} style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }} />
        <input className="input" style={{ paddingLeft:'36px' }} placeholder="Search by name or phone…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <Spinner text="Loading customers…" /> : customers.length === 0 ? (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'14px', padding:'48px', textAlign:'center' }}>
          <p style={{ color:'var(--muted)' }}>No customers yet.</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {customers.map(c => (
            <div key={c.phone} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'14px', padding:'16px 18px', cursor:'pointer', transition:'all 0.2s' }}
              onClick={() => setSelected(c.phone)}
              onMouseEnter={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)' }}
            >
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
                  <div style={{ width:'44px', height:'44px', borderRadius:'50%', background:'var(--accent-bg)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ color:'var(--accent)', fontWeight:800, fontSize:'18px' }}>{c.ownerName?.[0]?.toUpperCase() || '?'}</span>
                  </div>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
                      <span style={{ color:'var(--text)', fontWeight:700, fontSize:'15px' }}>{c.ownerName || 'Unknown'}</span>
                      {c.isWalkIn === false
                        ? <span className="badge badge-online">Online</span>
                        : <span className="badge badge-walkin">Walk-in</span>
                      }
                    </div>
                    <p style={{ color:'var(--muted)', fontSize:'12px', marginTop:'2px' }}>📞 {c.phone} · {[...c.pets].slice(0,2).join(', ')}{c.pets.size>2?` +${c.pets.size-2} more`:''}</p>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'20px', flexShrink:0 }}>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ color:'var(--text)', fontWeight:700, fontSize:'18px' }}>{c.bookings.length}</div>
                    <div style={{ color:'var(--muted)', fontSize:'11px' }}>Bookings</div>
                  </div>
                  {c.totalSpent > 0 && (
                    <div style={{ textAlign:'center' }}>
                      <div style={{ color:'#34d399', fontWeight:700, fontSize:'16px', fontFamily:'"DM Mono",monospace' }}>₹{c.totalSpent.toLocaleString('en-IN')}</div>
                      <div style={{ color:'var(--muted)', fontSize:'11px' }}>Spent</div>
                    </div>
                  )}
                  <ChevronRight size={18} style={{ color:'var(--muted)' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Customer Detail Modal */}
      {sel && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-box" style={{ maxWidth:'600px' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:'24px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
                  <div style={{ width:'52px', height:'52px', borderRadius:'50%', background:'var(--gradient)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ color:'#000', fontWeight:800, fontSize:'22px' }}>{sel.ownerName?.[0]?.toUpperCase()}</span>
                  </div>
                  <div>
                    <h2 style={{ fontFamily:'"Playfair Display",serif', fontWeight:700, fontSize:'20px', color:'var(--text)' }}>{sel.ownerName}</h2>
                    <p style={{ color:'var(--muted)', fontSize:'13px' }}>📞 {sel.phone}</p>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}><X size={20}/></button>
              </div>

              {/* Stats */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px', marginBottom:'20px' }}>
                {[
                  { label:'Total Bookings', value:sel.bookings.length },
                  { label:'Total Spent',    value:`₹${sel.totalSpent.toLocaleString('en-IN')}`, color:'#34d399' },
                  { label:'Pets',           value:sel.pets.size },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'12px', padding:'14px', textAlign:'center' }}>
                    <div style={{ fontSize:'22px', fontWeight:800, color:s.color||'var(--text)', fontFamily:'"Playfair Display",serif' }}>{s.value}</div>
                    <div style={{ color:'var(--muted)', fontSize:'11px', marginTop:'3px' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Pets */}
              {sel.pets.size > 0 && (
                <div style={{ marginBottom:'20px' }}>
                  <h3 style={{ color:'var(--text)', fontWeight:600, fontSize:'13px', marginBottom:'10px' }}>🐾 Pets</h3>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                    {[...sel.pets].map(p => (
                      <span key={p} style={{ background:'var(--accent-bg)', border:'1px solid var(--accent-border)', color:'var(--accent)', padding:'5px 12px', borderRadius:'999px', fontSize:'12px', fontWeight:600 }}>{p}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Booking history */}
              <div>
                <h3 style={{ color:'var(--text)', fontWeight:600, fontSize:'13px', marginBottom:'12px' }}>📅 Booking History</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px', maxHeight:'280px', overflowY:'auto' }}>
                  {sel.bookings.sort((a,b) => (b.createdAt?.toMillis?.()??0)-(a.createdAt?.toMillis?.()??0)).map(b => (
                    <div key={b.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'10px', padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'8px' }}>
                      <div>
                        <p style={{ color:'var(--text)', fontSize:'13px', fontWeight:600 }}>{b.serviceName}</p>
                        <p style={{ color:'var(--muted)', fontSize:'12px' }}>{b.petName} · {b.date} · {b.slot}</p>
                        {b.packageNames?.length > 0 && <p style={{ color:'var(--accent)', fontSize:'11px', marginTop:'2px' }}>+ {b.packageNames.join(', ')}</p>}
                        {b.amountCollected > 0 && <p style={{ color:'#34d399', fontSize:'11px', fontFamily:'"DM Mono",monospace', marginTop:'2px' }}>₹{parseFloat(b.amountCollected).toLocaleString('en-IN')}</p>}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px' }}>
                        <span className={`badge ${b.status==='pending'?'badge-pending':b.status==='confirmed'?'badge-confirmed':b.status==='completed'?'badge-completed':'badge-cancelled'}`} style={{ textTransform:'capitalize', fontSize:'10px' }}>{b.status}</span>
                        {b.isWalkIn && <span className="badge badge-walkin" style={{ fontSize:'9px' }}>Walk-in</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
