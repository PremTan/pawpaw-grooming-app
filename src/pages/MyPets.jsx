import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Cropper from 'react-easy-crop'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import {
  Cake,
  Calendar,
  Camera,
  Edit3,
  ImagePlus,
  PawPrint,
  Plus,
  Save,
  Trash2,
  Weight,
  X,
} from 'lucide-react'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import { CAT_BREEDS, DOG_BREEDS, PET_TYPES } from '../utils/services'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'

const EMPTY_PET = {
  name: '',
  type: 'Dog',
  breed: '',
  dob: '',
  weight: '',
  gender: '',
  notes: '',
  photoUrl: '',
}

function getAge(dob) {
  if (!dob) return ''
  const birthday = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(birthday.getTime())) return ''

  const today = new Date()
  let years = today.getFullYear() - birthday.getFullYear()
  let months = today.getMonth() - birthday.getMonth()

  if (today.getDate() < birthday.getDate()) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }

  if (years > 0) return `${years} yr${years > 1 ? 's' : ''}${months ? ` ${months} mo` : ''}`
  return `${Math.max(months, 0)} mo`
}

function petSummary(pet) {
  return [pet.type, pet.breed].filter(Boolean).join(' - ') || 'Pet profile'
}

function getCroppedImg(imageSrc, pixelCrop) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
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
        resolve(new File([blob], `pet-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.92)
    }
    image.onerror = reject
    image.src = imageSrc
  })
}

export default function MyPets() {
  const { user, isBlocked } = useAuth()
  const [pets, setPets] = useState([])
  const [form, setForm] = useState(EMPTY_PET)
  const [selectedId, setSelectedId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [optimizingPhoto, setOptimizingPhoto] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [cropData, setCropData] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const selectedPet = useMemo(
    () => pets.find(pet => pet.id === selectedId) || null,
    [pets, selectedId]
  )

  const breedOptions = useMemo(() => {
    if (form.type === 'Dog') return DOG_BREEDS
    if (form.type === 'Cat') return CAT_BREEDS
    return []
  }, [form.type])

  useEffect(() => {
    fetchPets()
  }, [user])

  useEffect(() => {
    if (!toastMessage) return
    const t = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [toastMessage])

  // Prevent background scrolling while any popup or modal is open
  useEffect(() => {
    const isAnyModalOpen = Boolean(showDetailModal || showForm || cropData || deleteTarget)
    if (isAnyModalOpen) {
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prevOverflow
      }
    }
  }, [showDetailModal, showForm, cropData, deleteTarget])

  // Keyboard navigation: Close active modal on Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (cropData) {
          cancelCrop()
        } else if (showForm) {
          closeForm()
        } else if (showDetailModal) {
          closeDetails()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cropData, showForm, showDetailModal])

  async function fetchPets() {
    setLoading(true)
    try {
      const q = query(collection(db, 'pets'), where('userId', '==', user.uid))
      const snap = await getDocs(q)
      const results = snap.docs.map(item => ({ id: item.id, ...item.data() }))
      results.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      setPets(results)
      setError('')
    } catch (err) {
      setError(err.message || 'Could not load pets.')
    }
    setLoading(false)
  }

  const update = (key, value) => {
    setForm(prev => ({
      ...prev,
      [key]: value,
      ...(key === 'type' ? { breed: '' } : {}),
    }))
  }

  const openAddForm = () => {
    if (isBlocked) {
      setError('Your account is blocked from adding pet profiles.')
      return
    }
    setForm(EMPTY_PET)
    setEditingId('')
    setPhotoFile(null)
    setPhotoPreview('')
    setShowDetailModal(false)
    setShowForm(true)
    setMessage('')
    setError('')
    setToastMessage('')
  }

  const closeForm = () => {
    setForm(EMPTY_PET)
    setEditingId('')
    setPhotoFile(null)
    setPhotoPreview('')
    setShowForm(false)
  }

  const closeDetails = () => {
    setShowDetailModal(false)
    setSelectedId('')
  }

  const startEdit = (pet) => {
    if (isBlocked) {
      setError('Your account is blocked from editing pet profiles.')
      return
    }
    setSelectedId(pet.id)
    setForm({
      name: pet.name || '',
      type: pet.type || 'Dog',
      breed: pet.breed || '',
      dob: pet.dob || '',
      weight: pet.weight || '',
      gender: pet.gender || '',
      notes: pet.notes || '',
      photoUrl: pet.photoUrl || '',
    })
    setPhotoFile(null)
    setPhotoPreview(pet.photoUrl || '')
    setEditingId(pet.id)
    setShowDetailModal(false)
    setShowForm(true)
    setMessage('')
    setError('')
    setToastMessage('')
  }

  const choosePhoto = (event) => {
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
      setError('')
    }
    reader.readAsDataURL(file)
  }

  const onCropComplete = useCallback((_, nextPixels) => {
    setCroppedAreaPixels(nextPixels)
  }, [])

  const confirmCrop = async () => {
    if (!cropData || !croppedAreaPixels) return
    try {
      const croppedFile = await getCroppedImg(cropData, croppedAreaPixels)
      setPhotoFile(croppedFile)
      setPhotoPreview(URL.createObjectURL(croppedFile))
      setCropData(null)
    } catch (err) {
      setError(err.message || 'Could not crop image.')
    }
  }

  const cancelCrop = () => {
    setCropData(null)
    setError('')
  }

  const removePhoto = () => {
    setPhotoFile(null)
    setPhotoPreview('')
    update('photoUrl', '')
  }

  const savePet = async (event) => {
    event.preventDefault()
    if (isBlocked) {
      setError('Your account is blocked from saving pet profiles.')
      return
    }
    if (!form.name.trim()) return

    setSaving(true)
    setMessage('')
    setError('')

    try {
      const uploadedPhotoUrl = photoFile ? await uploadToCloudinary(photoFile, {
        onOptimizeStart: () => setOptimizingPhoto(true),
        onOptimizeEnd: () => setOptimizingPhoto(false),
      }) : form.photoUrl.trim()
      const cleanPet = {
        name: form.name.trim(),
        type: form.type,
        breed: form.breed.trim(),
        dob: form.dob,
        weight: form.weight.toString().trim(),
        gender: form.gender,
        notes: form.notes.trim(),
        photoUrl: uploadedPhotoUrl,
        userId: user.uid,
        userEmail: user.email || '',
        updatedAt: serverTimestamp(),
      }

      if (editingId) {
        await updateDoc(doc(db, 'pets', editingId), cleanPet)
        setToastType('success')
        setToastMessage('Pet profile updated successfully.')
      } else {
        await addDoc(collection(db, 'pets'), {
          ...cleanPet,
          createdAt: serverTimestamp(),
        })
        setToastType('success')
        setToastMessage('Pet profile added successfully.')
      }

      const keepSelectedId = editingId
      closeForm()
      await fetchPets()
      setSelectedId(keepSelectedId)
    } catch (err) {
      setError(err.message || 'Could not save pet.')
    }
    setOptimizingPhoto(false)
    setSaving(false)
  }

  const removePet = async (pet) => {
    if (isBlocked) {
      setError('Your account is blocked from deleting pet profiles.')
      return
    }
    setMessage('')
    setError('')
    try {
      await deleteDoc(doc(db, 'pets', pet.id))
      setPets(prev => prev.filter(item => item.id !== pet.id))
      if (editingId === pet.id) closeForm()
      if (selectedId === pet.id) {
        setSelectedId('')
        setShowDetailModal(false)
      }
      setDeleteTarget(null)
      setToastType('success')
      setToastMessage('Pet profile deleted successfully.')
    } catch (err) {
      setToastType('error')
      setToastMessage(err.message || 'Could not delete pet.')
    }
  }

  const L = {
    display: 'block',
    marginBottom: '6px',
    color: 'var(--muted)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
  }

  const petForm = (
    <form onSubmit={savePet} className="pet-modal-form">
      {/* Header */}
      <div className="pet-modal-header">
        <div>
          <div className="pet-modal-badge">
            {editingId ? 'UPDATE PROFILE' : 'NEW PROFILE'}
          </div>
          <h2 className="pet-modal-title">
            {editingId ? 'Edit Pet Details' : 'Add Pet'}
          </h2>
        </div>
        <button
          type="button"
          onClick={closeForm}
          className="pet-modal-close"
          aria-label="Close form"
        >
          <X size={20} />
        </button>
      </div>

      {/* Form Content Area */}
      <div className="pet-modal-body">
        {/* Compact Pet Photo Section */}
        <div className="pet-edit-photo-card">
          <label className="pet-edit-photo-preview" title="Click to upload photo">
            {photoPreview ? (
              <img src={photoPreview} alt="Pet preview" />
            ) : (
              <div className="pet-edit-photo-placeholder">
                <Camera size={22} />
                <span>Add Photo</span>
              </div>
            )}
            <input
              type="file"
              accept={IMAGE_FILE_ACCEPT}
              onChange={choosePhoto}
              className="pet-file-input"
            />
          </label>
          <div className="pet-edit-photo-controls">
            <label className="pet-photo-upload-btn">
              <Camera size={14} />
              <span>{photoPreview ? 'Change Photo' : 'Upload Photo'}</span>
              <input
                type="file"
                accept={IMAGE_FILE_ACCEPT}
                onChange={choosePhoto}
                className="pet-file-input"
              />
            </label>
            {photoPreview && (
              <button
                type="button"
                onClick={removePhoto}
                className="pet-photo-remove-btn"
              >
                <Trash2 size={13} />
                <span>Remove Photo</span>
              </button>
            )}
            <span className="pet-edit-photo-hint">JPG, PNG or WebP</span>
          </div>
        </div>

        {/* Form fields in logical order */}
        <div className="pet-edit-fields">
          {/* 1. Pet Name */}
          <div className="pet-form-field">
            <label className="pet-form-label">Pet Name *</label>
            <input
              className="input pet-form-input"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="e.g. Bruno"
              required
            />
          </div>

          {/* 2 & 3. Type and Breed */}
          <div className="pet-form-row">
            <div className="pet-form-field">
              <label className="pet-form-label">Type</label>
              <select
                className="input pet-form-input"
                value={form.type}
                onChange={e => update('type', e.target.value)}
              >
                {PET_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="pet-form-field">
              <label className="pet-form-label">Breed</label>
              {breedOptions.length > 0 ? (
                <select
                  className="input pet-form-input"
                  value={form.breed}
                  onChange={e => update('breed', e.target.value)}
                >
                  <option value="">Select breed</option>
                  {breedOptions.map(breed => (
                    <option key={breed} value={breed}>{breed}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="input pet-form-input"
                  value={form.breed}
                  onChange={e => update('breed', e.target.value)}
                  placeholder="Optional"
                />
              )}
            </div>
          </div>

          {/* 4 & 5. Date of Birth and Weight */}
          <div className="pet-form-row">
            <div className="pet-form-field">
              <label className="pet-form-label">Date of Birth</label>
              <input
                type="date"
                className="input pet-form-input"
                value={form.dob}
                onChange={e => update('dob', e.target.value)}
              />
            </div>
            <div className="pet-form-field">
              <label className="pet-form-label">Weight</label>
              <input
                type="number"
                min="0"
                step="0.1"
                className="input pet-form-input"
                value={form.weight}
                onChange={e => update('weight', e.target.value)}
                placeholder="kg"
              />
            </div>
          </div>

          {/* 6. Gender */}
          <div className="pet-form-field">
            <label className="pet-form-label">Gender</label>
            <select
              className="input pet-form-input"
              value={form.gender}
              onChange={e => update('gender', e.target.value)}
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          {/* 7. Notes */}
          <div className="pet-form-field">
            <label className="pet-form-label">Notes</label>
            <textarea
              className="input pet-form-input pet-form-textarea"
              rows={3}
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              placeholder="Allergies, behavior notes, grooming preferences..."
            />
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="pet-modal-footer">
        <button
          type="button"
          onClick={closeForm}
          className="btn btn-secondary pet-modal-btn"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isBlocked || saving || !form.name.trim()}
          className="btn btn-primary pet-modal-btn"
        >
          <Save size={16} />
          {optimizingPhoto
            ? 'Optimizing image...'
            : saving
            ? 'Saving...'
            : editingId
            ? 'Update Profile'
            : 'Save Pet'}
        </button>
      </div>
    </form>
  )

  if (loading) return (
    <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '50vh' }}>
      <Spinner text="Loading pets..." />
    </div>
  )

  return (
    <div className="my-pets-page">
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}
      <div className="my-pets-container">
        <div className="pets-hero">
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontSize: '11px', fontWeight: 800, letterSpacing: '1.6px', textTransform: 'uppercase', marginBottom: '8px' }}>
              <PawPrint size={14} /> Pet Profiles
            </div>
            <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '38px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>My Pets</h1>
            <p style={{ color: 'var(--muted)', fontSize: '14px', maxWidth: '540px' }}>Keep grooming notes, birthdays, weight, and photos ready for faster bookings.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={openAddForm} disabled={isBlocked} className="btn btn-secondary" style={{ fontSize: '13px', padding: '10px 16px' }}>
              <Plus size={16} /> Add Pet
            </button>
            <Link to="/book" className="btn btn-primary" style={{ fontSize: '13px', padding: '10px 18px' }}>
              <Calendar size={16} /> Book Appointment
            </Link>
          </div>
        </div>
        {isBlocked && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#ef4444', fontSize: '13px', padding: '12px 14px', borderRadius: '12px', marginBottom: '16px' }}>
            Your account is blocked from adding, editing, or deleting pet profiles.
          </div>
        )}

        {(message || error) && (
          <div style={{ background: error ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)', border: `1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.25)'}`, color: error ? '#ef4444' : '#34d399', fontSize: '13px', padding: '12px 14px', borderRadius: '12px', marginBottom: '16px' }}>
            {error || message}
          </div>
        )}

        <div className="my-pets-layout">
          <aside className="pets-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
              <div>
                <h2 style={{ color: 'var(--text)', fontSize: '17px', fontWeight: 800 }}>Saved Pets</h2>
                <p style={{ color: 'var(--muted)', fontSize: '12px' }}>{pets.length} profile{pets.length === 1 ? '' : 's'}</p>
              </div>
              <button type="button" onClick={openAddForm} disabled={isBlocked} className="pet-icon-btn" aria-label="Add pet">
                <Plus size={18} />
              </button>
            </div>

            {pets.length === 0 ? (
              <button type="button" onClick={openAddForm} className="empty-pets-box">
                <ImagePlus size={26} />
                <span>Add your first pet</span>
              </button>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {pets.map(pet => {
                  const active = selectedPet?.id === pet.id && showDetailModal
                  return (
                    <button
                      key={pet.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(pet.id)
                        setShowDetailModal(true)
                        setShowForm(false)
                        setEditingId('')
                      }}
                      className={`pet-list-item${active ? ' active' : ''}`}
                    >
                      {pet.photoUrl ? (
                        <img src={pet.photoUrl} alt={pet.name} className="pet-list-photo" />
                      ) : (
                        <span className="pet-list-initial">{(pet.name || 'P')[0].toUpperCase()}</span>
                      )}
                      <span style={{ minWidth: 0, textAlign: 'left', flex: 1 }}>
                        <strong>{pet.name}</strong>
                        <small>{petSummary(pet)}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Pet Details Modal */}
      {showDetailModal && selectedPet && !showForm && (
        <div className="modal-overlay pet-modal-overlay" onClick={closeDetails}>
          <div
            className="modal-box pet-detail-modal"
            onClick={event => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pet-detail-title"
          >
            {/* Header */}
            <div className="pet-modal-header">
              <div className="pet-modal-header-info">
                <div className="pet-modal-badge">
                  <PawPrint size={13} />
                  <span>Pet Details</span>
                </div>
                <h2 id="pet-detail-title" className="pet-modal-title">
                  {selectedPet.name}
                </h2>
                <p className="pet-modal-subtitle">
                  {petSummary(selectedPet)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetails}
                className="pet-modal-close"
                aria-label="Close pet details"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="pet-modal-body">
              {/* Pet photo */}
              <div className="pet-detail-photo-section">
                {selectedPet.photoUrl ? (
                  <img
                    src={selectedPet.photoUrl}
                    alt={selectedPet.name}
                    className="pet-detail-photo"
                  />
                ) : (
                  <div className="pet-detail-photo-fallback">
                    {(selectedPet.name || 'P')[0].toUpperCase()}
                  </div>
                )}
              </div>

              {/* Pet information */}
              <div className="pet-detail-stats">
                <div className="pet-detail-stat-card">
                  <div className="pet-detail-stat-icon">
                    <Cake size={17} />
                  </div>
                  <span className="pet-detail-stat-label">DOB / Age</span>
                  <strong className="pet-detail-stat-value">
                    {selectedPet.dob || 'Not added'}
                  </strong>
                  {selectedPet.dob && (
                    <small className="pet-detail-stat-sub">
                      {getAge(selectedPet.dob)}
                    </small>
                  )}
                </div>

                <div className="pet-detail-stat-card">
                  <div className="pet-detail-stat-icon">
                    <Weight size={17} />
                  </div>
                  <span className="pet-detail-stat-label">Weight</span>
                  <strong className="pet-detail-stat-value">
                    {selectedPet.weight ? `${selectedPet.weight} kg` : 'Not added'}
                  </strong>
                </div>

                <div className="pet-detail-stat-card">
                  <div className="pet-detail-stat-icon">
                    <PawPrint size={17} />
                  </div>
                  <span className="pet-detail-stat-label">Gender</span>
                  <strong className="pet-detail-stat-value">
                    {selectedPet.gender || 'Not added'}
                  </strong>
                </div>
              </div>

              {/* Care notes */}
              <div className="pet-detail-notes-card">
                <div className="pet-detail-notes-head">
                  <h3 className="pet-detail-notes-title">Care & Grooming Notes</h3>
                </div>
                {selectedPet.notes && selectedPet.notes.trim() ? (
                  <p className="pet-detail-notes-text">{selectedPet.notes}</p>
                ) : (
                  <div className="pet-detail-notes-empty">
                    <span>No special care instructions, allergies, or notes added yet.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pet-detail-actions">
              <button
                type="button"
                onClick={() => {
                  setShowDetailModal(false)
                  startEdit(selectedPet)
                }}
                className="btn btn-primary pet-modal-action-edit"
              >
                <Edit3 size={15} /> Edit Details
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDetailModal(false)
                  setDeleteTarget(selectedPet)
                }}
                className="pet-modal-action-delete"
                aria-label={`Delete ${selectedPet.name}`}
                title="Delete pet profile"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit / Add Pet Modal */}
      {showForm && (
        <div className="modal-overlay pet-modal-overlay" onClick={closeForm}>
          <div
            className="modal-box pet-form-modal-box"
            onClick={event => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {petForm}
          </div>
        </div>
      )}
      {cropData && (
        <div className="modal-overlay pet-crop-overlay" onClick={cancelCrop}>
          <div className="modal-box pet-crop-modal" onClick={event => event.stopPropagation()}>
            <div className="pet-crop-head">
              <div>
                <h2>Crop Photo</h2>
                <p>Adjust the photo before saving it to the pet profile.</p>
              </div>
              <button type="button" onClick={cancelCrop} aria-label="Close cropper"><X size={18} /></button>
            </div>
            <div className="pet-crop-stage">
              <Cropper
                image={cropData}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="rect"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <label className="pet-crop-zoom">
              Zoom
              <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={event => setZoom(Number(event.target.value))} />
            </label>
            <div className="pet-crop-actions">
              <button type="button" className="btn btn-secondary" onClick={cancelCrop}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={confirmCrop}>Use Photo</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete pet profile?"
        message={deleteTarget ? `Are you sure you want to delete ${deleteTarget.name}? This cannot be undone.` : ''}
        confirmText="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && removePet(deleteTarget)}
      />

      <style>{`
        /* --- Modal Overlays & Animations --- */
        .pet-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(12, 10, 7, 0.68);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: petModalFadeIn 0.2s ease-out;
        }

        @keyframes petModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes petModalSlideUp {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* --- Shared Modal Boxes --- */
        .pet-detail-modal {
          width: 100%;
          max-width: 460px;
          max-height: min(90vh, 680px);
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          animation: petModalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .pet-form-modal-box {
          width: 100%;
          max-width: 500px;
          max-height: min(92vh, 740px);
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
          animation: petModalSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .pet-modal-form {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
        }

        /* --- Modal Header --- */
        .pet-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          padding: 18px 22px 14px;
          border-bottom: 1px solid var(--border);
          background: var(--card);
          flex-shrink: 0;
        }

        .pet-modal-header-info {
          min-width: 0;
          flex: 1;
        }

        .pet-modal-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: var(--accent);
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .pet-modal-title {
          color: var(--text);
          font-size: 22px;
          font-weight: 800;
          line-height: 1.25;
          margin: 0 0 3px;
          overflow-wrap: anywhere;
        }

        .pet-modal-subtitle {
          color: var(--muted);
          font-size: 13px;
          font-weight: 500;
          margin: 0;
        }

        .pet-modal-close {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.2s ease;
        }

        .pet-modal-close:hover {
          color: var(--text);
          border-color: var(--accent-border);
          background: var(--accent-bg);
          transform: translateY(-1px);
        }

        /* --- Modal Body (Scrollable) --- */
        .pet-modal-body {
          padding: 18px 22px;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex: 1;
          min-height: 0;
        }

        /* --- Pet Details: Compact Photo --- */
        .pet-detail-photo-section {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 2px 0 4px;
        }

        .pet-detail-photo {
          width: 108px;
          height: 108px;
          border-radius: 20px;
          object-fit: cover;
          border: 2px solid var(--accent-border);
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.08);
        }

        .pet-detail-photo-fallback {
          width: 108px;
          height: 108px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-bg);
          border: 2px solid var(--accent-border);
          color: var(--accent);
          font-size: 40px;
          font-weight: 900;
        }

        /* --- Pet Details: Information Stats --- */
        .pet-detail-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .pet-detail-stat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px 6px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-width: 0;
        }

        .pet-detail-stat-icon {
          color: var(--accent);
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pet-detail-stat-label {
          display: block;
          color: var(--muted);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          margin-bottom: 2px;
        }

        .pet-detail-stat-value {
          display: block;
          color: var(--text);
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
          word-break: break-word;
        }

        .pet-detail-stat-sub {
          display: block;
          color: var(--muted);
          font-size: 11px;
          margin-top: 2px;
        }

        /* --- Pet Details: Care Notes --- */
        .pet-detail-notes-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 12px 14px;
        }

        .pet-detail-notes-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }

        .pet-detail-notes-title {
          color: var(--text);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .pet-detail-notes-text {
          color: var(--muted);
          font-size: 13px;
          line-height: 1.6;
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .pet-detail-notes-empty {
          color: var(--muted);
          font-size: 12px;
          font-style: italic;
          opacity: 0.75;
          padding: 2px 0;
        }

        /* --- Pet Details: Actions --- */
        .pet-detail-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 22px 18px;
          border-top: 1px solid var(--border);
          background: var(--card);
          flex-shrink: 0;
        }

        .pet-modal-action-edit {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 16px;
          font-size: 13px;
          font-weight: 700;
          border-radius: 10px;
          min-height: 42px;
        }

        .pet-modal-action-delete {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #ef4444;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.22);
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .pet-modal-action-delete:hover {
          background: rgba(239, 68, 68, 0.16);
          border-color: rgba(239, 68, 68, 0.4);
        }

        /* --- Edit Pet Modal: Compact Photo Controls --- */
        .pet-edit-photo-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 10px 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
        }

        .pet-edit-photo-preview {
          width: 74px;
          height: 74px;
          min-width: 74px;
          aspect-ratio: 1;
          border-radius: 12px;
          border: 1.5px dashed var(--accent-border);
          background: var(--accent-bg);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          overflow: hidden;
          position: relative;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .pet-edit-photo-preview:hover {
          border-color: var(--accent);
          transform: scale(1.02);
        }

        .pet-edit-photo-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .pet-edit-photo-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--accent);
        }

        .pet-file-input {
          display: none;
        }

        .pet-edit-photo-controls {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          flex: 1;
          min-width: 0;
        }

        .pet-photo-upload-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 700;
          border-radius: 8px;
          cursor: pointer;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--text);
          transition: all 0.2s ease;
        }

        .pet-photo-upload-btn:hover {
          border-color: var(--accent-border);
          background: var(--accent-bg);
        }

        .pet-photo-remove-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: transparent;
          border: none;
          color: var(--muted);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          padding: 2px 0;
          transition: color 0.15s ease;
        }

        .pet-photo-remove-btn:hover {
          color: #ef4444;
        }

        .pet-edit-photo-hint {
          color: var(--muted);
          font-size: 10px;
          opacity: 0.8;
        }

        /* --- Edit Pet Modal: Fields --- */
        .pet-edit-fields {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .pet-form-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .pet-form-field {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .pet-form-label {
          display: block;
          margin-bottom: 5px;
          color: var(--muted);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .pet-form-input {
          width: 100%;
          min-height: 40px;
          border-radius: 10px;
          font-size: 13px;
          box-sizing: border-box;
        }

        .pet-form-textarea {
          resize: none;
          min-height: 68px;
          line-height: 1.5;
        }

        /* --- Modal Footer Actions --- */
        .pet-modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          padding: 14px 22px 18px;
          border-top: 1px solid var(--border);
          background: var(--card);
          flex-shrink: 0;
        }

        .pet-modal-btn {
          padding: 10px 18px;
          font-size: 13px;
          font-weight: 700;
          min-height: 42px;
          border-radius: 10px;
        }

        /* --- Cropper Modal --- */
        .pet-crop-overlay {
          z-index: 1300;
        }

        .pet-crop-modal {
          max-width: 560px;
          overflow: hidden;
        }

        .pet-crop-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          padding: 18px 18px 0;
        }

        .pet-crop-head h2 {
          color: var(--text);
          font-size: 18px;
          font-weight: 900;
        }

        .pet-crop-head p {
          color: var(--muted);
          font-size: 12px;
          margin-top: 4px;
        }

        .pet-crop-head button {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--muted);
          cursor: pointer;
        }

        .pet-crop-stage {
          position: relative;
          width: 100%;
          height: min(62vh, 420px);
          min-height: 300px;
          margin-top: 16px;
          background: #111;
        }

        .pet-crop-zoom {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 12px;
          align-items: center;
          padding: 16px 18px 0;
          color: var(--muted);
          font-size: 12px;
          font-weight: 800;
        }

        .pet-crop-zoom input {
          accent-color: var(--accent);
        }

        .pet-crop-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          padding: 16px 18px 18px;
        }

        /* --- Saved Pets Page Layout --- */
        .my-pets-page {
          background: var(--bg);
          padding-top: 80px;
        }

        .my-pets-container {
          max-width: 1180px;
          margin: 0 auto;
          padding: 32px 20px 36px;
        }

        @media (max-width: 768px) {
          .my-pets-container {
            padding: 20px 16px 28px;
          }
        }

        .pets-hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
          margin-bottom: 28px;
        }

        .my-pets-layout {
          width: 100%;
          max-width: 680px;
        }

        .pets-panel {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          box-shadow: 0 18px 50px rgba(0,0,0,0.08);
          padding: 18px;
        }

        .pet-icon-btn {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          border: 1px solid var(--accent-border);
          background: var(--accent-bg);
          color: var(--accent);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .pet-icon-btn:hover {
          border-color: var(--accent);
          transform: translateY(-1px);
        }

        .pet-list-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--surface);
          cursor: pointer;
          color: var(--text);
          transition: all 0.2s ease;
        }

        .pet-list-item:hover,
        .pet-list-item.active {
          border-color: var(--accent);
          background: var(--accent-bg);
          transform: translateY(-1px);
        }

        .pet-list-photo,
        .pet-list-initial {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          flex-shrink: 0;
        }

        .pet-list-photo {
          object-fit: cover;
        }

        .pet-list-initial {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-bg);
          border: 1px solid var(--accent-border);
          color: var(--accent);
          font-weight: 900;
          font-size: 18px;
        }

        .pet-list-item strong,
        .pet-list-item small {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pet-list-item strong {
          font-size: 14px;
          margin-bottom: 3px;
        }

        .pet-list-item small {
          color: var(--muted);
          font-size: 11px;
        }

        .empty-pets-box {
          width: 100%;
          min-height: 160px;
          border: 1px dashed var(--accent-border);
          border-radius: 14px;
          background: var(--accent-bg);
          color: var(--accent);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          font-weight: 800;
        }

        /* --- Mobile Responsive Rules --- */
        @media (max-width: 480px) {
          .pet-modal-overlay {
            padding: 12px 10px;
          }

          .pet-detail-modal,
          .pet-form-modal-box {
            max-height: calc(100dvh - 24px);
            border-radius: 16px;
          }

          .pet-modal-header {
            padding: 15px 16px 12px;
          }

          .pet-modal-title {
            font-size: 19px;
          }

          .pet-modal-body {
            padding: 14px 16px;
            gap: 14px;
          }

          .pet-detail-photo,
          .pet-detail-photo-fallback {
            width: 96px;
            height: 96px;
          }

          .pet-detail-stats {
            gap: 6px;
          }

          .pet-detail-stat-card {
            padding: 8px 4px;
          }

          .pet-detail-stat-value {
            font-size: 12px;
          }

          .pet-modal-footer {
            display: grid;
            grid-template-columns: 1fr 1.25fr;
            padding: 12px 16px 16px;
            gap: 8px;
          }

          .pet-modal-btn {
            width: 100%;
            justify-content: center;
          }

          .pet-detail-actions {
            padding: 12px 16px 16px;
          }
        }

        @media (max-width: 350px) {
          .pet-form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
