// src/pages/Team.jsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, orderBy, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
import {
  Award,
  Calendar,
  CheckCircle2,
  Crown,
  Footprints,
  Heart,
  PawPrint,
  Scissors,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'

export default function Team() {
  const { user, profile, isAdmin } = useAuth() || {}
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all')
  const [sectionSettings, setSectionSettings] = useState({
    badge: 'Certified & Passionate',
    title: 'Meet Our Pet Care Team',
    description: "Certified groomers, dedicated walkers, and caretakers devoted to your pet's happiness.",
    ownerName: 'Prem Tandalekar',
    ownerRole: 'Founder & Pet Care Director',
    ownerPhotoUrl: '',
    ownerExperience: '6+ Years in Professional Pet Care',
    ownerBio: 'Founded Paw Paw with one simple philosophy: treat every furry companion as if they were our own. Gentle, fear-free grooming and loving pet care you can trust.',
    showOwner: true,
  })

  useEffect(() => {
    async function fetchTeam() {
      try {
        const [teamSnap, settingsSnap] = await Promise.allSettled([
          getDocs(query(collection(db, 'teamMembers'), orderBy('createdAt', 'desc'))),
          getDoc(doc(db, 'settings', 'teamSection')),
        ])

        let rows = []
        if (teamSnap.status === 'fulfilled') {
          rows = teamSnap.value.docs.map(d => ({ id: d.id, ...d.data() }))
        } else {
          try {
            const fallbackSnap = await getDocs(collection(db, 'teamMembers'))
            rows = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          } catch {}
        }

        let loadedSettings = null
        if (settingsSnap.status === 'fulfilled' && settingsSnap.value?.exists?.()) {
          loadedSettings = settingsSnap.value.data()
          setSectionSettings(prev => ({ ...prev, ...loadedSettings }))
        }

        // Auto-save admin/owner photo if missing in Firestore settings
        const currentAdminPhoto = profile?.photoURL || user?.photoURL || ''
        if (isAdmin && currentAdminPhoto && (!loadedSettings?.ownerPhotoUrl)) {
          setDoc(doc(db, 'settings', 'teamSection'), {
            ownerPhotoUrl: currentAdminPhoto,
            updatedAt: serverTimestamp(),
          }, { merge: true }).catch(() => {})
        }

        // Only show active members who haven't been hidden from the website
        let publicMembers = rows.filter(m => m.active !== false && m.showOnWeb !== false)

        // Sort by admin order if set
        publicMembers.sort((a, b) => {
          const orderA = typeof a.order === 'number' ? a.order : (typeof a.homeOrder === 'number' ? a.homeOrder : 999)
          const orderB = typeof b.order === 'number' ? b.order : (typeof b.homeOrder === 'number' ? b.homeOrder : 999)
          return orderA - orderB
        })

        setMembers(publicMembers)
      } catch (err) {
        console.error('Failed to fetch team members:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTeam()
  }, [])

  // Dynamic filter tags based on available roles
  const roleFilters = useMemo(() => {
    const list = [{ id: 'all', label: 'All Specialists' }]
    const hasGroomers = members.some(m => (m.role || '').toLowerCase().includes('groom'))
    const hasWalkers = members.some(m => (m.role || '').toLowerCase().includes('walk'))
    const hasBoarding = members.some(m => (m.role || '').toLowerCase().includes('board') || (m.role || '').toLowerCase().includes('care'))

    if (hasGroomers) list.push({ id: 'groomer', label: 'Grooming Experts' })
    if (hasWalkers) list.push({ id: 'walker', label: 'Dog Walkers' })
    if (hasBoarding) list.push({ id: 'boarding', label: 'Boarding Care' })

    return list
  }, [members])

  const adminPhoto = profile?.photoURL || user?.photoURL || ''
  const founderMember = useMemo(() => {
    return members.find(m =>
      (m.name || '').toLowerCase().includes('prem') ||
      (m.role || '').toLowerCase().includes('founder') ||
      (m.role || '').toLowerCase().includes('director') ||
      m.isOwner
    )
  }, [members])
  const founderPhoto = sectionSettings.ownerPhotoUrl || adminPhoto || founderMember?.photoUrl || ''

  const filteredMembers = useMemo(() => {
    if (selectedRoleFilter === 'all') return members
    return members.filter(m => {
      const r = (m.role || '').toLowerCase()
      if (selectedRoleFilter === 'groomer') return r.includes('groom')
      if (selectedRoleFilter === 'walker') return r.includes('walk')
      if (selectedRoleFilter === 'boarding') return r.includes('board') || r.includes('care')
      return true
    })
  }, [members, selectedRoleFilter])

  const getRoleBadgeStyle = (role = '') => {
    const r = role.toLowerCase()
    if (r.includes('walker')) {
      return { background: '#ECFDF5', color: '#047857', border: '1.5px solid #86EFAC', icon: <Footprints size={12} /> }
    }
    if (r.includes('groom')) {
      return { background: '#FFFBEB', color: '#B45309', border: '1.5px solid #FCD34D', icon: <Scissors size={12} /> }
    }
    if (r.includes('board') || r.includes('care')) {
      return { background: '#EFF6FF', color: '#1D4ED8', border: '1.5px solid #93C5FD', icon: <Calendar size={12} /> }
    }
    if (r.includes('manager') || r.includes('lead')) {
      return { background: '#FEF3C7', color: '#92400E', border: '1.5px solid #FDE68A', icon: <Award size={12} /> }
    }
    return { background: '#F8FAFC', color: '#334155', border: '1.5px solid #CBD5E1', icon: <PawPrint size={12} /> }
  }

  const getTopStripe = (role = '') => {
    const r = role.toLowerCase()
    if (r.includes('walker')) return 'linear-gradient(90deg, #10B981, #059669)'
    if (r.includes('groom')) return 'linear-gradient(90deg, #F59E0B, #D97706)'
    if (r.includes('board') || r.includes('care')) return 'linear-gradient(90deg, #3B82F6, #1D4ED8)'
    return 'linear-gradient(90deg, var(--accent), var(--accent-hover, #B45309))'
  }

  const getFallbackBio = (role = '') => {
    const r = role.toLowerCase()
    if (r.includes('walker')) return 'Specializes in active leash walks, positive reinforcement, and safe hydration breaks.'
    if (r.includes('groom')) return 'Specializes in gentle handling, breed styling, and calm, stress-free spa baths.'
    if (r.includes('board') || r.includes('care')) return 'Dedicated to 24/7 attentive care, fun playtime routines, and cozy companionship.'
    return 'Dedicated to treating every pet with patient kindness, safety, and loving care.'
  }

  const getSkillTags = (role = '') => {
    const r = role.toLowerCase()
    if (r.includes('walker')) return ['🐾 Leash Training', '📍 GPS Tracked', '💧 Hydration Care']
    if (r.includes('groom')) return ['✂️ Breed Styling', '🛁 Spa Baths', '🌸 Fear-Free']
    if (r.includes('board') || r.includes('care')) return ['🏡 24/7 Supervision', '🎾 Playtime Care', '🩺 Safety First']
    return ['⭐ Pet Safety', '❤️ Fear-Free Care', '🐶 Loved by Dogs']
  }

  const getBookingAction = (role = '') => {
    const r = role.toLowerCase()
    if (r.includes('walker')) {
      return { path: '/walking', label: 'Book Dog Walking', icon: <Footprints size={13} /> }
    }
    if (r.includes('board') || r.includes('care')) {
      return { path: '/boarding', label: 'Book Boarding', icon: <Calendar size={13} /> }
    }
    return { path: '/book', label: 'Book Grooming', icon: <Scissors size={13} /> }
  }

  return (
    <div className="team-page" style={{ background: 'var(--bg)', paddingTop: 'var(--navbar-height, 98px)', minHeight: '100vh', transition: 'padding-top 0.25s ease' }}>
      <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '20px 16px 80px' }}>

        {/* Header - Compact 2-Line Description for Mobile */}
        <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 20px' }}>
          <p className="section-label" style={{ marginBottom: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', letterSpacing: '0.6px' }}>
            <PawPrint size={12} /> {sectionSettings.badge || 'THE PAW PAW FAMILY'} <PawPrint size={12} />
          </p>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(24px, 4.5vw, 40px)', fontWeight: 800, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.15 }}>
            {sectionSettings.title || 'Meet Our Pet Care Team'}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.45, margin: '0 auto', maxWidth: '440px' }}>
            {sectionSettings.description || "Certified groomers, dedicated walkers, and caretakers devoted to your pet's happiness."}
          </p>
        </div>

        {/* Role Filter Tabs - Strict Single Line with Horizontal Swipe on Mobile */}
        {roleFilters.length > 1 && (
          <div className="team-filters-wrapper">
            <div className="team-filters-row">
              {roleFilters.map(tab => {
                const active = selectedRoleFilter === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedRoleFilter(tab.id)}
                    className={`team-filter-pill ${active ? 'active' : ''}`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Featured Founder & Leadership Card */}
        {sectionSettings.showOwner !== false && (selectedRoleFilter === 'all') && (
          <div className="card" style={{
            background: 'linear-gradient(135deg, var(--card) 0%, var(--surface) 100%)',
            border: '1.5px solid var(--accent)',
            borderRadius: '24px',
            padding: '24px 20px',
            marginBottom: '32px',
            boxShadow: '0 12px 36px rgba(217, 119, 6, 0.12)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              color: '#FFFFFF',
              fontSize: '10px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              padding: '4px 14px',
              borderBottomLeftRadius: '12px',
            }}>
              🐾 Leadership & Founder
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{
                width: '92px',
                height: '92px',
                borderRadius: '50%',
                padding: '3px',
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 60%, #B45309 100%)',
                flexShrink: 0,
                boxShadow: '0 8px 24px rgba(217, 119, 6, 0.3)',
              }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'var(--card)', border: '2px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {founderPhoto ? (
                    <img
                      src={founderPhoto}
                      alt={sectionSettings.ownerName || 'Founder & Director'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#FFFBEB', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Crown size={38} />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <h3 style={{ fontSize: '19px', fontWeight: 900, color: 'var(--text)', margin: 0 }}>
                    {sectionSettings.ownerName || 'Prem Tandalekar'}
                  </h3>
                  <span style={{ fontSize: '11px', fontWeight: 800, background: '#FFFBEB', color: '#B45309', border: '1px solid #FCD34D', padding: '2px 8px', borderRadius: '999px' }}>
                    {sectionSettings.ownerRole || 'Founder & Pet Care Director'}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <Sparkles size={11} /> {sectionSettings.ownerExperience || '6+ Years Experience'}
                  </span>
                </div>

                <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5, margin: '6px 0 12px', fontStyle: 'italic' }}>
                  "{sectionSettings.ownerBio || 'Founded Paw Paw with one simple philosophy: treat every furry companion as if they were our own. Gentle, fear-free grooming and loving pet care you can trust.'}"
                </p>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, background: 'var(--card)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--text)' }}>
                    <ShieldCheck size={13} color="var(--accent)" /> Certified Director
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, background: 'var(--card)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--text)' }}>
                    <Heart size={13} color="#ec4899" /> 100% Gentle & Cage-Free
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: 700, background: 'var(--card)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--text)' }}>
                    <Star size={13} fill="#f59e0b" color="#f59e0b" /> Pune Pet Parents' Choice
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content State */}
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <Spinner text="Loading pet care team..." />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '50px 24px',
            background: 'var(--card)',
            border: '1.5px dashed var(--border)',
            borderRadius: '20px',
            maxWidth: '520px',
            margin: '0 auto',
          }}>
            <PawPrint size={40} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
              Our Team is Growing!
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5, marginBottom: '20px' }}>
              We are adding new certified groomers and pet lovers to our pack. Feel free to book an appointment or visit us in person.
            </p>
            <Link to="/book" className="btn btn-primary">
              Book Appointment <Calendar size={15} />
            </Link>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: '24px',
            marginBottom: '46px',
          }}>
            {filteredMembers.map((member) => {
              const badge = getRoleBadgeStyle(member.role)
              const action = getBookingAction(member.role)
              const stripe = getTopStripe(member.role)
              const skillTags = (() => {
                if (member.skills && typeof member.skills === 'string') {
                  const parsed = member.skills.split(',').map(s => s.trim()).filter(Boolean)
                  if (parsed.length > 0) return parsed
                } else if (Array.isArray(member.skills) && member.skills.length > 0) {
                  return member.skills
                }
                return getSkillTags(member.role)
              })()
              const bioText = member.bio || getFallbackBio(member.role)
              const bookingActionLabel = member.bookingButtonText || action.label
              const bookingActionPath = member.bookingButtonLink || action.path

              return (
                <div
                  key={member.id}
                  className="card"
                  style={{
                    background: 'var(--card)',
                    borderRadius: '22px',
                    border: '1.5px solid var(--border)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.04)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-6px)'
                    e.currentTarget.style.borderColor = 'var(--accent)'
                    e.currentTarget.style.boxShadow = '0 18px 40px rgba(217, 119, 6, 0.14)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.04)'
                  }}
                >
                  {/* Top Specialty Color Accent Bar */}
                  <div style={{ height: '6px', background: stripe, width: '100%' }} />

                  <div style={{ padding: '22px 18px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1 }}>
                    {/* Top Row: Verified Badge */}
                    {member.verified !== false && (
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginBottom: '-14px', zIndex: 1 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 800, color: '#166534', background: '#DCFCE7', border: '1px solid #86EFAC', padding: '2px 8px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          <ShieldCheck size={11} /> {member.badgeText || 'Verified'}
                        </span>
                      </div>
                    )}

                    {/* Avatar with Double Ring */}
                    <div style={{
                      width: '96px',
                      height: '96px',
                      borderRadius: '50%',
                      padding: '3px',
                      background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 60%, #B45309 100%)',
                      marginBottom: '12px',
                      boxShadow: '0 8px 22px rgba(217, 119, 6, 0.22)',
                      flexShrink: 0,
                    }}>
                      <div style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: 'var(--card)',
                        border: '2px solid #FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {member.photoUrl ? (
                          <img
                            src={member.photoUrl}
                            alt={member.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            loading="lazy"
                          />
                        ) : (
                          <div style={{
                            width: '100%',
                            height: '100%',
                            background: '#FFFBEB',
                            color: '#D97706',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <Users size={38} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Name */}
                    <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text)', margin: '0 0 4px' }}>
                      {member.name}
                    </h3>

                    {/* Role Badge (Solid & Vibrant) */}
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      marginBottom: '8px',
                      ...badge,
                    }}>
                      {badge.icon} {member.role || 'Pet Specialist'}
                    </div>

                    {/* Rating & Tagline/Experience */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#B45309', display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#FFFBEB', border: '1px solid #FCD34D', padding: '2px 8px', borderRadius: '999px' }}>
                        <Star size={11} fill="#F59E0B" color="#F59E0B" /> {member.rating || '5.0'} Rating
                      </span>
                      {member.tagline ? (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Heart size={11} color="#ec4899" /> {member.tagline}
                        </span>
                      ) : member.experience ? (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Sparkles size={11} /> {member.experience}
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Heart size={11} color="#ec4899" /> Dedicated Specialist
                        </span>
                      )}
                    </div>

                    {/* Admin Description / Specialty Highlight Box */}
                    <div style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '10px 12px',
                      marginBottom: '12px',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}>
                      <p style={{
                        fontSize: '12px',
                        color: 'var(--text)',
                        lineHeight: 1.5,
                        fontStyle: 'italic',
                        margin: 0,
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        "{bioText}"
                      </p>
                    </div>

                    {/* Skill Tags */}
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '16px' }}>
                      {skillTags.map((tag, tIdx) => (
                        <span key={tIdx} style={{ fontSize: '10px', fontWeight: 700, background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)', padding: '2px 7px', borderRadius: '6px' }}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Action Button */}
                    <Link
                      to={bookingActionPath}
                      className="btn btn-secondary"
                      style={{
                        width: '100%',
                        marginTop: 'auto',
                        padding: '9px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        borderRadius: '12px',
                      }}
                    >
                      {action.icon} {bookingActionLabel}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Trust Badges Bar - Positioned Below Teams */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px',
          margin: '0 auto 40px',
          background: 'var(--card)',
          border: '1.5px solid var(--accent-border)',
          borderRadius: '18px',
          padding: '18px 22px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <ShieldCheck size={22} color="#047857" />
            </div>
            <div>
              <strong style={{ fontSize: '13px', color: 'var(--text)', display: 'block' }}>Verified & ID Checked</strong>
              <small style={{ fontSize: '11px', color: 'var(--muted)' }}>100% vetted staff & walkers</small>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#FDF2F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Heart size={22} color="#DB2777" />
            </div>
            <div>
              <strong style={{ fontSize: '13px', color: 'var(--text)', display: 'block' }}>Fear-Free Handling</strong>
              <small style={{ fontSize: '11px', color: 'var(--muted)' }}>Gentle, stress-free care</small>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle2 size={22} color="#1D4ED8" />
            </div>
            <div>
              <strong style={{ fontSize: '13px', color: 'var(--text)', display: 'block' }}>Pet Safety & First Aid</strong>
              <small style={{ fontSize: '11px', color: 'var(--muted)' }}>Emergency safety trained</small>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Star size={22} color="#B45309" fill="#F59E0B" />
            </div>
            <div>
              <strong style={{ fontSize: '13px', color: 'var(--text)', display: 'block' }}>5-Star Rated Service</strong>
              <small style={{ fontSize: '11px', color: 'var(--muted)' }}>Top rated by pet parents</small>
            </div>
          </div>
        </div>

        {/* Bottom Booking Banner */}
        <div style={{
          background: 'linear-gradient(135deg, var(--card) 0%, var(--surface) 100%)',
          border: '1.5px solid var(--accent-border)',
          borderRadius: '24px',
          padding: '36px 28px',
          textAlign: 'center',
          boxShadow: '0 12px 32px rgba(0,0,0,0.06)',
        }}>
          <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 'clamp(22px, 3.5vw, 30px)', fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>
            Give Your Pet The Care They Deserve <PawPrint size={22} style={{ display: 'inline', verticalAlign: 'middle', color: 'var(--accent)' }} />
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--muted)', maxWidth: '580px', margin: '0 auto 20px', lineHeight: 1.5 }}>
            Whether it is an invigorating dog walk, a soothing bath and haircut, or a comfortable stay at our pet hotel, our team is ready to welcome your pet.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Link to="/book" className="btn btn-primary" style={{ padding: '10px 22px' }}>
              <Calendar size={16} /> Book Grooming
            </Link>
            <Link to="/walking" className="btn btn-secondary" style={{ padding: '10px 22px' }}>
              <Footprints size={16} /> Book Dog Walking
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
