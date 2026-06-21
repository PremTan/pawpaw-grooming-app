// src/pages/MyBookings.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import { getBookingTypeLabel } from '../utils/bookingSettings'
import { Calendar, Clock, Home, Plus, Store, UserRound } from 'lucide-react'

const STATUS_BADGE = {
  pending:   'badge-pending',
  confirmed: 'badge-confirmed',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
}

const STATUS_EMOJI = { pending: '⏳', confirmed: '✅', completed: '🎉', cancelled: '❌' }

const assignedWorker = booking => booking.assignedTeamMemberName || (booking.status === 'confirmed' || booking.status === 'completed' ? 'Owner' : '')

export default function MyBookings() {
  const { user } = useAuth()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')

  useEffect(() => {
    async function fetch() {
      try {
        const q = query(collection(db, 'bookings'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'))
        const snap = await getDocs(q)
        setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch {
        // Fallback without orderBy
        try {
          const q2 = query(collection(db, 'bookings'), where('userId', '==', user.uid))
          const snap2 = await getDocs(q2)
          const results = snap2.docs.map(d => ({ id: d.id, ...d.data() }))
          results.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
          setBookings(results)
        } catch {}
      }
      setLoading(false)
    }
    fetch()
  }, [user])

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  return (
    <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '32px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>My Bookings</h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{bookings.length} total appointment{bookings.length !== 1 ? 's' : ''}</p>
          </div>
          <Link to="/book" className="btn btn-primary" style={{ fontSize: '13px', padding: '10px 18px' }}>
            <Plus size={16} /> New Booking
          </Link>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', background: 'var(--surface)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '7px 14px', borderRadius: '9px', fontSize: '12px', fontWeight: filter === f ? 700 : 400, cursor: 'pointer', border: 'none',
                background: filter === f ? 'var(--accent-bg)' : 'transparent',
                color: filter === f ? 'var(--accent)' : 'var(--muted)',
                textTransform: 'capitalize', transition: 'all 0.15s',
              }}
            >
              {STATUS_EMOJI[f] || '📋'} {f}
            </button>
          ))}
        </div>

        {loading ? <Spinner text="Loading your bookings..." /> : filtered.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '52px', marginBottom: '16px' }}>🐾</div>
            <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: '18px', marginBottom: '8px' }}>No bookings yet</p>
            <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '24px' }}>Book your first grooming appointment!</p>
            <Link to="/book" className="btn btn-primary" style={{ display: 'inline-flex' }}>Book Now</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filtered.map(b => (
              <div key={b.id} className="card" style={{ padding: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '14px', flex: 1, minWidth: 0 }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '14px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                      ✂️
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3 style={{ fontWeight: 700, color: 'var(--text)', fontSize: '15px', marginBottom: '3px' }}>{b.serviceName}</h3>
                      <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '8px' }}>
                        {b.petName} · {b.petType}{b.petBreed ? ` · ${b.petBreed}` : ''}
                      </p>
                      {b.packageNames?.length > 0 && (
                        <p style={{ color: 'var(--accent)', fontSize: '12px', marginBottom: '8px' }}>+ {b.packageNames.join(', ')}</p>
                      )}
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--muted)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={11} /> {b.date}
                        </span>
                        <span style={{ color: 'var(--muted)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={11} /> {b.slot}
                        </span>
                        <span style={{ color: 'var(--muted)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {(b.bookingType || 'store') === 'home' ? <Home size={11} /> : <Store size={11} />} {getBookingTypeLabel(b.bookingType || 'store')}
                        </span>
                      </div>
                      {assignedWorker(b) && (
                        <p style={{ color: 'var(--accent)', fontSize: '12px', marginTop: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <UserRound size={12} /> Assigned to: {assignedWorker(b)}{b.assignedTeamMemberIsOwner ? ' (Owner)' : ''}
                        </p>
                      )}
                      {b.visitCharge > 0 && <p style={{ color: 'var(--accent)', fontSize: '12px', marginTop: '8px', fontWeight: 700 }}>Visit charge: Rs {Number(b.visitCharge).toLocaleString('en-IN')}</p>}
                      {b.estimatedTotal > 0 && <p style={{ color: 'var(--text)', fontSize: '12px', marginTop: '4px', fontWeight: 700 }}>Estimated total: Rs {Number(b.estimatedTotal).toLocaleString('en-IN')}+</p>}
                      {b.notes && <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '8px', fontStyle: 'italic' }}>"{b.notes}"</p>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
                    <span className={`badge ${STATUS_BADGE[b.status] || 'badge-pending'}`} style={{ textTransform: 'capitalize' }}>
                      {STATUS_EMOJI[b.status]} {b.status}
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: '"DM Mono",monospace' }}>
                      #{b.id.slice(0, 8).toUpperCase()}
                    </span>
                    {b.amountCollected > 0 && (
                      <span style={{ color: '#34d399', fontSize: '12px', fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>
                        Paid ₹{parseFloat(b.amountCollected).toLocaleString('en-IN')}
                      </span>
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
