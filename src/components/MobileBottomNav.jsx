// src/components/MobileBottomNav.jsx
import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Home, Scissors, Calendar, ClipboardList, User, Hotel, Footprints, ChevronRight, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function MobileBottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [sheetOpen, setSheetOpen] = useState(false)

  // Close booking sheet whenever route changes
  useEffect(() => {
    setSheetOpen(false)
  }, [location.pathname])

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  const handleSelectBooking = (path) => {
    setSheetOpen(false)
    navigate(path)
  }

  return (
    <>
      {/* Pinned Bottom Bar */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Bottom Navigation">
        {/* 1. Home */}
        <Link to="/" className={`bottom-nav-item ${isActive('/') ? 'active' : ''}`}>
          <Home size={20} />
          <span>Home</span>
        </Link>

        {/* 2. Services */}
        <Link to="/services" className={`bottom-nav-item ${isActive('/services') ? 'active' : ''}`}>
          <Scissors size={20} />
          <span>Services</span>
        </Link>

        {/* 3. Center Elevated Book Button */}
        <button
          type="button"
          className={`bottom-nav-book-btn ${sheetOpen ? 'open' : ''}`}
          onClick={() => setSheetOpen(prev => !prev)}
          aria-label="Book an appointment or boarding"
        >
          <div className="book-btn-circle">
            <Calendar size={22} />
          </div>
          <span>Book</span>
        </button>

        {/* 4. My Bookings */}
        <Link to="/my-bookings" className={`bottom-nav-item ${isActive('/my-bookings') ? 'active' : ''}`}>
          <ClipboardList size={20} />
          <span>Bookings</span>
        </Link>

        {/* 5. Profile / Sign In */}
        <Link to={user ? '/profile' : '/login'} className={`bottom-nav-item ${isActive('/profile') || isActive('/login') ? 'active' : ''}`}>
          <User size={20} />
          <span>{user ? 'Profile' : 'Sign In'}</span>
        </Link>
      </nav>

      {/* Booking Option Bottom Sheet */}
      {sheetOpen && (
        <div className="mobile-sheet-overlay" onClick={() => setSheetOpen(false)}>
          <div className="mobile-sheet-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-sheet-header">
              <div className="mobile-sheet-title-row">
                <h3>Book Service</h3>
                <button
                  type="button"
                  className="mobile-sheet-close"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close booking menu"
                >
                  <X size={18} />
                </button>
              </div>
              <p>Choose what you'd like to book for your furry friend</p>
            </div>

            <div className="mobile-sheet-options">
              {/* Option 1: Pet Grooming */}
              <button
                type="button"
                className="mobile-sheet-card"
                onClick={() => handleSelectBooking('/book')}
              >
                <div className="sheet-card-icon grooming">
                  <Scissors size={22} />
                </div>
                <div className="sheet-card-info">
                  <strong>Pet Grooming</strong>
                  <span>Bath, hair cut, styling & spa wellness</span>
                </div>
                <ChevronRight size={18} className="sheet-arrow" />
              </button>

              {/* Option 2: Pet Boarding */}
              <button
                type="button"
                className="mobile-sheet-card"
                onClick={() => handleSelectBooking('/boarding')}
              >
                <div className="sheet-card-icon boarding">
                  <Hotel size={22} />
                </div>
                <div className="sheet-card-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong>Pet Boarding</strong>
                    <span className="sheet-badge-new">NEW</span>
                  </div>
                  <span>Safe, cozy overnight stay & daycare</span>
                </div>
                <ChevronRight size={18} className="sheet-arrow" />
              </button>

              {/* Option 3: Pet Walking */}
              <button
                type="button"
                className="mobile-sheet-card"
                onClick={() => handleSelectBooking('/book-walking')}
              >
                <div className="sheet-card-icon walking">
                  <Footprints size={22} />
                </div>
                <div className="sheet-card-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <strong>Pet Walking</strong>
                    <span className="sheet-badge-new">NEW</span>
                  </div>
                  <span>Daily walks, exercise & route updates</span>
                </div>
                <ChevronRight size={18} className="sheet-arrow" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

