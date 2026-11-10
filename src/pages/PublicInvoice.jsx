// src/pages/PublicInvoice.jsx
import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { CheckCircle2, Download, Eye, FileText, Home, MessageCircle, Phone, Sparkles } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import BrandLogo from '../components/BrandLogo'
import { fetchBusinessInfo } from '../utils/businessInfo'
import { decodeInvoicePayload, downloadInvoicePdf, getInvoiceNumber, viewInvoicePdf } from '../utils/invoicePdf'
import { getBookingTypeLabel } from '../utils/bookingSettings'

const money = (value) => Number(value || 0).toLocaleString('en-IN')

export default function PublicInvoice() {
  const { invoiceId } = useParams()
  const [searchParams] = useSearchParams()
  const [booking, setBooking] = useState(null)
  const [businessInfo, setBusinessInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [downloadState, setDownloadState] = useState('idle') // 'idle' | 'downloading' | 'completed' | 'blocked'
  const [error, setError] = useState('')
  const hasAutoDownloaded = useRef(false)

  useEffect(() => {
    async function loadInvoice() {
      // 1. Check if payload is in ?d= parameter (for backwards compatibility with previously sent links)
      const dParam = searchParams.get('d')
      if (dParam) {
        const decoded = decodeInvoicePayload(dParam)
        if (decoded && (decoded.id || decoded.ownerName || decoded.invoiceNumber)) {
          setBooking(decoded)
          setLoading(false)
          document.title = `Invoice ${decoded.invoiceNumber || getInvoiceNumber(decoded)} | Paw Paw Pet Grooming`
          fetchBusinessInfo(db).then(info => setBusinessInfo(info || {})).catch(() => setBusinessInfo({}))
          return
        }
      }

      if (!invoiceId) {
        setError('Invoice ID is missing.')
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const info = await fetchBusinessInfo(db).catch(() => ({}))
        setBusinessInfo(info || {})

        // 2. Try settings/inv_{id} (Guaranteed public read in live Firestore rules)
        let snap = await getDoc(doc(db, 'settings', `inv_${invoiceId}`)).catch(() => null)
        if (!snap || !snap.exists()) {
          snap = await getDoc(doc(db, 'settings', `inv_${invoiceId.toLowerCase()}`)).catch(() => null)
        }
        if (!snap || !snap.exists()) {
          snap = await getDoc(doc(db, 'settings', `inv_${invoiceId.toUpperCase()}`)).catch(() => null)
        }

        // 3. Try publicInvoices collection
        if (!snap || !snap.exists()) {
          snap = await getDoc(doc(db, 'publicInvoices', invoiceId)).catch(() => null)
        }

        // 4. Try custom invoices collection
        if (!snap || !snap.exists()) {
          snap = await getDoc(doc(db, 'invoices', invoiceId)).catch(() => null)
        }

        // 5. Try bookings collection (if authenticated)
        if (!snap || !snap.exists()) {
          snap = await getDoc(doc(db, 'bookings', invoiceId)).catch(() => null)
        }

        // 6. Try boardingBookings collection (if authenticated)
        if (!snap || !snap.exists()) {
          snap = await getDoc(doc(db, 'boardingBookings', invoiceId)).catch(() => null)
        }

        if (snap && snap.exists()) {
          const data = { id: snap.id, ...snap.data() }
          setBooking(data)
          document.title = `Invoice ${getInvoiceNumber(data)} | Paw Paw Pet Grooming`
        } else {
          setError('We could not find this invoice. It may have expired or the link is incorrect.')
        }
      } catch (err) {
        console.error('Error loading invoice:', err)
        setError('Could not load invoice. Please try again or contact Paw Paw Pet Grooming.')
      } finally {
        setLoading(false)
      }
    }

    loadInvoice()
  }, [invoiceId, searchParams])

  // Automatically trigger PDF download as soon as invoice details are ready!
  useEffect(() => {
    if (booking && !hasAutoDownloaded.current) {
      hasAutoDownloaded.current = true
      setDownloadState('downloading')
      downloadInvoicePdf(booking, businessInfo || {})
        .then(() => setDownloadState('completed'))
        .catch((err) => {
          console.warn('Direct PDF download blocked or canceled:', err)
          setDownloadState('blocked')
        })
    }
  }, [booking, businessInfo])

  const handleDownload = async () => {
    if (!booking) return
    setDownloading(true)
    try {
      await downloadInvoicePdf(booking, businessInfo || {})
      setDownloadState('completed')
    } catch (err) {
      console.error('Failed to download PDF:', err)
    } finally {
      setDownloading(false)
    }
  }

  const handleView = async () => {
    if (!booking) return
    try {
      await viewInvoicePdf(booking, businessInfo || {})
    } catch (err) {
      console.error('Failed to view PDF:', err)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <Spinner text="Preparing your official PDF invoice..." />
      </div>
    )
  }

  if (error || !booking) {
    return (
      <div style={{ maxWidth: '520px', margin: '40px auto', padding: '32px 20px', textAlign: 'center' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <FileText size={28} />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Invoice Not Found</h2>
        <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>{error || 'This invoice link could not be loaded.'}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <Link to="/" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Home size={15} /> Return Home
          </Link>
        </div>
      </div>
    )
  }

  const invoiceNo = getInvoiceNumber(booking)
  const isBoarding = !!booking.isBoarding
  const amountPaid = Number(booking.amountCollected || booking.totalAmount || booking.estimatedTotal || 0)
  const visitCharge = Number(booking.visitCharge || 0)
  const shopName = businessInfo?.contact?.shopName || 'Paw Paw Pet Grooming'
  const shopPhone = businessInfo?.contact?.phone || businessInfo?.contact?.whatsappNumber || '9021459467'

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '20px 16px 48px' }}>
      {/* Prominent Instant Download Status Banner */}
      <div style={{
        background: downloadState === 'completed'
          ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
          : 'var(--gradient)',
        color: '#ffffff',
        borderRadius: '16px',
        padding: '14px 18px',
        marginBottom: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {downloadState === 'completed' ? <CheckCircle2 size={19} /> : <Download size={19} />}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '14px', lineHeight: 1.2 }}>
              {downloadState === 'completed'
                ? 'Official PDF Downloaded!'
                : downloadState === 'downloading'
                  ? 'Downloading Official PDF...'
                  : 'Official PDF Ready'}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.95, marginTop: '2px' }}>
              {downloadState === 'completed'
                ? 'Saved to your Downloads folder'
                : 'Direct download started automatically'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            style={{
              background: '#ffffff',
              color: '#1a1208',
              border: 'none',
              borderRadius: '999px',
              padding: '7px 15px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              whiteSpace: 'nowrap'
            }}
          >
            <Download size={13} /> {downloadState === 'completed' ? 'Download Again' : 'Download PDF'}
          </button>
          <button
            type="button"
            onClick={handleView}
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: '999px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap'
            }}
          >
            <Eye size={13} /> View
          </button>
        </div>
      </div>

      {/* Main Invoice Card */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
      }}>
        {/* Header Ribbon */}
        <div style={{
          padding: '24px 24px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <div>
            <BrandLogo size="medium" />
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>
              {businessInfo?.contact?.address || 'Professional Pet Grooming & Boarding'}
            </div>
            {shopPhone && (
              <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <Phone size={11} /> {shopPhone}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '999px',
              background: 'rgba(22,163,74,0.12)',
              color: '#16a34a',
              border: '1px solid rgba(22,163,74,0.25)',
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}>
              <CheckCircle2 size={12} /> Paid
            </span>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
              {invoiceNo}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
              Date: {booking.date || booking.checkInDate || new Date().toISOString().slice(0, 10)}
            </div>
          </div>
        </div>

        {/* Customer & Pet Details Grid */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 800, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
              Billed To
            </span>
            <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
              {booking.ownerName || 'Customer'}
            </div>
            {booking.phone && (
              <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '2px' }}>
                Phone: {booking.phone}
              </div>
            )}
            {booking.userEmail && (
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {booking.userEmail}
              </div>
            )}
          </div>

          <div>
            <span style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 800, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
              Pet Information
            </span>
            <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
              🐾 {booking.petName || 'Pet'} {booking.petType ? `(${booking.petType})` : ''}
            </div>
            {booking.petBreed && (
              <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginTop: '2px' }}>
                Breed: {booking.petBreed}
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--accent)', marginTop: '2px', fontWeight: 600 }}>
              {isBoarding ? '🏨 Pet Boarding Stay' : `✂️ ${getBookingTypeLabel(booking.bookingType || 'store')}`}
            </div>
          </div>
        </div>

        {/* Breakdown Items Table */}
        <div style={{ padding: '20px 24px' }}>
          <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 800, color: 'var(--muted)', marginBottom: '12px' }}>
            Service Summary
          </h3>

          <div style={{ display: 'grid', gap: '8px' }}>
            {isBoarding ? (
              <div style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div>
                  <strong style={{ fontSize: '14px', color: 'var(--text)', display: 'block' }}>Pet Boarding Stay</strong>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    {booking.checkInDate || '-'} to {booking.checkOutDate || '-'} ({booking.stayDays || 1} Days)
                  </span>
                </div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
                  Rs {money(amountPaid)}
                </div>
              </div>
            ) : (
              <>
                <div style={{ background: 'var(--surface)', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <div>
                    <strong style={{ fontSize: '14px', color: 'var(--text)', display: 'block' }}>{booking.serviceName || 'Grooming Service'}</strong>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Appointment: {booking.date || '-'} {booking.slot ? `at ${booking.slot}` : ''}
                    </span>
                    {booking.packageNames?.length > 0 && (
                      <div style={{ fontSize: '11.5px', color: 'var(--accent)', marginTop: '3px', fontWeight: 600 }}>
                        + {booking.packageNames.join(', ')}
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>
                    Rs {money(amountPaid - visitCharge)}
                  </div>
                </div>

                {visitCharge > 0 && (
                  <div style={{ background: 'var(--surface)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Home Visit Charge</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text)' }}>Rs {money(visitCharge)}</strong>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Grand Total Bar */}
          <div style={{
            marginTop: '18px',
            padding: '16px 20px',
            borderRadius: '14px',
            background: 'var(--accent-bg)',
            border: '1.5px solid var(--accent-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' }}>
                Total Amount Paid
              </span>
              <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>
                ✓ Payment Received in Full
              </span>
            </div>
            <strong style={{ fontSize: '24px', fontWeight: 900, color: 'var(--accent)' }}>
              Rs {money(amountPaid)}
            </strong>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Thank you for choosing {shopName}! 🐾
          </span>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownload}
              disabled={downloading}
              style={{ fontSize: '13px', padding: '8px 14px' }}
            >
              <Download size={14} /> Download PDF
            </button>
            {shopPhone && (
              <a
                href={`https://wa.me/91${shopPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${shopName}, I have a question regarding invoice ${invoiceNo}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ fontSize: '13px', padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}
              >
                <MessageCircle size={14} /> Contact
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

