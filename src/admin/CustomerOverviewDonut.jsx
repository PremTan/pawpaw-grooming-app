// src/admin/CustomerOverviewDonut.jsx
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, ArrowUpRight, CheckCircle2, Award, TrendingDown } from 'lucide-react'

const money = (val) => Number(val || 0).toLocaleString('en-IN')

function getServiceIcon(name = '') {
  const lower = name.toLowerCase()
  if (lower.includes('hair cut') || lower.includes('haircut')) return '✂️'
  if (lower.includes('bath') || lower.includes('spa')) return '🛁'
  if (lower.includes('nail')) return '🐾'
  if (lower.includes('style')) return '💅'
  if (lower.includes('full') || lower.includes('package')) return '⭐'
  if (lower.includes('teeth')) return '🦷'
  return '✂️'
}

export default function CustomerOverviewDonut({ items = [], totalUniqueCustomers = 0 }) {
  const [viewMode, setViewMode] = useState('type') // 'type' (New vs Returning) | 'service' (Grooming / Walking / Boarding)

  // 1. Calculate New vs Returning Pet Parents
  const customerTypeStats = useMemo(() => {
    const customerCounts = {}
    items.forEach((item) => {
      const key = item.customerKey || item.phone || item.ownerName
      if (!key) return
      customerCounts[key] = (customerCounts[key] || 0) + 1
    })

    const uniqueKeys = Object.keys(customerCounts)
    const total = uniqueKeys.length || totalUniqueCustomers || 1
    const newCount = uniqueKeys.filter((k) => customerCounts[k] === 1).length
    const returningCount = uniqueKeys.filter((k) => customerCounts[k] > 1).length

    const newPct = total > 0 ? Math.round((newCount / total) * 100) : 0
    const returningPct = 100 - newPct

    return {
      total,
      newCount,
      returningCount,
      newPct,
      returningPct,
    }
  }, [items, totalUniqueCustomers])

  // 2. Calculate Service Share (Grooming, Walking, Boarding)
  const serviceStats = useMemo(() => {
    const completedItems = items.filter((i) => i.isCompleted)
    const total = completedItems.length || 1

    const groomingItems = completedItems.filter((i) => i.serviceType === 'grooming')
    const walkingItems = completedItems.filter((i) => i.serviceType === 'walking')
    const boardingItems = completedItems.filter((i) => i.serviceType === 'boarding')

    const groomingRev = groomingItems.reduce((acc, i) => acc + (i.amount || 0), 0)
    const walkingRev = walkingItems.reduce((acc, i) => acc + (i.amount || 0), 0)
    const boardingRev = boardingItems.reduce((acc, i) => acc + (i.amount || 0), 0)

    const groomingPct = Math.round((groomingItems.length / total) * 100)
    const walkingPct = Math.round((walkingItems.length / total) * 100)
    const boardingPct = Math.max(0, 100 - groomingPct - walkingPct)

    return {
      total,
      grooming: { count: groomingItems.length, rev: groomingRev, pct: groomingPct },
      walking: { count: walkingItems.length, rev: walkingRev, pct: walkingPct },
      boarding: { count: boardingItems.length, rev: boardingRev, pct: boardingPct },
    }
  }, [items])

  // 3. Top Grooming Service & Low Grooming Service Calculation
  const groomingRanking = useMemo(() => {
    const serviceCounts = {}

    items
      .filter((i) => i.serviceType === 'grooming' && i.isCompleted)
      .forEach((item) => {
        const rawNames = item.serviceName
          ? item.serviceName.split(',').map((s) => s.trim()).filter(Boolean)
          : ['Grooming Package']

        const splitAmt = (item.amount || 0) / (rawNames.length || 1)

        rawNames.forEach((name) => {
          if (!serviceCounts[name]) {
            serviceCounts[name] = { name, count: 0, rev: 0 }
          }
          serviceCounts[name].count += 1
          serviceCounts[name].rev += splitAmt
        })
      })

    const list = Object.values(serviceCounts).sort(
      (a, b) => b.count - a.count || b.rev - a.rev
    )

    const topGrooming = list.length > 0 ? list[0] : null
    const lowGrooming = list.length > 1 ? list[list.length - 1] : (list[0] || null)

    return {
      topGrooming,
      lowGrooming,
      totalGroomingServices: list.length,
    }
  }, [items])

  // Donut geometry constants
  const size = 170
  const center = size / 2
  const radius = 54
  const strokeWidth = 19
  const circumference = 2 * Math.PI * radius // ≈ 339.29

  // Calculate SVG arc segments based on active tab
  const segments = useMemo(() => {
    if (viewMode === 'type') {
      const { newPct, returningPct } = customerTypeStats
      const s1Length = (newPct / 100) * circumference
      const s2Length = (returningPct / 100) * circumference

      // Start at 12 o'clock (-90 degrees = -0.25 * circumference)
      const startOffset = circumference * 0.25

      return [
        {
          id: 'new',
          label: 'New',
          color: '#2563eb', // Vibrant Blue
          pct: newPct,
          count: customerTypeStats.newCount,
          subLabel: 'First-time pet parents',
          dashArray: `${Math.max(s1Length - 2, 0)} ${circumference}`,
          dashOffset: startOffset,
        },
        {
          id: 'returning',
          label: 'Returning',
          color: '#06b6d4', // Teal / Cyan (matching Image 3)
          pct: returningPct,
          count: customerTypeStats.returningCount,
          subLabel: 'Repeat loyal parents',
          dashArray: `${Math.max(s2Length - 2, 0)} ${circumference}`,
          dashOffset: startOffset - s1Length,
        },
      ]
    }

    // Service Breakdown mode
    const { grooming, walking, boarding } = serviceStats
    const gLength = (grooming.pct / 100) * circumference
    const wLength = (walking.pct / 100) * circumference
    const bLength = (boarding.pct / 100) * circumference
    const startOffset = circumference * 0.25

    return [
      {
        id: 'grooming',
        label: 'Grooming',
        color: '#d97706', // Luxury Gold
        pct: grooming.pct,
        count: grooming.count,
        rev: grooming.rev,
        subLabel: 'Salon & Home visits',
        dashArray: `${Math.max(gLength - 2, 0)} ${circumference}`,
        dashOffset: startOffset,
      },
      {
        id: 'walking',
        label: 'Walking',
        color: '#2563eb', // Royal Blue
        pct: walking.pct,
        count: walking.count,
        rev: walking.rev,
        subLabel: 'Daily dog walking passes',
        dashArray: `${Math.max(wLength - 2, 0)} ${circumference}`,
        dashOffset: startOffset - gLength,
      },
      {
        id: 'boarding',
        label: 'Boarding',
        color: '#7c3aed', // Purple
        pct: boarding.pct,
        count: boarding.count,
        rev: boarding.rev,
        subLabel: 'Pet hotel overnight stays',
        dashArray: `${Math.max(bLength - 2, 0)} ${circumference}`,
        dashOffset: startOffset - gLength - wLength,
      },
    ]
  }, [viewMode, customerTypeStats, serviceStats, circumference])

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      position: 'relative'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(217, 119, 6, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d97706'
            }}>
              <Users size={16} />
            </div>
            <h2 style={{ fontWeight: 700, color: 'var(--text)', fontSize: '16px', margin: 0 }}>Customer & Service Overview</h2>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '12px', margin: '4px 0 0 36px' }}>
            {viewMode === 'type' ? 'First-time vs. repeat pet parents' : 'Service share across completed visits'}
          </p>
        </div>

        {/* Tab switch */}
        <div style={{
          display: 'inline-flex',
          background: 'var(--surface)',
          padding: '3px',
          borderRadius: '10px',
          border: '1px solid var(--border)'
        }}>
          <button
            type="button"
            onClick={() => setViewMode('type')}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: viewMode === 'type' ? 700 : 500,
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              background: viewMode === 'type' ? 'var(--accent)' : 'transparent',
              color: viewMode === 'type' ? '#fff' : 'var(--muted)',
              transition: 'all 0.2s ease',
            }}
          >
            Customer Type
          </button>
          <button
            type="button"
            onClick={() => setViewMode('service')}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: viewMode === 'service' ? 700 : 500,
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              background: viewMode === 'service' ? 'var(--accent)' : 'transparent',
              color: viewMode === 'service' ? '#fff' : 'var(--muted)',
              transition: 'all 0.2s ease',
            }}
          >
            By Service
          </button>
        </div>
      </div>

      {/* Donut Chart + Right Legend Body (Matching Image 3) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        flexWrap: 'wrap',
        padding: '6px 0',
        minHeight: '180px'
      }}>
        {/* SVG Donut */}
        <div style={{ position: 'relative', width: `${size}px`, height: `${size}px`, flexShrink: 0 }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Background Circle Track */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="var(--border)"
              strokeWidth={strokeWidth}
              opacity={0.4}
            />

            {/* Segment Arcs */}
            {segments.map((seg) => (
              <circle
                key={seg.id}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                strokeLinecap="round"
                style={{
                  transition: 'stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease',
                }}
              />
            ))}
          </svg>

          {/* Center Callout Text */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <span style={{
              fontFamily: '"Playfair Display", serif',
              fontSize: '26px',
              fontWeight: 800,
              color: 'var(--text)',
              lineHeight: 1.1,
            }}>
              {viewMode === 'type'
                ? money(customerTypeStats.total)
                : money(serviceStats.total)}
            </span>
            <span style={{
              fontSize: '10.5px',
              fontWeight: 700,
              color: 'var(--muted)',
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              marginTop: '3px',
            }}>
              {viewMode === 'type' ? 'CUSTOMERS' : 'VISITS'}
            </span>
          </div>
        </div>

        {/* Legend List on Right (Matching Reference Image 3) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, minWidth: '150px' }}>
          {segments.map((seg) => (
            <div
              key={seg.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    width: '11px',
                    height: '11px',
                    borderRadius: '50%',
                    background: seg.color,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    {seg.label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>
                    {viewMode === 'type'
                      ? `${seg.count} pet parents`
                      : `₹${money(seg.rev)} (${seg.count} visits)`}
                  </div>
                </div>
              </div>
              <div style={{
                fontSize: '16px',
                fontWeight: 800,
                color: 'var(--text)',
                fontFamily: '"DM Mono", monospace',
              }}>
                {seg.pct}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Grooming Service & Low Grooming Service Highlights */}
      {groomingRanking.topGrooming && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '10px',
          marginTop: '2px',
        }}>
          {/* Top Grooming Service Box */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(34, 197, 94, 0.08)',
            border: '1px solid rgba(34, 197, 94, 0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#16a34a', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              <Award size={13} />
              <span>Top Grooming</span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
              <span>{getServiceIcon(groomingRanking.topGrooming.name)}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {groomingRanking.topGrooming.name}
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted)', display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap', marginTop: '2px' }}>
              <strong style={{ color: '#16a34a', fontFamily: '"DM Mono", monospace' }}>₹{money(groomingRanking.topGrooming.rev)}</strong>
              <span>·</span>
              <span><strong>{groomingRanking.topGrooming.count}</strong> bookings</span>
            </div>
          </div>

          {/* Low Grooming Service Box */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#dc2626', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              <TrendingDown size={13} />
              <span>Low Grooming</span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
              <span>{getServiceIcon(groomingRanking.lowGrooming ? groomingRanking.lowGrooming.name : 'Grooming')}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {groomingRanking.lowGrooming ? groomingRanking.lowGrooming.name : 'None'}
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted)', display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap', marginTop: '2px' }}>
              {groomingRanking.lowGrooming ? (
                <>
                  <strong style={{ color: '#dc2626', fontFamily: '"DM Mono", monospace' }}>₹{money(groomingRanking.lowGrooming.rev)}</strong>
                  <span>·</span>
                  <span><strong>{groomingRanking.lowGrooming.count}</strong> bookings</span>
                </>
              ) : (
                <span>No low service</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer Metrics / Shortcut */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '8px',
        borderTop: '1px solid var(--border)',
        fontSize: '12px'
      }}>
        {viewMode === 'type' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontWeight: 600 }}>
            <CheckCircle2 size={14} />
            <span>{customerTypeStats.returningPct}% Customer Retention Rate</span>
          </div>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: '12px' }}>
            Combined across Grooming, Walking & Boarding
          </div>
        )}

        <Link
          to="/admin/earnings"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            color: 'var(--accent)',
            textDecoration: 'none',
            fontSize: '12px',
            fontWeight: 700,
          }}
        >
          <span>Detailed Revenue</span>
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  )
}
