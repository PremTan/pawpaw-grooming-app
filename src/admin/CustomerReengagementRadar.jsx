// src/admin/CustomerReengagementRadar.jsx
import { useMemo, useState } from 'react'
import {
  Sparkles,
  Scissors,
  Footprints,
  MessageCircle,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Flame,
  Phone,
} from 'lucide-react'

const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-10)

const parseRecordDate = (record) => {
  const candidate =
    record.completedAt ||
    record.date ||
    record.endDate ||
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

export default function CustomerReengagementRadar({
  groomingBookings = [],
  walkingBookings = [],
  shopName = 'Paw Paw Grooming',
}) {
  const [filterType, setFilterType] = useState('all') // 'all' | 'grooming' | 'walking'
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(false)

  const candidates = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayYmd = today.toISOString().slice(0, 10)

    // ==========================================
    // 1. GROOMING RE-ENGAGEMENT
    // ==========================================
    const activeGroomingKeys = new Set()
    groomingBookings.forEach((b) => {
      const phone = normalizePhone(b.phone)
      const pet = String(b.petName || '').trim().toLowerCase()
      const key = `${phone}_${pet}`
      const isUpcoming = b.status === 'confirmed' || b.status === 'pending'
      const isTodayOrFuture = b.date && b.date >= todayYmd && b.status !== 'cancelled'
      if (isUpcoming || isTodayOrFuture) {
        activeGroomingKeys.add(key)
      }
    })

    const groomingByPet = {}
    groomingBookings.forEach((b) => {
      if (b.status !== 'completed') return
      const phone = normalizePhone(b.phone)
      if (!phone) return
      const pet = String(b.petName || '').trim().toLowerCase()
      const key = `${phone}_${pet}`
      if (activeGroomingKeys.has(key)) return

      const dateObj = parseRecordDate(b)
      if (!groomingByPet[key] || dateObj > groomingByPet[key].dateObj) {
        groomingByPet[key] = {
          raw: b,
          dateObj,
          phone,
          ownerName: b.ownerName || b.name || b.customerName || 'Pet Parent',
          petName: b.petName || 'Pet',
          petBreed: b.petBreed || b.breed || 'Dog',
          petPhoto: b.petPhotoUrl || b.photoUrl || b.petPhoto || '',
          serviceName: b.serviceName || (Array.isArray(b.services) ? b.services.join(', ') : 'Grooming Spa'),
          serviceType: 'grooming',
          nextRecommendedDays: Number(b.nextRecommendedVisitDays) || 30,
        }
      }
    })

    const groomingDueList = []
    Object.values(groomingByPet).forEach((item) => {
      const diffMs = today.getTime() - item.dateObj.getTime()
      const daysSince = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
      const threshold = item.nextRecommendedDays || 30

      if (daysSince >= threshold) {
        const weeks = Math.max(1, Math.floor(daysSince / 7))
        let urgency = { label: 'Due for Spa', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' }
        if (daysSince >= 60) {
          urgency = { label: 'Inactive (60d+)', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' }
        } else if (daysSince >= 45) {
          urgency = { label: 'Overdue (45d+)', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' }
        }

        const origin = window.location.origin
        const message = `Hi ${item.ownerName}! 🐾 It's been ${weeks} weeks since ${item.petName}'s last grooming visit at ${shopName}. Regular grooming keeps ${item.petName}'s coat healthy, knot-free, and clean! 🛁\n\nWe have slots open this week — tap here to reserve: ${origin}/services`
        const waLink = `https://wa.me/91${item.phone}?text=${encodeURIComponent(message)}`

        groomingDueList.push({
          id: `grooming_${item.phone}_${item.petName}`,
          ...item,
          daysSince,
          weeks,
          urgency,
          waLink,
        })
      }
    })

    // ==========================================
    // 2. DOG WALKING RE-ENGAGEMENT
    // ==========================================
    const activeWalkingKeys = new Set()
    walkingBookings.forEach((w) => {
      const phone = normalizePhone(w.phone)
      const pet = String(w.dogName || w.petName || '').trim().toLowerCase()
      const key = `${phone}_${pet}`
      const isUpcoming =
        w.status === 'active' ||
        w.status === 'confirmed' ||
        w.status === 'in_progress' ||
        w.status === 'pending'
      if (isUpcoming) {
        activeWalkingKeys.add(key)
      }
    })

    const walkingByPet = {}
    walkingBookings.forEach((w) => {
      if (w.status !== 'completed') return
      const phone = normalizePhone(w.phone)
      if (!phone) return
      const pet = String(w.dogName || w.petName || '').trim().toLowerCase()
      const key = `${phone}_${pet}`
      if (activeWalkingKeys.has(key)) return

      const dateObj = parseRecordDate(w)
      if (!walkingByPet[key] || dateObj > walkingByPet[key].dateObj) {
        const passTitle =
          w.planType === 'weekly'
            ? '7-Day Pass'
            : w.planType === 'monthly'
            ? '30-Day Pass'
            : 'Single Walk'

        walkingByPet[key] = {
          raw: w,
          dateObj,
          phone,
          ownerName: w.ownerName || w.customerName || 'Pet Parent',
          petName: w.dogName || w.petName || 'Dog',
          petBreed: w.breed || w.dogBreed || 'Dog',
          petPhoto: w.petPhotoUrl || w.photoUrl || '',
          serviceName: passTitle,
          serviceType: 'walking',
        }
      }
    })

    const walkingDueList = []
    Object.values(walkingByPet).forEach((item) => {
      const diffMs = today.getTime() - item.dateObj.getTime()
      const daysSince = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))

      // 7+ days without an active walking pass/booking
      if (daysSince >= 7) {
        const weeks = Math.max(1, Math.floor(daysSince / 7))
        let urgency = { label: 'Renewal Due', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' }
        if (daysSince >= 21) {
          urgency = { label: 'Inactive (3wks+)', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' }
        } else if (daysSince >= 14) {
          urgency = { label: 'Lapsed (2wks+)', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' }
        }

        const origin = window.location.origin
        const message = `Hi ${item.ownerName}! 🐾 We noticed ${item.petName}'s dog walking pass has ended. Keep ${item.petName}'s daily exercise and walking routine active! 🦮\n\nTap here to renew or book: ${origin}/walking`
        const waLink = `https://wa.me/91${item.phone}?text=${encodeURIComponent(message)}`

        walkingDueList.push({
          id: `walking_${item.phone}_${item.petName}`,
          ...item,
          daysSince,
          weeks,
          urgency,
          waLink,
        })
      }
    })

    // Combine & Sort by most overdue first
    const combined = [...groomingDueList, ...walkingDueList].sort((a, b) => b.daysSince - a.daysSince)

    return {
      all: combined,
      grooming: groomingDueList.sort((a, b) => b.daysSince - a.daysSince),
      walking: walkingDueList.sort((a, b) => b.daysSince - a.daysSince),
    }
  }, [groomingBookings, walkingBookings, shopName])

  // Filter by Active Tab
  const activeList = useMemo(() => {
    let list = candidates[filterType] || candidates.all
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (c) =>
          c.petName.toLowerCase().includes(q) ||
          c.ownerName.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          c.petBreed.toLowerCase().includes(q)
      )
    }
    return list
  }, [candidates, filterType, search])

  const visibleList = expanded ? activeList : activeList.slice(0, 5)

  return (
    <div
      className="admin-chart-card reengagement-radar-card"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '20px',
        marginTop: '22px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'rgba(217, 119, 6, 0.12)',
              border: '1px solid rgba(217, 119, 6, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              flexShrink: 0,
            }}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                Customer Re-engagement Radar
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: candidates.all.length > 0 ? '#b45309' : 'var(--muted)',
                  background: candidates.all.length > 0 ? '#fef3c7' : 'var(--surface)',
                  border: `1px solid ${candidates.all.length > 0 ? '#fde68a' : 'var(--border)'}`,
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                {candidates.all.length} Due for Recall
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '3px 0 0 0' }}>
              Pet parents due for grooming spa or walking renewal • 1-tap WhatsApp booking reminder
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="reengagement-filter-pills">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className="reengagement-filter-pill"
            style={{
              background: filterType === 'all' ? 'var(--accent)' : 'transparent',
              color: filterType === 'all' ? '#fff' : 'var(--muted)',
            }}
          >
            All ({candidates.all.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('grooming')}
            className="reengagement-filter-pill"
            style={{
              background: filterType === 'grooming' ? 'var(--accent)' : 'transparent',
              color: filterType === 'grooming' ? '#fff' : 'var(--muted)',
            }}
          >
            <Scissors size={12} />
            <span>Grooming ({candidates.grooming.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterType('walking')}
            className="reengagement-filter-pill"
            style={{
              background: filterType === 'walking' ? 'var(--accent)' : 'transparent',
              color: filterType === 'walking' ? '#fff' : 'var(--muted)',
            }}
          >
            <Footprints size={12} />
            <span>Walking ({candidates.walking.length})</span>
          </button>
        </div>
      </div>

      <style>{`
        .reengagement-filter-pills {
          display: flex;
          width: 100%;
          align-items: center;
          background: var(--surface);
          padding: 3px;
          border-radius: 10px;
          border: 1px solid var(--border);
          gap: 2px;
          box-sizing: border-box;
          user-select: none;
        }

        .reengagement-filter-pill {
          flex: 1 1 0;
          min-width: 0;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 0 6px;
          border-radius: 8px;
          border: none;
          font-size: 11.5px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          transition: background-color 0.15s ease, color 0.15s ease;
          box-sizing: border-box;
        }

        @media (min-width: 640px) {
          .reengagement-filter-pills {
            width: auto;
            display: inline-flex;
          }
          .reengagement-filter-pill {
            flex: initial;
            padding: 0 14px;
            font-size: 12px;
          }
        }
      `}</style>

      {/* Optional Search if 5+ candidates */}
      {candidates.all.length > 4 && (
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted)',
            }}
          />
          <input
            type="text"
            placeholder="Search by pet name, owner, phone or breed..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              fontSize: '12px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
        </div>
      )}

      {/* List of Due Pets */}
      {visibleList.length === 0 ? (
        <div
          style={{
            padding: '30px 20px',
            textAlign: 'center',
            borderRadius: '12px',
            background: 'var(--surface)',
            border: '1px dashed var(--border)',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '8px',
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
            All Pets Are Up to Date!
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
            {search
              ? 'No matching inactive pet parents found for your search.'
              : 'None of your regular grooming or walking clients are overdue for a visit today. Great retention! 🎉'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {visibleList.map((item) => {
            const isGrooming = item.serviceType === 'grooming'
            const ServiceIcon = isGrooming ? Scissors : Footprints
            const serviceColor = isGrooming ? '#d97706' : '#2563eb'
            const serviceBg = isGrooming ? 'rgba(217, 119, 6, 0.1)' : 'rgba(37, 99, 235, 0.1)'

            return (
              <div
                key={item.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                }}
              >
                {/* Left: Pet & Owner Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '12px',
                      background: serviceBg,
                      border: `1.5px solid ${serviceColor}33`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: serviceColor,
                      fontSize: '18px',
                      flexShrink: 0,
                      overflow: 'hidden',
                    }}
                  >
                    {item.petPhoto ? (
                      <img
                        src={item.petPhoto}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span>{isGrooming ? '✂️' : '🦮'}</span>
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 800,
                          color: 'var(--text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.petName}
                      </span>
                      {item.petBreed && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--muted)',
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            padding: '1px 6px',
                            borderRadius: '5px',
                          }}
                        >
                          {item.petBreed}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          color: item.urgency.color,
                          background: item.urgency.bg,
                          padding: '1.5px 7px',
                          borderRadius: '10px',
                        }}
                      >
                        {item.urgency.label}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--muted)',
                        marginTop: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{item.ownerName}</span>
                      <span>•</span>
                      <span>{item.phone}</span>
                      <span>•</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <ServiceIcon size={12} style={{ color: serviceColor }} />
                        <span>{item.serviceName}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Days Elapsed Badge + 1-Tap WhatsApp Action */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right', minWidth: '75px' }}>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 800,
                        color: 'var(--text)',
                        fontFamily: '"DM Mono", monospace',
                      }}
                    >
                      {item.daysSince} days
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '1px' }}>
                      since visit ({item.weeks}w)
                    </div>
                  </div>

                  <a
                    href={item.waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      height: '34px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      background: '#16a34a',
                      border: '1px solid #15803d',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      textDecoration: 'none',
                      boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                      transition: 'all 0.15s ease',
                      cursor: 'pointer',
                    }}
                    title={`Send re-visit reminder to ${item.ownerName}`}
                  >
                    <MessageCircle size={15} />
                    <span>WhatsApp</span>
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Show More / Show Less Toggle */}
      {activeList.length > 5 && (
        <div style={{ textAlign: 'center', marginTop: '14px' }}>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '20px',
              padding: '6px 16px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--accent)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            {expanded ? (
              <>
                <span>Show Less</span>
                <ChevronUp size={14} />
              </>
            ) : (
              <>
                <span>Show All {activeList.length} Due Pets</span>
                <ChevronDown size={14} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
