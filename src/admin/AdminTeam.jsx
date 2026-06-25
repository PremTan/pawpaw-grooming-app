import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import Cropper from 'react-easy-crop'
import { Camera, Edit3, Mail, Phone, Plus, Upload, UserRound, Users, X } from 'lucide-react'
import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import { getOwnerAssignee } from '../utils/teamMembers'

const EMPTY = { name: '', phone: '', email: '', role: 'Groomer', photoUrl: '' }

const getCroppedImg = async (imageSrc, pixelCrop, fileName) => {
  const image = new Image()
  image.src = imageSrc
  await new Promise(resolve => { image.onload = resolve })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height)

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(new File([blob], fileName, { type: 'image/jpeg' })), 'image/jpeg', 0.9)
  })
}

export default function AdminTeam() {
  const { user } = useAuth()
  const [members, setMembers] = useState([])
  const [ownerProfile, setOwnerProfile] = useState(null)
  const [bookings, setBookings] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState('')
  const [selectedMember, setSelectedMember] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [optimizingPhoto, setOptimizingPhoto] = useState(false)
  const [cropData, setCropData] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const owner = useMemo(() => {
    const fallback = getOwnerAssignee(user)
    return {
      ...fallback,
      name: ownerProfile?.name || fallback.name,
      phone: ownerProfile?.phone || '',
      email: ownerProfile?.email || fallback.email,
      address: ownerProfile?.address || '',
      photoUrl: user?.photoURL || fallback.photoUrl,
    }
  }, [ownerProfile, user])

  const fetchMembers = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'teamMembers'), orderBy('createdAt', 'desc')))
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch {
      try {
        const snap = await getDocs(collection(db, 'teamMembers'))
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        setMembers(rows)
      } catch {}
    }
    setLoading(false)
  }

  useEffect(() => { fetchMembers() }, [])

  useEffect(() => {
    async function fetchBookings() {
      try {
        const snap = await getDocs(collection(db, 'bookings'))
        setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch {}
    }
    fetchBookings()
  }, [])

  useEffect(() => {
    async function fetchOwnerProfile() {
      if (!user?.uid) return
      try {
        const snap = await getDoc(doc(db, 'profiles', user.uid))
        setOwnerProfile(snap.exists() ? snap.data() : null)
      } catch {
        setOwnerProfile(null)
      }
    }
    fetchOwnerProfile()
  }, [user])

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const openAdd = () => {
    setEditingId('')
    setForm(EMPTY)
    setSelectedMember(null)
    setShowForm(true)
  }

  const openEdit = member => {
    setEditingId(member.id)
    setForm({
      name: member.name || '',
      phone: member.phone || '',
      email: member.email || '',
      role: member.role || 'Team Member',
      photoUrl: member.photoUrl || '',
    })
    setSelectedMember(null)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId('')
    setForm(EMPTY)
    setCropData(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
  }

  const choosePhoto = file => {
    if (!file) return
    try {
      validateImageFile(file)
    } catch (err) {
      alert(err.message)
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      setCropData({ src: reader.result, fileName: file.name || 'team-member.jpg' })
      setCrop({ x: 0, y: 0 })
      setZoom(1)
    })
    reader.readAsDataURL(file)
  }

  const onCropComplete = useCallback((_, croppedPixels) => setCroppedAreaPixels(croppedPixels), [])

  const confirmCrop = async () => {
    if (!cropData || !croppedAreaPixels) return
    setUploadingPhoto(true)
    try {
      const croppedFile = await getCroppedImg(cropData.src, croppedAreaPixels, cropData.fileName)
      const url = await uploadToCloudinary(croppedFile, {
        onOptimizeStart: () => setOptimizingPhoto(true),
        onOptimizeEnd: () => setOptimizingPhoto(false),
      })
      update('photoUrl', url)
      setCropData(null)
    } catch (err) {
      alert(err.message || 'Could not upload profile photo.')
    }
    setOptimizingPhoto(false)
    setUploadingPhoto(false)
  }

  const saveMember = async event => {
    event.preventDefault()
    if (!form.name.trim() || !form.phone.trim()) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      role: form.role.trim() || 'Team Member',
      photoUrl: form.photoUrl.trim(),
      updatedAt: serverTimestamp(),
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'teamMembers', editingId), payload)
      } else {
        await addDoc(collection(db, 'teamMembers'), { ...payload, active: true, createdAt: serverTimestamp() })
      }
      closeForm()
      await fetchMembers()
    } catch {
      alert(editingId ? 'Could not update team member.' : 'Could not add team member. Please try again.')
    }
    setSaving(false)
  }

  const toggleMember = async member => {
    setSaving(true)
    const nextActive = member.active === false
    try {
      await updateDoc(doc(db, 'teamMembers', member.id), { active: nextActive, updatedAt: serverTimestamp() })
      const updated = { ...member, active: nextActive }
      setMembers(prev => prev.map(item => item.id === member.id ? updated : item))
      setSelectedMember(prev => prev?.id === member.id ? updated : prev)
    } catch {
      alert('Could not update team member.')
    }
    setSaving(false)
  }

  const memberStats = person => {
    if (!person) return { total: 0, completed: 0, earnings: 0 }
    const assigned = bookings.filter(booking => {
      if (person.isOwner) return !booking.assignedTeamMemberId || booking.assignedTeamMemberId === 'owner' || booking.assignedTeamMemberIsOwner
      return booking.assignedTeamMemberId === person.id
    })
    const completed = assigned.filter(booking => booking.status === 'completed')
    return {
      total: assigned.length,
      completed: completed.length,
      earnings: completed.reduce((sum, booking) => sum + (parseFloat(booking.amountCollected) || 0), 0),
    }
  }

  const money = value => Number(value || 0).toLocaleString('en-IN')

  const Avatar = ({ person, owner: isOwner = false }) => (
    person.photoUrl ? <img className="admin-team-photo" src={person.photoUrl} alt={person.name || 'Team member'} /> : <div className="admin-team-avatar"><UserRound size={isOwner ? 18 : 19} /></div>
  )

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Team</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Add staff members and assign confirmed appointments to them.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd}>
          <Plus size={16} /> Add Team Member
        </button>
      </div>

      <div className="admin-team-compact-list">
        <button type="button" className="admin-team-list-item" onClick={() => setSelectedMember(owner)}>
          <Avatar person={owner} owner />
          <span className="admin-team-list-copy">
            <strong>{owner.name}</strong>
            <small>Owner</small>
          </span>
        </button>

        {loading ? <Spinner text="Loading team..." /> : members.length === 0 ? (
          <div className="admin-booking-empty">
            <Users size={24} style={{ margin: '0 auto 10px', color: 'var(--muted)' }} />
            No team members added yet.
          </div>
        ) : members.map(member => (
          <button key={member.id} type="button" className={`admin-team-list-item${member.active === false ? ' inactive' : ''}`} onClick={() => setSelectedMember(member)}>
            <Avatar person={member} />
            <span className="admin-team-list-copy">
              <strong>{member.name || 'Team Member'}</strong>
              <small>{member.role || 'Team Member'}{member.active === false ? ' - Inactive' : ''}</small>
            </span>
          </button>
        ))}
      </div>

      {selectedMember && (() => {
        const stats = memberStats(selectedMember)
        return (
        <div className="modal-overlay" onClick={() => setSelectedMember(null)}>
          <div className="modal-box admin-team-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-team-modal-head">
              <div>
                <h2>Team Details</h2>
                <p>{selectedMember.isOwner ? 'Owner profile' : 'Staff profile'}</p>
              </div>
              <button type="button" onClick={() => setSelectedMember(null)} aria-label="Close team details"><X size={18} /></button>
            </div>

            <div className="admin-team-detail-body">
              <div className="admin-team-detail-top">
                <Avatar person={selectedMember} owner={selectedMember.isOwner} />
                <div>
                  <div className="admin-team-title">
                    <strong>{selectedMember.name}</strong>
                    {selectedMember.isOwner ? <span className="badge badge-completed">Owner</span> : <span className="badge badge-online">{selectedMember.role || 'Team Member'}</span>}
                    {selectedMember.isOwner && <span className="badge badge-confirmed">Default</span>}
                    {!selectedMember.isOwner && selectedMember.active === false && <span className="badge badge-cancelled">Inactive</span>}
                  </div>
                  <p><Mail size={13} /> {selectedMember.email || '-'}</p>
                  <p><Phone size={13} /> {selectedMember.phone || '-'}</p>
                  {selectedMember.address && <p>{selectedMember.address}</p>}
                </div>
              </div>

              <div className="admin-team-stats">
                <div><span>Total Assigned</span><strong>{stats.total}</strong></div>
                <div><span>Completed</span><strong>{stats.completed}</strong></div>
                <div><span>Earnings</span><strong>Rs {money(stats.earnings)}</strong></div>
              </div>

              {selectedMember.isOwner ? (
                <p className="admin-team-owner-note">Owner details come from the saved profile and auth photo.</p>
              ) : (
                <div className="admin-team-detail-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => openEdit(selectedMember)}>
                    <Edit3 size={15} /> Edit
                  </button>
                  <button type="button" className={selectedMember.active === false ? 'btn btn-secondary' : 'btn btn-danger'} onClick={() => toggleMember(selectedMember)} disabled={saving}>
                    {selectedMember.active === false ? 'Activate' : 'Deactivate'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        )
      })()}

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <form className="modal-box admin-team-modal" onSubmit={saveMember} onClick={e => e.stopPropagation()}>
            <div className="admin-team-modal-head">
              <div>
                <h2><Plus size={18} /> {editingId ? 'Edit Team Member' : 'Add Team Member'}</h2>
                <p>{editingId ? 'Update staff profile details.' : 'Create a staff profile for appointment assignment.'}</p>
              </div>
              <button type="button" onClick={closeForm} aria-label="Close team member form"><X size={18} /></button>
            </div>

            <div className="admin-team-form">
              <div className="admin-team-photo-row">
                <div className="admin-team-photo-preview">
                  {form.photoUrl ? <img src={form.photoUrl} alt="Team member preview" /> : <Camera size={24} />}
                </div>
                <div>
                  <label className="btn btn-secondary" style={{ padding: '9px 12px', fontSize: '12px', opacity: uploadingPhoto ? 0.65 : 1 }}>
                    <Upload size={14} /> {optimizingPhoto ? 'Optimizing image...' : uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                    <input type="file" accept={IMAGE_FILE_ACCEPT} disabled={uploadingPhoto || saving} onChange={e => choosePhoto(e.target.files?.[0])} style={{ display: 'none' }} />
                  </label>
                  {form.photoUrl && <button type="button" className="admin-team-remove-photo" onClick={() => update('photoUrl', '')}>Remove photo</button>}
                </div>
              </div>

              <label>Name *</label>
              <input className="input" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Full name" autoFocus />
              <label>Phone *</label>
              <input className="input" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="Contact number" />
              <label>Email</label>
              <input className="input" type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="member@email.com" />
              <label>Role</label>
              <input className="input" value={form.role} onChange={e => update('role', e.target.value)} placeholder="Groomer, Driver, Assistant..." />
              <div className="admin-team-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || uploadingPhoto || !form.name.trim() || !form.phone.trim()}>
                  {editingId ? 'Save Changes' : 'Add Member'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {cropData && (
        <div className="modal-overlay admin-team-crop-overlay" onClick={() => setCropData(null)}>
          <div className="modal-box admin-team-crop-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-team-modal-head">
              <div>
                <h2>Crop Profile Photo</h2>
                <p>Use a square crop for a clean team profile picture.</p>
              </div>
              <button type="button" onClick={() => setCropData(null)} aria-label="Close crop photo"><X size={18} /></button>
            </div>
            <div className="admin-team-crop-stage">
              <Cropper image={cropData.src} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onCropComplete={onCropComplete} onZoomChange={setZoom} />
            </div>
            <div className="admin-team-zoom-row">
              <span>Zoom</span>
              <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={e => setZoom(Number(e.target.value))} />
            </div>
            <div className="admin-team-modal-actions admin-team-crop-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setCropData(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={confirmCrop} disabled={uploadingPhoto}>{optimizingPhoto ? 'Optimizing image...' : uploadingPhoto ? 'Uploading...' : 'Confirm Crop'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
