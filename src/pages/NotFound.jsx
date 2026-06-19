// src/pages/NotFound.jsx
import { Link, useNavigate } from 'react-router-dom'
export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:'80px 20px' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:'80px', marginBottom:'16px', animation:'float 4s ease-in-out infinite' }}>🐾</div>
        <h1 style={{ fontFamily:'"Playfair Display",serif', fontSize:'80px', fontWeight:900, background:'var(--gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1 }}>404</h1>
        <h2 style={{ color:'var(--text)', fontSize:'22px', fontWeight:700, margin:'12px 0 8px' }}>Page Not Found</h2>
        <p style={{ color:'var(--muted)', fontSize:'14px', marginBottom:'32px' }}>Looks like this page ran away! Let's get you back on track.</p>
        <div style={{ display:'flex', gap:'12px', justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={() => navigate(-1)} className="btn btn-secondary">← Go Back</button>
          <Link to="/" className="btn btn-primary">Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
