// src/pages/Login.jsx
import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db, googleProvider, ADMIN_EMAIL } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { Check, Eye, EyeOff, RefreshCw } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'

async function syncProfileFromAuth(authUser, nameOverride = '') {
  if (!authUser?.uid) return
  const profileRef = doc(db, 'profiles', authUser.uid)
  const snap = await getDoc(profileRef)
  const existing = snap.exists() ? snap.data() : {}
  await setDoc(profileRef, {
    email: authUser.email || existing.email || '',
    name: existing.name || nameOverride || authUser.displayName || '',
    photoURL: existing.photoURL || existing.photoUrl || authUser.photoURL || '',
    phone: existing.phone || '',
    userId: authUser.uid,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export default function Login() {
  const { user, isAdmin } = useAuth()
  const navigate  = useNavigate()
  const [mode, setMode]     = useState('login')
  const [form, setForm]     = useState({ name: '', email: '', password: '' })
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [captchaVerified, setCaptchaVerified] = useState(false)

  useEffect(() => {
    if (user) {
      navigate(isAdmin ? '/admin' : '/', { replace: true })
    }
  }, [user, isAdmin, navigate])

  if (user) return null

  const requireCaptcha = () => {
    if (captchaVerified) return true
    setError('Please confirm you are not a robot.')
    return false
  }

  const handleGoogle = async () => {
    if (!requireCaptcha()) return
    setLoading(true); setError('')
    try {
      const cred = await signInWithPopup(auth, googleProvider)
      await syncProfileFromAuth(cred.user)
      navigate(cred.user?.email === ADMIN_EMAIL ? '/admin' : '/')
    }
    catch (e) { setError(e.message) }
    setLoading(false)
  }

  const handleEmail = async () => {
    if (!requireCaptcha()) return
    setLoading(true); setError('')
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, form.email, form.password)
        if (form.name) await updateProfile(cred.user, { displayName: form.name })
        await syncProfileFromAuth(cred.user, form.name.trim())
      } else {
        const cred = await signInWithEmailAndPassword(auth, form.email, form.password)
        await syncProfileFromAuth(cred.user)
        if (cred.user?.email === ADMIN_EMAIL) {
          navigate('/admin')
          setLoading(false)
          return
        }
      }
      navigate('/')
    } catch (e) {
      const msg = e.message || 'Something went wrong'
      const clean = msg.replace('Firebase: ', '').replace(/\(auth\/[^)]*\)/g, '').trim()
      // Map common Firebase errors to friendly messages
      const friendly = {
        'auth/user-not-found':    'No account found with this email. Please Sign Up first.',
        'auth/wrong-password':    'Incorrect password. Please try again.',
        'auth/invalid-credential':'Incorrect email or password. Please try again.',
        'auth/email-already-in-use': 'An account with this email already exists. Please Login instead.',
        'auth/weak-password':     'Password must be at least 6 characters.',
        'auth/invalid-email':     'Please enter a valid email address.',
        'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
        'auth/network-request-failed': 'Network error. Check your internet connection.',
      }
      const code = e.code || ''
      setError(friendly[code] || clean || 'Login failed. Please try again.')
    }
    setLoading(false)
  }

  const handleReset = async () => {
    setLoading(true); setError('')
    try { await sendPasswordResetEmail(auth, form.email); setResetSent(true) }
    catch { setError('Could not send reset email. Check your email address.') }
    setLoading(false)
  }

  const CaptchaBox = () => (
    <button
      type="button"
      className={`robot-check${captchaVerified ? ' verified' : ''}`}
      onClick={() => { setCaptchaVerified(true); setError('') }}
      aria-pressed={captchaVerified}
    >
      <span className="robot-check-box">{captchaVerified && <Check size={24} />}</span>
      <span className="robot-check-text">I'm not a robot</span>
      <span className="robot-check-brand" aria-hidden="true"><RefreshCw size={24} /></span>
    </button>
  )

  const S = {
    page:  { minHeight: '100svh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'var(--bg)', padding: '122px 16px 28px' },
    wrap:  { width: '100%', maxWidth: '420px' },
    card:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '28px', boxShadow: '0 18px 50px rgba(0,0,0,0.18)' },
    label: { fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '6px' },
    gBtn:  { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', marginBottom: '20px', transition: 'all 0.2s' },
    or:    { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' },
    tab:   (active) => ({ flex: 1, padding: '9px', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none', background: active ? 'var(--accent-bg)' : 'transparent', color: active ? 'var(--accent)' : 'var(--muted)', transition: 'all 0.2s' }),
  }

  return (
    <div className="login-page" style={S.page}>
      <div className="login-wrap" style={S.wrap}>
        {/* Logo */}
        <div className="login-logo" style={{ textAlign: 'center', marginBottom: '22px' }}>
          <BrandLogo size="login" tagline={mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'} align="center" />
        </div>

        <div className="login-card" style={S.card}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', padding: '11px 14px', borderRadius: '10px', marginBottom: '18px' }}>
              {error}
            </div>
          )}

          {mode === 'reset' ? (
            resetSent ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📧</div>
                <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: '6px' }}>Reset link sent!</p>
                <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>Check your inbox.</p>
                <button onClick={() => { setMode('login'); setResetSent(false) }} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}>← Back to login</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={S.label}>Email</label>
                  <input className="input" type="email" placeholder="your@email.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                </div>
                <button onClick={handleReset} disabled={loading || !form.email} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
                <button onClick={() => setMode('login')} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'center' }}>← Back to login</button>
              </div>
            )
          ) : (
            <>
              {/* Tabs */}
              <div className="login-tabs" style={{ display: 'flex', gap: '4px', background: 'var(--surface)', borderRadius: '12px', padding: '4px', marginBottom: '20px' }}>
                <button style={S.tab(mode === 'login')}  onClick={() => { setMode('login'); setCaptchaVerified(false); setError('') }}>Login</button>
                <button style={S.tab(mode === 'signup')} onClick={() => { setMode('signup'); setCaptchaVerified(false); setError('') }}>Sign Up</button>
              </div>

              <CaptchaBox />

              {/* Google */}
              <button style={S.gBtn} onClick={handleGoogle} disabled={loading || !captchaVerified}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.4 5.5-5 7.2v6h8.1c4.7-4.4 7.2-10.8 7.2-17.3z"/>
                  <path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-8.1-6c-2.1 1.4-4.8 2.3-7.9 2.3-6 0-11.1-4.1-12.9-9.6H2.7v6.2C6.7 43.1 14.9 48 24 48z"/>
                  <path fill="#FBBC05" d="M11.1 28.9c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-6.2H2.7C1 17.6 0 20.7 0 24s1 6.4 2.7 9.1l8.4-6.2z"/>
                  <path fill="#EA4335" d="M24 9.5c3.4 0 6.4 1.2 8.8 3.4l6.5-6.5C35.1 2.4 29.9 0 24 0 14.9 0 6.7 4.9 2.7 12.1l8.4 6.2C12.9 13.6 18 9.5 24 9.5z"/>
                </svg>
                Continue with Google
              </button>

              {/* Divider */}
              <div className="login-divider" style={S.or}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>or with email</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              </div>

              {/* Form */}
              <div className="login-form-stack" style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                {mode === 'signup' && (
                  <div>
                    <label style={S.label}>Full Name</label>
                    <input className="input" placeholder="Your name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                )}
                <div>
                  <label style={S.label}>Email</label>
                  <input className="input" type="email" placeholder="your@email.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input className="input" type={showPassword ? 'text' : 'password'} placeholder="Password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} style={{ paddingRight: '46px' }} />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', width: '34px', height: '34px', border: 'none', background: 'transparent', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                {mode === 'login' && (
                  <div style={{ textAlign: 'right' }}>
                    <button onClick={() => setMode('reset')} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                      Forgot password?
                    </button>
                  </div>
                )}
                <button onClick={handleEmail} disabled={loading || !form.email || !form.password || !captchaVerified} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}>
                  {loading ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create Account'}
                </button>
              </div>
            </>
          )}
        </div>
        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '12px', marginTop: '16px' }}>
          Admin? Use owner email to access dashboard after login.
        </p>
      </div>
      <style>{`
        .login-page { box-sizing: border-box; }
        .login-card, .login-wrap { box-sizing: border-box; }
        .robot-check {
          width: 100%;
          min-height: 62px;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          padding: 12px 14px;
          border: 1px solid #c8c8c8;
          border-radius: 4px;
          background: #f9f9f9;
          color: #1f2937;
          cursor: pointer;
          text-align: left;
        }
        .robot-check-box {
          width: 28px;
          height: 28px;
          border: 2px solid #b8b8b8;
          background: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #16a34a;
          flex-shrink: 0;
        }
        .robot-check.verified .robot-check-box {
          border-color: transparent;
          background: transparent;
        }
        .robot-check-text {
          min-width: 0;
          font-size: 14px;
          color: #111827;
        }
        .robot-check-brand {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #2563eb;
        }
        @media (min-width: 768px) {
          .login-page { align-items: center !important; padding: 118px 20px 44px !important; }
        }
        @media (max-width: 520px) {
          .login-page { padding: 112px 12px 18px !important; }
          .login-wrap { max-width: 100% !important; }
          .login-logo { margin-bottom: 14px !important; }
          .login-logo > div > div:first-child { width: 54px !important; height: 54px !important; margin-bottom: 10px !important; }
          .login-card { padding: 20px !important; border-radius: 16px !important; }
          .login-tabs { margin-bottom: 16px !important; }
          .login-divider { margin-bottom: 16px !important; }
          .login-form-stack { gap: 11px !important; }
          .login-card .input { min-height: 48px; font-size: 16px; }
        }
        @media (max-height: 760px) and (max-width: 520px) {
          .login-page { padding-top: 104px !important; }
          .login-logo { margin-bottom: 10px !important; }
          .login-card { padding: 18px !important; }
        }
      `}</style>    </div>
  )
}


