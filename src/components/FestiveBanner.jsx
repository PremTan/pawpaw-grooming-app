// src/components/FestiveBanner.jsx
import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { fetchActiveOffers } from '../utils/offers'
import { Sparkles, Tag, ArrowRight, X, Check, Gift, Copy } from 'lucide-react'

function TickerCodePill({ code }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <button
      type="button"
      className="festive-code-pill"
      onClick={handleCopy}
      title={`Click to copy coupon code ${code}`}
    >
      {copied ? (
        <>
          <Check size={11} color="#10b981" /> Copied!
        </>
      ) : (
        <>
          Use Code: <strong>{code}</strong> <Copy size={11} style={{ opacity: 0.85 }} />
        </>
      )}
    </button>
  )
}

export default function FestiveBanner() {
  const [bannerOffers, setBannerOffers] = useState([])
  const [allOffers, setAllOffers] = useState([])
  const [showAllModal, setShowAllModal] = useState(false)
  const [copiedModalCode, setCopiedModalCode] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'offers'), (snap) => {
      let list = []
      if (snap.exists()) {
        const data = snap.data()
        list = Array.isArray(data?.list) ? data.list : []
      }
      processOfferList(list)
    }, () => {
      fetchActiveOffers(db).then(list => processOfferList(list)).catch(() => {
        setBannerOffers([])
        setAllOffers([])
      })
    })

    function processOfferList(list) {
      const today = new Date().toISOString().slice(0, 10)
      const valid = list.filter(o => {
        if (!o || o.isActive === false) return false
        if (o.validFrom && o.validFrom > today) return false
        if (o.validUntil && o.validUntil < today) return false
        return true
      })

      setBannerOffers(valid)
      setAllOffers(valid)
    }

    return () => unsub()
  }, [])

  // Body scroll lock when modal is open
  useEffect(() => {
    if (showAllModal) {
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prevOverflow
      }
    }
  }, [showAllModal])

  // Build continuous seamless loop sequence (first half matches second half exactly)
  const loopItems = useMemo(() => {
    if (bannerOffers.length === 0) return []
    let base = [...bannerOffers]
    while (base.length < 3) {
      base = [...base, ...bannerOffers]
    }
    return [...base, ...base]
  }, [bannerOffers])

  if (bannerOffers.length === 0) return null

  const handleModalCopyCode = (code, event) => {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    navigator.clipboard.writeText(code).catch(() => {})
    setCopiedModalCode(code)
    setTimeout(() => setCopiedModalCode(''), 2200)
  }

  const handleBook = (targetOffer) => {
    const code = targetOffer.code
    handleModalCopyCode(code)
    setShowAllModal(false)
    setTimeout(() => {
      const isBoarding = String(code).toLowerCase().includes('board') ||
        targetOffer.applicableService === 'boarding'
      const targetUrl = isBoarding
        ? `/boarding/book?coupon=${encodeURIComponent(code)}`
        : `/book?coupon=${encodeURIComponent(code)}`
      navigate(targetUrl)
    }, 320)
  }

  // Steady, readable news crawler animation speed
  const animDuration = Math.max(24, Math.round(loopItems.length * 7.5)) + 's'

  return (
    <>
      <aside
        className="festive-ribbon"
        aria-label="Special promotions ticker"
      >
        <div className="festive-ribbon-content">
          {/* Continuous News Marquee Ticker */}
          <div className="festive-ticker-container">
            <div
              className="festive-ticker-track"
              style={{ animationDuration: animDuration }}
            >
              {loopItems.map((offer, idx) => {
                const isPercentage = offer.discountType === 'percentage'
                const discountText = isPercentage ? `${offer.discountValue}% OFF` : `₹${offer.discountValue} FLAT OFF`
                const bannerMessage = offer.bannerText || `${offer.title} - ${discountText}`

                return (
                  <div className="festive-ticker-item" key={`${offer.id || offer.code}-${idx}`}>
                    <span className="festive-sparkle-pill">
                      <Sparkles size={11} />
                      {offer.applicableService === 'boarding'
                        ? 'BOARDING'
                        : offer.applicableService === 'grooming'
                          ? 'GROOMING'
                          : 'OFFER'}
                    </span>

                    <span className="festive-ticker-message">
                      {bannerMessage}
                    </span>

                    <TickerCodePill code={offer.code} />

                    <span className="festive-ticker-bullet" aria-hidden="true">•</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Fixed Right Action: Offers (X) Button (no cross button) */}
          <div className="festive-ribbon-actions">
            <button
              type="button"
              className="festive-all-offers-btn"
              onClick={() => setShowAllModal(true)}
              title="View all active deals & coupons"
            >
              <Gift size={13} />
              <span>
                <span className="festive-btn-label-long">All </span>Offers ({allOffers.length})
              </span>
            </button>
          </div>
        </div>
      </aside>

      {showAllModal && typeof document !== 'undefined' && createPortal(
        <div
          className="offers-modal-overlay"
          onClick={() => setShowAllModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="offers-modal-card" onClick={e => e.stopPropagation()}>
            <div className="offers-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'var(--accent-bg, rgba(200,160,60,0.15))',
                  border: '1px solid var(--accent-border, rgba(200,160,60,0.3))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent, #c59b27)',
                  flexShrink: 0
                }}>
                  <Gift size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: 'var(--text, #1c1917)' }}>
                    Available Offers & Coupons
                  </h3>
                  <p style={{ fontSize: '12px', margin: 0, color: 'var(--muted, #78716c)' }}>
                    Tap "Apply & Book" on any code to use it at checkout
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--muted, #78716c)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '50%',
                  display: 'flex'
                }}
                aria-label="Close offers modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="offers-modal-body">
              {allOffers.map((item) => {
                const itemIsPct = item.discountType === 'percentage'
                const itemDiscountVal = itemIsPct ? `${item.discountValue}%` : `₹${item.discountValue}`
                const itemDiscountLabel = itemIsPct ? 'OFF' : 'FLAT OFF'
                const isCopied = copiedModalCode === item.code

                return (
                  <div key={item.id || item.code} className="offer-ticket-item">
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1, minWidth: 0 }}>
                      <div className="offer-ticket-discount-badge">
                        <span style={{ fontSize: '15px', fontWeight: 900 }}>{itemDiscountVal}</span>
                        <span style={{ fontSize: '9px', fontWeight: 800, opacity: 0.95 }}>{itemDiscountLabel}</span>
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 700, color: 'var(--text)' }}>
                            {item.title}
                          </h4>
                          <button
                            type="button"
                            className="offer-ticket-code-pill"
                            onClick={(e) => handleModalCopyCode(item.code, e)}
                            title="Click to copy code"
                          >
                            <Tag size={11} /> {item.code} {isCopied ? <Check size={11} /> : <Copy size={11} />}
                          </button>
                        </div>

                        {item.description && (
                          <p style={{ margin: '0 0 6px 0', fontSize: '12.5px', color: 'var(--muted, #78716c)', lineHeight: 1.35 }}>
                            {item.description}
                          </p>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--muted, #a8a29e)' }}>
                          {Number(item.minBookingAmount) > 0 && (
                            <span>Min spend: ₹{item.minBookingAmount}</span>
                          )}
                          {Number(item.maxDiscountAmount) > 0 && (
                            <span>• Max discount: ₹{item.maxDiscountAmount}</span>
                          )}
                          {item.validUntil && (
                            <span>• Valid till {item.validUntil}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="offer-ticket-actions">
                      <button
                        type="button"
                        onClick={() => handleBook(item)}
                        className="btn btn-primary"
                        style={{
                          fontSize: '12px',
                          padding: '6px 14px',
                          whiteSpace: 'nowrap',
                          borderRadius: '999px',
                          fontWeight: 700
                        }}
                      >
                        {isCopied ? (
                          <>
                            <Check size={12} /> Copied!
                          </>
                        ) : (
                          <>
                            Apply & Book <ArrowRight size={12} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
