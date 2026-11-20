// src/admin/RevenueTrendChart.jsx
import { useMemo, useState, useEffect } from 'react'
import { format, startOfToday, subDays, subMonths } from 'date-fns'
import { TrendingUp } from 'lucide-react'

const money = (val) => Number(val || 0).toLocaleString('en-IN')

function formatYTick(val) {
  if (val === 0) return '₹0'
  if (val >= 100000) {
    const lk = val / 100000
    return `₹${lk % 1 === 0 ? lk : lk.toFixed(1)}L`
  }
  if (val >= 1000) {
    const k = val / 1000
    return `₹${k % 1 === 0 ? k : k.toFixed(0)}k`
  }
  return `₹${val}`
}

function calculateNiceMax(maxVal) {
  if (maxVal <= 0) return 6000
  if (maxVal <= 3000) return 3000
  if (maxVal <= 6000) return 6000
  if (maxVal <= 10000) return 10000
  if (maxVal <= 25000) return 25000
  if (maxVal <= 50000) return 50000
  if (maxVal <= 75000) return 75000
  if (maxVal <= 100000) return 100000
  if (maxVal <= 150000) return 150000
  if (maxVal <= 200000) return 200000
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)))
  return Math.ceil(maxVal / magnitude) * magnitude
}

function getSmoothCurvePath(points) {
  if (!points || points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2 >= points.length ? points.length - 1 : i + 2]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return path
}

