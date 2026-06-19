// src/components/ThemeSwitcher.jsx
import { useState, useRef, useEffect } from 'react'
import { useTheme, THEMES } from '../context/ThemeContext'
import { Palette } from 'lucide-react'

export default function ThemeSwitcher() {
  const { themeId, setThemeId, theme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const THEME_COLORS = {
    dark:   '#D4AF37',
    light:  '#B8860B',
    purple: '#a78bfa',
    ocean:  '#64ffda',
    rose:   '#f48fb1',
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-105"
        style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)' }}
        title="Switch theme"
      >
        <Palette size={16} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 p-3 rounded-2xl shadow-2xl z-50 min-w-[200px]"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <p style={{ color: 'var(--muted)', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '10px' }}>
            Choose Theme
          </p>
          <div className="space-y-1">
            {Object.values(THEMES).map(t => (
              <button
                key={t.id}
                onClick={() => { setThemeId(t.id); setOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left"
                style={{
                  background: themeId === t.id ? 'var(--accent-bg)' : 'transparent',
                  border: `1px solid ${themeId === t.id ? 'var(--accent-border)' : 'transparent'}`,
                }}
              >
                <div
                  className="w-5 h-5 rounded-full shrink-0"
                  style={{ background: THEME_COLORS[t.id] }}
                />
                <span style={{ fontSize: '13px', color: themeId === t.id ? 'var(--accent)' : 'var(--text)', fontWeight: themeId === t.id ? 600 : 400 }}>
                  {t.emoji} {t.name}
                </span>
                {themeId === t.id && (
                  <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: '11px' }}>✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
