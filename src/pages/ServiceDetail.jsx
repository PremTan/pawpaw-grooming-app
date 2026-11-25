import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { 
  ArrowRight, 
  Calendar, 
  Check, 
  CheckCircle2, 
  ChevronDown, 
  ChevronLeft, 
  Clock, 
  Heart, 
  HelpCircle, 
  Leaf, 
  PawPrint, 
  Scissors, 
  ShieldCheck, 
  Sparkles, 
  Star, 
  Smile, 
  Droplets,
  Award
} from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import { SERVICES } from '../utils/services'
import { buildServiceCatalog } from '../utils/serviceCatalog'
import { defaultServiceIconKey, renderServiceIcon } from '../utils/serviceIcons.jsx'
import { optimizeCloudinary } from '../utils/imageOptimizer'

const serviceDetailCache = new Map()

// Pet-centric default steps for when admin hasn't added custom step-by-step images
const DEFAULT_PET_STEPS = [
  {
    step: '01',
    tag: 'Step 1: Check-in',
    title: 'Warm Welcome & Health Assessment',
    description: 'We greet your pet with love, gentle strokes, and positive treats. Our groomer checks coat condition, skin sensitivity, and temperament for a stress-free start.',
    icon: ShieldCheck,
    imageUrl: 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=800&auto=format&fit=crop&q=80',
    alt: 'Friendly dog welcome and coat inspection'
  },
  {
    step: '02',
    tag: 'Step 2: Hydro-Bath',
    title: 'Relaxing Spa Cleansing & Bathing',
    description: 'A soothing warm rinse using 100% pet-safe, tearless organic shampoos. Deep coat nourishment restores natural shine, removes odor, and calms itchy skin.',
    icon: Droplets,
    imageUrl: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=800&auto=format&fit=crop&q=80',
    alt: 'Pet enjoying warm spa bath'
  },
  {
    step: '03',
    tag: 'Step 3: Styling',
    title: 'Precision Styling & Hygiene Care',
    description: 'Certified pet stylists perform precision styling or breed cuts. Complete with gentle ear cleaning, sanitary trimming, and protective paw pad moisturizing.',
    icon: Scissors,
    imageUrl: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=800&auto=format&fit=crop&q=80',
    alt: 'Expert pet grooming and styling'
  },
  {
    step: '04',
    tag: 'Step 4: Glow-up',
    title: 'Fluff Drying, Fresh Scent & Treats',
    description: 'Low-noise warm drying prevents anxiety, followed by gentle detangling, fresh coat mist, and a delicious treat reward for a happy, wagging tail!',
    icon: Sparkles,
    imageUrl: 'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?w=800&auto=format&fit=crop&q=80',
    alt: 'Happy freshly groomed pet'
  }
]

// Pet care features included in visits
const WHAT_IS_INCLUDED = [
  {
    icon: Leaf,
    title: '100% Pet-Safe & Organic',
    desc: 'Hypoallergenic, tear-free, botanical formulas safe for all coat & skin types.'
  },
  {
    icon: ShieldCheck,
    title: 'Certified Stylists',
    desc: 'Experienced professionals trained in gentle fear-free handling techniques.'
  },
  {
    icon: Sparkles,
    title: 'Sanitized Tools & Tables',
    desc: 'Sterilized equipment and fresh towels used for each and every furry guest.'
  },
  {
    icon: PawPrint,
    title: 'Paw & Nail Protection',
    desc: 'Precise nail clipping, gentle filing, and organic herbal paw pad butter.'
  },
  {
    icon: Heart,
    title: 'Stress-Free & Cage-Free',
    desc: 'Calm, soothing environment with constant care and lots of cuddle breaks.'
  },
  {
    icon: Award,
    title: 'Free Health Check',
    desc: 'Thorough ear, eye, teeth & skin inspection with notes for pet parents.'
  }
]

