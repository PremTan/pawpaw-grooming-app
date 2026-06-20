// src/admin/AdminLayout.jsx
import { useState } from 'react'
import { Link, Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Award, LayoutDashboard, CalendarCheck, Home, MessageSquare, Users, Image, Images, Package, LogOut, Scissors, MapPin, Share2, Menu, X } from 'lucide-react'
import ThemeSwitcher from '../components/ThemeSwitcher'
import NotificationBell from '../components/NotificationBell'

const LINKS = [
  { to:'/admin',           label:'Dashboard',  icon:<LayoutDashboard size={17}/>, end:true },
  { to:'/admin/bookings',  label:'Bookings',   icon:<CalendarCheck size={17}/> },
  { to:'/admin/customers', label:'Customers',  icon:<Users size={17}/> },
  { to:'/admin/services',  label:'Services',   icon:<Scissors size={17}/> },
  { to:'/admin/packages',  label:'Packages',   icon:<Package size={17}/> },
  { to:'/admin/why-choose-us', label:'Why Choose Us', icon:<Award size={17}/> },
  { to:'/admin/hero-images', label:'Hero Images', icon:<Images size={17}/> },
  { to:'/admin/contact-info', label:'Contact Info', icon:<MapPin size={17}/> },
  { to:'/admin/footer', label:'Footer Settings', icon:<Share2 size={17}/> },
  { to:'/admin/gallery',   label:'Gallery',    icon:<Image size={17}/> },
  { to:'/admin/reviews',   label:'Reviews',    icon:<MessageSquare size={17}/> },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => { await logout(); setMenuOpen(false); navigate('/') }
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className={`admin-shell${menuOpen ? ' admin-menu-open' : ''}`}>
      {menuOpen && <button type="button" className="admin-sidebar-overlay" aria-label="Close admin menu" onClick={closeMenu} />}

      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={{ width:'34px', height:'34px', borderRadius:'10px', background:'var(--gradient)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Scissors size={16} color="#000" />
            </div>
            <div>
              <div style={{ color:'var(--text)', fontSize:'13px', fontWeight:700 }}>Admin Panel</div>
              <div style={{ color:'var(--muted)', fontSize:'10px' }}>Paw Paw Grooming</div>
            </div>
          </div>
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
          <Link to="/" onClick={closeMenu} className="admin-nav-link" style={{ marginBottom:'8px' }}>
            <Home size={17}/> View Home
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
          <button onClick={handleLogout}
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
              <Menu size={20} />
            </button>
            <div className="admin-mobile-title">
              <strong>Admin Panel</strong>
              <span>Paw Paw Grooming</span>
            </div>
          </div>
          <div className="admin-topbar-actions">
            <Link to="/" className="btn btn-secondary admin-home-btn" style={{ fontSize:'12px', padding:'8px 14px', textDecoration:'none' }}>
              <Home size={14}/><span>Home</span>
            </Link>
            <ThemeSwitcher />
            <NotificationBell />
          </div>
        </div>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}