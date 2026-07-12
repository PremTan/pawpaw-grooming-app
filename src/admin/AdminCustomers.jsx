// src/admin/AdminCustomers.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { Ban, CalendarDays, ChevronRight, Phone, Search, ShieldCheck, X } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'

const money = (value) => Number(value || 0).toLocaleString('en-IN')
const statusClass = (status = 'pending') => status === 'confirmed' ? 'badge-confirmed' : status === 'completed' ? 'badge-completed' : status === 'cancelled' ? 'badge-cancelled' : 'badge-pending'
const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-10)
const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const buildCustomerIdentityKey = (booking) => {
  const normalizedUserId = booking?.userId && booking.userId !== 'walkin' && booking.userId !== 'walkin@offline' ? booking.userId : ''
  if (normalizedUserId) return normalizedUserId
  const phone = normalizePhone(booking?.phone)
  const ownerName = String(booking?.ownerName || booking?.name || '').trim().toLowerCase()
  if (phone && ownerName) return `walkin:${phone}:${ownerName}`
  if (phone) return `walkin:${phone}`
  if (ownerName) return `walkin:${ownerName}`
  return booking?.id || 'walkin:unknown'
}
const customerKey = (booking) => buildCustomerIdentityKey(booking)
const profilePhoto = (data) => data ? (
  data.photoURL ||
  data.photoUrl ||
  data.profilePhotoURL ||
  data.profilePhotoUrl ||
  data.profilePicture ||
  data.profilePic ||
  data.pictureURL ||
  data.pictureUrl ||
  data.avatarURL ||
  data.avatarUrl ||
  data.imageURL ||
  data.imageUrl ||
  data.userPhotoURL ||
  data.userPhotoUrl ||
  data.customerPhotoURL ||
  data.customerPhotoUrl ||
  data.ownerPhotoURL ||
  data.ownerPhotoUrl ||
  ''
) : ''