// Pet parent FAQs
const FAQS = [
  {
    q: 'How should I prepare my pet before the appointment?',
    a: 'We recommend taking your dog for a quick walk to relieve themselves beforehand. Bring your pet on a secure leash or carrier. Let our groomers know about any sensitivities, allergies, or past experiences!'
  },
  {
    q: 'What if my pet is nervous, elderly, or anxious?',
    a: 'Our groomers are certified in fear-free, gentle handling. We never rush or force any procedure. We take gentle pauses, give comforting praise, and prioritize your pet’s emotional comfort above all else.'
  },
  {
    q: 'Are your shampoos and products safe for sensitive skin?',
    a: 'Absolutely! We exclusively use veterinarian-approved, pH-balanced, hypoallergenic, and organic shampoos formulated specially for pets. No harsh parabens, sulfates, or artificial dyes.'
  },
  {
    q: 'Can I request a custom haircut or specific style?',
    a: 'Yes! You can share your style preferences or reference photos with our groomer at drop-off. We tailor every cut to match your pet’s coat texture, lifestyle, and your favorite look.'
  }
]

export default function ServiceDetail() {
  const { serviceId } = useParams()
  const baseService = SERVICES.find(s => s.id === serviceId)
  const [detail, setDetail] = useState(() => serviceDetailCache.get(serviceId) || null)
  const [loading, setLoading] = useState(() => !serviceDetailCache.has(serviceId))
  const [openFaq, setOpenFaq] = useState(0)

  useEffect(() => {
    async function fetchDetail() {
      try {
        const snap = await getDoc(doc(db, 'serviceDetails', serviceId))
        const data = snap.exists() ? { id: snap.id, ...snap.data() } : null
        serviceDetailCache.set(serviceId, data)
        setDetail(data)
      } catch {
        if (!serviceDetailCache.has(serviceId)) setDetail(null)
      }
      setLoading(false)
    }
    fetchDetail()
  }, [serviceId])

  const service = useMemo(() => {
    if (!baseService && !detail) return null
    const found = buildServiceCatalog(detail ? { [serviceId]: detail } : {}, { includeInactive: true }).find(item => item.id === serviceId)
    if (!found) return null
    return {
      ...found,
      description: found.description || found.summary,
      summary: found.summary || found.description,
      iconKey: found.iconKey || defaultServiceIconKey(found.id),
      images: Array.isArray(found.images)
        ? found.images.filter(i => i?.url).slice(0, 5).map(img => ({ ...img, url: optimizeCloudinary(img.url, 900) }))
        : [],
    }
  }, [baseService, detail, serviceId])

  if (!service && !loading) return <Navigate to="/services" replace />
  if (loading) return <div style={{ paddingTop: '120px' }}><Spinner text="Loading service details..." /></div>
  if (service?.active === false) return <Navigate to="/services" replace />

  const adminImages = service.images || []
  const hasAdminImages = adminImages.length > 0

  // Combine or fallback to default pet steps
  const displaySteps = hasAdminImages
    ? adminImages.map((img, idx) => ({
        step: `0${idx + 1}`,
        tag: `Step ${idx + 1}`,
        title: img.title || `${service.name} - Step ${idx + 1}`,
        description: img.description || service.summary || DEFAULT_PET_STEPS[idx % DEFAULT_PET_STEPS.length].description,
        icon: Scissors,
        imageUrl: img.url,
        alt: img.alt || img.title || service.name
      }))
    : DEFAULT_PET_STEPS

  return (
    <>
      <style>{`
        /* ── Service Detail Container ── */
        .sd-page {
          background: var(--bg);
          min-height: 100vh;
          padding-top: 88px;
          padding-bottom: 90px;
          color: var(--text);
          font-family: inherit;
        }

        .sd-container {
          max-width: 1180px;
          margin: 0 auto;
          padding: 16px 20px 60px;
        }

        /* ── Breadcrumb & Top Bar ── */
        .sd-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          animation: sdFadeIn 0.4s ease-out;
        }

        .sd-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--muted);
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
          padding: 8px 14px;
          border-radius: 999px;
          background: var(--surface);
          border: 1px solid var(--border);
          transition: all 0.2s ease;
        }

        .sd-back-btn:hover {
          color: var(--accent);
          border-color: var(--accent-border);
          background: var(--accent-bg);
          transform: translateX(-2px);
        }

        .sd-category-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: var(--accent);
          background: var(--accent-bg);
          border: 1px solid var(--accent-border);
          padding: 6px 14px;
          border-radius: 999px;
        }

        /* ── Hero Split Layout ── */
        .sd-hero-grid {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 36px;
          align-items: stretch;
          margin-bottom: 48px;
          animation: sdFadeUp 0.5s ease-out;
        }

        /* Left Hero Column */
        .sd-hero-info {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .sd-badge-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .sd-hero-title {
          font-family: "Playfair Display", Georgia, serif;
          font-size: clamp(32px, 4.2vw, 52px);
          font-weight: 800;
          color: var(--text);
          line-height: 1.12;
          margin: 0 0 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .sd-hero-title-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: var(--accent-bg);
          color: var(--accent);
          border: 1.5px solid var(--accent-border);
          box-shadow: 0 6px 18px rgba(212, 175, 55, 0.15);
          animation: sdGlowPulse 3s infinite ease-in-out;
        }

        .sd-hero-desc {
          color: var(--muted);
          font-size: 16px;
          line-height: 1.75;
          margin-bottom: 24px;
          max-width: 600px;
        }

        .sd-chips-list {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 28px;
        }

        .sd-chip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 14px;
          border-radius: 10px;
          background: var(--surface);
          border: 1px solid var(--border);
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
        }

        .sd-chip svg {
          color: var(--accent);
        }

        .sd-trust-checklist {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px 18px;
          padding-top: 14px;
          border-top: 1px solid var(--border);
        }

        .sd-check-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13.5px;
          color: var(--muted);
        }

        .sd-check-item svg {
          color: var(--accent);
          flex-shrink: 0;
        }

        /* Right Hero Column: Booking Card */
        .sd-booking-card {
          background: var(--card);
          border: 1.5px solid var(--border);
          border-radius: 24px;
          padding: 32px 28px;
          box-shadow: 0 16px 45px rgba(0, 0, 0, 0.22);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
          transition: transform 0.3s ease, border-color 0.3s ease;
        }

        .sd-booking-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: var(--gradient);
        }

        .sd-booking-card:hover {
          border-color: var(--accent-border);
          transform: translateY(-2px);
        }

        .sd-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }

        .sd-card-service-meta {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .sd-card-avatar {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: var(--accent-bg);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .sd-card-label {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--muted);
        }

        .sd-card-name {
          font-size: 17px;
          font-weight: 700;
          color: var(--text);
          margin-top: 2px;
        }

        .sd-price-box {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 16px 20px;
          margin-bottom: 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .sd-price-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 3px;
        }

        .sd-price-val {
          font-size: 26px;
          font-weight: 900;
          color: var(--accent);
          letter-spacing: -0.5px;
        }

        .sd-duration-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--accent-bg);
          color: var(--accent);
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }

        .sd-book-cta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          min-height: 54px;
          padding: 14px 24px;
          border-radius: 14px;
          background: var(--gradient);
          color: #1a1600;
          font-size: 16px;
          font-weight: 800;
          text-decoration: none;
          box-shadow: 0 10px 24px rgba(212, 175, 55, 0.28);
          transition: all 0.25s ease;
          border: none;
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }

        .sd-book-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 30px rgba(212, 175, 55, 0.4);
          filter: brightness(1.06);
        }

        .sd-book-cta:active {
          transform: translateY(0);
        }

        .sd-btn-arrow {
          transition: transform 0.2s ease;
        }

        .sd-book-cta:hover .sd-btn-arrow {
          transform: translateX(4px);
        }

        .sd-card-reassurance {
          margin-top: 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .sd-reassurance-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          color: var(--muted);
        }

        .sd-reassurance-item svg {
          color: var(--accent);
          flex-shrink: 0;
        }

        /* ── Section Titles ── */
        .sd-section-head {
          text-align: center;
          max-width: 680px;
          margin: 0 auto 36px;
        }

        .sd-section-kicker {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--accent);
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 8px;
        }

        .sd-section-title {
          font-family: "Playfair Display", Georgia, serif;
          font-size: clamp(26px, 3.4vw, 38px);
          font-weight: 800;
          color: var(--text);
          line-height: 1.2;
          margin: 0 0 12px;
        }

        .sd-section-subtitle {
          color: var(--muted);
          font-size: 15px;
          line-height: 1.6;
          margin: 0;
        }

        /* ── Steps / Process Cards ── */
        .sd-steps-section {
          margin-bottom: 56px;
        }

        .sd-steps-grid {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .sd-step-card {
          display: grid;
          grid-template-columns: 1fr 1.15fr;
          gap: 32px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 24px;
          align-items: center;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
          transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
        }

        .sd-step-card:hover {
          transform: translateY(-3px);
          border-color: var(--accent-border);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.22);
        }

        .sd-step-card.reverse {
          grid-template-columns: 1.15fr 1fr;
        }

        .sd-step-img-box {
          border-radius: 16px;
          overflow: hidden;
          background: var(--surface);
          aspect-ratio: 16 / 11;
          position: relative;
        }

        .sd-step-img-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.4s ease;
        }

        .sd-step-card:hover .sd-step-img-box img {
          transform: scale(1.03);
        }

        .sd-step-num-badge {
          position: absolute;
          top: 14px;
          left: 14px;
          background: rgba(18, 16, 12, 0.85);
          backdrop-filter: blur(8px);
          color: var(--accent);
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          padding: 5px 12px;
          border-radius: 999px;
          border: 1px solid rgba(212, 175, 55, 0.35);
        }

        .sd-step-content {
          padding: 10px 6px;
        }

        .sd-step-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--accent);
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-bottom: 8px;
        }

        .sd-step-title {
          font-size: clamp(20px, 2.5vw, 25px);
          font-weight: 800;
          color: var(--text);
          line-height: 1.25;
          margin: 0 0 12px;
        }

        .sd-step-desc {
          color: var(--muted);
          font-size: 15px;
          line-height: 1.7;
          margin: 0;
        }

        /* ── What's Included Grid ── */
        .sd-included-section {
          margin-bottom: 56px;
        }

        .sd-perks-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        }

        .sd-perk-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 24px;
          display: flex;
          align-items: flex-start;
          gap: 16px;
          transition: all 0.25s ease;
        }

        .sd-perk-card:hover {
          border-color: var(--accent-border);
          transform: translateY(-2px);
          background: var(--surface);
        }

        .sd-perk-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: var(--accent-bg);
          color: var(--accent);
          border: 1px solid var(--accent-border);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .sd-perk-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 6px;
        }

        .sd-perk-desc {
          font-size: 13.5px;
          color: var(--muted);
          line-height: 1.55;
          margin: 0;
        }

        /* ── Care Promise Banner ── */
        .sd-promise-banner {
          background: linear-gradient(135deg, rgba(212, 175, 55, 0.12) 0%, rgba(26, 22, 16, 0.95) 100%);
          border: 1.5px solid var(--accent-border);
          border-radius: 22px;
          padding: 36px 32px;
          margin-bottom: 56px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 24px;
          align-items: center;
          box-shadow: 0 14px 40px rgba(0, 0, 0, 0.18);
        }

        .sd-promise-icon-wrap {
          width: 64px;
          height: 64px;
          border-radius: 18px;
          background: var(--accent-bg);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--accent-border);
        }

        .sd-promise-title {
          font-size: 22px;
          font-weight: 800;
          color: var(--text);
          margin: 0 0 6px;
        }

        .sd-promise-desc {
          color: var(--muted);
          font-size: 14.5px;
          line-height: 1.6;
          margin: 0;
        }

        .sd-promise-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 22px;
          border-radius: 12px;
          background: var(--gradient);
          color: #1a1600;
          font-weight: 800;
          font-size: 14px;
          text-decoration: none;
          white-space: nowrap;
          transition: transform 0.2s ease, filter 0.2s ease;
        }

        .sd-promise-btn:hover {
          transform: translateY(-2px);
          filter: brightness(1.08);
        }

        /* ── FAQ Section ── */
        .sd-faq-section {
          margin-bottom: 40px;
        }

        .sd-faq-list {
          max-width: 820px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .sd-faq-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
          transition: border-color 0.2s ease;
        }

        .sd-faq-card.open {
          border-color: var(--accent-border);
        }

        .sd-faq-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 22px;
          background: transparent;
          border: none;
          color: var(--text);
          font-size: 16px;
          font-weight: 700;
          text-align: left;
          cursor: pointer;
          gap: 16px;
        }

        .sd-faq-icon {
          color: var(--accent);
          transition: transform 0.25s ease;
          flex-shrink: 0;
        }

        .sd-faq-card.open .sd-faq-icon {
          transform: rotate(180deg);
        }

        .sd-faq-answer {
          padding: 0 22px 18px;
          color: var(--muted);
          font-size: 14.5px;
          line-height: 1.65;
          animation: sdFadeIn 0.25s ease-out;
        }

        /* ── Keyframe Animations ── */
        @keyframes sdFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes sdFadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes sdGlowPulse {
          0%, 100% {
            box-shadow: 0 4px 14px rgba(212, 175, 55, 0.15);
          }
          50% {
            box-shadow: 0 6px 24px rgba(212, 175, 55, 0.32);
          }
        }

        /* ── Mobile Responsive Refinements ── */
        @media (max-width: 860px) {
          .sd-page {
            padding-top: 76px;
            padding-bottom: 110px; /* Space above mobile bottom navigation */
          }

          .sd-container {
            padding: 12px 16px 40px;
          }

          .sd-hero-grid {
            grid-template-columns: 1fr;
            gap: 24px;
            margin-bottom: 36px;
          }

          .sd-hero-title {
            font-size: 32px;
            gap: 10px;
          }

          .sd-hero-title-icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
          }

          .sd-hero-desc {
            font-size: 15px;
            margin-bottom: 18px;
          }

          .sd-chips-list {
            gap: 8px;
            margin-bottom: 20px;
          }

          .sd-chip {
            padding: 7px 12px;
            font-size: 12px;
          }

          .sd-trust-checklist {
            grid-template-columns: 1fr;
            gap: 8px;
            padding-top: 12px;
          }

          .sd-booking-card {
            padding: 22px 18px;
            border-radius: 18px;
          }

          .sd-price-box {
            padding: 14px 16px;
            margin-bottom: 18px;
          }

          .sd-price-val {
            font-size: 22px;
          }

          .sd-book-cta {
            min-height: 50px;
            font-size: 15px;
          }

          .sd-step-card,
          .sd-step-card.reverse {
            grid-template-columns: 1fr;
            gap: 16px;
            padding: 16px;
            border-radius: 16px;
          }

          .sd-step-img-box {
            aspect-ratio: 16 / 10;
          }

          .sd-step-title {
            font-size: 19px;
            margin-bottom: 8px;
          }

          .sd-step-desc {
            font-size: 14px;
            line-height: 1.6;
          }

          .sd-promise-banner {
            grid-template-columns: 1fr;
            text-align: center;
            padding: 24px 20px;
            gap: 18px;
          }

          .sd-promise-icon-wrap {
            margin: 0 auto;
          }

          .sd-promise-btn {
            justify-content: center;
            width: 100%;
          }

          .sd-faq-btn {
            font-size: 14.5px;
            padding: 16px 18px;
          }

          .sd-faq-answer {
            padding: 0 18px 16px;
            font-size: 13.5px;
          }
        }
      `}</style>

      <div className="sd-page">
        <div className="sd-container">
          {/* Top navigation & tag */}
          <div className="sd-topbar">
            <Link to="/services" className="sd-back-btn">
              <ChevronLeft size={16} />
              <span>Back to Services</span>
            </Link>
            <div className="sd-category-pill">
              <Sparkles size={13} />
              <span>Paw Paw Salon & Spa</span>
            </div>
          </div>

          {/* Hero Section */}
          <section className="sd-hero-grid">
            {/* Left: Info */}
            <div className="sd-hero-info">
              <div className="sd-badge-row">
                <span className="sd-chip">
                  <Clock size={14} />
                  <span>{service.duration || '30 - 45 min'}</span>
                </span>
                <span className="sd-chip">
                  <PawPrint size={14} />
                  <span>Dogs & Cats Friendly</span>
                </span>
              </div>

              <h1 className="sd-hero-title">
                {service.name}
                <span className="sd-hero-title-icon">
                  {renderServiceIcon(service.iconKey, <Scissors size={26} />, 26)}
                </span>
              </h1>

              <p className="sd-hero-desc">
                {service.description || 'Professional, stress-free care tailored for your pet’s comfort, coat health, and complete happiness.'}
              </p>

              <div className="sd-chips-list">
                <span className="sd-chip"><ShieldCheck size={14} /> 100% Gentle Handling</span>
                <span className="sd-chip"><Leaf size={14} /> Organic & Toxin-Free</span>
                <span className="sd-chip"><Heart size={14} /> Cage-Free Loving Environment</span>
              </div>

              <div className="sd-trust-checklist">
                <div className="sd-check-item">
                  <CheckCircle2 size={16} />
                  <span>Free coat & skin checkup</span>
                </div>
                <div className="sd-check-item">
                  <CheckCircle2 size={16} />
                  <span>Hospital-grade tool sterilization</span>
                </div>
                <div className="sd-check-item">
                  <CheckCircle2 size={16} />
                  <span>Fear-free certified groomers</span>
                </div>
                <div className="sd-check-item">
                  <CheckCircle2 size={16} />
                  <span>Complimentary reward treats</span>
                </div>
              </div>
            </div>

            {/* Right: Booking Highlight Card */}
            <div className="sd-booking-card">
              <div>
                <div className="sd-card-header">
                  <div className="sd-card-service-meta">
                    <div className="sd-card-avatar">
                      {renderServiceIcon(service.iconKey, <Scissors size={22} />, 22)}
                    </div>
                    <div>
                      <div className="sd-card-label">Salon Service</div>
                      <div className="sd-card-name">{service.name}</div>
                    </div>
                  </div>
                  <span className="sd-duration-pill">
                    <Clock size={12} />
                    <span>{service.duration || 'Session'}</span>
                  </span>
                </div>

                <div className="sd-price-box">
                  <div>
                    <div className="sd-price-title">Service Price</div>
                    <div className="sd-price-val">{service.price || 'Rs 400'}</div>
                  </div>
                  <div className="sd-category-pill" style={{ margin: 0 }}>
                    <Star size={12} /> Best Value
                  </div>
                </div>
              </div>

              <div>
                <Link to={`/book?service=${service.id}`} className="sd-book-cta">
                  <Calendar size={18} />
                  <span>Book This Service</span>
                  <ArrowRight size={18} className="sd-btn-arrow" />
                </Link>

                <div className="sd-card-reassurance">
                  <div className="sd-reassurance-item">
                    <Check size={14} />
                    <span>Instant appointment confirmation</span>
                  </div>
                  <div className="sd-reassurance-item">
                    <Check size={14} />
                    <span>Pay online or in-person at the salon</span>
                  </div>
                  <div className="sd-reassurance-item">
                    <Check size={14} />
                    <span>Free cancellation up to 4 hrs prior</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Step-by-Step Experience / Story */}
          <section className="sd-steps-section">
            <div className="sd-section-head">
              <span className="sd-section-kicker">
                <Sparkles size={14} /> The Care Journey
              </span>
              <h2 className="sd-section-title">What Happens During The Session</h2>
              <p className="sd-section-subtitle">
                From a warm greeting to the final fresh spritz, every step is designed to keep your fur-baby safe, relaxed, and happy.
              </p>
            </div>

            <div className="sd-steps-grid">
              {displaySteps.map((item, index) => {
                const isEven = index % 2 === 1
                return (
                  <article key={`${item.title}-${index}`} className={`sd-step-card ${isEven ? 'reverse' : ''}`}>
                    <div className="sd-step-img-box">
                      <img src={item.imageUrl} alt={item.alt || item.title} loading="lazy" />
                      <span className="sd-step-num-badge">{item.tag || `Step 0${index + 1}`}</span>
                    </div>
                    <div className="sd-step-content">
                      <div className="sd-step-tag">
                        <PawPrint size={13} />
                        <span>Experience Step {index + 1}</span>
                      </div>
                      <h3 className="sd-step-title">{item.title}</h3>
                      <p className="sd-step-desc">{item.description}</p>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          {/* What's Included / Highlights Grid */}
          <section className="sd-included-section">
            <div className="sd-section-head">
              <span className="sd-section-kicker">
                <ShieldCheck size={14} /> Paw Paw Standards
              </span>
              <h2 className="sd-section-title">What’s Included in Every Visit</h2>
              <p className="sd-section-subtitle">
                We believe in uncompromising quality and gentle care for all pets.
              </p>
            </div>

            <div className="sd-perks-grid">
              {WHAT_IS_INCLUDED.map((perk, i) => {
                const IconComponent = perk.icon
                return (
                  <div key={i} className="sd-perk-card">
                    <div className="sd-perk-icon">
                      <IconComponent size={20} />
                    </div>
                    <div>
                      <h4 className="sd-perk-title">{perk.title}</h4>
                      <p className="sd-perk-desc">{perk.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Safety & Happiness Promise Banner */}
          <section className="sd-promise-banner">
            <div className="sd-promise-icon-wrap">
              <Heart size={32} />
            </div>
            <div>
              <h3 className="sd-promise-title">Our Gentle Care Promise</h3>
              <p className="sd-promise-desc">
                We treat your pet like our own family. If your dog or cat feels nervous or anxious at any point, our certified handlers take extra time, gentle breaks, and cuddles to ensure they always leave with a wagging tail.
              </p>
            </div>
            <div>
              <Link to={`/book?service=${service.id}`} className="sd-promise-btn">
                <span>Book Appointment</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          </section>

          {/* Frequently Asked Questions */}
          <section className="sd-faq-section">
            <div className="sd-section-head">
              <span className="sd-section-kicker">
                <HelpCircle size={14} /> Common Questions
              </span>
              <h2 className="sd-section-title">Frequently Asked Questions</h2>
              <p className="sd-section-subtitle">
                Everything pet parents ask about our grooming and salon experience.
              </p>
            </div>

            <div className="sd-faq-list">
              {FAQS.map((faq, index) => {
                const isOpen = openFaq === index
                return (
                  <div key={index} className={`sd-faq-card ${isOpen ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="sd-faq-btn"
                      onClick={() => setOpenFaq(isOpen ? -1 : index)}
                      aria-expanded={isOpen}
                    >
                      <span>{faq.q}</span>
                      <ChevronDown size={18} className="sd-faq-icon" />
                    </button>
                    {isOpen && (
                      <div className="sd-faq-answer">
                        <p style={{ margin: 0 }}>{faq.a}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
