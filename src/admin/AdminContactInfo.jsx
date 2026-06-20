import { useEffect, useState } from 'react'
import { Phone, MapPin, Clock, Save, Image as ImageIcon, Upload, X } from 'lucide-react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import BrandLogo from '../components/BrandLogo'
import { uploadToCloudinary } from '../utils/cloudinary'

const DEFAULT_CONTACT = {
  whatsappNumber: '',
  address: 'Shop no 208, 1st Floor, Mate Kamthe Bhuruk Complex, Near Bhairavnath Temple, Dhayari, Pune – 411041',
  hours: 'Open daily 9:00 AM – 9:00 PM, 7 days a week',
  shopName: 'Paw Paw Grooming Center',
  logoUrl: '',
}

export default function AdminContactInfo() {
  const [contact, setContact] = useState(DEFAULT_CONTACT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchContact() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'contactInfo'))
        if (snap.exists()) {
          setContact(prev => ({ ...prev, ...snap.data() }))
        }
      } catch (err) {
        setError('Could not load contact info.')
      }
      setLoading(false)
    }
    fetchContact()
  }, [])

  const updateField = (key, value) => {
    setContact(prev => ({ ...prev, [key]: value }))
  }

  const uploadLogo = async (file) => {
    if (!file) return
    setError('')
    setMessage('')
    setUploadingLogo(true)
    try {
      const url = await uploadToCloudinary(file)
      updateField('logoUrl', url)
      setMessage('Logo uploaded. Click Save Changes to publish it.')
    } catch (err) {
      setError(err.message || 'Upload failed. Check Cloudinary settings.')
    }
    setUploadingLogo(false)
  }
  const save = async () => {
    setError('')
    setMessage('')

    if (!contact.whatsappNumber.trim() || !contact.address.trim() || !contact.hours.trim()) {
      setError('Please fill in all required fields.')
      return
    }

    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'contactInfo'), {
        whatsappNumber: contact.whatsappNumber.trim(),
        address: contact.address.trim(),
        hours: contact.hours.trim(),
        shopName: contact.shopName.trim() || 'Paw Paw Grooming Center',
        logoUrl: contact.logoUrl?.trim() || '',
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setMessage('Contact information updated successfully!')
    } catch (err) {
      setError(err.message || 'Could not save contact info.')
    }
    setSaving(false)
  }

  const labelStyle = {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1px',
    textTransform: 'uppercase',
    color: 'var(--muted)',
    display: 'block',
    marginBottom: '5px',
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--card)',
    color: 'var(--text)',
    fontSize: '13px',
    fontFamily: 'inherit',
  }

  if (loading) return <div style={{ padding: '28px' }}><Spinner text="Loading contact info..." /></div>

  return (
    <div style={{ padding: '28px' }}>
      <h1 style={{ color: 'var(--text)', fontSize: '24px', fontWeight: 700, marginBottom: '6px' }}>Contact Information</h1>
      <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '28px' }}>
        Manage your business contact details that appear on the home page and services page.
      </p>

      {message && (
        <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#10b98120', border: '1px solid #10b981', color: '#059669', fontSize: '13px', marginBottom: '16px' }}>
          ✓ {message}
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#ef444420', border: '1px solid #ef4444', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>
          ✕ {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: '20px', maxWidth: '600px' }}>
        {/* Shop Name */}
        <div>
          <label style={labelStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              Shop Name
            </span>
          </label>
          <input
            type="text"
            value={contact.shopName}
            onChange={e => updateField('shopName', e.target.value)}
            placeholder="e.g., Paw Paw Grooming Center"
            style={inputStyle}
          />
        </div>

        {/* Website Logo */}
        <div>
          <label style={labelStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ImageIcon size={12} /> Website Logo
            </span>
          </label>
          <div style={{ display: 'grid', gap: '12px', padding: '14px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ width: '74px', height: '74px', borderRadius: '14px', border: '1px solid var(--accent-border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {contact.logoUrl ? (
                  <img src={contact.logoUrl} alt="Website logo preview" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }} />
                ) : (
                  <ImageIcon size={26} style={{ color: 'var(--muted)' }} />
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <label className="btn btn-secondary" style={{ fontSize: '13px', padding: '10px 14px', opacity: uploadingLogo ? 0.7 : 1 }}>
                  <Upload size={15} /> {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                  <input type="file" accept="image/*" disabled={uploadingLogo || saving} onChange={e => uploadLogo(e.target.files?.[0])} style={{ display: 'none' }} />
                </label>
                {contact.logoUrl && (
                  <button type="button" onClick={() => updateField('logoUrl', '')} className="btn btn-danger" style={{ fontSize: '13px', padding: '10px 14px' }}>
                    <X size={15} /> Clear
                  </button>
                )}
              </div>
            </div>
            <input
              type="url"
              value={contact.logoUrl || ''}
              onChange={e => updateField('logoUrl', e.target.value)}
              placeholder="Paste logo image URL or upload a file"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)' }}>
              Recommended: square PNG/WebP with transparent background. Click Save Changes after upload.
            </p>
          </div>
        </div>
        {/* WhatsApp Number */}
        <div>
          <label style={labelStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Phone size={12} /> WhatsApp Number
            </span>
          </label>
          <input
            type="text"
            value={contact.whatsappNumber}
            onChange={e => updateField('whatsappNumber', e.target.value)}
            placeholder="e.g., 919876543210"
            style={inputStyle}
          />
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Use country code without spaces (e.g., 919876543210 for India)
          </p>
        </div>

        {/* Address */}
        <div>
          <label style={labelStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={12} /> Address
            </span>
          </label>
          <textarea
            value={contact.address}
            onChange={e => updateField('address', e.target.value)}
            placeholder="Enter complete address"
            style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
          />
        </div>

        {/* Opening Hours */}
        <div>
          <label style={labelStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} /> Opening Hours
            </span>
          </label>
          <textarea
            value={contact.hours}
            onChange={e => updateField('hours', e.target.value)}
            placeholder="e.g., Open daily 9:00 AM – 9:00 PM, 7 days a week"
            style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '24px', maxWidth: '600px' }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            background: saving ? 'var(--muted)' : 'var(--accent)',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Preview */}
      <div style={{ marginTop: '40px', paddingTop: '28px', borderTop: '1px solid var(--border)' }}>
        <h2 style={{ color: 'var(--text)', fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>Preview</h2>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', maxWidth: '600px' }}>
          <h3 style={{ color: 'var(--text)', fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>{contact.shopName}</h3>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px', fontSize: '13px' }}>
            <MapPin size={16} style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }} />
            <span style={{ color: 'var(--muted)' }}>{contact.address}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', fontSize: '13px' }}>
            <Phone size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <a href={`tel:${contact.whatsappNumber}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              {contact.whatsappNumber}
            </a>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '13px' }}>
            <Clock size={16} style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }} />
            <span style={{ color: 'var(--muted)' }}>{contact.hours}</span>
          </div>
        </div>
      </div>
    </div>
  )
}