export default function AdminCustomers() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState(null)
  const [savingBlock, setSavingBlock] = useState('')
  const [blockError, setBlockError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')

  useEffect(() => {
    fetchCustomers()
  }, [])

  useEffect(() => {
    if (!toastMessage) return
    const t = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [toastMessage])

  async function fetchCustomers() {
    setLoading(true)
    try {
      const [bookingSnap, profileSnap] = await Promise.all([
        getDocs(collection(db, 'bookings')),
        getDocs(collection(db, 'profiles')),
      ])
      const profileMap = {}
      profileSnap.docs.forEach(item => { profileMap[item.id] = { id: item.id, ...item.data() } })
      setBookings(bookingSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setProfiles(profileMap)
    } catch {}
    setLoading(false)
  }

  const customers = useMemo(() => {
    const map = {}
    const profilesByEmail = {}
    const profilesByPhone = {}

    Object.values(profiles).forEach(profile => {
      const email = normalizeEmail(profile.email)
      const phone = normalizePhone(profile.phone)
      if (email) profilesByEmail[email] = profile
      if (phone) profilesByPhone[phone] = profile
    })

    bookings.forEach(booking => {
      const key = customerKey(booking)
      const bookingUserId = booking.userId && booking.userId !== 'walkin' && booking.userId !== 'walkin@offline' ? booking.userId : ''
      const profile = (bookingUserId ? profiles[bookingUserId] : null)
        || profilesByEmail[normalizeEmail(booking.userEmail || booking.email)]
        || profilesByPhone[normalizePhone(booking.phone)]
        || null
      if (!map[key]) {
        map[key] = {
          key,
          phone: profile?.phone || booking.phone || '',
          ownerName: profile?.name || booking.ownerName || 'Unknown',
          userId: bookingUserId || profile?.id || profile?.userId || '',
          userEmail: profile?.email || booking.userEmail || '',
          photoURL: profilePhoto(profile) || profilePhoto(booking),
          isWalkIn: booking.isWalkIn,
          blocked: profile?.blocked === true,
          bookings: [],
          pets: new Set(),
          totalSpent: 0,
        }
      }
      map[key].bookings.push(booking)
      if (booking.petName) map[key].pets.add(booking.petName + ' (' + (booking.petType || 'Pet') + ')')
      if (booking.amountCollected) map[key].totalSpent += parseFloat(booking.amountCollected) || 0
      if (profile?.name || booking.ownerName) map[key].ownerName = profile?.name || booking.ownerName
      if (profile?.phone || booking.phone) map[key].phone = profile?.phone || booking.phone
      if (profile?.email || booking.userEmail) map[key].userEmail = profile?.email || booking.userEmail
      if (profilePhoto(profile) || profilePhoto(booking)) map[key].photoURL = profilePhoto(profile) || profilePhoto(booking)
      if (profile?.blocked === true) map[key].blocked = true
      if (!booking.isWalkIn) map[key].isWalkIn = false
    })

    Object.values(profiles).forEach(profile => {
      if (map[profile.id]) return
      map[profile.id] = {
        key: profile.id,
        phone: profile.phone || '',
        ownerName: profile.name || profile.email?.split('@')[0] || 'Unknown',
        userId: profile.id,
        userEmail: profile.email || '',
        photoURL: profilePhoto(profile),
        isWalkIn: false,
        blocked: profile?.blocked === true,
        bookings: [],
        pets: new Set(),
        totalSpent: 0,
      }
    })

    let rows = Object.values(map).sort((a, b) => b.bookings.length - a.bookings.length)
    if (search.trim()) {
      const term = search.toLowerCase()
      rows = rows.filter(c => c.ownerName.toLowerCase().includes(term) || c.phone.includes(term) || c.userEmail.toLowerCase().includes(term))
    }
    return rows
  }, [bookings, profiles, search])

  const activeCustomers = customers.filter(customer => !customer.blocked)
  const selected = selectedKey ? customers.find(customer => customer.key === selectedKey) : null
  const sortedBookings = selected ? [...selected.bookings].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)) : []

  const openBooking = (bookingId) => {
    setSelectedKey(null)
    navigate('/admin/bookings/' + bookingId)
  }

  const toggleBlocked = async (customer) => {
    if (!customer?.userId || savingBlock) return
    const nextBlocked = !customer.blocked
    setSavingBlock(customer.userId)
    setBlockError('')
    try {
      await setDoc(doc(db, 'profiles', customer.userId), {
        blocked: nextBlocked,
        email: customer.userEmail || '',
        name: customer.ownerName || '',
        phone: customer.phone || '',
        userId: customer.userId,
        photoURL: customer.photoURL || '',
        updatedAt: serverTimestamp(),
        ...(nextBlocked ? { blockedAt: serverTimestamp() } : { unblockedAt: serverTimestamp() }),
      }, { merge: true })
      setProfiles(prev => ({
        ...prev,
        [customer.userId]: {
          ...(prev[customer.userId] || {}),
          id: customer.userId,
          blocked: nextBlocked,
          email: customer.userEmail || prev[customer.userId]?.email || '',
          name: customer.ownerName || prev[customer.userId]?.name || '',
          phone: customer.phone || prev[customer.userId]?.phone || '',
          userId: customer.userId,
          photoURL: customer.photoURL || prev[customer.userId]?.photoURL || '',
        },
      }))
      setToastType('success')
      setToastMessage(nextBlocked ? 'Customer blocked successfully.' : 'Customer unblocked successfully.')
    } catch (err) {
      const msg = err.message || 'Could not update customer block status.'
      setBlockError(msg)
      setToastType('error')
      setToastMessage(msg)
    }
    setSavingBlock('')
  }

  const CustomerAvatar = ({ customer, large = false }) => {
    const [imageFailed, setImageFailed] = useState(false)
    const className = 'admin-customer-avatar' + (large ? ' large' : '')
    if (customer.photoURL && !imageFailed) {
      return <img className={className} src={customer.photoURL} alt={customer.ownerName || 'Customer'} onError={() => setImageFailed(true)} />
    }
    return <div className={className}>{customer.ownerName?.[0]?.toUpperCase() || '?'}</div>
  }

  const renderCustomerCard = (customer) => (
    <button key={customer.key} type="button" className="admin-customer-card" onClick={() => setSelectedKey(customer.key)}>
      <CustomerAvatar customer={customer} />
      <div className="admin-customer-main">
        <div className="admin-customer-title">
          <strong>{customer.ownerName || 'Unknown'}</strong>
          <span className={customer.isWalkIn === false ? 'badge badge-online' : 'badge badge-walkin'}>{customer.isWalkIn === false ? 'Online' : 'Walk-in'}</span>
        </div>
        <p><Phone size={13} /> {customer.phone || 'No phone'}</p>
        {customer.userEmail && <p>{customer.userEmail}</p>}
        {[...customer.pets].length > 0 && <p>{[...customer.pets].slice(0, 2).join(', ')}{customer.pets.size > 2 ? ' +' + (customer.pets.size - 2) + ' more' : ''}</p>}
      </div>
      <div className="admin-customer-count">
        <strong>{customer.bookings.length}</strong>
        <span>Bookings</span>
      </div>
      <ChevronRight size={18} className="admin-customer-chevron" />
    </button>
  )


  return (
    <div className="admin-customers-page">
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}
      <div className="admin-customers-head">
        <h1>Customers</h1>
        <p>{activeCustomers.length} active customers</p>
      </div>

      <div className="admin-customer-search">
        <Search size={15} />
        <input className="input" placeholder="Search by name, phone or email..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {blockError && <div className="admin-customer-error">{blockError}</div>}

      {loading ? <Spinner text="Loading customers..." /> : activeCustomers.length === 0 ? (
        <div className="admin-customer-empty">No active customers found.</div>
      ) : (
        <div className="admin-customer-list">{activeCustomers.map(renderCustomerCard)}</div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelectedKey(null)}>
          <div className="modal-box admin-customer-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-customer-modal-head">
              <CustomerAvatar customer={selected} large />
              <div>
                <h2>{selected.ownerName}</h2>
                <p><Phone size={14} /> {selected.phone || 'No phone'}</p>
                {selected.userEmail && <p>{selected.userEmail}</p>}
              </div>
              <button type="button" onClick={() => setSelectedKey(null)} aria-label="Close customer details"><X size={20} /></button>
            </div>

            <div className="admin-customer-block-panel">
              <div>
                <strong>{selected.blocked ? 'Customer is blocked' : 'Customer is active'}</strong>
                <p>{selected.blocked ? 'They can still log in, but booking, pet, review and profile writes are blocked.' : 'Block this online customer if repeated or fraudulent bookings happen.'}</p>
              </div>
              <button
                type="button"
                className={selected.blocked ? 'btn btn-secondary' : 'btn btn-danger'}
                disabled={!selected.userId || savingBlock === selected.userId}
                onClick={() => toggleBlocked(selected)}
                title={!selected.userId ? 'Only online customers with a user account can be blocked.' : ''}
              >
                {selected.blocked ? <ShieldCheck size={15} /> : <Ban size={15} />}
                {savingBlock === selected.userId ? 'Saving...' : selected.blocked ? 'Unblock' : 'Block'}
              </button>
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
                {sortedBookings.length === 0 ? (
                  <div className="admin-customer-empty small">No booking history.</div>
                ) : sortedBookings.map(booking => (
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

