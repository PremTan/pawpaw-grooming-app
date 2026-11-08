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
    showBanner: true,
    bannerText: '',
    sendPush: false,
  })

  const fetchOffers = async () => {
    try {
      setLoading(true)
      // 1. Try reading from settings/offers (guaranteed allowed for admin)
      const snap = await getDoc(doc(db, 'settings', 'offers'))
      if (snap.exists() && Array.isArray(snap.data()?.list)) {
        setOffers(snap.data().list)
        return
      }

      // 2. Fallback to /offers collection if settings/offers not yet populated
      const colSnap = await getDocs(query(collection(db, 'offers'), orderBy('createdAt', 'desc')))
      const list = colSnap.docs.map(d => ({ id: d.id, ...d.data() }))
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
      showBanner: true,
      bannerText: '',
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
      showBanner: offer.showBanner === true,
      bannerText: offer.bannerText || '',
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

  const handleToggleBanner = async (offer) => {
    try {
      const willShow = !offer.showBanner
      const updatedList = offers.map(o => {
        if (o.id === offer.id) return { ...o, showBanner: willShow, updatedAt: new Date().toISOString() }
        if (willShow && o.showBanner) return { ...o, showBanner: false }
        return o
      })

      // Save directly to settings/offers
      await setDoc(doc(db, 'settings', 'offers'), {
        list: updatedList,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setOffers(updatedList)

      // Best effort update to /offers/
      try {
        if (willShow) {
          const batchUpdates = offers
            .filter(o => o.showBanner && o.id !== offer.id)
            .map(o => updateDoc(doc(db, 'offers', o.id), { showBanner: false }).catch(() => { }))
          await Promise.all(batchUpdates)
        }
        await updateDoc(doc(db, 'offers', offer.id), {
          showBanner: willShow,
          updatedAt: serverTimestamp(),
        })
      } catch { }

      setToastMessage(willShow ? `Featured "${offer.code}" on top home banner` : `Removed "${offer.code}" from top banner`)
      setToastType('success')
    } catch (err) {
      console.error('[AdminOffers] Toggle banner error:', err)
      setToastMessage('Could not update banner status: ' + (err?.message || 'Error'))
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
        showBanner: form.showBanner,
        bannerText: form.bannerText.trim(),
        createdAt: editingOffer?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        usageCount: editingOffer?.usageCount || 0,
      }

      let updatedList = [...offers]
      if (form.showBanner) {
        updatedList = updatedList.map(o => ({
          ...o,
          showBanner: o.id === docId ? true : false,
        }))
      }

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
          showBanner: offerData.showBanner,
          bannerText: offerData.bannerText,
          updatedAt: serverTimestamp(),
        }
        if (!editingOffer) {
          firestorePayload.createdAt = serverTimestamp()
          firestorePayload.usageCount = 0
        }
        if (form.showBanner) {
          const others = offers.filter(o => o.showBanner && (!editingOffer || o.id !== editingOffer.id))
          await Promise.all(others.map(o => updateDoc(doc(db, 'offers', o.id), { showBanner: false }).catch(() => { })))
        }
        await setDoc(doc(db, 'offers', docId), firestorePayload, { merge: true })
      } catch (collectionErr) {
        console.warn('[AdminOffers] /offers/ write skipped/denied:', collectionErr?.message)
      }

      // Optional: Broadcast Push Notification to all active customer devices
      if (form.sendPush && form.isActive) {
        try {
          const discountDesc = form.discountType === 'percentage' ? `${val}% OFF` : `Flat ₹${val} OFF`
          const pushTitle = `🎉 Festive Offer: ${offerData.title}!`
          const pushBody = `${discountDesc} on pet grooming! Use coupon code: ${cleanCode}`

          fetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              broadcast: true,
              toAll: true,
              title: pushTitle,
              body: pushBody,
              actionUrl: `/book?coupon=${cleanCode}`,
              actionTitle: 'Book Appointment',
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
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '13px' }}>
            Create festival discounts, promo coupons, and homepage announcement ribbons.
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
                  border: offer.showBanner ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden',
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
                    background: offer.showBanner
                      ? 'var(--gradient)'
                      : offer.isActive
                        ? 'var(--accent)'
                        : 'var(--border)',
                  }}
                />

                <div>
                  {/* Top Header: Coupon Code + Status Badges */}
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {offer.showBanner && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'var(--gradient)',
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                          }}
                        >
                          <Megaphone size={10} /> Banner
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

                  {/* Min Order & Dates Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      margin: '10px 0',
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
                  </div>

                  {/* Announcement Banner Preview */}
                  {offer.bannerText && (
                    <div
                      style={{
                        margin: '10px 0 4px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'var(--accent-bg)',
                        border: '1px dashed var(--accent-border)',
                        fontSize: '11.5px',
                        color: 'var(--text)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Sparkles size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span style={{ fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        &ldquo;{offer.bannerText}&rdquo;
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Controls with Clear Text (No Small Cryptic Icons!) */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    paddingTop: '14px',
                    marginTop: '14px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  {/* Row 1: Status Toggle & Home Banner Toggle */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(offer)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${offer.isActive ? 'rgba(16,185,129,0.35)' : 'var(--border)'}`,
                        background: offer.isActive ? 'rgba(16,185,129,0.1)' : 'var(--surface)',
                        color: offer.isActive ? '#10b981' : 'var(--muted)',
                        transition: 'all 0.15s ease',
                      }}
                      title="Click to activate or deactivate offer"
                    >
                      {offer.isActive ? <Check size={13} /> : <X size={13} />}
                      <span>{offer.isActive ? 'Offer: Active' : 'Offer: Inactive'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleBanner(offer)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1px solid ${offer.showBanner ? 'var(--accent-border)' : 'var(--border)'}`,
                        background: offer.showBanner ? 'var(--accent-bg)' : 'var(--surface)',
                        color: offer.showBanner ? 'var(--accent)' : 'var(--muted)',
                        transition: 'all 0.15s ease',
                      }}
                      title="Click to feature on homepage top announcement banner"
                    >
                      <Megaphone size={13} />
                      <span>{offer.showBanner ? 'Banner: ON' : 'Banner: OFF'}</span>
                    </button>
                  </div>

                  {/* Row 2: Edit & Delete Buttons with Full Labels */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => openEditModal(offer)}
                      className="btn btn-secondary"
                      style={{
                        padding: '8px 12px',
                        fontSize: '12px',
                        justifyContent: 'center',
                        gap: '6px',
                        height: 'auto',
                      }}
                    >
                      <Edit2 size={13} /> Edit Offer
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(offer)}
                      className="btn btn-danger"
                      style={{
                        padding: '8px 12px',
                        fontSize: '12px',
                        justifyContent: 'center',
                        gap: '6px',
                        height: 'auto',
                      }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
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

              {/* Feature in Banner */}
              <div
                style={{
                  padding: '12px 14px',
                  background: 'var(--surface)',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                  <input
                    type="checkbox"
                    checked={form.showBanner}
                    onChange={e => setForm(f => ({ ...f, showBanner: e.target.checked }))}
                    style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                  />
                  <span>Feature in Homepage Top Announcement Ribbon</span>
                </label>

                {form.showBanner && (
                  <div>
                    <label style={{ ...L, fontSize: '10.5px' }}>Custom Banner Announcement Text</label>
                    <input
                      type="text"
                      placeholder={`🪔 ${form.title || 'Festival Special'}: Use code ${form.code || 'CODE'} for discount!`}
                      className="input"
                      value={form.bannerText}
                      onChange={e => setForm(f => ({ ...f, bannerText: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              {/* Broadcast Push notification (create only) */}
              {!editingOffer && (
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
                      <Bell size={14} color="var(--accent)" /> Broadcast Push Notification to customers now
                    </span>
                  </label>
                  <p style={{ margin: '4px 0 0 24px', fontSize: '11.5px', color: 'var(--muted)' }}>
                    Sends an instant alert to customers' mobile notification bars with &ldquo;Book Appointment&rdquo; action button.
                  </p>
                </div>
              )}

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
