// src/components/Footer.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Phone, Mail, Clock, Instagram, Facebook, Youtube, Twitter, Linkedin, Calendar, PawPrint, ChevronRight } from 'lucide-react'
import { db } from '../firebase'
import { fetchBusinessInfo, EMPTY_FOOTER_INFO, EMPTY_CONTACT_INFO } from '../utils/businessInfo'
import BrandLogo from './BrandLogo'

const SOCIAL_ICON_MAP = {
  instagram: <Instagram size={17} />,
  facebook: <Facebook size={17} />,
  youtube: <Youtube size={17} />,
  twitter: <Twitter size={17} />,
  linkedin: <Linkedin size={17} />,
}

const QUICK_LINKS = [
  { to: '/services', label: 'Our Services' },
  { to: '/book', label: 'Book Appointment' },
  { to: '/reviews', label: 'Reviews' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/my-bookings', label: 'My Bookings' },
]

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

  const visibleSocials = Array.isArray(footer.socials)
    ? footer.socials.filter(social => social?.url)
    : []

  return (
    <footer className="footer-shell">
      <div className="footer-inner">
        <div className="footer-main-grid">
          <section className="footer-link-block">
            <h4><PawPrint size={18} /> Quick Links</h4>
            <ul>
              {QUICK_LINKS.map(link => (
                <li key={link.to}>
                  <Link to={link.to}><ChevronRight size={14} /> {link.label}</Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="footer-contact-block">
            <h4><PawPrint size={18} /> Contact Us</h4>
            <div className="footer-contact-list">
              {contactInfo.address && (
                <div><MapPin size={17} /><span>{contactInfo.address}</span></div>
              )}
              {footer.phones?.length > 0 && (
                <div>
                  <Phone size={17} />
                  <span>{footer.phones.map(phone => phone.number).filter(Boolean).join(' / ')}</span>
                </div>
              )}
              {footer.email && (
                <a href={`mailto:${footer.email}`}><Mail size={17} /><span>{footer.email}</span></a>
              )}
              {hoursText && (
                <div><Clock size={17} /><span>{hoursText}</span></div>
              )}
            </div>
          </section>
        </div>

        <div className="footer-bottom">
          <p>(c) {new Date().getFullYear()} {contactInfo.shopName || 'Paw Paw Pet Grooming'}. All rights reserved.</p>
          <div>
            <Link to="/services">Services</Link>
            <Link to="/reviews">Reviews</Link>
            <Link to="/gallery">Gallery</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

