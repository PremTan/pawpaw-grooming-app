// // src/components/Navbar.jsx
// import { useEffect, useState } from 'react'
// import { Link, useLocation, useNavigate } from 'react-router-dom'
// import SetPasswordModal from './SetPasswordModal'
// import {
//   Calendar,
//   ChevronDown,
//   Home,
//   Image,
//   LayoutDashboard,
//   LogOut,
//   Menu,
//   MessageSquare,
//   PawPrint,
//   Phone,
//   Scissors,
//   User,
//   X,
// } from 'lucide-react'
// import { useAuth } from '../context/AuthContext'
// import ThemeSwitcher from './ThemeSwitcher'
// import NotificationBell from './NotificationBell'
// import BrandLogo from './BrandLogo'

// export default function Navbar() {
//   const { user, logout, isAdmin } = useAuth()
//   const location = useLocation()
//   const navigate = useNavigate()
//   const [menuOpen, setMenuOpen] = useState(false)
//   const [dropOpen, setDropOpen] = useState(false)

//   const [showPwModal, setShowPwModal] = useState(false)
// const hasGoogleOnly = user?.providerData?.length === 1 && user.providerData[0]?.providerId === 'google.com'

//   const isActive = (path) => (
//     path.includes('#')
//       ? `${location.pathname}${location.hash}` === path
//       : location.pathname === path
//   )

//   const handleLogout = async () => {
//     await logout()
//     navigate('/')
//     setDropOpen(false)
//     setMenuOpen(false)
//   }

//   useEffect(() => {
//     if (!location.hash) return
//     const target = document.querySelector(location.hash)
//     if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
//   }, [location.hash, location.pathname])

//   const navLinks = [
//     { path: '/', label: 'Home', icon: <Home size={14} /> },
//     { path: '/services', label: 'Services', icon: <Scissors size={14} /> },
//     { path: '/reviews', label: 'Reviews', icon: <MessageSquare size={14} /> },
//     { path: '/gallery', label: 'Gallery', icon: <Image size={14} /> },
//     { path: '/#contact', label: 'Contact Us', icon: <Phone size={14} /> },
//   ]

//   {hasGoogleOnly && (
//   <button onClick={() => { setShowPwModal(true); setDropOpen(false) }}
//     style={{ width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: '9px', fontSize: '13px', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}
//   >🔑 Set Backup Password</button>
// )}

//   const userLinks = [
//     { path: '/book', label: 'Book', icon: <Calendar size={14} /> },
//     { path: '/my-pets', label: 'My Pets', icon: <PawPrint size={14} /> },
//     { path: '/profile', label: 'Profile', icon: <User size={14} /> },
//   ]

//   const linkStyle = (active) => ({
//     display: 'flex',
//     alignItems: 'center',
//     gap: '6px',
//     padding: '7px 13px',
//     borderRadius: '9px',
//     fontSize: '13px',
//     fontWeight: active ? 600 : 400,
//     color: active ? 'var(--accent)' : 'var(--muted)',
//     background: active ? 'var(--accent-bg)' : 'transparent',
//     border: `1px solid ${active ? 'var(--accent-border)' : 'transparent'}`,
//     textDecoration: 'none',
//     transition: 'all 0.2s ease',
//     whiteSpace: 'nowrap',
//   })

//   const mobileLinkStyle = (active) => ({
//     display: 'flex',
//     alignItems: 'center',
//     gap: '10px',
//     padding: '11px 12px',
//     borderRadius: '10px',
//     fontSize: '14px',
//     color: active ? 'var(--accent)' : 'var(--text)',
//     background: active ? 'var(--accent-bg)' : 'transparent',
//     textDecoration: 'none',
//     marginBottom: '4px',
//     fontWeight: active ? 600 : 400,
//   })

//   {hasGoogleOnly && (
//   <button onClick={() => { setShowPwModal(true); setMenuOpen(false) }}
//     style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: '10px', fontSize: '14px', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', marginBottom: '4px' }}
//   >🔑 Set Backup Password</button>
// )}

// {showPwModal && <SetPasswordModal onClose={() => setShowPwModal(false)} />}
//   return (
//     <>
//       <nav className="navbar" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50 }}>
//         <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
//           <div style={{ display: 'flex', alignItems: 'center', height: '64px', gap: '8px' }}>
//             <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginRight: '8px', flexShrink: 0 }}>
//               <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px var(--accent-bg)' }}>
//                 <PawPrint size={18} color="var(--text)" />
//               </div>
//               <div>
//                 <div style={{ fontFamily: '"Playfair Display",serif', fontWeight: 700, fontSize: '16px', color: 'var(--text)', lineHeight: 1 }}>Paw Paw</div>
//                 <div style={{ fontSize: '9px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: '2px' }}>Pet Grooming</div>
//               </div>
//             </Link>

