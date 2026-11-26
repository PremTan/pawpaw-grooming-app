// src/App.jsx
import { useState, useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import MobileBottomNav from './components/MobileBottomNav'
import Spinner from './components/Spinner'
import SEO from './components/SEO'
import AdminErrorBoundary from './components/AdminErrorBoundary'
import { lazyWithRetry } from './utils/lazyWithRetry'

// Pages
import Home        from './pages/Home'
import Services    from './pages/Services'
import Book        from './pages/Book'
import BookBoarding from './pages/BookBoarding'
import BookWalking  from './pages/BookWalking'
import MyBookings  from './pages/MyBookings'
import MyPets      from './pages/MyPets'
import Profile     from './pages/Profile'
import Reviews     from './pages/Reviews'
import Login       from './pages/Login'
// Lazy-loaded secondary pages
const Gallery = lazy(() => import('./pages/Gallery'))
const Team = lazy(() => import('./pages/Team'))
const ServiceDetail = lazy(() => import('./pages/ServiceDetail'))
const PublicInvoice = lazy(() => import('./pages/PublicInvoice'))
const WalkerPortal = lazy(() => import('./pages/WalkerPortal'))
const WalkerSetup = lazy(() => import('./pages/WalkerSetup'))
const NotFound = lazy(() => import('./pages/NotFound'))

// Lazy-loaded Admin modules with auto-retry on network/deployment failures
const AdminLayout = lazyWithRetry(() => import('./admin/AdminLayout'), 'AdminLayout')
const AdminDashboard = lazyWithRetry(() => import('./admin/AdminDashboard'), 'AdminDashboard')
const AdminTodayOperations = lazyWithRetry(() => import('./admin/AdminTodayOperations'), 'AdminTodayOperations')
const AdminBookings = lazyWithRetry(() => import('./admin/AdminBookings'), 'AdminBookings')
const AdminBoarding = lazyWithRetry(() => import('./admin/AdminBoarding'), 'AdminBoarding')
const AdminWalking = lazyWithRetry(() => import('./admin/AdminWalking'), 'AdminWalking')
const AdminReviews = lazyWithRetry(() => import('./admin/AdminReviews'), 'AdminReviews')
const AdminGoogleReviews = lazyWithRetry(() => import('./admin/AdminGoogleReviews'), 'AdminGoogleReviews')
const AdminCustomers = lazyWithRetry(() => import('./admin/AdminCustomers'), 'AdminCustomers')
const AdminBlockedUsers = lazyWithRetry(() => import('./admin/AdminBlockedUsers'), 'AdminBlockedUsers')
const AdminGallery = lazyWithRetry(() => import('./admin/AdminGallery'), 'AdminGallery')
const AdminPackages = lazyWithRetry(() => import('./admin/AdminPackages'), 'AdminPackages')
const AdminHeroImages = lazyWithRetry(() => import('./admin/AdminHeroImages'), 'AdminHeroImages')
const AdminServices = lazyWithRetry(() => import('./admin/AdminServices'), 'AdminServices')
const AdminContactInfo = lazyWithRetry(() => import('./admin/AdminContactInfo'), 'AdminContactInfo')
const AdminFooter = lazyWithRetry(() => import('./admin/AdminFooter'), 'AdminFooter')
const AdminBookingSettings = lazyWithRetry(() => import('./admin/AdminBookingSettings'), 'AdminBookingSettings')
const AdminCommonSettings = lazyWithRetry(() => import('./admin/AdminCommonSettings'), 'AdminCommonSettings')
const AdminInvoices = lazyWithRetry(() => import('./admin/AdminInvoices'), 'AdminInvoices')
const AdminTeam = lazyWithRetry(() => import('./admin/AdminTeam'), 'AdminTeam')
const AdminEarnings = lazyWithRetry(() => import('./admin/AdminEarnings'), 'AdminEarnings')
const AdminShopPurchases = lazyWithRetry(() => import('./admin/AdminShopPurchases'), 'AdminShopPurchases')
const AdminOffers = lazyWithRetry(() => import('./admin/AdminOffers'), 'AdminOffers')

function ScrollToTop() {
  const { pathname, search, hash } = useLocation()

  useEffect(() => {
    if (hash) return

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    requestAnimationFrame(() => {
      document.querySelector('.admin-content')?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
  }, [pathname, search, hash])

  return null
}
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ paddingTop: '80px' }}><Spinner text="Checking login..." /></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner text="Checking access..." /></div>
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}

