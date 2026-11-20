// src/admin/WalkinModal.jsx
import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, addDoc, serverTimestamp, orderBy, query } from 'firebase/firestore'
import { format, startOfToday } from 'date-fns'
import { Home, Search, Store, UserCheck, X } from 'lucide-react'
import { db } from '../firebase'
import { BOOKING_STATUS, CAT_BREEDS, DOG_BREEDS, PET_TYPES } from '../utils/services'
import { fetchBookingSettings } from '../utils/bookingSettings'
import { OWNER_ASSIGNEE_ID, buildAssigneePatch, getAssigneeLabel, getOwnerAssignee } from '../utils/teamMembers'
import { buildServiceCatalog } from '../utils/serviceCatalog'

const EMPTY = {
  ownerName: '',
  phone: '',
  petName: '',
  petType: 'Dog',
  petBreed: '',
  serviceIds: [],
  serviceId: '',
  assignedTeamMemberId: OWNER_ASSIGNEE_ID,
  date: format(startOfToday(), 'yyyy-MM-dd'),
  slot: '',
  bookingType: 'store',
  address: '',
  visitCharge: '',
  notes: '',
  amountCollected: '',
  userId: '',
  userEmail: ''
}

const money = (value) => Number(value || 0).toLocaleString('en-IN')
const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-10)

const buildWalkinCustomerIdentity = (booking) => {
  const phone = normalizePhone(booking?.phone)
  const ownerName = String(booking?.ownerName || booking?.name || '').trim().toLowerCase()
  if (phone && ownerName) return `walkin:${phone}:${ownerName}`
  if (phone) return `walkin:${phone}`
  if (ownerName) return `walkin:${ownerName}`
  return booking?.id || 'walkin:unknown'
}

const uniqueCustomerKey = (b) => {
  const bookingUserId = b?.userId && b.userId !== 'walkin' && b.userId !== 'walkin@offline' ? b.userId : ''
  if (bookingUserId) return bookingUserId
  return buildWalkinCustomerIdentity(b)
}

let cachedTeamMembers = null
let cachedPackages = null
let cachedBookingSettings = null
let cachedServiceDetails = null