//             <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }} className="desktop-nav">
//               {navLinks.map((link) => (
//                 <Link key={link.path} to={link.path} className="nav-link-animated" style={linkStyle(isActive(link.path))}>
//                   {link.icon} {link.label}
//                 </Link>
//               ))}
//               {isAdmin && (
//                 <Link to="/admin" className="nav-link-animated" style={linkStyle(location.pathname.startsWith('/admin'))}>
//                   <LayoutDashboard size={14} /> Dashboard
//                 </Link>
//               )}
//               {userLinks.map((link) => user && (
//                 <Link key={link.path} to={link.path} className="nav-link-animated" style={linkStyle(isActive(link.path))}>
//                   {link.icon} {link.label}
//                 </Link>
//               ))}
//             </div>

//             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }} className="desktop-nav">
//               <ThemeSwitcher />
//               {user && <NotificationBell />}

//               {user ? (
//                 <div style={{ position: 'relative' }}>
//                   <button
//                     onClick={() => setDropOpen(!dropOpen)}
//                     style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '999px', padding: '5px 12px 5px 5px', cursor: 'pointer', transition: 'all 0.2s' }}
//                   >
//                     {user.photoURL ? (
//                       <img src={user.photoURL} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
//                     ) : (
//                       <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#000' }}>
//                         {(user.displayName || user.email || 'U')[0].toUpperCase()}
//                       </div>
//                     )}
//                     <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
//                       {user.displayName || user.email?.split('@')[0]}
//                     </span>
//                     <ChevronDown size={13} style={{ color: 'var(--muted)' }} />
//                   </button>

//                   {dropOpen && (
//                     <>
//                       <div onClick={() => setDropOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
//                       <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '6px', minWidth: '200px', boxShadow: '0 16px 48px rgba(0,0,0,0.3)', zIndex: 50 }}>
//                         <button
//                           onClick={handleLogout}
//                           style={{ width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: '9px', fontSize: '13px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.15s' }}
//                           onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
//                           onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
//                         >
//                           <LogOut size={14} /> Logout
//                         </button>
//                       </div>
//                     </>
//                   )}
//                 </div>
//               ) : (
//                 <div style={{ display: 'flex', gap: '8px' }}>
//                   <Link to="/login" className="btn btn-secondary" style={{ padding: '8px 18px', fontSize: '13px' }}>Login</Link>
//                   <Link to="/book" className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '13px' }}>Book Now</Link>
//                 </div>
//               )}
//             </div>

//             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }} className="mobile-nav">
//               <ThemeSwitcher />
//               {user && <NotificationBell />}
//               <button
//                 onClick={() => setMenuOpen(!menuOpen)}
//                 style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '10px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)' }}
//               >
//                 {menuOpen ? <X size={20} /> : <Menu size={20} />}
//               </button>
//             </div>
//           </div>
//         </div>

//         {menuOpen && (
//           <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '12px 16px 16px' }}>
//             {navLinks.map((link) => (
//               <Link key={link.path} to={link.path} onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive(link.path))}>
//                 {link.icon} {link.label}
//               </Link>
//             ))}

//             <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />

//             {user ? (
//               <>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginBottom: '4px' }}>
//                   {user.photoURL ? (
//                     <img src={user.photoURL} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
//                   ) : (
//                     <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#000' }}>
//                       {(user.displayName || user.email || 'U')[0].toUpperCase()}
//                     </div>
//                   )}
//                   <div>
//                     <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{user.displayName || user.email?.split('@')[0]}</div>
//                     <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{user.email}</div>
//                   </div>
//                 </div>

//                 {userLinks.map((link) => (
//                   <Link key={link.path} to={link.path} onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive(link.path))}>
//                     {link.icon} {link.label}
//                   </Link>
//                 ))}
//                 <Link to="/my-bookings" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/my-bookings'))}>
//                   <Calendar size={14} /> My Bookings
//                 </Link>
//                 {isAdmin && (
//                   <Link to="/admin" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(location.pathname.startsWith('/admin'))}>
//                     <LayoutDashboard size={14} /> Dashboard
//                   </Link>
//                 )}

//                 <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
//                 <button
//                   onClick={handleLogout}
//                   style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '11px 12px', borderRadius: '10px', background: 'none', border: 'none', color: '#ef4444', fontSize: '14px', cursor: 'pointer' }}
//                 >
//                   <LogOut size={15} /> Logout
//                 </button>
//               </>
//             ) : (
//               <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
//                 <Link to="/login" onClick={() => setMenuOpen(false)} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>Login</Link>
//                 <Link to="/book" onClick={() => setMenuOpen(false)} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Book Now</Link>
//               </div>
//             )}
//           </div>
//         )}
//       </nav>

