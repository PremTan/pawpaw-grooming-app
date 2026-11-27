import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import Cropper from 'react-easy-crop'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  MapPin,
  PawPrint,
  Pencil,
  Plus,
  Save,
  Shield,
  Trash2,
  Upload,
  User,
  X,
  Coins,
  Sparkles,
  Crown,
  Gift,
  ArrowUpRight,
  ArrowDownLeft,
  History,
} from 'lucide-react'
import { auth, db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import {
  DEFAULT_SUPERCOIN_SETTINGS,
  fetchSuperCoinSettings,
  getUserTier,
} from '../utils/superCoins'

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
      const sourceSize = Math.min(pixelCrop.width, pixelCrop.height)
      const targetSize = Math.min(sourceSize, 600)
      canvas.width = targetSize
      canvas.height = targetSize
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        sourceSize,
        sourceSize,
        0,
        0,
        targetSize,
        targetSize
      )
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('Could not crop image.'))
          return
        }
        resolve(new File([blob], `profile-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.82)
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
  const [activeTab, setActiveTab] = useState('personal') // 'personal' | 'addresses' | 'security'
  const [petCount, setPetCount] = useState(null)
  const [completedOrdersCount, setCompletedOrdersCount] = useState(0)
  const [superCoinsSettings, setSuperCoinsSettings] = useState(DEFAULT_SUPERCOIN_SETTINGS)
  const [showCoinsPassbook, setShowCoinsPassbook] = useState(false)
  const [showHowCoinsWork, setShowHowCoinsWork] = useState(false)

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

  const getDefaultAddress = (list = []) => list.find(item => item.isDefault) || list[0] || null

  const openAddressModal = (address = null) => {
    if (isBlocked) {
      setError('Your account is blocked from updating profile details.')
      return
    }
    setAddressForm(address ? { ...address } : {
      ...EMPTY_ADDRESS,
      id: `address-${Date.now()}`,
      isDefault: addresses.length === 0,
    })
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

  const persistAddresses = async (nextAddresses) => {
    if (isBlocked) {
      setError('Your account is blocked from updating profile details.')
      return false
    }
    try {
      const defaultAddress = getDefaultAddress(nextAddresses)
      await setDoc(doc(db, 'profiles', user.uid), {
        email: user.email || '',
        name: form.name.trim() || user.displayName || '',
        phone: form.phone.replace(/\D/g, '').slice(0, 10),
        address: defaultAddress?.address || '',
        addresses: nextAddresses,
        userId: user.uid,
        photoURL: profile?.photoURL || user.photoURL || '',
        isProfileComplete: Boolean(form.phone.replace(/\D/g, '').slice(0, 10)) && Boolean(defaultAddress?.address),
        updatedAt: serverTimestamp(),
      }, { merge: true })
      return true
    } catch (err) {
      setToastType('error')
      setToastMessage(err.message || 'Could not save address.')
      return false
    }
  }

  const saveAddress = async () => {
    if (!addressForm.address.trim()) {
      setAddressFormError('Please enter an address.')
      return
    }

    let next = []
    const exists = addresses.some(item => item.id === addressForm.id)
    if (exists) {
      next = addresses.map(item => item.id === addressForm.id ? { ...addressForm, address: addressForm.address.trim() } : item)
    } else {
      next = [...addresses, { ...addressForm, address: addressForm.address.trim() }]
    }

    if (addressForm.isDefault) {
      next = next.map(item => ({ ...item, isDefault: item.id === addressForm.id }))
    } else if (!next.some(item => item.isDefault) && next.length > 0) {
      next[0].isDefault = true
    }

    const saved = await persistAddresses(next)
    if (!saved) return

    setAddresses(next)
    setForm(prev => ({ ...prev, address: getDefaultAddress(next)?.address || prev.address }))
    closeAddressModal()
    setToastType('success')
    setToastMessage(exists ? 'Address updated successfully.' : 'Address added successfully.')
  }

  const openDeleteConfirm = (id) => {
    if (isBlocked) {
      setError('Your account is blocked from updating profile details.')
      return
    }
    if (addresses.length <= 1) {
      setToastType('error')
      setToastMessage('You must have at least one address.')
      return
    }
    setDeleteAddressId(id)
    setDeleteModalOpen(true)
  }

  const closeDeleteModal = () => {
    setDeleteAddressId(null)
    setDeleteModalOpen(false)
  }

  const confirmDeleteAddress = async () => {
    if (!deleteAddressId) return
    let next = addresses.filter(item => item.id !== deleteAddressId)
    if (next.length && !next.some(item => item.isDefault)) {
      next[0].isDefault = true
    }

    const saved = await persistAddresses(next)
    if (!saved) return

    setAddresses(next)
    setForm(prev => ({ ...prev, address: getDefaultAddress(next)?.address || prev.address }))
    closeDeleteModal()
    setToastType('success')
    setToastMessage('Address deleted successfully.')
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

  // Fetch pet count for the quick navigation card
  useEffect(() => {
    if (!user?.uid) return
    const fetchPetCount = async () => {
      try {
        const q = query(collection(db, 'pets'), where('userId', '==', user.uid))
        const snap = await getDocs(q)
        setPetCount(snap.size)
      } catch (err) {
        console.warn('Could not fetch pet count:', err)
      }
    }
    fetchPetCount()
  }, [user?.uid])

  // Fetch completed orders count & SuperCoin loyalty settings
  useEffect(() => {
    if (!user?.uid) return
    const fetchLoyaltyData = async () => {
      try {
        const [settingsData, groomSnap, walkSnap, boardSnap] = await Promise.all([
          fetchSuperCoinSettings(db),
          getDocs(query(collection(db, 'bookings'), where('userId', '==', user.uid), where('status', '==', 'completed'))),
          getDocs(query(collection(db, 'walkingBookings'), where('userId', '==', user.uid), where('status', '==', 'completed'))),
          getDocs(query(collection(db, 'boardingBookings'), where('userId', '==', user.uid), where('status', '==', 'completed'))),
        ])
        setSuperCoinsSettings(settingsData)
        setCompletedOrdersCount((groomSnap?.size || 0) + (walkSnap?.size || 0) + (boardSnap?.size || 0))
      } catch (err) {
        console.warn('Could not fetch SuperCoins/tier data:', err)
      }
    }
    fetchLoyaltyData()
  }, [user?.uid])

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
      const hasAddress = Boolean((defaultAddress?.address || form.address.trim()).trim())
      const hasPhone = Boolean(cleanPhone)
      const data = {
        name: form.name.trim(),
        phone: cleanPhone,
        address: defaultAddress?.address || form.address.trim(),
        addresses: addresses.length ? addresses : [],
        email: user.email,
        userId: user.uid,
        photoURL: profile?.photoURL || user.photoURL || '',
        isProfileComplete: hasPhone && hasAddress,
        updatedAt: serverTimestamp(),
      }

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
      setPasswordModalOpen(false)
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
        isProfileComplete: Boolean(form.phone.replace(/\D/g, '').slice(0, 10)) && Boolean(form.address?.trim()),
        updatedAt: serverTimestamp(),
      }, { merge: true })

      setPhotoPreview(photoURL)
      setToastType('success')
      setToastMessage('Profile photo updated successfully!')
    } catch (err) {
      setError(err.message || 'Could not upload photo.')
    }
    setOptimizingPhoto(false)
    setUploadingPhoto(false)
  }

  const isProfileComplete = Boolean(form.phone && form.name && addresses.length > 0)

  if (loading) return (
    <div className="profile-page" style={{ background: 'var(--bg)', paddingTop: 'var(--navbar-height, 98px)', minHeight: '100vh', transition: 'padding-top 0.25s ease' }}>
      <Spinner text="Loading profile..." />
    </div>
  )

  return (
    <div className="profile-page" style={{ background: 'var(--bg)', paddingTop: 'var(--navbar-height, 98px)', minHeight: '100vh', transition: 'padding-top 0.25s ease' }}>
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}

      <div className="profile-container">
        {/* 1. Hero Profile Header with Avatar & Details */}
        <section className="profile-hero-card">
          <div className="profile-hero-top">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar-circle">
                {currentPhotoUrl ? (
                  <img src={currentPhotoUrl} alt="Profile" />
                ) : (
                  <div className="profile-avatar-initials">
                    {(user.displayName || user.email || 'U')[0].toUpperCase()}
                  </div>
                )}
              </div>
              <label
                className="profile-avatar-badge"
                title="Change photo"
                style={{ cursor: isBlocked || uploadingPhoto ? 'not-allowed' : 'pointer' }}
              >
                <input
                  type="file"
                  accept={IMAGE_FILE_ACCEPT}
                  onChange={choosePhoto}
                  disabled={isBlocked || uploadingPhoto}
                  style={{ display: 'none' }}
                />
                <Upload size={13} />
              </label>
            </div>

            <div className="profile-hero-info">
              <div className="profile-hero-name-row">
                <h1 className="profile-user-name">{form.name || user.displayName || 'Paw Paw Customer'}</h1>
                {isProfileComplete ? (
                  <span className="profile-badge-pill complete">
                    <CheckCircle2 size={11} /> Complete
                  </span>
                ) : (
                  <span className="profile-badge-pill incomplete">
                    <AlertCircle size={11} /> Setup Needed
                  </span>
                )}
              </div>

              <div className="profile-hero-meta">
                <span>{user.email}</span>
                {form.phone && <span className="profile-meta-dot">•</span>}
                {form.phone && <span>+91 {form.phone}</span>}
              </div>

              {(optimizingPhoto || uploadingPhoto) && (
                <div className="profile-upload-status">
                  {optimizingPhoto ? 'Optimizing photo...' : 'Uploading photo...'}
                </div>
              )}
            </div>
          </div>

          {/* 🪙 SuperCoins & Loyalty Tier Card */}
          {superCoinsSettings.enabled && (() => {
            const userTier = getUserTier(completedOrdersCount, superCoinsSettings)
            const userCoins = Math.max(0, Number(profile?.superCoins) || 0)
            const silverOrders = superCoinsSettings.tiers?.silverThreshold || 5
            const goldOrders = superCoinsSettings.tiers?.goldThreshold || 15

            return (
              <div
                style={{
                  margin: '14px 0',
                  background: 'linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 50%, #FFFBEB 100%)',
                  border: '1.2px solid #C7D2FE',
                  borderRadius: '16px',
                  padding: '12px 14px',
                  boxShadow: '0 2px 12px rgba(99, 102, 241, 0.06)',
                  position: 'relative',
                }}
              >
                {/* Top Row: Title, Badge, and Compact Coin Pill */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                    <strong style={{ fontSize: '13.5px', color: '#1E1B4B', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {userTier.ordersAway > 0
                        ? `${userTier.ordersAway} ${userTier.ordersAway === 1 ? 'order' : 'orders'} away from ${userTier.nextTierName}`
                        : `${userTier.name} Member!`}
                    </strong>
                    <span style={{ fontSize: '10.5px', fontWeight: 800, padding: '1px 7px', borderRadius: '999px', background: userTier.id === 'gold' ? '#FEF3C7' : (userTier.id === 'silver' ? '#E0E7FF' : '#F1F5F9'), color: userTier.id === 'gold' ? '#B45309' : (userTier.id === 'silver' ? '#4338CA' : '#475569'), whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {userTier.badge}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCoinsPassbook(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#FFFFFF',
                      border: '1.2px solid #FCD34D',
                      borderRadius: '999px',
                      padding: '2px 8px',
                      boxShadow: '0 1px 4px rgba(245, 158, 11, 0.15)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    title="Click to view SuperCoins Passbook"
                  >
                    <span style={{ fontSize: '13px', lineHeight: 1 }}>🪙</span>
                    <strong style={{ fontSize: '12px', color: '#B45309', fontWeight: 900 }}>
                      {userCoins}
                    </strong>
                  </button>
                </div>

                {/* Subtitle / desc in strict single line */}
                <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  SuperCoins · Checkout Discounts · {userTier.multiplier}x Multiplier
                </p>

                {/* Visual Tier Progress Bar with Colored Milestone Dots */}
                <div style={{ position: 'relative', margin: '10px 4px 6px' }}>
                  {/* Background track */}
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      background: '#E2E8F0',
                      borderRadius: '999px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.max(4, Math.min(100, userTier.progressPercent))}%`,
                        background: 'linear-gradient(90deg, #3B82F6 0%, #6366F1 50%, #F59E0B 100%)',
                        borderRadius: '999px',
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>

                  {/* Silver Milestone Dot (at 50%) */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: completedOrdersCount >= silverOrders ? '#4F46E5' : '#CBD5E1',
                      border: '2px solid #FFFFFF',
                      boxShadow: completedOrdersCount >= silverOrders ? '0 0 4px rgba(79, 70, 229, 0.6)' : 'none',
                      zIndex: 2,
                    }}
                    title={`Silver: ${silverOrders} orders`}
                  />

                  {/* Gold Milestone Dot (at 100%) */}
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '50%',
                      transform: 'translate(50%, -50%)',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: completedOrdersCount >= goldOrders ? '#F59E0B' : '#CBD5E1',
                      border: '2px solid #FFFFFF',
                      boxShadow: completedOrdersCount >= goldOrders ? '0 0 4px rgba(245, 158, 11, 0.6)' : 'none',
                      zIndex: 2,
                    }}
                    title={`Gold: ${goldOrders} orders`}
                  />

                  {/* Active Indicator Thumb (if between 0 and 100) */}
                  {userTier.progressPercent > 4 && userTier.progressPercent < 96 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${userTier.progressPercent}%`,
                        top: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: '#3B82F6',
                        border: '2px solid #FFFFFF',
                        boxShadow: '0 0 6px rgba(59, 130, 246, 0.6)',
                        zIndex: 3,
                      }}
                    />
                  )}
                </div>

                {/* Milestones Labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>
                  <span>Completed ({completedOrdersCount})</span>
                  <span style={{ color: completedOrdersCount >= silverOrders ? '#4F46E5' : '#94A3B8' }}>
                    Silver ({silverOrders})
                  </span>
                  <span style={{ color: completedOrdersCount >= goldOrders ? '#B45309' : '#94A3B8' }}>
                    Gold ({goldOrders})
                  </span>
                </div>

                {/* Bottom Row: Single line Explore Link */}
                <div
                  onClick={() => setShowCoinsPassbook(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '7px',
                    borderTop: '1px solid rgba(226, 232, 240, 0.8)',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#4338CA',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <Sparkles size={12} color="#6366F1" style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Explore all {userTier.name} benefits & passbook
                    </span>
                  </span>
                  <ChevronRight size={13} style={{ flexShrink: 0, marginLeft: '4px' }} />
                </div>
              </div>
            )
          })()}

          {/* Quick Action Navigation Strip: My Pets & My Bookings */}
          <div className="profile-quick-nav-grid">
            <Link to="/my-pets" className="profile-quick-nav-card pets">
              <div className="profile-quick-icon pets">
                <PawPrint size={18} />
              </div>
              <div className="profile-quick-text">
                <div className="profile-quick-title">My Pets</div>
                <div className="profile-quick-sub">
                  {petCount !== null ? `${petCount} Registered` : 'View & Manage Pets'}
                </div>
              </div>
              <ChevronRight size={16} className="profile-quick-arrow" />
            </Link>

            <Link to="/my-bookings" className="profile-quick-nav-card bookings">
              <div className="profile-quick-icon bookings">
                <Calendar size={18} />
              </div>
              <div className="profile-quick-text">
                <div className="profile-quick-title">My Bookings</div>
                <div className="profile-quick-sub">View</div>
              </div>
              <ChevronRight size={16} className="profile-quick-arrow" />
            </Link>
          </div>
        </section>

        {isBlocked && (
          <div className="profile-alert danger">
            Your account is blocked from updating profile details. You can still view details and past bookings.
          </div>
        )}

        {(message || error) && (
          <div className={`profile-alert ${error ? 'danger' : 'success'}`}>
            {error || message}
          </div>
        )}

        {/* 2. Compact Segmented Navigation Tabs */}
        <div className="profile-tab-bar">
          <button
            type="button"
            className={`profile-tab-item ${activeTab === 'personal' ? 'active' : ''}`}
            onClick={() => setActiveTab('personal')}
          >
            <User size={15} />
            <span>Personal</span>
          </button>

          <button
            type="button"
            className={`profile-tab-item ${activeTab === 'addresses' ? 'active' : ''}`}
            onClick={() => setActiveTab('addresses')}
          >
            <MapPin size={15} />
            <span>Addresses</span>
            {addresses.length > 0 && (
              <span className="profile-tab-badge">{addresses.length}</span>
            )}
          </button>

          <button
            type="button"
            className={`profile-tab-item ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <Shield size={15} />
            <span>Security</span>
          </button>
        </div>

        {/* 3. Tab Contents */}
        <div className="profile-tab-content">
          {/* TAB 1: PERSONAL DETAILS */}
          {activeTab === 'personal' && (
            <div className="profile-content-card">
              <div className="profile-card-header">
                <div>
                  <h2>Personal Information</h2>
                  <p>Your details are used for booking confirmations and pet care updates.</p>
                </div>
              </div>

              <div className="profile-form-grid">
                <div className="profile-form-group">
                  <label>Full Name</label>
                  <input
                    className="input"
                    value={form.name}
                    onChange={e => update('name', e.target.value)}
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="profile-form-group">
                  <label>Phone Number</label>
                  <div className="profile-phone-input-wrap">
                    <span className="profile-phone-prefix">+91</span>
                    <input
                      className="input profile-phone-input"
                      value={form.phone}
                      maxLength={10}
                      inputMode="numeric"
                      onChange={e => update('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit mobile number"
                    />
                  </div>
                </div>

                <div className="profile-form-group full-width">
                  <label>Email Address</label>
                  <input
                    className="input disabled"
                    value={user.email || ''}
                    disabled
                  />
                  <span className="profile-field-hint">Email is linked to your login account and cannot be changed here.</span>
                </div>
              </div>

              <div className="profile-save-footer">
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={isBlocked || saving || !form.name.trim()}
                  className="btn btn-primary profile-save-btn"
                >
                  <Save size={16} />
                  <span>{saving ? 'Saving Changes...' : 'Save Profile Details'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: ADDRESSES */}
          {activeTab === 'addresses' && (
            <div className="profile-content-card">
              <div className="profile-card-header address-header">
                <div>
                  <h2>Saved Addresses</h2>
                  <p>Addresses used for home grooming and pickup & drop services.</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary profile-add-address-btn"
                  onClick={() => openAddressModal()}
                >
                  <Plus size={14} /> Add Address
                </button>
              </div>

              {addresses.length === 0 ? (
                <div className="profile-empty-card">
                  <div className="profile-empty-icon">
                    <MapPin size={24} />
                  </div>
                  <h3>No addresses saved yet</h3>
                  <p>Add your home or office address to book home visit appointments faster.</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => openAddressModal()}
                  >
                    <Plus size={14} /> Add Your First Address
                  </button>
                </div>
              ) : (
                <div className="profile-address-grid">
                  {addresses.map(address => (
                    <div
                      key={address.id}
                      className={`profile-address-card ${address.isDefault ? 'default' : ''}`}
                    >
                      <div className="profile-address-card-top">
                        <div className="profile-address-tag-row">
                          <span className="profile-address-type-pill">{address.type}</span>
                          {address.isDefault && (
                            <span className="profile-default-tag">Default</span>
                          )}
                        </div>
                        <div className="profile-address-btn-row">
                          <button
                            type="button"
                            className="profile-icon-btn edit"
                            onClick={() => openAddressModal(address)}
                            aria-label="Edit address"
                            title="Edit address"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="profile-icon-btn delete"
                            onClick={() => openDeleteConfirm(address.id)}
                            aria-label="Delete address"
                            title="Delete address"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <p className="profile-address-line">{address.address}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SECURITY & PASSWORD */}
          {activeTab === 'security' && (
            <div className="profile-content-card">
              <div className="profile-card-header">
                <div>
                  <h2>Account Security</h2>
                  <p>Manage your login method and account password securely.</p>
                </div>
              </div>

              {canChangePassword ? (
                <div className="profile-security-box">
                  <div className="profile-security-icon-box">
                    <Lock size={22} />
                  </div>
                  <div className="profile-security-details">
                    <h3>Account Password</h3>
                    <p>Change your password periodically to keep your account safe.</p>
                    <button
                      type="button"
                      className="btn btn-secondary profile-change-pw-btn"
                      onClick={() => setPasswordModalOpen(true)}
                    >
                      Change Password
                    </button>
                  </div>
                </div>
              ) : (
                <div className="profile-security-box google">
                  <div className="profile-security-icon-box google">
                    <Shield size={22} />
                  </div>
                  <div className="profile-security-details">
                    <h3>Google Sign-In Active</h3>
                    <p>You sign in using your Google Account ({user.email}). Password changes are managed directly via Google.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Address Modal */}
      {showAddressModal && (
        <div className="modal-overlay profile-modal-overlay" onClick={closeAddressModal}>
          <div className="modal-box profile-modal-box" onClick={e => e.stopPropagation()}>
            <div className="profile-modal-head">
              <div>
                <h2>{addresses.some(item => item.id === addressForm.id) ? 'Edit Address' : 'Add New Address'}</h2>
                <p>Save address for home visit bookings and pet services.</p>
              </div>
              <button type="button" onClick={closeAddressModal} aria-label="Close address form"><X size={18} /></button>
            </div>

            <div className="profile-modal-form">
              <label>Address Type</label>
              <select className="input" value={addressForm.type} onChange={e => updateAddressForm('type', e.target.value)}>
                {ADDRESS_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>

              <label>Full Address</label>
              <textarea
                className="input"
                rows={3}
                value={addressForm.address}
                onChange={e => updateAddressForm('address', e.target.value)}
                placeholder="House / Flat No., Society / Building, Landmark, City & PIN code"
              />

              <label className="profile-checkbox-row">
                <input
                  type="checkbox"
                  checked={addressForm.isDefault}
                  onChange={e => updateAddressForm('isDefault', e.target.checked)}
                />
                <span>Set as default address for bookings</span>
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

      {/* Delete Address Modal */}
      {deleteModalOpen && (
        <div className="modal-overlay profile-modal-overlay" onClick={closeDeleteModal}>
          <div className="modal-box profile-modal-box" onClick={e => e.stopPropagation()}>
            <div className="profile-modal-head">
              <div>
                <h2>Delete Address</h2>
                <p>Are you sure you want to remove this address?</p>
              </div>
              <button type="button" onClick={closeDeleteModal} aria-label="Close delete confirmation"><X size={18} /></button>
            </div>
            <div className="profile-modal-form">
              <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                This address will be removed from future bookings. You must keep at least one address in your profile.
              </div>
              <div className="profile-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeDeleteModal}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={confirmDeleteAddress}>Delete Address</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {passwordModalOpen && (
        <div className="modal-overlay profile-modal-overlay" onClick={() => setPasswordModalOpen(false)}>
          <div className="modal-box profile-modal-box" onClick={e => e.stopPropagation()}>
            <div className="profile-modal-head">
              <div>
                <h2>Change Password</h2>
                <p>Enter your current password and choose a new one.</p>
              </div>
              <button type="button" onClick={() => setPasswordModalOpen(false)} aria-label="Close password form"><X size={18} /></button>
            </div>
            <div className="profile-modal-form">
              <label>Current Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPasswordFields.current ? 'text' : 'password'}
                  value={passwords.current}
                  onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))}
                />
                <button
                  type="button"
                  className="profile-password-toggle"
                  onClick={() => togglePasswordVisibility('current')}
                  aria-label="Toggle current password visibility"
                >
                  {showPasswordFields.current ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <label>New Password (min 6 characters)</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPasswordFields.next ? 'text' : 'password'}
                  value={passwords.next}
                  onChange={e => setPasswords(p => ({ ...p, next: e.target.value }))}
                />
                <button
                  type="button"
                  className="profile-password-toggle"
                  onClick={() => togglePasswordVisibility('next')}
                  aria-label="Toggle new password visibility"
                >
                  {showPasswordFields.next ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <label>Confirm New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPasswordFields.confirm ? 'text' : 'password'}
                  value={passwords.confirm}
                  onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                />
                <button
                  type="button"
                  className="profile-password-toggle"
                  onClick={() => togglePasswordVisibility('confirm')}
                  aria-label="Toggle confirm password visibility"
                >
                  {showPasswordFields.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className="profile-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setPasswordModalOpen(false)}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={changePassword}
                  disabled={changingPassword || !passwords.current || !passwords.next || !passwords.confirm}
                >
                  {changingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cropper Modal */}
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

      {/* 🪙 SuperCoins Passbook & Tier Benefits Modal */}
      {showCoinsPassbook && (() => {
        const userTier = getUserTier(completedOrdersCount, superCoinsSettings)
        const userCoins = Math.max(0, Number(profile?.superCoins) || 0)
        const historyList = Array.isArray(profile?.superCoinHistory) ? [...profile.superCoinHistory].reverse() : []

        return (
          <div className="modal-overlay profile-modal-overlay" onClick={() => setShowCoinsPassbook(false)}>
            <div
              className="modal-box profile-modal-box"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '480px', borderRadius: '24px', overflow: 'hidden' }}
            >
              {/* Head */}
              <div
                style={{
                  padding: '14px 18px',
                  background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)',
                  color: '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🪙</span>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#fff' }}>
                      Paw Paw SuperCoins
                    </h2>
                    <span style={{ fontSize: '11px', color: '#C7D2FE' }}>
                      Loyalty Rewards & Passbook
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCoinsPassbook(false)}
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                  aria-label="Close SuperCoins passbook"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '14px 16px', maxHeight: '72vh', overflowY: 'auto' }}>
                {/* Compact Balance Card */}
                <div
                  style={{
                    background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                    border: '1.2px solid #FCD34D',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    marginBottom: '12px',
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.6px', display: 'block' }}>
                      Available Balance
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '2px 0 1px' }}>
                      <span style={{ fontSize: '20px', lineHeight: 1 }}>🪙</span>
                      <strong style={{ fontSize: '22px', fontWeight: 900, color: '#78350F', lineHeight: 1 }}>
                        {userCoins}
                      </strong>
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#B45309', marginLeft: '4px' }}>
                        (₹{userCoins * (superCoinsSettings.coinValueInRupees || 1)})
                      </span>
                    </div>
                    <span style={{ fontSize: '10.5px', color: '#92400E' }}>
                      Applicable for booking discounts
                    </span>
                  </div>

                  <span style={{ background: '#fff', border: '1px solid #FCD34D', borderRadius: '999px', padding: '3px 9px', fontSize: '10.5px', fontWeight: 800, color: '#92400E', flexShrink: 0 }}>
                    {userTier.badge} · {userTier.multiplier}x
                  </span>
                </div>

                {/* Clickable Label for How SuperCoins Work (collapsible) */}
                <div style={{ marginBottom: '14px' }}>
                  <button
                    type="button"
                    onClick={() => setShowHowCoinsWork(p => !p)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px 2px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#B45309',
                    }}
                  >
                    <span style={{ fontSize: '13px', lineHeight: 1 }}>💡</span>
                    <span>How SuperCoins Work</span>
                    {showHowCoinsWork ? <ChevronUp size={14} color="#B45309" /> : <ChevronDown size={14} color="#B45309" />}
                  </button>

                  {showHowCoinsWork && (
                    <div
                      style={{
                        marginTop: '6px',
                        background: 'var(--surface, #F8FAFC)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        fontSize: '11px',
                        boxSizing: 'border-box',
                        width: '100%',
                      }}
                    >
                      <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--muted)', display: 'grid', gap: '4px', lineHeight: 1.4 }}>
                        <li>
                          <strong>Earn {superCoinsSettings.earnPercentage}%:</strong> Automatically after each completed service.
                        </li>
                        <li>
                          <strong>Redeem:</strong> Apply at checkout to save up to <strong>{superCoinsSettings.maxRedeemPercentage}%</strong> (1 coin = ₹1).
                        </li>
                        <li>
                          <strong>Tier Boost:</strong> Silver & Gold members earn up to <strong>{superCoinsSettings.tiers?.goldMultiplier || 1.5}x</strong> extra.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>

                {/* Passbook History */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '12.5px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <History size={14} color="var(--accent)" />
                      Passbook History
                    </strong>
                    <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 600 }}>
                      {historyList.length} {historyList.length === 1 ? 'Entry' : 'Entries'}
                    </span>
                  </div>

                  {historyList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 10px', background: 'var(--surface)', borderRadius: '10px', border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: '11px' }}>
                      No coin transactions yet. Complete bookings to earn SuperCoins! 🐾
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {historyList.map((tx, idx) => {
                        const isCredit = tx.type === 'credit'
                        const dateStr = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
                        const timeStr = tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''

                        return (
                          <div
                            key={tx.id || idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 10px',
                              borderRadius: '10px',
                              background: 'var(--card)',
                              border: '1px solid var(--border)',
                              fontSize: '11.5px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div
                                style={{
                                  width: '26px',
                                  height: '26px',
                                  borderRadius: '50%',
                                  background: isCredit ? '#DCFCE7' : '#FEE2E2',
                                  color: isCredit ? '#15803D' : '#DC2626',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                {isCredit ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                              </div>
                              <div>
                                <strong style={{ fontSize: '11.5px', color: 'var(--text)', display: 'block' }}>
                                  {tx.description || (isCredit ? 'Coins Earned' : 'Coins Redeemed')}
                                </strong>
                                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                                  {dateStr} {timeStr ? `• ${timeStr}` : ''}
                                </span>
                              </div>
                            </div>

                            <strong
                              style={{
                                fontSize: '12.5px',
                                fontWeight: 800,
                                color: isCredit ? '#16A34A' : '#DC2626',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {isCredit ? `+${tx.coins}` : `-${tx.coins}`}
                            </strong>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

<style>{`
        .profile-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px 16px 80px;
        }

        /* 1. Hero Card */
        .profile-hero-card {
          background: linear-gradient(135deg, rgba(192, 136, 32, 0.08), rgba(192, 136, 32, 0.02)), var(--card);
          border: 1px solid var(--accent-border, rgba(192, 136, 32, 0.25));
          border-radius: 20px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
        }

        .profile-hero-top {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .profile-avatar-wrap {
          position: relative;
          flex-shrink: 0;
        }

        .profile-avatar-circle {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          overflow: hidden;
          border: 2.5px solid var(--accent, #c08820);
          background: var(--surface);
          box-shadow: 0 4px 12px rgba(192, 136, 32, 0.2);
        }

        .profile-avatar-circle img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .profile-avatar-initials {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          font-weight: 800;
          color: var(--accent, #c08820);
          background: linear-gradient(135deg, rgba(192, 136, 32, 0.15), rgba(192, 136, 32, 0.05));
        }

        .profile-avatar-badge {
          position: absolute;
          bottom: -2px;
          right: -2px;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: var(--accent, #c08820);
          color: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--card);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
          transition: transform 0.15s ease;
        }

        .profile-avatar-badge:hover {
          transform: scale(1.1);
        }

        .profile-hero-info {
          min-width: 0;
          flex: 1;
        }

        .profile-hero-name-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .profile-user-name {
          font-size: 20px;
          font-weight: 800;
          color: var(--text);
          margin: 0;
          line-height: 1.25;
        }

        .profile-badge-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10.5px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 999px;
        }

        .profile-badge-pill.complete {
          background: rgba(34, 197, 94, 0.12);
          color: #16a34a;
          border: 1px solid rgba(34, 197, 94, 0.25);
        }

        .profile-badge-pill.incomplete {
          background: rgba(245, 158, 11, 0.12);
          color: #d97706;
          border: 1px solid rgba(245, 158, 11, 0.25);
        }

        .profile-hero-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12.5px;
          color: var(--muted);
          margin-top: 4px;
          flex-wrap: wrap;
        }

        .profile-meta-dot {
          opacity: 0.5;
        }

        .profile-upload-status {
          font-size: 11px;
          color: var(--accent, #c08820);
          font-weight: 600;
          margin-top: 4px;
        }

        /* Quick Navigation Row (My Pets & My Bookings) */
        .profile-quick-nav-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--border);
        }

        .profile-quick-nav-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          text-decoration: none;
          color: var(--text);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .profile-quick-nav-card:hover {
          border-color: var(--accent, #c08820);
          transform: translateY(-1.5px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .profile-quick-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .profile-quick-icon.pets {
          background: rgba(192, 136, 32, 0.12);
          color: var(--accent, #c08820);
        }

        .profile-quick-icon.bookings {
          background: rgba(59, 130, 246, 0.12);
          color: #2563eb;
        }

        .profile-quick-text {
          flex: 1;
          min-width: 0;
        }

        .profile-quick-title {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
        }

        .profile-quick-sub {
          font-size: 11px;
          color: var(--muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }

        .profile-quick-arrow {
          color: var(--muted);
          flex-shrink: 0;
          opacity: 0.6;
        }

        /* 2. Tab Bar */
        .profile-tab-bar {
          display: flex;
          gap: 6px;
          padding: 4px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          margin-bottom: 18px;
        }

        .profile-tab-item {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 9px 12px;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .profile-tab-item:hover {
          color: var(--text);
        }

        .profile-tab-item.active {
          background: var(--card);
          color: var(--accent, #c08820);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          font-weight: 700;
        }

        .profile-tab-badge {
          background: var(--accent, #c08820);
          color: #000;
          font-size: 10.5px;
          font-weight: 800;
          border-radius: 999px;
          padding: 1px 6px;
        }

        /* 3. Tab Content Card */
        .profile-content-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 22px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
          animation: profileFadeIn 0.2s ease-out;
        }

        @keyframes profileFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .profile-card-header {
          margin-bottom: 20px;
        }

        .profile-card-header.address-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .profile-card-header h2 {
          font-size: 18px;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 4px;
        }

        .profile-card-header p {
          font-size: 13px;
          color: var(--muted);
          margin: 0;
          line-height: 1.45;
        }

        .profile-add-address-btn {
          white-space: nowrap;
          padding: 8px 14px;
          font-size: 12.5px;
        }

        /* Forms */
        .profile-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }

        .profile-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .profile-form-group.full-width {
          grid-column: 1 / -1;
        }

        .profile-form-group label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--muted);
        }

        .profile-field-hint {
          font-size: 11.5px;
          color: var(--muted);
          margin-top: 2px;
        }

        .profile-phone-input-wrap {
          display: flex;
          align-items: center;
          position: relative;
        }

        .profile-phone-prefix {
          position: absolute;
          left: 14px;
          font-size: 13.5px;
          font-weight: 600;
          color: var(--muted);
          pointer-events: none;
        }

        .profile-phone-input {
          padding-left: 48px !important;
        }

        .profile-save-footer {
          padding-top: 8px;
          border-top: 1px solid var(--border);
        }

        .profile-save-btn {
          width: 100%;
          justify-content: center;
          padding: 12px;
          font-size: 13.5px;
        }

        /* Addresses */
        .profile-address-grid {
          display: grid;
          gap: 12px;
        }

        .profile-address-card {
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 14px 16px;
          background: var(--surface);
          transition: border-color 0.15s ease;
        }

        .profile-address-card.default {
          border-color: var(--accent, #c08820);
          background: linear-gradient(135deg, rgba(192, 136, 32, 0.05), transparent);
        }

        .profile-address-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .profile-address-tag-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .profile-address-type-pill {
          font-size: 11px;
          font-weight: 800;
          color: var(--accent, #c08820);
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        .profile-default-tag {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 999px;
          background: rgba(192, 136, 32, 0.15);
          color: var(--accent, #c08820);
        }

        .profile-address-btn-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .profile-icon-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--card);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .profile-icon-btn.edit {
          color: var(--accent, #c08820);
        }

        .profile-icon-btn.delete {
          color: #ef4444;
        }

        .profile-icon-btn:hover {
          border-color: currentColor;
          transform: translateY(-1px);
        }

        .profile-address-line {
          font-size: 13.5px;
          color: var(--text);
          line-height: 1.5;
          margin: 0;
        }

        .profile-empty-card {
          padding: 36px 16px;
          text-align: center;
          border: 1px dashed var(--border);
          border-radius: 16px;
          background: var(--surface);
        }

        .profile-empty-icon {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(192, 136, 32, 0.1);
          color: var(--accent, #c08820);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px;
        }

        .profile-empty-card h3 {
          font-size: 16px;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 6px;
        }

        .profile-empty-card p {
          font-size: 13px;
          color: var(--muted);
          max-width: 380px;
          margin: 0 auto 18px;
          line-height: 1.45;
        }

        /* Security */
        .profile-security-box {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: var(--surface);
        }

        .profile-security-icon-box {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(192, 136, 32, 0.1);
          color: var(--accent, #c08820);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .profile-security-icon-box.google {
          background: rgba(59, 130, 246, 0.1);
          color: #2563eb;
        }

        .profile-security-details h3 {
          font-size: 15px;
          font-weight: 700;
          margin: 0 0 4px;
          color: var(--text);
        }

        .profile-security-details p {
          font-size: 12.5px;
          color: var(--muted);
          margin: 0 0 12px;
          line-height: 1.4;
        }

        .profile-change-pw-btn {
          font-size: 12.5px;
          padding: 7px 14px;
        }

        /* Alerts */
        .profile-alert {
          padding: 11px 14px;
          border-radius: 12px;
          font-size: 13px;
          margin-bottom: 16px;
          line-height: 1.45;
        }

        .profile-alert.danger {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #ef4444;
        }

        .profile-alert.success {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.25);
          color: #16a34a;
        }

        /* Modals */
        .profile-modal-overlay { z-index: 120; }
        .profile-modal-box { max-width: 500px; width: min(94vw, 500px); border-radius: 20px; overflow: hidden; }
        .profile-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 18px 20px 0; }
        .profile-modal-head h2 { color: var(--text); font-size: 18px; font-weight: 800; margin: 0; }
        .profile-modal-head p { color: var(--muted); font-size: 12.5px; margin: 4px 0 0; }
        .profile-modal-head button { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; }
        .profile-modal-form { display: grid; gap: 12px; padding: 18px 20px 20px; }
        .profile-modal-form label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); }
        .profile-checkbox-row { display: flex; align-items: center; gap: 10px; margin-top: 6px; font-size: 13px; color: var(--text); cursor: pointer; text-transform: none !important; font-weight: 500 !important; }
        .profile-checkbox-row input { width: 16px; height: 16px; accent-color: var(--accent, #c08820); }
        .profile-form-error { color: #ef4444; font-size: 12.5px; }
        .profile-modal-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding-top: 8px; }
        .profile-password-toggle { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: var(--muted); cursor: pointer; }

        /* Cropper */
        .profile-crop-overlay { z-index: 130; }
        .profile-crop-modal { max-width: 520px; border-radius: 20px; overflow: hidden; }
        .profile-crop-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 18px 20px 0; }
        .profile-crop-head h2 { color: var(--text); font-size: 18px; font-weight: 800; margin: 0; }
        .profile-crop-head p { color: var(--muted); font-size: 12px; margin-top: 4px; }
        .profile-crop-head button { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; }
        .profile-crop-stage { position: relative; width: 100%; height: min(58vh, 380px); min-height: 280px; margin-top: 14px; background: #111; }
        .profile-crop-zoom { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center; padding: 14px 20px 0; color: var(--muted); font-size: 12px; font-weight: 700; }
        .profile-crop-zoom input { accent-color: var(--accent); }
        .profile-crop-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 14px 20px 18px; }

        /* Mobile specific enhancements */
        @media (max-width: 580px) {
          .profile-container {
            padding: 14px 12px 80px;
          }
          .profile-hero-card {
            padding: 16px 14px;
            border-radius: 16px;
            margin-bottom: 14px;
          }
          .profile-avatar-circle {
            width: 62px;
            height: 62px;
          }
          .profile-user-name {
            font-size: 18px;
          }
          .profile-hero-meta {
            font-size: 12px;
          }
          .profile-quick-nav-grid {
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            padding-top: 12px;
            margin-top: 12px;
          }
          .profile-quick-nav-card {
            padding: 8px 10px;
            gap: 8px;
          }
          .profile-quick-icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
          }
          .profile-quick-title {
            font-size: 12.5px;
          }
          .profile-quick-sub {
            font-size: 10.5px;
          }
          .profile-quick-arrow {
            display: none;
          }
          .profile-tab-bar {
            margin-bottom: 14px;
          }
          .profile-tab-item {
            font-size: 12px;
            padding: 8px 6px;
            gap: 5px;
          }
          .profile-content-card {
            padding: 16px 14px;
            border-radius: 16px;
          }
          .profile-form-grid {
            grid-template-columns: 1fr;
            gap: 12px;
            margin-bottom: 16px;
          }
          .profile-card-header.address-header {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .profile-add-address-btn {
            width: 100%;
            justify-content: center;
          }
          .profile-security-box {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
          .profile-change-pw-btn {
            width: 100%;
          }
          .profile-modal-actions,
          .profile-crop-actions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div >
  )
}
