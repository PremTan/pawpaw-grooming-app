// src/admin/AdminCustomers.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { Search, ChevronRight, X, Phone, CalendarDays } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'

const money = (value) => Number(value || 0).toLocaleString('en-IN')
const statusClass = (status = 'pending') => status === 'confirmed' ? 'badge-confirmed' : status === 'completed' ? 'badge-completed' : status === 'cancelled' ? 'badge-cancelled' : 'badge-pending'
const customerKey = (booking) => booking.phone || booking.userId || booking.id

export default function AdminCustomers() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState(null)

  useEffect(() => {
    async function fetchCustomers() {
      try {
        const snap = await getDocs(collection(db, 'bookings'))
        setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch {}
      setLoading(false)
    }
    fetchCustomers()
  }, [])

  const customers = useMemo(() => {
    const map = {}
    bookings.forEach(booking => {
      const key = customerKey(booking)
      if (!map[key]) {
        map[key] = {
          key,
          phone: booking.phone || '',
          ownerName: booking.ownerName || 'Unknown',
          userId: booking.userId || '',
          isWalkIn: booking.isWalkIn,
          bookings: [],
          pets: new Set(),
          totalSpent: 0,
        }
      }
      map[key].bookings.push(booking)
      if (booking.petName) map[key].pets.add(booking.petName + ' (' + (booking.petType || 'Pet') + ')')
      if (booking.amountCollected) map[key].totalSpent += parseFloat(booking.amountCollected) || 0
      if (booking.ownerName) map[key].ownerName = booking.ownerName
      if (!booking.isWalkIn) map[key].isWalkIn = false
    })

    let rows = Object.values(map).sort((a, b) => b.bookings.length - a.bookings.length)
    if (search.trim()) {
      const term = search.toLowerCase()
      rows = rows.filter(c => c.ownerName.toLowerCase().includes(term) || c.phone.includes(term))
    }
    return rows
  }, [bookings, search])

  const selected = selectedKey ? customers.find(customer => customer.key === selectedKey) : null
  const sortedBookings = selected ? [...selected.bookings].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)) : []

  const openBooking = (bookingId) => {
    setSelectedKey(null)
    navigate('/admin/bookings/' + bookingId)
  }

  return (
    <div className="admin-customers-page">
      <div className="admin-customers-head">
        <h1>Customers</h1>
        <p>{customers.length} unique customers</p>
      </div>

      <div className="admin-customer-search">
        <Search size={15} />
        <input className="input" placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <Spinner text="Loading customers..." /> : customers.length === 0 ? (
        <div className="admin-customer-empty">No customers yet.</div>
      ) : (
        <div className="admin-customer-list">
          {customers.map(customer => (
            <button key={customer.key} type="button" className="admin-customer-card" onClick={() => setSelectedKey(customer.key)}>
              <div className="admin-customer-avatar">{customer.ownerName?.[0]?.toUpperCase() || '?'}</div>
              <div className="admin-customer-main">
                <div className="admin-customer-title">
                  <strong>{customer.ownerName || 'Unknown'}</strong>
                  <span className={customer.isWalkIn === false ? 'badge badge-online' : 'badge badge-walkin'}>{customer.isWalkIn === false ? 'Online' : 'Walk-in'}</span>
                </div>
                <p><Phone size={13} /> {customer.phone || 'No phone'}</p>
                {[...customer.pets].length > 0 && <p>{[...customer.pets].slice(0, 2).join(', ')}{customer.pets.size > 2 ? ' +' + (customer.pets.size - 2) + ' more' : ''}</p>}
              </div>
              <div className="admin-customer-count">
                <strong>{customer.bookings.length}</strong>
                <span>Bookings</span>
              </div>
              <ChevronRight size={18} className="admin-customer-chevron" />
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelectedKey(null)}>
          <div className="modal-box admin-customer-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-customer-modal-head">
              <div className="admin-customer-avatar large">{selected.ownerName?.[0]?.toUpperCase() || '?'}</div>
              <div>
                <h2>{selected.ownerName}</h2>
                <p><Phone size={14} /> {selected.phone || 'No phone'}</p>
              </div>
              <button type="button" onClick={() => setSelectedKey(null)} aria-label="Close customer details"><X size={20} /></button>
            </div>

            <div className="admin-customer-stats">
              <div><strong>{selected.bookings.length}</strong><span>Total Bookings</span></div>
              <div><strong>Rs {money(selected.totalSpent)}</strong><span>Total Spent</span></div>
              <div><strong>{selected.pets.size}</strong><span>Pets</span></div>
            </div>

            {selected.pets.size > 0 && (
              <section className="admin-customer-section">
                <h3>Pets</h3>
                <div className="admin-customer-pets">{[...selected.pets].map(pet => <span key={pet}>{pet}</span>)}</div>
              </section>
            )}

            <section className="admin-customer-section">
              <h3><CalendarDays size={16} /> Booking History</h3>
              <div className="admin-customer-history">
                {sortedBookings.map(booking => (
                  <button key={booking.id} type="button" className="admin-customer-booking" onClick={() => openBooking(booking.id)}>
                    <div>
                      <strong>{booking.serviceName || 'Service'}</strong>
                      <p>{booking.petName || 'Pet'} - {booking.date || '-'} - {booking.slot || '-'}</p>
                      {booking.packageNames?.length > 0 && <small>+ {booking.packageNames.join(', ')}</small>}
                    </div>
                    <span className={'badge ' + statusClass(booking.status)}>{booking.status || 'pending'}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
