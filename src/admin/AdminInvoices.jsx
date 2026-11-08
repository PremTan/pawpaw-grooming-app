import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { Download, Eye, MessageCircle, ReceiptText, Search, Share2, X } from 'lucide-react'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import { db } from '../firebase'
import { PET_TYPES } from '../utils/services'
import { fetchBusinessInfo } from '../utils/businessInfo'
import { buildCustomerInvoiceWhatsAppMessage, downloadInvoicePdf, shareInvoicePdfFile, viewInvoicePdf } from '../utils/invoicePdf'
import { getBookingTypeLabel } from '../utils/bookingSettings'

const blankCustom = {
  ownerName: '', phone: '', userEmail: '', petName: '', petType: 'Dog', petBreed: '',
  serviceName: '', date: '', slot: '', bookingType: 'store', address: '', visitCharge: '',
  amountCollected: '', gstAmount: '', notes: '',
}

const money = value => Number(value || 0).toLocaleString('en-IN')
const shortId = id => `#${String(id || '').slice(0, 8).toUpperCase()}`

let cachedInvoicesData = null
let cachedInvoicesTimestamp = 0
const INVOICES_CACHE_TTL = 60 * 1000

export default function AdminInvoices() {
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('mode')
  const [mode, setMode] = useState(
    initialMode === 'boarding' ? 'boarding' : initialMode === 'custom' ? 'custom' : 'appointment'
  )
  const [bookings, setBookings] = useState([])
  const [boardings, setBoardings] = useState([])
  const [businessInfo, setBusinessInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [selectedBoardingId, setSelectedBoardingId] = useState('')
  const [appointmentSearch, setAppointmentSearch] = useState('')
  const [boardingSearch, setBoardingSearch] = useState('')
  const [customCustomerSearch, setCustomCustomerSearch] = useState('')
  const [showAppointmentDropdown, setShowAppointmentDropdown] = useState(false)
  const [showBoardingDropdown, setShowBoardingDropdown] = useState(false)
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [custom, setCustom] = useState(blankCustom)
  const [generated, setGenerated] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')

  useEffect(() => {
    const isFresh = cachedInvoicesData && (Date.now() - cachedInvoicesTimestamp < INVOICES_CACHE_TTL)
    if (isFresh) {
      setBookings(cachedInvoicesData.bookings)
      setBoardings(cachedInvoicesData.boardings)
      setBusinessInfo(cachedInvoicesData.businessInfo)
      if (cachedInvoicesData.selectedId) setSelectedId(cachedInvoicesData.selectedId)
      if (cachedInvoicesData.selectedBoardingId) setSelectedBoardingId(cachedInvoicesData.selectedBoardingId)
      setLoading(false)
      // Background revalidation so any newly completed booking is updated seamlessly
      refreshInBackground()
      return
    }

    async function load() {
      setLoading(true)
      try {
        const [snap, boardingSnap, info] = await Promise.all([
          getDocs(query(collection(db, 'bookings'), orderBy('createdAt', 'desc'), limit(150))),
          getDocs(query(collection(db, 'boardingBookings'), orderBy('createdAt', 'desc'), limit(150))),
          fetchBusinessInfo(db),
        ])
        const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        const bRows = boardingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        setBookings(rows)
        setBoardings(bRows)
        setBusinessInfo(info)
        const firstCompleted = rows.find(row => row.status === 'completed')
        if (firstCompleted) setSelectedId(firstCompleted.id)
        const firstCompletedBoarding = bRows.find(row => row.status === 'checked_out' || row.status === 'completed')
        if (firstCompletedBoarding) setSelectedBoardingId(firstCompletedBoarding.id)

        cachedInvoicesData = {
          bookings: rows,
          boardings: bRows,
          businessInfo: info,
          selectedId: firstCompleted ? firstCompleted.id : '',
          selectedBoardingId: firstCompletedBoarding ? firstCompletedBoarding.id : '',
        }
        cachedInvoicesTimestamp = Date.now()
      } catch {
        setError('Could not load invoice data.')
      }
      setLoading(false)
    }

    async function refreshInBackground() {
      try {
        const [snap, boardingSnap, info] = await Promise.all([
          getDocs(query(collection(db, 'bookings'), orderBy('createdAt', 'desc'), limit(150))),
          getDocs(query(collection(db, 'boardingBookings'), orderBy('createdAt', 'desc'), limit(150))),
          fetchBusinessInfo(db),
        ])
        const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        const bRows = boardingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        setBookings(rows)
        setBoardings(bRows)
        setBusinessInfo(info)
        cachedInvoicesData = {
          ...cachedInvoicesData,
          bookings: rows,
          boardings: bRows,
          businessInfo: info,
        }
        cachedInvoicesTimestamp = Date.now()
      } catch {}
    }

    load()
  }, [])

  useEffect(() => {
    if (!toastMessage) return
    const t = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [toastMessage])

  const completedBookings = useMemo(() => bookings.filter(booking => booking.status === 'completed'), [bookings])
  const selectedBooking = completedBookings.find(booking => booking.id === selectedId)

  const completedBoardings = useMemo(
    () => boardings.filter(b => b.status === 'checked_out' || b.status === 'completed'),
    [boardings]
  )
  const selectedBoarding = completedBoardings.find(b => b.id === selectedBoardingId)

  const customers = useMemo(() => {
    const map = new Map()
    bookings.forEach(booking => {
      const key = booking.phone || booking.ownerName || booking.userEmail
      if (!key || map.has(key)) return
      map.set(key, booking)
    })
    boardings.forEach(booking => {
      const key = booking.phone || booking.ownerName || booking.userEmail
      if (!key || map.has(key)) return
      map.set(key, booking)
    })
    return Array.from(map.values())
  }, [bookings, boardings])

  const appointmentLabel = booking => `${booking.ownerName || 'Customer'} - ${booking.petName || 'Pet'} - ${booking.date || '-'} - Rs ${money(booking.amountCollected || booking.estimatedTotal)}`
  const boardingLabel = b => `${b.ownerName || 'Customer'} - ${b.petName || 'Pet'} (${b.checkInDate || '-'} to ${b.checkOutDate || '-'}) - Rs ${money(b.totalAmount || (Number(b.estimatedTotal || 0) + Number(b.specialFoodCharge || 0) + Number(b.lateCheckOutCharge || 0)))}`
  const customerLabel = customer => `${customer.ownerName || 'Customer'} - ${customer.phone || customer.userEmail || '-'}`

  useEffect(() => {
    const pMode = searchParams.get('mode')
    const pId = searchParams.get('id')
    if (pMode === 'boarding') {
      setMode('boarding')
      if (pId && boardings.length > 0) {
        const found = boardings.find(
          b => (b.status === 'checked_out' || b.status === 'completed') &&
               (b.id === pId || shortId(b.id).toUpperCase() === pId.toUpperCase())
        )
        if (found) {
          setSelectedBoardingId(found.id)
          setBoardingSearch(boardingLabel(found))
        }
      }
    } else if (pMode === 'appointment') {
      setMode('appointment')
      if (pId && bookings.length > 0) {
        const found = bookings.find(
          b => b.status === 'completed' &&
               (b.id === pId || shortId(b.id).toUpperCase() === pId.toUpperCase())
        )
        if (found) {
          setSelectedId(found.id)
          setAppointmentSearch(appointmentLabel(found))
        }
      }
    } else if (pMode === 'custom') {
      setMode('custom')
    }
  }, [searchParams, bookings, boardings])

  const filteredCompletedBoardings = useMemo(() => {
    if (!boardingSearch.trim()) return completedBoardings
    const search = boardingSearch.trim().toLowerCase()
    return completedBoardings.filter(b =>
      boardingLabel(b).toLowerCase().includes(search)
    )
  }, [boardingSearch, completedBoardings])

  const boardingLabelToId = useMemo(
    () => new Map(filteredCompletedBoardings.map(b => [boardingLabel(b), b.id])),
    [filteredCompletedBoardings]
  )

  const handleBoardingSearchChange = value => {
    setBoardingSearch(value)
    const matchId = boardingLabelToId.get(value)
    setSelectedBoardingId(matchId || '')
    setShowBoardingDropdown(true)
  }

  const handleBoardingSelect = b => {
    setBoardingSearch(boardingLabel(b))
    setSelectedBoardingId(b.id)
    setShowBoardingDropdown(false)
  }

  const clearBoardingSearch = () => {
    setBoardingSearch('')
    setSelectedBoardingId('')
    setShowBoardingDropdown(false)
  }

  const filteredCompletedBookings = useMemo(() => {
    if (!appointmentSearch.trim()) return completedBookings
    const search = appointmentSearch.trim().toLowerCase()
    return completedBookings.filter(booking =>
      appointmentLabel(booking).toLowerCase().includes(search)
    )
  }, [appointmentSearch, completedBookings])

  const appointmentLabelToId = useMemo(() => new Map(filteredCompletedBookings.map(booking => [appointmentLabel(booking), booking.id])), [filteredCompletedBookings])

  const filteredCustomers = useMemo(() => {
    if (!customCustomerSearch.trim()) return customers
    const search = customCustomerSearch.trim().toLowerCase()
    return customers.filter(customer =>
      customerLabel(customer).toLowerCase().includes(search)
    )
  }, [customCustomerSearch, customers])

  const customerLabelToKey = useMemo(() => new Map(filteredCustomers.map(customer => [customerLabel(customer), customer.phone || customer.ownerName || customer.userEmail])), [filteredCustomers])

  const handleAppointmentSearchChange = value => {
    setAppointmentSearch(value)
    const matchId = appointmentLabelToId.get(value)
    setSelectedId(matchId || '')
    setShowAppointmentDropdown(true)
  }

  const handleAppointmentSelect = booking => {
    setAppointmentSearch(appointmentLabel(booking))
    setSelectedId(booking.id)
    setShowAppointmentDropdown(false)
  }

  const clearAppointmentSearch = () => {
    setAppointmentSearch('')
    setSelectedId('')
    setShowAppointmentDropdown(false)
  }

  const clearCustomerSearch = () => {
    setCustomCustomerSearch('')
    setShowCustomerDropdown(false)
    applyCustomer('')
  }

  const handleCustomerSearchChange = value => {
    setCustomCustomerSearch(value)
    const key = customerLabelToKey.get(value)
    if (key) {
      applyCustomer(key)
    }
    setShowCustomerDropdown(true)
  }

  const handleCustomerSelect = customer => {
    const label = customerLabel(customer)
    setCustomCustomerSearch(label)
    applyCustomer(customer.phone || customer.ownerName || customer.userEmail)
    setShowCustomerDropdown(false)
  }

  const invoiceInfo = businessInfo || { contact: {}, footer: {}, whatsappNumber: '' }
  const upd = (key, value) => setCustom(prev => ({ ...prev, [key]: value }))

  const visitChargeFor = bookingType => {
    const settings = businessInfo?.bookingSettings
    if (!settings?.fixedVisitCharges) return 0
    const raw = bookingType === 'home' ? settings.homeVisitCharge : settings.centerVisitCharge
    return Number(raw || 0) || 0
  }

  const applyCustomer = key => {
    if (!key) {
      setCustom(blankCustom)
      return
    }
    const booking = customers.find(row => (row.phone || row.ownerName || row.userEmail) === key)
    if (!booking) return
    setCustom(prev => ({
      ...prev,
      ownerName: booking.ownerName || '',
      phone: booking.phone || '',
      userEmail: booking.userEmail || '',
      petName: booking.petName || '',
      petType: booking.petType || 'Dog',
      petBreed: booking.petBreed || '',
      address: booking.address || '',
    }))
  }

  const makeCustomBooking = () => {
    const visitCharge = Number(custom.visitCharge || 0) || 0
    const amount = Number(custom.amountCollected || 0) || 0
    return {
      ...custom,
      id: `custom-${Date.now()}`,
      status: 'completed',
      isWalkIn: true,
      amountCollected: amount + visitCharge,
      serviceTotal: amount,
      visitCharge,
      estimatedTotal: amount + visitCharge,
      gstAmount: Number(custom.gstAmount || 0) || 0,
      serviceName: custom.serviceName || 'Custom Service',
      packageNames: [],
      bookingType: custom.bookingType || 'store',
    }
  }

  const generateFromAppointment = () => {
    if (!selectedBooking) {
      const msg = 'Select a completed appointment first.'
      setToastType('error')
      setToastMessage(msg)
      setError(msg)
      return
    }
    setError('')
    setToastType('success')
    setToastMessage('Invoice generated successfully.')
    setGenerated({ booking: selectedBooking, label: `${selectedBooking.ownerName || 'Customer'} - ${shortId(selectedBooking.id)}` })
  }

  const generateFromBoarding = () => {
    if (!selectedBoarding) {
      const msg = 'Select a completed boarding stay first.'
      setToastType('error')
      setToastMessage(msg)
      setError(msg)
      return
    }

    const items = []
    let itemIdx = 1

    const days = selectedBoarding.stayDays || 1
    const dailyRate = Number(selectedBoarding.dailyRate || 0)
    const baseAmount = Number(selectedBoarding.estimatedTotal || (days * dailyRate))

    items.push([
      String(itemIdx++).padStart(2, '0'),
      [
        'Pet Boarding Stay',
        `Pet: ${selectedBoarding.petName || 'Pet'}${selectedBoarding.petType ? ` (${selectedBoarding.petType}${selectedBoarding.petBreed ? `, ${selectedBoarding.petBreed}` : ''})` : ''}`,
        `Stay: ${selectedBoarding.checkInDate || '-'} (${selectedBoarding.checkInTime || '10:00 AM'}) to ${selectedBoarding.checkOutDate || '-'} (${selectedBoarding.checkOutTime || '11:00 PM'})`,
        `Duration: ${days} Day${days > 1 ? 's' : ''}${selectedBoarding.stayNights ? ` (${selectedBoarding.stayNights} Night${selectedBoarding.stayNights > 1 ? 's' : ''})` : ''}`,
      ].join('\n'),
      `${days} Day${days > 1 ? 's' : ''}`,
      Number(dailyRate).toLocaleString('en-IN'),
      Number(baseAmount).toLocaleString('en-IN'),
    ])

    const foodCharge = Number(selectedBoarding.specialFoodCharge || 0)
    if (foodCharge > 0) {
      items.push([
        String(itemIdx++).padStart(2, '0'),
        [
          'Special Food Charge',
          `Provider: ${selectedBoarding.specialFoodProvider === 'paw_paw' ? 'Paw Paw Kitchen' : (selectedBoarding.specialFoodProvider || 'Special Diet')}`,
          selectedBoarding.specialDietInstructions ? `Diet: ${selectedBoarding.specialDietInstructions}` : '',
        ].filter(Boolean).join('\n'),
        '1',
        Number(foodCharge).toLocaleString('en-IN'),
        Number(foodCharge).toLocaleString('en-IN'),
      ])
    }

    const lateFee = Number(selectedBoarding.lateCheckOutCharge || 0)
    if (lateFee > 0) {
      items.push([
        String(itemIdx++).padStart(2, '0'),
        [
          'Late Check-out Charge',
          `Late check-out after 11:00 PM on ${selectedBoarding.checkOutDate || 'final day'}`,
        ].join('\n'),
        '1',
        Number(lateFee).toLocaleString('en-IN'),
        Number(lateFee).toLocaleString('en-IN'),
      ])
    }

    const finalTotal = Number(selectedBoarding.totalAmount || (baseAmount + foodCharge + lateFee))
    const finalCollected = Number(selectedBoarding.amountCollected || finalTotal)

    const invoiceObj = {
      ...selectedBoarding,
      isBoarding: true,
      serviceName: 'Pet Boarding Stay',
      date: selectedBoarding.checkInDate,
      invoiceItems: items,
      totalAmount: finalTotal,
      amountCollected: finalCollected,
    }

    setError('')
    setToastType('success')
    setToastMessage('Boarding invoice generated successfully.')
    setGenerated({
      booking: invoiceObj,
      label: `${selectedBoarding.ownerName || 'Customer'} - Pet Boarding (${shortId(selectedBoarding.id)})`,
    })
  }

  const generateCustom = () => {
    if (!custom.ownerName || !custom.phone || !custom.petName || !custom.serviceName || !custom.date || !custom.amountCollected) {
      const msg = 'Please fill customer, pet, service, date and amount.'
      setToastType('error')
      setToastMessage(msg)
      setError(msg)
      return
    }
    if (custom.bookingType === 'home' && !custom.address.trim()) {
      const msg = 'Please add address for home visit invoice.'
      setToastType('error')
      setToastMessage(msg)
      setError(msg)
      return
    }
    setError('')
    setToastType('success')
    setToastMessage('Invoice generated successfully.')
    setGenerated({ booking: makeCustomBooking(), label: `${custom.ownerName} - custom invoice` })
  }

  const run = async (key, task) => {
    if (!generated?.booking) return
    setBusy(key)
    try {
      await task(generated.booking, invoiceInfo)
    } catch {
      setError('Could not prepare invoice. Please try again.')
    } finally {
      setBusy('')
    }
  }

  const sharePdf = async (key) => {
    if (!generated?.booking) return
    setBusy(key)
    setError('')
    try {
      const shared = await shareInvoicePdfFile(generated.booking, invoiceInfo, `Invoice ${generated.booking.ownerName || ''}`)
      if (!shared) setError('This browser cannot attach PDFs directly to share. The PDF was downloaded; attach it from Downloads.')
    } catch (err) {
      if (err?.name !== 'AbortError') setError('Could not share invoice PDF. Please download and attach it manually.')
    } finally {
      setBusy('')
    }
  }

  const sendInvoiceViaWhatsApp = async () => {
    if (!generated?.booking) return
    const booking = generated.booking
    const rawPhone = String(booking.phone || '').trim().replace(/\D/g, '')
    if (!rawPhone) {
      setToastType('error')
      setToastMessage('Customer phone number is missing in this invoice.')
      setError('Cannot open WhatsApp: Customer phone number is missing.')
      return
    }

    const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone

    setBusy('whatsapp-customer')
    try {
      await downloadInvoicePdf(booking, invoiceInfo)
    } catch {}
    setBusy('')

    const msg = buildCustomerInvoiceWhatsAppMessage(booking, invoiceInfo)
    const waUrl = `https://wa.me/${cleanPhone}?text=${msg}`
    window.open(waUrl, '_blank', 'noopener,noreferrer')

    setToastType('success')
    setToastMessage('PDF downloaded & customer WhatsApp opened!')
  }

  if (loading) return <div style={{ padding: '28px' }}><Spinner text="Loading invoices..." /></div>

  return (
    <div className="admin-page">
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Invoices</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Generate invoices from completed appointments or create a custom invoice manually.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {[
          ['appointment', 'Grooming Appointment'],
          ['boarding', 'Pet Boarding Stay'],
          ['custom', 'Custom Invoice'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => { setMode(value); setGenerated(null); setError('') }}
            className={mode === value ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ fontSize: '13px' }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div style={{ border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', background: 'rgba(239,68,68,0.08)', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(300px, 0.7fr)', gap: '18px', alignItems: 'start' }} className="admin-invoice-layout">
        <section style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
          {mode === 'appointment' ? (
            <div>
              <h2 style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>Choose Completed Appointment</h2>
              <p style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '14px' }}>Only completed appointments can be used for invoice generation. Details are locked in this mode.</p>
              <div style={{ position: 'relative' }}>
                <label className="invoice-label">Search or select appointment</label>
                <div className={`select-with-icon${appointmentSearch ? ' has-clear' : ''}`}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Search or select by dropdown"
                    value={appointmentSearch}
                    onChange={event => handleAppointmentSearchChange(event.target.value)}
                    onFocus={() => setShowAppointmentDropdown(true)}
                    onBlur={() => setTimeout(() => setShowAppointmentDropdown(false), 120)}
                    autoComplete="off"
                  />
                  {appointmentSearch && (
                    <button type="button" className="select-clear-button" onClick={clearAppointmentSearch} aria-label="Clear appointment search">
                      <X size={14} />
                    </button>
                  )}
                  <Search size={16} className="select-icon" />
                </div>
                {showAppointmentDropdown && filteredCompletedBookings.length > 0 && (
                  <div className="dropdown-list">
                    {filteredCompletedBookings.map(booking => (
                      <button
                        key={booking.id}
                        type="button"
                        className="dropdown-item"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => handleAppointmentSelect(booking)}
                      >
                        {appointmentLabel(booking)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedBooking ? (
                <div style={{ marginTop: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                  <div className="admin-detail-kv-grid">
                    {[
                      ['Booking ID', shortId(selectedBooking.id)],
                      ['Customer', selectedBooking.ownerName || '-'],
                      ['Phone', selectedBooking.phone || '-'],
                      ['Pet', `${selectedBooking.petName || '-'}${selectedBooking.petType ? ` (${selectedBooking.petType})` : ''}`],
                      ['Service', selectedBooking.serviceName || '-'],
                      ['Visit Type', getBookingTypeLabel(selectedBooking.bookingType || 'store')],
                      ['Date & Time', `${selectedBooking.date || '-'} ${selectedBooking.slot || ''}`],
                      ['Amount', `Rs ${money(selectedBooking.amountCollected || selectedBooking.estimatedTotal)}`],
                    ].map(([label, value]) => (
                      <div key={label} className="admin-detail-kv-item">
                        <span className="admin-detail-kv-label">{label}</span>
                        <span className="admin-detail-kv-value">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p style={{ color: 'var(--muted)', marginTop: '14px', fontSize: '13px' }}>No completed appointment selected.</p>}

              <button type="button" onClick={generateFromAppointment} disabled={!selectedBooking} className="btn btn-primary" style={{ marginTop: '18px' }}>
                <ReceiptText size={15} /> Generate Invoice
              </button>
            </div>
          ) : mode === 'boarding' ? (
            <div>
              <h2 style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>Choose Completed Boarding Stay</h2>
              <p style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '14px' }}>Only checked-out or completed boarding stays can be used for invoice generation. Details are locked in this mode.</p>
              <div style={{ position: 'relative' }}>
                <label className="invoice-label">Search or select boarding stay</label>
                <div className={`select-with-icon${boardingSearch ? ' has-clear' : ''}`}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Search or select by dropdown"
                    value={boardingSearch}
                    onChange={event => handleBoardingSearchChange(event.target.value)}
                    onFocus={() => setShowBoardingDropdown(true)}
                    onBlur={() => setTimeout(() => setShowBoardingDropdown(false), 120)}
                    autoComplete="off"
                  />
                  {boardingSearch && (
                    <button type="button" className="select-clear-button" onClick={clearBoardingSearch} aria-label="Clear boarding search">
                      <X size={14} />
                    </button>
                  )}
                  <Search size={16} className="select-icon" />
                </div>
                {showBoardingDropdown && filteredCompletedBoardings.length > 0 && (
                  <div className="dropdown-list">
                    {filteredCompletedBoardings.map(b => (
                      <button
                        key={b.id}
                        type="button"
                        className="dropdown-item"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => handleBoardingSelect(b)}
                      >
                        {boardingLabel(b)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedBoarding ? (
                <div style={{ marginTop: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                  <div className="admin-detail-kv-grid">
                    {[
                      ['Stay ID', shortId(selectedBoarding.id)],
                      ['Customer', selectedBoarding.ownerName || '-'],
                      ['Phone', selectedBoarding.phone || '-'],
                      ['Pet', `${selectedBoarding.petName || '-'}${selectedBoarding.petType ? ` (${selectedBoarding.petType}${selectedBoarding.petBreed ? `, ${selectedBoarding.petBreed}` : ''})` : ''}`],
                      ['Stay Dates', `${selectedBoarding.checkInDate || '-'} to ${selectedBoarding.checkOutDate || '-'}`],
                      ['Check-in / Out Time', `${selectedBoarding.checkInTime || '10:00 AM'} / ${selectedBoarding.checkOutTime || '11:00 PM'}`],
                      ['Duration', `${selectedBoarding.stayDays || 1} Days (${selectedBoarding.stayNights || 1} Nights)`],
                      ['Daily Rate', `Rs ${money(selectedBoarding.dailyRate || 0)}`],
                      ...(Number(selectedBoarding.specialFoodCharge || 0) > 0 ? [['Special Food Charge', `Rs ${money(selectedBoarding.specialFoodCharge)}`]] : []),
                      ...(Number(selectedBoarding.lateCheckOutCharge || 0) > 0 ? [['Late Check-out Fee', `Rs ${money(selectedBoarding.lateCheckOutCharge)}`]] : []),
                      ['Total Stay Amount', `Rs ${money(selectedBoarding.totalAmount || (Number(selectedBoarding.estimatedTotal || 0) + Number(selectedBoarding.specialFoodCharge || 0) + Number(selectedBoarding.lateCheckOutCharge || 0)))}`],
                      ['Amount Collected', `Rs ${money(selectedBoarding.amountCollected || selectedBoarding.totalAmount || selectedBoarding.estimatedTotal || 0)}`],
                    ].map(([label, value]) => (
                      <div key={label} className="admin-detail-kv-item">
                        <span className="admin-detail-kv-label">{label}</span>
                        <span className="admin-detail-kv-value">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p style={{ color: 'var(--muted)', marginTop: '14px', fontSize: '13px' }}>No completed boarding stay selected.</p>}

              <button type="button" onClick={generateFromBoarding} disabled={!selectedBoarding} className="btn btn-primary" style={{ marginTop: '18px' }}>
                <ReceiptText size={15} /> Generate Invoice
              </button>
            </div>
          ) : (
            <CustomInvoiceForm
              custom={custom}
              customers={customers}
              filteredCustomers={filteredCustomers}
              customCustomerSearch={customCustomerSearch}
              onCustomerSearchChange={handleCustomerSearchChange}
              visitChargeFor={visitChargeFor}
              onApplyCustomer={applyCustomer}
              onChange={upd}
              onGenerate={generateCustom}
            />
          )}
        </section>

        <aside style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
          <h2 style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 800, marginBottom: '8px' }}>Generated Invoice</h2>
          {generated ? (
            <div>
              <p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6, marginBottom: '14px' }}>Invoice generated for <strong style={{ color: 'var(--text)' }}>{generated.label}</strong>. What would you like to do?</p>
              <div style={{ display: 'grid', gap: '10px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{
                    background: '#25D366',
                    borderColor: '#25D366',
                    color: '#ffffff',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(37, 211, 102, 0.25)',
                    cursor: 'pointer',
                  }}
                  disabled={busy === 'whatsapp-customer'}
                  onClick={sendInvoiceViaWhatsApp}
                >
                  <MessageCircle size={16} /> Send to Customer (WhatsApp)
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy === 'view'} onClick={() => run('view', viewInvoicePdf)}><Eye size={15} /> View PDF</button>
                <button type="button" className="btn btn-secondary" disabled={busy === 'download'} onClick={() => run('download', downloadInvoicePdf)}><Download size={15} /> Download PDF</button>
                <button type="button" className="btn btn-secondary" disabled={busy === 'whatsapp'} onClick={() => sharePdf('whatsapp')}><Share2 size={15} /> Share PDF</button>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6 }}>Generate an invoice first. The action options will appear here.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

function CustomInvoiceForm({ custom, filteredCustomers, customCustomerSearch, onCustomerSearchChange, visitChargeFor, onApplyCustomer, onChange, onGenerate }) {
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  const customerLabel = customer => `${customer.ownerName || 'Customer'} - ${customer.phone || customer.userEmail || '-'}`

  const setVisitType = bookingType => {
    onChange('bookingType', bookingType)
    onChange('visitCharge', String(visitChargeFor(bookingType) || ''))
    if (bookingType === 'store') onChange('address', '')
  }

  const handleCustomerSelect = customer => {
    const label = customerLabel(customer)
    onCustomerSearchChange(label)
    onApplyCustomer(customer.phone || customer.ownerName || customer.userEmail)
    setShowCustomerDropdown(false)
  }

  const clearCustomerSearch = () => {
    onCustomerSearchChange('')
    onApplyCustomer('')
    setShowCustomerDropdown(false)
  }

  const total = (Number(custom.amountCollected || 0) || 0) + (Number(custom.visitCharge || 0) || 0) + (Number(custom.gstAmount || 0) || 0)

  return (
    <div>
      <h2 style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>Custom Invoice</h2>
      <p style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '14px' }}>Pick an existing customer to prefill, or enter everything manually.</p>

      <div style={{ display: 'grid', gap: '14px' }}>
        <div>
          <label className="invoice-label">Choose Customer</label>
          <div style={{ position: 'relative' }}>
            <div className={`select-with-icon${customCustomerSearch ? ' has-clear' : ''}`}>
              <input
                type="text"
                className="input"
                placeholder="Search or select by dropdown"
                value={customCustomerSearch}
                onChange={event => onCustomerSearchChange(event.target.value)}
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 120)}
                autoComplete="off"
              />
              {customCustomerSearch && (
                <button type="button" className="select-clear-button" onClick={clearCustomerSearch} aria-label="Clear customer search">
                  <X size={14} />
                </button>
              )}
              <Search size={16} className="select-icon" />
            </div>
            {showCustomerDropdown && filteredCustomers.length > 0 && (
              <div className="dropdown-list">
                {filteredCustomers.map(customer => {
                  const key = customer.phone || customer.ownerName || customer.userEmail
                  return (
                    <button
                      key={key}
                      type="button"
                      className="dropdown-item"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => handleCustomerSelect(customer)}
                    >
                      {customerLabel(customer)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="admin-form-grid">
          <Field label="Customer Name *" value={custom.ownerName} onChange={value => onChange('ownerName', value)} placeholder="Full name" />
          <Field label="Phone *" value={custom.phone} onChange={value => onChange('phone', value)} placeholder="10-digit" />
        </div>

        <div className="admin-form-grid">
          <Field label="Email" value={custom.userEmail} onChange={value => onChange('userEmail', value)} placeholder="customer@email.com" />
          <Field label="Pet Name *" value={custom.petName} onChange={value => onChange('petName', value)} placeholder="e.g. Bruno" />
        </div>

        <div className="admin-form-grid">
          <div>
            <label className="invoice-label">Pet Type</label>
            <select className="input" value={custom.petType} onChange={event => onChange('petType', event.target.value)}>
              {PET_TYPES.map(type => <option key={type}>{type}</option>)}
            </select>
          </div>
          <Field label="Pet Breed" value={custom.petBreed} onChange={value => onChange('petBreed', value)} placeholder="Breed" />
        </div>

        <div className="admin-form-grid">
          <Field label="Service Name *" value={custom.serviceName} onChange={value => onChange('serviceName', value)} placeholder="Service or item" />
          <div>
            <label className="invoice-label">Visit Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
              {[['store', 'In Store'], ['home', 'At Home']].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setVisitType(value)}
                  className={custom.bookingType === value ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ padding: '8px 12px', fontSize: '13px', justifyContent: 'center' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {custom.bookingType === 'home' && (
          <Field label="Home Visit Address *" value={custom.address} onChange={value => onChange('address', value)} placeholder="Complete address" />
        )}

        <div className="admin-form-grid">
          <Field type="date" label="Date *" value={custom.date} onChange={value => onChange('date', value)} />
          <Field label="Time" value={custom.slot} onChange={value => onChange('slot', value)} placeholder="e.g. 11:00 AM" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
          <Field type="number" label="Service Amount *" value={custom.amountCollected} onChange={value => onChange('amountCollected', value)} placeholder="600" />
          <Field type="number" label="Visit Charge" value={custom.visitCharge} onChange={value => onChange('visitCharge', value)} placeholder="0" />
          <Field type="number" label="GST Amount" value={custom.gstAmount} onChange={value => onChange('gstAmount', value)} placeholder="0" />
        </div>

        <div>
          <label className="invoice-label">Notes</label>
          <textarea className="input" rows={2} value={custom.notes} onChange={event => onChange('notes', event.target.value)} placeholder="Customer note or terms" />
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ color: 'var(--muted)', fontSize: '13px' }}>Invoice Total</span>
          <strong style={{ color: 'var(--text)' }}>Rs {money(total)}</strong>
        </div>

        <button type="button" onClick={onGenerate} className="btn btn-primary"><ReceiptText size={15} /> Generate Invoice</button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="invoice-label">{label}</label>
      <input type={type} className="input" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder || ''} />
    </div>
  )
}
