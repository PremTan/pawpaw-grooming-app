// src/components/Navbar.jsx
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SetPasswordModal from './SetPasswordModal'
import {
  Building2,
  Calendar,
  ChevronDown,
  Download,
  Footprints,
  Home,
  Image,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  PawPrint,
  Phone,
  Scissors,
  User,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import ThemeSwitcher from './ThemeSwitcher'
import NotificationBell from './NotificationBell'
import BrandLogo from './BrandLogo'
import FestiveBanner from './FestiveBanner'
import PWAInstallModal from './PWAInstallModal'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { db } from '../firebase'
import { fetchBookingSettings, getWorkingStatus } from '../utils/bookingSettings'

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropOpen, setDropOpen] = useState(false)
  const [showPwModal, setShowPwModal] = useState(false)
  const [hoursOpen, setHoursOpen] = useState(false)
  const [workingStatus, setWorkingStatus] = useState(() => getWorkingStatus({}))
  const {
    canShowInstall,
    showIOSModal,
    setShowIOSModal,
    promptInstall,
  } = usePWAInstall()
  const headerBarRef = useRef(null)
  const hasGoogleOnly = user?.providerData?.length === 1 && user.providerData[0]?.providerId === 'google.com'

  const isActive = (path) => (
    path.includes('#')
      ? `${location.pathname}${location.hash}` === path
      : location.pathname === path
  )

  const handleLogout = async () => {
    await logout()
    navigate('/')
    setDropOpen(false)
    setMenuOpen(false)
  }

  useEffect(() => {
    let active = true

    async function fetchStatus() {
      try {
        const settings = await fetchBookingSettings(db)
        if (active) setWorkingStatus(getWorkingStatus(settings))
      } catch (err) {
        console.warn('Using default store status:', err)
      }
    }

    fetchStatus()
    const timer = setInterval(fetchStatus, 60000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const el = headerBarRef.current
    if (!el) return

    const updateHeight = () => {
      const height = el.getBoundingClientRect().height
      if (height > 0) {
        document.documentElement.style.setProperty('--navbar-height', `${Math.round(height)}px`)
      }
    }

    updateHeight()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateHeight) : null
    if (ro) ro.observe(el)
    window.addEventListener('resize', updateHeight)

    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', updateHeight)
    }
  }, [workingStatus, hoursOpen])
  useEffect(() => {
    if (!location.hash) return
    const target = document.querySelector(location.hash)
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash, location.pathname])

  const navLinks = [
    { path: '/', label: 'Home', icon: <Home size={14} /> },
    { path: '/services', label: 'Services', icon: <Scissors size={14} /> },
    { path: '/boarding', label: 'Pet Boarding', icon: <Building2 size={14} /> },
    { path: '/walking', label: 'Pet Walking', icon: <Footprints size={14} /> },
    { path: '/gallery', label: 'Gallery', icon: <Image size={14} /> },
    { path: '/reviews', label: 'Reviews', icon: <MessageSquare size={14} /> },
    { path: '/?view=public#contact', label: 'Contact Us', icon: <Phone size={14} /> },
  ]

  const userLinks = [
    { path: '/book', label: 'Book Grooming', icon: <Calendar size={14} /> },
    { path: '/my-bookings', label: 'My Bookings', icon: <Calendar size={14} /> },
    { path: '/my-pets', label: 'My Pets', icon: <PawPrint size={14} /> },
    { path: '/profile', label: 'Profile', icon: <User size={14} /> },
  ]

  const linkStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 10px',
    borderRadius: '9px',
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--accent)' : 'var(--muted)',
    background: active ? 'var(--accent-bg)' : 'transparent',
    border: `1px solid ${active ? 'var(--accent-border)' : 'transparent'}`,
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
  })

  const mobileLinkStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '11px 12px',
    borderRadius: '10px',
    fontSize: '14px',
    color: active ? 'var(--accent)' : 'var(--text)',
    background: active ? 'var(--accent-bg)' : 'transparent',
    textDecoration: 'none',
    marginBottom: '4px',
    fontWeight: active ? 600 : 400,
  })

  return (
    <>
      <nav className="navbar" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50 }}>
        <div ref={headerBarRef}>
          <FestiveBanner />
          <div style={{ width: '100%', maxWidth: '100%', margin: '0 auto', padding: '0 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', height: '64px', gap: '8px' }}>
              <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginRight: '8px', flexShrink: 0 }}>
                <BrandLogo size="nav" />
              </Link>

              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1, minWidth: 0, overflow: 'hidden' }} className="desktop-nav">
                {navLinks.map((link) => (
                  <Link key={link.path} to={link.path} className="nav-link-animated" style={linkStyle(isActive(link.path))}>
                    {link.icon} {link.label}
                  </Link>
                ))}
                {isAdmin && (
                  <Link to="/admin" className="nav-link-animated" style={linkStyle(location.pathname.startsWith('/admin'))}>
                    <LayoutDashboard size={14} /> Dashboard
                  </Link>
                )}
                {userLinks.map((link) => user && (
                  <Link key={link.path} to={link.path} className="nav-link-animated" style={linkStyle(isActive(link.path))}>
                    {link.icon} {link.label}
                  </Link>
                ))}
              </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }} className="desktop-nav">
                  {canShowInstall && (
                    <button
                      type="button"
                      onClick={promptInstall}
                      className="nav-install-btn desktop"
                      aria-label="Install App"
                      title="Install Paw Paw App"
                    >
                      <Download size={14} className="nav-install-icon" />
                      <span>Install App</span>
                    </button>
                  )}
                  <ThemeSwitcher />
                  {user && <NotificationBell />}

                  {user ? (
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => setDropOpen(!dropOpen)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '999px', padding: '5px 12px 5px 5px', cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        {user.photoURL ? (
                          <img src={user.photoURL} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#000' }}>
                            {(user.displayName || user.email || 'U')[0].toUpperCase()}
                          </div>
                        )}
                        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)', maxWidth: '86px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.displayName || user.email?.split('@')[0]}
                        </span>
                        <ChevronDown size={13} style={{ color: 'var(--muted)' }} />
                      </button>

                      {dropOpen && (
                        <>
                          <div onClick={() => setDropOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '6px', minWidth: '200px', boxShadow: '0 16px 48px rgba(0,0,0,0.3)', zIndex: 50 }}>
                            {hasGoogleOnly && (
                              <button
                                onClick={() => { setShowPwModal(true); setDropOpen(false) }}
                                style={{ width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: '9px', fontSize: '12px', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.15s' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-bg)' }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                              >
                                <KeyRound size={14} /> Set Backup Password
                              </button>
                            )}
                            <button
                              onClick={handleLogout}
                              style={{ width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: '9px', fontSize: '12px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.15s' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                            >
                              <LogOut size={14} /> Logout
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Link to="/login" className="btn btn-secondary" style={{ padding: '8px 18px', fontSize: '13px' }}>Login</Link>
                      <Link to="/book" className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '13px' }}>Book Now</Link>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }} className="mobile-nav">
                  {canShowInstall ? (
                    <button
                      type="button"
                      onClick={promptInstall}
                      className="nav-install-btn mobile"
                      aria-label="Install App"
                      title="Install Paw Paw App"
                    >
                      <Download size={15} />
                      <span className="nav-install-mobile-text">Install</span>
                    </button>
                  ) : (
                    <ThemeSwitcher />
                  )}
                  {user && <NotificationBell />}
                  {isAdmin && (
                    <Link
                      to="/admin"
                      aria-label="Dashboard"
                      title="Dashboard"
                      style={{ background: location.pathname.startsWith('/admin') ? 'var(--accent)' : 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '10px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: location.pathname.startsWith('/admin') ? '#000' : 'var(--accent)', textDecoration: 'none' }}
                    >
                      <LayoutDashboard size={18} />
                    </Link>
                  )}
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '10px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)' }}
                  >
                    {menuOpen ? <X size={20} /> : <Menu size={20} />}
                  </button>
                </div>
              </div>
            </div>

            {workingStatus && (
              <div className={'store-status-strip ' + (workingStatus.open ? 'open' : 'closed') + (hoursOpen ? ' expanded' : '')}>
                <button
                  type="button"
                  className="store-status-main"
                  onClick={() => setHoursOpen(prev => !prev)}
                  aria-expanded={hoursOpen}
                >
                  <span className="store-status-dot" />
                  <strong>{workingStatus.label}</strong>
                  <span>{workingStatus.detail}</span>
                  <ChevronDown size={15} className="store-status-arrow" />
                </button>
                {hoursOpen && (
                  <div className="store-status-details">
                    {workingStatus.windows.length
                      ? workingStatus.windows.map(window => <span key={window}>{window}</span>)
                      : <span>{workingStatus.detail}</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          {menuOpen && (
            <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '12px 16px 28px', maxHeight: 'calc(100dvh - var(--navbar-height, 98px) - 64px)', overflowY: 'auto' }}>
              {/* 1. Home */}
              <Link to="/" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/'))}>
                <Home size={15} /> Home
              </Link>

              {/* 2. Services */}
              <Link to="/services" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/services'))}>
                <Scissors size={15} /> Services
              </Link>

              {/* 3. Pet Boarding */}
              <Link to="/boarding" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/boarding'))}>
                <Building2 size={15} /> Pet Boarding
              </Link>

              {/* 4. Pet Walking */}
              <Link to="/walking" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/walking'))}>
                <Footprints size={15} /> Pet Walking
              </Link>

              {/* 4. Book Grooming */}
              {user && (
                <Link to="/book" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/book'))}>
                  <Calendar size={15} /> Book Grooming
                </Link>
              )}

              {/* 5. My Bookings */}
              {user && (
                <Link to="/my-bookings" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/my-bookings'))}>
                  <Calendar size={15} /> My Bookings
                </Link>
              )}

              {/* 6. My Pets */}
              {user && (
                <Link to="/my-pets" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/my-pets'))}>
                  <PawPrint size={15} /> My Pets
                </Link>
              )}

              {/* 7. Gallery */}
              <Link to="/gallery" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/gallery'))}>
                <Image size={15} /> Gallery
              </Link>

              {/* 8. Reviews */}
              <Link to="/reviews" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/reviews'))}>
                <MessageSquare size={15} /> Reviews
              </Link>

              {/* 9. Contact Us */}
              <Link to="/?view=public#contact" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/?view=public#contact'))}>
                <Phone size={15} /> Contact Us
              </Link>

              {/* 10. Profile */}
              {user && (
                <Link to="/profile" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/profile'))}>
                  <User size={15} /> Profile
                </Link>
              )}

              {/* 11. Dashboard (if admin, below Profile) */}
              {isAdmin && (
                <Link to="/admin" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(location.pathname.startsWith('/admin'))}>
                  <LayoutDashboard size={15} /> Dashboard
                </Link>
              )}

              <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0 10px' }} />

              {/* Install Paw Paw App Card */}
              {canShowInstall && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    promptInstall()
                  }}
                  className="mobile-drawer-install-card"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="mobile-drawer-install-icon">
                      <Download size={16} />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>Install Paw Paw App</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Fast booking & instant alerts</div>
                    </div>
                  </div>
                  <span className="mobile-drawer-install-badge">Install</span>
                </button>
              )}

              {/* Theme Switcher in Mobile Menu (shown when Install button occupies top bar) */}
              {canShowInstall && (
                <div className="mobile-drawer-theme-row">
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Theme</span>
                  <ThemeSwitcher />
                </div>
              )}

              {/* At the end: User info section or Guest buttons */}
              {user ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginBottom: '6px', background: 'var(--accent-bg)', borderRadius: '12px', border: '1px solid var(--accent-border)' }}>
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#000' }}>
                        {(user.displayName || user.email || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.displayName || user.email?.split('@')[0]}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.email}
                      </div>
                    </div>
                  </div>

                  {hasGoogleOnly && (
                    <button
                      onClick={() => { setShowPwModal(true); setMenuOpen(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: '10px', fontSize: '13px', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', marginBottom: '2px' }}
                    >
                      <KeyRound size={15} /> Set Backup Password
                    </button>
                  )}

                  <button
                    onClick={handleLogout}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 12px', borderRadius: '10px', background: 'none', border: 'none', color: '#ef4444', fontSize: '13px', cursor: 'pointer' }}
                  >
                    <LogOut size={15} /> Logout
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                  <Link to="/login" onClick={() => setMenuOpen(false)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Login</Link>
                  <Link to="/book" onClick={() => setMenuOpen(false)} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Book Now</Link>
                </div>
              )}
            </div>
          )}
      </nav>

      <style>{`
        .store-status-strip { position: relative; width: 100%; background: var(--card); border-top: 1px solid var(--border); box-shadow: 0 4px 14px rgba(0,0,0,0.06); }
        .store-status-main { min-height: 34px; width: 100%; max-width: 1200px; margin: 0 auto; padding: 6px 20px; border: 0; background: transparent; color: var(--text); display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; font-size: 12px; }
        .store-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .store-status-strip.open .store-status-dot { background: #22c55e; box-shadow: 0 0 0 4px rgba(34,197,94,0.12); }
        .store-status-strip.closed .store-status-dot { background: #ef4444; box-shadow: 0 0 0 4px rgba(239,68,68,0.12); }
        .store-status-main strong { color: var(--text); white-space: nowrap; }
        .store-status-main span:not(.store-status-dot) { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .store-status-arrow { color: var(--muted); transition: transform .2s ease; flex-shrink: 0; }
        .store-status-strip.expanded .store-status-arrow { transform: rotate(180deg); }
        .store-status-details { max-width: 1200px; margin: 0 auto; padding: 0 20px 10px; display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
        .store-status-details span { border: 1px solid var(--border); background: var(--surface); color: var(--muted); border-radius: 999px; padding: 5px 9px; font-size: 11px; }
        .desktop-nav { display: flex !important; }
        .mobile-nav  { display: none  !important; }
        .nav-link-animated:hover,
        .nav-link-animated:focus-visible,
        .nav-link-animated:active {
          color: var(--accent) !important;
          background: var(--accent-bg) !important;
          border-color: var(--accent-border) !important;
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(0,0,0,0.12);
        }
        .nav-link-animated svg {
          transition: transform 0.2s ease;
        }
        .nav-link-animated:hover svg,
        .nav-link-animated:focus-visible svg,
        .nav-link-animated:active svg {
          transform: translateY(-1px) scale(1.12);
        }
        .nav-install-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: linear-gradient(135deg, rgba(192, 136, 32, 0.12), rgba(192, 136, 32, 0.05));
          border: 1px solid var(--accent-border, rgba(192, 136, 32, 0.25));
          color: var(--accent, #c08820);
          border-radius: 999px;
          padding: 6px 14px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
          text-decoration: none;
        }
        .nav-install-btn:hover {
          background: var(--accent, #c08820);
          border-color: var(--accent, #c08820);
          color: #000;
          box-shadow: 0 4px 14px rgba(192, 136, 32, 0.28);
          transform: translateY(-1px);
        }
        .nav-install-btn.mobile {
          height: 38px;
          padding: 0 12px;
          border-radius: 10px;
          font-size: 12px;
          gap: 5px;
        }
        .mobile-drawer-install-card {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          margin: 6px 0 10px;
          background: linear-gradient(135deg, rgba(192, 136, 32, 0.12), rgba(192, 136, 32, 0.04));
          border: 1px solid var(--accent-border, rgba(192, 136, 32, 0.25));
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
          color: var(--text);
        }
        .mobile-drawer-install-card:hover {
          border-color: var(--accent);
          transform: translateY(-1px);
        }
        .mobile-drawer-install-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: var(--card);
          border: 1px solid var(--accent-border, rgba(192, 136, 32, 0.2));
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          flex-shrink: 0;
        }
        .mobile-drawer-install-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--accent, #c08820);
          color: #000;
          flex-shrink: 0;
        }
        .mobile-drawer-theme-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          margin-bottom: 10px;
          background: var(--accent-bg, rgba(192, 136, 32, 0.04));
          border: 1px solid var(--border);
          border-radius: 12px;
        }
        @media (max-width: 375px) {
          .nav-install-mobile-text {
            display: none;
          }
          .nav-install-btn.mobile {
            padding: 0 10px;
            width: 38px;
            justify-content: center;
          }
        }
        @media (max-width: 520px) {
          .store-status-main { justify-content: flex-start; padding: 6px 14px; }
          .store-status-main span:not(.store-status-dot) { max-width: 52vw; }
          .store-status-details { justify-content: flex-start; padding: 0 14px 10px; }
        }
        @media (max-width: 768px) {
          .desktop-nav { display: none  !important; }
          .mobile-nav  { display: flex  !important; }
        }
      `}</style>

      {showPwModal && <SetPasswordModal onClose={() => setShowPwModal(false)} />}
      <PWAInstallModal
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
      />
    </>
  )
}






