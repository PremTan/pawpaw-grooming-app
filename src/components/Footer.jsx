// src/components/Footer.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Phone, Mail, Clock, Instagram, Facebook, Youtube, Twitter, Linkedin } from 'lucide-react'
import { db } from '../firebase'
import { doc, getDoc } from 'firebase/firestore'

const SOCIAL_ICON_MAP = {
  instagram: <Instagram size={16} />,
  facebook: <Facebook size={16} />,
  youtube: <Youtube size={16} />,
  twitter: <Twitter size={16} />,
  linkedin: <Linkedin size={16} />,
}

const DEFAULT_FOOTER = {
  tagline: 'Trusted pet grooming in Pune. We treat your pets with love, care, and professional expertise.',
  phones: [
    { number: '8446314149', isWhatsapp: true },
    { number: '9325475703', isWhatsapp: false },
  ],
  email: 'pawpawgrooming@gmail.com',
  socials: [
    { platform: 'instagram', url: 'https://www.instagram.com/thetails.in' },
    { platform: 'facebook', url: 'https://www.facebook.com' },
  ],
}

export default function Footer() {
  const [footer, setFooter] = useState(DEFAULT_FOOTER)
  const [contactInfo, setContactInfo] = useState({
    address: 'Shop no 208, 1st Floor, Mate Kamthe Bhuruk Complex, Near Bhairavnath Temple, Dhayari, Pune – 411041',
    hours: 'Mon–Sun: 9:00 AM – 9:00 PM',
  })

  useEffect(() => {
    async function fetchFooter() {
      try {
        const [footerSnap, contactSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'footerInfo')),
          getDoc(doc(db, 'settings', 'contactInfo')),
        ])
        if (footerSnap.exists()) {
          setFooter(prev => ({ ...prev, ...footerSnap.data() }))
        }
        if (contactSnap.exists()) {
          const data = contactSnap.data()
          setContactInfo(prev => ({
            ...prev,
            address: data.address || prev.address,
            hours: data.hours || prev.hours,
          }))
        }
      } catch {}
    }
    fetchFooter()
  }, [])

  return (
    <footer className="footer-shell">
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '40px', marginBottom: '40px' }}>

          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>🐾</div>
              <div>
                <div style={{ fontFamily: '"Playfair Display",serif', fontWeight: 700, fontSize: '18px', color: 'var(--text)' }}>Paw Paw</div>
                <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Pet Grooming Centre</div>
              </div>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.7, marginBottom: '20px' }}>
              {footer.tagline}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {footer.socials && footer.socials.map((social, i) => (
                <a key={i} href={social.url} target="_blank" rel="noopener noreferrer"
                  style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', transition: 'all 0.2s', textDecoration: 'none' }}
                >
                  {SOCIAL_ICON_MAP[social.platform] || '🔗'}
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 style={{ color: 'var(--text)', fontWeight: 700, marginBottom: '16px', fontSize: '14px' }}>Quick Links</h4>
            <ul style={{ listStyle: 'none', space: '8px' }}>
              {[
                { to: '/services',    label: 'Our Services' },
                { to: '/book',        label: 'Book Appointment' },
                { to: '/reviews',     label: 'Reviews' },
                { to: '/gallery',     label: 'Gallery' },
                { to: '/my-bookings', label: 'My Bookings' },
              ].map(link => (
                <li key={link.to} style={{ marginBottom: '10px' }}>
                  <Link to={link.to} style={{ color: 'var(--muted)', fontSize: '13px', textDecoration: 'none', transition: 'color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
                  >
                    → {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 style={{ color: 'var(--text)', fontWeight: 700, marginBottom: '16px', fontSize: '14px' }}>Contact Us</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <span style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }}><MapPin size={14} /></span>
                <span style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6 }}>{contactInfo.address}</span>
              </div>
              {footer.phones && footer.phones.map((phone, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <a href={`tel:${phone.number}`} style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', textDecoration: 'none' }}>
                    <Phone size={14} /> {phone.number}
                  </a>
                  {phone.isWhatsapp && <span style={{ fontSize: '10px', background: 'var(--accent-bg)', padding: '2px 6px', borderRadius: '3px', color: 'var(--accent)' }}>WhatsApp</span>}
                </div>
              ))}
              <a href={`mailto:${footer.email}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6, textDecoration: 'none' }}>
                <span style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }}><Mail size={14} /></span>
                {footer.email}
              </a>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <span style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }}><Clock size={14} /></span>
                <span style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6 }}>{contactInfo.hours}</span>
              </div>
            </div>
          </div>

          {/* Hours */}
          <div>
            <h4 style={{ color: 'var(--text)', fontWeight: 700, marginBottom: '16px', fontSize: '14px' }}>Working Hours</h4>
            <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
              <p style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>Open 7 Days a Week</p>
              <p style={{ color: 'var(--text)', fontSize: '20px', fontFamily: '"Playfair Display",serif', fontWeight: 800 }}>9 AM – 9 PM</p>
            </div>
            <Link to="/book" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: '13px' }}>
              Book Appointment
            </Link>
          </div>
        </div>

        {/* Bottom */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <p style={{ color: 'var(--muted)', fontSize: '12px' }}>© 2025 Paw Paw Pet Grooming Centre. All rights reserved.</p>
          <div style={{ display: 'flex', gap: '20px' }}>
            {['Services', 'Reviews', 'Gallery'].map(item => (
              <Link key={item} to={`/${item.toLowerCase()}`}
                style={{ color: 'var(--muted)', fontSize: '12px', textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
              >
                {item}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
