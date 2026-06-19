import { useEffect, useState } from 'react'
import { Phone, Mail, Save, Plus, Trash2, Instagram, Facebook, Youtube } from 'lucide-react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import Spinner from '../components/Spinner'

const SOCIAL_ICONS = {
  instagram: <Instagram size={16} />,
  facebook: <Facebook size={16} />,
  youtube: <Youtube size={16} />,
}

const DEFAULT_FOOTER = {
  tagline: 'Trusted pet grooming in Pune. We treat your pets with love, care, and professional expertise.',
  phones: [
    { number: '8446314149', isWhatsapp: true },
    { number: '9325475703', isWhatsapp: false },
  ],
  email: 'pawpawgrooming@gmail.com',
  socials: [
    { platform: 'instagram', url: 'https://www.instagram.com/thetails.in' },
    { platform: 'facebook', url: 'https://www.facebook.com' },
  ],
}

export default function AdminFooter() {
  const [footer, setFooter] = useState(DEFAULT_FOOTER)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchFooter() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'footerInfo'))
        if (snap.exists()) {
          setFooter(prev => ({ ...prev, ...snap.data() }))
        }
      } catch (err) {
        setError('Could not load footer info.')
      }
      setLoading(false)
    }
    fetchFooter()
  }, [])

  const updateField = (key, value) => {
    setFooter(prev => ({ ...prev, [key]: value }))
  }

  const updatePhone = (index, key, value) => {
    setFooter(prev => ({
      ...prev,
      phones: prev.phones.map((p, i) => i === index ? { ...p, [key]: value } : p),
    }))
  }

  const removePhone = (index) => {
    setFooter(prev => ({
      ...prev,
      phones: prev.phones.filter((_, i) => i !== index),
    }))
  }

  const addPhone = () => {
    setFooter(prev => ({
      ...prev,
      phones: [...prev.phones, { number: '', isWhatsapp: false }],
    }))
  }

  const updateSocial = (index, key, value) => {
    setFooter(prev => ({
      ...prev,
      socials: prev.socials.map((s, i) => i === index ? { ...s, [key]: value } : s),
    }))
  }

  const removeSocial = (index) => {
    setFooter(prev => ({
      ...prev,
      socials: prev.socials.filter((_, i) => i !== index),
    }))
  }

  const addSocial = () => {
    setFooter(prev => ({
      ...prev,
      socials: [...prev.socials, { platform: 'instagram', url: '' }],
    }))
  }

  const save = async () => {
    setError('')
    setMessage('')

    if (!footer.tagline.trim() || !footer.email.trim() || footer.phones.some(p => !p.number.trim())) {
      setError('Please fill in all required fields.')
      return
    }

    if (footer.phones.filter(p => p.isWhatsapp).length === 0) {
      setError('Please mark at least one phone number for WhatsApp.')
      return
    }

    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'footerInfo'), {
        tagline: footer.tagline.trim(),
        phones: footer.phones.map(p => ({
          number: p.number.trim(),
          isWhatsapp: Boolean(p.isWhatsapp),
        })),
        email: footer.email.trim(),
        socials: footer.socials
          .filter(s => s.url.trim())
          .map(s => ({
            platform: s.platform,
            url: s.url.trim(),
          })),
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setMessage('Footer information updated successfully!')
    } catch (err) {
      setError(err.message || 'Could not save footer info.')
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

  if (loading) return <div style={{ padding: '28px' }}><Spinner text="Loading footer info..." /></div>

  return (
    <div style={{ padding: '28px' }}>
      <h1 style={{ color: 'var(--text)', fontSize: '24px', fontWeight: 700, marginBottom: '6px' }}>Footer Settings</h1>
      <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '28px' }}>
        Manage footer content, contact details, and social media links.
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

      <div style={{ display: 'grid', gap: '28px', maxWidth: '700px' }}>
        {/* Tagline */}
        <div>
          <label style={labelStyle}>Tagline / Description</label>
          <textarea
            value={footer.tagline}
            onChange={e => updateField('tagline', e.target.value)}
            placeholder="Business tagline that appears in footer"
            style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
          />
        </div>

        {/* Phone Numbers */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Phone size={12} /> Phone Numbers
              </span>
            </label>
            <button
              onClick={addPhone}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--accent)',
                background: 'transparent',
                color: 'var(--accent)',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              <Plus size={14} /> Add Phone
            </button>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {footer.phones.map((phone, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '10px', alignItems: 'center', padding: '12px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <input
                  type="text"
                  value={phone.number}
                  onChange={e => updatePhone(idx, 'number', e.target.value)}
                  placeholder="Phone number"
                  style={{ ...inputStyle, margin: 0 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--muted)' }}>
                  <input
                    type="checkbox"
                    checked={phone.isWhatsapp}
                    onChange={e => updatePhone(idx, 'isWhatsapp', e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  WhatsApp
                </label>
                <button
                  onClick={() => removePhone(idx)}
                  style={{ padding: '8px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
            Mark at least one number with WhatsApp checkbox for WhatsApp routing.
          </p>
        </div>

        {/* Email */}
        <div>
          <label style={labelStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Mail size={12} /> Email Address
            </span>
          </label>
          <input
            type="email"
            value={footer.email}
            onChange={e => updateField('email', e.target.value)}
            placeholder="contact@example.com"
            style={inputStyle}
          />
        </div>

        {/* Social Media */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Social Media Links</label>
            <button
              onClick={addSocial}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--accent)',
                background: 'transparent',
                color: 'var(--accent)',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              <Plus size={14} /> Add Social
            </button>
          </div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {footer.socials.map((social, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '10px', alignItems: 'center', padding: '12px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <select
                  value={social.platform}
                  onChange={e => updateSocial(idx, 'platform', e.target.value)}
                  style={{ ...inputStyle, margin: 0 }}
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="youtube">YouTube</option>
                  <option value="twitter">Twitter</option>
                  <option value="linkedin">LinkedIn</option>
                </select>
                <input
                  type="text"
                  value={social.url}
                  onChange={e => updateSocial(idx, 'url', e.target.value)}
                  placeholder="https://..."
                  style={{ ...inputStyle, margin: 0 }}
                />
                <button
                  onClick={() => removeSocial(idx)}
                  style={{ padding: '8px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '28px', maxWidth: '700px' }}>
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
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', maxWidth: '700px' }}>
          <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '16px' }}>{footer.tagline}</p>
          <div style={{ display: 'grid', gap: '10px', fontSize: '13px' }}>
            {footer.phones.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Phone size={14} style={{ color: 'var(--accent)' }} />
                <a href={`tel:${p.number}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                  {p.number}
                </a>
                {p.isWhatsapp && <span style={{ fontSize: '11px', background: 'var(--accent-bg)', padding: '2px 8px', borderRadius: '4px', color: 'var(--accent)' }}>WhatsApp</span>}
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={14} style={{ color: 'var(--accent)' }} />
              <a href={`mailto:${footer.email}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                {footer.email}
              </a>
            </div>
            {footer.socials.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                {footer.socials.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                    {SOCIAL_ICONS[s.platform] || '🔗'}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
