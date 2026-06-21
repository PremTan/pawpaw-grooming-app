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
import ConfirmModal from '../components/ConfirmModal'
import { CAT_BREEDS, DOG_BREEDS, PET_TYPES } from '../utils/services'
import { uploadToCloudinary } from '../utils/cloudinary'

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
  const { user } = useAuth()
  const [pets, setPets] = useState([])
  const [form, setForm] = useState(EMPTY_PET)
  const [selectedId, setSelectedId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
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
    setForm(EMPTY_PET)
    setEditingId('')
    setPhotoFile(null)
    setPhotoPreview('')
    setShowForm(true)
    setMessage('')
    setError('')
  }

  const closeForm = () => {
    setForm(EMPTY_PET)
    setEditingId('')
    setPhotoFile(null)
    setPhotoPreview('')
    setShowForm(false)
  }

  const startEdit = (pet) => {
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
    setShowForm(true)
    setMessage('')
    setError('')
  }

  const choosePhoto = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.')
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
    if (!form.name.trim()) return

    setSaving(true)
    setMessage('')
    setError('')

    try {
      const uploadedPhotoUrl = photoFile ? await uploadToCloudinary(photoFile) : form.photoUrl.trim()
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
        setMessage('Pet profile updated.')
      } else {
        await addDoc(collection(db, 'pets'), {
          ...cleanPet,
          createdAt: serverTimestamp(),
        })
        setMessage('Pet profile added.')
      }

      const keepSelectedId = editingId
      closeForm()
      await fetchPets()
      setSelectedId(keepSelectedId)
    } catch (err) {
      setError(err.message || 'Could not save pet.')
    }
    setSaving(false)
  }

  const removePet = async (pet) => {
    setMessage('')
    setError('')
    try {
      await deleteDoc(doc(db, 'pets', pet.id))
      setPets(prev => prev.filter(item => item.id !== pet.id))
      if (editingId === pet.id) closeForm()
      if (selectedId === pet.id) setSelectedId('')
      setDeleteTarget(null)
      setMessage('Pet deleted.')
    } catch (err) {
      setError(err.message || 'Could not delete pet.')
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

  if (loading) return (
    <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' }}>
      <Spinner text="Loading pets..." />
    </div>
  )

  return (
    <div style={{ background: 'var(--bg)', paddingTop: '80px', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '38px 20px 80px' }}>
        <div className="pets-hero">
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontSize: '11px', fontWeight: 800, letterSpacing: '1.6px', textTransform: 'uppercase', marginBottom: '8px' }}>
              <PawPrint size={14} /> Pet Profiles
            </div>
            <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '38px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>My Pets</h1>
            <p style={{ color: 'var(--muted)', fontSize: '14px', maxWidth: '540px' }}>Keep grooming notes, birthdays, weight, and photos ready for faster bookings.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={openAddForm} className="btn btn-secondary" style={{ fontSize: '13px', padding: '10px 16px' }}>
              <Plus size={16} /> Add Pet
            </button>
            <Link to="/book" className="btn btn-primary" style={{ fontSize: '13px', padding: '10px 18px' }}>
              <Calendar size={16} /> Book Appointment
            </Link>
          </div>
        </div>

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
              <button type="button" onClick={openAddForm} className="pet-icon-btn" aria-label="Add pet">
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
                  const active = selectedPet?.id === pet.id && !showForm
                  return (
                    <button
                      key={pet.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(pet.id)
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

          {(showForm || selectedPet || pets.length === 0) && (
            <main>
              {showForm ? (
              <form onSubmit={savePet} className="pet-detail-card">
                <div className="pet-detail-head">
                  <div>
                    <div style={{ color: 'var(--accent)', fontSize: '11px', fontWeight: 800, letterSpacing: '1.4px', textTransform: 'uppercase', marginBottom: '6px' }}>
                      {editingId ? 'Update Profile' : 'New Profile'}
                    </div>
                    <h2 style={{ color: 'var(--text)', fontSize: '24px', fontWeight: 800 }}>{editingId ? 'Edit Pet Details' : 'Add Pet'}</h2>
                  </div>
                  <button type="button" onClick={closeForm} className="pet-icon-btn" aria-label="Close form">
                    <X size={18} />
                  </button>
                </div>

                <div className="pet-form-layout">
                  <div>
                    <label className="photo-picker">
                      {photoPreview ? (
                        <img src={photoPreview} alt="Pet preview" />
                      ) : (
                        <span>
                          <Camera size={28} />
                          Upload Photo
                        </span>
                      )}
                      <input type="file" accept="image/*" onChange={choosePhoto} />
                    </label>
                    {photoPreview && (
                      <button type="button" onClick={removePhoto} className="btn btn-secondary" style={{ width: '100%', marginTop: '10px', padding: '9px 12px', fontSize: '12px' }}>
                        Remove Photo
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: '14px' }}>
                    <div>
                      <label style={L}>Pet Name *</label>
                      <input className="input" value={form.name} onChange={e => update('name', e.target.value)} placeholder="e.g. Bruno" />
                    </div>

                    <div className="pet-form-grid">
                      <div>
                        <label style={L}>Type</label>
                        <select className="input" value={form.type} onChange={e => update('type', e.target.value)}>
                          {PET_TYPES.map(type => <option key={type}>{type}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={L}>Breed</label>
                        {breedOptions.length > 0 ? (
                          <select className="input" value={form.breed} onChange={e => update('breed', e.target.value)}>
                            <option value="">Select</option>
                            {breedOptions.map(breed => <option key={breed}>{breed}</option>)}
                          </select>
                        ) : (
                          <input className="input" value={form.breed} onChange={e => update('breed', e.target.value)} placeholder="Optional" />
                        )}
                      </div>
                    </div>

                    <div className="pet-form-grid">
                      <div>
                        <label style={L}>Date of Birth</label>
                        <input type="date" className="input" value={form.dob} onChange={e => update('dob', e.target.value)} />
                      </div>
                      <div>
                        <label style={L}>Weight</label>
                        <input type="number" min="0" step="0.1" className="input" value={form.weight} onChange={e => update('weight', e.target.value)} placeholder="kg" />
                      </div>
                    </div>

                    <div>
                      <label style={L}>Gender</label>
                      <select className="input" value={form.gender} onChange={e => update('gender', e.target.value)}>
                        <option value="">Select</option>
                        <option>Male</option>
                        <option>Female</option>
                      </select>
                    </div>

                    <div>
                      <label style={L}>Notes</label>
                      <textarea className="input" rows={4} style={{ resize: 'none' }} value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Allergies, behavior notes, grooming preferences..." />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={closeForm} className="btn btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving || !form.name.trim()} className="btn btn-primary">
                    <Save size={16} /> {saving ? 'Saving...' : editingId ? 'Update Profile' : 'Save Pet'}
                  </button>
                </div>
              </form>
            ) : selectedPet ? (
              <section className="pet-detail-card">
                <div className="pet-profile-top">
                  {selectedPet.photoUrl ? (
                    <img src={selectedPet.photoUrl} alt={selectedPet.name} className="pet-profile-photo" />
                  ) : (
                    <div className="pet-profile-fallback">{(selectedPet.name || 'P')[0].toUpperCase()}</div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ color: 'var(--accent)', fontSize: '11px', fontWeight: 800, letterSpacing: '1.4px', textTransform: 'uppercase', marginBottom: '6px' }}>Pet Profile</p>
                    <h2 style={{ color: 'var(--text)', fontSize: '30px', fontWeight: 900, marginBottom: '6px', overflowWrap: 'anywhere' }}>{selectedPet.name}</h2>
                    <p style={{ color: 'var(--muted)', fontSize: '14px' }}>{petSummary(selectedPet)}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => startEdit(selectedPet)} className="btn btn-secondary" style={{ padding: '10px 14px', fontSize: '13px' }}>
                      <Edit3 size={15} /> Edit
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(selectedPet)} className="btn btn-danger" style={{ padding: '10px 12px' }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="pet-stat-grid">
                  <div className="pet-stat">
                    <Cake size={18} />
                    <span>DOB</span>
                    <strong>{selectedPet.dob || 'Not added'}</strong>
                    {selectedPet.dob && <small>{getAge(selectedPet.dob)}</small>}
                  </div>
                  <div className="pet-stat">
                    <Weight size={18} />
                    <span>Weight</span>
                    <strong>{selectedPet.weight ? `${selectedPet.weight} kg` : 'Not added'}</strong>
                  </div>
                  <div className="pet-stat">
                    <PawPrint size={18} />
                    <span>Gender</span>
                    <strong>{selectedPet.gender || 'Not added'}</strong>
                  </div>
                </div>

                <div className="pet-notes">
                  <h3>Care Notes</h3>
                  <p>{selectedPet.notes || 'No notes added yet.'}</p>
                </div>
              </section>
              ) : (
                <section className="pet-detail-card empty-detail">
                  <ImagePlus size={34} />
                  <h2>Add a pet profile</h2>
                  <p>Create a saved profile with photo, DOB, weight, and grooming notes.</p>
                  <button type="button" onClick={openAddForm} className="btn btn-primary">
                    <Plus size={16} /> Add Pet
                  </button>
                </section>
              )}
            </main>
          )}
        </div>
      </div>

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

        .pets-hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
          margin-bottom: 28px;
        }

        .my-pets-layout {
          display: grid;
          grid-template-columns: minmax(260px, 330px) minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }

        .pets-panel,
        .pet-detail-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          box-shadow: 0 18px 50px rgba(0,0,0,0.08);
        }

        .pets-panel {
          padding: 18px;
          position: sticky;
          top: 98px;
        }

        .pet-detail-card {
          padding: 24px;
          min-height: 480px;
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

        .pet-detail-head,
        .pet-profile-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 24px;
        }

        .pet-form-layout {
          display: grid;
          grid-template-columns: minmax(180px, 240px) 1fr;
          gap: 22px;
        }

        .pet-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .photo-picker {
          width: 100%;
          aspect-ratio: 1;
          min-height: 210px;
          border: 1px dashed var(--accent-border);
          border-radius: 16px;
          background: var(--accent-bg);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          overflow: hidden;
          font-weight: 800;
          text-align: center;
        }

        .photo-picker span {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .photo-picker img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .photo-picker input {
          display: none;
        }

        .pet-profile-photo,
        .pet-profile-fallback {
          width: 132px;
          height: 132px;
          border-radius: 18px;
          flex-shrink: 0;
        }

        .pet-profile-photo {
          object-fit: cover;
          border: 1px solid var(--border);
        }

        .pet-profile-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          background: var(--accent-bg);
          border: 1px solid var(--accent-border);
          font-size: 42px;
          font-weight: 900;
        }

        .pet-stat-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }

        .pet-stat {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px;
          min-height: 124px;
        }

        .pet-stat svg {
          color: var(--accent);
          margin-bottom: 14px;
        }

        .pet-stat span {
          display: block;
          color: var(--muted);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .pet-stat strong {
          display: block;
          color: var(--text);
          font-size: 15px;
          overflow-wrap: anywhere;
        }

        .pet-stat small {
          display: block;
          color: var(--muted);
          font-size: 12px;
          margin-top: 4px;
        }

        .pet-notes {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 18px;
        }

        .pet-notes h3 {
          color: var(--text);
          font-size: 16px;
          font-weight: 800;
          margin-bottom: 8px;
        }

        .pet-notes p {
          color: var(--muted);
          font-size: 14px;
          line-height: 1.7;
          white-space: pre-wrap;
        }

        .empty-detail {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 12px;
          color: var(--muted);
        }

        .empty-detail svg {
          color: var(--accent);
        }

        .empty-detail h2 {
          color: var(--text);
          font-size: 24px;
          font-weight: 900;
        }

        @media (max-width: 900px) {
          .my-pets-layout {
            grid-template-columns: 1fr !important;
          }

          .pets-panel {
            position: static;
          }
        }

        @media (max-width: 700px) {
          .pet-detail-card {
            padding: 18px;
          }

          .pet-form-layout,
          .pet-profile-top,
          .pet-stat-grid {
            grid-template-columns: 1fr;
          }

          .pet-form-layout {
            display: grid;
          }

          .pet-profile-top {
            display: grid;
          }

          .pet-form-grid {
            grid-template-columns: 1fr;
          }

          .pet-profile-photo,
          .pet-profile-fallback {
            width: 100%;
            height: auto;
            aspect-ratio: 16 / 10;
          }
        }
      `}</style>
    </div>
  )
}
