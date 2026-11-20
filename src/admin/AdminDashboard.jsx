// src/admin/AdminDashboard.jsx
import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { Link, useSearchParams } from 'react-router-dom'
import { format, startOfToday } from 'date-fns'
import { ArrowRight, Calendar, CalendarCheck, CheckCircle2, Clock, IndianRupee, Plus, Settings, TrendingUp, XCircle } from 'lucide-react'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { calculatePublicStats } from '../utils/publicStats'
import { fetchBookingSettings } from '../utils/bookingSettings'
import RevenueTrendChart from './RevenueTrendChart'
import CustomerOverviewDonut from './CustomerOverviewDonut'

const WalkinModal = lazy(() => import('./WalkinModal'))

const money = (value) => Number(value || 0).toLocaleString('en-IN')
const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-10)

const buildWalkinCustomerIdentity = (booking) => {
  const phone = normalizePhone(booking?.phone)
  const ownerName = String(booking?.ownerName || booking?.name || '').trim().toLowerCase()
  if (phone && ownerName) return `walkin:${phone}:${ownerName}`
  if (phone) return `walkin:${phone}`
  if (ownerName) return `walkin:${ownerName}`
  return booking?.id || 'walkin:unknown'
}

const uniqueCustomerKey = (b) => {
  const bookingUserId = b?.userId && b.userId !== 'walkin' && b.userId !== 'walkin@offline' ? b.userId : ''
  if (bookingUserId) return bookingUserId
  return buildWalkinCustomerIdentity(b)
}

const parseBookingDate = (record) => {
  const candidate =
    record.completedAt ||
    record.checkOutDate ||
    record.date ||
    record.startDate ||
    record.createdAt

  if (!candidate) return new Date()

  if (typeof candidate === 'object' && typeof candidate.toDate === 'function') {
    return candidate.toDate()
  }
  if (typeof candidate.seconds === 'number') {
    return new Date(candidate.seconds * 1000)
  }
  if (typeof candidate === 'string') {
    if (candidate.length === 10 && candidate.includes('-')) {
      const parts = candidate.split('-').map(Number)
      if (parts.length === 3 && !isNaN(parts[0])) {
        return new Date(parts[0], parts[1] - 1, parts[2])
      }
    }
    const parsed = new Date(candidate)
    if (!isNaN(parsed.getTime())) return parsed
  }
  return new Date()
}

let cachedDashboardState = null
let cachedDashboardTime = 0
const DASHBOARD_CACHE_TTL = 3 * 60 * 1000

