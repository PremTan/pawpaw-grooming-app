// src/admin/AdminEarnings.jsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import {
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Footprints,
  IndianRupee,
  Receipt,
  ReceiptText,
  RefreshCw,
  Scissors,
  Search,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'

// In-memory cache for snappy instant navigation
let cachedEarnings = null
let cachedEarningsTime = 0
const EARNINGS_CACHE_TTL = 2 * 60 * 1000 // 2 minutes
const PAGE_SIZE = 15

const money = (val) => Number(val || 0).toLocaleString('en-IN')

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

const formatDateYMD = (d) => {
  if (!d || isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const formatFriendlyDate = (d) => {
  if (!d || isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function AdminEarnings() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [items, setItems] = useState([])

  // Filters
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all') // 'all' | 'grooming' | 'walking' | 'boarding'
  const [timeFilter, setTimeFilter] = useState('all') // 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom'
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all') // 'all' | 'collected' | 'not_collected'
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('date_desc') // 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
  const [currentPage, setCurrentPage] = useState(1)

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [serviceTypeFilter, timeFilter, paymentStatusFilter, customStart, customEnd, searchQuery, sortBy])

  // Fetch and normalize completed bookings across all 3 collections
  const loadData = async (isBackground = false) => {
    const isFresh = cachedEarnings && Date.now() - cachedEarningsTime < EARNINGS_CACHE_TTL
    if (isFresh && !isBackground) {
      setItems(cachedEarnings)
      setLoading(false)
      loadData(true)
      return
    }

    if (!isBackground) setLoading(true)
    else setRefreshing(true)

    try {
      const [gSnap, wSnap, bSnap] = await Promise.all([
        getDocs(query(collection(db, 'bookings'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'walkingBookings'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'boardingBookings'), orderBy('createdAt', 'desc'))),
      ])

      const normalized = []

      // 1. Grooming Bookings (include ALL completed bookings; track whether amount was collected)
      gSnap.docs.forEach((docSnap) => {
        const b = { id: docSnap.id, ...docSnap.data() }
        if (b.status === 'completed') {
          const isCollected = Boolean(b.amountCollected && parseFloat(b.amountCollected) > 0)
          const amt = isCollected ? (parseFloat(b.amountCollected) || 0) : 0
          const pendingAmt = !isCollected ? Number(b.estimatedTotal || b.price || 0) : 0
          const dateObj = parseBookingDate(b)
          const dateYmd = formatDateYMD(dateObj)

          normalized.push({
            id: b.id,
            rawId: b.id,
            serviceType: 'grooming',
            serviceLabel: 'Grooming', // No 'Pet' prefix
            subLabel: b.bookingType === 'home' ? 'Home Visit' : 'Salon / Centre Visit',
            ownerName: b.ownerName || b.customerName || 'Customer',
            phone: b.phone || b.customerPhone || '',
            petName: b.petName || 'Pet',
            petBreed: b.petBreed || b.breed || b.petType || 'Dog',
            amount: amt,
            isAmountCollected: isCollected,
            pendingAmount: pendingAmt,
            paymentMode: isCollected ? (b.isWalkIn ? 'Walk-in / Cash' : 'Online Booking') : 'Not Collected',
            dateObj,
            dateYmd,
            detailSummary: b.serviceName || (Array.isArray(b.services) ? b.services.join(', ') : 'Grooming Package'),
            invoiceUrl: `/admin/invoices?mode=appointment&id=${b.id}`,
            adminUrl: `/admin/bookings/${b.id}`,
          })
        }
      })

      // 2. Walking Bookings (Passes & Single walks counted upon completion)
      wSnap.docs.forEach((docSnap) => {
        const w = { id: docSnap.id, ...docSnap.data() }
        if (w.status === 'completed') {
          const rawAmt = Number(w.amountCollected || w.totalPrice || w.estimatedTotal || 0)
          const isCollected = rawAmt > 0 || w.paymentStatus === 'paid'
          const amt = isCollected ? rawAmt : 0
          const pendingAmt = !isCollected ? Number(w.totalPrice || w.estimatedTotal || 0) : 0
          const dateObj = parseBookingDate(w)
          const dateYmd = formatDateYMD(dateObj)
          const isPass = w.planType && w.planType !== 'single'
          const passTitle =
            w.planType === 'weekly'
              ? '7-Day Pass'
              : w.planType === 'monthly'
              ? '30-Day Pass'
              : 'Single Walk'

          normalized.push({
            id: w.id,
            rawId: w.id,
            serviceType: 'walking',
            serviceLabel: 'Walking', // No 'Pet' prefix
            subLabel: isPass ? `${passTitle} (${w.totalWalks || 7} Walks)` : `${w.durationMinutes || 30}m Walk`,
            ownerName: w.ownerName || w.customerName || 'Customer',
            phone: w.phone || w.customerPhone || '',
            petName: w.dogName || w.petName || 'Dog',
            petBreed: w.breed || w.dogBreed || 'Dog',
            amount: amt,
            isAmountCollected: isCollected,
            pendingAmount: pendingAmt,
            paymentMode: isCollected ? (w.paymentStatus === 'paid' ? 'Paid / Online' : 'Direct Payment') : 'Not Collected',
            dateObj,
            dateYmd,
            detailSummary: `${passTitle} • ${w.frequency === 'twice_daily' ? '2 walks/day' : '1 walk/day'}`,
            invoiceUrl: `/admin/invoices?mode=walking&id=${w.id}`,
            adminUrl: `/admin/walking/${w.id}`,
          })
        }
      })

      // 3. Boarding Bookings (Counted upon completed stay / check out)
      bSnap.docs.forEach((docSnap) => {
        const b = { id: docSnap.id, ...docSnap.data() }
        if (b.status === 'checked_out' || b.status === 'completed') {
          const rawAmt = Number(b.amountCollected || b.estimatedTotal || b.totalPrice || 0)
          const isCollected = rawAmt > 0
          const amt = isCollected ? rawAmt : 0
          const pendingAmt = !isCollected ? Number(b.estimatedTotal || b.totalPrice || 0) : 0
          const dateObj = parseBookingDate(b)
          const dateYmd = formatDateYMD(dateObj)
          const nights = b.numberOfDays || b.totalNights || 1
          const petSpecies = b.petType === 'cat' ? 'Cat' : 'Dog'

          normalized.push({
            id: b.id,
            rawId: b.id,
            serviceType: 'boarding',
            serviceLabel: 'Boarding', // No 'Pet' prefix
            subLabel: `${nights} Night${nights > 1 ? 's' : ''} Stay (${petSpecies})`,
            ownerName: b.ownerName || b.customerName || 'Customer',
            phone: b.phone || b.customerPhone || '',
            petName: b.petName || 'Pet',
            petBreed: b.petBreed || b.breed || petSpecies,
            amount: amt,
            isAmountCollected: isCollected,
            pendingAmount: pendingAmt,
            paymentMode: isCollected
              ? (b.advancePaid ? `Advance (₹${money(b.advancePaid)}) + Balance` : 'Collected at Checkout')
              : 'Not Collected',
            dateObj,
            dateYmd,
            detailSummary: `${b.checkInDate || ''} → ${b.checkOutDate || ''} (${nights} nights)`,
            invoiceUrl: `/admin/invoices?mode=boarding&id=${b.id}`,
            adminUrl: `/admin/boarding/${b.id}`,
          })
        }
      })

      cachedEarnings = normalized
      cachedEarningsTime = Date.now()
      setItems(normalized)
    } catch (err) {
      console.error('Error fetching admin earnings:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Date boundary calculation for time filters
  const dateBoundaries = useMemo(() => {
    const now = new Date()
    const todayStr = formatDateYMD(now)

    // Yesterday
    const yest = new Date(now)
    yest.setDate(yest.getDate() - 1)
    const yestStr = formatDateYMD(yest)

    // Start of this week (last 7 days)
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
    const sevenDaysStr = formatDateYMD(sevenDaysAgo)

    // This month (from 1st of current month)
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonthStartStr = formatDateYMD(thisMonthStart)

    // Last month
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
    const lastMonthStartStr = formatDateYMD(lastMonthStart)
    const lastMonthEndStr = formatDateYMD(lastMonthEnd)

    return {
      todayStr,
      yestStr,
      sevenDaysStr,
      thisMonthStartStr,
      lastMonthStartStr,
      lastMonthEndStr,
    }
  }, [])

  // Filter and sort items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Service Type Filter
      if (serviceTypeFilter !== 'all' && item.serviceType !== serviceTypeFilter) {
        return false
      }

      // 2. Payment Status Filter (Collected vs Not Collected)
      if (paymentStatusFilter === 'collected' && !item.isAmountCollected) {
        return false
      }
      if (paymentStatusFilter === 'not_collected' && item.isAmountCollected) {
        return false
      }

      // 3. Time Filter
      const ymd = item.dateYmd
      if (timeFilter === 'today') {
        if (ymd !== dateBoundaries.todayStr) return false
      } else if (timeFilter === 'yesterday') {
        if (ymd !== dateBoundaries.yestStr) return false
      } else if (timeFilter === 'this_week') {
        if (ymd < dateBoundaries.sevenDaysStr || ymd > dateBoundaries.todayStr) return false
      } else if (timeFilter === 'this_month') {
        if (ymd < dateBoundaries.thisMonthStartStr || ymd > dateBoundaries.todayStr) return false
      } else if (timeFilter === 'last_month') {
        if (ymd < dateBoundaries.lastMonthStartStr || ymd > dateBoundaries.lastMonthEndStr) return false
      } else if (timeFilter === 'custom') {
        if (customStart && ymd < customStart) return false
        if (customEnd && ymd > customEnd) return false
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchesOwner = item.ownerName?.toLowerCase().includes(q)
        const matchesPet = item.petName?.toLowerCase().includes(q)
        const matchesPhone = item.phone?.toLowerCase().includes(q)
        const matchesId = item.id?.toLowerCase().includes(q)
        const matchesService = item.subLabel?.toLowerCase().includes(q)
        if (!matchesOwner && !matchesPet && !matchesPhone && !matchesId && !matchesService) {
          return false
        }
      }

      return true
    }).sort((a, b) => {
      if (sortBy === 'date_desc') return b.dateObj.getTime() - a.dateObj.getTime()
      if (sortBy === 'date_asc') return a.dateObj.getTime() - b.dateObj.getTime()
      if (sortBy === 'amount_desc') return b.amount - a.amount
      if (sortBy === 'amount_asc') return a.amount - b.amount
      return 0
    })
  }, [items, serviceTypeFilter, paymentStatusFilter, timeFilter, customStart, customEnd, searchQuery, sortBy, dateBoundaries])

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, currentPage])

  // Aggregate metrics for cards based on current time range
  const metrics = useMemo(() => {
    const timeScoped = items.filter((item) => {
      const ymd = item.dateYmd
      if (timeFilter === 'today') return ymd === dateBoundaries.todayStr
      if (timeFilter === 'yesterday') return ymd === dateBoundaries.yestStr
      if (timeFilter === 'this_week') return ymd >= dateBoundaries.sevenDaysStr && ymd <= dateBoundaries.todayStr
      if (timeFilter === 'this_month') return ymd >= dateBoundaries.thisMonthStartStr && ymd <= dateBoundaries.todayStr
      if (timeFilter === 'last_month') return ymd >= dateBoundaries.lastMonthStartStr && ymd <= dateBoundaries.lastMonthEndStr
      if (timeFilter === 'custom') {
        if (customStart && ymd < customStart) return false
        if (customEnd && ymd > customEnd) return false
        return true
      }
      return true
    })

    const groomingItems = timeScoped.filter((i) => i.serviceType === 'grooming')
    const walkingItems = timeScoped.filter((i) => i.serviceType === 'walking')
    const boardingItems = timeScoped.filter((i) => i.serviceType === 'boarding')

    // Revenue only sums collected amounts
    const groomingRev = groomingItems.reduce((acc, i) => acc + (i.isAmountCollected ? i.amount : 0), 0)
    const walkingRev = walkingItems.reduce((acc, i) => acc + (i.isAmountCollected ? i.amount : 0), 0)
    const boardingRev = boardingItems.reduce((acc, i) => acc + (i.isAmountCollected ? i.amount : 0), 0)
    const totalRev = groomingRev + walkingRev + boardingRev

    const groomingUncollected = groomingItems.filter((i) => !i.isAmountCollected).length
    const walkingUncollected = walkingItems.filter((i) => !i.isAmountCollected).length
    const boardingUncollected = boardingItems.filter((i) => !i.isAmountCollected).length

    return {
      totalRev,
      totalCount: timeScoped.length,
      grooming: {
        rev: groomingRev,
        count: groomingItems.length,
        uncollectedCount: groomingUncollected,
        share: totalRev > 0 ? Math.round((groomingRev / totalRev) * 100) : 0,
      },
      walking: {
        rev: walkingRev,
        count: walkingItems.length,
        uncollectedCount: walkingUncollected,
        share: totalRev > 0 ? Math.round((walkingRev / totalRev) * 100) : 0,
      },
      boarding: {
        rev: boardingRev,
        count: boardingItems.length,
        uncollectedCount: boardingUncollected,
        share: totalRev > 0 ? Math.round((boardingRev / totalRev) * 100) : 0,
      },
    }
  }, [items, timeFilter, customStart, customEnd, dateBoundaries])

  // Export to CSV helper
  const handleExportCSV = () => {
    if (!filteredItems.length) return
    const headers = ['Booking ID', 'Service', 'Details', 'Customer Name', 'Phone', 'Pet Name', 'Date', 'Amount (INR)', 'Payment Status', 'Payment Mode']
    const rows = filteredItems.map((item) => [
      `"${item.id}"`,
      `"${item.serviceLabel}"`,
      `"${item.subLabel}"`,
      `"${item.ownerName}"`,
      `"${item.phone}"`,
      `"${item.petName} (${item.petBreed})"`,
      `"${item.dateYmd}"`,
      item.amount,
      item.isAmountCollected ? 'Collected' : 'Not Collected',
      `"${item.paymentMode}"`,
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `pawpaw-revenue-${timeFilter}-${formatDateYMD(new Date())}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="admin-content" style={{ padding: '16px 18px 60px' }}>
      {/* 1. Page Header: Icon + "Revenue", Refresh Icon, and Export button with upward arrow */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.15) 0%, rgba(245, 158, 11, 0.25) 100%)',
              border: '1px solid rgba(217, 119, 6, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d97706',
              boxShadow: '0 2px 6px rgba(217, 119, 6, 0.15)',
            }}
          >
            <IndianRupee size={18} />
          </div>
          <h1
            style={{
              fontFamily: '"Playfair Display",serif',
              fontSize: '24px',
              fontWeight: 800,
              margin: 0,
              color: 'var(--text)',
            }}
          >
            Revenue
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Refresh Icon Button */}
          <button
            type="button"
            onClick={() => loadData(false)}
            disabled={refreshing}
            title="Refresh"
            aria-label="Refresh Revenue"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '9px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
          </button>

          {/* Export Button with Upward Arrow */}
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!filteredItems.length}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              height: '38px',
              padding: '0 14px',
              borderRadius: '9px',
              background: 'var(--accent)',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: filteredItems.length ? 'pointer' : 'not-allowed',
              opacity: filteredItems.length ? 1 : 0.6,
              boxShadow: '0 2px 8px rgba(180, 83, 9, 0.25)',
              transition: 'all 0.15s ease',
            }}
          >
            <Upload size={14} /> <span>Export</span>
          </button>
        </div>
      </div>

      {/* 2. PERIOD: Single-Line Horizontally Scrollable Filter */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '8px 12px',
          marginBottom: '14px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: '2px',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 800,
              color: 'var(--muted)',
              marginRight: '2px',
              flexShrink: 0,
              letterSpacing: '0.5px',
            }}
          >
            PERIOD:
          </span>
          {[
            { id: 'all', label: 'All Time' },
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'this_week', label: 'Last 7 Days' },
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'custom', label: 'Custom Range' },
          ].map((t) => {
            const active = timeFilter === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTimeFilter(t.id)}
                style={{
                  padding: '5px 11px',
                  borderRadius: '7px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                  background: active ? 'var(--accent-bg)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Custom Date Range Picker when selected */}
        {timeFilter === 'custom' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
              marginTop: '8px',
              paddingTop: '8px',
              borderTop: '1px dashed var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>From:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{
                  padding: '4px 7px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '11px',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>To:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{
                  padding: '4px 7px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '11px',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner text="Loading revenue..." />
        </div>
      ) : (
        <>
          {/* 3. 2 Lines with 2 Boxes Each (2x2 Grid) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '10px',
              marginBottom: '14px',
            }}
          >
            {/* Row 1 - Box 1: Total Net Revenue */}
            <div
              style={{
                background: 'var(--card)',
                border: '1.5px solid var(--border)',
                borderRadius: '12px',
                padding: '12px 14px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Total Revenue
                </span>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.12)',
                    color: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <TrendingUp size={15} />
                </div>
              </div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  color: 'var(--text)',
                  margin: '4px 0 2px',
                  fontFamily: '"Playfair Display",serif',
                }}
              >
                ₹{money(metrics.totalRev)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--text)' }}>{metrics.totalCount}</strong> bookings
              </div>
            </div>

            {/* Row 1 - Box 2: Grooming */}
            <div
              onClick={() => setServiceTypeFilter(serviceTypeFilter === 'grooming' ? 'all' : 'grooming')}
              style={{
                background: 'var(--card)',
                border: serviceTypeFilter === 'grooming' ? '2px solid #d97706' : '1.5px solid var(--border)',
                borderRadius: '12px',
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>
                  ✂️ Grooming
                </span>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: 'rgba(217, 119, 6, 0.12)',
                    color: '#d97706',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Scissors size={14} />
                </div>
              </div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  color: 'var(--text)',
                  margin: '4px 0 2px',
                  fontFamily: '"Playfair Display",serif',
                }}
              >
                ₹{money(metrics.grooming.rev)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{metrics.grooming.count} visits</span>
                <span style={{ fontWeight: 700, color: '#d97706' }}>{metrics.grooming.share}%</span>
              </div>
              {metrics.grooming.uncollectedCount > 0 && (
                <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700, marginTop: '3px' }}>
                  ⚠️ {metrics.grooming.uncollectedCount} uncollected
                </div>
              )}
            </div>

            {/* Row 2 - Box 3: Walking */}
            <div
              onClick={() => setServiceTypeFilter(serviceTypeFilter === 'walking' ? 'all' : 'walking')}
              style={{
                background: 'var(--card)',
                border: serviceTypeFilter === 'walking' ? '2px solid #2563eb' : '1.5px solid var(--border)',
                borderRadius: '12px',
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>
                  🐾 Walking
                </span>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: 'rgba(37, 99, 235, 0.12)',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Footprints size={14} />
                </div>
              </div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  color: 'var(--text)',
                  margin: '4px 0 2px',
                  fontFamily: '"Playfair Display",serif',
                }}
              >
                ₹{money(metrics.walking.rev)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{metrics.walking.count} walks</span>
                <span style={{ fontWeight: 700, color: '#2563eb' }}>{metrics.walking.share}%</span>
              </div>
              {metrics.walking.uncollectedCount > 0 && (
                <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700, marginTop: '3px' }}>
                  ⚠️ {metrics.walking.uncollectedCount} uncollected
                </div>
              )}
            </div>

            {/* Row 2 - Box 4: Boarding */}
            <div
              onClick={() => setServiceTypeFilter(serviceTypeFilter === 'boarding' ? 'all' : 'boarding')}
              style={{
                background: 'var(--card)',
                border: serviceTypeFilter === 'boarding' ? '2px solid #7c3aed' : '1.5px solid var(--border)',
                borderRadius: '12px',
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>
                  🏨 Boarding
                </span>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: 'rgba(124, 58, 237, 0.12)',
                    color: '#7c3aed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Building2 size={14} />
                </div>
              </div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  color: 'var(--text)',
                  margin: '4px 0 2px',
                  fontFamily: '"Playfair Display",serif',
                }}
              >
                ₹{money(metrics.boarding.rev)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{metrics.boarding.count} stays</span>
                <span style={{ fontWeight: 700, color: '#7c3aed' }}>{metrics.boarding.share}%</span>
              </div>
              {metrics.boarding.uncollectedCount > 0 && (
                <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700, marginTop: '3px' }}>
                  ⚠️ {metrics.boarding.uncollectedCount} uncollected
                </div>
              )}
            </div>
          </div>

          {/* 4. Ledger Table Container */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            }}
          >
            {/* Table Controls: Single-Line Service Tabs + Search Row with Right-Side Filters */}
            <div
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {/* Single Line Service Filter Pills */}
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  overflowX: 'auto',
                  whiteSpace: 'nowrap',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  WebkitOverflowScrolling: 'touch',
                  paddingBottom: '2px',
                }}
              >
                {[
                  { id: 'all', label: 'All Services', count: items.length },
                  { id: 'grooming', label: '✂️ Grooming', count: items.filter((i) => i.serviceType === 'grooming').length },
                  { id: 'walking', label: '🐾 Walking', count: items.filter((i) => i.serviceType === 'walking').length },
                  { id: 'boarding', label: '🏨 Boarding', count: items.filter((i) => i.serviceType === 'boarding').length },
                ].map((tab) => {
                  const active = serviceTypeFilter === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setServiceTypeFilter(tab.id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '7px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                        background: active ? 'var(--accent)' : 'var(--bg)',
                        color: active ? '#fff' : 'var(--text)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  )
                })}
              </div>

              {/* Search + 2 Single-Line Filters */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  width: '100%',
                }}
              >
                {/* Search Box - Full Width */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '7px',
                    padding: '6px 8px',
                    gap: '6px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <Search size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder="Search customer, pet..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontSize: '12px',
                      color: 'var(--text)',
                      width: '100%',
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Single-Line 2-Column Filters (1fr 1fr) - Guaranteed to fit 100% on any mobile screen */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '6px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Payment Status Filter */}
                  <select
                    value={paymentStatusFilter}
                    onChange={(e) => setPaymentStatusFilter(e.target.value)}
                    title="Filter by payment collection status"
                    style={{
                      width: '100%',
                      minWidth: 0,
                      background: paymentStatusFilter !== 'all' ? 'var(--accent-bg)' : 'var(--bg)',
                      border: `1px solid ${paymentStatusFilter !== 'all' ? 'var(--accent)' : 'var(--border)'}`,
                      color: paymentStatusFilter !== 'all' ? 'var(--accent)' : 'var(--text)',
                      borderRadius: '7px',
                      padding: '6px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="all">All Payments</option>
                    <option value="collected">Collected</option>
                    <option value="not_collected">⚠️ Uncollected</option>
                  </select>

                  {/* Sort Dropdown */}
                  <div
                    style={{
                      width: '100%',
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '7px',
                      padding: '0 6px',
                      boxSizing: 'border-box',
                    }}
                  >
                    <ArrowUpDown size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      style={{
                        width: '100%',
                        minWidth: 0,
                        background: 'transparent',
                        border: 'none',
                        padding: '6px 2px',
                        fontSize: '11px',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      <option value="date_desc">Newest First</option>
                      <option value="date_asc">Oldest First</option>
                      <option value="amount_desc">Highest Amount</option>
                      <option value="amount_asc">Lowest Amount</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Table Contents */}
            {filteredItems.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)' }}>
                <Receipt size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                  No completed earnings found
                </div>
                <div style={{ fontSize: '12px', marginTop: '2px' }}>
                  Try switching the filter or resetting "Amount Not Collected".
                </div>
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                    <thead>
                      <tr
                        style={{
                          background: 'var(--bg)',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--muted)',
                          fontSize: '10px',
                          textTransform: 'uppercase',
                        }}
                      >
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>Service</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>Customer & Pet</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>Details</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700 }}>Date</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'right' }}>Amount</th>
                        <th style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map((item, idx) => {
                        const isGrooming = item.serviceType === 'grooming'
                        const isWalking = item.serviceType === 'walking'
                        const isBoarding = item.serviceType === 'boarding'

                        const typeColor = isGrooming ? '#d97706' : isWalking ? '#2563eb' : '#7c3aed'
                        const typeBg = isGrooming
                          ? 'rgba(217,119,6,0.1)'
                          : isWalking
                          ? 'rgba(37,99,235,0.1)'
                          : 'rgba(124,58,237,0.1)'
                        const Icon = isGrooming ? Scissors : isWalking ? Footprints : Building2

                        return (
                          <tr
                            key={`${item.id}-${idx}`}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              transition: 'background 0.15s ease',
                              background: !item.isAmountCollected ? 'rgba(239, 68, 68, 0.02)' : 'transparent',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = !item.isAmountCollected ? 'rgba(239, 68, 68, 0.02)' : 'transparent')}
                          >
                            {/* Service Type Badge: No 'Pet' prefix anywhere */}
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  background: typeBg,
                                  color: typeColor,
                                  padding: '3px 7px',
                                  borderRadius: '5px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                }}
                              >
                                <Icon size={11} />
                                {item.serviceLabel}
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                                #{item.id.slice(0, 8).toUpperCase()}
                              </div>
                            </td>

                            {/* Customer & Pet */}
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{item.ownerName}</div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                🐾 {item.petName} {item.petBreed ? `(${item.petBreed})` : ''}
                              </div>
                            </td>

                            {/* Service Details */}
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{item.subLabel}</div>
                              <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{item.detailSummary}</div>
                            </td>

                            {/* Completed Date */}
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                                {formatFriendlyDate(item.dateObj)}
                              </div>
                            </td>

                            {/* Amount Earned / Not Collected Indicator */}
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'right' }}>
                              {item.isAmountCollected ? (
                                <span
                                  style={{
                                    display: 'inline-block',
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    color: '#10b981',
                                    border: '1px solid rgba(16, 185, 129, 0.25)',
                                    padding: '2px 7px',
                                    borderRadius: '5px',
                                    fontWeight: 800,
                                    fontSize: '12px',
                                  }}
                                >
                                  ₹{money(item.amount)}
                                </span>
                              ) : (
                                <div>
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      background: 'rgba(239, 68, 68, 0.1)',
                                      color: '#ef4444',
                                      border: '1px solid rgba(239, 68, 68, 0.25)',
                                      padding: '2px 6px',
                                      borderRadius: '5px',
                                      fontWeight: 800,
                                      fontSize: '10px',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    Not Collected
                                  </span>
                                  {item.pendingAmount > 0 && (
                                    <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                                      Est: ₹{money(item.pendingAmount)}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Action Links */}
                            <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                <Link
                                  to={item.invoiceUrl}
                                  title="View Invoice"
                                  style={{
                                    padding: '4px 7px',
                                    borderRadius: '5px',
                                    background: 'var(--bg)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--accent)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                  }}
                                >
                                  <ReceiptText size={11} /> Bill
                                </Link>
                                <Link
                                  to={item.adminUrl}
                                  title="View in Portal"
                                  style={{
                                    padding: '4px 7px',
                                    borderRadius: '5px',
                                    background: 'var(--bg)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text)',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                  }}
                                >
                                  View
                                </Link>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 5. Pagination Bar */}
                <div
                  style={{
                    padding: '10px 14px',
                    borderTop: '1px solid var(--border)',
                    background: 'var(--bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: '11px',
                    color: 'var(--muted)',
                  }}
                >
                  <div>
                    Showing <strong>{(currentPage - 1) * PAGE_SIZE + 1}</strong> –{' '}
                    <strong>{Math.min(currentPage * PAGE_SIZE, filteredItems.length)}</strong> of{' '}
                    <strong>{filteredItems.length}</strong> entries
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: currentPage <= 1 ? 'var(--muted)' : 'var(--text)',
                        cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                        opacity: currentPage <= 1 ? 0.5 : 1,
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      <ChevronLeft size={13} /> Prev
                    </button>

                    <span style={{ padding: '0 4px', fontWeight: 700, color: 'var(--text)' }}>
                      Page {currentPage} of {totalPages}
                    </span>

                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        color: currentPage >= totalPages ? 'var(--muted)' : 'var(--text)',
                        cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                        opacity: currentPage >= totalPages ? 0.5 : 1,
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      Next <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
