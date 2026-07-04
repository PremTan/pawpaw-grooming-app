// src/context/ThemeContext.jsx
import { createContext, useContext, useEffect, useState } from 'react'

export const THEMES = {
  dark: {
    id: 'dark',
    name: 'Dark',
    emoji: '🌙',
    bg: '#0a0a0a',
    surface: '#111111',
    card: '#181818',
    border: '#222222',
    text: '#f0f0f0',
    muted: '#666666',
    accent: '#D4AF37',
    accentLight: '#F0D060',
    accentDark: '#B8960C',
    accentBg: 'rgba(212,175,55,0.1)',
    accentBorder: 'rgba(212,175,55,0.2)',
    navBg: 'rgba(10,10,10,0.92)',
    gradient: 'linear-gradient(135deg, #D4AF37 0%, #F0D060 50%, #B8960C 100%)',
    cssClass: 'theme-dark',
  },
  light: {
    id: 'light',
    name: 'Light',
    emoji: '☀️',
    bg: '#f8f6f1',
    surface: '#ffffff',
    card: '#ffffff',
    border: '#e8e0d0',
    text: '#1a1208',
    muted: '#8a7a60',
    accent: '#B8860B',
    accentLight: '#D4A017',
    accentDark: '#8B6914',
    accentBg: 'rgba(184,134,11,0.08)',
    accentBorder: 'rgba(184,134,11,0.2)',
    navBg: 'rgba(248,246,241,0.95)',
    gradient: 'linear-gradient(135deg, #B8860B 0%, #D4A017 50%, #8B6914 100%)',
    cssClass: 'theme-light',
  },
  purple: {
    id: 'purple',
    name: 'Royal',
    emoji: '👑',
    bg: '#140F2D',
    surface: '#1E183D',
    card: '#271F4D',
    border: '#3B316A',
    text: '#F4F1FF',
    muted: '#A59BCE',
    accent: '#9D8DF1',
    accentLight: '#BDB2F5',
    accentDark: '#7A62E5',
    accentBg: 'rgba(157,141,241,0.12)',
    accentBorder: 'rgba(157,141,241,0.25)',
    navBg: 'rgba(20,15,45,0.95)',
    gradient: 'linear-gradient(135deg, #7A62E5 0%, #9D8DF1 50%, #BDB2F5 100%)',
    cssClass: 'theme-purple',
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    emoji: '🌊',
    bg: '#0B1320',
    surface: '#111C2E',
    card: '#18263D',
    border: '#2A3C5A',
    text: '#E2EAF4',
    muted: '#8AA1BE',
    accent: '#38BDF8',
    accentLight: '#7DD3FC',
    accentDark: '#0284C7',
    accentBg: 'rgba(56,189,248,0.1)',
    accentBorder: 'rgba(56,189,248,0.2)',
    navBg: 'rgba(11,19,32,0.95)',
    gradient: 'linear-gradient(135deg, #0284C7 0%, #38BDF8 50%, #7DD3FC 100%)',
    cssClass: 'theme-ocean',
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    emoji: '🌸',
    bg: '#1A0F14',
    surface: '#24151C',
    card: '#2E1B25',
    border: '#4A2B3D',
    text: '#FCEEF3',
    muted: '#C494A9',
    accent: '#FB7185',
    accentLight: '#FDA4AF',
    accentDark: '#E11D48',
    accentBg: 'rgba(251,113,133,0.1)',
    accentBorder: 'rgba(251,113,133,0.2)',
    navBg: 'rgba(26,15,20,0.95)',
    gradient: 'linear-gradient(135deg, #E11D48 0%, #FB7185 50%, #FDA4AF 100%)',
    cssClass: 'theme-rose',
  },
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  // Defaults to 'light' immediately if no saved preference exists
  const [themeId, setThemeId] = useState(() => localStorage.getItem('pawpaw_theme') || 'light')
  const theme = THEMES[themeId] || THEMES.light

  useEffect(() => {
    localStorage.setItem('pawpaw_theme', themeId)
    const root = document.documentElement
    Object.values(THEMES).forEach(item => root.classList.remove(item.cssClass))
    root.classList.add(theme.cssClass)
    root.style.setProperty('--bg', theme.bg)
    root.style.setProperty('--surface', theme.surface)
    root.style.setProperty('--card', theme.card)
    root.style.setProperty('--border', theme.border)
    root.style.setProperty('--text', theme.text)
    root.style.setProperty('--muted', theme.muted)
    root.style.setProperty('--accent', theme.accent)
    root.style.setProperty('--accent-light', theme.accentLight)
    root.style.setProperty('--accent-dark', theme.accentDark)
    root.style.setProperty('--accent-bg', theme.accentBg)
    root.style.setProperty('--accent-border', theme.accentBorder)
    root.style.setProperty('--nav-bg', theme.navBg)
    root.style.setProperty('--gradient', theme.gradient)
    document.body.style.backgroundColor = theme.bg
    document.body.style.color = theme.text
  }, [themeId, theme])

  return (
    <ThemeContext.Provider value={{ theme, themeId, setThemeId, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)