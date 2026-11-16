// src/pages/WalkerSetup.jsx
import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import {
  Footprints,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react'
import {
  generateSalt,
  hashPassword,
  generateUniqueToken,
  saveWalkerSession,
} from '../utils/walkerAuth'

export default function WalkerSetup() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const walkerId = searchParams.get('walkerId') || ''
  const token = searchParams.get('token') || ''

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [walkerData, setWalkerData] = useState(null)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Validate walker and token on mount
  useEffect(() => {
    async function validateToken() {
      if (!walkerId) {
        setErrorMsg('Invalid or missing walker ID in link. Please ask Admin to resend your invite.')
        setLoading(false)
        return
      }

      try {
        const snap = await getDoc(doc(db, 'teamMembers', walkerId))
        if (!snap.exists()) {
          setErrorMsg('Walker profile not found. Please contact Admin.')
          setLoading(false)
          return
        }

        const data = snap.data()
        setWalkerData(data)

        // Check if token matches or if already activated
        if (token && data.activationToken && data.activationToken === token) {
          // Token is valid and ready for password creation
        } else if (data.isActivated && data.passwordHash) {
          setErrorMsg('Your account is already activated! You can log in directly.')
        } else if (token && data.activationToken !== token) {
          setErrorMsg('This setup link has expired or was already used. Please ask Admin for a new link or log in if you already set a password.')
        }
      } catch (err) {
        setErrorMsg(`Unable to load setup details: ${err.message}`)
      } finally {
        setLoading(false)
      }
    }

    validateToken()
  }, [walkerId, token])

  // Handle password submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!password.trim()) {
      alert('Please enter a password or PIN.')
      return
    }
    if (password.length < 4) {
      alert('Password or PIN must be at least 4 characters.')
      return
    }
    if (password !== confirmPassword) {
      alert('Passwords do not match. Please re-enter.')
      return
    }

    setSubmitting(true)
    try {
      const salt = generateSalt()
      const passwordHash = await hashPassword(password, salt)
      const sessionId = generateUniqueToken()

      const patch = {
        passwordHash,
        salt,
        isActivated: true,
        activatedAt: serverTimestamp(),
        activationToken: null, // invalidate token after use
        activeSessionId: sessionId,
        lastLoginAt: serverTimestamp(),
        lastActiveDevice: typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 80) : 'Mobile',
        updatedAt: serverTimestamp(),
      }

      await updateDoc(doc(db, 'teamMembers', walkerId), patch)

      // Save session locally
      saveWalkerSession({
        walkerId,
        sessionId,
        name: walkerData?.name || 'Walker',
        phone: walkerData?.phone || '',
      })

      setSuccess(true)
      setTimeout(() => {
        navigate('/walker', { replace: true })
      }, 1500)
    } catch (err) {
      alert(`Could not activate account: ${err.message}`)
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg, #FCFAF6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'var(--card, #FFFFFF)',
          borderRadius: '24px',
          padding: '28px 22px',
          border: '1.5px solid var(--border, #F0EAE1)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.06)',
          textAlign: 'center',
        }}
      >
        {/* Top Paw Paw Badge */}
        <div
          style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #C08820 0%, #D49B2E 100%)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: '#fff',
            boxShadow: '0 6px 18px rgba(192, 136, 32, 0.35)',
          }}
        >
          <Footprints size={32} />
        </div>

        {/* Loading View */}
        {loading && (
          <div style={{ padding: '30px 0', color: 'var(--muted, #7E7067)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
            <div>Verifying your activation link...</div>
          </div>
        )}

        {/* Error View */}
        {!loading && errorMsg && (
          <div>
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '14px',
                padding: '14px',
                marginBottom: '18px',
                color: '#b91c1c',
                fontSize: '13px',
                lineHeight: 1.5,
                textAlign: 'left',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{errorMsg}</div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/walker')}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '14px' }}
            >
              Go to Walker Login
            </button>
          </div>
        )}

        {/* Success View */}
        {!loading && success && (
          <div style={{ padding: '10px 0' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                background: '#dcfce7',
                color: '#16a34a',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
              }}
            >
              <CheckCircle size={32} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text, #221711)', margin: '0 0 6px' }}>
              Account Activated! 🎉
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--muted, #7E7067)', margin: 0 }}>
              Your password has been saved. Redirecting to your Walker Portal...
            </p>
          </div>
        )}

        {/* Setup Form */}
        {!loading && !errorMsg && !success && (
          <div>
            <h1 style={{ fontSize: '21px', fontWeight: 900, color: 'var(--text, #221711)', margin: '0 0 6px' }}>
              Welcome, {walkerData?.name || 'Walker'}!
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--muted, #7E7067)', margin: '0 0 20px', lineHeight: 1.5 }}>
              Set up your private password (or 4-6 digit PIN) to activate your Walker Portal account.
            </p>

            <div
              style={{
                background: 'var(--surface, #F7F2E7)',
                borderRadius: '12px',
                padding: '10px 14px',
                marginBottom: '18px',
                textAlign: 'left',
                fontSize: '12.5px',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ color: 'var(--muted, #7E7067)' }}>Registered Mobile:</span>
              <strong style={{ color: 'var(--text, #221711)' }}>{walkerData?.phone || '-'}</strong>
            </div>

            <form onSubmit={handleSubmit} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--text, #221711)', marginBottom: '5px' }}>
                  Create Password / PIN
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input"
                    placeholder="Enter password or 4-digit PIN"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ width: '100%', boxSizing: 'border-box', paddingRight: '40px', fontSize: '14px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted, #7E7067)', cursor: 'pointer', padding: '4px' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--text, #221711)', marginBottom: '5px' }}>
                  Confirm Password / PIN
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: '14px' }}
                />
              </div>

              <div style={{ background: 'var(--accent-bg, #FFF9ED)', border: '1px solid var(--accent-border, #F2D99E)', borderRadius: '10px', padding: '10px', fontSize: '11.5px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={16} style={{ flexShrink: 0 }} />
                <span>Single-device session security is active. Only you will have access to your assigned walks.</span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '13px',
                  fontSize: '14.5px',
                  fontWeight: 900,
                  marginTop: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                {submitting ? 'Activating Account...' : 'Activate & Enter Portal'} <ArrowRight size={16} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
