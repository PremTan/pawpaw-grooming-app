/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        th: {
          bg:       'var(--bg)',
          surface:  'var(--surface)',
          card:     'var(--card)',
          border:   'var(--border)',
          text:     'var(--text)',
          muted:    'var(--muted)',
          accent:   'var(--accent)',
          'accent-light': 'var(--accent-light)',
          'accent-dark':  'var(--accent-dark)',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body:    ['"DM Sans"', 'sans-serif'],
        mono:    ['"DM Mono"', 'monospace'],
      },
      animation: {
        'fade-up':   'fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) forwards',
        'fade-in':   'fadeIn 0.4s ease forwards',
        'slide-up':  'slideUp 0.3s cubic-bezier(0.22,1,0.36,1)',
        'float':     'float 4s ease-in-out infinite',
        'shimmer':   'shimmer 1.5s infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
      backgroundImage: {
        'accent-gradient': 'var(--gradient)',
      },
      boxShadow: {
        'accent': '0 8px 32px var(--accent-bg)',
        'glow':   '0 0 40px var(--accent-bg)',
      },
    },
  },
  plugins: [],
}
