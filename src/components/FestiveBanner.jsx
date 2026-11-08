// src/components/FestiveBanner.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { fetchFeaturedOffer } from '../utils/offers'
import { Sparkles, Tag, ArrowRight, X, Check } from 'lucide-react'

export default function FestiveBanner() {
  const [offer, setOffer] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Realtime listener on settings/offers so admin toggling Banner ON/OFF updates immediately
    const unsub = onSnapshot(doc(db, 'settings', 'offers'), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        const list = Array.isArray(data?.list) ? data.list : []
        const today = new Date().toISOString().slice(0, 10)
        const featured = list.find(o => {
          if (!o || o.showBanner !== true || o.isActive === false) return false
          if (o.validFrom && o.validFrom > today) return false
          if (o.validUntil && o.validUntil < today) return false
          return true
        }) || null

        if (!featured) {
          setOffer(null)
          return
        }

        const isDismissed = sessionStorage.getItem(`dismissed_festive_${featured.id}`) === 'true'
        setOffer(isDismissed ? null : featured)
      } else {
        fetchFeaturedOffer(db).then(featured => {
          if (!featured) setOffer(null)
          else {
            const isDismissed = sessionStorage.getItem(`dismissed_festive_${featured.id}`) === 'true'
            setOffer(isDismissed ? null : featured)
          }
        }).catch(() => setOffer(null))
      }
    }, () => {
      fetchFeaturedOffer(db).then(featured => {
        if (!featured) setOffer(null)
        else {
          const isDismissed = sessionStorage.getItem(`dismissed_festive_${featured.id}`) === 'true'
          setOffer(isDismissed ? null : featured)
        }
      }).catch(() => setOffer(null))
    })

    return () => unsub()
  }, [])

  if (!offer || dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    sessionStorage.setItem(`dismissed_festive_${offer.id}`, 'true')
  }

  const handleBook = () => {
    navigator.clipboard.writeText(offer.code).catch(() => {})
    setCopied(true)
    setTimeout(() => {
      navigate(`/book?coupon=${encodeURIComponent(offer.code)}`)
    }, 400)
  }

  const isPercentage = offer.discountType === 'percentage'
  const discountText = isPercentage ? `${offer.discountValue}% OFF` : `₹${offer.discountValue} FLAT OFF`
  const bannerMessage = offer.bannerText || `${offer.title} - ${discountText} on pet grooming!`

  return (
    <aside className="festive-ribbon" aria-label="Special promotion">
      <div className="festive-ribbon-content">
        <div className="festive-ribbon-text">
          <span className="festive-sparkle-pill">
            <Sparkles size={12} /> SPECIAL OFFER
          </span>
          <span className="festive-message">{bannerMessage}</span>
          <span className="festive-code-pill">
            Use Code: <strong>{offer.code}</strong>
          </span>
        </div>

        <div className="festive-ribbon-actions">
          <button type="button" className="festive-book-btn" onClick={handleBook}>
            {copied ? (
              <>
                <Check size={13} /> Code Copied!
              </>
            ) : (
              <>
                <Tag size={13} /> Copy & Book <ArrowRight size={13} />
              </>
            )}
          </button>

          <button
            type="button"
            className="festive-close-btn"
            onClick={handleDismiss}
            aria-label="Dismiss offer banner"
            title="Dismiss offer"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}

