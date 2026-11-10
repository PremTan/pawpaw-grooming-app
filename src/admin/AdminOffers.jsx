// src/admin/AdminOffers.jsx
import { useState, useEffect } from 'react'
import {
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore'
import { db } from '../firebase'
import {
  Sparkles,
  Tag,
  Plus,
  Trash2,
  Edit2,
  Check,
  Copy,
  Calendar,
  Megaphone,
  X,
  Bell,
  Percent,
  IndianRupee,
  ShoppingBag,
  Settings,
} from 'lucide-react'
import Toast from '../components/Toast'

export default function AdminOffers() {
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingOffer, setEditingOffer] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [copiedCode, setCopiedCode] = useState('')
  const [activeMenuId, setActiveMenuId] = useState(null)

  const todayStr = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    code: '',
    title: '',
    description: '',
    discountType: 'percentage', // 'percentage' | 'flat'
    discountValue: '',
    minBookingAmount: '',
    maxDiscountAmount: '',
    validFrom: todayStr,
    validUntil: '',
    isActive: true,
    applicableService: 'all', // 'all' | 'grooming' | 'boarding'
    customerEligibility: 'all', // 'all' | 'first_time'
    usageLimit: 'unlimited', // 'unlimited' | 'once'
    sendPush: false,
  })

  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuId(null)
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  const fetchOffers = async () => {
    try {
      setLoading(true)
      // 1. Try reading from settings/offers (guaranteed allowed for admin)
      let list = []
      const snap = await getDoc(doc(db, 'settings', 'offers'))
      if (snap.exists() && Array.isArray(snap.data()?.list)) {
        list = [...snap.data().list]
      } else {
        // 2. Fallback to /offers collection if settings/offers not yet populated
        const colSnap = await getDocs(query(collection(db, 'offers'), orderBy('createdAt', 'desc')))
        list = colSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      }

      // Automatically seed default 1st-time coupons FIRSTGROOM and FIRSTSTAY as Inactive if not present
      let needSave = false
      const hasFirstGroom = list.some(o => o.code?.toUpperCase() === 'FIRSTGROOM')
      const hasFirstStay = list.some(o => o.code?.toUpperCase() === 'FIRSTSTAY')

      if (!hasFirstGroom) {
        list.push({
          id: 'FIRSTGROOM',
          code: 'FIRSTGROOM',
          title: '1st Grooming Booking Special',
          description: "Flat ₹100 off on your pet's first salon or home grooming session",
          discountType: 'flat',
          discountValue: 100,
          minBookingAmount: 500,
          maxDiscountAmount: null,
          validFrom: todayStr,
          validUntil: '',
          isActive: false, // Inactive by default so admin can activate
          applicableService: 'grooming',
          customerEligibility: 'first_time',
          usageLimit: 'once',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          usageCount: 0,
        })
        needSave = true
      }

      if (!hasFirstStay) {
        list.push({
          id: 'FIRSTSTAY',
          code: 'FIRSTSTAY',
          title: '1st Pet Boarding Stay Special',
          description: "Flat ₹150 off on your pet's first overnight boarding stay",
          discountType: 'flat',
          discountValue: 150,
          minBookingAmount: 800,
          maxDiscountAmount: null,
          validFrom: todayStr,
          validUntil: '',
          isActive: false, // Inactive by default so admin can activate
          applicableService: 'boarding',
          customerEligibility: 'first_time',
          usageLimit: 'once',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          usageCount: 0,
        })
        needSave = true
      }

      if (needSave) {
        try {
          await setDoc(doc(db, 'settings', 'offers'), { list, updatedAt: serverTimestamp() }, { merge: true })
        } catch (seedErr) {
          console.warn('[AdminOffers] Seeding default coupons warning:', seedErr)
        }
      }

      setOffers(list)
    } catch (err) {
      console.error('[AdminOffers] Fetch error:', err)
      setToastMessage('Failed to load offers: ' + (err?.message || 'Error'))
      setToastType('error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOffers()
  }, [])

  const openCreateModal = () => {
    setEditingOffer(null)
    setForm({
      code: '',
      title: '',
      description: '',
      discountType: 'percentage',
      discountValue: '',
      minBookingAmount: '',
      maxDiscountAmount: '',
      validFrom: todayStr,
      validUntil: '',
      isActive: true,
      applicableService: 'all',
      customerEligibility: 'all',
      usageLimit: 'unlimited',
      sendPush: false,
    })
    setModalOpen(true)
  }

  const openEditModal = (offer) => {
    setEditingOffer(offer)
    setForm({
      code: offer.code || '',
      title: offer.title || '',
      description: offer.description || '',
      discountType: offer.discountType || 'percentage',
      discountValue: offer.discountValue ?? '',
      minBookingAmount: offer.minBookingAmount ?? '',
      maxDiscountAmount: offer.maxDiscountAmount ?? '',
      validFrom: offer.validFrom || todayStr,
      validUntil: offer.validUntil || '',
      isActive: offer.isActive !== false,
      applicableService: offer.applicableService || 'all',
      customerEligibility: offer.customerEligibility || 'all',
      usageLimit: offer.usageLimit || 'unlimited',
      sendPush: false,
    })
    setModalOpen(true)
  }

  const handleCopy = (code) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(''), 2000)
  }

  const handleToggleActive = async (offer) => {
    try {
      const newStatus = !offer.isActive
      const updatedList = offers.map(o => o.id === offer.id ? { ...o, isActive: newStatus, updatedAt: new Date().toISOString() } : o)

      // Save directly to settings/offers (allowed in live Firestore rules)
      await setDoc(doc(db, 'settings', 'offers'), {
        list: updatedList,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setOffers(updatedList)

      // Best effort update to /offers/
      try {
        await updateDoc(doc(db, 'offers', offer.id), {
          isActive: newStatus,
          updatedAt: serverTimestamp(),
        })
      } catch { }

      setToastMessage(`Offer "${offer.code}" is now ${newStatus ? 'Active' : 'Inactive'}`)
      setToastType('success')
    } catch (err) {
      console.error('[AdminOffers] Toggle active error:', err)
      setToastMessage('Could not update offer: ' + (err?.message || 'Error'))
      setToastType('error')
    }
  }

  const handleDelete = async (offer) => {
    if (!window.confirm(`Are you sure you want to delete offer "${offer.code}"?`)) return
    try {
      const updatedList = offers.filter(o => o.id !== offer.id)
      await setDoc(doc(db, 'settings', 'offers'), {
        list: updatedList,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setOffers(updatedList)

      // Best effort delete from /offers/
      try {
        await deleteDoc(doc(db, 'offers', offer.id))
      } catch { }

      setToastMessage(`Offer "${offer.code}" deleted`)
      setToastType('success')
    } catch (err) {
      console.error('[AdminOffers] Delete error:', err)
      setToastMessage('Could not delete offer: ' + (err?.message || 'Error'))
      setToastType('error')
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    const cleanCode = form.code.trim().toUpperCase()
    if (!cleanCode) {
      alert('Please enter a coupon code')
      return
    }
    const val = Number(form.discountValue)
    if (!val || val <= 0) {
      alert('Please enter a valid discount value')
      return
    }

    setSaving(true)
    try {
      const docId = editingOffer ? editingOffer.id : cleanCode
      const offerData = {
        id: docId,
        code: cleanCode,
        title: form.title.trim() || cleanCode,
        description: form.description.trim(),
        discountType: form.discountType,
        discountValue: val,
        minBookingAmount: form.minBookingAmount ? Number(form.minBookingAmount) : 0,
        maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : null,
        validFrom: form.validFrom || todayStr,
        validUntil: form.validUntil || '',
        isActive: form.isActive,
        applicableService: form.applicableService || 'all',
        customerEligibility: form.customerEligibility || 'all',
        usageLimit: form.usageLimit || 'unlimited',
        createdAt: editingOffer?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: editingOffer?.usageCount || 0,
      }

      let updatedList = [...offers]
      const existingIndex = updatedList.findIndex(o => o.id === docId || o.code === cleanCode)
      if (existingIndex >= 0) {
        updatedList[existingIndex] = { ...updatedList[existingIndex], ...offerData }
      } else {
        updatedList.unshift(offerData)
      }

      // 1. Save to settings/offers (guaranteed allowed for admin in live cloud rules!)
      await setDoc(doc(db, 'settings', 'offers'), {
        list: updatedList,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      // 2. Best-effort write to /offers/{docId} in case the collection rules are deployed
      try {
        const firestorePayload = {
          code: cleanCode,
          title: offerData.title,
          description: offerData.description,
          discountType: offerData.discountType,
          discountValue: offerData.discountValue,
          minBookingAmount: offerData.minBookingAmount,
          maxDiscountAmount: offerData.maxDiscountAmount,
          validFrom: offerData.validFrom,
          validUntil: offerData.validUntil,
          isActive: offerData.isActive,
          applicableService: offerData.applicableService,
          customerEligibility: offerData.customerEligibility,
          usageLimit: offerData.usageLimit,
          updatedAt: serverTimestamp(),
        }
        if (!editingOffer) {
          firestorePayload.createdAt = serverTimestamp()
          firestorePayload.usageCount = 0
        }
        await setDoc(doc(db, 'offers', docId), firestorePayload, { merge: true })
      } catch (collectionErr) {
        console.warn('[AdminOffers] /offers/ write skipped/denied:', collectionErr?.message)
      }

      // Optional: Broadcast Push Notification to all active customer devices
      if (form.sendPush && form.isActive) {
        try {
          const discountDesc = form.discountType === 'percentage' ? `${val}% OFF` : `Flat ₹${val} OFF`
          const pushTitle = editingOffer ? `🎉 Special Update: ${offerData.title}!` : `🎉 Festive Offer: ${offerData.title}!`
          const targetServiceLabel = offerData.applicableService === 'boarding'
            ? 'pet boarding'
            : (offerData.applicableService === 'grooming' ? 'pet grooming' : 'pet grooming & boarding')
          const pushBody = `${discountDesc} on ${targetServiceLabel}! Use coupon code: ${cleanCode}`
          const isBoardingOnly = offerData.applicableService === 'boarding'

          fetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              broadcast: true,
              toAll: true,
              title: pushTitle,
              body: pushBody,
              actionUrl: isBoardingOnly ? `/book-boarding?coupon=${cleanCode}` : `/book?coupon=${cleanCode}`,
              actionTitle: isBoardingOnly ? 'Book Pet Boarding' : 'Book Appointment',
            }),
          }).catch(() => { })
        } catch (pushErr) {
          console.warn('[AdminOffers] Broadcast push warning:', pushErr)
        }
      }

      setOffers(updatedList)
      setToastMessage(editingOffer ? 'Offer updated successfully' : 'Offer created successfully')
      setToastType('success')
      setModalOpen(false)
    } catch (err) {
      console.error('[AdminOffers] Save error:', err)
      setToastMessage('Failed to save offer: ' + (err?.message || 'Please check connection'))
      setToastType('error')
    } finally {
      setSaving(false)
    }
  }

  const getOfferStatus = (offer) => {
    if (!offer.isActive) return { label: 'Inactive', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' }
    if (offer.validFrom && offer.validFrom > todayStr) return { label: 'Upcoming', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' }
    if (offer.validUntil && offer.validUntil < todayStr) return { label: 'Expired', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
    return { label: 'Active', color: '#10b981', bg: 'rgba(16,185,129,0.14)' }
  }

  const L = {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    display: 'block',
    marginBottom: '6px',
  }

  return (
    <div style={{ padding: '24px 28px', minHeight: '100%', boxSizing: 'border-box' }}>
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1
              style={{
                fontSize: '26px',
                fontWeight: 800,
                color: 'var(--text)',
                margin: 0,
              }}
            >
              Offers & Coupons
            </h1>
            {offers.length > 0 && (
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '2px 9px',
                  borderRadius: '999px',
                  background: 'var(--accent-bg)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent-border)',
                }}
              >
                {offers.length}
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Manage discount promo codes & festival coupons.
          </p>
        </div>

        {/* When offers exist, show the top Create Offer button. When 0 offers, only 1 button is shown in empty state. */}
        {offers.length > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreateModal}
            style={{ fontSize: '13px', padding: '10px 18px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} /> Create Offer
          </button>
        )}
      </div>

      {/* Offer List */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)' }}>
          Loading offers...
        </div>
      ) : offers.length === 0 ? (
        /* Empty State: Only 1 button present here */
        <div
          style={{
            background: 'var(--card)',
            border: '2px dashed var(--border)',
            borderRadius: '18px',
            padding: '54px 20px',
            textAlign: 'center',
            maxWidth: '520px',
            margin: '40px auto',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'var(--accent-bg)',
              color: 'var(--accent)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <Tag size={30} />
          </div>
          <h3 style={{ margin: '0 0 6px', color: 'var(--text)', fontSize: '18px', fontWeight: 700 }}>
            No offers created yet
          </h3>
          <p style={{ margin: '0 0 20px', color: 'var(--muted)', fontSize: '13px', lineHeight: 1.5 }}>
            Create your first festive discount or promo code to give your customers discounts and feature it on your homepage banner.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreateModal}
            style={{ padding: '11px 22px', fontSize: '13.5px' }}
          >
            <Plus size={16} /> Create First Offer
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '18px',
          }}
        >
          {offers.map(offer => {
            const status = getOfferStatus(offer)
            const isPercentage = offer.discountType === 'percentage'

            return (
              <div
                key={offer.id}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'visible',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.03)',
                  opacity: offer.isActive ? 1 : 0.72,
                  transition: 'all 0.2s',
                }}
              >
                {/* Top glowing bar */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '3px',
                    borderRadius: '16px 16px 0 0',
                    background: offer.isActive ? 'var(--accent)' : 'var(--border)',
                  }}
                />

                <div>
                  {/* Top Header: Coupon Code + Status Badge + 3-Dots Settings Menu */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      marginBottom: '14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'var(--accent-bg)',
                        border: '1.2px dashed var(--accent)',
                        color: 'var(--accent)',
                        padding: '5px 11px',
                        borderRadius: '9px',
                        fontWeight: 900,
                        fontSize: '14.5px',
                        letterSpacing: '0.8px',
                      }}
                    >
                      <Tag size={13} />
                      <span>{offer.code}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(offer.code)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: copiedCode === offer.code ? '#10b981' : 'var(--accent)',
                          padding: '0 0 0 4px',
                          display: 'inline-flex',
                        }}
                        title="Copy coupon code"
                      >
                        {copiedCode === offer.code ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {offer.applicableService === 'grooming' ? (
                        <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '6px', background: 'rgba(217,119,6,0.12)', color: '#d97706', textTransform: 'uppercase' }}>
                          Grooming
                        </span>
                      ) : offer.applicableService === 'boarding' ? (
                        <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '6px', background: 'rgba(59,130,246,0.12)', color: '#2563eb', textTransform: 'uppercase' }}>
                          Boarding
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', textTransform: 'uppercase' }}>
                          All
                        </span>
                      )}

                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '999px',
                          background: status.bg,
                          color: status.color,
                        }}
                      >
                        {status.label}
                      </span>

                      {/* Settings / 3-Dots Actions Menu */}
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveMenuId(prev => prev === offer.id ? null : offer.id)
                          }}
                          style={{
                            background: activeMenuId === offer.id ? 'var(--surface)' : 'transparent',
                            border: '1px solid ' + (activeMenuId === offer.id ? 'var(--border)' : 'transparent'),
                            borderRadius: '7px',
                            cursor: 'pointer',
                            padding: '4px 6px',
                            color: 'var(--text)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease',
                          }}
                          title="Offer Actions"
                          aria-label="Offer actions menu"
                        >
                          <Settings size={15} />
                        </button>

                        {activeMenuId === offer.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              position: 'absolute',
                              top: '100%',
                              right: 0,
                              marginTop: '6px',
                              background: 'var(--card)',
                              border: '1px solid var(--border)',
                              borderRadius: '10px',
                              boxShadow: '0 10px 25px rgba(0,0,0,0.22)',
                              zIndex: 50,
                              minWidth: '150px',
                              overflow: 'hidden',
                              display: 'flex',
                              flexDirection: 'column',
                              padding: '4px',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null)
                                handleToggleActive(offer)
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                width: '100%',
                                padding: '8px 12px',
                                fontSize: '12px',
                                fontWeight: 600,
                                background: 'none',
                                border: 'none',
                                borderRadius: '6px',
                                color: offer.isActive ? '#ef4444' : '#10b981',
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              {offer.isActive ? <X size={14} /> : <Check size={14} />}
                              <span>{offer.isActive ? 'Deactivate' : 'Activate'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null)
                                openEditModal(offer)
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                width: '100%',
                                padding: '8px 12px',
                                fontSize: '12px',
                                fontWeight: 600,
                                background: 'none',
                                border: 'none',
                                borderRadius: '6px',
                                color: 'var(--text)',
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              <Edit2 size={14} />
                              <span>Edit Offer</span>
                            </button>

                            <div style={{ height: '1px', background: 'var(--border)', margin: '2px 0' }} />

                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuId(null)
                                handleDelete(offer)
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                width: '100%',
                                padding: '8px 12px',
                                fontSize: '12px',
                                fontWeight: 600,
                                background: 'none',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#ef4444',
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              <Trash2 size={14} />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3
                    style={{
                      margin: '0 0 4px',
                      fontSize: '16px',
                      fontWeight: 800,
                      color: 'var(--text)',
                      lineHeight: 1.35,
                    }}
                  >
                    {offer.title}
                  </h3>

                  {offer.description && (
                    <p
                      style={{
                        margin: '0 0 10px',
                        fontSize: '12.5px',
                        color: 'var(--muted)',
                        lineHeight: 1.45,
                      }}
                    >
                      {offer.description}
                    </p>
                  )}

                  {/* Discount Highlight Box */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '6px',
                      padding: '10px 14px',
                      background: 'var(--surface)',
                      borderRadius: '11px',
                      border: '1px solid var(--border)',
                      margin: '12px 0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span style={{ fontSize: '21px', fontWeight: 900, color: 'var(--accent)' }}>
                        {isPercentage ? `${offer.discountValue}% OFF` : `₹${offer.discountValue} FLAT OFF`}
                      </span>
                      {isPercentage && offer.maxDiscountAmount ? (
                        <span style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 600 }}>
                          (Up to ₹{offer.maxDiscountAmount})
                        </span>
                      ) : null}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                      {isPercentage ? 'Percentage' : 'Flat ₹'}
                    </span>
                  </div>

                  {/* Min Order, Validity, Usage Limit Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                      marginTop: '10px',
                      fontSize: '12px',
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ color: 'var(--muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>
                        Min. Order
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                        {offer.minBookingAmount ? `₹${offer.minBookingAmount}` : 'No Min.'}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ color: 'var(--muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>
                        Validity
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          color: 'var(--text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {offer.validUntil || 'No Expiry'}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ color: 'var(--muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>
                        Customer Rule
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          color: offer.customerEligibility === 'first_time' ? '#10b981' : (offer.usageLimit === 'once' ? 'var(--accent)' : 'var(--text)'),
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={offer.customerEligibility === 'first_time' ? '1st-Time Customer Only' : (offer.usageLimit === 'once' ? '1-Time Use Per User' : 'All Customers (Multiple Uses)')}
                      >
                        {offer.customerEligibility === 'first_time' ? '1st Booking' : (offer.usageLimit === 'once' ? '1-Time Use' : 'Unlimited')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div
            className="modal-box"
            style={{
              maxWidth: '540px',
              width: '92%',
              borderRadius: '20px',
              padding: '24px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2
                  style={{
                    fontFamily: '"Playfair Display", Georgia, serif',
                    fontWeight: 700,
                    fontSize: '20px',
                    color: 'var(--text)',
                    margin: 0,
                  }}
                >
                  {editingOffer ? 'Edit Offer & Coupon' : 'Create Festival Offer'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                  Set up discount rules, coupon codes, and announcement banners.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px' }}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'grid', gap: '14px' }}>
              {/* Code + Type */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={L}>Coupon Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DIWALI20"
                    className="input"
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, '') }))}
                    style={{ fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}
                  />
                </div>

                <div>
                  <label style={L}>Discount Type *</label>
                  <select
                    className="input"
                    value={form.discountType}
                    onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))}
                  >
                    <option value="percentage">Percentage (% OFF)</option>
                    <option value="flat">Flat Rupee (₹ OFF)</option>
                  </select>
                </div>
              </div>

              {/* Offer Title */}
              <div>
                <label style={L}>Offer Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Diwali Mega Festival Special"
                  className="input"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>

              {/* Description */}
              <div>
                <label style={L}>Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Flat 20% off on all pet grooming & spa sessions"
                  className="input"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Discount Value, Min Order, Max Cap */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={L}>
                    {form.discountType === 'percentage' ? 'Percent (% off) *' : 'Amount (₹ off) *'}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={form.discountType === 'percentage' ? '100' : '99999'}
                    placeholder={form.discountType === 'percentage' ? '20' : '200'}
                    className="input"
                    value={form.discountValue}
                    onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={L}>Min. Order ₹</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 500"
                    className="input"
                    value={form.minBookingAmount}
                    onChange={e => setForm(f => ({ ...f, minBookingAmount: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={L}>Max. Cap ₹</label>
                  <input
                    type="number"
                    min="0"
                    placeholder={form.discountType === 'percentage' ? 'e.g. 600' : 'N/A'}
                    disabled={form.discountType === 'flat'}
                    className="input"
                    value={form.maxDiscountAmount}
                    onChange={e => setForm(f => ({ ...f, maxDiscountAmount: e.target.value }))}
                  />
                </div>
              </div>

              {/* Validity Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={L}>Valid From</label>
                  <input
                    type="date"
                    className="input"
                    value={form.validFrom}
                    onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={L}>Valid Until (Expiry)</label>
                  <input
                    type="date"
                    min={form.validFrom || todayStr}
                    className="input"
                    value={form.validUntil}
                    onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))}
                  />
                </div>
              </div>

              {/* Rules: Scope, Eligibility, Usage Limit */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={L}>Applies To (Service) *</label>
                  <select
                    className="input"
                    value={form.applicableService}
                    onChange={e => setForm(f => ({ ...f, applicableService: e.target.value }))}
                  >
                    <option value="all">All Services</option>
                    <option value="grooming">Grooming Only</option>
                    <option value="boarding">Pet Boarding Only</option>
                  </select>
                </div>

                <div>
                  <label style={L}>Customer Eligibility *</label>
                  <select
                    className="input"
                    value={form.customerEligibility}
                    onChange={e => setForm(f => ({ ...f, customerEligibility: e.target.value }))}
                  >
                    <option value="all">All Customers</option>
                    <option value="first_time">1st-Time Customers Only</option>
                  </select>
                </div>

                <div>
                  <label style={L}>Usage Limit *</label>
                  <select
                    className="input"
                    value={form.usageLimit}
                    onChange={e => setForm(f => ({ ...f, usageLimit: e.target.value }))}
                  >
                    <option value="unlimited">Multiple Uses</option>
                    <option value="once">1-Time Use Only</option>
                  </select>
                </div>
              </div>
              <p style={{ margin: '-4px 0 0', fontSize: '11.5px', color: 'var(--muted)' }}>
                {form.customerEligibility === 'first_time'
                  ? '⭐ Reserved exclusively for first-time customers with 0 past bookings.'
                  : form.usageLimit === 'once'
                    ? 'Each customer can redeem this coupon code once across bookings.'
                    : 'Customers can use this coupon code repeatedly across bookings.'}
              </p>

              {/* Broadcast Push notification (create & edit) */}
              <div
                style={{
                  padding: '12px 14px',
                  background: 'var(--accent-bg)',
                  borderRadius: '12px',
                  border: '1px solid var(--accent-border)',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={form.sendPush}
                    onChange={e => setForm(f => ({ ...f, sendPush: e.target.checked }))}
                    style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Bell size={14} color="var(--accent)" />
                    {editingOffer ? 'Broadcast Push Notification for updated offer now' : 'Broadcast Push Notification to customers now'}
                  </span>
                </label>
                <p style={{ margin: '4px 0 0 24px', fontSize: '11.5px', color: 'var(--muted)' }}>
                  {editingOffer
                    ? 'Sends an instant alert to customers\' mobile notification bars about the updated offer.'
                    : 'Sends an instant alert to customers\' mobile notification bars with "Book Appointment" action button.'}
                </p>
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)} style={{ padding: '9px 18px' }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '9px 20px' }}>
                  {saving ? 'Saving...' : editingOffer ? 'Update Offer' : 'Publish Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
