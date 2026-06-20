// src/App.jsx
import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Spinner from './components/Spinner'

// Pages
import Home        from './pages/Home'
import Services    from './pages/Services'
import Book        from './pages/Book'
import MyBookings  from './pages/MyBookings'
import MyPets      from './pages/MyPets'
import Profile     from './pages/Profile'
import Reviews     from './pages/Reviews'
import Login       from './pages/Login'
import Gallery     from './pages/Gallery'
import ServiceDetail from './pages/ServiceDetail'
import NotFound    from './pages/NotFound'

// Admin
import AdminLayout    from './admin/AdminLayout'
import AdminDashboard from './admin/AdminDashboard'
import AdminBookings  from './admin/AdminBookings'
import AdminReviews   from './admin/AdminReviews'
import AdminCustomers from './admin/AdminCustomers'
import AdminGallery   from './admin/AdminGallery'
import AdminPackages  from './admin/AdminPackages'
import AdminHeroImages from './admin/AdminHeroImages'
import AdminServices from './admin/AdminServices'
import AdminWhyChooseUs from './admin/AdminWhyChooseUs'
import AdminContactInfo from './admin/AdminContactInfo'
import AdminFooter from './admin/AdminFooter'
import AdminBookingSettings from './admin/AdminBookingSettings'

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

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      {/* Admin — own layout */}
      <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index            element={<AdminDashboard />} />
        <Route path="bookings"  element={<AdminBookings />} />
        <Route path="reviews"   element={<AdminReviews />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="services"  element={<AdminServices />} />
        <Route path="gallery"   element={<AdminGallery />} />
        <Route path="packages"  element={<AdminPackages />} />
        <Route path="why-choose-us" element={<AdminWhyChooseUs />} />
        <Route path="hero-images" element={<AdminHeroImages />} />
        <Route path="contact-info" element={<AdminContactInfo />} />
        <Route path="footer" element={<AdminFooter />} />`r`n        <Route path="booking-settings" element={<AdminBookingSettings />} />
      </Route>

      {/* Public — main layout */}
      <Route path="*" element={
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
          <Navbar />
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/"           element={<Home />} />
              <Route path="/services"   element={<Services />} />
              <Route path="/services/:serviceId" element={<ServiceDetail />} />
              <Route path="/reviews"    element={<Reviews />} />
              <Route path="/gallery"    element={<Gallery />} />
              <Route path="/login"      element={<Login />} />
              <Route path="/book"       element={<ProtectedRoute><Book /></ProtectedRoute>} />
              <Route path="/profile"    element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/my-pets"    element={<ProtectedRoute><MyPets /></ProtectedRoute>} />
              <Route path="/my-bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
              <Route path="*"           element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
      } />
      </Routes>
    </>
  )
}



