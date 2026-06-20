import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { PawPrint } from 'lucide-react'
import { db } from '../firebase'

const DEFAULT_BRAND = {
  shopName: 'Paw Paw',
  tagline: 'Pet Grooming',
  logoUrl: '',
}

export default function BrandLogo({ size = 'nav', showText = true, tagline, align = 'left', textOverride }) {
  const [brand, setBrand] = useState(DEFAULT_BRAND)

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

  const sizes = {
    nav: { box: 38, radius: 12, icon: 18, title: 16, sub: 9 },
    footer: { box: 40, radius: 12, icon: 18, title: 18, sub: 10 },
    login: { box: 64, radius: 18, icon: 28, title: 26, sub: 13 },
    admin: { box: 34, radius: 10, icon: 16, title: 13, sub: 10 },
  }
  const s = sizes[size] || sizes.nav
  const direction = size === 'login' ? 'column' : 'row'
  const currentTagline = tagline ?? brand.tagline

  return (
    <div style={{ display: 'flex', flexDirection: direction, alignItems: align === 'center' ? 'center' : 'center', gap: size === 'login' ? '0' : '10px', textAlign: align }}>
      <div style={{ width: `${s.box}px`, height: `${s.box}px`, borderRadius: `${s.radius}px`, background: brand.logoUrl ? 'var(--surface)' : 'var(--gradient)', border: brand.logoUrl ? '1px solid var(--accent-border)' : '0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: size === 'login' ? '0 8px 24px var(--accent-bg)' : '0 4px 12px var(--accent-bg)', margin: size === 'login' ? '0 auto 16px' : 0, flexShrink: 0 }}>
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt={`${brand.shopName} logo`} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }} />
        ) : (
          <PawPrint size={s.icon} color={size === 'admin' ? '#000' : 'var(--text)'} />
        )}
      </div>
      {showText && (
        <div>
          <div style={{ fontFamily: '"Playfair Display",serif', fontWeight: size === 'login' ? 800 : 700, fontSize: `${s.title}px`, color: 'var(--text)', lineHeight: 1 }}>{textOverride || brand.shopName}</div>
          {currentTagline && <div style={{ fontSize: `${s.sub}px`, color: 'var(--muted)', letterSpacing: size === 'login' ? 0 : '1.5px', textTransform: size === 'login' ? 'none' : 'uppercase', marginTop: size === 'login' ? '4px' : '2px' }}>{currentTagline}</div>}
        </div>
      )}
    </div>
  )
}
