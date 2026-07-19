import { useCallback, useEffect, useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import Cropper from 'react-easy-crop'
import { Eye, EyeOff, Lock, Save, User, Upload, X } from 'lucide-react'
import { auth, db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'

const EMPTY = {
  name: '',
  phone: '',
  address: '',
}

function getCroppedImg(imageSrc, pixelCrop) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const size = Math.min(pixelCrop.width, pixelCrop.height)
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        size,
        size
      )
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('Could not crop image.'))
          return
        }
        resolve(new File([blob], `profile-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.92)
    }
    image.onerror = reject
    image.src = imageSrc
  })
}

export default function Profile() {
  const { user, profile, isBlocked } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [showPasswordFields, setShowPasswordFields] = useState({ current: false, next: false, confirm: false })
  const [optimizingPhoto, setOptimizingPhoto] = useState(false)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [cropData, setCropData] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const canChangePassword = user?.providerData?.some(provider => provider.providerId === 'password')
  const currentPhotoUrl = photoPreview || profile?.photoURL || user.photoURL

  const togglePasswordVisibility = (key) => {
    setShowPasswordFields(prev => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    if (!toastMessage) return
    const t = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [toastMessage])

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
    if (isBlocked) {
      setError('Your account is blocked from updating profile details.')
      return
    }
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
        photoURL: profile?.photoURL || user.photoURL || '',
        updatedAt: serverTimestamp(),
      }

      console.log('[Profile save debug]', {
        authUserUid: user?.uid || null,
        profileDocId: user?.uid || null,
        authEmail: user?.email || null,
        isBlocked,
        profileExists: Boolean(profile),
        profileBlocked: profile?.blocked === true,
        data,
      })

      await setDoc(doc(db, 'profiles', user.uid), data, { merge: true })
      if (data.name && data.name !== user.displayName) {
        await updateProfile(auth.currentUser, { displayName: data.name })
      }
      setForm(prev => ({ ...prev, phone: cleanPhone }))
      setToastType('success')
      setToastMessage('Profile updated successfully.')
    } catch (err) {
      setToastType('error')
      setToastMessage(err.message || 'Could not update profile.')
      setError(err.message || 'Could not update profile.')
    }
    setSaving(false)
  }

  const changePassword = async () => {
    if (isBlocked || !canChangePassword) return
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
      setToastType('success')
      setToastMessage('Password updated successfully.')
    } catch (err) {
      const msg = err.message || ''
      const friendlyMessage = msg.includes('auth/invalid-credential') ? 'Current password is incorrect.' : msg.replace('Firebase: ', '').replace(/\(auth\/.*\)/, '').trim()
      setToastType('error')
      setToastMessage(friendlyMessage || 'Could not update password.')
      setError(friendlyMessage || 'Could not update password.')
    }
    setChangingPassword(false)
  }

  const choosePhoto = async (event) => {
    if (isBlocked) {
      setError('Your account is blocked from updating profile details.')
      event.target.value = ''
      return
    }
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      validateImageFile(file)
    } catch (err) {
      setError(err.message)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setCropData(reader.result)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
      setError('')
    }
    reader.readAsDataURL(file)
  }

  const onCropComplete = useCallback((_, nextPixels) => {
    setCroppedAreaPixels(nextPixels)
  }, [])

  const cancelCrop = () => {
    setCropData(null)
    setError('')
  }

  const uploadCroppedPhoto = async () => {
    if (!cropData || !croppedAreaPixels) return
    setUploadingPhoto(true)
    setError('')
    setMessage('')
    try {
      const croppedFile = await getCroppedImg(cropData, croppedAreaPixels)
      const previewUrl = URL.createObjectURL(croppedFile)
      setPhotoPreview(previewUrl)
      setCropData(null)

      const photoURL = await uploadToCloudinary(croppedFile, {
        onOptimizeStart: () => setOptimizingPhoto(true),
        onOptimizeEnd: () => setOptimizingPhoto(false),
      })

      await updateProfile(auth.currentUser, { photoURL })
      await setDoc(doc(db, 'profiles', user.uid), {
        email: user.email || '',
        name: form.name.trim() || user.displayName || '',
        phone: form.phone.replace(/\D/g, '').slice(0, 10),
        photoURL,
        userId: user.uid,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      setPhotoPreview(photoURL)
      setMessage('Profile photo updated!')
    } catch (err) {
      setError(err.message || 'Could not upload photo.')
    }
    setOptimizingPhoto(false)
    setUploadingPhoto(false)
  }

  const L = { fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', marginBottom: '6px' }

  if (loading) return (
    <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' }}>
      <Spinner text="Loading profile..." />
    </div>
  )

  return (
    <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' }}>
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 20px 80px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '32px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>My Profile</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Save your details once and use them for future bookings.</p>
        </div>
        {isBlocked && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444', fontSize: '13px', padding: '12px 14px', borderRadius: '12px', marginBottom: '16px' }}>
            Your account is blocked from profile changes. You can still log in and view your details.
          </div>
        )}

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

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
            <div style={{ position: 'relative' }}>
              {currentPhotoUrl ? (
                <img
                  src={currentPhotoUrl}
                  alt="Profile"
                  style={{ width: '70px', height: '70px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent)' }}
                />
              ) : (
                <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'var(--accent-bg)', border: '2px dashed var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
              <input
                type="file"
                accept={IMAGE_FILE_ACCEPT}
                onChange={choosePhoto}
                disabled={isBlocked || uploadingPhoto}
                style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
              />
              <button
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--accent-border)',
                  background: 'var(--accent-bg)',
                  color: 'var(--accent)',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: isBlocked || uploadingPhoto ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  opacity: isBlocked || uploadingPhoto ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { if (!isBlocked && !uploadingPhoto) { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'white'; } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.color = 'var(--accent)' }}
                disabled={isBlocked || uploadingPhoto}
              >
                <Upload size={12} /> {optimizingPhoto ? 'Optimizing image...' : uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
              </button>
            </div>
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

          <button onClick={saveProfile} disabled={isBlocked || saving || !form.name.trim()} className="btn btn-primary" style={{ justifyContent: 'center' }}>
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
              <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '18px' }}>
                If you forgot your password, please go to the login page and use the Forgot Password flow there.
              </p>
              <div className="profile-password-grid">
                <div>
                  <label style={L}>Current Password</label>
                  <div style={{ position: 'relative' }}>
                    <input className="input" type={showPasswordFields.current ? 'text' : 'password'} value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} style={{ paddingRight: '42px' }} />
                    <button type="button" onClick={() => togglePasswordVisibility('current')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }} aria-label="Toggle current password visibility">
                      {showPasswordFields.current ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={L}>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input className="input" type={showPasswordFields.next ? 'text' : 'password'} value={passwords.next} onChange={e => setPasswords(p => ({ ...p, next: e.target.value }))} style={{ paddingRight: '42px' }} />
                    <button type="button" onClick={() => togglePasswordVisibility('next')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }} aria-label="Toggle new password visibility">
                      {showPasswordFields.next ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: '18px' }}>
                <label style={L}>Confirm New Password</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" type={showPasswordFields.confirm ? 'text' : 'password'} value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} style={{ paddingRight: '42px' }} />
                  <button type="button" onClick={() => togglePasswordVisibility('confirm')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }} aria-label="Toggle confirm password visibility">
                    {showPasswordFields.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button onClick={changePassword} disabled={isBlocked || changingPassword || !passwords.current || !passwords.next || !passwords.confirm} className="btn btn-secondary" style={{ justifyContent: 'center' }}>
                <Lock size={16} /> {changingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </>
          )}
        </div>
      </div>

      {cropData && (
        <div className="modal-overlay profile-crop-overlay" onClick={cancelCrop}>
          <div className="modal-box profile-crop-modal" onClick={event => event.stopPropagation()}>
            <div className="profile-crop-head">
              <div>
                <h2>Crop Profile Photo</h2>
                <p>Zoom and position your photo inside the circle.</p>
              </div>
              <button type="button" onClick={cancelCrop} aria-label="Close crop photo"><X size={18} /></button>
            </div>
            <div className="profile-crop-stage">
              <Cropper
                image={cropData}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            <label className="profile-crop-zoom">
              Zoom
              <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={event => setZoom(Number(event.target.value))} />
            </label>
            <div className="profile-crop-actions">
              <button type="button" className="btn btn-secondary" onClick={cancelCrop}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={uploadCroppedPhoto} disabled={uploadingPhoto}>
                {optimizingPhoto ? 'Optimizing image...' : uploadingPhoto ? 'Uploading...' : 'Use Photo'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .profile-crop-overlay { z-index: 120; }
        .profile-crop-modal { max-width: 560px; overflow: hidden; }
        .profile-crop-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 18px 18px 0; }
        .profile-crop-head h2 { color: var(--text); font-size: 18px; font-weight: 900; }
        .profile-crop-head p { color: var(--muted); font-size: 12px; margin-top: 4px; }
        .profile-crop-head button { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; }
        .profile-crop-stage { position: relative; width: 100%; height: min(62vh, 420px); min-height: 300px; margin-top: 16px; background: #111; }
        .profile-crop-zoom { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center; padding: 16px 18px 0; color: var(--muted); font-size: 12px; font-weight: 800; }
        .profile-crop-zoom input { accent-color: var(--accent); }
        .profile-password-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
        @media (max-width: 700px) {
          .profile-password-grid { grid-template-columns: 1fr; }
        }
        .profile-crop-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 16px 18px 18px; }
      `}</style>
    </div>
  )
}
