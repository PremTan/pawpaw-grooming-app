import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { Download, Eye, MessageCircle, ReceiptText } from 'lucide-react'
import Spinner from '../components/Spinner'
import { db } from '../firebase'
import { PET_TYPES } from '../utils/services'
import { fetchBusinessInfo } from '../utils/businessInfo'
import { downloadInvoicePdf, shareInvoicePdfFile, viewInvoicePdf } from '../utils/invoicePdf'
import { getBookingTypeLabel } from '../utils/bookingSettings'

const blankCustom = {
  ownerName: '', phone: '', userEmail: '', petName: '', petType: 'Dog', petBreed: '',
  serviceName: '', date: '', slot: '', bookingType: 'store', address: '', visitCharge: '',
  amountCollected: '', gstAmount: '', notes: '',
}

const money = value => Number(value || 0).toLocaleString('en-IN')
const shortId = id => `#${String(id || '').slice(0, 8).toUpperCase()}`

export default function AdminInvoices() {
  const [mode, setMode] = useState('appointment')
  const [bookings, setBookings] = useState([])
  const [businessInfo, setBusinessInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [custom, setCustom] = useState(blankCustom)
  const [generated, setGenerated] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [snap, info] = await Promise.all([
          getDocs(query(collection(db, 'bookings'), orderBy('createdAt', 'desc'))),
          fetchBusinessInfo(db),
        ])
        const rows = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        setBookings(rows)
        setBusinessInfo(info)
        const firstCompleted = rows.find(row => row.status === 'completed')
        if (firstCompleted) setSelectedId(firstCompleted.id)
      } catch {
        setError('Could not load invoice data.')
      }
      setLoading(false)
    }
    load()
  }, [])

  const completedBookings = useMemo(() => bookings.filter(booking => booking.status === 'completed'), [bookings])
  const selectedBooking = completedBookings.find(booking => booking.id === selectedId)
  const customers = useMemo(() => {
    const map = new Map()
    bookings.forEach(booking => {
      const key = booking.phone || booking.ownerName || booking.userEmail
      if (!key || map.has(key)) return
      map.set(key, booking)
    })
    return Array.from(map.values())
  }, [bookings])

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
      setError('Select a completed appointment first.')
      return
    }
    setError('')
    setGenerated({ booking: selectedBooking, label: `${selectedBooking.ownerName || 'Customer'} - ${shortId(selectedBooking.id)}` })
  }

  const generateCustom = () => {
    if (!custom.ownerName || !custom.phone || !custom.petName || !custom.serviceName || !custom.date || !custom.amountCollected) {
      setError('Please fill customer, pet, service, date and amount.')
      return
    }
    if (custom.bookingType === 'home' && !custom.address.trim()) {
      setError('Please add address for home visit invoice.')
      return
    }
    setError('')
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

  if (loading) return <div style={{ padding: '28px' }}><Spinner text="Loading invoices..." /></div>

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Invoices</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Generate invoices from completed appointments or create a custom invoice manually.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {[['appointment', 'From Appointment'], ['custom', 'Custom Invoice']].map(([value, label]) => (
          <button key={value} type="button" onClick={() => { setMode(value); setGenerated(null); setError('') }} className={mode === value ? 'btn btn-primary' : 'btn btn-secondary'} style={{ fontSize: '13px' }}>{label}</button>
        ))}
      </div>

      {error && <div style={{ border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', background: 'rgba(239,68,68,0.08)', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(300px, 0.7fr)', gap: '18px', alignItems: 'start' }} className="admin-invoice-layout">
        <section style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
          {mode === 'appointment' ? (
            <div>
              <h2 style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>Choose Completed Appointment</h2>
              <p style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '14px' }}>Only completed appointments can be used for invoice generation. Details are locked in this mode.</p>
              <select className="input" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
                <option value="">Select completed appointment</option>
                {completedBookings.map(booking => (
                  <option key={booking.id} value={booking.id}>{booking.ownerName || 'Customer'} - {booking.petName || 'Pet'} - {booking.date || '-'} - Rs {money(booking.amountCollected || booking.estimatedTotal)}</option>
                ))}
              </select>

              {selectedBooking ? (
                <div className="admin-booking-detail-grid" style={{ marginTop: '16px' }}>
                  {[
                    ['Booking ID', shortId(selectedBooking.id)],
                    ['Customer', selectedBooking.ownerName || '-'],
                    ['Phone', selectedBooking.phone || '-'],
                    ['Pet', `${selectedBooking.petName || '-'}${selectedBooking.petType ? ` (${selectedBooking.petType})` : ''}`],
                    ['Service', selectedBooking.serviceName || '-'],
                    ['Visit Type', getBookingTypeLabel(selectedBooking.bookingType || 'store')],
                    ['Date & Time', `${selectedBooking.date || '-'} ${selectedBooking.slot || ''}`],
                    ['Amount', `Rs ${money(selectedBooking.amountCollected || selectedBooking.estimatedTotal)}`],
                  ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
                </div>
              ) : <p style={{ color: 'var(--muted)', marginTop: '14px', fontSize: '13px' }}>No completed appointment selected.</p>}

              <button type="button" onClick={generateFromAppointment} disabled={!selectedBooking} className="btn btn-primary" style={{ marginTop: '18px' }}>
                <ReceiptText size={15} /> Generate Invoice
              </button>
            </div>
          ) : (
            <CustomInvoiceForm
              custom={custom}
              customers={customers}
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
                <button type="button" className="btn btn-secondary" disabled={busy === 'view'} onClick={() => run('view', viewInvoicePdf)}><Eye size={15} /> View</button>
                <button type="button" className="btn btn-secondary" disabled={busy === 'download'} onClick={() => run('download', downloadInvoicePdf)}><Download size={15} /> Download</button>
                <button type="button" className="btn btn-secondary" disabled={busy === 'whatsapp'} onClick={() => sharePdf('whatsapp')}><MessageCircle size={15} /> Share PDF</button>
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

function CustomInvoiceForm({ custom, customers, visitChargeFor, onApplyCustomer, onChange, onGenerate }) {
  const setVisitType = bookingType => {
    onChange('bookingType', bookingType)
    onChange('visitCharge', String(visitChargeFor(bookingType) || ''))
    if (bookingType === 'store') onChange('address', '')
  }

  const total = (Number(custom.amountCollected || 0) || 0) + (Number(custom.visitCharge || 0) || 0) + (Number(custom.gstAmount || 0) || 0)

  return (
    <div>
      <h2 style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 800, marginBottom: '6px' }}>Custom Invoice</h2>
      <p style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '14px' }}>Pick an existing customer to prefill, or enter everything manually.</p>

      <div style={{ display: 'grid', gap: '14px' }}>
        <div>
          <label className="invoice-label">Choose Customer</label>
          <select className="input" onChange={event => onApplyCustomer(event.target.value)} defaultValue="">
            <option value="">Add manually</option>
            {customers.map(customer => {
              const key = customer.phone || customer.ownerName || customer.userEmail
              return <option key={key} value={key}>{customer.ownerName || 'Customer'} - {customer.phone || customer.userEmail || '-'}</option>
            })}
          </select>
        </div>

        <div className="admin-form-grid">
          <Field label="Customer Name *" value={custom.ownerName} onChange={value => onChange('ownerName', value)} placeholder="Full name" />
          <Field label="Phone *" value={custom.phone} onChange={value => onChange('phone', value)} placeholder="10-digit" />
        </div>
        <Field label="Email" value={custom.userEmail} onChange={value => onChange('userEmail', value)} placeholder="customer@email.com" />

        <div className="admin-form-grid">
          <Field label="Pet Name *" value={custom.petName} onChange={value => onChange('petName', value)} placeholder="e.g. Bruno" />
          <div>
            <label className="invoice-label">Pet Type</label>
            <select className="input" value={custom.petType} onChange={event => onChange('petType', event.target.value)}>
              {PET_TYPES.map(type => <option key={type}>{type}</option>)}
            </select>
          </div>
        </div>
        <Field label="Pet Breed" value={custom.petBreed} onChange={value => onChange('petBreed', value)} placeholder="Breed" />
        <Field label="Service Name *" value={custom.serviceName} onChange={value => onChange('serviceName', value)} placeholder="Service or item" />

        <div className="admin-form-grid">
          <Field type="date" label="Date *" value={custom.date} onChange={value => onChange('date', value)} />
          <Field label="Time" value={custom.slot} onChange={value => onChange('slot', value)} placeholder="e.g. 11:00 AM" />
        </div>

        <div>
          <label className="invoice-label">Visit Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
            {[['store', 'In Store'], ['home', 'At Home']].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setVisitType(value)} className={custom.bookingType === value ? 'btn btn-primary' : 'btn btn-secondary'}>{label}</button>
            ))}
          </div>
        </div>
        {custom.bookingType === 'home' && <Field label="Home Visit Address *" value={custom.address} onChange={value => onChange('address', value)} placeholder="Complete address" />}

        <div className="admin-form-grid">
          <Field type="number" label="Service Amount *" value={custom.amountCollected} onChange={value => onChange('amountCollected', value)} placeholder="600" />
          <Field type="number" label="Visit Charge" value={custom.visitCharge} onChange={value => onChange('visitCharge', value)} placeholder="0" />
        </div>
        <Field type="number" label="GST" value={custom.gstAmount} onChange={value => onChange('gstAmount', value)} placeholder="0" />
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
