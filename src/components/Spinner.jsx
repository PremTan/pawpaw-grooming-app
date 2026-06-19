// src/components/Spinner.jsx
export default function Spinner({ text = 'Loading...' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: '16px' }}>
      <div style={{ position: 'relative', width: '44px', height: '44px' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid var(--border)' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid transparent', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
      </div>
      {text && <p style={{ color: 'var(--muted)', fontSize: '13px' }}>{text}</p>}
    </div>
  )
}
