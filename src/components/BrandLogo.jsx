import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { PawPrint } from 'lucide-react'
import { db } from '../firebase'

export const FALLBACK_LOGO_PATH = '/logo-fallback.png'

const DEFAULT_BRAND = {
  shopName: 'Paw Paw Pet Grooming',
  tagline: '',
  logoUrl: '',
}

function splitBrandName(shopName) {
  const words = shopName.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 2) return { title: shopName, tagline: '' }
  return {
    title: words.slice(0, 2).join(' '),
    tagline: words.slice(2).join(' '),
  }
}

export default function BrandLogo({ size = 'nav', showText = true, tagline, align = 'left', textOverride }) {
  const [brand, setBrand] = useState(DEFAULT_BRAND)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isError, setIsError] = useState(false)
  const [fallbackFailed, setFallbackFailed] = useState(false)

  useEffect(() => {
    async function fetchBrand() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'contactInfo'))
        if (snap.exists()) {
          const data = snap.data()
          setBrand(prev => ({
            ...prev,
            shopName: data.shopName || prev.shopName,
            logoUrl: data.logoUrl || '',
          }))
        }
      } catch {}
    }
    fetchBrand()
  }, [])

  // Reset loaded/error states whenever the logoUrl changes
  useEffect(() => {
    setIsLoaded(false)
    setIsError(false)
  }, [brand.logoUrl])

  const sizes = {
    nav: { box: 48, radius: 14, icon: 22, title: 16, sub: 9 },
    footer: { box: 44, radius: 12, icon: 20, title: 18, sub: 10 },
    login: { box: 64, radius: 18, icon: 28, title: 26, sub: 13 },
    admin: { box: 44, radius: 12, icon: 20, title: 14, sub: 10 },
  }
  const s = sizes[size] || sizes.nav
  const direction = size === 'login' ? 'column' : 'row'
  const splitBrand = splitBrandName(textOverride || brand.shopName)
  const displayTitle = textOverride || splitBrand.title
  const currentTagline = tagline ?? (brand.tagline || splitBrand.tagline)

  const hasUploadedLogo = Boolean(brand.logoUrl && !isError)
  const showFallbackIcon = fallbackFailed && (!hasUploadedLogo || !isLoaded)

  return (
    <div style={{ display: 'flex', flexDirection: direction, alignItems: 'center', gap: size === 'login' ? '0' : '10px', textAlign: align }}>
      <div
        style={{
          width: `${s.box}px`,
          height: `${s.box}px`,
          borderRadius: `${s.radius}px`,
          background: showFallbackIcon ? 'var(--gradient)' : 'var(--surface)',
          border: showFallbackIcon ? '0' : '1px solid var(--accent-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          boxShadow: size === 'login' ? '0 8px 24px var(--accent-bg)' : '0 4px 12px var(--accent-bg)',
          margin: size === 'login' ? '0 auto 16px' : 0,
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {/* Default Paw Paw Logo: visible immediately on mount and while uploaded logo loads */}
        {!fallbackFailed && (
          <img
            src={FALLBACK_LOGO_PATH}
            alt={`${brand.shopName} logo`}
            onError={e => {
              if (!e.currentTarget.dataset.retried) {
                e.currentTarget.dataset.retried = 'true'
                e.currentTarget.src = '/logo-fallback.webp'
              } else {
                setFallbackFailed(true)
              }
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              padding: size === 'nav' || size === 'admin' ? '2px' : '4px',
              position: hasUploadedLogo && isLoaded ? 'absolute' : 'relative',
              opacity: hasUploadedLogo && isLoaded ? 0 : 1,
              transition: 'opacity 0.25s ease',
            }}
          />
        )}

        {/* Admin-uploaded logo: loads in background, transitions to visible once loaded successfully */}
        {hasUploadedLogo && (
          <img
            src={brand.logoUrl}
            alt={`${brand.shopName} logo`}
            onLoad={() => setIsLoaded(true)}
            onError={() => setIsError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              padding: size === 'nav' || size === 'admin' ? '2px' : '4px',
              position: isLoaded ? 'relative' : 'absolute',
              opacity: isLoaded ? 1 : 0,
              transition: 'opacity 0.25s ease',
              pointerEvents: isLoaded ? 'auto' : 'none',
            }}
          />
        )}

        {/* Emergency fallback icon if logo-fallback image file is missing and no uploaded logo */}
        {showFallbackIcon && (
          <PawPrint size={s.icon} color={size === 'admin' ? '#000' : 'var(--text)'} />
        )}
      </div>
      {showText && (
        <div>
          <div style={{ fontFamily: '"Playfair Display",serif', fontWeight: size === 'login' ? 800 : 700, fontSize: `${s.title}px`, color: 'var(--text)', lineHeight: 1 }}>{displayTitle}</div>
          {currentTagline && <div style={{ fontSize: `${s.sub}px`, color: 'var(--muted)', letterSpacing: size === 'login' ? 0 : '1.5px', textTransform: size === 'login' ? 'none' : 'uppercase', marginTop: size === 'login' ? '4px' : '2px' }}>{currentTagline}</div>}
        </div>
      )}
    </div>
  )
}