//       <style>{`
//         .desktop-nav { display: flex !important; }
//         .mobile-nav  { display: none  !important; }
//         .nav-link-animated:hover,
//         .nav-link-animated:focus-visible,
//         .nav-link-animated:active {
//           color: var(--accent) !important;
//           background: var(--accent-bg) !important;
//           border-color: var(--accent-border) !important;
//           transform: translateY(-2px);
//           box-shadow: 0 10px 24px rgba(0,0,0,0.12);
//         }
//         .nav-link-animated svg {
//           transition: transform 0.2s ease;
//         }
//         .nav-link-animated:hover svg,
//         .nav-link-animated:focus-visible svg,
//         .nav-link-animated:active svg {
//           transform: translateY(-1px) scale(1.12);
//         }
//         @media (max-width: 768px) {
//           .desktop-nav { display: none  !important; }
//           .mobile-nav  { display: flex  !important; }
//         }
//       `}</style>
//     </>
//   )
// }

// src/components/Navbar.jsx
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SetPasswordModal from './SetPasswordModal'
import {
  Calendar,
  ChevronDown,
  Home,
  Image,
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

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropOpen, setDropOpen] = useState(false)
  const [showPwModal, setShowPwModal] = useState(false)
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
    if (!location.hash) return
    const target = document.querySelector(location.hash)
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash, location.pathname])

  const navLinks = [
    { path: '/', label: 'Home', icon: <Home size={14} /> },
    { path: '/services', label: 'Services', icon: <Scissors size={14} /> },
    { path: '/reviews', label: 'Reviews', icon: <MessageSquare size={14} /> },
    { path: '/gallery', label: 'Gallery', icon: <Image size={14} /> },
    { path: '/#contact', label: 'Contact Us', icon: <Phone size={14} /> },
  ]

  const userLinks = [
    { path: '/book', label: 'Book', icon: <Calendar size={14} /> },
    { path: '/my-pets', label: 'My Pets', icon: <PawPrint size={14} /> },
    { path: '/profile', label: 'Profile', icon: <User size={14} /> },
  ]

  const linkStyle = (active) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 13px',
    borderRadius: '9px',
    fontSize: '13px',
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
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: '64px', gap: '8px' }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', marginRight: '8px', flexShrink: 0 }}>
              <BrandLogo size="nav" />
            </Link>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }} className="desktop-nav">
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
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                            style={{ width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: '9px', fontSize: '13px', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.15s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-bg)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                          >
                            🔑 Set Backup Password
                          </button>
                        )}
                        <button
                          onClick={handleLogout}
                          style={{ width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: '9px', fontSize: '13px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.15s' }}
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
              <ThemeSwitcher />
              {user && <NotificationBell />}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '10px', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--accent)' }}
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {menuOpen && (
          <div style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '12px 16px 16px' }}>
            {navLinks.map((link) => (
              <Link key={link.path} to={link.path} onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive(link.path))}>
                {link.icon} {link.label}
              </Link>
            ))}

            <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />

            {user ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginBottom: '4px' }}>
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#000' }}>
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{user.displayName || user.email?.split('@')[0]}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{user.email}</div>
                  </div>
                </div>

                {userLinks.map((link) => (
                  <Link key={link.path} to={link.path} onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive(link.path))}>
                    {link.icon} {link.label}
                  </Link>
                ))}
                <Link to="/my-bookings" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(isActive('/my-bookings'))}>
                  <Calendar size={14} /> My Bookings
                </Link>
                {isAdmin && (
                  <Link to="/admin" onClick={() => setMenuOpen(false)} style={mobileLinkStyle(location.pathname.startsWith('/admin'))}>
                    <LayoutDashboard size={14} /> Dashboard
                  </Link>
                )}
                {hasGoogleOnly && (
                  <button
                    onClick={() => { setShowPwModal(true); setMenuOpen(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', padding: '11px 12px', borderRadius: '10px', fontSize: '14px', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', marginBottom: '4px' }}
                  >
                    🔑 Set Backup Password
                  </button>
                )}

                <div style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }} />
                <button
                  onClick={handleLogout}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '11px 12px', borderRadius: '10px', background: 'none', border: 'none', color: '#ef4444', fontSize: '14px', cursor: 'pointer' }}
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
        @media (max-width: 768px) {
          .desktop-nav { display: none  !important; }
          .mobile-nav  { display: flex  !important; }
        }
      `}</style>

      {showPwModal && <SetPasswordModal onClose={() => setShowPwModal(false)} />}
    </>
  )
}


