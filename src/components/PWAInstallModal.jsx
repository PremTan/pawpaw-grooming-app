// src/components/PWAInstallModal.jsx
import { useEffect } from 'react'
import { X, Share, PlusSquare, Download } from 'lucide-react'

export default function PWAInstallModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'pwaFadeIn 0.2s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '430px',
          background: 'var(--card, #fff)',
          border: '1px solid var(--accent-border, rgba(192, 136, 32, 0.25))',
          borderRadius: '20px',
          padding: '24px 22px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
          color: 'var(--text, #1a1a1a)',
          animation: 'pwaSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'var(--accent-bg, rgba(192, 136, 32, 0.08))',
            border: '1px solid var(--border, rgba(0, 0, 0, 0.08))',
            color: 'var(--muted, #666)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
        >
          <X size={16} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(192, 136, 32, 0.2), rgba(192, 136, 32, 0.05))',
              border: '1px solid var(--accent-border, rgba(192, 136, 32, 0.3))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent, #c08820)',
              flexShrink: 0,
            }}
          >
            <Download size={22} />
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent, #c08820)', fontWeight: 700 }}>
              Paw Paw Pet Grooming
            </div>
            <h3 style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
              Install on iPhone / iPad
            </h3>
          </div>
        </div>

        {/* iOS Safari Instructions */}
        <div>
          <p style={{ margin: '0 0 16px', fontSize: '13px', lineHeight: 1.5, color: 'var(--muted, #666)' }}>
            Follow these 3 quick steps in Safari to add the Paw Paw app to your home screen:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
            {/* Step 1 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                borderRadius: '12px',
                background: 'var(--accent-bg, rgba(192, 136, 32, 0.06))',
                border: '1px solid var(--accent-border, rgba(192, 136, 32, 0.15))',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--card)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#007AFF',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                  flexShrink: 0,
                }}
              >
                <Share size={18} />
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600 }}>Step 1:</span> In Safari, tap the <strong>Share</strong> button in the bottom menu bar.
              </div>
            </div>

            {/* Step 2 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                borderRadius: '12px',
                background: 'var(--accent-bg, rgba(192, 136, 32, 0.06))',
                border: '1px solid var(--accent-border, rgba(192, 136, 32, 0.15))',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--card)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent, #c08820)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                  flexShrink: 0,
                }}
              >
                <PlusSquare size={18} />
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600 }}>Step 2:</span> Scroll down and tap <strong>Add to Home Screen</strong>.
              </div>
            </div>

            {/* Step 3 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                borderRadius: '12px',
                background: 'var(--accent-bg, rgba(192, 136, 32, 0.06))',
                border: '1px solid var(--accent-border, rgba(192, 136, 32, 0.15))',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'var(--card)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '12px',
                  color: 'var(--accent, #c08820)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                  flexShrink: 0,
                }}
              >
                Add
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600 }}>Step 3:</span> Tap <strong>Add</strong> at top-right to confirm. Done!
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="btn btn-primary"
          style={{
            width: '100%',
            justifyContent: 'center',
            padding: '11px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '12px',
          }}
        >
          Got it
        </button>
      </div>

      <style>{`
        @keyframes pwaFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pwaSlideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
