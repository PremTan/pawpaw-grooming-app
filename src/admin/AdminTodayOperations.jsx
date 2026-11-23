// src/admin/AdminTodayOperations.jsx
import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { format, startOfToday } from 'date-fns'
import {
  CalendarCheck,
  Clock,
  RefreshCw,
  Scissors,
  Footprints,
  Hotel,
  Search,
  AlertTriangle,
  UserCheck,
  UserX,
  Phone,
  MessageCircle,
  ExternalLink,
  Sparkles,
  CheckCircle2,
} from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'

const SERVICE_CONFIG = {
  grooming: {
    label: 'Grooming',
    icon: Scissors,
    color: '#8b5cf6',
    bgColor: 'rgba(139, 92, 246, 0.1)',
    borderColor: 'rgba(139, 92, 246, 0.25)',
  },
  walking: {
    label: 'Dog Walk',
    icon: Footprints,
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  boarding: {
    label: 'Boarding',
    icon: Hotel,
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
}

const STATUS_BADGES = {
  pending: { label: 'Pending', color: '#d97706', bg: 'rgba(217, 119, 6, 0.1)', border: 'rgba(217, 119, 6, 0.25)' },
  confirmed: { label: 'Confirmed', color: '#059669', bg: 'rgba(5, 150, 105, 0.1)', border: 'rgba(5, 150, 105, 0.25)' },
  active: { label: 'Active', color: '#059669', bg: 'rgba(5, 150, 105, 0.1)', border: 'rgba(5, 150, 105, 0.25)' },
  checked_in: { label: 'Checked In', color: '#059669', bg: 'rgba(5, 150, 105, 0.1)', border: 'rgba(5, 150, 105, 0.25)' },
  in_progress: { label: 'In Progress', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.1)', border: 'rgba(37, 99, 235, 0.25)' },
  completed: { label: 'Completed', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)', border: 'rgba(100, 116, 139, 0.2)' },
  checked_out: { label: 'Checked Out', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)', border: 'rgba(100, 116, 139, 0.2)' },
  cancelled: { label: 'Cancelled', color: '#e11d48', bg: 'rgba(225, 29, 72, 0.1)', border: 'rgba(225, 29, 72, 0.2)' },
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

export default function AdminTodayOperations() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [operations, setOperations] = useState([])
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'grooming' | 'walking' | 'boarding' | 'unassigned'
  const [searchQuery, setSearchQuery] = useState('')

  const today = format(startOfToday(), 'yyyy-MM-dd')
  const dateFormatted = format(startOfToday(), 'd MMM yyyy')

  const fetchTodayData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const [gSnap, wSnap, bSnap] = await Promise.all([
        getDocs(collection(db, 'bookings')),
        getDocs(collection(db, 'walkingBookings')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'boardingBookings')).catch(() => ({ docs: [] })),
      ])

      const rawGrooming = gSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const rawWalking = wSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const rawBoarding = bSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      const todayOps = []

      // 1. Grooming for Today
      rawGrooming.forEach(g => {
        const dateObj = parseBookingDate(g)
        const dateYmd = g.date || format(dateObj, 'yyyy-MM-dd')
        if (dateYmd === today && g.status !== 'cancelled') {
          todayOps.push({
            id: g.id,
            serviceType: 'grooming',
            title: g.serviceName || (Array.isArray(g.services) ? g.services.join(', ') : 'Grooming Session'),
            petName: g.petName || 'Pet',
            petType: g.petType || 'dog',
            breed: g.breed || '',
            ownerName: g.ownerName || g.name || 'Customer',
            phone: g.phone || '',
            slot: g.slot || 'Scheduled',
            rawSlot: g.slot || '',
            status: g.status || 'confirmed',
            assignedStaff: g.assignedTeamMemberName || '',
            assignedStaffRole: 'Groomer',
            isWalkIn: Boolean(g.isWalkIn),
            amount: g.amountCollected || g.price || 0,
            link: `/admin/bookings/${g.id}`,
            notes: g.specialNotes || g.notes || '',
          })
        }
      })

      // 2. Walking for Today
      rawWalking.forEach(w => {
        if (w.status === 'cancelled') return
        const startDate = w.date || (w.createdAt ? format(parseBookingDate(w), 'yyyy-MM-dd') : '')
        const endDate = w.estimatedEndDate || w.endDate || startDate

        const isToday = (w.planType === 'single' || !w.planType)
          ? startDate === today
          : (startDate <= today && (!endDate || endDate >= today))

        if (isToday) {
          const isDoneToday = w.status === 'completed' ||
            (Array.isArray(w.completedDates) && w.completedDates.includes(today)) ||
            (Array.isArray(w.completedSessions) && w.completedSessions.some(s => s.date === today))

          const status = isDoneToday ? 'completed' : (w.status === 'in_progress' ? 'in_progress' : (w.status || 'confirmed'))

          let slotDisplay = w.slot || 'Morning Walk'
          if (w.frequency === '2' || w.walksPerDay === 2) {
            slotDisplay = `${w.morningSlot || 'Morn'} & ${w.eveningSlot || 'Eve'}`
          }

          todayOps.push({
            id: w.id,
            serviceType: 'walking',
            title: w.planType === 'weekly' ? '7-Day Pass Walk' : w.planType === 'monthly' ? '30-Day Pass Walk' : 'Daily Dog Walk',
            petName: w.dogName || w.petName || 'Dog',
            petType: 'dog',
            breed: w.dogBreed || w.breed || '',
            ownerName: w.ownerName || w.customerName || w.name || 'Customer',
            phone: w.phone || '',
            slot: slotDisplay,
            rawSlot: w.morningSlot || w.slot || '',
            status,
            assignedStaff: w.assignedWalkerName || w.assignedTeamMemberName || '',
            assignedStaffRole: 'Walker',
            isWalkIn: false,
            amount: w.totalPrice || w.amountCollected || 0,
            link: `/admin/walking/${w.id}`,
            notes: w.specialInstructions || w.notes || '',
          })
        }
      })

      // 3. Boarding for Today
      rawBoarding.forEach(b => {
        if (b.status === 'cancelled') return
        const checkIn = b.checkInDate || ''
        const checkOut = b.checkOutDate || ''

        const isCheckInToday = checkIn === today
        const isCheckOutToday = checkOut === today
        const isActiveStay = checkIn <= today && checkOut >= today

        if (isCheckInToday || isCheckOutToday || isActiveStay) {
          let eventType = 'Active Stay'
          let slotDisplay = 'Stay'
          if (isCheckInToday) {
            eventType = 'Check-in Today'
            slotDisplay = b.checkInTime ? `Check-in ${b.checkInTime}` : 'Check-in'
          } else if (isCheckOutToday) {
            eventType = 'Check-out Today'
            slotDisplay = b.checkOutTime ? `Check-out ${b.checkOutTime}` : 'Check-out'
          } else {
            slotDisplay = 'Overnight Stay'
          }

          let boardingStatus = b.status || 'confirmed'
          if (isCheckOutToday && (b.status === 'checked_out' || b.status === 'completed')) {
            boardingStatus = 'completed'
          }

          todayOps.push({
            id: b.id,
            serviceType: 'boarding',
            title: `${b.petType === 'cat' ? 'Cat' : 'Dog'} Boarding (${eventType})`,
            petName: b.petName || b.dogName || b.catName || 'Pet',
            petType: b.petType || 'dog',
            breed: b.breed || '',
            ownerName: b.ownerName || b.customerName || b.name || 'Customer',
            phone: b.phone || '',
            slot: slotDisplay,
            rawSlot: isCheckInToday ? (b.checkInTime || '09:00 AM') : (isCheckOutToday ? (b.checkOutTime || '05:00 PM') : '12:00 PM'),
            status: boardingStatus,
            assignedStaff: b.assignedStaffName || b.assignedTeamMemberName || '',
            assignedStaffRole: 'Caregiver',
            isWalkIn: false,
            amount: b.estimatedTotal || b.amountCollected || 0,
            link: `/admin/boarding/${b.id}`,
            notes: b.foodPreference || b.specialInstructions || '',
          })
        }
      })

      // Chronological sort
      todayOps.sort((a, b) => {
        const getMinutes = (slotStr) => {
          if (!slotStr) return 720
          const match = String(slotStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
          if (!match) {
            if (/morn/i.test(slotStr)) return 540
            if (/eve/i.test(slotStr)) return 1020
            return 720
          }
          let h = parseInt(match[1], 10)
          const m = parseInt(match[2], 10)
          const meridian = match[3] ? match[3].toUpperCase() : ''
          if (meridian === 'PM' && h < 12) h += 12
          if (meridian === 'AM' && h === 12) h = 0
          return h * 60 + m
        }
        return getMinutes(a.rawSlot) - getMinutes(b.rawSlot)
      })

      setOperations(todayOps)
    } catch (err) {
      console.error("Error loading today's operations:", err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [today])

  useEffect(() => {
    fetchTodayData()
  }, [fetchTodayData])

  // Counts
  const counts = useMemo(() => {
    let grooming = 0
    let walking = 0
    let boarding = 0
    let unassigned = 0

    operations.forEach(op => {
      if (op.serviceType === 'grooming') grooming++
      if (op.serviceType === 'walking') walking++
      if (op.serviceType === 'boarding') boarding++
      if (!op.assignedStaff && op.status !== 'completed' && op.status !== 'checked_out' && op.status !== 'cancelled') {
        unassigned++
      }
    })

    return {
      all: operations.length,
      grooming,
      walking,
      boarding,
      unassigned,
    }
  }, [operations])

  // Filtered & searched operations
  const displayedOperations = useMemo(() => {
    return operations.filter(op => {
      if (activeFilter === 'grooming' && op.serviceType !== 'grooming') return false
      if (activeFilter === 'walking' && op.serviceType !== 'walking') return false
      if (activeFilter === 'boarding' && op.serviceType !== 'boarding') return false
      if (activeFilter === 'unassigned') {
        if (op.assignedStaff || op.status === 'completed' || op.status === 'checked_out' || op.status === 'cancelled') {
          return false
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchPet = (op.petName || '').toLowerCase().includes(q)
        const matchOwner = (op.ownerName || '').toLowerCase().includes(q)
        const matchPhone = (op.phone || '').includes(q)
        const matchBreed = (op.breed || '').toLowerCase().includes(q)
        const matchStaff = (op.assignedStaff || '').toLowerCase().includes(q)
        if (!matchPet && !matchOwner && !matchPhone && !matchBreed && !matchStaff) return false
      }

      return true
    })
  }, [operations, activeFilter, searchQuery])

  const buildWhatsAppLink = (op) => {
    const rawPhone = String(op.phone || '').replace(/\D/g, '').slice(-10)
    if (!rawPhone || rawPhone.length < 10) return null

    const greeting = `Hello ${op.ownerName || 'Pet Parent'}! Greeting from Paw Paw. Regarding ${op.petName || 'your pet'}'s ${op.serviceType === 'grooming' ? 'grooming session' : op.serviceType === 'walking' ? 'dog walk' : 'boarding stay'} today (${op.slot}): `
    return `https://wa.me/91${rawPhone}?text=${encodeURIComponent(greeting)}`
  }

  const metricTiles = [
    {
      key: 'all',
      label: 'Total',
      count: counts.all,
      icon: CalendarCheck,
      color: 'var(--accent)',
      bgColor: 'var(--accent-bg)',
      borderColor: 'var(--accent-border)',
    },
    {
      key: 'grooming',
      label: 'Grooming',
      count: counts.grooming,
      icon: Scissors,
      color: '#8b5cf6',
      bgColor: 'rgba(139, 92, 246, 0.12)',
      borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    {
      key: 'walking',
      label: 'Walking',
      count: counts.walking,
      icon: Footprints,
      color: '#f59e0b',
      bgColor: 'rgba(245, 158, 11, 0.12)',
      borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    {
      key: 'boarding',
      label: 'Boarding',
      count: counts.boarding,
      icon: Hotel,
      color: '#10b981',
      bgColor: 'rgba(16, 185, 129, 0.12)',
      borderColor: 'rgba(16, 185, 129, 0.3)',
    },
  ]

  return (
    <div className="admin-page admin-today-operations" style={{ paddingBottom: '40px' }}>
      {/* 1. Single-Line Responsive Header */}
      <div className="admin-today-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          {/* Live green pulsing dot */}
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px #10b981',
              flexShrink: 0,
            }}
          />
          <h1 className="admin-today-title">
            Today&apos;s Operations Hub
          </h1>
        </div>

        {/* Date pill and Refresh button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '14px',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              whiteSpace: 'nowrap',
            }}
          >
            {dateFormatted}
          </span>
          <button
            onClick={() => fetchTodayData(true)}
            disabled={refreshing || loading}
            title="Refresh today's schedule"
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner text="Loading today's operations..." />
      ) : (
        <>
          {/* 2. Compact Metric Boxes: Exactly 4 in 2 lines on mobile, 4 in 1 line on desktop */}
          <div className="admin-today-metrics">
            {metricTiles.map((t) => {
              const Icon = t.icon
              const isSelected = activeFilter === t.key

              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveFilter(t.key)}
                  style={{
                    background: isSelected ? t.bgColor : 'var(--card)',
                    border: isSelected ? `1.5px solid ${t.color}` : '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    boxShadow: isSelected ? `0 2px 10px ${t.bgColor}` : '0 1px 4px rgba(0,0,0,0.02)',
                    textAlign: 'left',
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '7px',
                        background: t.bgColor,
                        color: t.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={14} />
                    </div>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: isSelected ? t.color : 'var(--text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {t.label}
                    </span>
                  </div>

                  <span
                    style={{
                      fontSize: '17px',
                      fontWeight: 800,
                      color: isSelected ? t.color : 'var(--text)',
                      fontFamily: '"DM Mono", monospace',
                      lineHeight: 1,
                      marginLeft: '6px',
                    }}
                  >
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* 3. Unassigned Staff Alert Banner */}
          {counts.unassigned > 0 && (
            <div
              style={{
                marginBottom: '12px',
                padding: '9px 12px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <AlertTriangle size={15} color="#ef4444" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444' }}>
                  <strong>{counts.unassigned}</strong> task{counts.unassigned > 1 ? 's' : ''} need staff assignment
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveFilter(activeFilter === 'unassigned' ? 'all' : 'unassigned')}
                style={{
                  padding: '4px 9px',
                  borderRadius: '6px',
                  background: activeFilter === 'unassigned' ? 'var(--card)' : '#ef4444',
                  color: activeFilter === 'unassigned' ? '#ef4444' : '#fff',
                  border: activeFilter === 'unassigned' ? '1px solid #ef4444' : 'none',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {activeFilter === 'unassigned' ? 'Show All' : 'Filter Unassigned'}
              </button>
            </div>
          )}

          {/* 4. Search and Active Filter Indicator */}
          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '11px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pet, owner, staff..."
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  borderRadius: '9px',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  &times;
                </button>
              )}
            </div>

            {/* Active filter reset pill if not 'all' */}
            {activeFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: 'var(--accent-bg)',
                  border: '1px solid var(--accent-border)',
                  color: 'var(--accent)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Clear filter &times;
              </button>
            )}
          </div>

          {/* 5. Timeline / Cards List */}
          {displayedOperations.length === 0 ? (
            <div
              style={{
                padding: '30px 16px',
                textAlign: 'center',
                borderRadius: '12px',
                background: 'var(--card)',
                border: '1px dashed var(--border)',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: '#10b981',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                }}
              >
                <Sparkles size={20} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', margin: '0 0 3px 0' }}>
                {activeFilter === 'all'
                  ? 'No operations scheduled for today'
                  : `No ${activeFilter} bookings found for today`}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>
                {searchQuery ? 'Try clearing your search query above.' : 'All bookings for today are completed or none are scheduled.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {displayedOperations.map((op) => {
                const serviceConf = SERVICE_CONFIG[op.serviceType] || SERVICE_CONFIG.grooming
                const ServiceIcon = serviceConf.icon
                const statusBadge = STATUS_BADGES[op.status] || STATUS_BADGES.confirmed
                const isUnassigned = !op.assignedStaff && op.status !== 'completed' && op.status !== 'checked_out' && op.status !== 'cancelled'
                const waLink = buildWhatsAppLink(op)

                return (
                  <div
                    key={`${op.serviceType}-${op.id}`}
                    style={{
                      background: 'var(--card)',
                      border: isUnassigned ? '1.5px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '11px 13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.18s ease',
                    }}
                  >
                    {/* Top Row: Service Badge, Time & Status */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 7px',
                            borderRadius: '5px',
                            background: serviceConf.bgColor,
                            border: `1px solid ${serviceConf.borderColor}`,
                            color: serviceConf.color,
                            fontSize: '10px',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                          }}
                        >
                          <ServiceIcon size={11} />
                          <span>{serviceConf.label}</span>
                        </span>

                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: 'var(--accent)',
                            fontFamily: '"DM Mono", monospace',
                          }}
                        >
                          <Clock size={11} />
                          <span>{op.slot}</span>
                        </span>
                      </div>

                      <span
                        style={{
                          padding: '2px 7px',
                          borderRadius: '6px',
                          background: statusBadge.bg,
                          border: `1px solid ${statusBadge.border}`,
                          color: statusBadge.color,
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.3px',
                        }}
                      >
                        {statusBadge.label}
                      </span>
                    </div>

                    {/* Middle Row: Pet & Owner */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
                            {op.petName}
                          </span>
                          {op.breed && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              &bull; {op.breed}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>
                          Parent: <strong style={{ color: 'var(--text)' }}>{op.ownerName}</strong>
                          {op.phone && <span> &bull; {op.phone}</span>}
                        </div>
                      </div>

                      {/* Staff Assignment Pill */}
                      <div style={{ flexShrink: 0 }}>
                        {isUnassigned ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: 'rgba(239, 68, 68, 0.12)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#ef4444',
                              fontSize: '11px',
                              fontWeight: 700,
                            }}
                          >
                            <UserX size={12} />
                            <span>Unassigned</span>
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: 'rgba(16, 185, 129, 0.1)',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              color: '#059669',
                              fontSize: '11px',
                              fontWeight: 600,
                              maxWidth: '120px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={op.assignedStaff}
                          >
                            <UserCheck size={12} />
                            <span>{op.assignedStaff}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Row: Actions (WhatsApp, Call, View Details) */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '6px',
                        paddingTop: '6px',
                        borderTop: '1px solid var(--border)',
                      }}
                    >
                      {waLink && (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Message on WhatsApp"
                          style={{
                            height: '28px',
                            padding: '0 8px',
                            borderRadius: '6px',
                            background: 'rgba(37, 211, 102, 0.12)',
                            border: '1px solid rgba(37, 211, 102, 0.28)',
                            color: '#25D366',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            textDecoration: 'none',
                          }}
                        >
                          <MessageCircle size={13} />
                          <span>WhatsApp</span>
                        </a>
                      )}

                      {op.phone && (
                        <a
                          href={`tel:${op.phone}`}
                          title={`Call ${op.phone}`}
                          style={{
                            height: '28px',
                            padding: '0 8px',
                            borderRadius: '6px',
                            background: 'rgba(96, 165, 250, 0.12)',
                            border: '1px solid rgba(96, 165, 250, 0.28)',
                            color: '#60a5fa',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            textDecoration: 'none',
                          }}
                        >
                          <Phone size={12} />
                          <span>Call</span>
                        </a>
                      )}

                      <Link
                        to={op.link}
                        title="View Details"
                        style={{
                          height: '28px',
                          padding: '0 9px',
                          borderRadius: '6px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        <span>View</span>
                        <ExternalLink size={11} style={{ color: 'var(--muted)' }} />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
