// src/admin/TodaysOperationsHub.jsx
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Scissors,
  Footprints,
  Hotel,
  Clock,
  UserCheck,
  UserX,
  Phone,
  MessageCircle,
  ExternalLink,
  Search,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Sparkles,
  ChevronRight,
  Filter,
} from 'lucide-react'

const SERVICE_CONFIG = {
  grooming: {
    label: 'Grooming',
    icon: Scissors,
    color: '#8b5cf6',
    bgColor: 'rgba(139, 92, 246, 0.1)',
    borderColor: 'rgba(139, 92, 246, 0.25)',
    badgeBg: 'rgba(139, 92, 246, 0.15)',
    badgeText: '#7c3aed',
  },
  walking: {
    label: 'Dog Walk',
    icon: Footprints,
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    badgeText: '#d97706',
  },
  boarding: {
    label: 'Boarding',
    icon: Hotel,
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    badgeText: '#059669',
  },
}

const STATUS_BADGES = {
  pending: {
    label: 'Pending',
    color: '#d97706',
    bg: 'rgba(217, 119, 6, 0.1)',
    border: 'rgba(217, 119, 6, 0.25)',
  },
  confirmed: {
    label: 'Confirmed',
    color: '#059669',
    bg: 'rgba(5, 150, 105, 0.1)',
    border: 'rgba(5, 150, 105, 0.25)',
  },
  active: {
    label: 'Active',
    color: '#059669',
    bg: 'rgba(5, 150, 105, 0.1)',
    border: 'rgba(5, 150, 105, 0.25)',
  },
  checked_in: {
    label: 'Checked In',
    color: '#059669',
    bg: 'rgba(5, 150, 105, 0.1)',
    border: 'rgba(5, 150, 105, 0.25)',
  },
  in_progress: {
    label: 'In Progress',
    color: '#2563eb',
    bg: 'rgba(37, 99, 235, 0.1)',
    border: 'rgba(37, 99, 235, 0.25)',
  },
  completed: {
    label: 'Completed',
    color: '#64748b',
    bg: 'rgba(100, 116, 139, 0.1)',
    border: 'rgba(100, 116, 139, 0.2)',
  },
  checked_out: {
    label: 'Checked Out',
    color: '#64748b',
    bg: 'rgba(100, 116, 139, 0.1)',
    border: 'rgba(100, 116, 139, 0.2)',
  },
  cancelled: {
    label: 'Cancelled',
    color: '#e11d48',
    bg: 'rgba(225, 29, 72, 0.1)',
    border: 'rgba(225, 29, 72, 0.2)',
  },
}

