// src/components/Footer.jsx
import { Link } from 'react-router-dom'
import { MapPin, Phone, Mail, Clock, Instagram, Facebook } from 'lucide-react'

export default function Footer() {
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
              Trusted pet grooming in Pune. We treat your pets with love, care, and professional expertise.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[
                { href: 'https://www.instagram.com/thetails.in', icon: <Instagram size={16} /> },
                { href: 'https://www.facebook.com', icon: <Facebook size={16} /> },
              ].map((s, i) => (
                <a key={i} href={s.href} target="_blank" rel="noopener noreferrer"
                  style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', transition: 'all 0.2s', textDecoration: 'none' }}
                >
                  {s.icon}
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
              {[
                { icon: <MapPin size={14} />, text: 'Shop no 208, 1st Floor, Mate Kamthe Bhuruk Complex, Near Bhairavnath Temple, Dhayari, Pune – 411041' },
                { icon: <Phone size={14} />,  text: '8446314149 / 9325475703' },
                { icon: <Mail size={14} />,   text: 'pawpawgrooming@gmail.com' },
                { icon: <Clock size={14} />,  text: 'Mon–Sun: 9:00 AM – 9:00 PM' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6 }}>{item.text}</span>
                </div>
              ))}
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
