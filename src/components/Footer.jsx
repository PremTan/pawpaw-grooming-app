// src/components/Footer.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Phone, Mail, Clock, Instagram, Facebook, Youtube, Twitter, Linkedin } from 'lucide-react'
import { db } from '../firebase'
import { fetchBusinessInfo, EMPTY_FOOTER_INFO, EMPTY_CONTACT_INFO } from '../utils/businessInfo'
import BrandLogo from './BrandLogo'

const SOCIAL_ICON_MAP = {
  instagram: <Instagram size={16} />,
  facebook: <Facebook size={16} />,
  youtube: <Youtube size={16} />,
  twitter: <Twitter size={16} />,
  linkedin: <Linkedin size={16} />,
}

export default function Footer() {
  const [footer, setFooter] = useState(EMPTY_FOOTER_INFO)
  const [contactInfo, setContactInfo] = useState(EMPTY_CONTACT_INFO)
  const [hoursText, setHoursText] = useState('')

  useEffect(() => {
    async function fetchFooter() {
      try {
        const info = await fetchBusinessInfo(db)
        setFooter(info.footer)
        setContactInfo(info.contact)
        setHoursText(info.hoursText || '')
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
            <div style={{ marginBottom: '16px' }}>
              <BrandLogo size="footer" />
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.7, marginBottom: '20px' }}>
              {footer.tagline}
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {footer.socials && footer.socials.map((social, i) => (
                <a key={i} href={social.url} target="_blank" rel="noopener noreferrer"
                  style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', transition: 'all 0.2s', textDecoration: 'none' }}
                >
                  {SOCIAL_ICON_MAP[social.platform] || '🔗'}
                </a>
              ))}
            </div>
            <Link to="/book" className="btn btn-primary" style={{ justifyContent: 'center', fontSize: '13px', width: 'fit-content', minWidth: '180px' }}>
              Book Appointment
            </Link>
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
              {contactInfo.address && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }}><MapPin size={14} /></span>
                  <span style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6 }}>{contactInfo.address}</span>
                </div>
              )}
              {footer.phones?.length > 0 && footer.phones.map((phone, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <a href={`tel:${phone.number}`} style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', textDecoration: 'none' }}>
                    <Phone size={14} /> {phone.number}
                  </a>
                  {phone.isWhatsapp && <span style={{ fontSize: '10px', background: 'var(--accent-bg)', padding: '2px 6px', borderRadius: '3px', color: 'var(--accent)' }}>WhatsApp</span>}
                </div>
              ))}
              {footer.email && (
                <a href={`mailto:${footer.email}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6, textDecoration: 'none' }}>
                  <span style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }}><Mail size={14} /></span>
                  {footer.email}
                </a>
              )}
              {hoursText && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }}><Clock size={14} /></span>
                  <span style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6 }}>{hoursText}</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Bottom */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <p style={{ color: 'var(--muted)', fontSize: '12px' }}>(c) {new Date().getFullYear()} {contactInfo.shopName || 'Paw Paw Pet Grooming'}. All rights reserved.</p>
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

