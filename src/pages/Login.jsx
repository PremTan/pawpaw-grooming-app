// // src/pages/Login.jsx
// import { useState } from 'react'
// import { useNavigate, Link } from 'react-router-dom'
// import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth'
// import { auth, googleProvider } from '../firebase'
// import { useAuth } from '../context/AuthContext'
// import BrandLogo from '../components/BrandLogo'

// export default function Login() {
//   const { user } = useAuth()
//   const navigate  = useNavigate()
//   const [mode, setMode]     = useState('login')
//   const [form, setForm]     = useState({ name: '', email: '', password: '' })
//   const [loading, setLoading]   = useState(false)
//   const [error, setError]       = useState('')
//   const [resetSent, setResetSent] = useState(false)

//   if (user) { navigate('/', { replace: true }); return null }

//   const handleGoogle = async () => {
//     setLoading(true); setError('')
//     try { await signInWithPopup(auth, googleProvider); navigate('/') }
//     catch (e) { setError(e.message) }
//     setLoading(false)
//   }

//   const handleEmail = async () => {
//     setLoading(true); setError('')
//     try {
//       if (mode === 'signup') {
//         const cred = await createUserWithEmailAndPassword(auth, form.email, form.password)
//         if (form.name) await updateProfile(cred.user, { displayName: form.name })
//       } else {
//         await signInWithEmailAndPassword(auth, form.email, form.password)
//       }
//       navigate('/')
//     } catch (e) { setError(e.message.replace('Firebase: ', '').replace(/\(auth\/.*\)/, '').trim()) }
//     setLoading(false)
//   }

//   const handleReset = async () => {
//     setLoading(true); setError('')
//     try { await sendPasswordResetEmail(auth, form.email); setResetSent(true) }
//     catch { setError('Could not send reset email. Check your email address.') }
//     setLoading(false)
//   }

//   const S = {
//     page:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '80px 16px 40px' },
//     wrap:  { width: '100%', maxWidth: '420px' },
//     card:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '36px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' },
//     label: { fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '6px' },
//     gBtn:  { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', marginBottom: '20px', transition: 'all 0.2s' },
//     or:    { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' },
//     tab:   (active) => ({ flex: 1, padding: '9px', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none', background: active ? 'var(--accent-bg)' : 'transparent', color: active ? 'var(--accent)' : 'var(--muted)', transition: 'all 0.2s' }),
//   }

//   return (
//     <div style={S.page}>
//       <div style={S.wrap}>
//         {/* Logo */}
//         <div style={{ textAlign: 'center', marginBottom: '32px' }}>
//           <div style={{ width: '64px', height: '64px', borderRadius: '18px', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 16px', boxShadow: '0 8px 24px var(--accent-bg)' }}>🐾</div>
//           <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '26px', fontWeight: 800, color: 'var(--text)' }}>Paw Paw</h1>
//           <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '4px' }}>
//             {mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}
//           </p>
//         </div>

//         <div style={S.card}>
//           {error && (
//             <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', padding: '11px 14px', borderRadius: '10px', marginBottom: '18px' }}>
//               {error}
//             </div>
//           )}

//           {mode === 'reset' ? (
//             resetSent ? (
//               <div style={{ textAlign: 'center', padding: '20px 0' }}>
//                 <div style={{ fontSize: '48px', marginBottom: '12px' }}>📧</div>
//                 <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: '6px' }}>Reset link sent!</p>
//                 <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>Check your inbox.</p>
//                 <button onClick={() => { setMode('login'); setResetSent(false) }} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}>← Back to login</button>
//               </div>
//             ) : (
//               <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
//                 <div>
//                   <label style={S.label}>Email</label>
//                   <input className="input" type="email" placeholder="your@email.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
//                 </div>
//                 <button onClick={handleReset} disabled={loading || !form.email} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
//                   {loading ? 'Sending…' : 'Send Reset Link'}
//                 </button>
//                 <button onClick={() => setMode('login')} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', textAlign: 'center' }}>← Back to login</button>
//               </div>
//             )
//           ) : (
//             <>
//               {/* Tabs */}
//               <div style={{ display: 'flex', gap: '4px', background: 'var(--surface)', borderRadius: '12px', padding: '4px', marginBottom: '24px' }}>
//                 <button style={S.tab(mode === 'login')}  onClick={() => { setMode('login');  setError('') }}>Login</button>
//                 <button style={S.tab(mode === 'signup')} onClick={() => { setMode('signup'); setError('') }}>Sign Up</button>
//               </div>