export default function AdminDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState({
    totalBookings: 0,
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    byService: {},
    totalEarnings: 0,
    todayEarnings: 0,
    todayOnlineEarnings: 0,
    todayWalkInEarnings: 0,
    onlineEarnings: 0,
    walkInEarnings: 0,
    onlineCount: 0,
    walkInCount: 0,
    todayCount: 0,
    customerCount: 0,
    normalizedItems: [],
    rawGroomingBookings: [],
  })

  const [loading, setLoading] = useState(!cachedDashboardState)
  const [showModal, setShowModal] = useState(false)
  const [modalInitialParams, setModalInitialParams] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const today = format(startOfToday(), 'yyyy-MM-dd')

  useEffect(() => {
    if (searchParams.get('action') === 'walkin') {
      const dateParam = searchParams.get('date')
      const slotParam = searchParams.get('slot')
      setModalInitialParams({
        ...(dateParam ? { date: dateParam } : {}),
        ...(slotParam ? { slot: slotParam } : {}),
      })
      setShowModal(true)
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        next.delete('action')
        next.delete('date')
        next.delete('slot')
        return next
      }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const fetchData = async (isBackground = false) => {
    const isFresh = cachedDashboardState && (Date.now() - cachedDashboardTime < DASHBOARD_CACHE_TTL)
    if (isFresh && !isBackground) {
      setData(cachedDashboardState.data)
      setLoading(false)
      // Background revalidation
      fetchData(true)
      return
    }

    if (!isBackground && !cachedDashboardState) {
      setLoading(true)
    }

    try {
      // Step 1: Query all 3 collections in parallel for full 360-degree business activity
      const [gSnap, wSnap, bSnap] = await Promise.all([
        getDocs(collection(db, 'bookings')),
        getDocs(collection(db, 'walkingBookings')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'boardingBookings')).catch(() => ({ docs: [] })),
      ])

      const rawGrooming = gSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const normalized = []
      const customerKeys = new Set()

      let totalEarnings = 0
      let todayEarnings = 0
      let todayOnlineEarnings = 0
      let todayWalkInEarnings = 0
      let onlineEarnings = 0
      let walkInEarnings = 0
      let onlineCount = 0
      let walkInCount = 0
      let pendingCount = 0
      let confirmedCount = 0
      let completedCount = 0
      let cancelledCount = 0
      let todayCount = 0
      const byService = {}

      // 1. Grooming Bookings
      rawGrooming.forEach(b => {
        const cKey = uniqueCustomerKey(b)
        if (cKey) customerKeys.add(cKey)
        if (b.isWalkIn) walkInCount++
        else onlineCount++

        if (b.status === 'pending') pendingCount++
        else if (b.status === 'confirmed') confirmedCount++
        else if (b.status === 'completed') completedCount++
        else if (b.status === 'cancelled') cancelledCount++

        const isCollected = Boolean(b.status === 'completed' && b.amountCollected && parseFloat(b.amountCollected) > 0)
        const amt = isCollected ? (parseFloat(b.amountCollected) || 0) : 0
        const dateObj = parseBookingDate(b)
        const dateYmd = format(dateObj, 'yyyy-MM-dd')

        if (dateYmd === today) {
          todayCount++
          if (isCollected) {
            todayEarnings += amt
            if (b.isWalkIn) todayWalkInEarnings += amt
            else todayOnlineEarnings += amt
          }
        }

        if (isCollected) {
          totalEarnings += amt
          if (b.isWalkIn) walkInEarnings += amt
          else onlineEarnings += amt
        }

        byService['grooming'] = (byService['grooming'] || 0) + 1

        normalized.push({
          id: b.id,
          serviceType: 'grooming',
          customerKey: cKey,
          phone: b.phone || '',
          ownerName: b.ownerName || '',
          amount: amt,
          isCompleted: b.status === 'completed',
          isCollected,
          dateYmd,
          isWalkIn: Boolean(b.isWalkIn),
          serviceName: b.serviceName || (Array.isArray(b.services) ? b.services.join(', ') : 'Grooming'),
        })
      })

      // 2. Walking Bookings (Passes & Single walks)
      wSnap.docs.forEach(docSnap => {
        const w = { id: docSnap.id, ...docSnap.data() }
        const cKey = uniqueCustomerKey(w)
        if (cKey) customerKeys.add(cKey)
        onlineCount++

        const isCompleted = w.status === 'completed'
        if (w.status === 'pending') pendingCount++
        else if (w.status === 'active' || w.status === 'confirmed') confirmedCount++
        else if (isCompleted) completedCount++
        else if (w.status === 'cancelled') cancelledCount++

        const rawAmt = Number(w.amountCollected || w.totalPrice || w.estimatedTotal || 0)
        const isCollected = isCompleted && (rawAmt > 0 || w.paymentStatus === 'paid')
        const amt = isCollected ? rawAmt : 0
        const dateObj = parseBookingDate(w)
        const dateYmd = format(dateObj, 'yyyy-MM-dd')

        if (dateYmd === today) {
          todayCount++
          if (isCollected) {
            todayEarnings += amt
            todayOnlineEarnings += amt
          }
        }

        if (isCollected) {
          totalEarnings += amt
          onlineEarnings += amt
        }

        byService['walking'] = (byService['walking'] || 0) + 1

        normalized.push({
          id: w.id,
          serviceType: 'walking',
          customerKey: cKey,
          phone: w.phone || '',
          ownerName: w.ownerName || w.customerName || '',
          amount: amt,
          isCompleted,
          isCollected,
          dateYmd,
          isWalkIn: false,
          serviceName: w.planType === 'weekly' ? '7-Day Pass' : w.planType === 'monthly' ? '30-Day Pass' : 'Single Walk',
        })
      })

      // 3. Boarding Bookings (Overnight Stays)
      bSnap.docs.forEach(docSnap => {
        const b = { id: docSnap.id, ...docSnap.data() }
        const cKey = uniqueCustomerKey(b)
        if (cKey) customerKeys.add(cKey)
        onlineCount++

        const isCompleted = b.status === 'checked_out' || b.status === 'completed'
        if (b.status === 'pending') pendingCount++
        else if (b.status === 'confirmed') confirmedCount++
        else if (isCompleted) completedCount++
        else if (b.status === 'cancelled') cancelledCount++

        const rawAmt = Number(b.amountCollected || b.estimatedTotal || b.totalPrice || 0)
        const isCollected = isCompleted && rawAmt > 0
        const amt = isCollected ? rawAmt : 0
        const dateObj = parseBookingDate(b)
        const dateYmd = format(dateObj, 'yyyy-MM-dd')

        if (dateYmd === today) {
          todayCount++
          if (isCollected) {
            todayEarnings += amt
            todayOnlineEarnings += amt
          }
        }

        if (isCollected) {
          totalEarnings += amt
          onlineEarnings += amt
        }

        byService['boarding'] = (byService['boarding'] || 0) + 1

        normalized.push({
          id: b.id,
          serviceType: 'boarding',
          customerKey: cKey,
          phone: b.phone || '',
          ownerName: b.ownerName || b.customerName || '',
          amount: amt,
          isCompleted,
          isCollected,
          dateYmd,
          isWalkIn: false,
          serviceName: `${b.petType === 'cat' ? 'Cat' : 'Dog'} Boarding Stay`,
        })
      })

      const computedData = {
        totalBookings: normalized.length,
        todayCount,
        pending: pendingCount,
        confirmed: confirmedCount,
        completed: completedCount,
        cancelled: cancelledCount,
        byService,
        totalEarnings,
        todayEarnings,
        todayOnlineEarnings,
        todayWalkInEarnings,
        onlineEarnings,
        walkInEarnings,
        onlineCount,
        walkInCount,
        customerCount: customerKeys.size,
        normalizedItems: normalized,
        rawGroomingBookings: rawGrooming,
      }

      // UI updates immediately
      setData(computedData)
      setLoading(false)

      cachedDashboardState = {
        data: computedData,
      }
      cachedDashboardTime = Date.now()

      // Step 2: Lazy background tasks (adminUid, reviews, publicStats)
      setTimeout(() => {
        if (user?.uid) {
          setDoc(doc(db, 'settings', 'general'), { adminUid: user.uid }, { merge: true }).catch(() => {})
        }

        // Lazy load reviews & settings to update publicStats without blocking dashboard
        Promise.all([
          fetchBookingSettings(db),
          getDocs(collection(db, 'reviews')).catch(() => ({ docs: [] }))
        ]).then(([settings, rSnap]) => {
          const reviews = rSnap.docs.map(d => d.data())
          const publicStats = calculatePublicStats(rawGrooming, reviews, settings)
          return Promise.all([
            setDoc(doc(db, 'settings', 'homeStats'), { ...publicStats, updatedAt: serverTimestamp() }, { merge: true }),
            setDoc(doc(db, 'settings', 'general'), {
              publicStats,
              totalBookings: publicStats.totalBookings,
              totalReviews: publicStats.totalReviews,
              avgRating: publicStats.avgRating,
              daysOpen: publicStats.daysOpen,
              statsUpdatedAt: serverTimestamp(),
            }, { merge: true }),
          ])
        }).catch(() => {})
      }, 30)

    } catch (err) {
      console.error('Error fetching admin dashboard:', err)
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    if (!toastMessage) return
    const t = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [toastMessage])

  const statCards = [
    {
      label: 'Total Bookings',
      value: data.totalBookings,
      icon: <Calendar size={20} />,
      color: 'var(--accent)',
      split: [
        { label: 'Online', value: data.onlineCount },
        { label: 'Offline', value: data.walkInCount }
      ]
    },
    {
      label: 'Total Earnings',
      value: `Rs ${money(data.totalEarnings)}`,
      icon: <IndianRupee size={20} />,
      color: '#34d399',
      split: [
        { label: 'Online', value: `Rs ${money(data.onlineEarnings)}` },
        { label: 'Offline', value: `Rs ${money(data.walkInEarnings)}` }
      ]
    },
    {
      label: "Today's Earnings",
      value: `Rs ${money(data.todayEarnings)}`,
      icon: <IndianRupee size={20} />,
      color: '#60a5fa',
      split: [
        { label: 'Online', value: `Rs ${money(data.todayOnlineEarnings)}` },
        { label: 'Offline', value: `Rs ${money(data.todayWalkInEarnings)}` }
      ]
    },
    {
      label: "Today's Appointments",
      value: data.todayCount,
      icon: <CalendarCheck size={20} />,
      color: '#22c55e',
      link: `/admin/bookings?date=${today}`,
      action: 'View today appointments'
    },
  ]

  return (
    <div className="admin-page admin-dashboard">
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}

      {/* Header */}
      <div className="admin-page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
              Dashboard
            </h1>
            <Link
              to="/admin/common-settings"
              title="Common Settings (Global Holidays & Center Status)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(217, 119, 6, 0.12)',
                border: '1px solid rgba(217, 119, 6, 0.28)',
                color: '#d97706',
                transition: 'all 0.2s ease',
                textDecoration: 'none',
              }}
              aria-label="Common Settings"
            >
              <Settings size={18} />
            </Link>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
            Overview of Paw Paw Grooming, Walking & Boarding
          </p>
        </div>

        <div className="admin-dashboard-actions">
          <Link
            to="/admin/earnings"
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <TrendingUp size={16} /> <span>Revenue</span>
          </Link>
          <button
            onClick={() => {
              setModalInitialParams(null)
              setShowModal(true)
            }}
            className="btn btn-primary"
          >
            <Plus size={16} /> <span>Add Walk-in</span>
          </button>
          <Link to="/admin/shop-purchases" className="btn btn-primary admin-dashboard-purchase-action">
            <Plus size={16} className="admin-dashboard-purchase-plus" />
            <span>Add Purchase</span>
            <ArrowRight size={16} className="admin-dashboard-purchase-arrow" />
          </Link>
        </div>
      </div>

      {loading ? <Spinner text="Loading dashboard..." /> : (
        <>
          {/* Top Metric Cards */}
          <div className="admin-stats-grid">
            {statCards.map((s, i) => (
              <div key={i} className="stat-card">
                <div style={{ color: s.color, marginBottom: '10px' }}>{s.icon}</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)', fontFamily: '"Playfair Display",serif' }}>
                  {s.value}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '3px' }}>{s.label}</div>
                {s.split && (
                  <div className="admin-earning-split">
                    {s.split.map(row => <span key={row.label}>{row.label}: <strong>{row.value}</strong></span>)}
                  </div>
                )}
                {s.link && <Link className="admin-stat-card-link" to={s.link}>{s.action}</Link>}
              </div>
            ))}
          </div>

          {/* Status Overview Cards */}
          {(() => {
            const statusCards = [
              {
                label: 'Pending',
                value: data.pending || 0,
                icon: Clock,
                color: '#d97706',
                bgColor: 'rgba(245, 158, 11, 0.1)',
                borderColor: 'rgba(245, 158, 11, 0.25)',
              },
              {
                label: 'Confirmed',
                value: data.confirmed || 0,
                icon: CalendarCheck,
                color: '#059669',
                bgColor: 'rgba(16, 185, 129, 0.1)',
                borderColor: 'rgba(16, 185, 129, 0.25)',
              },
              {
                label: 'Completed',
                value: data.completed || 0,
                icon: CheckCircle2,
                color: '#2563eb',
                bgColor: 'rgba(37, 99, 235, 0.1)',
                borderColor: 'rgba(37, 99, 235, 0.25)',
              },
              {
                label: 'Cancelled',
                value: data.cancelled || 0,
                icon: XCircle,
                color: '#e11d48',
                bgColor: 'rgba(225, 29, 72, 0.08)',
                borderColor: 'rgba(225, 29, 72, 0.22)',
              },
            ]

            return (
              <div className="admin-status-grid" style={{ marginBottom: '22px' }}>
                {statusCards.map(s => {
                  const Icon = s.icon
                  return (
                    <div
                      key={s.label}
                      style={{
                        background: 'var(--card)',
                        border: `1.5px solid ${s.borderColor}`,
                        borderRadius: '14px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                        userSelect: 'none',
                      }}
                    >
                      {/* Count with Icon beside / in front */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            background: s.bgColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: s.color,
                            flexShrink: 0,
                          }}
                        >
                          <Icon size={16} />
                        </div>
                        <span
                          style={{
                            fontSize: '22px',
                            fontWeight: 800,
                            color: 'var(--text)',
                            fontFamily: '"DM Mono", monospace',
                            lineHeight: 1,
                          }}
                        >
                          {s.value}
                        </span>
                      </div>

                      {/* Label below */}
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: s.color,
                          marginTop: '6px',
                          letterSpacing: '0.2px',
                        }}
                      >
                        {s.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Modern Visual Analytics 2-Column Grid */}
          <div className="admin-dashboard-grid">
            {/* Chart 1: Revenue & Activity Trend (Matching Image 2) */}
            <RevenueTrendChart items={data.normalizedItems} />

            {/* Chart 2: Customer & Service Donut Overview (Matching Image 3) */}
            <CustomerOverviewDonut
              items={data.normalizedItems}
              totalUniqueCustomers={data.customerCount}
            />
          </div>
        </>
      )}

      {/* On-demand Walk-in Modal */}
      {showModal && (
        <Suspense fallback={null}>
          <WalkinModal
            isOpen={showModal}
            initialParams={modalInitialParams}
            bookings={data.rawGroomingBookings}
            user={user}
            onClose={() => setShowModal(false)}
            onSuccess={async () => {
              cachedDashboardTime = 0
              await fetchData(false)
            }}
            setToast={(msg, type) => {
              setToastMessage(msg)
              setToastType(type)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
