// src/admin/AdminSuperCoins.jsx
import { useEffect, useState } from 'react'
import {
  Coins,
  Save,
  Sparkles,
  Percent,
  IndianRupee,
  ShieldCheck,
  Footprints,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import {
  DEFAULT_SUPERCOIN_SETTINGS,
  fetchSuperCoinSettings,
  saveSuperCoinSettings,
} from '../utils/superCoins'

export default function AdminSuperCoins() {
  const [settings, setSettings] = useState(DEFAULT_SUPERCOIN_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [showExample, setShowExample] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const data = await fetchSuperCoinSettings(db, true)
        if (mounted && data) {
          setSettings(data)
        }
      } catch (err) {
        console.error('Failed to load SuperCoin settings:', err)
        setToastType('error')
        setToastMessage('Failed to load SuperCoins settings.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveSuperCoinSettings(db, settings)
      setToastType('success')
      setToastMessage(
        settings.enabled
          ? `Saved: SuperCoins loyalty settings updated successfully (Max ${settings.maxRedeemPercentage}% discount cap).`
          : 'Saved: SuperCoins loyalty program disabled.'
      )
    } catch (err) {
      console.error('Failed to save SuperCoin settings:', err)
      setToastType('error')
      setToastMessage('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '360px' }}>
        <Spinner size={32} />
      </div>
    )
  }

  return (
    <div className="admin-page admin-supercoins-page" style={{ maxWidth: '1020px', margin: '0 auto', width: '100%', boxSizing: 'border-box', paddingBottom: '100px' }}>
      {/* Toast Feedback */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setToastMessage('')}
        />
      )}

      {/* MASTER TOGGLE & BANNER */}
      <section
        style={{
          background: 'var(--card)',
          border: '1.5px solid var(--border)',
          borderRadius: '18px',
          padding: '20px',
          boxShadow: '0 4px 18px rgba(0,0,0,0.03)',
          marginBottom: '18px',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
            padding: '14px 16px',
            borderRadius: '14px',
            background: settings.enabled ? '#F0FDF4' : '#F9FAFB',
            border: `1.5px solid ${settings.enabled ? '#86EFAC' : '#E5E7EB'}`,
            transition: 'all 0.2s ease',
            boxSizing: 'border-box',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: settings.enabled ? '#DCFCE7' : '#F3F4F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: settings.enabled ? '#16A34A' : '#6B7280',
                flexShrink: 0,
              }}
            >
              <Coins size={22} />
            </div>
            <h1 style={{ fontSize: '18px', color: settings.enabled ? '#14532D' : '#374151', fontWeight: 800, margin: 0 }}>
              SuperCoins Loyalty
            </h1>
          </div>

          {/* Green Active/Inactive Toggle Switch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 800,
                color: settings.enabled ? '#15803D' : '#6B7280',
                userSelect: 'none',
              }}
            >
              {settings.enabled ? 'Program Active' : 'Program Inactive'}
            </span>

            <button
              type="button"
              role="switch"
              aria-checked={Boolean(settings.enabled)}
              aria-label="Toggle SuperCoins Loyalty Program Active or Inactive"
              onClick={() => setSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
              style={{
                position: 'relative',
                width: '54px',
                height: '30px',
                borderRadius: '999px',
                border: `2px solid ${settings.enabled ? '#059669' : '#D1D5DB'}`,
                backgroundColor: settings.enabled ? '#10B981' : '#E5E7EB',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                outline: 'none',
                boxShadow: settings.enabled
                  ? '0 2px 10px rgba(16, 185, 129, 0.35)'
                  : 'none',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: settings.enabled ? '26px' : '3px',
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            </button>
          </div>
        </div>

        {/* CLICKABLE LABEL FOR CUSTOMER EXPERIENCE EXAMPLE */}
        <div style={{ marginTop: '12px' }}>
          <button
            type="button"
            onClick={() => setShowExample(p => !p)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12.5px',
              fontWeight: 700,
              color: '#B45309',
            }}
          >
            <Sparkles size={14} color="#D97706" />
            <span>Customer Experience Example</span>
            {showExample ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showExample && (
            <div
              style={{
                marginTop: '8px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: '#FEF3C7',
                border: '1px solid #FDE68A',
                fontSize: '12.5px',
                color: '#92400E',
                lineHeight: 1.5,
                boxSizing: 'border-box',
                width: '100%',
              }}
            >
              <strong>How it works:</strong> If a customer books a <strong>₹1,000</strong> service:
              they can redeem up to <strong>{settings.maxRedeemPercentage}% (max {Math.round(1000 * (settings.maxRedeemPercentage / 100))} SuperCoins = ₹{Math.round(1000 * (settings.maxRedeemPercentage / 100))} OFF)</strong> at checkout.
              Once completed, they earn <strong>{Math.round(1000 * (settings.earnPercentage / 100))} SuperCoins ({settings.earnPercentage}% cashback)</strong> into their Paw Paw profile!
            </div>
          )}
        </div>
      </section>

      {/* SECTION 1: REDEMPTION & CHECKOUT RULES */}
      <section
        style={{
          background: 'var(--card)',
          border: '1.5px solid var(--border)',
          borderRadius: '18px',
          padding: '22px',
          boxShadow: '0 4px 18px rgba(0,0,0,0.03)',
          marginBottom: '20px',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706', flexShrink: 0 }}>
            <Coins size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--text)' }}>
              Redemption & Checkout Rules
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
              Control how many SuperCoins a customer can use during checkout across Grooming, Walking, and Boarding.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '14px', width: '100%', boxSizing: 'border-box' }}>
          {/* Max Redeem Percentage */}
          <div style={{ background: 'var(--surface)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', boxSizing: 'border-box' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              Max Redemption Cap (% of Bill)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min="1"
                max="100"
                value={settings.maxRedeemPercentage}
                onChange={e => {
                  const val = Math.max(1, Math.min(100, Number(e.target.value) || 1))
                  setSettings(p => ({ ...p, maxRedeemPercentage: val }))
                }}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 800, fontSize: '14px', boxSizing: 'border-box' }}
              />
              <span style={{ fontWeight: 800, fontSize: '15px', color: '#D97706' }}>%</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
              Default is 100% so user can freely redeem their full coin balance up to total bill.
            </span>
          </div>

          {/* Coin Value in Rupees */}
          <div style={{ background: 'var(--surface)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', boxSizing: 'border-box' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              Coin Value (1 SuperCoin = ₹)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '15px', color: '#D97706' }}>₹</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={settings.coinValueInRupees}
                onChange={e => setSettings(p => ({ ...p, coinValueInRupees: Math.max(0.1, Number(e.target.value) || 1) }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 800, fontSize: '14px', boxSizing: 'border-box' }}
              />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
              Recommended: ₹1 for clean and simple user redemption.
            </span>
          </div>

          {/* Min Balance to Redeem */}
          <div style={{ background: 'var(--surface)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', boxSizing: 'border-box' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              Min Balance Required to Redeem
            </label>
            <input
              type="number"
              min="0"
              value={settings.minCoinsToRedeem}
              onChange={e => setSettings(p => ({ ...p, minCoinsToRedeem: Math.max(0, Number(e.target.value) || 0) }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 800, fontSize: '14px', boxSizing: 'border-box' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
              Customer must have at least these many coins to apply discount.
            </span>
          </div>

          {/* Max Coins Per Booking */}
          <div style={{ background: 'var(--surface)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', boxSizing: 'border-box' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              Max Coins Redeemable Per Booking
            </label>
            <input
              type="number"
              min="10"
              value={settings.maxRedeemPerBooking}
              onChange={e => setSettings(p => ({ ...p, maxRedeemPerBooking: Math.max(10, Number(e.target.value) || 500) }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 800, fontSize: '14px', boxSizing: 'border-box' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
              Upper ceiling cap to protect high-ticket bookings.
            </span>
          </div>
        </div>
      </section>

      {/* SECTION 2: EARNING RULES & SUBSCRIPTION MODE */}
      <section
        style={{
          background: 'var(--card)',
          border: '1.5px solid var(--border)',
          borderRadius: '18px',
          padding: '22px',
          boxShadow: '0 4px 18px rgba(0,0,0,0.03)',
          marginBottom: '20px',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A', flexShrink: 0 }}>
            <Coins size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--text)' }}>
              Earning Rules & Walking Pass Management
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
              Specify how coins are credited when bookings and multi-day dog walking passes complete.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '14px', marginBottom: '18px', width: '100%', boxSizing: 'border-box' }}>
          {/* Earn Percentage */}
          <div style={{ background: 'var(--surface)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', boxSizing: 'border-box' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              Cashback Earn Percentage
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min="0"
                max="50"
                value={settings.earnPercentage}
                onChange={e => setSettings(p => ({ ...p, earnPercentage: Math.max(0, Math.min(50, Number(e.target.value) || 0)) }))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 800, fontSize: '14px', boxSizing: 'border-box' }}
              />
              <span style={{ fontWeight: 800, fontSize: '15px', color: '#D97706' }}>%</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
              E.g. 5% means 5 SuperCoins earned per ₹100 spent on completed orders.
            </span>
          </div>

          {/* Min Booking to Earn */}
          <div style={{ background: 'var(--surface)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', boxSizing: 'border-box' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              Min Booking Amount to Earn (₹)
            </label>
            <input
              type="number"
              min="0"
              value={settings.minBookingAmountToEarn}
              onChange={e => setSettings(p => ({ ...p, minBookingAmountToEarn: Math.max(0, Number(e.target.value) || 0) }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 800, fontSize: '14px', boxSizing: 'border-box' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
              Orders below this total will not generate SuperCoins.
            </span>
          </div>

          {/* Max Earn Per Booking */}
          <div style={{ background: 'var(--surface)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', boxSizing: 'border-box' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
              Max Coins Earned in Single Booking
            </label>
            <input
              type="number"
              min="10"
              value={settings.maxEarnPerBooking}
              onChange={e => setSettings(p => ({ ...p, maxEarnPerBooking: Math.max(10, Number(e.target.value) || 500) }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 800, fontSize: '14px', boxSizing: 'border-box' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
              Maximum limit of coins earned on any individual order.
            </span>
          </div>
        </div>

        {/* Walking Subscription Strategy Selection - Full width stacked vertical cards */}
        <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border)', boxSizing: 'border-box', width: '100%' }}>
          <label style={{ fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Footprints size={16} color="var(--accent)" />
            Dog Walking Pass Credit Mode
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '12px',
                border: settings.walkingCreditMode === 'per_walk' ? '1.5px solid #D97706' : '1px solid var(--border)',
                background: settings.walkingCreditMode === 'per_walk' ? '#FFFDF5' : 'var(--card)',
                cursor: 'pointer',
                boxSizing: 'border-box',
                width: '100%',
                transition: 'all 0.15s ease',
              }}
            >
              <input
                type="radio"
                name="walkingCreditMode"
                value="per_walk"
                checked={settings.walkingCreditMode === 'per_walk'}
                onChange={() => setSettings(p => ({ ...p, walkingCreditMode: 'per_walk' }))}
                style={{ marginTop: '3px', accentColor: '#D97706', cursor: 'pointer' }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ fontSize: '13px', color: '#92400E', display: 'block' }}>
                  Pro-Rata Per Walk (Recommended)
                </strong>
                <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.4 }}>
                  Credits coins daily right after walker finishes each walk. Gives customers daily instant delight!
                </p>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '12px',
                border: settings.walkingCreditMode === 'on_pass_complete' ? '1.5px solid #D97706' : '1px solid var(--border)',
                background: settings.walkingCreditMode === 'on_pass_complete' ? '#FFFDF5' : 'var(--card)',
                cursor: 'pointer',
                boxSizing: 'border-box',
                width: '100%',
                transition: 'all 0.15s ease',
              }}
            >
              <input
                type="radio"
                name="walkingCreditMode"
                value="on_pass_complete"
                checked={settings.walkingCreditMode === 'on_pass_complete'}
                onChange={() => setSettings(p => ({ ...p, walkingCreditMode: 'on_pass_complete' }))}
                style={{ marginTop: '3px', accentColor: '#D97706', cursor: 'pointer' }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ fontSize: '13px', color: '#92400E', display: 'block' }}>
                  After Full Pass Completes
                </strong>
                <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.4 }}>
                  Credits total pass coins in one lump sum only when all scheduled walks in the pass have finished.
                </p>
              </div>
            </label>
          </div>
        </div>
      </section>

      {/* SECTION 3: CUSTOMER LOYALTY TIERS */}
      <section
        style={{
          background: 'var(--card)',
          border: '1.5px solid var(--border)',
          borderRadius: '18px',
          padding: '22px',
          boxShadow: '0 4px 18px rgba(0,0,0,0.03)',
          marginBottom: '20px',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED', flexShrink: 0 }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--text)' }}>
              Customer Loyalty Tier Milestones
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
              Tier progress is shown on customer profiles. Higher tiers earn bonus coin multipliers.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '16px', width: '100%', boxSizing: 'border-box' }}>
          {/* Silver Tier */}
          <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <strong style={{ fontSize: '14px', color: '#4338CA' }}>✨ Silver Tier</strong>
              <span style={{ fontSize: '11px', fontWeight: 800, background: '#E0E7FF', color: '#3730A3', padding: '2px 8px', borderRadius: '999px' }}>TIER 2</span>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Bookings to Reach</label>
              <input
                type="number"
                min="1"
                value={settings.tiers?.silverThreshold || 5}
                onChange={e => setSettings(p => ({ ...p, tiers: { ...p.tiers, silverThreshold: Math.max(1, Number(e.target.value) || 5) } }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 800, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Earning Multiplier (e.g. 1.2x)</label>
              <input
                type="number"
                step="0.1"
                min="1"
                value={settings.tiers?.silverMultiplier || 1.2}
                onChange={e => setSettings(p => ({ ...p, tiers: { ...p.tiers, silverMultiplier: Math.max(1, Number(e.target.value) || 1.2) } }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 800, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Gold Tier */}
          <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <strong style={{ fontSize: '14px', color: '#B45309' }}>👑 Gold Tier</strong>
              <span style={{ fontSize: '11px', fontWeight: 800, background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: '999px' }}>VIP TIER 3</span>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Bookings to Reach</label>
              <input
                type="number"
                min="2"
                value={settings.tiers?.goldThreshold || 15}
                onChange={e => setSettings(p => ({ ...p, tiers: { ...p.tiers, goldThreshold: Math.max(2, Number(e.target.value) || 15) } }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 800, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Earning Multiplier (e.g. 1.5x)</label>
              <input
                type="number"
                step="0.1"
                min="1"
                value={settings.tiers?.goldMultiplier || 1.5}
                onChange={e => setSettings(p => ({ ...p, tiers: { ...p.tiers, goldMultiplier: Math.max(1, Number(e.target.value) || 1.5) } }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontWeight: 800, boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Floating Save Button matching Common Settings */}
      <div className="admin-common-floating-save">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="admin-floating-save-btn"
          aria-label="Save Settings"
        >
          <Save size={17} />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>
    </div>
  )
}