export default function RevenueTrendChart({ items = [] }) {
  const [chartMode, setChartMode] = useState('weekly') // 'weekly' | 'monthly'

  // Build series for weekly (last 7 days ending today) and monthly (last 6 months ending current month)
  const chartData = useMemo(() => {
    const today = startOfToday()

    if (chartMode === 'monthly') {
      const months = Array.from({ length: 6 }, (_, idx) => {
        const d = subMonths(today, 5 - idx)
        const key = format(d, 'yyyy-MM')
        const label = format(d, 'MMM')

        const currentItems = items.filter(i => i.dateYmd && i.dateYmd.startsWith(key) && i.isCompleted)
        const currentRev = currentItems.reduce((acc, i) => acc + (i.amount || 0), 0)

        return {
          key,
          label,
          fullLabel: format(d, 'MMMM yyyy'),
          currentRev,
          currentCount: currentItems.length,
        }
      })
      return months
    }

    // Weekly: last 7 days ending today
    const days = Array.from({ length: 7 }, (_, idx) => {
      const d = subDays(today, 6 - idx)
      const key = format(d, 'yyyy-MM-dd')
      const label = format(d, 'EEE')

      const currentItems = items.filter(i => i.dateYmd === key && i.isCompleted)
      const currentRev = currentItems.reduce((acc, i) => acc + (i.amount || 0), 0)

      return {
        key,
        label,
        fullLabel: format(d, 'EEE, dd MMM yyyy'),
        currentRev,
        currentCount: currentItems.length,
      }
    })
    return days
  }, [items, chartMode])

  // Automatically default to today (last node in weekly) or current month (last node in monthly)
  const defaultKey = useMemo(() => {
    if (!chartData || chartData.length === 0) return null
    return chartData[chartData.length - 1]?.key || null
  }, [chartData])

  const [activeKey, setActiveKey] = useState(defaultKey)

  // Keep default node selected on mode change
  useEffect(() => {
    setActiveKey(defaultKey)
  }, [defaultKey])

  const totalCurrent = useMemo(() => chartData.reduce((acc, d) => acc + d.currentRev, 0), [chartData])
  const totalCount = useMemo(() => chartData.reduce((acc, d) => acc + d.currentCount, 0), [chartData])

  // Coordinate calculations optimized for crisp mobile view (380x210 viewBox = ~1:1 scale on phones)
  const width = 380
  const height = 210
  const paddingLeft = 48
  const paddingRight = 14
  const paddingTop = 20
  const paddingBottom = 32
  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom
  const baselineY = height - paddingBottom

  const maxDataVal = Math.max(...chartData.map(d => d.currentRev), 500)
  const niceMax = calculateNiceMax(maxDataVal)

  // 4 clean horizontal grid levels with ample spacing
  const yTicks = [0, niceMax * 0.33, niceMax * 0.66, niceMax]

  const getY = (val) => baselineY - (Math.min(val, niceMax) / niceMax) * plotHeight
  const getX = (idx) => paddingLeft + (idx / (chartData.length - 1)) * plotWidth

  const currentPoints = chartData.map((d, i) => ({
    x: getX(i),
    y: getY(d.currentRev),
    ...d,
  }))

  const activePoint = useMemo(() => {
    if (!activeKey) return currentPoints[currentPoints.length - 1] || null
    return currentPoints.find(p => p.key === activeKey) || currentPoints[currentPoints.length - 1] || null
  }, [activeKey, currentPoints])

  const currentCurve = getSmoothCurvePath(currentPoints)
  const currentArea = currentPoints.length > 0
    ? `${currentCurve} L ${currentPoints[currentPoints.length - 1].x.toFixed(1)} ${baselineY} L ${currentPoints[0].x.toFixed(1)} ${baselineY} Z`
    : ''

  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        position: 'relative'
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(37, 99, 235, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563eb'
            }}>
              <TrendingUp size={16} />
            </div>
            <h2 style={{ fontWeight: 700, color: 'var(--text)', fontSize: '16px', margin: 0 }}>Revenue & Activity Trend</h2>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '12px', margin: '4px 0 0 36px' }}>
            Grooming, Walking & Boarding completed revenue
          </p>
        </div>

        {/* Toggle Weekly / Monthly */}
        <div
          style={{
            display: 'inline-flex',
            background: 'var(--surface)',
            padding: '3px',
            borderRadius: '10px',
            border: '1px solid var(--border)'
          }}
        >
          <button
            type="button"
            onClick={() => setChartMode('weekly')}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: chartMode === 'weekly' ? 700 : 500,
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              background: chartMode === 'weekly' ? 'var(--accent)' : 'transparent',
              color: chartMode === 'weekly' ? '#fff' : 'var(--muted)',
              transition: 'all 0.2s ease',
            }}
          >
            Weekly
          </button>
          <button
            type="button"
            onClick={() => setChartMode('monthly')}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: chartMode === 'monthly' ? 700 : 500,
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              background: chartMode === 'monthly' ? 'var(--accent)' : 'transparent',
              color: chartMode === 'monthly' ? '#fff' : 'var(--muted)',
              transition: 'all 0.2s ease',
            }}
          >
            Monthly
          </button>
        </div>
      </div>

      {/* Summary KPI Badges (Clean 2-Box Layout) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '12px',
        padding: '12px 16px',
        background: 'var(--surface)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
      }}>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Period Revenue</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563eb', fontFamily: '"DM Mono", monospace', marginTop: '2px' }}>
            ₹{money(totalCurrent)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Completed Visits</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>
            {totalCount} <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted)' }}>visits</span>
          </div>
        </div>
      </div>

      {/* Interactive Chart Container */}
      <div style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
        {/* SVG Drawing Layer (Visual Only, No pointer events trap) */}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
        >
          <defs>
            <linearGradient id="pawpawAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
            </linearGradient>
            <filter id="shadowFilter" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#2563eb" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* Horizontal Grid lines & Bold Y-axis labels */}
          {yTicks.map((val) => {
            const y = getY(val)
            return (
              <g key={val}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="3 4"
                  strokeWidth="1"
                  opacity={0.65}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4.5}
                  textAnchor="end"
                  fontSize="12.5"
                  fontFamily='"DM Mono", monospace'
                  fontWeight="700"
                  fill="var(--text)"
                >
                  {formatYTick(val)}
                </text>
              </g>
            )
          })}

          {/* X-axis Day / Month labels (Prominent & Clear on Mobile) */}
          {currentPoints.map((p) => {
            const isActive = activePoint?.key === p.key
            return (
              <text
                key={p.key}
                x={p.x}
                y={height - 8}
                textAnchor="middle"
                fontSize="13.5"
                fontWeight="700"
                fill={isActive ? '#2563eb' : 'var(--text)'}
              >
                {p.label}
              </text>
            )
          })}

          {/* Active Vertical Guideline */}
          {activePoint && (
            <line
              x1={activePoint.x}
              y1={paddingTop}
              x2={activePoint.x}
              y2={baselineY}
              stroke="#2563eb"
              strokeDasharray="3 3"
              strokeWidth="1.8"
              opacity={0.7}
            />
          )}

          {/* Current Period Area fill */}
          {currentPoints.length > 1 && (
            <path d={currentArea} fill="url(#pawpawAreaGradient)" />
          )}

          {/* Current Period Solid Curved Line */}
          {currentPoints.length > 1 && (
            <path
              d={currentCurve}
              fill="none"
              stroke="#2563eb"
              strokeWidth="3.2"
              strokeLinecap="round"
              filter="url(#shadowFilter)"
            />
          )}

          {/* Dots on Current Period */}
          {currentPoints.map((p) => {
            const isActive = activePoint?.key === p.key
            return (
              <g key={`curr-${p.key}`}>
                {isActive && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="12"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    opacity={0.4}
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isActive ? '7.5' : '5'}
                  fill="#ffffff"
                  stroke="#2563eb"
                  strokeWidth={isActive ? '3.8' : '2.8'}
                  style={{ transition: 'all 0.15s ease' }}
                />
              </g>
            )
          })}
        </svg>

        {/* 100% Reliable Native HTML Touch/Click Target Overlay */}
        <div
          style={{
            position: 'absolute',
            left: `${(paddingLeft / width) * 100}%`,
            right: `${(paddingRight / width) * 100}%`,
            top: 0,
            bottom: `${(paddingBottom / height) * 100}%`,
            display: 'flex',
            zIndex: 10,
          }}
        >
          {currentPoints.map((p) => {
            const isSelected = activePoint?.key === p.key
            return (
              <button
                key={`btn-${p.key}`}
                type="button"
                aria-label={`Select ${p.label}`}
                onClick={() => setActiveKey(p.key)}
                style={{
                  flex: 1,
                  height: '100%',
                  background: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  cursor: 'pointer',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  borderRadius: '6px',
                  transition: 'background 0.15s ease',
                }}
              />
            )
          })}
        </div>

        {/* Floating Tooltip with smart collision avoidance:
            If node is in the upper area of chart, flips BELOW the node so it NEVER covers Period Revenue / Completed Visits */}
        {activePoint && (() => {
          const xRatio = activePoint.x / width
          const yRatio = activePoint.y / height
          // When point is in top 46% of chart, place tooltip below the node so it never covers the KPI boxes above
          const showBelow = yRatio < 0.46
          const xAlign = xRatio < 0.22 ? '-6%' : xRatio > 0.78 ? '-94%' : '-50%'
          const yTransform = showBelow ? '14px' : 'calc(-100% - 14px)'

          return (
            <div
              style={{
                position: 'absolute',
                left: `${xRatio * 100}%`,
                top: `${yRatio * 100}%`,
                transform: `translate(${xAlign}, ${yTransform})`,
                background: 'rgba(15, 23, 42, 0.96)',
                color: '#ffffff',
                padding: '9px 13px',
                borderRadius: '9px',
                fontSize: '11.5px',
                zIndex: 30,
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                whiteSpace: 'nowrap',
                lineHeight: 1.45,
                border: '1px solid rgba(255,255,255,0.14)',
                pointerEvents: 'none',
                transition: 'transform 0.15s ease, left 0.15s ease, top 0.15s ease',
              }}
            >
              <div style={{ fontWeight: 800, color: '#93c5fd', marginBottom: '2px', fontSize: '12px' }}>
                {activePoint.fullLabel}
              </div>
              <div>
                <span style={{ color: '#60a5fa' }}>● Revenue: </span>
                <strong style={{ fontSize: '13px' }}>₹{money(activePoint.currentRev)}</strong>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>● Completed: </span>
                <strong>{activePoint.currentCount}</strong> visits
              </div>
            </div>
          )
        })()}
      </div>

      {/* Legend Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        paddingTop: '6px',
        borderTop: '1px solid var(--border)',
        fontSize: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text)' }}>
          <span style={{ width: '12px', height: '3px', borderRadius: '2px', background: '#2563eb' }} />
          <span>Revenue Trend</span>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '11px' }}>
          Tap any day/month column to switch
        </span>
      </div>
    </div>
  )
}
