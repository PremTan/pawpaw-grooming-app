// src/admin/AdminBlockedUsers.jsx
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { Phone, Search, ShieldCheck } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'

export default function AdminBlockedUsers() {
  const [profiles, setProfiles] = useState([])
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')

  useEffect(() => {
    fetchBlockedUsers()
  }, [])

  useEffect(() => {
    if (!toastMessage) return
    const t = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [toastMessage])

  async function fetchBlockedUsers() {
    setLoading(true)
    try {
      const [profileSnap, bookingSnap] = await Promise.all([
        getDocs(collection(db, 'profiles')),
        getDocs(collection(db, 'bookings')),
      ])
      setProfiles(profileSnap.docs.map(item => ({ id: item.id, ...item.data() })))
      setBookings(bookingSnap.docs.map(item => ({ id: item.id, ...item.data() })))
      setError('')
    } catch (err) {
      setError(err.message || 'Could not load blocked users.')
    }
    setLoading(false)
  }

  const blockedUsers = useMemo(() => {
    const rows = profiles
      .filter(profile => profile.blocked === true)
      .map(profile => {
        const userBookings = bookings.filter(booking => booking.userId === profile.id)
        const latestBooking = userBookings[0]
        return {
          id: profile.id,
          ownerName: profile.name || latestBooking?.ownerName || profile.email?.split('@')[0] || 'Unknown',
          phone: profile.phone || latestBooking?.phone || '',
          email: profile.email || latestBooking?.userEmail || '',
          bookings: userBookings.length,
        }
      })
      .sort((a, b) => b.bookings - a.bookings || a.ownerName.localeCompare(b.ownerName))

    if (!search.trim()) return rows
    const term = search.toLowerCase()
    return rows.filter(user =>
      user.ownerName.toLowerCase().includes(term) ||
      user.phone.includes(term) ||
      user.email.toLowerCase().includes(term)
    )
  }, [profiles, bookings, search])

  const unblockUser = async (blockedUser) => {
    if (!blockedUser?.id || savingId) return
    setSavingId(blockedUser.id)
    setError('')
    try {
      await setDoc(doc(db, 'profiles', blockedUser.id), {
        blocked: false,
        updatedAt: serverTimestamp(),
        unblockedAt: serverTimestamp(),
      }, { merge: true })
      setProfiles(prev => prev.map(profile => profile.id === blockedUser.id ? { ...profile, blocked: false } : profile))
      setToastType('success')
      setToastMessage('User unblocked successfully.')
    } catch (err) {
      const msg = err.message || 'Could not unblock user.'
      setError(msg)
      setToastType('error')
      setToastMessage(msg)
    }
    setSavingId('')
  }

  return (
    <div className="admin-customers-page">
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}
      <div className="admin-customers-head">
        <h1>Blocked Users</h1>
        <p>{blockedUsers.length} blocked user{blockedUsers.length === 1 ? '' : 's'}</p>
      </div>

      <div className="admin-customer-search">
        <Search size={15} />
        <input className="input" placeholder="Search blocked users..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {error && <div className="admin-customer-error">{error}</div>}

      {loading ? <Spinner text="Loading blocked users..." /> : blockedUsers.length === 0 ? (
        <div className="admin-customer-empty">No blocked users.</div>
      ) : (
        <div className="admin-blocked-user-list">
          {blockedUsers.map(blockedUser => (
            <div key={blockedUser.id} className="admin-blocked-user-card">
              <div className="admin-blocked-user-main static">
                <div className="admin-customer-avatar">{blockedUser.ownerName?.[0]?.toUpperCase() || '?'}</div>
                <div>
                  <div className="admin-customer-title">
                    <strong>{blockedUser.ownerName}</strong>
                    <span className="badge badge-blocked">Blocked</span>
                  </div>
                  <p><Phone size={13} /> {blockedUser.phone || 'No phone'}</p>
                  {blockedUser.email && <p>{blockedUser.email}</p>}
                  <p>{blockedUser.bookings} booking{blockedUser.bookings === 1 ? '' : 's'}</p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary admin-unblock-btn"
                disabled={savingId === blockedUser.id}
                onClick={() => unblockUser(blockedUser)}
              >
                <ShieldCheck size={15} /> {savingId === blockedUser.id ? 'Saving...' : 'Unblock'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}