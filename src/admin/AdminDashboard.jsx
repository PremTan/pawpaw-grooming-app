// src/admin/AdminDashboard.jsx
import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { format, startOfToday } from 'date-fns'
import { BarChart3, Calendar, CalendarCheck, IndianRupee, Plus, UserCheck, X } from 'lucide-react'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { calculatePublicStats } from '../utils/publicStats'
import { BOOKING_STATUS, PET_TYPES, SERVICES } from '../utils/services'
import { fetchBookingSettings, getAvailabilityForDate } from '../utils/bookingSettings'

const EMPTY = { ownerName: '', phone: '', petName: '', petType: 'Dog', petBreed: '', serviceId: '', date: format(startOfToday(), 'yyyy-MM-dd'), slot: '', notes: '', amountCollected: '' }
const DAY_MS = 24 * 60 * 60 * 1000

const money = (value) => Number(value || 0).toLocaleString('en-IN')
const toDate = (value) => {
  if (!value) return null
  if (value.toDate) return value.toDate()
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
const dateKey = (date) => format(date, 'yyyy-MM-dd')
const monthKey = (date) => format(date, 'yyyy-MM')
const monthLabel = (key) => {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'short' })
}
const uniqueCustomerKey = (b) => b.userId && b.userId !== 'walkin' ? b.userId : (b.phone || b.ownerName || b.id)

function buildSeries(bookings, mode) {
  if (mode === 'monthly') {
    const now = new Date()
    const keys = Array.from({ length: 6 }, (_, index) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
      return monthKey(d)
    })
    return keys.map(key => summarizePeriod(key, key, bookings.filter(b => {
      const d = toDate(b.date)
      return d && monthKey(d) === key
    }), monthLabel(key)))
  }

  const today = startOfToday()
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(today.getTime() - (6 - index) * DAY_MS)
    const key = dateKey(d)
    return summarizePeriod(key, key, bookings.filter(b => b.date === key), d.toLocaleString('en-IN', { weekday: 'short' }))
  })
}

