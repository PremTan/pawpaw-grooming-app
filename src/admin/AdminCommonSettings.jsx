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

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveCommonSettings(db, settings)
      setToastType('success')
      setToastMessage('Common settings saved successfully!')
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
            label: 'Emergency Closure',
            icon: ShieldAlert,
            badge: settings.emergencyClosure ? 'Active' : null,
            badgeBg: settings.emergencyClosure ? '#FEE2E2' : undefined,
            badgeColor: settings.emergencyClosure ? '#DC2626' : undefined,
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

        {/* SECTION 2: EMERGENCY & GLOBAL CLOSURE */}
        {activeTab === 'emergency' && (
        <section className="booking-panel" style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: '18px', padding: '22px 24px', boxShadow: '0 4px 18px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ color: settings.emergencyClosure ? '#EF4444' : 'var(--accent)', display: 'inline-flex' }}>
              <ShieldAlert size={20} />
            </span>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Emergency Center Closure
            </h2>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.5 }}>
            Temporarily pause new online booking requests across the entire facility (due to weather, sudden emergency, or deep sanitization).
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: '14px' }}>
            <div>
              <strong style={{ fontSize: '14px', color: 'var(--text)', display: 'block' }}>Emergency Closure Status</strong>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {settings.emergencyClosure ? 'Active — all new online bookings paused' : 'Inactive — normal business operations'}
              </span>
            </div>
            <label className="toggle-switch" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.emergencyClosure}
                onChange={e => setSettings(p => ({ ...p, emergencyClosure: e.target.checked }))}
                style={{ width: '18px', height: '18px', accentColor: '#EF4444' }}
              />
            </label>
          </div>

          {settings.emergencyClosure && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '14px' }}>
              <div style={{ padding: '14px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#EF4444', marginBottom: '6px' }}>
                  Notice Message for Customers
                </label>
                <input
                  type="text"
                  className="input"
                  value={settings.emergencyNotice}
                  onChange={e => setSettings(p => ({ ...p, emergencyNotice: e.target.value }))}
                  placeholder="e.g. Paw Paw Centre is temporarily closed due to weather. We will resume shortly."
                  style={{ width: '100%', height: '40px', fontSize: '13px', borderRadius: '8px' }}
                />
              </div>

              {/* Estimated Closure & Reopening Schedule (Optional) */}
              <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--surface)', border: '1.5px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '6px' }}>
                  <strong style={{ fontSize: '13.5px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={15} color="var(--accent)" /> Estimated Closure Dates (Optional)
                  </strong>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--card)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    Auto-reopens when date arrives
                  </span>
                </div>
                <p style={{ color: 'var(--muted)', fontSize: '12px', margin: '0 0 12px', lineHeight: 1.45 }}>
                  Leave blank to keep closed indefinitely until manually turned off. Or set an expected reopening date for <strong>automatic reopening</strong>.
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
                      Center will automatically reopen on this day
                    </span>
                  </div>
                </div>

                {/* Quick Date Presets */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>Quick Presets:</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '3px 9px', fontSize: '11px', borderRadius: '6px' }}
                    onClick={() => {
                      const d = new Date()
                      d.setDate(d.getDate() + 1)
                      const dStr = d.toISOString().slice(0, 10)
                      setSettings(p => ({ ...p, closureStartDate: p.closureStartDate || new Date().toISOString().slice(0, 10), reopenDate: dStr }))
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
                      const dStr = d.toISOString().slice(0, 10)
                      setSettings(p => ({ ...p, closureStartDate: p.closureStartDate || new Date().toISOString().slice(0, 10), reopenDate: dStr }))
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
                      const dStr = d.toISOString().slice(0, 10)
                      setSettings(p => ({ ...p, closureStartDate: p.closureStartDate || new Date().toISOString().slice(0, 10), reopenDate: dStr }))
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

                {/* Status Notice */}
                {settings.reopenDate ? (() => {
                  const todayStr = new Date().toISOString().slice(0, 10)
                  const isExpired = todayStr >= settings.reopenDate
                  return (
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      background: isExpired ? '#FFFBEB' : '#ECFDF5',
                      border: `1px solid ${isExpired ? '#FDE68A' : '#A7F3D0'}`,
                      color: isExpired ? '#B45309' : '#065F46',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      {isExpired ? (
                        <span>⚠️ Reopen date (<strong>{settings.reopenDate}</strong>) has passed. Closure is expired and bookings will be accepted automatically.</span>
                      ) : (
                        <span>🟢 <strong>Auto-Reopen Enabled:</strong> The facility will automatically reopen for new bookings on <strong>{settings.reopenDate}</strong>.</span>
                      )}
                    </div>
                  )
                })() : (
                  <div style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '11.5px', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF' }}>
                    ℹ️ <strong>Manual Control:</strong> Facility will remain closed until you manually uncheck the toggle above.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Service Active Toggles */}
          <div style={{ marginTop: '16px' }}>
            <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Service-Level Availability
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                  <Scissors size={15} style={{ color: 'var(--accent)' }} /> Pet Grooming
                </span>
                <input
                  type="checkbox"
                  checked={settings.servicesActive?.grooming !== false}
                  onChange={e => setSettings(p => ({ ...p, servicesActive: { ...p.servicesActive, grooming: e.target.checked } }))}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                  <Footprints size={15} style={{ color: 'var(--accent)' }} /> Dog Walking
                </span>
                <input
                  type="checkbox"
                  checked={settings.servicesActive?.walking !== false}
                  onChange={e => setSettings(p => ({ ...p, servicesActive: { ...p.servicesActive, walking: e.target.checked } }))}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                  <Hotel size={15} style={{ color: 'var(--accent)' }} /> Pet Boarding
                </span>
                <input
                  type="checkbox"
                  checked={settings.servicesActive?.boarding !== false}
                  onChange={e => setSettings(p => ({ ...p, servicesActive: { ...p.servicesActive, boarding: e.target.checked } }))}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }}
                />
              </div>
            </div>
          </div>
        </section>
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

