// src/components/Toast.jsx
import { useEffect } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  const config = {
    success: { icon: <CheckCircle size={18} />, color: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.2)' },
    error:   { icon: <XCircle size={18} />,     color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)' },
    info:    { icon: <AlertCircle size={18} />,  color: 'var(--accent)', bg: 'var(--accent-bg)', border: 'var(--accent-border)' },
  }[type] || {}

  return (
    <div className="toast" style={{ borderColor: config.border }}>
      <div className="flex items-center gap-3">
        <span style={{ color: config.color }}>{config.icon}</span>
        <p style={{ fontSize: '13px', color: 'var(--text)', flex: 1 }}>{message}</p>
        <button onClick={onClose} style={{ color: 'var(--muted)' }}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
