// src/App.jsx
import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import MobileBottomNav from './components/MobileBottomNav'
import Spinner from './components/Spinner'

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
const ServiceDetail = lazy(() => import('./pages/ServiceDetail'))
const PublicInvoice = lazy(() => import('./pages/PublicInvoice'))
const NotFound = lazy(() => import('./pages/NotFound'))

// Lazy-loaded Admin modules (prevents bundling heavy admin code into initial user load)
const AdminLayout = lazy(() => import('./admin/AdminLayout'))
const AdminDashboard = lazy(() => import('./admin/AdminDashboard'))
const AdminBookings = lazy(() => import('./admin/AdminBookings'))
const AdminBoarding = lazy(() => import('./admin/AdminBoarding'))
const AdminWalking = lazy(() => import('./admin/AdminWalking'))
const AdminReviews = lazy(() => import('./admin/AdminReviews'))
const AdminGoogleReviews = lazy(() => import('./admin/AdminGoogleReviews'))
const AdminCustomers = lazy(() => import('./admin/AdminCustomers'))
const AdminBlockedUsers = lazy(() => import('./admin/AdminBlockedUsers'))
const AdminGallery = lazy(() => import('./admin/AdminGallery'))
const AdminPackages = lazy(() => import('./admin/AdminPackages'))
const AdminHeroImages = lazy(() => import('./admin/AdminHeroImages'))
const AdminServices = lazy(() => import('./admin/AdminServices'))
const AdminWhyChooseUs = lazy(() => import('./admin/AdminWhyChooseUs'))
const AdminContactInfo = lazy(() => import('./admin/AdminContactInfo'))
const AdminFooter = lazy(() => import('./admin/AdminFooter'))
const AdminBookingSettings = lazy(() => import('./admin/AdminBookingSettings'))
const AdminInvoices = lazy(() => import('./admin/AdminInvoices'))
const AdminTeam = lazy(() => import('./admin/AdminTeam'))
const AdminShopPurchases = lazy(() => import('./admin/AdminShopPurchases'))
const AdminOffers = lazy(() => import('./admin/AdminOffers'))

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
  if (loading) return <Spinner text="Checking access..." />
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}

function AdminHomeRedirect({ children }) {
  const { isAdmin, loading } = useAuth()
  const location = useLocation()
  const forcePublicHome = new URLSearchParams(location.search).get('view') === 'public'
  if (loading) return <Spinner text="Loading..." />
  if (isAdmin && !forcePublicHome) return <Navigate to="/admin" replace />
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
      <ScrollToTop />
      <Suspense fallback={<div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner text="Loading..." /></div>}>
        <Routes>
        {/* Admin — own layout */}
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index            element={<AdminDashboard />} />
        <Route path="dashboard" element={<DashboardRedirect />} />
        <Route path="bookings"  element={<AdminBookings />} />
        <Route path="bookings/:bookingId" element={<AdminBookings />} />
        <Route path="boarding"  element={<AdminBoarding />} />
        <Route path="walking"   element={<AdminWalking />} />
        <Route path="invoices" element={<AdminInvoices />} />
        <Route path="reviews"   element={<AdminReviews />} />
        <Route path="google-reviews" element={<AdminGoogleReviews />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="blocked-users" element={<AdminBlockedUsers />} />
        <Route path="services"  element={<AdminServices />} />
        <Route path="gallery"   element={<AdminGallery />} />
        <Route path="packages"  element={<AdminPackages />} />
        <Route path="why-choose-us" element={<AdminWhyChooseUs />} />
        <Route path="hero-images" element={<AdminHeroImages />} />
        <Route path="contact-info" element={<AdminContactInfo />} />
        <Route path="footer" element={<AdminFooter />} />
        <Route path="booking-settings" element={<AdminBookingSettings />} />
        <Route path="team" element={<AdminTeam />} />
        <Route path="shop-purchases" element={<AdminShopPurchases />} />
        <Route path="offers" element={<AdminOffers />} />
      </Route>

      {/* Public — main layout */}
      <Route element={<PublicLayout />}>
        <Route index element={<AdminHomeRedirect><Home /></AdminHomeRedirect>} />
        <Route path="services" element={<Services />} />
        <Route path="services/:serviceId" element={<ServiceDetail />} />
        <Route path="reviews" element={<Reviews />} />
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






