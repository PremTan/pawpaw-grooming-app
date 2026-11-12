// src/admin/AdminRadialMenu.jsx
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Building2, Calendar, Footprints, Plus, ReceiptText, ShoppingBag, X } from 'lucide-react'

const RADIUS = 96 // distance in px from center (+) button to shortcut items

// Angles in degrees sweeping counter-clockwise across the top arc:
// 170° (far left: Purchase) -> 130° (mid left: Bookings) -> 90° (top center: Boarding) -> 50° (mid right: Dog Walking) -> 10° (far right: Invoices)
const SHORTCUTS = [
  {
    id: 'purchase',
    label: 'Purchase',
    icon: ShoppingBag,
    to: '/admin/shop-purchases',
    angle: 170,
    delay: 0.02,
  },
  {
    id: 'bookings',
    label: 'Bookings',
    icon: Calendar,
    to: '/admin/bookings',
    angle: 130,
    delay: 0.04,
  },
  {
    id: 'boarding',
    label: 'Boarding',
    icon: Building2,
    to: '/admin/boarding',
    angle: 90,
    delay: 0.06,
  },
  {
    id: 'walking',
    label: 'Dog Walking',
    icon: Footprints,
    to: '/admin/walking',
    angle: 50,
    delay: 0.08,
  },
  {
    id: 'invoices',
    label: 'Invoices',
    icon: ReceiptText,
    to: '/admin/invoices',
    angle: 10,
    delay: 0.10,
  },
]

export default function AdminRadialMenu() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // Only visible on Admin Home screen (Dashboard)
  const isHomeScreen = location.pathname === '/admin' || location.pathname === '/admin/'

  // Auto-close menu when navigating to another page
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!isHomeScreen) return null

  const handleSelect = (item) => {
    setOpen(false)
    navigate(item.to)
  }

  return (
    <>
      {/* Blurred dimmed backdrop when radial menu is open */}
      <div
        className={`admin-radial-backdrop${open ? ' open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />

      <div className="admin-radial-fab-wrapper">
        {/* Arc Background Line & Halo Glow */}
        <svg
          className={`admin-radial-arc-svg${open ? ' open' : ''}`}
          viewBox="0 0 220 130"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="pawpawArcGlow" cx="50%" cy="100%" r="80%">
              <stop offset="0%" stopColor="rgba(212, 175, 55, 0.22)" />
              <stop offset="60%" stopColor="rgba(212, 175, 55, 0.06)" />
              <stop offset="100%" stopColor="rgba(212, 175, 55, 0)" />
            </radialGradient>
            <linearGradient id="pawpawArcStroke" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(212, 175, 55, 0.2)" />
              <stop offset="50%" stopColor="rgba(212, 175, 55, 0.75)" />
              <stop offset="100%" stopColor="rgba(212, 175, 55, 0.2)" />
            </linearGradient>
          </defs>
          {/* Subtle warm halo */}
          <ellipse cx="110" cy="125" rx="105" ry="70" fill="url(#pawpawArcGlow)" />
          {/* Decorative curved golden arc guide */}
          <path
            d="M 17 114 A 96 96 0 0 1 203 114"
            stroke="url(#pawpawArcStroke)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        </svg>

        {/* 5 Radial Shortcut Buttons */}
        <div className="admin-radial-items-container">
          {SHORTCUTS.map((item) => {
            const rad = (item.angle * Math.PI) / 180
            const x = Math.round(RADIUS * Math.cos(rad))
            const y = Math.round(-RADIUS * Math.sin(rad))
            const Icon = item.icon

            return (
              <button
                key={item.id}
                type="button"
                className={`admin-radial-item${open ? ' open' : ''}`}
                style={{
                  transform: open
                    ? `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1)`
                    : 'translate(-50%, -50%) scale(0.2)',
                  transitionDelay: `${open ? item.delay : 0}s`,
                }}
                onClick={() => handleSelect(item)}
                title={item.label}
                aria-label={item.label}
                tabIndex={open ? 0 : -1}
              >
                <div className="admin-radial-item-icon">
                  <Icon size={16} />
                </div>
                <span className="admin-radial-item-label">{item.label}</span>
              </button>
            )
          })}
        </div>

        {/* Center Circular FAB Toggle Button */}
        <button
          type="button"
          className={`admin-radial-center-btn${open ? ' open' : ''}`}
          onClick={() => setOpen(prev => !prev)}
          aria-label={open ? 'Close admin shortcuts' : 'Open admin shortcuts'}
          aria-expanded={open}
        >
          {open ? <X size={20} strokeWidth={2.5} /> : <Plus size={22} strokeWidth={2.5} />}
        </button>
      </div>
    </>
  )
}
