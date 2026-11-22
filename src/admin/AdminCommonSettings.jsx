// src/admin/AdminCommonSettings.jsx
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  CalendarOff,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Save,
  Trash2,
  Plus,
  Sliders,
  Scissors,
  Footprints,
  Hotel,
  ShieldAlert,
  ArrowRight,
  Info,
  Calendar,
} from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import {
  DEFAULT_COMMON_SETTINGS,
  fetchCommonSettings,
  saveCommonSettings,
} from '../utils/commonSettings'

export default function AdminCommonSettings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'holidays'
  const [activeTab, setActiveTab] = useState(initialTab)

  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('tab', tabId)
      return next
    }, { replace: true })
  }

  const [settings, setSettings] = useState(DEFAULT_COMMON_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [holidayDate, setHolidayDate] = useState('')
  const [holidayReason, setHolidayReason] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')

  useEffect(() => {
    async function loadData() {
      try {
        const data = await fetchCommonSettings(db, true)
        setSettings(data)
      } catch (err) {
        console.warn('Failed to load common settings:', err)
        setToastType('error')
        setToastMessage('Failed to load common settings.')
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const handleAddHoliday = (e) => {
    e?.preventDefault()
    if (!holidayDate) return

    setSettings(prev => {
      const nextHolidays = Array.from(new Set([...prev.holidays, holidayDate])).sort()
      const nextLabels = { ...(prev.holidayLabels || {}) }
      if (holidayReason.trim()) {
        nextLabels[holidayDate] = holidayReason.trim()
      }
      return {
        ...prev,
        holidays: nextHolidays,
        holidayLabels: nextLabels,
      }
    })

    setHolidayDate('')
    setHolidayReason('')
  }

  const handleRemoveHoliday = (date) => {
    setSettings(prev => {
      const nextHolidays = prev.holidays.filter(d => d !== date)
      const nextLabels = { ...(prev.holidayLabels || {}) }
      delete nextLabels[date]
      return {
        ...prev,
        holidays: nextHolidays,
        holidayLabels: nextLabels,
      }
    })
  }

  const handleClearPastHolidays = () => {
    const today = new Date().toISOString().slice(0, 10)
    setSettings(prev => {
      const nextHolidays = prev.holidays.filter(d => d >= today)
      const nextLabels = { ...(prev.holidayLabels || {}) }
      Object.keys(nextLabels).forEach(d => {
        if (d < today) delete nextLabels[d]
      })
      return {
        ...prev,
        holidays: nextHolidays,
        holidayLabels: nextLabels,
      }
    })
    setToastType('success')
    setToastMessage('Past holidays cleared.')
  }

  const isAllServicesPaused =
    settings.servicesActive?.grooming === false &&
    settings.servicesActive?.walking === false &&
    settings.servicesActive?.boarding === false

  const isAnyServicePaused =
    settings.servicesActive?.grooming === false ||
    settings.servicesActive?.walking === false ||
    settings.servicesActive?.boarding === false

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveCommonSettings(db, settings)
      setToastType('success')
      if (settings.emergencyClosure) {
        setToastMessage('Settings saved: Center emergency closure is active (all online bookings paused).')
      } else if (isAnyServicePaused) {
        setToastMessage('Settings saved: Paused services updated. Active services are open for bookings.')
      } else {
        setToastMessage('Settings saved: Store is open and all services are accepting bookings!')
      }
    } catch (err) {
      console.error('Failed to save common settings:', err)
      setToastType('error')
      setToastMessage('Failed to save settings. Please try again.')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="admin-page-container" style={{ padding: '40px 20px', textAlign: 'center' }}>
        <Spinner text="Loading Common Settings..." />
      </div>
    )
  }

  return (
    <div className="admin-page admin-common-settings-page" style={{ maxWidth: '1060px', margin: '0 auto', paddingBottom: '90px' }}>
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 9999 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}

      {/* Header */}
      <div className="admin-page-header" style={{ marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ display: 'inline-flex', padding: '8px', borderRadius: '10px', background: 'var(--accent-bg, rgba(212,175,55,0.12))', color: 'var(--accent, #D4AF37)' }}>
              <Sliders size={20} />
            </span>
            <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '26px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
              Common Settings
            </h1>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '6px 0 0' }}>
            Universal holidays, customer invoices and emergency controls applied across all 3 services (Grooming, Pet Walking & Pet Boarding).
          </p>
        </div>
      </div>

      {/* Scoped CSS for robust, non-overlapping Tabs on all devices */}
      <style>{`
        .common-nav-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 22px;
          padding: 6px;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: 14px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: var(--accent) transparent;
          box-sizing: border-box;
        }
        .common-nav-tabs::-webkit-scrollbar {
          height: 3px;
        }
        .common-nav-tabs::-webkit-scrollbar-thumb {
          background: var(--accent);
          border-radius: 999px;
        }
        .common-tab-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 9px 16px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--muted);
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s ease;
          white-space: nowrap;
          flex-shrink: 0;
          font-family: inherit;
          box-sizing: border-box;
          user-select: none;
        }
        .common-tab-btn:hover {
          color: var(--text);
          background: var(--card);
        }
        .common-tab-btn.active {
          color: #1a1a1a;
          background: var(--accent, #D4AF37);
          border-color: var(--accent, #D4AF37);
          box-shadow: 0 2px 10px rgba(212, 175, 55, 0.28);
        }
        .common-tab-badge {
          font-size: 11px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 999px;
          letter-spacing: 0.3px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
        }
        @media (min-width: 768px) {
          .common-tab-btn {
            flex: 1 1 0;
          }
        }
      `}</style>

      {/* Navigation Tabs */}
      <div
        className="common-nav-tabs"
        role="tablist"
        aria-label="Common Settings Sections"
      >
        {[
          {
            id: 'holidays',
            label: 'Holidays',
            icon: CalendarOff,
            badge: settings.holidays?.length ? `${settings.holidays.length}` : null,
            badgeBg: 'var(--accent-bg, rgba(212,175,55,0.18))',
            badgeColor: 'var(--accent, #D4AF37)',
          },
          {
            id: 'emergency',
            label: 'Store & Service Status',
            icon: ShieldAlert,
            badge: settings.emergencyClosure
              ? 'Closed'
              : (isAnyServicePaused ? 'Paused' : 'All Open'),
            badgeBg: settings.emergencyClosure ? '#FEE2E2' : (isAnyServicePaused ? '#FEF3C7' : '#ECFDF5'),
            badgeColor: settings.emergencyClosure ? '#DC2626' : (isAnyServicePaused ? '#B45309' : '#047857'),
          },
          {
            id: 'invoices',
            label: 'Invoices & Links',
            icon: FileText,
            badge: settings.allowCustomerInvoiceDownload ? 'Active' : null,
            badgeBg: 'rgba(16, 185, 129, 0.15)',
            badgeColor: '#059669',
          },
        ].map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabChange(tab.id)}
              className={`common-tab-btn ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} style={{ color: isActive ? '#1a1a1a' : 'inherit', flexShrink: 0 }} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className="common-tab-badge"
                  style={{
                    background: isActive ? 'rgba(0,0,0,0.15)' : tab.badgeBg || 'var(--card)',
                    color: isActive ? '#1a1a1a' : tab.badgeColor || 'var(--text)',
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gap: '22px' }}>
        {/* CARD 1: GLOBAL HOLIDAYS (Applies to Grooming, Walking & Boarding) */}
        {activeTab === 'holidays' && (
        <section className="booking-panel" style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: '18px', padding: '22px 24px', boxShadow: '0 4px 18px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
                <CalendarOff size={20} />
              </span>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                Holidays (All Services)
              </h2>
            </div>
            {settings.holidays.length > 0 && (
              <button
                type="button"
                onClick={handleClearPastHolidays}
                className="btn btn-outline"
                style={{ fontSize: '11px', padding: '4px 10px', height: '28px' }}
              >
                Clear Past Dates
              </button>
            )}
          </div>

          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.5 }}>
            Dates added here will be unavailable for all visit types across <strong>Grooming</strong>, <strong>Pet Walking</strong>, and <strong>Pet Boarding</strong>.
          </p>

          {/* Add Holiday Form */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '18px' }}>
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px' }}>
              <input
                type="date"
                value={holidayDate}
                onChange={e => setHolidayDate(e.target.value)}
                className="input"
                style={{ width: '100%', height: '42px', padding: '8px 12px', fontSize: '13.5px', borderRadius: '10px' }}
                placeholder="dd-mm-yyyy"
              />
            </div>
            <div style={{ flex: '2 1 260px', minWidth: '220px' }}>
              <input
                type="text"
                value={holidayReason}
                onChange={e => setHolidayReason(e.target.value)}
                placeholder="Optional reason (e.g. Diwali, Facility Sanitization)"
                className="input"
                style={{ width: '100%', height: '42px', padding: '8px 12px', fontSize: '13.5px', borderRadius: '10px' }}
              />
            </div>
            <button
              type="button"
              onClick={handleAddHoliday}
              disabled={!holidayDate}
              className="btn btn-secondary"
              style={{ height: '42px', padding: '0 20px', fontSize: '13.5px', fontWeight: 700 }}
            >
              <Plus size={15} /> Add Holiday
            </button>
          </div>

          {/* Holiday Chips */}
          {settings.holidays.length === 0 ? (
            <div style={{ padding: '22px', textAlign: 'center', background: 'var(--surface)', borderRadius: '12px', border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: '13px' }}>
              No holidays added. All three services will follow their standard working schedules.
            </div>
          ) : (
            <div>
              <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Active Holidays ({settings.holidays.length})
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {settings.holidays.map(date => {
                  const label = settings.holidayLabels?.[date]
                  return (
                    <div
                      key={date}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 12px',
                        borderRadius: '999px',
                        background: 'var(--surface)',
                        border: '1.2px solid var(--accent-border, rgba(212,175,55,0.3))',
                        fontSize: '13px',
                        color: 'var(--text)',
                      }}
                    >
                      <Calendar size={13} style={{ color: 'var(--accent)' }} />
                      <strong style={{ fontFamily: '"DM Mono", monospace', fontSize: '12.5px' }}>{date}</strong>
                      {label && (
                        <span style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--card)', padding: '2px 6px', borderRadius: '4px' }}>
                          {label}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveHoliday(date)}
                        title="Remove holiday"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#EF4444',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          marginLeft: '2px',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', fontSize: '12px', color: 'var(--text)' }}>
            <Info size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span>
              <strong>Note:</strong> On these dates, customers will see that Paw Paw is closed for a Holiday on <strong>Grooming</strong>, <strong>Dog Walking</strong>, and <strong>Pet Boarding</strong>.
            </span>
          </div>
        </section>
        )}

        {/* SECTION 2: STORE & SERVICE STATUS (MASTER CLOSURE & INDIVIDUAL SERVICE CONTROLS) */}
        {activeTab === 'emergency' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          {/* Top Status Summary Card */}
          {settings.emergencyClosure ? (
            <div style={{
              padding: '18px 20px',
              borderRadius: '16px',
              background: '#FEF2F2',
              border: '2px solid #EF4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px',
              boxShadow: '0 4px 16px rgba(239, 68, 68, 0.12)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626', flexShrink: 0 }}>
                  <ShieldAlert size={26} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '16.5px', color: '#991B1B', fontWeight: 800 }}>Master Facility Emergency Closed</strong>
                    <span style={{ background: '#DC2626', color: '#fff', fontSize: '11px', fontWeight: 800, padding: '2px 9px', borderRadius: '999px', letterSpacing: '0.3px' }}>
                      ALL BOOKINGS BLOCKED
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#B91C1C' }}>
                    Customer bookings across Grooming, Walking, and Boarding are blocked.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSettings(p => ({
                    ...p,
                    emergencyClosure: false,
                    servicesActive: { grooming: true, walking: true, boarding: true }
                  }))
                  setToastType('success')
                  setToastMessage('Facility reopened! Click "Save Settings" below to apply.')
                }}
                style={{
                  background: '#10B981',
                  border: '1.5px solid #059669',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '10px 18px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                <CheckCircle2 size={16} />
                Re-open Entire Facility
              </button>
            </div>
          ) : isAnyServicePaused ? (
            <div style={{
              padding: '18px 20px',
              borderRadius: '16px',
              background: '#FFFBEB',
              border: '2px solid #F59E0B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px',
              boxShadow: '0 4px 16px rgba(245, 158, 11, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706', flexShrink: 0 }}>
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '16px', color: '#92400E', fontWeight: 800 }}>Store Open — Some Services Paused</strong>
                    <span style={{ background: '#D97706', color: '#fff', fontSize: '11px', fontWeight: 800, padding: '2px 9px', borderRadius: '999px', letterSpacing: '0.3px' }}>
                      PARTIALLY ACTIVE
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#B45309' }}>
                    Active services are open for booking. Paused services show a pause notice to customers.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSettings(p => ({
                    ...p,
                    servicesActive: { grooming: true, walking: true, boarding: true }
                  }))
                  setToastType('success')
                  setToastMessage('All 3 services set to OPEN! Click "Save Settings" below to apply.')
                }}
                style={{
                  background: '#10B981',
                  border: '1.5px solid #059669',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                }}
              >
                <CheckCircle2 size={15} />
                Re-open All 3 Services
              </button>
            </div>
          ) : (
            <div style={{
              padding: '18px 20px',
              borderRadius: '16px',
              background: '#ECFDF5',
              border: '2px solid #10B981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px',
              boxShadow: '0 4px 16px rgba(16, 185, 129, 0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', flexShrink: 0 }}>
                  <CheckCircle2 size={26} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '16px', color: '#065F46', fontWeight: 800 }}>Store & All Services are OPEN</strong>
                    <span style={{ background: '#059669', color: '#fff', fontSize: '11px', fontWeight: 800, padding: '2px 9px', borderRadius: '999px', letterSpacing: '0.3px' }}>
                      NORMAL OPERATIONS
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#047857' }}>
                    Paw Paw is operating normally. Online bookings are active for Pet Grooming, Dog Walking, and Pet Boarding.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSettings(p => ({ ...p, emergencyClosure: true }))}
                style={{
                  background: '#fff',
                  border: '1.5px solid #EF4444',
                  color: '#DC2626',
                  borderRadius: '10px',
                  padding: '9px 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <ShieldAlert size={15} />
                Emergency Close Facility...
              </button>
            </div>
          )}

          {/* CARD 1: MASTER FACILITY EMERGENCY CLOSURE */}
          <section className="booking-panel" style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: '18px', padding: '22px 24px', boxShadow: '0 4px 18px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: settings.emergencyClosure ? '#EF4444' : 'var(--accent)', display: 'inline-flex' }}>
                  <ShieldAlert size={20} />
                </span>
                <h2 style={{ fontSize: '17.5px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Master Facility Emergency Closure
                </h2>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '11.5px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '999px',
                  background: settings.emergencyClosure ? '#FEE2E2' : '#ECFDF5',
                  color: settings.emergencyClosure ? '#DC2626' : '#047857',
                  border: `1px solid ${settings.emergencyClosure ? '#FCA5A5' : '#A7F3D0'}`
                }}>
                  {settings.emergencyClosure ? '🔴 CLOSED' : '🟢 OPEN'}
                </span>
                <button
                  type="button"
                  onClick={() => setSettings(p => ({ ...p, emergencyClosure: !p.emergencyClosure }))}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: settings.emergencyClosure ? '#10B981' : '#FFF1F2',
                    color: settings.emergencyClosure ? '#fff' : '#E11D48',
                    border: `1px solid ${settings.emergencyClosure ? '#059669' : '#FECDD3'}`,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {settings.emergencyClosure ? 'Re-open Facility' : 'Emergency Close Facility'}
                </button>
              </div>
            </div>

            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.5 }}>
              Use this ONLY when the entire facility must close at once (e.g., severe storm, full holiday shutdown, maintenance). To pause just one service, use the <strong>Individual Service Controls</strong> below.
            </p>

            {/* Emergency Closure Details & Auto-reopen Schedule */}
            {settings.emergencyClosure && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
                <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.08)', border: '1.5px solid rgba(239, 68, 68, 0.25)' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#DC2626', marginBottom: '6px' }}>
                    Notice Message for Customers (Center-Wide)
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={settings.emergencyNotice}
                    onChange={e => setSettings(p => ({ ...p, emergencyNotice: e.target.value }))}
                    placeholder="e.g. Paw Paw Centre is temporarily closed due to severe weather. We will resume shortly."
                    style={{ width: '100%', height: '42px', fontSize: '13px', borderRadius: '8px' }}
                  />
                  <span style={{ fontSize: '11px', color: '#B91C1C', marginTop: '4px', display: 'block' }}>
                    This message will appear in the red banner across all booking pages (/book, /book-walking, /book-boarding).
                  </span>
                </div>

                <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--surface)', border: '1.5px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '6px' }}>
                    <strong style={{ fontSize: '13.5px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={15} color="var(--accent)" /> Estimated Closure Dates (Optional Auto-Reopen)
                    </strong>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--card)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      Auto-reopens when date arrives
                    </span>
                  </div>
                  <p style={{ color: 'var(--muted)', fontSize: '12px', margin: '0 0 12px', lineHeight: 1.45 }}>
                    Leave blank to remain closed until you manually turn it off. Or set an expected reopening date to automatically reopen for bookings on that day.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                        Close From (Start Date)
                      </label>
                      <input
                        type="date"
                        className="input"
                        value={settings.closureStartDate || ''}
                        onChange={e => setSettings(p => ({ ...p, closureStartDate: e.target.value }))}
                        style={{ width: '100%', height: '38px', fontSize: '12.5px', borderRadius: '8px' }}
                      />
                      <span style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>
                        Leave empty to close immediately (today)
                      </span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                        Reopen On (Expected Opening Date)
                      </label>
                      <input
                        type="date"
                        className="input"
                        min={settings.closureStartDate || new Date().toISOString().slice(0, 10)}
                        value={settings.reopenDate || ''}
                        onChange={e => setSettings(p => ({ ...p, reopenDate: e.target.value }))}
                        style={{ width: '100%', height: '38px', fontSize: '12.5px', borderRadius: '8px' }}
                      />
                      <span style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '2px', display: 'block' }}>
                        Facility will auto-reopen on this day
                      </span>
                    </div>
                  </div>

                  {/* Quick Presets */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Quick Presets:</span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '3px 9px', fontSize: '11px', borderRadius: '6px' }}
                      onClick={() => {
                        const d = new Date()
                        d.setDate(d.getDate() + 1)
                        setSettings(p => ({ ...p, closureStartDate: p.closureStartDate || new Date().toISOString().slice(0, 10), reopenDate: d.toISOString().slice(0, 10) }))
                      }}
                    >
                      +1 Day (Reopen Tomorrow)
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '3px 9px', fontSize: '11px', borderRadius: '6px' }}
                      onClick={() => {
                        const d = new Date()
                        d.setDate(d.getDate() + 2)
                        setSettings(p => ({ ...p, closureStartDate: p.closureStartDate || new Date().toISOString().slice(0, 10), reopenDate: d.toISOString().slice(0, 10) }))
                      }}
                    >
                      +2 Days
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '3px 9px', fontSize: '11px', borderRadius: '6px' }}
                      onClick={() => {
                        const d = new Date()
                        d.setDate(d.getDate() + 7)
                        setSettings(p => ({ ...p, closureStartDate: p.closureStartDate || new Date().toISOString().slice(0, 10), reopenDate: d.toISOString().slice(0, 10) }))
                      }}
                    >
                      +1 Week
                    </button>
                    {(settings.closureStartDate || settings.reopenDate) && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '3px 9px', fontSize: '11px', borderRadius: '6px', color: '#EF4444', borderColor: '#FCA5A5' }}
                        onClick={() => setSettings(p => ({ ...p, closureStartDate: '', reopenDate: '' }))}
                      >
                        Clear Dates (Indefinite)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* CARD 2: INDIVIDUAL SERVICE CONTROLS */}
          <section className="booking-panel" style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: '18px', padding: '22px 24px', boxShadow: '0 4px 18px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
                  <Sliders size={20} />
                </span>
                <h2 style={{ fontSize: '17.5px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Individual Service Controls (3 Services)
                </h2>
              </div>

              {isAnyServicePaused && (
                <button
                  type="button"
                  onClick={() => {
                    setSettings(p => ({
                      ...p,
                      servicesActive: { grooming: true, walking: true, boarding: true }
                    }))
                    setToastType('success')
                    setToastMessage('All 3 services set to OPEN! Click "Save Settings" below.')
                  }}
                  style={{
                    background: '#10B981',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)'
                  }}
                >
                  <CheckCircle2 size={14} />
                  Turn ON All Services
                </button>
              )}
            </div>

            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.5 }}>
              Need to pause just one service without closing the entire center? Toggle that service below. Other open services will continue accepting customer bookings normally.
            </p>

            {/* 3 Service Control Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '16px' }}>
              {[
                {
                  key: 'grooming',
                  label: 'Pet Grooming',
                  icon: Scissors,
                  desc: 'Salon baths, haircuts & styling',
                  route: '/book',
                  defaultNotice: 'Pet Grooming service is temporarily paused for new bookings.'
                },
                {
                  key: 'walking',
                  label: 'Dog Walking',
                  icon: Footprints,
                  desc: 'Daily walks & exercise packages',
                  route: '/book-walking',
                  defaultNotice: 'Dog Walking service is temporarily paused for new bookings.'
                },
                {
                  key: 'boarding',
                  label: 'Pet Boarding',
                  icon: Hotel,
                  desc: 'Overnight hotel & cage-free stay',
                  route: '/book-boarding',
                  defaultNotice: 'Pet Boarding service is temporarily paused for new reservations.'
                },
              ].map(svc => {
                const SvcIcon = svc.icon
                const isOpen = settings.servicesActive?.[svc.key] !== false
                const customNotice = settings.serviceNotices?.[svc.key] || ''

                return (
                  <div
                    key={svc.key}
                    style={{
                      padding: '18px',
                      borderRadius: '16px',
                      background: isOpen ? 'var(--surface)' : '#FEF2F2',
                      border: `1.5px solid ${isOpen ? 'var(--border)' : '#FCA5A5'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '14px',
                      transition: 'all 0.18s ease',
                      boxShadow: isOpen ? 'none' : '0 3px 12px rgba(239, 68, 68, 0.08)'
                    }}
                  >
                    <div>
                      {/* Service Header Row */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            background: isOpen ? 'var(--accent-bg, rgba(212,175,55,0.14))' : '#FEE2E2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isOpen ? 'var(--accent, #D4AF37)' : '#DC2626',
                            flexShrink: 0
                          }}>
                            <SvcIcon size={20} />
                          </div>
                          <div>
                            <strong style={{ fontSize: '14.5px', color: 'var(--text)', display: 'block' }}>
                              {svc.label}
                            </strong>
                            <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                              {svc.desc}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '3px 9px',
                          borderRadius: '999px',
                          letterSpacing: '0.2px',
                          whiteSpace: 'nowrap',
                          background: isOpen ? '#ECFDF5' : '#FEE2E2',
                          color: isOpen ? '#047857' : '#DC2626',
                          border: `1px solid ${isOpen ? '#A7F3D0' : '#FECACA'}`
                        }}>
                          {isOpen ? '🟢 OPEN' : '⏸️ PAUSED'}
                        </span>
                      </div>

                      {/* If Paused, Show Customer Notice Input & Live Preview */}
                      {!isOpen && (
                        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#991B1B', marginBottom: '4px' }}>
                              Notice for Customers (Optional):
                            </label>
                            <input
                              type="text"
                              className="input"
                              value={customNotice}
                              onChange={e => {
                                const val = e.target.value
                                setSettings(p => ({
                                  ...p,
                                  serviceNotices: {
                                    ...(p.serviceNotices || {}),
                                    [svc.key]: val,
                                  }
                                }))
                              }}
                              placeholder={svc.defaultNotice}
                              style={{ width: '100%', height: '36px', fontSize: '12px', borderRadius: '8px', background: '#fff' }}
                            />
                            <span style={{ fontSize: '10.5px', color: '#B91C1C', marginTop: '2px', display: 'block' }}>
                              Leave blank to show standard notice: &ldquo;{svc.defaultNotice}&rdquo;
                            </span>
                          </div>

                          {/* Live Customer Preview */}
                          <div style={{
                            padding: '10px 12px',
                            borderRadius: '10px',
                            background: '#fff',
                            border: '1px dashed #F87171',
                            fontSize: '11.5px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 800, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                👁️ Live Customer Preview ({svc.route}):
                              </span>
                              <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: 700 }}>
                                Button: [{svc.label} Paused]
                              </span>
                            </div>
                            <strong style={{ fontSize: '12.5px', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <ShieldAlert size={13} color="#DC2626" />
                              {svc.label} Temporarily Paused
                            </strong>
                            <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#B91C1C', lineHeight: 1.4 }}>
                              {customNotice.trim() || svc.defaultNotice}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: `1px solid ${isOpen ? 'var(--border)' : '#FCA5A5'}` }}>
                      <span style={{ fontSize: '11px', color: isOpen ? '#059669' : '#DC2626', fontWeight: 600 }}>
                        {isOpen ? '✓ Accepting online bookings' : '✗ Bookings paused for this service'}
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          setSettings(p => ({
                            ...p,
                            servicesActive: {
                              ...(p.servicesActive || { grooming: true, walking: true, boarding: true }),
                              [svc.key]: !isOpen,
                            }
                          }))
                        }}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: isOpen ? '#FFF1F2' : '#10B981',
                          color: isOpen ? '#E11D48' : '#fff',
                          border: `1px solid ${isOpen ? '#FECDD3' : '#059669'}`,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isOpen ? 'Pause Service' : '🟢 Re-open'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
        )}

        {/* SECTION 3: INVOICES & SERVICE QUICK LINKS */}
        {activeTab === 'invoices' && (
          <>
            {/* CARD 2: CUSTOMER INVOICES (RECEIPT DOWNLOADS) */}
            <section className="booking-panel" style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: '18px', padding: '22px 24px', boxShadow: '0 4px 18px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
                  <FileText size={20} />
                </span>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Customer Invoices
                </h2>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.5 }}>
                Control whether customers can download official PDF receipts from their "My Bookings" page.
              </p>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  padding: '16px',
                  borderRadius: '12px',
                  border: settings.allowCustomerInvoiceDownload
                    ? '1.5px solid var(--accent-border, rgba(212,175,55,0.45))'
                    : '1.5px solid var(--border)',
                  background: settings.allowCustomerInvoiceDownload
                    ? 'var(--accent-bg, rgba(212,175,55,0.08))'
                    : 'var(--surface)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(settings.allowCustomerInvoiceDownload)}
                  onChange={e => setSettings(p => ({ ...p, allowCustomerInvoiceDownload: e.target.checked }))}
                  style={{ width: '18px', height: '18px', marginTop: '3px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <div>
                  <strong style={{ display: 'block', fontSize: '14.5px', color: 'var(--text)', marginBottom: '4px' }}>
                    Allow customers to download receipts / invoices
                  </strong>
                  <span style={{ color: 'var(--muted)', fontSize: '12.5px', lineHeight: 1.45, display: 'block' }}>
                    When enabled, completed Grooming, Dog Walking & Boarding bookings display a "Download Invoice" button for customers.
                  </span>
                </div>
              </label>
            </section>

            {/* CARD 4: QUICK LINKS TO INDIVIDUAL SERVICE SETTINGS */}
            <section className="booking-panel" style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: '18px', padding: '20px 24px', boxShadow: '0 4px 18px rgba(0,0,0,0.04)' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' }}>
                Service-Specific Settings
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <Link
                  to="/admin/bookings?view=settings"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    textDecoration: 'none',
                    color: 'var(--text)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Scissors size={18} style={{ color: 'var(--accent)' }} />
                    <div>
                      <strong style={{ fontSize: '13.5px', display: 'block' }}>Grooming Settings</strong>
                      <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>Working hours, slots & visit charges</span>
                    </div>
                  </div>
                  <ArrowRight size={15} style={{ color: 'var(--muted)' }} />
                </Link>

                <Link
                  to="/admin/walking"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    textDecoration: 'none',
                    color: 'var(--text)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Footprints size={18} style={{ color: 'var(--accent)' }} />
                    <div>
                      <strong style={{ fontSize: '13.5px', display: 'block' }}>Walking Settings</strong>
                      <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>Slots, rates, duration & areas</span>
                    </div>
                  </div>
                  <ArrowRight size={15} style={{ color: 'var(--muted)' }} />
                </Link>

                <Link
                  to="/admin/boarding"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    textDecoration: 'none',
                    color: 'var(--text)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Hotel size={18} style={{ color: 'var(--accent)' }} />
                    <div>
                      <strong style={{ fontSize: '13.5px', display: 'block' }}>Boarding Settings</strong>
                      <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>Hostelling rates, check-in & capacity</span>
                    </div>
                  </div>
                  <ArrowRight size={15} style={{ color: 'var(--muted)' }} />
                </Link>
              </div>
            </section>
          </>
        )}
      </div>

      {/* Proper Floating Save Button */}
      <div className="admin-common-floating-save">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="admin-floating-save-btn"
          aria-label="Save Settings"
        >
          <Save size={17} />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>
    </div>
  )
}