function summarizePeriod(id, key, rows, label) {
  const customers = new Set(rows.map(uniqueCustomerKey).filter(Boolean))
  const completedRows = rows.filter(b => b.status === 'completed')
  return {
    id,
    key,
    label,
    appointments: rows.length,
    engaged: rows.filter(b => b.status !== 'cancelled').length,
    customers: customers.size,
    completed: completedRows.length,
    earnings: completedRows.reduce((sum, b) => sum + (parseFloat(b.amountCollected) || 0), 0),
    online: rows.filter(b => !b.isWalkIn).length,
    offline: rows.filter(b => b.isWalkIn).length,
  }
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState({
    totalBookings: 0,
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    byService: {},
    recentBookings: [],
    totalEarnings: 0,
    todayEarnings: 0,
    todayOnlineEarnings: 0,
    todayWalkInEarnings: 0,
    onlineEarnings: 0,
    walkInEarnings: 0,
    onlineCount: 0,
    walkInCount: 0,
    todayCount: 0,
    customerCount: 0,
    bookings: [],
  })
  const [chartMode, setChartMode] = useState('weekly')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [walkin, setWalkin] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [bookingSettings, setBookingSettings] = useState(null)
  const today = format(startOfToday(), 'yyyy-MM-dd')

  const fetchData = async () => {
    setLoading(true)
    try {
      if (user?.uid) {
        await setDoc(doc(db, 'settings', 'general'), { adminUid: user.uid }, { merge: true })
      }
      const [bSnap, rSnap, settings] = await Promise.all([getDocs(collection(db, 'bookings')), getDocs(collection(db, 'reviews')), fetchBookingSettings(db)])
      setBookingSettings(settings)
      const bookings = bSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const reviews = rSnap.docs.map(d => d.data())
      const byService = {}
      const earningsByService = {}
      const customerKeys = new Set()
      let totalEarnings = 0
      let todayEarnings = 0
      let todayOnlineEarnings = 0
      let todayWalkInEarnings = 0
      let onlineEarnings = 0
      let walkInEarnings = 0
      let onlineCount = 0
      let walkInCount = 0

      bookings.forEach(b => {
        customerKeys.add(uniqueCustomerKey(b))
        if (b.isWalkIn) walkInCount += 1
        else onlineCount += 1

        const serviceIds = Array.isArray(b.serviceIds) ? b.serviceIds : [b.serviceId].filter(Boolean)
        serviceIds.forEach(id => {
          byService[id] = (byService[id] || 0) + 1
        })

        if (b.status === 'completed' && b.amountCollected) {
          const amt = parseFloat(b.amountCollected) || 0
          totalEarnings += amt
          if (b.isWalkIn) walkInEarnings += amt
          else onlineEarnings += amt
          if (b.date === today) {
            todayEarnings += amt
            if (b.isWalkIn) todayWalkInEarnings += amt
            else todayOnlineEarnings += amt
          }
          serviceIds.forEach(id => {
            earningsByService[id] = (earningsByService[id] || 0) + amt
          })
        }
      })

      const sorted = [...bookings].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      setData({
        totalBookings: bookings.length,
        todayCount: bookings.filter(b => b.date === today).length,
        pending: bookings.filter(b => b.status === 'pending').length,
        confirmed: bookings.filter(b => b.status === 'confirmed').length,
        completed: bookings.filter(b => b.status === 'completed').length,
        cancelled: bookings.filter(b => b.status === 'cancelled').length,
        byService,
        earningsByService,
        recentBookings: sorted.slice(0, 5),
        totalEarnings,
        todayEarnings,
        todayOnlineEarnings,
        todayWalkInEarnings,
        onlineEarnings,
        walkInEarnings,
        onlineCount,
        walkInCount,
        customerCount: customerKeys.size,
        bookings,
      })

      const publicStats = calculatePublicStats(bookings, reviews)
      await Promise.all([
        setDoc(doc(db, 'settings', 'homeStats'), { ...publicStats, updatedAt: serverTimestamp() }, { merge: true }),
        setDoc(doc(db, 'settings', 'general'), {
          publicStats,
          totalBookings: publicStats.totalBookings,
          totalReviews: publicStats.totalReviews,
          avgRating: publicStats.avgRating,
          daysOpen: publicStats.daysOpen,
          statsUpdatedAt: serverTimestamp(),
        }, { merge: true }),
      ])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const walkinAvailability = getAvailabilityForDate(bookingSettings || undefined, walkin.date)
  const walkinSlots = walkinAvailability.storeSlots

  const upd = (k, v) => setWalkin(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    const { ownerName, phone, petName, serviceId, date, slot } = walkin
    if (!ownerName || !phone || !petName || !serviceId || !date || !slot) { setError('Please fill all required fields *'); return }
    setSaving(true); setError('')
    try {
      const svc = SERVICES.find(s => s.id === serviceId)
      await addDoc(collection(db, 'bookings'), {
        ...walkin,
        amountCollected: walkin.amountCollected ? parseFloat(walkin.amountCollected) : '',
        serviceName: svc?.name || '',
        userId: 'walkin', userEmail: 'walkin@offline', isWalkIn: true,
        status: walkin.amountCollected ? BOOKING_STATUS.COMPLETED : BOOKING_STATUS.CONFIRMED,
        createdAt: serverTimestamp(),
      })
      setSuccess(true); setWalkin(EMPTY); await fetchData()
      setTimeout(() => { setSuccess(false); setShowModal(false) }, 2000)
    } catch { setError('Failed to save. Try again.') }
    setSaving(false)
  }

  const chartData = useMemo(() => buildSeries(data.bookings, chartMode), [data.bookings, chartMode])
  const chartTotals = useMemo(() => ({
    appointments: chartData.reduce((sum, item) => sum + item.appointments, 0),
    engaged: chartData.reduce((sum, item) => sum + item.engaged, 0),
    customers: chartData.reduce((sum, item) => sum + item.customers, 0),
    completed: chartData.reduce((sum, item) => sum + item.completed, 0),
    earnings: chartData.reduce((sum, item) => sum + item.earnings, 0),
  }), [chartData])
  const maxChart = Math.max(...chartData.flatMap(item => [item.appointments, item.engaged, item.customers, item.completed]), 1)
  const maxCount = Math.max(...Object.values(data.byService), 1)

  const statCards = [
    { label: 'Total Bookings', value: data.totalBookings, icon: <Calendar size={20} />, color: 'var(--accent)', split: [{ label: 'Online', value: data.onlineCount }, { label: 'Offline', value: data.walkInCount }] },
    { label: 'Total Earnings', value: `Rs ${money(data.totalEarnings)}`, icon: <IndianRupee size={20} />, color: '#34d399', split: [{ label: 'Online', value: `Rs ${money(data.onlineEarnings)}` }, { label: 'Offline', value: `Rs ${money(data.walkInEarnings)}` }] },
    { label: "Today's Earnings", value: `Rs ${money(data.todayEarnings)}`, icon: <IndianRupee size={20} />, color: '#60a5fa', split: [{ label: 'Online', value: `Rs ${money(data.todayOnlineEarnings)}` }, { label: 'Offline', value: `Rs ${money(data.todayWalkInEarnings)}` }] },
    { label: "Today's Appointments", value: data.todayCount, icon: <CalendarCheck size={20} />, color: '#22c55e', link: `/admin/bookings?date=${today}`, action: 'View today appointments' },
  ]

  return (
    <div className="admin-page admin-dashboard">
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Dashboard</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Overview of Paw Paw Grooming Centre</p>
        </div>
        <button onClick={() => { setShowModal(true); setSuccess(false); setError('') }} className="btn btn-primary" style={{ fontSize: '13px', padding: '10px 18px' }}>
          <Plus size={16} /> Add Walk-in
        </button>
      </div>

      {loading ? <Spinner text="Loading dashboard..." /> : (
        <>
          <div className="admin-stats-grid">
            {statCards.map((s, i) => (
              <div key={i} className="stat-card">
                <div style={{ color: s.color, marginBottom: '10px' }}>{s.icon}</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)', fontFamily: '"Playfair Display",serif' }}>{s.value}</div>
                <div style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '3px' }}>{s.label}</div>
                {s.split && <div className="admin-earning-split">{s.split.map(row => <span key={row.label}>{row.label}: <strong>{row.value}</strong></span>)}</div>}
                {s.link && <Link className="admin-stat-card-link" to={s.link}>{s.action}</Link>}
              </div>
            ))}
          </div>

          <div className="admin-status-grid">
            {[{ l: 'Pending', v: data.pending, c: 'badge-pending' }, { l: 'Confirmed', v: data.confirmed, c: 'badge-confirmed' }, { l: 'Completed', v: data.completed, c: 'badge-completed' }, { l: 'Cancelled', v: data.cancelled, c: 'badge-cancelled' }].map(s => (
              <div key={s.l} className={`badge ${s.c}`} style={{ padding: '12px', borderRadius: '12px', textAlign: 'center', display: 'block' }}>
                <div style={{ fontSize: '22px', fontWeight: 800 }}>{s.v}</div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>{s.l}</div>
              </div>
            ))}
          </div>

          <div className="admin-dashboard-grid">
          <div className="admin-chart-card">
            <div className="admin-chart-head">
              <div>
                <h2><BarChart3 size={17} /> Admin Activity</h2>
                <p>{chartMode === 'weekly' ? 'Last 7 days' : 'Last 6 months'} appointment, customer, engagement and earnings view</p>
              </div>
              <div className="admin-chart-toggle">
                <button className={chartMode === 'weekly' ? 'active' : ''} onClick={() => setChartMode('weekly')}>Weekly</button>
                <button className={chartMode === 'monthly' ? 'active' : ''} onClick={() => setChartMode('monthly')}>Monthly</button>
              </div>
            </div>
            <div className="admin-chart-summary">
              <span>Total <strong>{chartTotals.appointments}</strong></span>
              <span>Engaged <strong>{chartTotals.engaged}</strong></span>
              <span>Customers <strong>{chartTotals.customers}</strong></span>
              <span>Completed <strong>{chartTotals.completed}</strong></span>
              <span>Earnings <strong>Rs {money(chartTotals.earnings)}</strong></span>
            </div>
            <div className="admin-chart-bars" style={{ '--chart-count': chartData.length }}>
              {chartData.map(item => (
                <div key={item.id} className="admin-chart-col">
                  <div className="admin-chart-stack" title={`${item.label}: ${item.appointments} appointments, ${item.customers} customers`}>
                    <span className="appointments" style={{ height: `${Math.max((item.appointments / maxChart) * 100, item.appointments ? 8 : 0)}%` }} />
                    <span className="engaged" style={{ height: `${Math.max((item.engaged / maxChart) * 100, item.engaged ? 8 : 0)}%` }} />
                    <span className="customers" style={{ height: `${Math.max((item.customers / maxChart) * 100, item.customers ? 8 : 0)}%` }} />
                  </div>
                  <strong>{item.label}</strong>
                  <small>{item.appointments} total</small>
                </div>
              ))}
            </div>
            <div className="admin-chart-legend">
              <span><i className="appointments" /> Appointments</span>
              <span><i className="engaged" /> Engaged</span>
              <span><i className="customers" /> Customers</span>
            </div>
          </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px' }}>
              <h2 style={{ fontWeight: 700, color: 'var(--text)', fontSize: '15px', marginBottom: '18px' }}>Bookings & Earnings by Service</h2>
              {SERVICES.map(s => {
                const cnt = data.byService[s.id] || 0
                const earned = data.earningsByService[s.id] || 0
                return (
                  <div key={s.id} style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px', gap: '10px' }}>
                      <span style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}><span>{s.icon}</span>{s.name}</span>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        {earned > 0 && <span style={{ color: '#34d399', fontFamily: '"DM Mono",monospace', fontSize: '11px' }}>Rs {money(earned)}</span>}
                        <span style={{ color: 'var(--accent)', fontFamily: '"DM Mono",monospace', fontWeight: 700 }}>{cnt}</span>
                      </div>
                    </div>
                    <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '2px', background: s.color, width: `${(cnt / maxCount) * 100}%`, transition: 'width 1s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <h2 style={{ fontWeight: 700, color: 'var(--text)', fontSize: '15px' }}>Recent Bookings</h2>
                <Link to="/admin/bookings" style={{ color: 'var(--accent)', fontSize: '12px', textDecoration: 'none' }}>View all -&gt;</Link>
              </div>
              {data.recentBookings.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: '13px' }}>No bookings yet.</p> : (
                data.recentBookings.map(b => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)', gap: '12px' }}>
                    <div>
                      <p style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {b.ownerName}
                        {b.isWalkIn && <span className="badge badge-walkin" style={{ fontSize: '9px' }}>Walk-in</span>}
                      </p>
                      <p style={{ color: 'var(--muted)', fontSize: '11px' }}>{b.serviceName} · {b.petName}</p>
                      <p style={{ color: 'var(--muted)', fontSize: '11px' }}>{b.date} · {b.slot}</p>
                      {b.amountCollected > 0 && <p style={{ color: '#34d399', fontSize: '11px', fontFamily: '"DM Mono",monospace' }}>Rs {money(b.amountCollected)}</p>}
                    </div>
                    <span className={`badge ${b.status === 'pending' ? 'badge-pending' : b.status === 'confirmed' ? 'badge-confirmed' : b.status === 'completed' ? 'badge-completed' : 'badge-cancelled'}`} style={{ textTransform: 'capitalize', fontSize: '10px' }}>{b.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontFamily: '"Playfair Display",serif', fontWeight: 700, fontSize: '20px', color: 'var(--text)' }}>Add Walk-in / Offline</h2>
                  <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '3px' }}>Record an offline or phone appointment</p>
                </div>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={20} /></button>
              </div>

              {success && <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399', fontSize: '13px', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>Walk-in booking saved!</div>}
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>{error}</div>}

              <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '10px', padding: '12px', marginBottom: '20px', display: 'flex', gap: '10px' }}>
                <UserCheck size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }} />
                <p style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: 1.6 }}>
                  This booking is marked as <strong style={{ color: 'var(--accent)' }}>Walk-in</strong>. If amount is entered, status auto-sets to <strong style={{ color: 'var(--accent)' }}>Completed</strong>.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="admin-form-grid">
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Owner Name *</label>
                    <input className="input" placeholder="Full name" value={walkin.ownerName} onChange={e => upd('ownerName', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Phone *</label>
                    <input className="input" placeholder="10-digit" maxLength={10} value={walkin.phone} onChange={e => upd('phone', e.target.value)} />
                  </div>
                </div>
                <div className="admin-form-grid">
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Pet Name *</label>
                    <input className="input" placeholder="e.g. Bruno" value={walkin.petName} onChange={e => upd('petName', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Pet Type</label>
                    <select className="input" value={walkin.petType} onChange={e => upd('petType', e.target.value)}>
                      {PET_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Service *</label>
                  <select className="input" value={walkin.serviceId} onChange={e => upd('serviceId', e.target.value)}>
                    <option value="">Select a service</option>
                    {SERVICES.map(s => <option key={s.id} value={s.id}>{s.name} - {s.price}</option>)}
                  </select>
                </div>
                <div className="admin-form-grid">
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Date *</label>
                    <input type="date" className="input" value={walkin.date} onChange={e => setWalkin(prev => ({ ...prev, date: e.target.value, slot: '' }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Time Slot *</label>
                    <select className="input" value={walkin.slot} onChange={e => upd('slot', e.target.value)}>
                      <option value="">Select slot</option>
                      {walkinSlots.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>
                    Amount Collected (Rs) <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>- leave empty if not collected yet</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>Rs</span>
                    <input className="input" style={{ paddingLeft: '36px' }} type="number" min="0" placeholder="e.g. 600" value={walkin.amountCollected} onChange={e => upd('amountCollected', e.target.value)} />
                  </div>
                  {walkin.amountCollected && <p style={{ color: '#34d399', fontSize: '12px', marginTop: '6px' }}>Status will auto-set to Completed</p>}
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Notes (optional)</label>
                  <textarea className="input" style={{ resize: 'none' }} rows={2} placeholder="Any notes..." value={walkin.notes} onChange={e => upd('notes', e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                  <button onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
                  <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                    {saving ? 'Saving...' : 'Save Booking'}
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




