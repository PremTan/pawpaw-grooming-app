import { useEffect, useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Lock, Save, User } from 'lucide-react'
import { auth, db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'

const EMPTY = {
  name: '',
  phone: '',
  address: '',
}

export default function Profile() {
  const { user } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const canChangePassword = user?.providerData?.some(provider => provider.providerId === 'password')

  useEffect(() => {
    async function fetchProfile() {
      try {
        const snap = await getDoc(doc(db, 'profiles', user.uid))
        const data = snap.exists() ? snap.data() : {}
        setForm({
          name: data.name || user.displayName || '',
          phone: data.phone || '',
          address: data.address || '',
        })
      } catch {
        setForm(prev => ({ ...prev, name: user.displayName || '' }))
      }
      setLoading(false)
    }
    fetchProfile()
  }, [user])

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const saveProfile = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const cleanPhone = form.phone.replace(/\D/g, '').slice(0, 10)
      const data = {
        name: form.name.trim(),
        phone: cleanPhone,
        address: form.address.trim(),
        email: user.email,
        userId: user.uid,
        updatedAt: serverTimestamp(),
      }

      await setDoc(doc(db, 'profiles', user.uid), data, { merge: true })
      if (data.name && data.name !== user.displayName) {
        await updateProfile(auth.currentUser, { displayName: data.name })
      }
      setForm(prev => ({ ...prev, phone: cleanPhone }))
      setMessage('Profile updated.')
    } catch (err) {
      setError(err.message || 'Could not update profile.')
    }
    setSaving(false)
  }

  const changePassword = async () => {
    if (!canChangePassword) return
    setChangingPassword(true)
    setError('')
    setMessage('')
    try {
      if (passwords.next.length < 6) throw new Error('New password must be at least 6 characters.')
      if (passwords.next !== passwords.confirm) throw new Error('New passwords do not match.')

      const credential = EmailAuthProvider.credential(user.email, passwords.current)
      await reauthenticateWithCredential(auth.currentUser, credential)
      await updatePassword(auth.currentUser, passwords.next)
      setPasswords({ current: '', next: '', confirm: '' })
      setMessage('Password updated.')
    } catch (err) {
      const msg = err.message || ''
      setError(msg.includes('auth/invalid-credential') ? 'Current password is incorrect.' : msg.replace('Firebase: ', '').replace(/\(auth\/.*\)/, '').trim())
    }
    setChangingPassword(false)
  }

  const L = { fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '6px' }

  if (loading) return (
    <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' }}>
      <Spinner text="Loading profile..." />
    </div>
  )

  return (
    <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 20px 80px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '32px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>My Profile</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Save your details once and use them for future bookings.</p>
        </div>

        {(message || error) && (
          <div style={{ background: error ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)', border: `1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.25)'}`, color: error ? '#ef4444' : '#34d399', fontSize: '13px', padding: '12px 14px', borderRadius: '12px', marginBottom: '16px' }}>
            {error || message}
          </div>
        )}

        <div className="card" style={{ padding: '24px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <User size={18} style={{ color: 'var(--accent)' }} />
            <h2 style={{ color: 'var(--text)', fontSize: '18px', fontWeight: 800 }}>Personal Details</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={L}>Full Name</label>
              <input className="input" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <label style={L}>Phone</label>
              <input className="input" value={form.phone} maxLength={10} inputMode="numeric" onChange={e => update('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit number" />
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={L}>Email</label>
            <input className="input" value={user.email || ''} disabled />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={L}>Address</label>
            <textarea className="input" rows={3} style={{ resize: 'none' }} value={form.address} onChange={e => update('address', e.target.value)} placeholder="Home address or pickup details" />
          </div>

          <button onClick={saveProfile} disabled={saving || !form.name.trim()} className="btn btn-primary" style={{ justifyContent: 'center' }}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <Lock size={18} style={{ color: 'var(--accent)' }} />
            <h2 style={{ color: 'var(--text)', fontSize: '18px', fontWeight: 800 }}>Password</h2>
          </div>

          {!canChangePassword ? (
            <p style={{ color: 'var(--muted)', fontSize: '13px' }}>This account uses Google sign-in. Password changes are managed through your Google account.</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={L}>Current Password</label>
                  <input className="input" type="password" value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} />
                </div>
                <div>
                  <label style={L}>New Password</label>
                  <input className="input" type="password" value={passwords.next} onChange={e => setPasswords(p => ({ ...p, next: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginBottom: '18px' }}>
                <label style={L}>Confirm New Password</label>
                <input className="input" type="password" value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} />
              </div>
              <button onClick={changePassword} disabled={changingPassword || !passwords.current || !passwords.next || !passwords.confirm} className="btn btn-secondary" style={{ justifyContent: 'center' }}>
                <Lock size={16} /> {changingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
