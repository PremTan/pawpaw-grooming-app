// src/admin/AdminLayout.jsx
import { useEffect, useState } from 'react'
import { Link, Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { doc, setDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { Award, Ban, Building2, LayoutDashboard, CalendarCheck, CalendarClock, Home, MessageSquare, Users, UserRoundCog, Image, Images, Package, LogOut, ReceiptText, Scissors, MapPin, Share2, Menu, X, ShoppingCart, Tag, Footprints, Sliders, TrendingUp } from 'lucide-react'
import ThemeSwitcher from '../components/ThemeSwitcher'
import NotificationBell from '../components/NotificationBell'
import BrandLogo from '../components/BrandLogo'
import AdminRadialMenu from './AdminRadialMenu'
import ConfirmModal from '../components/ConfirmModal'

const LINKS = [
  { to:'/admin',           label:'Dashboard',  icon:<LayoutDashboard size={17}/>, end:true },
  { to:'/admin/today',     label:"Today's Operations", icon:<CalendarClock size={17}/> },
  { to:'/admin/earnings',  label:'Revenue',    icon:<TrendingUp size={17}/> },
  { to:'/admin/bookings',  label:'Bookings',   icon:<CalendarCheck size={17}/> },
  { to:'/admin/boarding',  label:'Pet Boarding', icon:<Building2 size={17}/> },
  { to:'/admin/walking',   label:'Pet Walking', icon:<Footprints size={17}/> },
  { to:'/admin/invoices',  label:'Invoices',   icon:<ReceiptText size={17}/> },
  { to:'/admin/offers',    label:'Offers & Coupons', icon:<Tag size={17}/> },
  { to:'/admin/common-settings', label:'Common Settings', icon:<Sliders size={17}/> },
  { to:'/admin/customers', label:'Customers',  icon:<Users size={17}/> },
  { to:'/admin/blocked-users', label:'Blocked Users', icon:<Ban size={17}/> },
  { to:'/admin/team', label:'Team', icon:<UserRoundCog size={17}/> },
  { to:'/admin/shop-purchases', label:'Shop Purchases', icon:<ShoppingCart size={17}/> },
  { to:'/admin/services',  label:'Services',   icon:<Scissors size={17}/> },
  { to:'/admin/packages',  label:'Packages',   icon:<Package size={17}/> },
  { to:'/admin/why-choose-us', label:'Why Choose Us', icon:<Award size={17}/> },
  { to:'/admin/hero-images', label:'Hero Images', icon:<Images size={17}/> },
  { to:'/admin/contact-info', label:'Contact Info', icon:<MapPin size={17}/> },
  { to:'/admin/footer', label:'Footer Settings', icon:<Share2 size={17}/> },
  { to:'/admin/gallery',   label:'Gallery',    icon:<Image size={17}/> },
  { to:'/admin/reviews',   label:'Reviews',    icon:<MessageSquare size={17}/> },
  { to:'/admin/google-reviews',   label:'Google Reviews',    icon:<MessageSquare size={17}/> },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const isAtDashboard = location.pathname === '/admin' || location.pathname === '/admin/'
  const homeTarget = isAtDashboard ? '/?view=public' : '/admin'
  const homeTitle = isAtDashboard ? 'View Customer Home' : 'Back to Admin Dashboard'

  useEffect(() => {
    if (!user?.uid) return
    setDoc(doc(db, 'settings', 'general'), { adminUid: user.uid }, { merge: true }).catch(() => {})
  }, [user])

  const [showLogoutModal, setShowLogoutModal] = useState(false)

  const handleLogoutClick = () => {
    setShowLogoutModal(true)
  }

  const handleConfirmLogout = async () => {
    setShowLogoutModal(false)
    setMenuOpen(false)
    await logout()
    navigate('/')
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className={`admin-shell${menuOpen ? ' admin-menu-open' : ''}`}>
      {menuOpen && <button type="button" className="admin-sidebar-overlay" aria-label="Close admin menu" onClick={closeMenu} />}

      <aside className="admin-sidebar">
        <div className="admin-brand">
          <BrandLogo size="admin" tagline="Admin Panel" />
          <button type="button" className="admin-sidebar-close" aria-label="Close admin menu" onClick={closeMenu}>
            <X size={18} />
          </button>
        </div>

        <nav className="admin-sidebar-nav">
          {LINKS.map(link => (
            <NavLink key={link.to} to={link.to} end={link.end}
              onClick={closeMenu}
              className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
              style={{ marginBottom:'2px' }}
            >
              {link.icon} {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-bottom">
          <Link to={homeTarget} onClick={closeMenu} className="admin-nav-link" style={{ marginBottom:'8px' }}>
            <Home size={17}/> {isAtDashboard ? 'View Home' : 'Back to Dashboard'}
          </Link>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px', marginBottom:'8px' }}>
            <div style={{ width:'30px', height:'30px', borderRadius:'50%', background:'var(--accent-bg)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span style={{ color:'var(--accent)', fontWeight:700, fontSize:'12px' }}>{user?.email?.[0]?.toUpperCase()}</span>
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ color:'var(--text)', fontSize:'11px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email}</div>
              <div style={{ color:'var(--accent)', fontSize:'10px' }}>Owner - Admin</div>
            </div>
          </div>
          <button onClick={handleLogoutClick}
            style={{ width:'100%', display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', borderRadius:'9px', background:'none', border:'none', color:'#ef4444', fontSize:'12px', cursor:'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(239,68,68,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background='none'}
          >
            <LogOut size={14}/> Logout
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <div className="admin-topbar-left">
            <button type="button" className="admin-menu-toggle" aria-label="Open admin menu" onClick={() => setMenuOpen(true)}>
              <Menu size={18} />
            </button>
            <div className="admin-mobile-title">
              <strong>Admin Panel</strong>
              <span>Paw Paw Grooming</span>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <Link to={homeTarget} className="admin-home-btn" title={homeTitle} aria-label={homeTitle}>
              <Home size={16} />
            </Link>
            <ThemeSwitcher />
            <NotificationBell />
          </div>
        </div>
        <main className="admin-content">
          <Outlet />
        </main>
        <AdminRadialMenu />
      </div>

      <ConfirmModal
        open={showLogoutModal}
        title="Log Out?"
        message="Are you sure you want to log out of the Admin Panel?"
        confirmText="Log Out"
        cancelText="Cancel"
        danger={true}
        onConfirm={handleConfirmLogout}
        onCancel={() => setShowLogoutModal(false)}
      />
    </div>
  )
}



