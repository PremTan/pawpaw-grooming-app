import { useEffect, useMemo, useState } from 'react'
import { X, Phone, MapPin } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import petIllustration from '../assets/complete-profile-pet.png'

function hasPhone(profile) {
  return Boolean(profile?.phone?.toString().trim())
}

function hasAddress(profile) {
  if (!profile) return false
  const rawAddress = profile.address?.toString().trim()
  if (rawAddress) return true
  if (!Array.isArray(profile.addresses)) return false
  return profile.addresses.some((addr) => Boolean(addr?.address?.toString().trim()))
}

function getTodayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function loadLastShownDate(storageKey) {
  try {
    return window.localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

function saveLastShownDate(storageKey, date) {
  try {
    window.localStorage.setItem(storageKey, date)
  } catch {
    // ignore storage errors
  }
}

export default function CompleteProfilePopup() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [showPopup, setShowPopup] = useState(false)
  const [popupChecked, setPopupChecked] = useState(false)

  const storageKey = user?.uid ? `complete-profile-popup-lastshown-${user.uid}` : null

  const missingItems = useMemo(() => {
    if (!user?.uid) return []

    const missing = []

    if (!hasPhone(profile)) {
      missing.push({
        key: 'phone',
        label: 'Mobile Number',
        description: 'Add your mobile number for updates',
        icon: <Phone size={18} />,
      })
    }

    if (!hasAddress(profile)) {
      missing.push({
        key: 'address',
        label: 'Address',
        description: 'Add your address to find nearby services',
        icon: <MapPin size={18} />,
      })
    }

    return missing
  }, [user?.uid, profile])

  useEffect(() => {
    if (!user?.uid || popupChecked) return

    if (!missingItems.length) {
      setPopupChecked(true)
      return
    }

    const lastShownDate = loadLastShownDate(storageKey)
    const todayKey = getTodayKey()
    const shouldShow = lastShownDate !== todayKey

    if (shouldShow) {
      saveLastShownDate(storageKey, todayKey)
      setShowPopup(true)
    }

    setPopupChecked(true)
  }, [user?.uid, missingItems.length, popupChecked, storageKey])

  const closePopup = () => {
    setShowPopup(false)
  }

  if (!showPopup || !missingItems.length) return null

  return (
    <div className="complete-profile-overlay" onClick={closePopup}>
      <div className="complete-profile-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="complete-profile-close" onClick={closePopup} aria-label="Close profile completion popup">
          <X size={18} />
        </button>

        <div className="complete-profile-hero">
          <img src={petIllustration} alt="Complete your profile" className="complete-profile-image" />
        </div>

        <div className="complete-profile-body">
          <div className="complete-profile-title">
            <div>
              <p className="complete-profile-title-main">Complete your profile</p>
              <p className="complete-profile-title-sub">Add a few details to enjoy a seamless booking experience.</p>
            </div>
          </div>

          <div className="complete-profile-list">
            {missingItems.map((item) => (
              <div key={item.key} className="complete-profile-step">
                <div className="complete-profile-step-icon">{item.icon}</div>
                <div className="complete-profile-step-copy">
                  <p className="complete-profile-step-label">{item.label}</p>
                  <p className="complete-profile-step-description">{item.description}</p>
                </div>
                <span className="complete-profile-missing-pill">Missing</span>
              </div>
            ))}
          </div>

          <button type="button" className="complete-profile-primary" onClick={() => { navigate('/profile'); closePopup() }}>
            Complete Profile <span aria-hidden="true">→</span>
          </button>

          <div className="complete-profile-note">
            <span>⚠️</span>
            <p>Your information is safe with us and will never be shared.</p>
          </div>

          <button type="button" className="complete-profile-skip" onClick={closePopup}>Skip for now</button>
          <p className="complete-profile-footer">You can update these details anytime in your profile settings.</p>
        </div>
      </div>
    </div>
  )
}