//               {/* Google */}
//               <button style={S.gBtn} onClick={handleGoogle} disabled={loading}
//                 onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-border)'}
//                 onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
//               >
//                 <svg width="18" height="18" viewBox="0 0 48 48">
//                   <path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.4 5.5-5 7.2v6h8.1c4.7-4.4 7.2-10.8 7.2-17.3z"/>
//                   <path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-8.1-6c-2.1 1.4-4.8 2.3-7.9 2.3-6 0-11.1-4.1-12.9-9.6H2.7v6.2C6.7 43.1 14.9 48 24 48z"/>
//                   <path fill="#FBBC05" d="M11.1 28.9c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-6.2H2.7C1 17.6 0 20.7 0 24s1 6.4 2.7 9.1l8.4-6.2z"/>
//                   <path fill="#EA4335" d="M24 9.5c3.4 0 6.4 1.2 8.8 3.4l6.5-6.5C35.1 2.4 29.9 0 24 0 14.9 0 6.7 4.9 2.7 12.1l8.4 6.2C12.9 13.6 18 9.5 24 9.5z"/>
//                 </svg>
//                 Continue with Google
//               </button>

//               {/* Divider */}
//               <div style={S.or}>
//                 <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
//                 <span style={{ color: 'var(--muted)', fontSize: '12px' }}>or with email</span>
//                 <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
//               </div>

//               {/* Form */}
//               <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
//                 {mode === 'signup' && (
//                   <div>
//                     <label style={S.label}>Full Name</label>
//                     <input className="input" placeholder="Your name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
//                   </div>
//                 )}
//                 <div>
//                   <label style={S.label}>Email</label>
//                   <input className="input" type="email" placeholder="your@email.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
//                 </div>
//                 <div>
//                   <label style={S.label}>Password</label>
//                   <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
//                 </div>
//                 {mode === 'login' && (
//                   <div style={{ textAlign: 'right' }}>
//                     <button onClick={() => setMode('reset')} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
//                       Forgot password?
//                     </button>
//                   </div>
//                 )}
//                 <button onClick={handleEmail} disabled={loading || !form.email || !form.password} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}>
//                   {loading ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create Account'}
//                 </button>
//               </div>
//             </>
//           )}
//         </div>
//         <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '12px', marginTop: '16px' }}>
//           Admin? Use owner email to access dashboard after login.
//         </p>
//       </div>
//     </div>
//   )
// }

// src/pages/Login.jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth'
import { auth, googleProvider } from '../firebase'
import { useAuth } from '../context/AuthContext'
import BrandLogo from '../components/BrandLogo'

export default function Login() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [mode, setMode]     = useState('login')
  const [form, setForm]     = useState({ name: '', email: '', password: '' })
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [resetSent, setResetSent] = useState(false)

  if (user) { navigate('/', { replace: true }); return null }

  const handleGoogle = async () => {
    setLoading(true); setError('')
    try { await signInWithPopup(auth, googleProvider); navigate('/') }
    catch (e) { setError(e.message) }
    setLoading(false)
  }

  const handleEmail = async () => {
    setLoading(true); setError('')
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, form.email, form.password)
        if (form.name) await updateProfile(cred.user, { displayName: form.name })
      } else {
        await signInWithEmailAndPassword(auth, form.email, form.password)
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

  const S = {
    page:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '80px 16px 40px' },
    wrap:  { width: '100%', maxWidth: '420px' },
    card:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '36px', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' },
    label: { fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '6px' },
    gBtn:  { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', marginBottom: '20px', transition: 'all 0.2s' },
    or:    { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' },
    tab:   (active) => ({ flex: 1, padding: '9px', borderRadius: '9px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none', background: active ? 'var(--accent-bg)' : 'transparent', color: active ? 'var(--accent)' : 'var(--muted)', transition: 'all 0.2s' }),
  }

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <BrandLogo size="login" tagline={mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'} align="center" />
        </div>

        <div style={S.card}>
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
              <div style={{ display: 'flex', gap: '4px', background: 'var(--surface)', borderRadius: '12px', padding: '4px', marginBottom: '24px' }}>
                <button style={S.tab(mode === 'login')}  onClick={() => { setMode('login');  setError('') }}>Login</button>
                <button style={S.tab(mode === 'signup')} onClick={() => { setMode('signup'); setError('') }}>Sign Up</button>
              </div>

              {/* Google */}
              <button style={S.gBtn} onClick={handleGoogle} disabled={loading}
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
              <div style={S.or}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>or with email</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              </div>

              {/* Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                  <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
                </div>
                {mode === 'login' && (
                  <div style={{ textAlign: 'right' }}>
                    <button onClick={() => setMode('reset')} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                      Forgot password?
                    </button>
                  </div>
                )}
                <button onClick={handleEmail} disabled={loading || !form.email || !form.password} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}>
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
    </div>
  )
}


