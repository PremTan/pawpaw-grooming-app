// src/components/NotificationBell.jsx
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarClock, CheckCheck, CheckCircle2, Info, PartyPopper, Star, X, XCircle, Scissors, Building2, Clock, LogIn } from 'lucide-react'
import { useNotifications } from '../context/NotificationContext'
import { useAuth } from '../context/AuthContext'
import { formatDistanceToNow } from 'date-fns'

function getNotificationVisual(n) {
  const type = String(n?.type || '').toLowerCase()
  const title = String(n?.title || '').toLowerCase()
  const url = String(n?.actionUrl || '').toLowerCase()

  // 1. Boarding Notifications
  if (type === 'boarding_request' || title.includes('boarding request') || title.includes('pet boarding')) {
    if (type === 'boarding_cancelled' || title.includes('cancelled')) {
      return { Icon: XCircle, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' }
    }
    return { Icon: Building2, color: 'var(--accent)', bg: 'rgba(212, 175, 55, 0.14)' }
  }

  if (type === 'boarding_checked_in' || title.includes('checked in')) {
    return { Icon: LogIn, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' }
  }

  if (type === 'boarding_confirmed' || type === 'confirmed' || title.includes('confirmed')) {
    return { Icon: CheckCircle2, color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' }
  }

  if (type === 'boarding_completed' || type === 'completed' || title.includes('completed')) {
    return { Icon: PartyPopper, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' }
  }

  // 2. Cancellation Notifications
  if (type === 'cancelled' || type === 'boarding_cancelled' || title.includes('cancelled')) {
    return { Icon: XCircle, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' }
  }

  // 3. Rescheduled Notifications
  if (type === 'rescheduled' || title.includes('rescheduled')) {
    return { Icon: Clock, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' }
  }

  // 4. Grooming Appointment Requests
  if (type === 'booking_request' || type === 'booking' || title.includes('appointment request') || title.includes('appointment')) {
    return { Icon: Scissors, color: 'var(--accent)', bg: 'rgba(212, 175, 55, 0.14)' }
  }

  // 5. Reviews
  if (type === 'review' || title.includes('review')) {
    return { Icon: Star, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' }
  }

  // Fallbacks by URL
  if (url.includes('boarding')) {
    return { Icon: Building2, color: 'var(--accent)', bg: 'rgba(212, 175, 55, 0.14)' }
  }
  if (url.includes('booking')) {
    return { Icon: Scissors, color: 'var(--accent)', bg: 'rgba(212, 175, 55, 0.14)' }
  }

  return { Icon: Info, color: 'var(--accent)', bg: 'var(--accent-bg)' }
}

export default function NotificationBell() {
  const { notifications, unreadCount, markAllRead, markRead, requestBrowserPermission, browserPermission, notificationError, fcmStatus } = useNotifications()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openPanel = () => {
    const willOpen = !open
    setOpen(willOpen)
    if (willOpen) requestBrowserPermission?.()
  }

  const openNotification = async (notification) => {
    await markRead(notification.id)
    setOpen(false)

    if (notification.actionUrl) {
      navigate(notification.actionUrl)
      return
    }
    if (notification.bookingId) {
      navigate(isAdmin ? `/admin/bookings/${notification.bookingId}` : '/my-bookings')
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={openPanel}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-105"
        style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="notif-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div
          className="notification-panel rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead} style={{ fontSize: '11px', color: 'var(--accent)', cursor: 'pointer' }} aria-label="Mark all notifications read">
                  <CheckCheck size={14} />
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} style={{ color: 'var(--muted)' }} aria-label="Close notifications">
                <X size={15} />
              </button>
            </div>
          </div>

          {browserPermission !== 'granted' && (
            <div style={{ padding: '8px 16px', background: 'var(--accent-bg)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text)', fontWeight: 500 }}>
                Allow notifications for instant updates
              </div>
              <button
                type="button"
                onClick={async () => { await requestBrowserPermission?.() }}
                className="px-2.5 py-1 rounded-md text-xs font-semibold shadow-sm hover:opacity-90 transition-all cursor-pointer"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Enable
              </button>
            </div>
          )}

          {fcmStatus && !['idle', 'registered'].includes(fcmStatus) && (
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', color: '#ef4444', fontSize: '11px', lineHeight: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Push alerts: {fcmStatus}</span>
              <button
                type="button"
                onClick={async () => { await requestBrowserPermission?.() }}
                className="px-2 py-0.5 rounded text-xs font-semibold cursor-pointer"
                style={{ background: '#ef4444', color: '#fff' }}
              >
                Retry
              </button>
            </div>
          )}

          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {notificationError ? (
              <div className="py-10 text-center" style={{ padding: '32px 18px' }}>
                <Bell size={28} style={{ color: '#ef4444', margin: '0 auto 8px' }} />
                <p style={{ color: '#ef4444', fontSize: '13px', lineHeight: 1.45 }}>Notifications could not load. Check Firebase rules/indexes.</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={28} style={{ color: 'var(--muted)', margin: '0 auto 8px' }} />
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 20).map(n => {
                const { Icon, color, bg } = getNotificationVisual(n)
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openNotification(n)}
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-all"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: n.read ? 'transparent' : 'var(--accent-bg)',
                      border: 0,
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ width: '32px', height: '32px', borderRadius: '10px', background: bg, color: color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: n.read ? 400 : 600, color: 'var(--text)', marginBottom: '2px' }}>
                        {n.title}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4 }}>{n.message}</p>
                      {n.createdAt?.toDate && (
                        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                          {formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                    {!n.read && (
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)', marginTop: '5px', shrink: 0 }} />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

