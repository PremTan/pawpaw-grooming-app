// src/components/SetPasswordModal.jsx
// Lets a Google-logged-in user link an email/password as backup login
import { useState } from 'react'
import { linkWithCredential, EmailAuthProvider } from 'firebase/auth'
import { auth } from '../firebase'
import { X } from 'lucide-react'

export default function SetPasswordModal({ onClose }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)

//   const handleSave = async () => {
//     setError('')
//     if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
//     if (password !== confirm) { setError('Passwords do not match.'); return }
//     setLoading(true)
//     try {
//       const user = auth.currentUser
//       const credential = EmailAuthProvider.credential(user.email, password)
//       await linkWithCredential(user, credential)
//       setSuccess(true)
//     } catch (e) {
//       if (e.code === 'auth/provider-already-linked' || e.code === 'auth/email-already-in-use') {
//         setError('A password is already set for this account. Use "Forgot password" on the login page to change it.')
//       } else {
//         setError(e.message?.replace('Firebase: ', '').replace(/\(auth\/[^)]*\)/g, '').trim() || 'Failed to set password.')
//       }
//     }
//     setLoading(false)
//   }
const handleSave = async () => {
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      const user = auth.currentUser
      const credential = EmailAuthProvider.credential(user.email, password)
      await linkWithCredential(user, credential)
      setSuccess(true)
    } catch (e) {
      // 1. Log the full error object to your browser console
      console.error("Full Firebase Error:", e); 
      
      const code = e.code;
      
      if (code === 'auth/provider-already-linked' || code === 'auth/email-already-in-use') {
        setError('A password is already set for this account. Use "Forgot password" on the login page to change it.')
      } else if (code === 'auth/requires-recent-login') {
        setError('For security reasons, please log out and log back in with Google before setting a password.')
      } else {
        let cleanMsg = e.message?.replace('Firebase: ', '').replace(/\(auth\/[^)]*\)/g, '').trim();
        
        if (!cleanMsg || cleanMsg === 'Error .' || cleanMsg === 'Error') {
          // 2. Temporarily display the actual Firebase code on the screen
          cleanMsg = `Failed: ${code || 'Unknown error'}. Please try again.`;
        }
        
        setError(cleanMsg);
      }
    }
    setLoading(false)
  }

  const L = { fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '6px' }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h2 style={{ fontFamily: '"Playfair Display",serif', fontWeight: 700, fontSize: '18px', color: 'var(--text)' }}>
              Set Backup Password
            </h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={18} /></button>
          </div>

          {success ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
              <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: '6px' }}>Password set successfully!</p>
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '18px' }}>You can now login with email + password too, in addition to Google.</p>
              <button onClick={onClose} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Done</button>
            </div>
          ) : (
            <>
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '18px', lineHeight: 1.6 }}>
                You're logged in with Google. Set a password so you can also login using email + password as a backup.
              </p>

              {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '12px', padding: '10px 12px', borderRadius: '10px', marginBottom: '14px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={L}>New Password</label>
                  <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <div>
                  <label style={L}>Confirm Password</label>
                  <input className="input" type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} />
                </div>
                <button onClick={handleSave} disabled={loading || !password || !confirm} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}>
                  {loading ? 'Saving…' : 'Set Password'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}