let isInitialAppLaunch = true

function AdminHomeRedirect({ children }) {
  const { user, isAdmin, loading } = useAuth()
  const [shouldRedirect] = useState(() => isInitialAppLaunch)

  useEffect(() => {
    isInitialAppLaunch = false
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner text="Loading..." />
      </div>
    )
  }

  // If opening the website or PWA afresh at root "/", redirect admin directly to /admin dashboard
  if (user && isAdmin && shouldRedirect) {
    return <Navigate to="/admin" replace />
  }

  return children
}

function DashboardRedirect() {
  const location = useLocation()
  return <Navigate to={`/admin${location.search}`} replace />
}

function PublicLayout() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
      <MobileBottomNav />
    </div>
  )
}

export default function App() {
  return (
    <>
      <SEO />
      <ScrollToTop />
      <Suspense fallback={<div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner text="Loading..." /></div>}>
        <Routes>
        {/* Admin — own layout */}
        <Route path="/admin" element={<AdminErrorBoundary><AdminRoute><AdminLayout /></AdminRoute></AdminErrorBoundary>}>
        <Route index            element={<AdminDashboard />} />
        <Route path="dashboard" element={<DashboardRedirect />} />
        <Route path="today"     element={<AdminTodayOperations />} />
        <Route path="operations" element={<AdminTodayOperations />} />
        <Route path="earnings"  element={<AdminEarnings />} />
        <Route path="bookings"  element={<AdminBookings />} />
        <Route path="bookings/:bookingId" element={<AdminBookings />} />
        <Route path="boarding"  element={<AdminBoarding />} />
        <Route path="boarding/:boardingId" element={<AdminBoarding />} />
        <Route path="walking"   element={<AdminWalking />} />
        <Route path="walking/:walkingId" element={<AdminWalking />} />
        <Route path="invoices" element={<AdminInvoices />} />
        <Route path="reviews"   element={<AdminReviews />} />
        <Route path="google-reviews" element={<AdminGoogleReviews />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="blocked-users" element={<AdminBlockedUsers />} />
        <Route path="services"  element={<AdminServices />} />
        <Route path="gallery"   element={<AdminGallery />} />
        <Route path="packages"  element={<AdminPackages />} />
        <Route path="why-choose-us" element={<Navigate to="/admin" replace />} />
        <Route path="hero-images" element={<AdminHeroImages />} />
        <Route path="contact-info" element={<AdminContactInfo />} />
        <Route path="footer" element={<AdminFooter />} />
        <Route path="booking-settings" element={<AdminBookingSettings />} />
        <Route path="common-settings" element={<AdminCommonSettings />} />
        <Route path="team" element={<AdminTeam />} />
        <Route path="shop-purchases" element={<AdminShopPurchases />} />
        <Route path="offers" element={<AdminOffers />} />
      </Route>

      {/* Walker Portal — dedicated mobile view */}
      <Route path="/walker" element={<WalkerPortal />} />
      <Route path="/walker/setup" element={<WalkerSetup />} />

      {/* Public — main layout */}
      <Route element={<PublicLayout />}>
        <Route index element={<AdminHomeRedirect><Home /></AdminHomeRedirect>} />
        <Route path="services" element={<Services />} />
        <Route path="services/:serviceId" element={<ServiceDetail />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="team" element={<Team />} />
        <Route path="gallery" element={<Gallery />} />
        <Route path="login" element={<Login />} />
        <Route path="book" element={<ProtectedRoute><Book /></ProtectedRoute>} />
        <Route path="boarding" element={<ProtectedRoute><BookBoarding /></ProtectedRoute>} />
        <Route path="book-boarding" element={<ProtectedRoute><BookBoarding /></ProtectedRoute>} />
        <Route path="walking" element={<ProtectedRoute><BookWalking /></ProtectedRoute>} />
        <Route path="book-walking" element={<ProtectedRoute><BookWalking /></ProtectedRoute>} />
        <Route path="profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="my-pets" element={<ProtectedRoute><MyPets /></ProtectedRoute>} />
        <Route path="my-bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
        <Route path="invoice/:invoiceId" element={<PublicInvoice />} />
        <Route path="*" element={<NotFound />} />
      </Route>
        </Routes>
      </Suspense>
    </>
  )
}






