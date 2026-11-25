// src/components/AdminErrorBoundary.jsx
import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class AdminErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[AdminErrorBoundary] Caught tab error:', error, errorInfo)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            <AlertTriangle size={28} />
          </div>
          <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: '22px', fontWeight: 700, color: 'var(--text)', margin: '0 0 8px 0' }}>
            Couldn't load this section
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '13px', maxWidth: '420px', lineHeight: 1.6, margin: '0 0 20px 0' }}>
            A temporary network issue or updated app version prevented this tab from loading properly.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={this.handleReload}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}
          >
            <RefreshCw size={15} /> Reload Tab
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