export default function WalkinModal({
  isOpen,
  onClose,
  onSuccess,
  bookings = [],
  user,
  initialParams,
  setToast = () => {}
}) {
  const [walkin, setWalkin] = useState(() => ({
    ...EMPTY,
    ...(initialParams?.date ? { date: initialParams.date } : {}),
    ...(initialParams?.slot ? { slot: initialParams.slot } : {}),
  }))

  const [teamMembers, setTeamMembers] = useState(() => cachedTeamMembers || [])
  const [serviceDetails, setServiceDetails] = useState(() => cachedServiceDetails || {})
  const [packageOptions, setPackageOptions] = useState(() => cachedPackages || [])
  const [bookingSettings, setBookingSettings] = useState(() => cachedBookingSettings || null)

  const [walkinCustomerSearch, setWalkinCustomerSearch] = useState('')
  const [showWalkinDropdown, setShowWalkinDropdown] = useState(false)
  const [showServicePackageOptions, setShowServicePackageOptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [, setError] = useState('')

  // Lazy load team members, packages, settings & services when modal opens
  useEffect(() => {
    if (!isOpen) return

    if (!cachedTeamMembers) {
      getDocs(query(collection(db, 'teamMembers'), orderBy('createdAt', 'desc')))
        .catch(() => getDocs(collection(db, 'teamMembers')))
        .then(snap => {
          const members = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          cachedTeamMembers = members
          setTeamMembers(members)
        })
        .catch(() => {})
    }

    if (!cachedPackages) {
      getDocs(query(collection(db, 'packages'), orderBy('createdAt', 'desc')))
        .catch(() => getDocs(collection(db, 'packages')))
        .then(snap => {
          const pkgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(pkg => pkg.active !== false)
          cachedPackages = pkgs
          setPackageOptions(pkgs)
        })
        .catch(() => {})
    }

    if (!cachedBookingSettings) {
      fetchBookingSettings(db)
        .then(settings => {
          cachedBookingSettings = settings
          setBookingSettings(settings)
        })
        .catch(() => {})
    }

    if (!cachedServiceDetails) {
      getDocs(collection(db, 'serviceDetails'))
        .then(snap => {
          const next = {}
          snap.docs.forEach(d => { next[d.id] = { id: d.id, ...d.data() } })
          cachedServiceDetails = next
          setServiceDetails(next)
        })
        .catch(() => {})
    }
  }, [isOpen])

  const serviceCatalog = useMemo(() => buildServiceCatalog(serviceDetails), [serviceDetails])
  const ownerAssignee = useMemo(() => getOwnerAssignee(user), [user])
  const assignableTeamMembers = useMemo(() => teamMembers.filter(member => member.active !== false), [teamMembers])
  const assigneeOptions = useMemo(() => [ownerAssignee, ...assignableTeamMembers], [ownerAssignee, assignableTeamMembers])

  const walkinVisitCharge = () => {
    if (walkin.visitCharge !== '') return Number(walkin.visitCharge || 0) || 0
    if (!bookingSettings?.fixedVisitCharges) return 0
    const raw = walkin.bookingType === 'home' ? bookingSettings.homeVisitCharge : bookingSettings.centerVisitCharge
    return Number(raw || 0) || 0
  }
  const walkinServiceAmount = Number(walkin.amountCollected || 0) || 0
  const walkinTotal = walkinServiceAmount + walkinVisitCharge()

  const walkinCustomers = useMemo(() => {
    const map = new Map()
    bookings.forEach(booking => {
      const key = uniqueCustomerKey(booking)
      if (!key || map.has(key)) return
      map.set(key, booking)
    })
    return Array.from(map.values()).sort((a, b) => (a.ownerName || '').localeCompare(b.ownerName || ''))
  }, [bookings])

  const walkinCustomerLabel = customer => `${customer.ownerName || 'Customer'} - ${customer.phone || customer.userEmail || '-'}`
  const filteredWalkinCustomers = useMemo(() => {
    if (!walkinCustomerSearch.trim()) return walkinCustomers
    const search = walkinCustomerSearch.trim().toLowerCase()
    return walkinCustomers.filter(customer => walkinCustomerLabel(customer).toLowerCase().includes(search))
  }, [walkinCustomerSearch, walkinCustomers])

  const walkinCustomerLabelToKey = useMemo(() => (
    new Map(filteredWalkinCustomers.map(customer => [walkinCustomerLabel(customer), uniqueCustomerKey(customer)]))
  ), [filteredWalkinCustomers])

  const applyWalkinCustomer = key => {
    if (!key) {
      setWalkin(prev => ({ ...prev, ownerName: '', phone: '', petName: '', petType: 'Dog', petBreed: '', address: '', userId: '', userEmail: '' }))
      return
    }
    const customer = walkinCustomers.find(item => uniqueCustomerKey(item) === key)
    if (!customer) return
    setWalkin(prev => ({
      ...prev,
      ownerName: customer.ownerName || '',
      phone: customer.phone || '',
      petName: customer.petName || '',
      petType: customer.petType || 'Dog',
      petBreed: customer.petBreed || '',
      address: customer.address || '',
      userId: customer.userId && customer.userId !== 'walkin' && customer.userId !== 'walkin@offline' ? customer.userId : '',
      userEmail: customer.userEmail || '',
    }))
  }

  const handleWalkinCustomerSearchChange = value => {
    setWalkinCustomerSearch(value)
    const key = walkinCustomerLabelToKey.get(value)
    if (value === '') {
      applyWalkinCustomer('')
    } else if (key) {
      applyWalkinCustomer(key)
    }
    setShowWalkinDropdown(true)
  }

  const clearWalkinCustomerSearch = () => {
    setWalkinCustomerSearch('')
    applyWalkinCustomer('')
  }

  const upd = (k, v) => setWalkin(p => ({ ...p, [k]: v }))
  const breedOptions = walkin.petType === 'Dog' ? DOG_BREEDS : walkin.petType === 'Cat' ? CAT_BREEDS : ['Other']

  const handleSave = async () => {
    const { ownerName, phone, petName, serviceIds, date, slot } = walkin
    if (!ownerName || !phone || !petName || !serviceIds?.length || !date || !slot) {
      const msg = 'Please fill all required fields.'
      setToast(msg, 'error')
      setError(msg)
      return
    }
    if (walkin.bookingType === 'home' && !walkin.address.trim()) {
      const msg = 'Please enter the home visit address.'
      setToast(msg, 'error')
      setError(msg)
      return
    }
    setSaving(true)
    setError('')
    try {
      const selectedServices = walkin.serviceIds.map(id => serviceCatalog.find(s => s.id === id)).filter(Boolean)
      const selectedPackages = walkin.serviceIds.map(id => packageOptions.find(pkg => pkg.id === id)).filter(Boolean)
      const selectedItems = [...selectedServices, ...selectedPackages]
      const assignee = assigneeOptions.find(item => item.id === walkin.assignedTeamMemberId) || ownerAssignee
      const visitCharge = walkinVisitCharge()
      const totalCollected = walkin.amountCollected || walkin.visitCharge !== '' ? walkinServiceAmount + visitCharge : ''
      await addDoc(collection(db, 'bookings'), {
        ...walkin,
        ...buildAssigneePatch(assignee),
        amountCollected: totalCollected,
        serviceTotal: walkinServiceAmount,
        visitCharge,
        estimatedTotal: walkinServiceAmount + visitCharge,
        serviceName: selectedItems.map(item => item.name).join(', '),
        serviceIds: walkin.serviceIds,
        selectedPackages: selectedPackages.map(pkg => pkg.id),
        packageNames: selectedPackages.map(pkg => pkg.name),
        userId: walkin.userId || '',
        userEmail: walkin.userEmail || '',
        isWalkIn: true,
        status: BOOKING_STATUS.CONFIRMED,
        createdAt: serverTimestamp(),
      })
      setWalkin(EMPTY)
      setToast('Walk-in booking saved successfully.', 'success')
      onClose()
      if (onSuccess) await onSuccess()
    } catch {
      const msg = 'Failed to save offline appointment. Please try again.'
      setToast(msg, 'error')
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box walkin-modal" onClick={e => e.stopPropagation()}>
        <div className="walkin-modal-body">
          <div className="walkin-modal-head">
            <div>
              <h2 style={{ fontFamily: '"Playfair Display",serif', fontWeight: 700, fontSize: '20px', color: 'var(--text)' }}>Add Walk-in / Offline</h2>
              <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '3px' }}>Record an offline or phone appointment</p>
            </div>
            <button type="button" className="walkin-modal-close" onClick={onClose} aria-label="Close offline appointment">
              <X size={20} />
            </button>
          </div>

          <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '10px', padding: '12px', marginBottom: '20px', display: 'flex', gap: '10px' }}>
            <UserCheck size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '1px' }} />
            <p style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: 1.6 }}>
              This booking is marked as <strong style={{ color: 'var(--accent)' }}>Walk-in</strong>. Amount entry will be recorded, but the appointment remains <strong style={{ color: 'var(--accent)' }}>Confirmed</strong> until it is explicitly completed.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Existing Customer</label>
              <div style={{ position: 'relative' }}>
                <div className={`select-with-icon${walkinCustomerSearch ? ' has-clear' : ''}`}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Search or select by dropdown"
                    value={walkinCustomerSearch}
                    onChange={e => handleWalkinCustomerSearchChange(e.target.value)}
                    onFocus={() => setShowWalkinDropdown(true)}
                    onBlur={() => setTimeout(() => setShowWalkinDropdown(false), 120)}
                    autoComplete="off"
                  />
                  {walkinCustomerSearch && (
                    <button type="button" className="select-clear-button" onClick={clearWalkinCustomerSearch} aria-label="Clear walkin customer selection">
                      <X size={14} />
                    </button>
                  )}
                  <Search size={16} className="select-icon" />
                </div>
                {showWalkinDropdown && filteredWalkinCustomers.length > 0 && (
                  <div className="dropdown-list">
                    {filteredWalkinCustomers.map(customer => {
                      const key = uniqueCustomerKey(customer)
                      return (
                        <button
                          key={key}
                          type="button"
                          className="dropdown-item"
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => {
                            const label = walkinCustomerLabel(customer)
                            handleWalkinCustomerSearchChange(label)
                            applyWalkinCustomer(key)
                            setShowWalkinDropdown(false)
                          }}
                        >
                          {walkinCustomerLabel(customer)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

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
                <select className="input" value={walkin.petType} onChange={e => {
                  const value = e.target.value
                  setWalkin(prev => ({ ...prev, petType: value, petBreed: '' }))
                }}>
                  {PET_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Breed</label>
              <select className="input" value={walkin.petBreed} onChange={e => upd('petBreed', e.target.value)}>
                <option value="">Select breed</option>
                {breedOptions.map(breed => (
                  <option key={breed} value={breed}>{breed}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>Services / Packages *</label>
              <button type="button" onClick={() => setShowServicePackageOptions(prev => !prev)} className="btn btn-secondary" style={{ marginBottom: '10px', width: '100%', justifyContent: 'space-between' }}>
                <span>{showServicePackageOptions ? 'Hide' : 'Select'} services / packages</span>
                <span>{showServicePackageOptions ? '▲' : '▼'}</span>
              </button>
              {showServicePackageOptions && (
                <div style={{ display: 'grid', gap: '10px', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowServicePackageOptions(false)} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px' }}>Hide dropdown</button>
                  </div>
                  {serviceCatalog.map(service => (
                    <label key={service.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--text)' }}>
                      <input
                        type="checkbox"
                        checked={walkin.serviceIds.includes(service.id)}
                        onChange={() => {
                          const nextIds = walkin.serviceIds.includes(service.id)
                            ? walkin.serviceIds.filter(id => id !== service.id)
                            : [...walkin.serviceIds, service.id]
                          setWalkin(prev => ({ ...prev, serviceIds: nextIds, serviceId: nextIds[0] || '' }))
                        }}
                      />
                      <span>{service.name} - {service.price}</span>
                    </label>
                  ))}
                  {packageOptions.map(pkg => (
                    <label key={pkg.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--text)' }}>
                      <input
                        type="checkbox"
                        checked={walkin.serviceIds.includes(pkg.id)}
                        onChange={() => {
                          const nextIds = walkin.serviceIds.includes(pkg.id)
                            ? walkin.serviceIds.filter(id => id !== pkg.id)
                            : [...walkin.serviceIds, pkg.id]
                          setWalkin(prev => ({ ...prev, serviceIds: nextIds, serviceId: nextIds[0] || '' }))
                        }}
                      />
                      <span>Package: {pkg.name} - {pkg.price}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Assigned Team Member</label>
              <select className="input" value={walkin.assignedTeamMemberId} onChange={e => upd('assignedTeamMemberId', e.target.value)}>
                {assigneeOptions.map(member => <option key={member.id} value={member.id}>{getAssigneeLabel(member)}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Visit Type *</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                <button type="button" onClick={() => setWalkin(prev => ({ ...prev, bookingType: 'store', address: '', visitCharge: bookingSettings?.fixedVisitCharges ? String(bookingSettings.centerVisitCharge || '') : prev.visitCharge }))} className={walkin.bookingType === 'store' ? 'btn btn-primary' : 'btn btn-secondary'}>
                  <Store size={15} /> In Store
                </button>
                <button type="button" onClick={() => setWalkin(prev => ({ ...prev, bookingType: 'home', visitCharge: bookingSettings?.fixedVisitCharges ? String(bookingSettings.homeVisitCharge || '') : prev.visitCharge }))} className={walkin.bookingType === 'home' ? 'btn btn-primary' : 'btn btn-secondary'}>
                  <Home size={15} /> At Home
                </button>
              </div>
            </div>

            {walkin.bookingType === 'home' && (
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Home Visit Address *</label>
                <textarea className="input" rows={2} placeholder="Complete address" value={walkin.address} onChange={e => upd('address', e.target.value)} />
              </div>
            )}

            <div className="admin-form-grid">
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Date *</label>
                <input type="date" className="input" value={walkin.date} onChange={e => upd('date', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Time *</label>
                <input type="time" className="input" value={walkin.slot} onChange={e => upd('slot', e.target.value)} />
              </div>
            </div>

            <div className="admin-form-grid">
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>
                  Service Amount (Rs) <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none' }}>- leave empty if not collected yet</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>Rs</span>
                  <input className="input" style={{ paddingLeft: '36px' }} type="number" min="0" placeholder="e.g. 600" value={walkin.amountCollected} onChange={e => upd('amountCollected', e.target.value)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Visit Charge (Rs)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>Rs</span>
                  <input className="input" style={{ paddingLeft: '36px' }} type="number" min="0" placeholder="0" value={walkin.visitCharge} onChange={e => upd('visitCharge', e.target.value)} />
                </div>
              </div>
            </div>

            {(walkin.amountCollected || walkin.visitCharge !== '') && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: 'var(--muted)', fontSize: '13px' }}>Total collected and status will auto-set to Completed</span>
                <strong style={{ color: 'var(--text)' }}>Rs {money(walkinTotal)}</strong>
              </div>
            )}

            <div>
              <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '5px' }}>Notes (optional)</label>
              <textarea className="input" style={{ resize: 'none' }} rows={2} placeholder="Any notes..." value={walkin.notes} onChange={e => upd('notes', e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
              <button onClick={onClose} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? 'Saving...' : 'Save Booking'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
