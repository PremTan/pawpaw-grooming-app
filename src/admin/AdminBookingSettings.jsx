import { useEffect, useState } from 'react'
import { CalendarOff, Clock, Copy, Home, Minus, Plus, Save, Store, Trash2 } from 'lucide-react'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import { DAYS, DURATION_OPTIONS, VISIT_MODES, countOpenDays, getAvailabilityForDate, normalizeBookingSettings } from '../utils/bookingSettings'

const MAX_WINDOWS = 4
const MAX_CANCELLATION_MINUTES = 1440
const emptyWindow = () => ({ start: '09:00', end: '18:00', mode: 'center' })

function clampCancellationCutoff(value) {
  return Math.max(0, Math.min(MAX_CANCELLATION_MINUTES, Number(value) || 0))
}

function formatCancellationCutoff(value) {
  const total = clampCancellationCutoff(value)
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (!hours) return `${minutes} min`
  if (!minutes) return `${hours} hr${hours > 1 ? 's' : ''}`
  return `${hours} hr${hours > 1 ? 's' : ''} ${minutes} min`
}
export default function AdminBookingSettings() {
  const [settings, setSettings] = useState(() => normalizeBookingSettings({}))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [holidayDate, setHolidayDate] = useState('')
  const [blockedDate, setBlockedDate] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'bookingSettings'))
        setSettings(normalizeBookingSettings(snap.exists() ? snap.data() : {}))
      } catch {
        setError('Could not load booking settings.')
      }
      setLoading(false)
    }
    fetchSettings()
  }, [])

  const updateRoot = (patch) => setSettings(prev => ({ ...prev, ...patch }))

  const updateDay = (dayKey, patch) => {
    setSettings(prev => ({
      ...prev,
      weekly: {
        ...prev.weekly,
        [dayKey]: { ...prev.weekly[dayKey], ...patch },
      },
    }))
  }

  const updateWindow = (dayKey, index, patch) => {
    const day = settings.weekly[dayKey]
    updateDay(dayKey, { windows: day.windows.map((window, i) => i === index ? { ...window, ...patch } : window) })
  }

  const addWindow = (dayKey) => {
    const day = settings.weekly[dayKey]
    if (day.windows.length >= MAX_WINDOWS) return
    updateDay(dayKey, { windows: [...day.windows, emptyWindow()] })
  }

  const removeWindow = (dayKey, index) => {
    const day = settings.weekly[dayKey]
    updateDay(dayKey, { windows: day.windows.filter((_, i) => i !== index) })
  }

  const applyMondayToAll = () => {
    const monday = settings.weekly.mon
    const weekly = {}
    DAYS.forEach(day => {
      weekly[day.key] = JSON.parse(JSON.stringify(monday))
    })
    setSettings(prev => ({ ...prev, weekly }))
  }

  const addHoliday = () => {
    if (!holidayDate) return
    setSettings(prev => ({
      ...prev,
      holidays: Array.from(new Set([...prev.holidays, holidayDate])).sort(),
    }))
    setHolidayDate('')
  }

  const removeHoliday = (date) => {
    setSettings(prev => ({ ...prev, holidays: prev.holidays.filter(d => d !== date) }))
  }

  const toggleBlockedSlot = (slotLabel) => {
    setSettings(prev => {
      const nextBlockedSlots = { ...(prev.blockedSlots || {}) }
      const currentDateSlots = Array.isArray(nextBlockedSlots[blockedDate]) ? nextBlockedSlots[blockedDate] : []
      const updatedDateSlots = currentDateSlots.includes(slotLabel)
        ? currentDateSlots.filter(item => item !== slotLabel)
        : [...currentDateSlots, slotLabel]

      if (updatedDateSlots.length) {
        nextBlockedSlots[blockedDate] = updatedDateSlots
      } else {
        delete nextBlockedSlots[blockedDate]
      }

      return { ...prev, blockedSlots: nextBlockedSlots }
    })
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const daysOpen = countOpenDays(settings)
      await Promise.all([
        setDoc(doc(db, 'settings', 'bookingSettings'), {
          ...settings,
          updatedAt: serverTimestamp(),
        }, { merge: true }),
        setDoc(doc(db, 'settings', 'homeStats'), {
          daysOpen,
          updatedAt: serverTimestamp(),
        }, { merge: true }),
        setDoc(doc(db, 'settings', 'general'), {
          daysOpen,
          statsUpdatedAt: serverTimestamp(),
        }, { merge: true }),
      ])
      setMessage('Booking availability updated successfully.')
    } catch (err) {
      setError(err.message || 'Could not save booking settings.')
    }
    setSaving(false)
  }

  const stepDuration = (amount) => {
    updateRoot({ appointmentDuration: Math.max(15, Math.min(240, Number(settings.appointmentDuration || 30) + amount)) })
  }

  const stepCapacity = (amount) => {
    updateRoot({ slotCapacity: Math.max(1, Math.min(20, Number(settings.slotCapacity || 1) + amount)) })
  }

  const cancellationCutoffMinutes = clampCancellationCutoff(settings.cancellationCutoffMinutes)
  const cancellationHours = Math.floor(cancellationCutoffMinutes / 60)
  const cancellationMinutes = cancellationCutoffMinutes % 60
  const blockedDateAvailability = getAvailabilityForDate(settings, blockedDate)
  const blockedDateSlots = Array.from(new Set([...(blockedDateAvailability.storeSlots || []), ...(blockedDateAvailability.homeSlots || [])]))
  const currentBlockedDateSlots = Array.isArray(settings.blockedSlots?.[blockedDate]) ? settings.blockedSlots[blockedDate] : []

  const updateCancellationCutoff = (hours, minutes) => {
    updateRoot({ cancellationCutoffMinutes: clampCancellationCutoff((Number(hours) || 0) * 60 + (Number(minutes) || 0)) })
  }

  const stepCancellationCutoff = (amount) => {
    updateRoot({ cancellationCutoffMinutes: clampCancellationCutoff(cancellationCutoffMinutes + amount) })
  }
  if (loading) return <div style={{ padding: '28px' }}><Spinner text="Loading booking settings..." /></div>

  return (
    <div className="booking-settings-page">
      <div className="booking-settings-head">
        <div>
          <h1>Booking Settings</h1>
          <p>Control holidays, working windows, appointment length, capacity and visit preferences.</p>
        </div>
        <button onClick={save} disabled={saving} className="btn btn-primary booking-save-btn">
          <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {(message || error) && <div className={`booking-alert ${error ? 'error' : 'ok'}`}>{error || message}</div>}

      <div className="booking-settings-grid">
        <section className="booking-panel booking-panel-main">
          <div className="panel-title-row">
            <div>
              <h2>Weekly Time Windows</h2>
              <p>Choose up to 4 windows per day. Hybrid creates both center and home slots.</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={applyMondayToAll}>
              <Copy size={15} /> Apply Monday to all
            </button>
          </div>

          <div className="day-window-list">
            {DAYS.map(day => {
              const row = settings.weekly[day.key]
              return (
                <div key={day.key} className={`day-window-card${!row.open ? ' closed' : ''}`}>
                  <div className="day-window-top">
                    <strong>{day.label}</strong>
                    <label className="switch-label">
                      <input type="checkbox" checked={row.open} onChange={e => updateDay(day.key, { open: e.target.checked })} />
                      <span />
                    </label>
                  </div>

                  {row.open ? (
                    <>
                      <div className="window-rows">
                        {row.windows.map((window, index) => (
                          <div key={index} className="window-row">
                            <input type="time" value={window.start} onChange={e => updateWindow(day.key, index, { start: e.target.value })} />
                            <span>To</span>
                            <input type="time" value={window.end} onChange={e => updateWindow(day.key, index, { end: e.target.value })} />
                            <select value={window.mode} onChange={e => updateWindow(day.key, index, { mode: e.target.value })}>
                              {VISIT_MODES.map(mode => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                            </select>
                            {row.windows.length > 1 && (
                              <button type="button" className="icon-soft danger" aria-label="Remove window" onClick={() => removeWindow(day.key, index)}>
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button type="button" className="add-window-btn" disabled={row.windows.length >= MAX_WINDOWS} onClick={() => addWindow(day.key)}>
                        <Plus size={15} /> add more
                      </button>
                    </>
                  ) : (
                    <p className="closed-text">Closed for this day</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <aside className="booking-side-stack">
          <section className="booking-panel">
            <h2>Appointment Duration</h2>
            <p>This splits working hours into bookable slots.</p>
            <div className="duration-grid">
              {DURATION_OPTIONS.map(value => (
                <button key={value} type="button" className={settings.appointmentDuration === value ? 'selected' : ''} onClick={() => updateRoot({ appointmentDuration: value })}>
                  {value < 60 ? `${value} Minutes` : value === 60 ? '1 Hour' : `${value / 60} Hour`}
                </button>
              ))}
            </div>
            <div className="stepper-row">
              <button type="button" onClick={() => stepDuration(-15)}><Minus size={16} /></button>
              <strong>{String(Math.floor(settings.appointmentDuration / 60)).padStart(2, '0')}:{String(settings.appointmentDuration % 60).padStart(2, '0')}</strong>
              <button type="button" onClick={() => stepDuration(15)}><Plus size={16} /></button>
            </div>
          </section>

          <section className="booking-panel">
            <h2>Slots Per Appointment</h2>
            <p>How many pets/customers can be served in one time slot.</p>
            <div className="stepper-row">
              <button type="button" onClick={() => stepCapacity(-1)}><Minus size={16} /></button>
              <strong>{settings.slotCapacity}</strong>
              <button type="button" onClick={() => stepCapacity(1)}><Plus size={16} /></button>
            </div>
          </section>

          <section className="booking-panel">
            <h2>Visit Charges</h2>
            <label className="radio-card active">
              <input type="checkbox" checked={settings.fixedVisitCharges} onChange={e => updateRoot({ fixedVisitCharges: e.target.checked })} />
              <span>
                <strong>Fixed visiting charges</strong>
                <small>Shown with booking preferences and available for future billing.</small>
              </span>
            </label>
            {settings.fixedVisitCharges && (
              <div className="charge-grid">
                <label><Home size={14} /> Home visit charge<input type="number" min="0" value={settings.homeVisitCharge} onChange={e => updateRoot({ homeVisitCharge: e.target.value })} placeholder="200" /></label>
                <label><Store size={14} /> Center visit charge<input type="number" min="0" value={settings.centerVisitCharge} onChange={e => updateRoot({ centerVisitCharge: e.target.value })} placeholder="100" /></label>
              </div>
            )}
          </section>

          <section className="booking-panel cancellation-panel">
            <h2>Cancellation</h2>
            <p>Confirmed bookings can be cancelled by users until this time before the booking starts. Pending bookings can always be cancelled.</p>
            <div className="stepper-row">
              <button type="button" onClick={() => stepCancellationCutoff(-15)}><Minus size={16} /></button>
              <strong>{formatCancellationCutoff(cancellationCutoffMinutes)}</strong>
              <button type="button" onClick={() => stepCancellationCutoff(15)}><Plus size={16} /></button>
            </div>
            <div className="cancellation-time-grid">
              <label>
                <span>Hours</span>
                <input
                  type="number"
                  min="0"
                  max="24"
                  value={cancellationHours}
                  onChange={e => updateCancellationCutoff(e.target.value, cancellationMinutes)}
                />
              </label>
              <label>
                <span>Minutes</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  step="15"
                  value={cancellationMinutes}
                  onChange={e => updateCancellationCutoff(cancellationHours, Math.min(59, Math.max(0, Number(e.target.value || 0))))}
                />
              </label>
            </div>
            <small className="cancellation-help">Saved as {cancellationCutoffMinutes} minutes. Maximum 24 hours.</small>
          </section>

          <section className="booking-panel">
            <h2>Block Slots by Date</h2>
            <p>Select a date and choose the time slots that should stay unavailable for customers.</p>
            <div className="holiday-add-row">
              <input type="date" value={blockedDate} onChange={e => setBlockedDate(e.target.value)} />
              <button type="button" className="btn btn-secondary" onClick={() => setBlockedDate('')}>Clear</button>
            </div>
            {!blockedDate ? (
              <p className="empty-holidays">Choose a date to manage blocked slots.</p>
            ) : blockedDateSlots.length === 0 ? (
              <p className="empty-holidays">No bookable slots are available for this date yet.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                {blockedDateSlots.map(slot => {
                  const blocked = currentBlockedDateSlots.includes(slot)
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => toggleBlockedSlot(slot)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '999px',
                        border: blocked ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border)',
                        background: blocked ? 'rgba(239,68,68,0.08)' : 'var(--surface)',
                        color: blocked ? '#ef4444' : 'var(--text)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {slot} {blocked ? '×' : '+'}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="booking-panel">
            <h2>Payments</h2>
            {[['prepaid', 'Prepaid only', 'Clients must pay in advance while booking.'], ['cash', 'Pay in Cash', 'Clients pay during or after service.'], ['both', 'Prepaid and Pay in Cash', 'Clients can choose either option.']].map(([value, title, help]) => (
              <label key={value} className={`radio-card${settings.paymentMode === value ? ' active' : ''}`}>
                <input type="radio" name="paymentMode" checked={settings.paymentMode === value} onChange={() => updateRoot({ paymentMode: value })} />
                <span><strong>{title}</strong><small>{help}</small></span>
              </label>
            ))}
          </section>

          <section className="booking-panel">
            <h2><CalendarOff size={17} /> Holidays</h2>
            <p>Dates added here will be unavailable for all visit types.</p>
            <div className="holiday-add-row">
              <input type="date" value={holidayDate} onChange={e => setHolidayDate(e.target.value)} />
              <button type="button" className="btn btn-secondary" onClick={addHoliday}>Add</button>
            </div>
            {settings.holidays.length === 0 ? <p className="empty-holidays">No holidays added.</p> : (
              <div className="holiday-chips">
                {settings.holidays.map(date => (
                  <button key={date} type="button" onClick={() => removeHoliday(date)}>
                    {date} <Trash2 size={13} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      <style>{`
        .booking-settings-page { padding: 28px; }
        .booking-settings-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-bottom: 20px; }
        .booking-settings-head h1 { color: var(--text); font-size: 26px; font-weight: 800; margin-bottom: 6px; }
        .booking-settings-head p, .booking-panel p { color: var(--muted); font-size: 13px; line-height: 1.55; }
        .booking-save-btn { padding: 10px 18px; font-size: 13px; }
        .booking-alert { padding: 12px 14px; border-radius: 10px; margin-bottom: 18px; font-size: 13px; border: 1px solid; }
        .booking-alert.ok { color: #34d399; background: rgba(52,211,153,0.1); border-color: rgba(52,211,153,0.25); }
        .booking-alert.error { color: #ef4444; background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.2); }
        .booking-settings-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.8fr); gap: 18px; align-items: start; }
        .booking-panel { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px; }
        .booking-panel h2 { color: var(--text); font-size: 16px; font-weight: 800; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
        .booking-side-stack { display: grid; gap: 14px; }
        .panel-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
        .day-window-list { display: grid; gap: 12px; }
        .day-window-card { border: 1px solid var(--border); background: var(--surface); border-radius: 12px; padding: 14px; }
        .day-window-card.closed { opacity: 0.72; }
        .day-window-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
        .day-window-top strong { color: var(--text); font-size: 16px; }
        .switch-label input { display: none; }
        .switch-label span { width: 48px; height: 28px; border-radius: 999px; background: var(--border); position: relative; display: block; cursor: pointer; transition: background .2s ease; }
        .switch-label span:after { content: ''; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: transform .2s ease; box-shadow: 0 2px 6px rgba(0,0,0,.25); }
        .switch-label input:checked + span { background: #059669; }
        .switch-label input:checked + span:after { transform: translateX(20px); }
        .window-rows { display: grid; gap: 10px; }
        .window-row { display: grid; grid-template-columns: minmax(105px, 1fr) auto minmax(105px, 1fr) minmax(130px, 1fr) 34px; align-items: center; gap: 8px; }
        .window-row input, .window-row select, .holiday-add-row input, .charge-grid input { min-width: 0; width: 100%; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--text); padding: 10px 11px; font: inherit; }
        .window-row span { color: var(--muted); font-size: 13px; text-align: center; }
        .icon-soft { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; border: 1px solid var(--border); background: var(--card); color: var(--muted); cursor: pointer; }
        .icon-soft.danger { color: #ef4444; }
        .add-window-btn { margin-top: 10px; margin-left: auto; display: flex; align-items: center; gap: 5px; border: none; background: none; color: var(--accent); font-size: 13px; font-weight: 800; cursor: pointer; }
        .add-window-btn:disabled { opacity: .45; cursor: not-allowed; }
        .closed-text, .empty-holidays { color: var(--muted); font-size: 13px; }
        .duration-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 14px 0; }
        .duration-grid button { min-height: 48px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-weight: 700; cursor: pointer; }
        .duration-grid button.selected { border-color: var(--accent); background: var(--accent-bg); color: var(--accent); }
        .stepper-row { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; gap: 14px; margin-top: 14px; }
        .stepper-row button { height: 42px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text); display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .stepper-row strong { text-align: center; color: var(--text); font-size: 18px; }
        .radio-card { display: flex; gap: 12px; border: 1px solid var(--border); border-radius: 12px; padding: 13px; margin-top: 10px; background: var(--surface); cursor: pointer; }
        .radio-card.active { border-color: var(--accent-border); background: var(--accent-bg); }
        .radio-card input { margin-top: 3px; accent-color: var(--accent); }
        .radio-card strong { display: block; color: var(--text); font-size: 14px; }
        .radio-card small { display: block; color: var(--muted); font-size: 12px; line-height: 1.45; margin-top: 3px; }
        .charge-grid { display: grid; gap: 10px; margin-top: 12px; }
        .charge-grid label { color: var(--muted); font-size: 12px; display: grid; gap: 6px; }
        .charge-grid label svg { color: var(--accent); vertical-align: middle; margin-right: 4px; }
        .cancellation-time-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
        .cancellation-time-grid label { color: var(--muted); font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; display: grid; gap: 6px; }
        .cancellation-time-grid input { min-width: 0; width: 100%; border: 1px solid var(--border); border-radius: 10px; background: var(--card); color: var(--text); padding: 10px 11px; font: inherit; }
        .cancellation-help { display: block; margin-top: 8px; color: var(--muted); font-size: 12px; }
        .holiday-add-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin-top: 12px; }
        .holiday-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
        .holiday-chips button { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 999px; padding: 8px 10px; font-size: 12px; cursor: pointer; }
        @media (max-width: 980px) { .booking-settings-grid { grid-template-columns: 1fr; } }
        @media (max-width: 680px) {
          .booking-settings-page { padding: 18px 14px 28px; }
          .booking-settings-head { align-items: stretch; }
          .booking-save-btn, .booking-settings-head > button { width: 100%; justify-content: center; }
          .booking-panel { padding: 14px; border-radius: 10px; }
          .panel-title-row { display: grid; }
          .panel-title-row .btn { width: 100%; justify-content: center; }
          .window-row { grid-template-columns: 1fr auto 1fr; }
          .window-row select { grid-column: 1 / 3; }
          .window-row .icon-soft { grid-column: 3; justify-self: end; }
          .duration-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 420px) {
          .window-row { grid-template-columns: 1fr; }
          .window-row span { text-align: left; }
          .window-row select, .window-row .icon-soft { grid-column: auto; }
          .window-row .icon-soft { width: 100%; }
          .holiday-add-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}

