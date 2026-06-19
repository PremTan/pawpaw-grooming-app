// src/components/NotificationBell.jsx
import { useState, useRef, useEffect } from 'react'
import { Bell, CheckCheck, X } from 'lucide-react'
import { useNotifications } from '../context/NotificationContext'
import { formatDistanceToNow } from 'date-fns'

const TYPE_ICON = {
  booking:   '📅',
  confirmed: '✅',
  completed: '🎉',
  cancelled: '❌',
  review:    '⭐',
  info:      'ℹ️',
}

export default function NotificationBell() {
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); if (!open && unreadCount > 0) markAllRead() }}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-105"
        style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="notif-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 rounded-2xl shadow-2xl z-50 overflow-hidden"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', width: '320px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} style={{ fontSize: '11px', color: 'var(--accent)', cursor: 'pointer' }}>
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ color: 'var(--muted)' }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔔</div>
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>No notifications yet</p>
              </div>
            ) : (
              notifications.slice(0, 20).map(n => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-all"
                  style={{
                    background: n.read ? 'transparent' : 'var(--accent-bg)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '18px', marginTop: '2px' }}>
                    {TYPE_ICON[n.type] || TYPE_ICON.info}
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
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
