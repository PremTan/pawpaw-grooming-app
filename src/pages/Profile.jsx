import { useCallback, useEffect, useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import Cropper from 'react-easy-crop'
import { Eye, EyeOff, Lock, Plus, Save, User, Upload, X } from 'lucide-react'
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
const ADDRESS_TYPES = ['Home', 'Work', 'Office', 'Relatives', 'Other']
const EMPTY_ADDRESS = { id: '', type: 'Home', address: '', isDefault: false }

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
  const [addresses, setAddresses] = useState([])
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS)
  const [addressFormError, setAddressFormError] = useState('')
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteAddressId, setDeleteAddressId] = useState(null)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)

  const canChangePassword = user?.providerData?.some(provider => provider.providerId === 'password')
  const currentPhotoUrl = photoPreview || profile?.photoURL || user.photoURL

  const togglePasswordVisibility = (key) => {
    setShowPasswordFields(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const normalizeAddresses = (list = []) => {
    const normalized = Array.isArray(list)
      ? list.map(item => ({
          id: item.id || `address-${Math.random().toString(36).slice(2)}`,
          type: ADDRESS_TYPES.includes(item.type) ? item.type : 'Home',
          address: (item.address || '').trim(),
          isDefault: item.isDefault === true,
        }))
        .filter(item => item.address)
      : []

    if (normalized.length && !normalized.some(item => item.isDefault)) {
      normalized[0].isDefault = true
    }
    return normalized
  }

  const getDefaultAddress = (list = []) => {
    if (!Array.isArray(list) || list.length === 0) return null
    return list.find(item => item.isDefault) || list[0]
  }

  const openAddressModal = (address = null) => {
    if (address) {
      setAddressForm({ ...address })
    } else {
      setAddressForm({ ...EMPTY_ADDRESS, id: `address-${Date.now()}` })
    }
    setAddressFormError('')
    setShowAddressModal(true)
  }

  const closeAddressModal = () => {
    setShowAddressModal(false)
    setAddressForm(EMPTY_ADDRESS)
    setAddressFormError('')
  }

  const updateAddressForm = (key, value) => {
    setAddressForm(prev => ({ ...prev, [key]: value }))
  }

  const saveAddress = () => {
    const trimmed = addressForm.address.trim()
    if (!trimmed) {
      setAddressFormError('Please enter the address.')
      return
    }

    let next = addresses.map(item => ({ ...item, isDefault: addressForm.isDefault ? false : item.isDefault }))
    const existingIndex = next.findIndex(item => item.id === addressForm.id)
    const nextItem = { ...addressForm, address: trimmed, id: addressForm.id || `address-${Date.now()}` }

    if (existingIndex >= 0) {
      next[existingIndex] = nextItem
    } else {
      next.push(nextItem)
    }

    if (!next.some(item => item.isDefault)) {
      next[0].isDefault = true
    }

    setAddresses(next)
    setForm(prev => ({ ...prev, address: getDefaultAddress(next)?.address || prev.address }))
    setToastType('success')
    setToastMessage(existingIndex >= 0 ? 'Address updated successfully.' : 'Address added successfully.')
    closeAddressModal()
  }

  const openDeleteConfirm = (id) => {
    if (addresses.length <= 1) {
      setToastType('error')
      setToastMessage('You cannot delete the last address. At least one address must remain.')
      return
    }
    setDeleteAddressId(id)
    setDeleteModalOpen(true)
  }

  const closeDeleteModal = () => {
    setDeleteModalOpen(false)
    setDeleteAddressId(null)
  }

  const confirmDeleteAddress = () => {
    if (!deleteAddressId) return
    const next = addresses.filter(item => item.id !== deleteAddressId)
    if (next.length && !next.some(item => item.isDefault)) {
      next[0].isDefault = true
    }
    setAddresses(next)
    setForm(prev => ({ ...prev, address: getDefaultAddress(next)?.address || prev.address }))
    closeDeleteModal()
    setToastType('success')
    setToastMessage('Address deleted successfully.')
  }

  const setDefaultAddress = (id) => {
    const next = addresses.map(item => ({ ...item, isDefault: item.id === id }))
    setAddresses(next)
    setForm(prev => ({ ...prev, address: getDefaultAddress(next)?.address || prev.address }))
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
        const normalizedAddresses = normalizeAddresses(
          data.addresses || (data.address ? [{
            ...EMPTY_ADDRESS,
            id: `address-${Date.now()}`,
            address: data.address,
            type: 'Home',
            isDefault: true,
          }] : [])
        )

        setAddresses(normalizedAddresses)
        setForm({
          name: data.name || user.displayName || '',
          phone: data.phone || '',
          address: getDefaultAddress(normalizedAddresses)?.address || data.address || '',
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
      const defaultAddress = getDefaultAddress(addresses)
      const data = {
        name: form.name.trim(),
        phone: cleanPhone,
        address: defaultAddress?.address || form.address.trim(),
        addresses: addresses.length ? addresses : [],
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
      setForm(prev => ({ ...prev, phone: cleanPhone, address: data.address }))
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
      <div style={{ maxWidth: '980px', margin: '0 auto', padding: '40px 20px 80px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '32px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>My Profile</h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px', maxWidth: '720px' }}>Save your details once and use them for future bookings. Manage multiple addresses and change your password securely from one place.</p>
        </div>
        {isBlocked && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444', fontSize: '13px', padding: '12px 14px', borderRadius: '16px', marginBottom: '18px' }}>
            Your account is blocked from profile changes. You can still log in and view your details.
          </div>
        )}

        {(message || error) && (
          <div style={{ background: error ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)', border: `1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.25)'}`, color: error ? '#ef4444' : '#34d399', fontSize: '13px', padding: '12px 14px', borderRadius: '16px', marginBottom: '18px' }}>
            {error || message}
          </div>
        )}

        <div className="profile-main-grid">
          <section className="profile-panel profile-personal-panel">
            <div className="profile-panel-head">
              <div>
                <h2>Personal Details</h2>
                <p>Update your profile photo, name and contact details.</p>
              </div>
            </div>

            <div className="profile-photo-row">
              <div className="profile-photo-preview">
                {currentPhotoUrl ? (
                  <img src={currentPhotoUrl} alt="Profile" />
                ) : (
                  <div className="profile-avatar-fallback">{(user.displayName || user.email || 'U')[0].toUpperCase()}</div>
                )}
              </div>
              <div className="profile-photo-actions">
                <input
                  type="file"
                  accept={IMAGE_FILE_ACCEPT}
                  onChange={choosePhoto}
                  disabled={isBlocked || uploadingPhoto}
                  style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', inset: 0, cursor: isBlocked || uploadingPhoto ? 'not-allowed' : 'pointer' }}
                />
                <button type="button" className="btn btn-secondary profile-upload-button" disabled={isBlocked || uploadingPhoto}>
                  <Upload size={14} /> {optimizingPhoto ? 'Optimizing...' : uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                </button>
              </div>
            </div>

            <div className="profile-fields-grid">
              <div>
                <label style={L}>Full Name</label>
                <input className="input" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Your name" />
              </div>
              <div>
                <label style={L}>Phone Number</label>
                <input className="input" value={form.phone} maxLength={10} inputMode="numeric" onChange={e => update('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit number" />
              </div>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={L}>Email Address</label>
              <input className="input" value={user.email || ''} disabled />
            </div>

            <button onClick={saveProfile} disabled={isBlocked || saving || !form.name.trim()} className="btn btn-primary profile-save-button">
              <Save size={16} /> {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </section>

          <section className="profile-panel profile-addresses-panel">
            <div className="profile-panel-head">
              <div>
                <h2>Addresses</h2>
                <p>Add, edit, and manage multiple addresses.</p>
              </div>
              <button type="button" className="btn btn-secondary profile-add-address" onClick={() => openAddressModal()}>
                <Plus size={14} /> Add New
              </button>
            </div>

            {addresses.length === 0 ? (
              <div className="profile-empty-state">
                <p>No addresses added yet. Add your first address to use it for home visit bookings.</p>
                <button type="button" className="btn btn-primary" onClick={() => openAddressModal()}>
                  <Plus size={14} /> Add Address
                </button>
              </div>
            ) : (
              <div className="profile-address-list">
                {addresses.map(address => (
                  <div key={address.id} className={`profile-address-item${address.isDefault ? ' default' : ''}`}>
                    <div className="profile-address-item-head">
                      <span className="profile-address-type">{address.type}</span>
                      {address.isDefault && <span className="profile-pill profile-pill-default">Default</span>}
                    </div>
                    <p className="profile-address-text">{address.address}</p>
                    <div className="profile-address-actions">
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button type="button" className="btn btn-secondary profile-address-edit" onClick={() => openAddressModal(address)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-danger profile-address-delete" onClick={() => openDeleteConfirm(address.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="profile-panel profile-password-panel">
            <div className="profile-panel-head">
              <div>
                <h2>Password</h2>
                <p>Manage your login password securely without exposing the full form on this page.</p>
              </div>
            </div>

            {canChangePassword ? (
              <div className="profile-password-card">
                <div>
                  <strong>Change Password</strong>
                  <p>Use a strong password to keep your account secure.</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => setPasswordModalOpen(true)}>
                  Change Password
                </button>
              </div>
            ) : (
              <div className="profile-password-card profile-password-info">
                <p>This account uses Google sign-in. Password changes are managed through your Google account.</p>
              </div>
            )}
          </section>
        </div>
      </div>

      {showAddressModal && (
        <div className="modal-overlay profile-modal-overlay" onClick={closeAddressModal}>
          <div className="modal-box profile-modal-box" onClick={e => e.stopPropagation()}>
            <div className="profile-modal-head">
              <div>
                <h2>{addresses.some(item => item.id === addressForm.id) ? 'Edit Address' : 'Add Address'}</h2>
                <p>Save a delivery address for home visit bookings.</p>
              </div>
              <button type="button" onClick={closeAddressModal} aria-label="Close address form"><X size={18} /></button>
            </div>

            <div className="profile-modal-form">
              <label>Address Type</label>
              <select className="input" value={addressForm.type} onChange={e => updateAddressForm('type', e.target.value)}>
                {ADDRESS_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>

              <label>Address</label>
              <textarea className="input" rows={4} value={addressForm.address} onChange={e => updateAddressForm('address', e.target.value)} placeholder="House number, street, locality, city, PIN code" />

              <label className="profile-checkbox-row">
                <input type="checkbox" checked={addressForm.isDefault} onChange={e => updateAddressForm('isDefault', e.target.checked)} />
                <span>Set as default address</span>
              </label>
              {addressFormError && <div className="profile-form-error">{addressFormError}</div>}
              <div className="profile-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeAddressModal}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={saveAddress}>Save Address</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && (
        <div className="modal-overlay profile-modal-overlay" onClick={closeDeleteModal}>
          <div className="modal-box profile-modal-box" onClick={e => e.stopPropagation()}>
            <div className="profile-modal-head">
              <div>
                <h2>Delete Address</h2>
                <p>Are you sure you want to delete this address? This action cannot be undone.</p>
              </div>
              <button type="button" onClick={closeDeleteModal} aria-label="Close delete confirmation"><X size={18} /></button>
            </div>
            <div className="profile-modal-form">
              <div style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.6, padding: '8px 0' }}>
                Deleting this address will remove it from future bookings. You must keep at least one address in your profile.
              </div>
              <div className="profile-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeDeleteModal}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={confirmDeleteAddress}>Delete Address</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {passwordModalOpen && (
        <div className="modal-overlay profile-modal-overlay" onClick={() => setPasswordModalOpen(false)}>
          <div className="modal-box profile-modal-box" onClick={e => e.stopPropagation()}>
            <div className="profile-modal-head">
              <div>
                <h2>Change Password</h2>
                <p>Update your password securely.</p>
              </div>
              <button type="button" onClick={() => setPasswordModalOpen(false)} aria-label="Close password form"><X size={18} /></button>
            </div>
            <div className="profile-modal-form">
              <label>Current Password</label>
              <div style={{ position: 'relative' }}>
                <input className="input" type={showPasswordFields.current ? 'text' : 'password'} value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} />
                <button type="button" className="profile-password-toggle" onClick={() => togglePasswordVisibility('current')} aria-label="Toggle current password visibility">
                  {showPasswordFields.current ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <label>New Password</label>
              <div style={{ position: 'relative' }}>
                <input className="input" type={showPasswordFields.next ? 'text' : 'password'} value={passwords.next} onChange={e => setPasswords(p => ({ ...p, next: e.target.value }))} />
                <button type="button" className="profile-password-toggle" onClick={() => togglePasswordVisibility('next')} aria-label="Toggle new password visibility">
                  {showPasswordFields.next ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <label>Confirm New Password</label>
              <div style={{ position: 'relative' }}>
                <input className="input" type={showPasswordFields.confirm ? 'text' : 'password'} value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} />
                <button type="button" className="profile-password-toggle" onClick={() => togglePasswordVisibility('confirm')} aria-label="Toggle confirm password visibility">
                  {showPasswordFields.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className="profile-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setPasswordModalOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={changePassword} disabled={changingPassword || !passwords.current || !passwords.next || !passwords.confirm}>
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
        .profile-main-grid { display: grid; grid-template-columns: 2fr 1.3fr; gap: 20px; }
        .profile-panel { background: var(--card); border: 1px solid var(--border); border-radius: 24px; padding: 24px; display: flex; flex-direction: column; gap: 18px; }
        .profile-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .profile-panel-head h2 { font-size: 20px; margin: 0; color: var(--text); }
        .profile-panel-head p { margin: 0; color: var(--muted); font-size: 13px; max-width: 420px; }
        .profile-personal-panel { grid-column: 1 / span 2; }
        .profile-photo-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
        .profile-photo-preview { width: 96px; height: 96px; border-radius: 50%; overflow: hidden; border: 2px solid var(--accent); background: var(--surface); display: grid; place-items: center; }
        .profile-photo-preview img { width: 100%; height: 100%; object-fit: cover; }
        .profile-avatar-fallback { width: 100%; height: 100%; display: grid; place-items: center; font-size: 32px; color: var(--accent); font-weight: 900; }
        .profile-photo-actions { width: min(240px, 100%); position: relative; }
        .profile-upload-button { width: 100%; justify-content: center; }
        .profile-fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .profile-save-button { width: fit-content; }
        .profile-addresses-panel, .profile-password-panel { min-height: 260px; }
        .profile-address-list { display: grid; gap: 14px; }
        .profile-address-item { border: 1px solid var(--border); border-radius: 18px; padding: 18px; background: var(--surface); display: grid; gap: 12px; }
        .profile-address-item.default { box-shadow: 0 0 0 1px rgba(255, 185, 0, 0.14); }
        .profile-address-item-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .profile-address-type { font-size: 12px; font-weight: 800; color: var(--accent); letter-spacing: 0.8px; text-transform: uppercase; }
        .profile-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
        .profile-pill-default { background: rgba(255, 201, 61, 0.15); color: #b97a00; }
        .profile-address-text { margin: 0; color: var(--text); line-height: 1.6; }
        .profile-address-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
        .profile-address-default, .profile-address-edit, .profile-address-delete { min-width: 105px; }
        .profile-empty-state { display: grid; gap: 14px; padding: 18px; border: 1px dashed var(--border); border-radius: 18px; background: var(--surface); }
        .profile-password-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; border: 1px solid var(--border); border-radius: 18px; padding: 18px; background: var(--surface); }
        .profile-password-card strong { display: block; font-size: 15px; margin-bottom: 6px; }
        .profile-password-info { padding: 22px; }
        .profile-modal-overlay { z-index: 120; }
        .profile-modal-box { max-width: 520px; width: min(94vw, 520px); overflow: hidden; }
        .profile-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 18px 18px 0; }
        .profile-modal-head h2 { color: var(--text); font-size: 18px; font-weight: 900; margin: 0; }
        .profile-modal-head p { color: var(--muted); font-size: 13px; margin: 4px 0 0; }
        .profile-modal-head button { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; }
        .profile-modal-form { display: grid; gap: 14px; padding: 18px; }
        .profile-checkbox-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; font-size: 13px; color: var(--text); }
        .profile-checkbox-row input { width: 16px; height: 16px; }
        .profile-form-error { color: #ef4444; font-size: 13px; }
        .profile-modal-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 8px; }
        .profile-password-toggle { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: var(--muted); cursor: pointer; }
        @media (max-width: 980px) {
          .profile-main-grid { grid-template-columns: 1fr; }
          .profile-personal-panel { grid-column: auto; }
        }
        @media (max-width: 560px) {
          .profile-panel { padding: 18px; }
          .profile-fields-grid { grid-template-columns: 1fr; }
          .profile-address-actions { flex-direction: column; align-items: stretch; }
          .profile-address-actions button { width: 100%; }
          .profile-modal-actions { grid-template-columns: 1fr; }
          .profile-crop-actions { grid-template-columns: 1fr; }
        }
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
