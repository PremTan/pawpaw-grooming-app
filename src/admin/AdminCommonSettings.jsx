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
  CalendarDays,
  Sparkles,
  Coins,
} from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import {
  DEFAULT_COMMON_SETTINGS,
  fetchCommonSettings,
  saveCommonSettings,
} from '../utils/commonSettings'

function formatHolidayDate(dateStr) {
  if (!dateStr) return ''
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function getDatesInRange(startDateStr, endDateStr) {
  const dates = []
  if (!startDateStr) return dates
  if (!endDateStr || endDateStr <= startDateStr) {
    return [startDateStr]
  }
  const curr = new Date(startDateStr)
  const end = new Date(endDateStr)
  let count = 0
  // Guard max 60 days per range
  while (curr <= end && count < 60) {
    dates.push(curr.toISOString().slice(0, 10))
    curr.setDate(curr.getDate() + 1)
    count++
  }
  return dates
}

export default function AdminCommonSettings() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab') || 'availability'
  // Support legacy tab queries gracefully ('holidays', 'emergency', 'status' -> 'availability')
  const initialTab = (rawTab === 'invoices') ? 'invoices' : 'availability'
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

  // Unified Holidays Form State
  const [dateMode, setDateMode] = useState('single') // 'single' | 'range'
  const [singleDate, setSingleDate] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [holidayReason, setHolidayReason] = useState('')

  // Confirmation Modal for Master Facility Toggle
  const [confirmModalConfig, setConfirmModalConfig] = useState({
    open: false,
    mode: '', // 'close' | 'reopen'
    title: '',
    message: '',
    confirmText: '',
    danger: false,
  })
  const [pendingNotice, setPendingNotice] = useState('')

  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')

  useEffect(() => {
    async function loadData() {
      try {
        const commonData = await fetchCommonSettings(db, true)
        setSettings(commonData)
      } catch (err) {
        console.warn('Failed to load common settings:', err)
        setToastType('error')
        setToastMessage('Failed to load settings.')
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const handleAddHolidays = (e) => {
    e?.preventDefault()
    let datesToAdd = []

    if (dateMode === 'single') {
      if (!singleDate) return
      datesToAdd = [singleDate]
    } else {
      if (!fromDate) return
      datesToAdd = getDatesInRange(fromDate, toDate || fromDate)
    }

    if (datesToAdd.length === 0) return

    setSettings(prev => {
      const nextHolidays = Array.from(new Set([...(prev.holidays || []), ...datesToAdd])).sort()
      const nextLabels = { ...(prev.holidayLabels || {}) }
      const reason = holidayReason.trim()
      if (reason) {
        datesToAdd.forEach(d => {
          nextLabels[d] = reason
        })
      }
      return {
        ...prev,
        holidays: nextHolidays,
        holidayLabels: nextLabels,
      }
    })

    setToastType('success')
    setToastMessage(
      datesToAdd.length === 1
        ? `Added closed date (${formatHolidayDate(datesToAdd[0])}). Click "Save Settings" below.`
        : `Added ${datesToAdd.length} closed dates. Click "Save Settings" below.`
    )

    // Reset inputs
    setSingleDate('')
    setFromDate('')
    setToDate('')
    setHolidayReason('')
  }

  const handleRemoveHoliday = (date) => {
    setSettings(prev => {
      const nextHolidays = (prev.holidays || []).filter(d => d !== date)
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
      const nextHolidays = (prev.holidays || []).filter(d => d >= today)
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

  const isAnyServicePaused =
    settings.servicesActive?.grooming === false ||
    settings.servicesActive?.walking === false ||
    settings.servicesActive?.boarding === false

  const handleToggleMaster = () => {
    if (!settings.emergencyClosure) {
      // Currently open -> User wants to emergency close
      setPendingNotice(settings.emergencyNotice || '')
      setConfirmModalConfig({
        open: true,
        mode: 'close',
        title: 'Emergency Close Entire Facility?',
        message: 'This will pause and block all online customer bookings across Pet Grooming, Dog Walking, and Pet Boarding immediately.',
        confirmText: 'Yes, Close Center',
        danger: true,
      })
    } else {
      // Currently closed -> User wants to reopen
      setConfirmModalConfig({
        open: true,
        mode: 'reopen',
        title: 'Re-open Paw Paw Facility?',
        message: 'This will re-open the facility and resume accepting online customer bookings for all active services.',
        confirmText: 'Yes, Re-open Center',
        danger: false,
      })
    }
  }

  const handleConfirmMasterToggle = () => {
    if (confirmModalConfig.mode === 'close') {
      setSettings(prev => ({
        ...prev,
        emergencyClosure: true,
        emergencyNotice: pendingNotice.trim(),
      }))
      setToastType('success')
      setToastMessage('Center set to Emergency Closed. Click "Save Settings" below to apply.')
    } else if (confirmModalConfig.mode === 'reopen') {
      setSettings(prev => ({
        ...prev,
        emergencyClosure: false,
        servicesActive: { grooming: true, walking: true, boarding: true },
      }))
      setToastType('success')
      setToastMessage('Center Re-opened! Click "Save Settings" below to apply.')
    }
    setConfirmModalConfig(p => ({ ...p, open: false }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveCommonSettings(db, settings)
      setToastType('success')
      if (settings.emergencyClosure) {
        setToastMessage('Saved: Center emergency closed (all bookings blocked).')
      } else if (isAnyServicePaused) {
        setToastMessage('Saved: Service availability updated successfully.')
      } else {
        setToastMessage('Saved: Store is open and all services are accepting bookings!')
      }
    } catch (err) {
      console.error('Failed to save settings:', err)
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

  const todayStr = new Date().toISOString().slice(0, 10)
  const upcomingHolidays = (settings.holidays || []).filter(d => d >= todayStr)
  const pastHolidaysCount = (settings.holidays || []).length - upcomingHolidays.length

  return (
    <div className="admin-page admin-common-settings-page" style={{ maxWidth: '1020px', margin: '0 auto', paddingBottom: '90px' }}>
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 9999 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}

      {/* Confirmation Modal for Emergency Closure / Re-open */}
      <ConfirmModal
        open={confirmModalConfig.open}
        title={confirmModalConfig.title}
        message={confirmModalConfig.message}
        confirmText={confirmModalConfig.confirmText}
        cancelText="Cancel"
        danger={confirmModalConfig.danger}
        reasonLabel={confirmModalConfig.mode === 'close' ? 'Customer Notice Message (Optional)' : ''}
        reasonPlaceholder={confirmModalConfig.mode === 'close' ? 'e.g. Paw Paw Centre is closed due to severe weather / emergency maintenance.' : ''}
        reasonValue={pendingNotice}
        onReasonChange={confirmModalConfig.mode === 'close' ? setPendingNotice : undefined}
        onConfirm={handleConfirmMasterToggle}
        onCancel={() => setConfirmModalConfig(p => ({ ...p, open: false }))}
      />

      {/* Header */}
      <div className="admin-page-header" style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
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
              Store open/close status, individual service controls, universal holidays, and customer invoice settings.
            </p>
          </div>

          {/* Quick status pill in header */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '6px 14px',
            borderRadius: '999px',
            fontSize: '12.5px',
            fontWeight: 700,
            background: settings.emergencyClosure ? '#FEE2E2' : (isAnyServicePaused ? '#FEF3C7' : '#ECFDF5'),
            color: settings.emergencyClosure ? '#DC2626' : (isAnyServicePaused ? '#B45309' : '#047857'),
            border: `1.5px solid ${settings.emergencyClosure ? '#FCA5A5' : (isAnyServicePaused ? '#FCD34D' : '#A7F3D0')}`,
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: settings.emergencyClosure ? '#EF4444' : (isAnyServicePaused ? '#F59E0B' : '#10B981'),
              display: 'inline-block',
            }} />
            {settings.emergencyClosure
              ? 'Center Closed'
              : (isAnyServicePaused ? 'Some Services Paused' : 'All Services Open')}
          </div>
        </div>
      </div>

      {/* Navigation Tabs - Consolidated into 2 clean tabs */}
      <style>{`
        .common-nav-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
          padding: 6px;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: 14px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          box-sizing: border-box;
        }
        .common-tab-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 18px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--muted);
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s ease;
          white-space: nowrap;
          flex: 1 1 0;
          font-family: inherit;
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
          padding: 2px 8px;
          border-radius: 999px;
          letter-spacing: 0.3px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
        }
        @media (max-width: 640px) {
          .common-tab-btn {
            padding: 9px 12px;
            font-size: 12.5px;
          }
        }
      `}</style>

      <div className="common-nav-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'availability'}
          onClick={() => handleTabChange('availability')}
          className={`common-tab-btn ${activeTab === 'availability' ? 'active' : ''}`}
        >
          <CalendarDays size={16} />
          <span>Store Availability & Holidays</span>
          <span
            className="common-tab-badge"
            style={{
              background: activeTab === 'availability'
                ? 'rgba(0,0,0,0.15)'
                : (settings.emergencyClosure ? '#FEE2E2' : (isAnyServicePaused ? '#FEF3C7' : '#ECFDF5')),
              color: activeTab === 'availability'
                ? '#1a1a1a'
                : (settings.emergencyClosure ? '#DC2626' : (isAnyServicePaused ? '#B45309' : '#047857')),
            }}
          >
            {settings.emergencyClosure ? 'Closed' : (isAnyServicePaused ? 'Paused' : 'Open')}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'invoices'}
          onClick={() => handleTabChange('invoices')}
          className={`common-tab-btn ${activeTab === 'invoices' ? 'active' : ''}`}
        >
          <FileText size={16} />
          <span>Invoices & Links</span>
          {settings.allowCustomerInvoiceDownload && (
            <span
              className="common-tab-badge"
              style={{
                background: activeTab === 'invoices' ? 'rgba(0,0,0,0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: activeTab === 'invoices' ? '#1a1a1a' : '#059669',
              }}
            >
              Active
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: STORE AVAILABILITY & HOLIDAYS */}
      {activeTab === 'availability' && (
        <div style={{ display: 'grid', gap: '20px' }}>

          {/* SECTION 1: LIVE STORE & SERVICE CONTROLS */}
          <section
            style={{
              background: 'var(--card)',
              border: '1.5px solid var(--border)',
              borderRadius: '18px',
              padding: '22px',
              boxShadow: '0 4px 18px rgba(0,0,0,0.03)',
            }}
          >
            {/* MASTER STORE TOGGLE ROW */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                padding: '16px 18px',
                borderRadius: '14px',
                background: settings.emergencyClosure ? '#FEF2F2' : '#F0FDF4',
                border: `1.5px solid ${settings.emergencyClosure ? '#FCA5A5' : '#86EFAC'}`,
                marginBottom: '20px',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: settings.emergencyClosure ? '#FEE2E2' : '#DCFCE7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: settings.emergencyClosure ? '#DC2626' : '#15803D',
                    flexShrink: 0,
                  }}
                >
                  {settings.emergencyClosure ? <ShieldAlert size={24} /> : <CheckCircle2 size={24} />}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '16px', color: settings.emergencyClosure ? '#991B1B' : '#14532D', fontWeight: 800 }}>
                      {settings.emergencyClosure ? 'Center Emergency Closed' : 'Paw Paw Center is Open'}
                    </strong>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: settings.emergencyClosure ? '#DC2626' : '#16A34A',
                        color: '#fff',
                        letterSpacing: '0.3px',
                      }}
                    >
                      {settings.emergencyClosure ? 'ALL BOOKINGS BLOCKED' : 'NORMAL OPERATIONS'}
                    </span>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: settings.emergencyClosure ? '#B91C1C' : '#166534', lineHeight: 1.4 }}>
                    {settings.emergencyClosure
                      ? 'No customer bookings accepted across Grooming, Walking, or Boarding.'
                      : 'Center is operating normally. Online bookings are active for enabled services.'}
                  </p>
                </div>
              </div>

              {/* Toggle Switch with Popup Confirmation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: settings.emergencyClosure ? '#DC2626' : '#15803D',
                    userSelect: 'none',
                  }}
                >
                  {settings.emergencyClosure ? 'Center Closed' : 'Center Open'}
                </span>

                <button
                  type="button"
                  role="switch"
                  aria-checked={!settings.emergencyClosure}
                  aria-label="Toggle Paw Paw Center Open or Emergency Closed"
                  onClick={handleToggleMaster}
                  style={{
                    position: 'relative',
                    width: '56px',
                    height: '30px',
                    borderRadius: '999px',
                    border: `2px solid ${!settings.emergencyClosure ? '#059669' : '#F87171'}`,
                    backgroundColor: !settings.emergencyClosure ? '#10B981' : '#FEE2E2',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    outline: 'none',
                    boxShadow: !settings.emergencyClosure
                      ? '0 2px 10px rgba(16, 185, 129, 0.35)'
                      : '0 2px 8px rgba(239, 68, 68, 0.2)',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: !settings.emergencyClosure ? '28px' : '3px',
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      backgroundColor: '#fff',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.22)',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {!settings.emergencyClosure ? (
                      <CheckCircle2 size={13} color="#10B981" />
                    ) : (
                      <ShieldAlert size={13} color="#DC2626" />
                    )}
                  </span>
                </button>
              </div>
            </div>

            {/* Optional Customer Notice for Center Closure */}
            {settings.emergencyClosure && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: '#FEF2F2',
                  border: '1.5px dashed #F87171',
                  marginBottom: '20px',
                }}
              >
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#991B1B', marginBottom: '5px' }}>
                  Notice for Customers across all booking pages (/book, /book-walking, /book-boarding):
                </label>
                <input
                  type="text"
                  className="input"
                  value={settings.emergencyNotice}
                  onChange={e => setSettings(p => ({ ...p, emergencyNotice: e.target.value }))}
                  placeholder="e.g. Paw Paw Centre is temporarily closed due to severe weather. We will resume shortly."
                  style={{ width: '100%', height: '38px', fontSize: '13px', borderRadius: '8px', background: '#fff' }}
                />
              </div>
            )}

            {/* INDIVIDUAL SERVICES SECTION */}
            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Sliders size={16} color="var(--accent)" />
                    Individual Service Availability
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                    Pause or activate a specific service (e.g. if grooming staff is on leave, keep walking and boarding open).
                  </p>
                </div>

                {isAnyServicePaused && !settings.emergencyClosure && (
                  <button
                    type="button"
                    onClick={() => {
                      setSettings(p => ({
                        ...p,
                        servicesActive: { grooming: true, walking: true, boarding: true },
                      }))
                      setToastType('success')
                      setToastMessage('All 3 services set to Active. Click "Save Settings" below.')
                    }}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '8px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: '#ECFDF5',
                      color: '#059669',
                      border: '1px solid #A7F3D0',
                    }}
                  >
                    Turn ON All 3 Services
                  </button>
                )}
              </div>

              {/* 3 Compact Service Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '14px' }}>
                {[
                  {
                    key: 'grooming',
                    label: 'Pet Grooming',
                    desc: 'Salon baths, haircuts & styling',
                    icon: Scissors,
                    defaultNotice: 'Pet Grooming is temporarily paused for new appointments.',
                  },
                  {
                    key: 'walking',
                    label: 'Dog Walking',
                    desc: 'Daily walks & exercise packages',
                    icon: Footprints,
                    defaultNotice: 'Dog Walking is temporarily paused for new bookings.',
                  },
                  {
                    key: 'boarding',
                    label: 'Pet Boarding',
                    desc: 'Overnight hotel & cage-free stay',
                    icon: Hotel,
                    defaultNotice: 'Pet Boarding is temporarily paused for new reservations.',
                  },
                ].map(svc => {
                  const SvcIcon = svc.icon
                  const isOpen = settings.servicesActive?.[svc.key] !== false && !settings.emergencyClosure
                  const isIndividuallyPaused = settings.servicesActive?.[svc.key] === false
                  const customNotice = settings.serviceNotices?.[svc.key] || ''

                  return (
                    <div
                      key={svc.key}
                      style={{
                        padding: '16px',
                        borderRadius: '14px',
                        background: isOpen ? 'var(--surface)' : '#FEF2F2',
                        border: `1.5px solid ${isOpen ? 'var(--border)' : '#FCA5A5'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '12px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div>
                        {/* Service Card Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                background: isOpen ? 'var(--accent-bg, rgba(212,175,55,0.12))' : '#FEE2E2',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: isOpen ? 'var(--accent, #D4AF37)' : '#DC2626',
                                flexShrink: 0,
                              }}
                            >
                              <SvcIcon size={19} />
                            </div>
                            <div>
                              <strong style={{ fontSize: '14px', color: 'var(--text)', display: 'block' }}>
                                {svc.label}
                              </strong>
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                                {svc.desc}
                              </span>
                            </div>
                          </div>

                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: isOpen ? '#ECFDF5' : '#FEE2E2',
                              color: isOpen ? '#047857' : '#DC2626',
                              border: `1px solid ${isOpen ? '#A7F3D0' : '#FECACA'}`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isOpen ? '🟢 Active' : '⏸️ Paused'}
                          </span>
                        </div>

                        {/* Optional Notice if Paused */}
                        {isIndividuallyPaused && !settings.emergencyClosure && (
                          <div style={{ marginTop: '10px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#991B1B', marginBottom: '3px' }}>
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
                                  },
                                }))
                              }}
                              placeholder={svc.defaultNotice}
                              style={{ width: '100%', height: '32px', fontSize: '11.5px', borderRadius: '6px', background: '#fff' }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Toggle Switch */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: `1px solid ${isOpen ? 'var(--border)' : '#FECDD3'}` }}>
                        <span style={{ fontSize: '11.5px', color: isOpen ? '#059669' : '#DC2626', fontWeight: 600 }}>
                          {isOpen ? 'Accepting bookings' : 'Bookings paused'}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: isOpen ? '#059669' : '#DC2626' }}>
                            {isOpen ? 'Active' : 'Paused'}
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isOpen}
                            aria-label={`Toggle ${svc.label}`}
                            disabled={settings.emergencyClosure}
                            onClick={() => {
                              setSettings(p => ({
                                ...p,
                                servicesActive: {
                                  ...(p.servicesActive || { grooming: true, walking: true, boarding: true }),
                                  [svc.key]: isIndividuallyPaused ? true : false,
                                },
                              }))
                            }}
                            style={{
                              position: 'relative',
                              width: '46px',
                              height: '26px',
                              borderRadius: '999px',
                              border: `1.5px solid ${isOpen ? '#059669' : '#CBD5E1'}`,
                              backgroundColor: isOpen ? '#10B981' : '#E2E8F0',
                              cursor: settings.emergencyClosure ? 'not-allowed' : 'pointer',
                              opacity: settings.emergencyClosure ? 0.45 : 1,
                              padding: 0,
                              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                              outline: 'none',
                              boxShadow: isOpen ? '0 2px 6px rgba(16, 185, 129, 0.25)' : 'none',
                            }}
                          >
                            <span
                              style={{
                                position: 'absolute',
                                top: '2px',
                                left: isOpen ? '22px' : '2px',
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                backgroundColor: '#fff',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                              }}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {/* SECTION 2: SCHEDULED HOLIDAYS & DAYS OFF (UNIFIED CALENDAR) */}
          <section
            style={{
              background: 'var(--card)',
              border: '1.5px solid var(--border)',
              borderRadius: '18px',
              padding: '22px',
              boxShadow: '0 4px 18px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
                  <CalendarOff size={20} />
                </span>
                <div>
                  <h2 style={{ fontSize: '17.5px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                    Scheduled Holidays & Days Off
                  </h2>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    All dates added here will automatically block appointments across Grooming, Walking, and Boarding.
                  </span>
                </div>
              </div>

              {pastHolidaysCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearPastHolidays}
                  className="btn btn-outline"
                  style={{ fontSize: '11.5px', padding: '4px 10px', height: '30px' }}
                >
                  Clear {pastHolidaysCount} Past Dates
                </button>
              )}
            </div>

            {/* Unified Add Holiday / Date Range Card */}
            <div
              style={{
                marginTop: '16px',
                padding: '16px',
                borderRadius: '14px',
                background: 'var(--surface)',
                border: '1.5px solid var(--border)',
              }}
            >
              {/* Mode Toggle: Single Day vs Date Range */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Add Off-Day:
                </span>
                <div style={{ display: 'inline-flex', padding: '3px', borderRadius: '8px', background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setDateMode('single')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      background: dateMode === 'single' ? 'var(--accent, #D4AF37)' : 'transparent',
                      color: dateMode === 'single' ? '#1a1a1a' : 'var(--muted)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Single Date
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateMode('range')}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      background: dateMode === 'range' ? 'var(--accent, #D4AF37)' : 'transparent',
                      color: dateMode === 'range' ? '#1a1a1a' : 'var(--muted)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Date Range (Multiple Days)
                  </button>
                </div>
              </div>

              {/* Form Inputs */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                {dateMode === 'single' ? (
                  <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                      Select Date
                    </label>
                    <input
                      type="date"
                      value={singleDate}
                      onChange={e => setSingleDate(e.target.value)}
                      className="input"
                      style={{ width: '100%', height: '40px', padding: '6px 12px', fontSize: '13px', borderRadius: '8px' }}
                    />
                  </div>
                ) : (
                  <>
                    <div style={{ flex: '1 1 160px', minWidth: '150px' }}>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                        From (Start Date)
                      </label>
                      <input
                        type="date"
                        value={fromDate}
                        onChange={e => setFromDate(e.target.value)}
                        className="input"
                        style={{ width: '100%', height: '40px', padding: '6px 12px', fontSize: '13px', borderRadius: '8px' }}
                      />
                    </div>
                    <div style={{ flex: '1 1 160px', minWidth: '150px' }}>
                      <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                        To (End Date)
                      </label>
                      <input
                        type="date"
                        min={fromDate}
                        value={toDate}
                        onChange={e => setToDate(e.target.value)}
                        className="input"
                        style={{ width: '100%', height: '40px', padding: '6px 12px', fontSize: '13px', borderRadius: '8px' }}
                      />
                    </div>
                  </>
                )}

                <div style={{ flex: '2 1 240px', minWidth: '200px' }}>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                    Reason (Optional)
                  </label>
                  <input
                    type="text"
                    value={holidayReason}
                    onChange={e => setHolidayReason(e.target.value)}
                    placeholder="e.g. Diwali, Facility Renovation, Staff Training"
                    className="input"
                    style={{ width: '100%', height: '40px', padding: '6px 12px', fontSize: '13px', borderRadius: '8px' }}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleAddHolidays}
                  disabled={dateMode === 'single' ? !singleDate : !fromDate}
                  className="btn btn-secondary"
                  style={{
                    height: '40px',
                    padding: '0 20px',
                    fontSize: '13px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <Plus size={15} /> Add Closed Date(s)
                </button>
              </div>
            </div>

            {/* List of Active / Upcoming Holidays */}
            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  Scheduled Closed Dates ({settings.holidays?.length || 0})
                </span>
                {settings.holidays?.length > 0 && (
                  <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                    Upcoming: {upcomingHolidays.length}
                  </span>
                )}
              </div>

              {(!settings.holidays || settings.holidays.length === 0) ? (
                <div style={{ padding: '24px', textAlign: 'center', background: 'var(--surface)', borderRadius: '12px', border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: '13px' }}>
                  No holidays scheduled. All three services follow standard operating schedules.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '320px', overflowY: 'auto', padding: '2px' }}>
                  {settings.holidays.map(date => {
                    const label = settings.holidayLabels?.[date]
                    const isPast = date < todayStr
                    return (
                      <div
                        key={date}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 12px',
                          borderRadius: '10px',
                          background: isPast ? 'var(--surface)' : 'var(--card)',
                          opacity: isPast ? 0.65 : 1,
                          border: `1.2px solid ${isPast ? 'var(--border)' : 'var(--accent-border, rgba(212,175,55,0.35))'}`,
                          fontSize: '12.5px',
                          color: 'var(--text)',
                        }}
                      >
                        <Calendar size={13} style={{ color: isPast ? 'var(--muted)' : 'var(--accent)' }} />
                        <span style={{ fontWeight: 700, fontFamily: '"DM Mono", monospace' }}>
                          {formatHolidayDate(date)}
                        </span>
                        {label && (
                          <span style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--surface)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                            {label}
                          </span>
                        )}
                        {isPast && (
                          <span style={{ fontSize: '10px', color: 'var(--muted)', fontStyle: 'italic' }}>
                            (past)
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
              )}
            </div>

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: 'var(--accent-bg, rgba(212,175,55,0.08))', border: '1px solid var(--accent-border, rgba(212,175,55,0.25))', fontSize: '12px', color: 'var(--text)' }}>
              <Info size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span>
                <strong>How it works:</strong> On these dates, customers visiting <strong>Grooming</strong>, <strong>Dog Walking</strong>, or <strong>Pet Boarding</strong> will see the date marked as a Holiday and cannot book slots.
              </span>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: INVOICES & QUICK LINKS */}
      {activeTab === 'invoices' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          {/* CUSTOMER INVOICES */}
          <section
            style={{
              background: 'var(--card)',
              border: '1.5px solid var(--border)',
              borderRadius: '18px',
              padding: '22px 24px',
              boxShadow: '0 4px 18px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
                <FileText size={20} />
              </span>
              <h2 style={{ fontSize: '17.5px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                Customer Invoices & Receipts
              </h2>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 16px', lineHeight: 1.5 }}>
              Control whether pet parents can download official PDF receipts from their &ldquo;My Bookings&rdquo; page.
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
                  When enabled, completed Grooming, Dog Walking & Boarding bookings display a &ldquo;Download Invoice&rdquo; button on the customer portal.
                </span>
              </div>
            </label>
          </section>

          {/* SERVICE-SPECIFIC QUICK LINKS */}
          <section
            style={{
              background: 'var(--card)',
              border: '1.5px solid var(--border)',
              borderRadius: '18px',
              padding: '20px 24px',
              boxShadow: '0 4px 18px rgba(0,0,0,0.03)',
            }}
          >
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' }}>
              Service-Specific Settings
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '12.5px', margin: '0 0 14px' }}>
              Configure operating slots, pricing packages, capacity, and service rules individually:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              <Link
                to="/admin/bookings?view=settings"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  textDecoration: 'none',
                  color: 'var(--text)',
                  transition: 'all 0.18s ease',
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
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  textDecoration: 'none',
                  color: 'var(--text)',
                  transition: 'all 0.18s ease',
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
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  textDecoration: 'none',
                  color: 'var(--text)',
                  transition: 'all 0.18s ease',
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
        </div>
      )}

      {/* Floating Save Button */}
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
