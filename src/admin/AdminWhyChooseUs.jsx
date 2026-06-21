import { useEffect, useState } from 'react'
import { Award, Clock, Save, Shield, Star, Trash2 } from 'lucide-react'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import ConfirmModal from '../components/ConfirmModal'
import { DEFAULT_FEATURES, normalizeFeature } from '../utils/siteContent'

const ICONS = [
  { value: 'award', label: 'Award', icon: <Award size={18} /> },
  { value: 'shield', label: 'Shield', icon: <Shield size={18} /> },
  { value: 'clock', label: 'Clock', icon: <Clock size={18} /> },
  { value: 'star', label: 'Star', icon: <Star size={18} /> },
]

export default function AdminWhyChooseUs() {
  const [features, setFeatures] = useState(DEFAULT_FEATURES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [hasSavedContent, setHasSavedContent] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    async function fetchContent() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'whyChooseUs'))
        const saved = snap.exists() && Array.isArray(snap.data().features) ? snap.data().features : []
        setHasSavedContent(saved.length > 0)
        setFeatures(DEFAULT_FEATURES.map((fallback, index) => normalizeFeature(saved[index], fallback)))
      } catch {
        setError('Could not load Why Choose Us content.')
      }
      setLoading(false)
    }
    fetchContent()
  }, [])

  const updateFeature = (index, key, value) => {
    setFeatures(prev => prev.map((feature, i) => i === index ? { ...feature, [key]: value } : feature))
  }

  const save = async () => {
    setError('')
    setMessage('')
    const cleanFeatures = features.map((feature, index) => {
      const normalized = normalizeFeature(feature, DEFAULT_FEATURES[index])
      return {
        icon: ICONS.some(icon => icon.value === normalized.icon) ? normalized.icon : DEFAULT_FEATURES[index].icon,
        title: normalized.title.trim(),
        desc: normalized.desc.trim(),
      }
    })

    if (cleanFeatures.some(feature => !feature.title || !feature.desc)) {
      setError('Please fill title and description for all 3 cards.')
      return
    }

    setSaving(true)
    try {
      await setDoc(doc(db, 'settings', 'whyChooseUs'), {
        features: cleanFeatures,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setHasSavedContent(true)
      setMessage('Why Choose Us cards updated.')
    } catch (err) {
      setError(err.message || 'Could not save content.')
    }
    setSaving(false)
  }

  const reset = async () => {
    setError('')
    setMessage('')
    setSaving(true)
    try {
      await deleteDoc(doc(db, 'settings', 'whyChooseUs'))
      setFeatures(DEFAULT_FEATURES)
      setHasSavedContent(false)
      setConfirmReset(false)
      setMessage('Default cards restored.')
    } catch (err) {
      setError(err.message || 'Could not reset content.')
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

  if (loading) return <div style={{ padding: '28px' }}><Spinner text="Loading content..." /></div>

  return (
    <div style={{ padding: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Why Choose Us</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Manage the 3 trust cards shown on the home page.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {hasSavedContent && (
            <button onClick={() => setConfirmReset(true)} disabled={saving} className="btn btn-secondary" style={{ fontSize: '13px', padding: '10px 16px' }}>
              <Trash2 size={16} /> Reset
            </button>
          )}
          <button onClick={save} disabled={saving} className="btn btn-primary" style={{ fontSize: '13px', padding: '10px 18px' }}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Cards'}
          </button>
        </div>
      </div>

      {(message || error) && (
        <div style={{ background: error ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)', border: `1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.25)'}`, color: error ? '#ef4444' : '#34d399', fontSize: '13px', padding: '12px 14px', borderRadius: '12px', marginBottom: '18px' }}>
          {error || message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {features.map((feature, index) => (
          <div key={index} className="card" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <strong style={{ color: 'var(--text)', fontSize: '14px' }}>Card {index + 1}</strong>
              <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {ICONS.find(icon => icon.value === feature.icon)?.icon || <Star size={18} />}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Icon</label>
                <select className="input" value={feature.icon} onChange={e => updateFeature(index, 'icon', e.target.value)}>
                  {ICONS.map(icon => <option key={icon.value} value={icon.value}>{icon.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Title</label>
                <input className="input" value={feature.title} onChange={e => updateFeature(index, 'title', e.target.value)} placeholder="Card title" />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea className="input" rows={4} value={feature.desc} onChange={e => updateFeature(index, 'desc', e.target.value)} placeholder="Short description" style={{ resize: 'vertical' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <ConfirmModal
        open={confirmReset}
        title="Reset cards?"
        message="Are you sure you want to reset these cards to the default home page content?"
        confirmText="Reset"
        danger={false}
        loading={saving}
        onCancel={() => setConfirmReset(false)}
        onConfirm={reset}
      />
    </div>
  )
}