export default function TodaysOperationsHub({ operations = [], dateFormatted = '', onRefresh }) {
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'grooming' | 'walking' | 'boarding' | 'unassigned'
  const [searchQuery, setSearchQuery] = useState('')

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
      // Filter tab
      if (activeFilter === 'grooming' && op.serviceType !== 'grooming') return false
      if (activeFilter === 'walking' && op.serviceType !== 'walking') return false
      if (activeFilter === 'boarding' && op.serviceType !== 'boarding') return false
      if (activeFilter === 'unassigned') {
        if (op.assignedStaff || op.status === 'completed' || op.status === 'checked_out' || op.status === 'cancelled') {
          return false
        }
      }

      // Search query
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

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1.5px solid var(--border)',
        borderRadius: '18px',
        padding: '20px',
        marginBottom: '26px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
      }}
    >
      {/* Top Header Row */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Glowing pulse indicator */}
          <div
            style={{
              position: 'relative',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 10px #10b981',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2
                style={{
                  fontFamily: '"Playfair Display",serif',
                  fontSize: '20px',
                  fontWeight: 800,
                  color: 'var(--text)',
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                Today&apos;s Operations Hub
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '20px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Live Today
              </span>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0 0' }}>
              {dateFormatted || 'Today'} &bull; <strong>{operations.length}</strong> service event{operations.length === 1 ? '' : 's'} scheduled
            </p>
          </div>
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', minWidth: '220px', flex: '1 1 220px', maxWidth: '320px' }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: '12px',
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
              padding: '8px 12px 8px 34px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: '13px',
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Unassigned Staff Alert Banner */}
      {counts.unassigned > 0 && activeFilter !== 'unassigned' && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px 16px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1.5px solid rgba(239, 68, 68, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444' }}>
              <strong>{counts.unassigned}</strong> appointment{counts.unassigned > 1 ? 's' : ''} scheduled for today has no staff assigned!
            </span>
          </div>
          <button
            onClick={() => setActiveFilter('unassigned')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            <span>View Unassigned</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginTop: '16px',
          marginBottom: '16px',
        }}
      >
        <button
          onClick={() => setActiveFilter('all')}
          style={{
            padding: '7px 14px',
            borderRadius: '10px',
            border: activeFilter === 'all' ? '1.5px solid var(--accent)' : '1px solid var(--border)',
            background: activeFilter === 'all' ? 'var(--accent-bg, rgba(212,175,55,0.15))' : 'var(--surface)',
            color: activeFilter === 'all' ? 'var(--accent)' : 'var(--muted)',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
          }}
        >
          <span>All Services</span>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '12px',
              background: activeFilter === 'all' ? 'var(--accent)' : 'var(--border)',
              color: activeFilter === 'all' ? '#000' : 'var(--text)',
              fontSize: '11px',
              fontWeight: 800,
            }}
          >
            {counts.all}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('grooming')}
          style={{
            padding: '7px 14px',
            borderRadius: '10px',
            border: activeFilter === 'grooming' ? `1.5px solid ${SERVICE_CONFIG.grooming.color}` : '1px solid var(--border)',
            background: activeFilter === 'grooming' ? SERVICE_CONFIG.grooming.bgColor : 'var(--surface)',
            color: activeFilter === 'grooming' ? SERVICE_CONFIG.grooming.color : 'var(--muted)',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
          }}
        >
          <Scissors size={14} />
          <span>Grooming</span>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '12px',
              background: activeFilter === 'grooming' ? SERVICE_CONFIG.grooming.color : 'var(--border)',
              color: activeFilter === 'grooming' ? '#fff' : 'var(--text)',
              fontSize: '11px',
              fontWeight: 800,
            }}
          >
            {counts.grooming}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('walking')}
          style={{
            padding: '7px 14px',
            borderRadius: '10px',
            border: activeFilter === 'walking' ? `1.5px solid ${SERVICE_CONFIG.walking.color}` : '1px solid var(--border)',
            background: activeFilter === 'walking' ? SERVICE_CONFIG.walking.bgColor : 'var(--surface)',
            color: activeFilter === 'walking' ? SERVICE_CONFIG.walking.color : 'var(--muted)',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
          }}
        >
          <Footprints size={14} />
          <span>Dog Walking</span>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '12px',
              background: activeFilter === 'walking' ? SERVICE_CONFIG.walking.color : 'var(--border)',
              color: activeFilter === 'walking' ? '#fff' : 'var(--text)',
              fontSize: '11px',
              fontWeight: 800,
            }}
          >
            {counts.walking}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('boarding')}
          style={{
            padding: '7px 14px',
            borderRadius: '10px',
            border: activeFilter === 'boarding' ? `1.5px solid ${SERVICE_CONFIG.boarding.color}` : '1px solid var(--border)',
            background: activeFilter === 'boarding' ? SERVICE_CONFIG.boarding.bgColor : 'var(--surface)',
            color: activeFilter === 'boarding' ? SERVICE_CONFIG.boarding.color : 'var(--muted)',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
          }}
        >
          <Hotel size={14} />
          <span>Boarding</span>
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '12px',
              background: activeFilter === 'boarding' ? SERVICE_CONFIG.boarding.color : 'var(--border)',
              color: activeFilter === 'boarding' ? '#fff' : 'var(--text)',
              fontSize: '11px',
              fontWeight: 800,
            }}
          >
            {counts.boarding}
          </span>
        </button>

        {counts.unassigned > 0 && (
          <button
            onClick={() => setActiveFilter('unassigned')}
            style={{
              padding: '7px 14px',
              borderRadius: '10px',
              border: activeFilter === 'unassigned' ? '1.5px solid #ef4444' : '1px solid rgba(239, 68, 68, 0.3)',
              background: activeFilter === 'unassigned' ? 'rgba(239, 68, 68, 0.15)' : 'var(--surface)',
              color: '#ef4444',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              marginLeft: 'auto',
            }}
          >
            <UserX size={14} />
            <span>Unassigned Staff</span>
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '12px',
                background: '#ef4444',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 800,
              }}
            >
              {counts.unassigned}
            </span>
          </button>
        )}
      </div>

      {/* Operations List */}
      {displayedOperations.length === 0 ? (
        <div
          style={{
            padding: '36px 20px',
            textAlign: 'center',
            borderRadius: '14px',
            background: 'var(--surface)',
            border: '1px dashed var(--border)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
            }}
          >
            <Sparkles size={24} />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', margin: '0 0 4px 0' }}>
            {activeFilter === 'all'
              ? 'No operations scheduled for today'
              : `No ${activeFilter} appointments found for today`}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>
            {searchQuery
              ? 'Try modifying your search query above.'
              : 'All scheduled bookings for today are completed or none are booked yet.'}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxHeight: '480px',
            overflowY: 'auto',
            paddingRight: '4px',
          }}
        >
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
                  background: 'var(--surface)',
                  border: isUnassigned ? '1.5px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  flexWrap: 'wrap',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Left: Slot & Service Type */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px' }}>
                  {/* Time badge */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '78px',
                      padding: '6px 8px',
                      borderRadius: '10px',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)', fontSize: '11px', fontWeight: 700 }}>
                      <Clock size={12} />
                      <span>TIME</span>
                    </div>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 800,
                        color: 'var(--text)',
                        fontFamily: '"DM Mono", monospace',
                        marginTop: '2px',
                        lineHeight: 1.1,
                      }}
                    >
                      {op.slot}
                    </span>
                  </div>

                  {/* Service badge */}
                  <div>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: serviceConf.bgColor,
                        border: `1px solid ${serviceConf.borderColor}`,
                        color: serviceConf.color,
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                      }}
                    >
                      <ServiceIcon size={12} />
                      <span>{serviceConf.label}</span>
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'var(--text)',
                        marginTop: '4px',
                        maxWidth: '160px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={op.title}
                    >
                      {op.title}
                    </div>
                  </div>
                </div>

                {/* Middle: Pet & Customer Details */}
                <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
                      {op.petName}
                    </span>
                    {op.breed && (
                      <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>
                        &bull; {op.breed}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--muted)', marginTop: '3px' }}>
                    <span>Owner: <strong style={{ color: 'var(--text)' }}>{op.ownerName}</strong></span>
                    {op.phone && <span>&bull; {op.phone}</span>}
                  </div>
                </div>

                {/* Staff Assignment Pill */}
                <div style={{ minWidth: '150px' }}>
                  {isUnassigned ? (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      <UserX size={14} />
                      <span>Unassigned</span>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        color: '#059669',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      <UserCheck size={14} />
                      <span style={{ maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {op.assignedStaff}
                      </span>
                    </div>
                  )}
                </div>

                {/* Status Badge */}
                <div style={{ minWidth: '95px' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      background: statusBadge.bg,
                      border: `1px solid ${statusBadge.border}`,
                      color: statusBadge.color,
                      fontSize: '11px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                    }}
                  >
                    {statusBadge.label}
                  </span>
                </div>

                {/* Quick Actions (WhatsApp, Call, View Details) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {waLink && (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Contact customer on WhatsApp"
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'rgba(37, 211, 102, 0.12)',
                        border: '1px solid rgba(37, 211, 102, 0.28)',
                        color: '#25D366',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <MessageCircle size={16} />
                    </a>
                  )}

                  {op.phone && (
                    <a
                      href={`tel:${op.phone}`}
                      title={`Call ${op.phone}`}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'rgba(96, 165, 250, 0.12)',
                        border: '1px solid rgba(96, 165, 250, 0.28)',
                        color: '#60a5fa',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <Phone size={15} />
                    </a>
                  )}

                  <Link
                    to={op.link}
                    title="View Booking Details"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontSize: '12px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <span>View</span>
                    <ExternalLink size={13} style={{ color: 'var(--muted)' }} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
