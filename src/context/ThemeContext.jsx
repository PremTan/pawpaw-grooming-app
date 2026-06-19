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
    bg: '#0d0a14',
    surface: '#130f1e',
    card: '#1a1528',
    border: '#2a2040',
    text: '#f0ecff',
    muted: '#6b5f8a',
    accent: '#a78bfa',
    accentLight: '#c4b5fd',
    accentDark: '#7c3aed',
    accentBg: 'rgba(167,139,250,0.1)',
    accentBorder: 'rgba(167,139,250,0.2)',
    navBg: 'rgba(13,10,20,0.92)',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 50%, #c4b5fd 100%)',
    cssClass: 'theme-purple',
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    emoji: '🌊',
    bg: '#020c1b',
    surface: '#0a192f',
    card: '#112240',
    border: '#1d3461',
    text: '#ccd6f6',
    muted: '#4a6fa5',
    accent: '#64ffda',
    accentLight: '#9efff0',
    accentDark: '#00b4d8',
    accentBg: 'rgba(100,255,218,0.08)',
    accentBorder: 'rgba(100,255,218,0.2)',
    navBg: 'rgba(2,12,27,0.95)',
    gradient: 'linear-gradient(135deg, #00b4d8 0%, #64ffda 50%, #0077b6 100%)',
    cssClass: 'theme-ocean',
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    emoji: '🌸',
    bg: '#0f0508',
    surface: '#1a0c10',
    card: '#22101a',
    border: '#3d1a28',
    text: '#fce4ec',
    muted: '#9e6070',
    accent: '#f48fb1',
    accentLight: '#ffc2d4',
    accentDark: '#e91e8c',
    accentBg: 'rgba(244,143,177,0.1)',
    accentBorder: 'rgba(244,143,177,0.2)',
    navBg: 'rgba(15,5,8,0.95)',
    gradient: 'linear-gradient(135deg, #e91e8c 0%, #f48fb1 50%, #ffc2d4 100%)',
    cssClass: 'theme-rose',
  },
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [themeId, setThemeId] = useState(() => localStorage.getItem('pawpaw_theme') || 'light')
  const theme = THEMES[themeId] || THEMES.light

  useEffect(() => {
    localStorage.setItem('pawpaw_theme', themeId)
    const root = document.documentElement
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
