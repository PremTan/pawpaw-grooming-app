// src/admin/AdminCustomers.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { Ban, CalendarDays, Check, ChevronRight, Clock, Phone, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import { safeGetDocs } from '../utils/firestoreSafe'

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
const getBookingTimestamp = (b) => {
  if (b?.date) {
    const t = new Date(b.date).getTime()
    if (!Number.isNaN(t)) return t
  }
  if (b?.createdAt?.toMillis) return b.createdAt.toMillis()
  if (b?.createdAt?.toDate) return b.createdAt.toDate().getTime()
  if (b?.createdAt) {
    const t = new Date(b.createdAt).getTime()
    if (!Number.isNaN(t)) return t
  }
  return 0
}
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
  const [showImagePreview, setShowImagePreview] = useState(false)
  const [savingBlock, setSavingBlock] = useState('')
  const [blockError, setBlockError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')

  // Customer Filter & Sort State
  const [quickFilter, setQuickFilter] = useState('all')
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [frequencyF, setFrequencyF] = useState('all')
  const [channelF, setChannelF] = useState('all')
  const [petTypeF, setPetTypeF] = useState('all')
  const [minSpendF, setMinSpendF] = useState('all')
  const [sortBy, setSortBy] = useState('bookings')

  const openCustomerImage = () => {
    if (selected?.photoURL) {
      setShowImagePreview(true)
    }
  }

  const closeCustomerImage = () => setShowImagePreview(false)

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
        safeGetDocs(collection(db, 'bookings')),
        safeGetDocs(collection(db, 'profiles')),
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
          hasDog: false,
          hasCat: false,
          lastVisitTime: 0,
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

      // Pet type tracking
      const pt = String(booking.petType || '').toLowerCase()
      const sn = String(booking.serviceName || '').toLowerCase()
      const pn = String(booking.petName || '').toLowerCase()
      if (pt.includes('dog') || sn.includes('dog') || pt === 'puppy' || pn.includes('dog')) map[key].hasDog = true
      if (pt.includes('cat') || sn.includes('cat') || pt === 'kitten' || pn.includes('cat')) map[key].hasCat = true

      // Booking date tracking
      const bookingTime = getBookingTimestamp(booking)
      if (bookingTime > map[key].lastVisitTime) {
        map[key].lastVisitTime = bookingTime
      }
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
        hasDog: false,
        hasCat: false,
        lastVisitTime: 0,
      }
    })

    Object.values(map).forEach(customer => {
      if (customer.lastVisitTime > 0) {
        customer.daysSinceLastVisit = Math.floor((Date.now() - customer.lastVisitTime) / (1000 * 60 * 60 * 24))
      } else {
        customer.daysSinceLastVisit = null
      }
    })

    return Object.values(map)
  }, [bookings, profiles])

  const activeCustomers = useMemo(() => customers.filter(customer => !customer.blocked), [customers])

  // Dynamic counts for quick filter pills
  const pillCounts = useMemo(() => ({
    all: activeCustomers.length,
    repeat: activeCustomers.filter(c => c.bookings.length >= 2).length,
    new: activeCustomers.filter(c => c.bookings.length === 1).length,
    inactive: activeCustomers.filter(c => c.bookings.length > 0 && c.daysSinceLastVisit !== null && c.daysSinceLastVisit >= 60).length,
    top: activeCustomers.filter(c => c.totalSpent >= 3000).length,
  }), [activeCustomers])

  // Filter and sort customer list
  const filteredCustomers = useMemo(() => {
    let list = activeCustomers

    // 1. Search filter
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      list = list.filter(c =>
        c.ownerName.toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        c.userEmail.toLowerCase().includes(term) ||
        [...c.pets].some(p => p.toLowerCase().includes(term))
      )
    }

    // 2. Frequency / Stage Filter
    if (frequencyF === 'repeat') {
      list = list.filter(c => c.bookings.length >= 2)
    } else if (frequencyF === 'new') {
      list = list.filter(c => c.bookings.length === 1)
    } else if (frequencyF === 'inactive') {
      list = list.filter(c => c.bookings.length > 0 && c.daysSinceLastVisit !== null && c.daysSinceLastVisit >= 60)
    } else if (frequencyF === 'zero') {
      list = list.filter(c => c.bookings.length === 0)
    }

    // 3. Channel Filter
    if (channelF === 'online') {
      list = list.filter(c => c.isWalkIn === false)
    } else if (channelF === 'walkin') {
      list = list.filter(c => c.isWalkIn !== false)
    }

    // 4. Pet Type Filter
    if (petTypeF === 'dog') {
      list = list.filter(c => c.hasDog || [...c.pets].some(p => p.toLowerCase().includes('dog') || p.toLowerCase().includes('puppy')))
    } else if (petTypeF === 'cat') {
      list = list.filter(c => c.hasCat || [...c.pets].some(p => p.toLowerCase().includes('cat') || p.toLowerCase().includes('kitten')))
    }

    // 5. Min Spend Filter
    if (minSpendF !== 'all') {
      const threshold = Number(minSpendF) || 0
      list = list.filter(c => c.totalSpent >= threshold)
    }

    // 6. Sorting
    const sorted = [...list]
    if (sortBy === 'spent') {
      sorted.sort((a, b) => (b.totalSpent - a.totalSpent) || (b.bookings.length - a.bookings.length))
    } else if (sortBy === 'recent') {
      sorted.sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0))
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => (a.ownerName || '').localeCompare(b.ownerName || ''))
    } else {
      // Default: most bookings
      sorted.sort((a, b) => (b.bookings.length - a.bookings.length) || (b.totalSpent - a.totalSpent))
    }

    return sorted
  }, [activeCustomers, search, frequencyF, channelF, petTypeF, minSpendF, sortBy])

  const activeFilterCount = (frequencyF !== 'all' ? 1 : 0)
    + (channelF !== 'all' ? 1 : 0)
    + (petTypeF !== 'all' ? 1 : 0)
    + (minSpendF !== 'all' ? 1 : 0)
    + (sortBy !== 'bookings' ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0

  const clearAllFilters = () => {
    setQuickFilter('all')
    setFrequencyF('all')
    setChannelF('all')
    setPetTypeF('all')
    setMinSpendF('all')
    setSortBy('bookings')
  }

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
        {customer.totalSpent > 0 && (
          <small style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700, marginTop: '2px', display: 'block' }}>
            ₹{money(customer.totalSpent)}
          </small>
        )}
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
        <p>
          {filteredCustomers.length} of {activeCustomers.length} active customer{activeCustomers.length === 1 ? '' : 's'}
          {hasActiveFilters ? ' (filtered)' : ''}
        </p>
      </div>

      {/* Search & Filter Bar: Search input with Clear (X) + Filter button beside it */}
      <div className="admin-booking-search-row">
        <div className="admin-booking-search">
          <Search size={15} />
          <input
            placeholder="Search by name, phone or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="admin-search-clear-btn"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`admin-booking-filter-btn ${hasActiveFilters ? 'active' : ''}`}
          onClick={() => setShowFilterModal(true)}
        >
          <SlidersHorizontal size={15} />
          <span>Filters</span>
          {hasActiveFilters && (
            <span className="admin-filter-count-badge">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Quick Customer Segment Pills */}
      <div className="admin-quick-filter-scroll" role="tablist" aria-label="Quick customer segment filters">
        <button
          type="button"
          className={`admin-quick-pill ${quickFilter === 'all' && frequencyF === 'all' && minSpendF === 'all' ? 'active' : ''}`}
          onClick={() => {
            setQuickFilter('all')
            setFrequencyF('all')
            setMinSpendF('all')
          }}
        >
          All Customers
          <span className="admin-quick-pill-count">{pillCounts.all}</span>
        </button>
        <button
          type="button"
          className={`admin-quick-pill ${quickFilter === 'repeat' ? 'active' : ''}`}
          onClick={() => {
            if (quickFilter === 'repeat') {
              setQuickFilter('all')
              setFrequencyF('all')
            } else {
              setQuickFilter('repeat')
              setFrequencyF('repeat')
            }
          }}
        >
          <Sparkles size={13} />
          <span>Repeat (2+)</span>
          <span className="admin-quick-pill-count">{pillCounts.repeat}</span>
        </button>
        <button
          type="button"
          className={`admin-quick-pill ${quickFilter === 'new' ? 'active' : ''}`}
          onClick={() => {
            if (quickFilter === 'new') {
              setQuickFilter('all')
              setFrequencyF('all')
            } else {
              setQuickFilter('new')
              setFrequencyF('new')
            }
          }}
        >
          <span>New (1)</span>
          <span className="admin-quick-pill-count">{pillCounts.new}</span>
        </button>
        <button
          type="button"
          className={`admin-quick-pill ${quickFilter === 'inactive' ? 'active' : ''}`}
          onClick={() => {
            if (quickFilter === 'inactive') {
              setQuickFilter('all')
              setFrequencyF('all')
            } else {
              setQuickFilter('inactive')
              setFrequencyF('inactive')
            }
          }}
        >
          <Clock size={13} />
          <span>Inactive (60d+)</span>
          <span className="admin-quick-pill-count">{pillCounts.inactive}</span>
        </button>
        <button
          type="button"
          className={`admin-quick-pill ${quickFilter === 'top' ? 'active' : ''}`}
          onClick={() => {
            if (quickFilter === 'top') {
              setQuickFilter('all')
              setMinSpendF('all')
            } else {
              setQuickFilter('top')
              setMinSpendF('3000')
            }
          }}
        >
          <span>Top Spenders (₹3k+)</span>
          <span className="admin-quick-pill-count">{pillCounts.top}</span>
        </button>
      </div>

      {/* Active filters pill summary if any active */}
      {hasActiveFilters && (
        <div className="admin-active-filters-bar" style={{ marginBottom: '14px' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600 }}>Active filters:</span>
          {frequencyF !== 'all' && (
            <span className="admin-filter-pill-tag">
              Frequency: {frequencyF === 'repeat' ? 'Repeat (2+)' : frequencyF === 'new' ? 'New (1)' : frequencyF === 'inactive' ? 'Inactive (60d+)' : '0 Bookings'}
              <button
                type="button"
                onClick={() => {
                  setFrequencyF('all')
                  if (quickFilter !== 'top') setQuickFilter('all')
                }}
                aria-label="Clear frequency filter"
              >
                <X size={11} />
              </button>
            </span>
          )}
          {channelF !== 'all' && (
            <span className="admin-filter-pill-tag">
              Channel: {channelF === 'online' ? 'Online Users' : 'Walk-in Only'}
              <button type="button" onClick={() => setChannelF('all')} aria-label="Clear channel filter"><X size={11} /></button>
            </span>
          )}
          {petTypeF !== 'all' && (
            <span className="admin-filter-pill-tag">
              Pet: {petTypeF === 'dog' ? 'Dog Parents' : 'Cat Parents'}
              <button type="button" onClick={() => setPetTypeF('all')} aria-label="Clear pet filter"><X size={11} /></button>
            </span>
          )}
          {minSpendF !== 'all' && (
            <span className="admin-filter-pill-tag">
              Min Spend: ₹{money(minSpendF)}+
              <button
                type="button"
                onClick={() => {
                  setMinSpendF('all')
                  if (quickFilter === 'top') setQuickFilter('all')
                }}
                aria-label="Clear min spend filter"
              >
                <X size={11} />
              </button>
            </span>
          )}
          {sortBy !== 'bookings' && (
            <span className="admin-filter-pill-tag">
              Sort: {sortBy === 'spent' ? 'Top Spent' : sortBy === 'recent' ? 'Recent Visit' : 'A - Z'}
              <button type="button" onClick={() => setSortBy('bookings')} aria-label="Reset sort"><X size={11} /></button>
            </span>
          )}
          <button
            type="button"
            onClick={clearAllFilters}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
              padding: '2px 6px',
              textDecoration: 'underline'
            }}
          >
            Clear all
          </button>
        </div>
      )}

      {blockError && <div className="admin-customer-error">{blockError}</div>}

      {loading ? (
        <Spinner text="Loading customers..." />
      ) : filteredCustomers.length === 0 ? (
        <div className="admin-customer-empty">
          <p style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 600 }}>No customers match your criteria.</p>
          {(hasActiveFilters || search) && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearch('')
                clearAllFilters()
              }}
              style={{ fontSize: '12.5px', padding: '6px 14px' }}
            >
              Reset all filters
            </button>
          )}
        </div>
      ) : (
        <div className="admin-customer-list">{filteredCustomers.map(renderCustomerCard)}</div>
      )}

      {/* CUSTOMER FILTERS MODAL / BOTTOM SHEET */}
      {showFilterModal && (
        <div className="admin-filter-modal-overlay" onClick={() => setShowFilterModal(false)}>
          <div className="admin-filter-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="admin-filter-sheet-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SlidersHorizontal size={18} color="var(--accent)" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text)' }}>Customer Filters</h3>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowFilterModal(false)}
                aria-label="Close filters"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-filter-sheet-body">
              {/* Visit Frequency / Stage */}
              <div className="admin-filter-field">
                <label>Visit Frequency / Stage</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[
                    { id: 'all', label: 'All Customers' },
                    { id: 'repeat', label: 'Repeat (2+ visits)' },
                    { id: 'new', label: 'New (1 visit)' },
                    { id: 'inactive', label: 'Inactive (60d+)' },
                    { id: 'zero', label: 'Registered (0 visits)' },
                  ].map(opt => {
                    const active = frequencyF === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setFrequencyF(opt.id)
                          if (['repeat', 'new', 'inactive'].includes(opt.id)) {
                            setQuickFilter(opt.id)
                          } else {
                            if (quickFilter !== 'top') setQuickFilter('all')
                          }
                        }}
                        style={{
                          padding: '7px 12px',
                          borderRadius: '8px',
                          border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: active ? 'var(--accent-bg)' : 'var(--surface)',
                          color: active ? 'var(--accent)' : 'var(--text)',
                          fontSize: '12.5px',
                          fontWeight: active ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Channel / Source */}
              <div className="admin-filter-field">
                <label>Channel / Account</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[
                    { id: 'all', label: 'All Channels' },
                    { id: 'online', label: 'Online App Users' },
                    { id: 'walkin', label: 'Walk-in Only' },
                  ].map(opt => {
                    const active = channelF === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setChannelF(opt.id)}
                        style={{
                          padding: '7px 12px',
                          borderRadius: '8px',
                          border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: active ? 'var(--accent-bg)' : 'var(--surface)',
                          color: active ? 'var(--accent)' : 'var(--text)',
                          fontSize: '12.5px',
                          fontWeight: active ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Pet Type */}
              <div className="admin-filter-field">
                <label>Pet Type</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[
                    { id: 'all', label: 'All Pets' },
                    { id: 'dog', label: 'Dog Parents 🐶' },
                    { id: 'cat', label: 'Cat Parents 🐱' },
                  ].map(opt => {
                    const active = petTypeF === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPetTypeF(opt.id)}
                        style={{
                          padding: '7px 12px',
                          borderRadius: '8px',
                          border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: active ? 'var(--accent-bg)' : 'var(--surface)',
                          color: active ? 'var(--accent)' : 'var(--text)',
                          fontSize: '12.5px',
                          fontWeight: active ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Minimum Spend */}
              <div className="admin-filter-field">
                <label>Minimum Total Spent</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[
                    { id: 'all', label: 'Any Amount' },
                    { id: '1000', label: '₹1,000+' },
                    { id: '3000', label: '₹3,000+' },
                    { id: '5000', label: '₹5,000+' },
                    { id: '10000', label: '₹10,000+' },
                  ].map(opt => {
                    const active = minSpendF === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setMinSpendF(opt.id)
                          if (opt.id === '3000') {
                            setQuickFilter('top')
                          } else if (quickFilter === 'top') {
                            setQuickFilter('all')
                          }
                        }}
                        style={{
                          padding: '7px 12px',
                          borderRadius: '8px',
                          border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: active ? 'var(--accent-bg)' : 'var(--surface)',
                          color: active ? 'var(--accent)' : 'var(--text)',
                          fontSize: '12.5px',
                          fontWeight: active ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Sort Order */}
              <div className="admin-filter-field">
                <label>Sort Customers By</label>
                <select
                  className="input"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '10px' }}
                >
                  <option value="bookings">Most Bookings (Default)</option>
                  <option value="spent">Highest Total Spent</option>
                  <option value="recent">Most Recent Visit</option>
                  <option value="name">Alphabetical (A - Z)</option>
                </select>
              </div>
            </div>

            <div className="admin-filter-sheet-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearAllFilters}
                style={{ fontSize: '13px', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <RotateCcw size={14} /> Reset
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowFilterModal(false)}
                style={{ fontSize: '13px', padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Check size={14} /> Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelectedKey(null)}>
          <div className="modal-box admin-customer-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-customer-modal-head">
              <button
                type="button"
                className="admin-customer-image-button"
                onClick={openCustomerImage}
                style={{ all: 'unset', cursor: selected.photoURL ? 'pointer' : 'default' }}
                aria-label={selected.photoURL ? 'Open customer image' : undefined}
              >
                <CustomerAvatar customer={selected} large />
              </button>
              <div>
                <h2>{selected.ownerName}</h2>
                <p>
                  <Phone size={14} />
                  {selected.phone ? (
                    <a href={`tel:${selected.phone}`} style={{ color: 'inherit', textDecoration: 'none', marginLeft: '6px' }}>
                      {selected.phone}
                    </a>
                  ) : ' No phone'}
                </p>
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

            {showImagePreview && selected.photoURL && (
              <div className="modal-overlay" style={{ zIndex: 1400 }} onClick={closeCustomerImage}>
                <div className="modal-box admin-customer-image-preview" style={{ maxWidth: '92vw', width: 'min(680px, calc(100vw - 32px))', padding: '18px', background: 'var(--card)', position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button type="button" onClick={closeCustomerImage} aria-label="Close image preview" style={{ position: 'absolute', top: '14px', right: '14px', width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
                  <img src={selected.photoURL} alt={selected.ownerName || 'Customer'} style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '14px' }} />
                </div>
              </div>
            )}

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


