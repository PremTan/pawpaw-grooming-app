import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { format } from 'date-fns'
import Cropper from 'react-easy-crop'
import { AlertTriangle, Calendar, Camera, CheckCircle, CheckSquare, ChevronLeft, ChevronRight, CreditCard, Edit3, Gift, IndianRupee, Mail, Phone, Plus, Save, Slash, Trash2, Upload, UserRound, Users, X, ArrowUpCircle, Footprints, MessageCircle, Copy, Check, KeyRound, ShieldCheck, Settings, Home as HomeIcon, Search, Star, Eye, ExternalLink, Scissors, Sparkles, Filter, Crown } from 'lucide-react'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { downloadPayrollPdf } from '../utils/payrollPdf'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import { getOwnerAssignee } from '../utils/teamMembers'
import { generateUniqueToken } from '../utils/walkerAuth'

const EMPTY = { name: '', phone: '', email: '', role: 'Groomer', photoUrl: '', monthlySalary: '', joiningDate: '' }
const DEFAULT_TEAM_SECTION = {
  badge: 'Certified & Passionate',
  title: 'Meet Our Pet Care Team',
  description: 'Certified groomers, dedicated walkers, and caretakers devoted to your pet\'s happiness.',
  enabled: true,
  ownerName: 'Prem Tandalekar',
  ownerRole: 'Founder & Pet Care Director',
  ownerPhotoUrl: '',
  ownerExperience: '6+ Years Experience · Canine Specialist',
  ownerBio: 'Founded Paw Paw with one simple philosophy: treat every furry companion as if they were our own. Gentle, fear-free grooming and loving pet care you can trust.',
  showOwner: true,
}
const PAYMENT_TYPES = ['Salary', 'Advance', 'Bonus', 'Incentive', 'Deduction', 'Other']
const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Cheque']
const FILTER_TYPES = ['All', 'Salary', 'Advance', 'Bonus', 'Incentive']
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const formatCurrency = value => `Rs ${Number(value || 0).toLocaleString('en-IN')}`
const formatShortDate = value => {
  if (!value) return '-'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '-'
  return format(date, 'dd MMM yyyy')
}
const getSalaryStatus = (monthlySalary = 0, salaryPaid = 0) => {
  if (monthlySalary <= 0) return 'Paid'
  if (salaryPaid >= monthlySalary) return 'Paid'
  if (salaryPaid > 0) return 'Partially Paid'
  return 'Pending'
}
const getSalaryStatusClass = status => status === 'Paid' ? 'success' : status === 'Partially Paid' ? 'partial' : 'due'
const getPaymentBadgeClass = type => {
  const normalized = (type || '').toString().trim().toLowerCase()
  if (normalized === 'salary') return 'badge badge-completed'
  if (normalized === 'advance') return 'badge badge-pending'
  if (normalized === 'bonus' || normalized === 'incentive') return 'badge badge-online'
  if (normalized === 'deduction') return 'badge badge-cancelled'
  return 'badge'
}
const getMonthOptions = (count = 7) => {
  const options = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    options.push({ month: date.getMonth() + 1, year: date.getFullYear(), label: `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}` })
  }
  return options
}

const getCroppedImg = async (imageSrc, pixelCrop, fileName) => {
  const image = new Image()
  image.src = imageSrc
  await new Promise(resolve => { image.onload = resolve })

  const maxDim = 800
  let targetWidth = pixelCrop.width
  let targetHeight = pixelCrop.height
  if (targetWidth > maxDim || targetHeight > maxDim) {
    if (targetWidth >= targetHeight) {
      targetHeight = Math.round((targetHeight * maxDim) / targetWidth)
      targetWidth = maxDim
    } else {
      targetWidth = Math.round((targetWidth * maxDim) / targetHeight)
      targetHeight = maxDim
    }
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = targetWidth
  canvas.height = targetHeight
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, targetWidth, targetHeight)

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(new File([blob], fileName, { type: 'image/jpeg' })), 'image/jpeg', 0.82)
  })
}

export default function AdminTeam() {
  const { user, profile } = useAuth()
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
  const [uploadingOwnerPhoto, setUploadingOwnerPhoto] = useState(false)
  const [optimizingOwnerPhoto, setOptimizingOwnerPhoto] = useState(false)
  const [cropData, setCropData] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [payments, setPayments] = useState([])
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentType: 'Salary',
    paymentMethod: 'Cash',
    paymentDate: format(new Date(), 'yyyy-MM-dd'),
    salaryMonth: new Date().getMonth() + 1,
    salaryYear: new Date().getFullYear(),
    notes: '',
  })
  const [paymentFilter, setPaymentFilter] = useState('All')
  const [showAllPayments, setShowAllPayments] = useState(false)
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear() })
  const [editingPayment, setEditingPayment] = useState(null)
  const [deletingPayment, setDeletingPayment] = useState(null)
  const [confirmFullSalary, setConfirmFullSalary] = useState(false)
  const [payrollLoading, setPayrollLoading] = useState(false)
  const [dashboardTotals, setDashboardTotals] = useState({ totalEmployees: 0, totalMonthlyPayroll: 0, totalPaidThisMonth: 0, totalPendingSalary: 0, totalAdvancePaid: 0 })
  const [sectionSettings, setSectionSettings] = useState(DEFAULT_TEAM_SECTION)
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [savingSection, setSavingSection] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleTab, setRoleTab] = useState('All')
  const [memberShowcase, setMemberShowcase] = useState({})
  const [expandedShowcaseMember, setExpandedShowcaseMember] = useState(null)

  const adminPhoto = profile?.photoURL || user?.photoURL || ''
  const adminName = profile?.name || profile?.displayName || user?.displayName || 'Prem Tandalekar'

  useEffect(() => {
    async function loadSectionSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'teamSection'))
        const currentAdminPhoto = profile?.photoURL || user?.photoURL || ''
        const currentAdminName = profile?.name || profile?.displayName || user?.displayName || 'Prem Tandalekar'

        if (snap.exists()) {
          const data = snap.data()
          const resolvedPhoto = data.ownerPhotoUrl || currentAdminPhoto
          const resolvedName = data.ownerName || currentAdminName
          setSectionSettings({
            ...DEFAULT_TEAM_SECTION,
            ...data,
            ownerPhotoUrl: resolvedPhoto,
            ownerName: resolvedName,
          })

          // Auto-persist admin photo if missing in settings so visitors see it
          if (!data.ownerPhotoUrl && currentAdminPhoto) {
            setDoc(doc(db, 'settings', 'teamSection'), {
              ownerPhotoUrl: currentAdminPhoto,
              ownerName: resolvedName,
              updatedAt: serverTimestamp(),
            }, { merge: true }).catch(() => {})
          }
        } else {
          const initial = {
            ...DEFAULT_TEAM_SECTION,
            ownerPhotoUrl: currentAdminPhoto,
            ownerName: currentAdminName,
          }
          setSectionSettings(initial)
          if (currentAdminPhoto) {
            setDoc(doc(db, 'settings', 'teamSection'), {
              ...initial,
              updatedAt: serverTimestamp(),
            }, { merge: true }).catch(() => {})
          }
        }
      } catch (err) {
        console.warn('Failed to load team section settings:', err)
      }
    }
    loadSectionSettings()
  }, [user, profile])

  const openShowcaseModal = () => {
    const map = {}
    members.forEach(m => {
      map[m.id] = {
        rating: m.rating || '5.0',
        verified: m.verified !== false,
        badgeText: m.badgeText || 'Verified',
        tagline: m.tagline || '',
        experience: m.experience || '',
        bio: m.bio || '',
        skills: Array.isArray(m.skills) ? m.skills.join(', ') : (m.skills || ''),
        bookingButtonText: m.bookingButtonText || '',
        showOnWeb: m.showOnWeb !== false,
        showOnHome: m.showOnHome === true,
        order: m.order !== undefined && m.order !== null ? String(m.order) : (m.homeOrder !== undefined && m.homeOrder !== null ? String(m.homeOrder) : ''),
      }
    })
    setMemberShowcase(map)
    setShowSectionModal(true)
  }

  const updateMemberShowcase = (id, field, value) => {
    setMemberShowcase(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value,
      },
    }))
  }

  const handleOwnerPhotoUpload = async file => {
    if (!file) return
    try {
      validateImageFile(file)
      setUploadingOwnerPhoto(true)
      const url = await uploadToCloudinary(file, {
        onOptimizeStart: () => setOptimizingOwnerPhoto(true),
        onOptimizeEnd: () => setOptimizingOwnerPhoto(false),
      })
      setSectionSettings(prev => ({ ...prev, ownerPhotoUrl: url }))
      setToastType('success')
      setToastMessage('Founder photo uploaded! Remember to click Save Settings.')
    } catch (err) {
      setToastType('error')
      setToastMessage(err.message || 'Failed to upload photo')
    } finally {
      setUploadingOwnerPhoto(false)
      setOptimizingOwnerPhoto(false)
    }
  }

  const saveSectionSettings = async e => {
    e?.preventDefault()
    setSavingSection(true)
    try {
      await setDoc(doc(db, 'settings', 'teamSection'), {
        ...sectionSettings,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      // Persist showcase details (ratings, desc, stars, skills, order) for all members
      const memberUpdates = Object.entries(memberShowcase).map(([id, data]) => {
        return updateDoc(doc(db, 'teamMembers', id), {
          rating: (data.rating || '5.0').trim(),
          verified: data.verified !== false,
          badgeText: (data.badgeText || 'Verified').trim(),
          tagline: (data.tagline || '').trim(),
          experience: (data.experience || '').trim(),
          bio: (data.bio || '').trim(),
          skills: (data.skills || '').trim(),
          bookingButtonText: (data.bookingButtonText || '').trim(),
          showOnWeb: data.showOnWeb !== false,
          showOnHome: Boolean(data.showOnHome),
          order: data.order !== '' && !isNaN(Number(data.order)) ? Number(data.order) : null,
          homeOrder: data.order !== '' && !isNaN(Number(data.order)) ? Number(data.order) : null,
          updatedAt: serverTimestamp(),
        }).catch(err => console.warn(`Failed to update member ${id} showcase:`, err))
      })

      await Promise.allSettled(memberUpdates)
      await fetchMembers()

      setToastType('success')
      setToastMessage('Website Showcase settings saved!')
      setShowSectionModal(false)
    } catch (err) {
      setToastType('error')
      setToastMessage('Failed to save settings: ' + err.message)
    } finally {
      setSavingSection(false)
    }
  }

  const quickToggleMemberHome = async member => {
    const nextVal = !member.showOnHome
    try {
      await updateDoc(doc(db, 'teamMembers', member.id), {
        showOnHome: nextVal,
        updatedAt: serverTimestamp(),
      })
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, showOnHome: nextVal } : m))
      setToastType('success')
      setToastMessage(`${member.name || 'Member'} ${nextVal ? 'featured on' : 'removed from'} Home Screen!`)
    } catch (err) {
      setToastType('error')
      setToastMessage('Could not update member: ' + err.message)
    }
  }

  const quickUpdateMemberOrder = async (member, newOrder) => {
    const num = newOrder === '' ? null : Number(newOrder)
    try {
      await updateDoc(doc(db, 'teamMembers', member.id), {
        order: num,
        homeOrder: num,
        updatedAt: serverTimestamp(),
      })
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, order: num, homeOrder: num } : m))
    } catch (err) {
      console.warn('Order update failed:', err)
    }
  }

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
      } catch { }
    }
    setLoading(false)
  }

  const fetchPaymentsForMember = async memberId => {
    if (!memberId) return
    setPayrollLoading(true)
    const normalizePayment = data => {
      const paymentType = (data.paymentType || 'Salary').toString().trim()
      const salaryMonth = Number(data.salaryMonth) || 0
      const salaryYear = Number(data.salaryYear) || 0
      const parsedDate = data.paymentDate ? new Date(data.paymentDate) : null
      return {
        ...data,
        paymentType,
        paymentTypeLower: paymentType.toLowerCase(),
        salaryMonth: salaryMonth || (parsedDate ? parsedDate.getMonth() + 1 : 0),
        salaryYear: salaryYear || (parsedDate ? parsedDate.getFullYear() : 0),
        amount: Number(data.amount) || 0,
      }
    }

    const loadPayments = async () => {
      const snap = await getDocs(query(collection(db, 'employeePayments'), where('teamMemberId', '==', memberId)))
      return snap.docs.map(d => ({ id: d.id, ...normalizePayment(d.data()) }))
    }

    try {
      const memberPayments = await loadPayments()

      memberPayments.sort((a, b) => {
        const aCreated = a.createdAt?.toMillis?.() || 0
        const bCreated = b.createdAt?.toMillis?.() || 0
        if (aCreated !== bCreated) return bCreated - aCreated
        return new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
      })
      setPayments(memberPayments)
      setShowAllPayments(false)

      if (memberPayments.length > 0) {
        const latestPayment = memberPayments[0]
        const latestMonth = Number(latestPayment.salaryMonth) || (latestPayment.paymentDate ? new Date(latestPayment.paymentDate).getMonth() + 1 : new Date().getMonth() + 1)
        const latestYear = Number(latestPayment.salaryYear) || (latestPayment.paymentDate ? new Date(latestPayment.paymentDate).getFullYear() : new Date().getFullYear())
        setSelectedPayrollMonth({ month: latestMonth, year: latestYear })
      } else {
        setSelectedPayrollMonth({ month: new Date().getMonth() + 1, year: new Date().getFullYear() })
      }
    } catch (error) {
      console.error('Failed to fetch payments for member:', error)
      setPayments([])
    }
    setPayrollLoading(false)
  }

  const fetchPayrollDashboard = async () => {
    try {
      const snap = await getDocs(collection(db, 'employeePayments'))
      const allPayments = snap.docs.map(d => {
        const data = d.data()
        const normalizedPaymentType = (data.paymentType || 'Salary').toString().trim()
        const salaryMonth = Number(data.salaryMonth) || 0
        const salaryYear = Number(data.salaryYear) || 0
        const parsedDate = data.paymentDate ? new Date(data.paymentDate) : null
        return {
          id: d.id,
          ...data,
          paymentType: normalizedPaymentType,
          paymentTypeLower: normalizedPaymentType.toLowerCase(),
          salaryMonth: salaryMonth || (parsedDate ? parsedDate.getMonth() + 1 : 0),
          salaryYear: salaryYear || (parsedDate ? parsedDate.getFullYear() : 0),
          amount: Number(data.amount) || 0,
        }
      })
      const currentMonth = new Date().getMonth() + 1
      const currentYear = new Date().getFullYear()
      const paidThisMonth = allPayments.filter(payment => payment.salaryMonth === currentMonth && payment.salaryYear === currentYear).reduce((sum, payment) => sum + payment.amount, 0)
      const advancePaid = allPayments.filter(payment => payment.paymentTypeLower === 'advance').reduce((sum, payment) => sum + payment.amount, 0)
      const salaryPaidByMember = new Map()
      allPayments.filter(payment => payment.paymentTypeLower === 'salary' && payment.salaryMonth === currentMonth && payment.salaryYear === currentYear)
        .forEach(payment => {
          const current = salaryPaidByMember.get(payment.teamMemberId) || 0
          salaryPaidByMember.set(payment.teamMemberId, current + (Number(payment.amount) || 0))
        })
      const totalMonthlyPayroll = members.reduce((sum, member) => sum + (Number(member.monthlySalary) || 0), 0)
      const totalPendingSalary = members.reduce((sum, member) => {
        const salary = Number(member.monthlySalary) || 0
        const paid = salaryPaidByMember.get(member.id) || 0
        return sum + Math.max(salary - paid, 0)
      }, 0)
      setDashboardTotals({
        totalEmployees: members.length,
        totalMonthlyPayroll,
        totalPaidThisMonth: paidThisMonth,
        totalPendingSalary,
        totalAdvancePaid: advancePaid,
      })
    } catch {
      setDashboardTotals(prev => prev)
    }
  }

  useEffect(() => { fetchMembers() }, [])
  useEffect(() => { fetchPayrollDashboard() }, [members])
  useEffect(() => {
    if (!selectedMember || selectedMember.isOwner) {
      setPayments([])
      return
    }
    fetchPaymentsForMember(selectedMember.id)
    setPaymentFilter('All')
  }, [selectedMember])

  useEffect(() => {
    if (!toastMessage) return
    const t = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [toastMessage])

  useEffect(() => {
    async function fetchBookings() {
      try {
        const snap = await getDocs(collection(db, 'bookings'))
        setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch { }
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
      monthlySalary: member.monthlySalary ? String(member.monthlySalary) : '',
      joiningDate: member.joiningDate || '',
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
      monthlySalary: Number(form.monthlySalary) || 0,
      joiningDate: form.joiningDate || '',
      updatedAt: serverTimestamp(),
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'teamMembers', editingId), payload)
      } else {
        const isWalker = (payload.role || '').toLowerCase().includes('walker')
        const extra = isWalker ? { activationToken: generateUniqueToken(), isActivated: false } : {}
        await addDoc(collection(db, 'teamMembers'), {
          ...payload,
          ...extra,
          active: true,
          showOnWeb: true,
          showOnHome: false,
          rating: '5.0',
          verified: true,
          badgeText: 'Verified',
          createdAt: serverTimestamp(),
        })
      }
      closeForm()
      await fetchMembers()
      setToastType('success')
      setToastMessage(editingId ? 'Team member updated successfully.' : 'Team member added successfully.')
    } catch {
      const msg = editingId ? 'Could not update team member.' : 'Could not add team member. Please try again.'
      setToastType('error')
      setToastMessage(msg)
      alert(msg)
    }
    setSaving(false)
  }

  const resetPaymentForm = (override = {}) => {
    setPaymentForm({
      amount: '',
      paymentType: 'Salary',
      paymentMethod: 'Cash',
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      salaryMonth: selectedPayrollMonth.month,
      salaryYear: selectedPayrollMonth.year,
      notes: '',
      ...override,
    })
  }

  const toggleMember = async member => {
    if (!member?.id) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'teamMembers', member.id), { active: member.active === false ? true : false, updatedAt: serverTimestamp() })
      // update local state
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, active: member.active === false ? true : false } : m))
      setSelectedMember(prev => prev && prev.id === member.id ? { ...prev, active: member.active === false ? true : false } : prev)
      setToastType('success')
      setToastMessage(member.active === false ? 'Team member activated.' : 'Team member deactivated.')
    } catch (err) {
      console.error('Failed to toggle member active state:', err)
      setToastType('error')
      setToastMessage('Could not update member status. Please try again.')
    }
    setSaving(false)
  }

  const handleCopyWalkerLink = async (member) => {
    if (!member) return
    let token = member.activationToken
    if (!token && !member.isActivated) {
      token = generateUniqueToken()
      await updateDoc(doc(db, 'teamMembers', member.id), { activationToken: token })
      member.activationToken = token
    }
    const portalUrl = member.isActivated
      ? `${window.location.origin}/walker`
      : `${window.location.origin}/walker/setup?token=${token}&walkerId=${member.id}`

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(portalUrl).then(() => {
        setToastType('success')
        setToastMessage(`Link copied for ${member.name}!`)
      }).catch(() => {
        prompt('Copy Walker Link:', portalUrl)
      })
    } else {
      prompt('Copy Walker Link:', portalUrl)
    }
  }

  const handleShareWalkerWhatsApp = async (member) => {
    if (!member) return
    let token = member.activationToken
    if (!token && !member.isActivated) {
      token = generateUniqueToken()
      await updateDoc(doc(db, 'teamMembers', member.id), { activationToken: token })
      member.activationToken = token
    }

    const rawPhone = String(member.phone || '').replace(/\D/g, '')
    const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone

    let msg = ''
    if (member.isActivated) {
      const portalUrl = `${window.location.origin}/walker`
      msg = `🐾 *Paw Paw Pet Care — Dog Walker Portal*

Hello *${member.name}*!
Your Walker Portal account is active. You can log in using your registered mobile (*${member.phone}*) and your private password:
👉 ${portalUrl}

Please save this link on your phone home screen for quick daily access!`
    } else {
      const setupUrl = `${window.location.origin}/walker/setup?token=${token}&walkerId=${member.id}`
      msg = `🐾 *Paw Paw Pet Care — Walker Account Activation*

Hello *${member.name}*!
You have been registered as a Dog Walker with Paw Paw.

Please tap the link below to create your private password / PIN and activate your Walker account:
👉 ${setupUrl}

Once set, you will be able to view your assigned dogs and stream live GPS walks!`
    }

    const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  const handleResetWalkerPassword = async (member) => {
    if (!member) return
    const confirmReset = window.confirm(`Reset password for ${member.name}? They will be sent a new WhatsApp activation link to set a new password.`)
    if (!confirmReset) return

    const token = generateUniqueToken()
    await updateDoc(doc(db, 'teamMembers', member.id), {
      activationToken: token,
      isActivated: false,
      passwordHash: null,
      salt: null,
      activeSessionId: null,
      updatedAt: serverTimestamp(),
    })

    setToastType('success')
    setToastMessage(`Password reset link generated for ${member.name}!`)
    await fetchMembers()

    const setupUrl = `${window.location.origin}/walker/setup?token=${token}&walkerId=${member.id}`
    const rawPhone = String(member.phone || '').replace(/\D/g, '')
    const cleanPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone
    const msg = `🐾 *Paw Paw — Walker Password Reset*

Hello *${member.name}*!
Your password has been reset by Admin. Please tap the link below to set your new password / PIN:
👉 ${setupUrl}`

    const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  const openPaymentModal = (type = 'Salary', payment = null) => {
    const values = payment ? {
      amount: payment.amount || '',
      paymentType: payment.paymentType || 'Salary',
      paymentMethod: payment.paymentMethod || 'Cash',
      paymentDate: payment.paymentDate ? format(new Date(payment.paymentDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      salaryMonth: Number(payment.salaryMonth) || selectedPayrollMonth.month,
      salaryYear: Number(payment.salaryYear) || selectedPayrollMonth.year,
      notes: payment.notes || '',
    } : {
      amount: '',
      paymentType: type,
      paymentMethod: 'Cash',
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      salaryMonth: selectedPayrollMonth.month,
      salaryYear: selectedPayrollMonth.year,
      notes: '',
    }
    setEditingPayment(payment)
    setPaymentForm(values)
    setPaymentModalOpen(true)
  }

  const closePaymentModal = () => {
    setPaymentModalOpen(false)
    setEditingPayment(null)
    resetPaymentForm()
  }

  const savePayment = async event => {
    if (event) event.preventDefault()
    if (!selectedMember?.id) return
    const amountValue = Number(paymentForm.amount)
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      setToastType('error')
      setToastMessage('Amount must be greater than zero.')
      return
    }
    if (!paymentForm.paymentType || !paymentForm.paymentMethod) {
      setToastType('error')
      setToastMessage('Please select payment type and method.')
      return
    }

    setPaymentSaving(true)
    const payload = {
      teamMemberId: selectedMember.id,
      teamMemberName: selectedMember.name || '',
      amount: amountValue,
      paymentType: paymentForm.paymentType,
      paymentMethod: paymentForm.paymentMethod,
      paymentDate: paymentForm.paymentDate || format(new Date(), 'yyyy-MM-dd'),
      salaryMonth: Number(paymentForm.salaryMonth) || selectedPayrollMonth.month,
      salaryYear: Number(paymentForm.salaryYear) || selectedPayrollMonth.year,
      notes: paymentForm.notes.trim(),
      createdBy: user?.uid || '',
      ...(editingPayment ? { updatedAt: serverTimestamp() } : { createdAt: serverTimestamp() }),
    }

    try {
      if (editingPayment) {
        await updateDoc(doc(db, 'employeePayments', editingPayment.id), payload)
        setToastType('success')
        setToastMessage('Payment updated successfully.')
      } else {
        await addDoc(collection(db, 'employeePayments'), payload)
        setToastType('success')
        setToastMessage('Payment recorded successfully.')
      }
      closePaymentModal()
      setPaymentFilter('All')
      setSelectedPayrollMonth({ month: payload.salaryMonth, year: payload.salaryYear })
      fetchPaymentsForMember(selectedMember.id)
      fetchPayrollDashboard()
    } catch (error) {
      console.error('Failed to save payment:', error)
      setToastType('error')
      setToastMessage('Could not save payment. Please try again.')
    }
    setPaymentSaving(false)
  }

  const handleDeletePayment = async payment => {
    if (!payment?.id) return
    setDeletingPayment(payment)
  }

  const confirmDeletePayment = async () => {
    if (!deletingPayment?.id) return
    setSaving(true)
    try {
      await deleteDoc(doc(db, 'employeePayments', deletingPayment.id))
      setToastType('success')
      setToastMessage('Payment deleted successfully.')
      setDeletingPayment(null)
      fetchPaymentsForMember(selectedMember.id)
      fetchPayrollDashboard()
    } catch {
      setToastType('error')
      setToastMessage('Could not delete payment. Please try again.')
    }
    setSaving(false)
  }

  const handlePayFullSalary = () => {
    if (!selectedMember) return
    const salary = Number(selectedMember.monthlySalary) || 0
    const paidThisMonth = payments.filter(payment => Number(payment.salaryMonth) === selectedPayrollMonth.month && Number(payment.salaryYear) === selectedPayrollMonth.year && payment.paymentType === 'Salary').reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
    const pending = Math.max(salary - paidThisMonth, 0)
    if (pending <= 0) {
      setToastType('info')
      setToastMessage('Salary is already fully paid for the selected month.')
      return
    }
    setPaymentForm({
      amount: String(pending),
      paymentType: 'Salary',
      paymentMethod: 'Cash',
      paymentDate: format(new Date(), 'yyyy-MM-dd'),
      salaryMonth: selectedPayrollMonth.month,
      salaryYear: selectedPayrollMonth.year,
      notes: '',
    })
    setConfirmFullSalary(true)
  }

  const confirmPayFullSalary = async () => {
    setConfirmFullSalary(false)
    await savePayment()
  }

  const downloadMemberPayroll = async () => {
    if (!selectedMember?.id) return
    try {
      const memberPayments = payments.filter(payment => Number(payment.salaryMonth) === selectedPayrollMonth.month && Number(payment.salaryYear) === selectedPayrollMonth.year)
      await downloadPayrollPdf(selectedMember, selectedPayrollMonth.month, selectedPayrollMonth.year, memberPayments)
    } catch {
      setToastType('error')
      setToastMessage('Could not export payroll PDF. Please try again.')
    }
  }

  const handleAddPayment = type => {
    openPaymentModal(type)
  }

  const handleEditPayment = payment => {
    openPaymentModal(payment.paymentType || 'Salary', payment)
  }

  const filteredPayments = payments
    .filter(payment => paymentFilter === 'All' ? true : payment.paymentTypeLower === paymentFilter.toLowerCase())
    .sort((a, b) => {
      const aCreated = a.createdAt?.toMillis?.() || 0
      const bCreated = b.createdAt?.toMillis?.() || 0
      if (aCreated !== bCreated) return bCreated - aCreated
      return new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
    })

  const displayedPayments = showAllPayments ? filteredPayments : filteredPayments.slice(0, 3)

  const memberSalary = Number(selectedMember?.monthlySalary || 0)
  const monthPayments = payments.filter(payment => payment.salaryMonth === selectedPayrollMonth.month && payment.salaryYear === selectedPayrollMonth.year)
  const salaryPaidThisMonth = monthPayments.filter(payment => payment.paymentTypeLower === 'salary').reduce((sum, payment) => sum + payment.amount, 0)
  const advancePaid = monthPayments.filter(payment => payment.paymentTypeLower === 'advance').reduce((sum, payment) => sum + payment.amount, 0)
  const totalPaidThisMonth = monthPayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
  const lastPaymentDate = monthPayments
    .map(payment => new Date(payment.paymentDate))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0]
  const salaryStatus = getSalaryStatus(memberSalary, salaryPaidThisMonth)
  const salaryStatusClass = getSalaryStatusClass(salaryStatus)
  const pendingSalary = Math.max(memberSalary - salaryPaidThisMonth, 0)

  const selectedMonthLabel = `${MONTH_LABELS[selectedPayrollMonth.month - 1]} ${selectedPayrollMonth.year}`
  const updateSelectedPayrollMonth = offset => {
    const date = new Date(selectedPayrollMonth.year, selectedPayrollMonth.month - 1 + offset, 1)
    setSelectedPayrollMonth({ month: date.getMonth() + 1, year: date.getFullYear() })
  }

  const paymentButtons = [
    { label: 'Pay Full Salary', onClick: handlePayFullSalary, className: 'admin-team-action-pay' },
    { label: 'Give Advance', onClick: () => handleAddPayment('Advance'), className: 'admin-team-action-advance' },
    { label: 'Give Bonus', onClick: () => handleAddPayment('Bonus'), className: 'admin-team-action-bonus' },
  ]

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
  const [showImagePreview, setShowImagePreview] = useState(false)
  const [imagePreviewHistoryPushed, setImagePreviewHistoryPushed] = useState(false)

  const Avatar = ({ person, owner: isOwner = false, size }) => {
    const iconSize = size || (isOwner ? 22 : 20)
    const hasPhoto = Boolean(person?.photoUrl)

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          background: '#FFFBEB',
          color: '#D97706',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Users size={iconSize} strokeWidth={2.2} />
        {hasPhoto && (
          <img
            src={person.photoUrl}
            alt={person?.name || (isOwner ? 'Owner' : 'Staff')}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            onError={e => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
      </div>
    )
  }

  const openProfileImage = () => {
    if (!selectedMember?.photoUrl) return
    if (window?.history?.pushState) {
      window.history.pushState({ adminTeamImagePreview: true }, '')
      setImagePreviewHistoryPushed(true)
    }
    setShowImagePreview(true)
  }

  const closeProfileImage = () => {
    setShowImagePreview(false)
    if (imagePreviewHistoryPushed) {
      setImagePreviewHistoryPushed(false)
      window.history.back()
    }
  }

  useEffect(() => {
    const handlePopState = () => {
      if (showImagePreview) {
        setShowImagePreview(false)
        setImagePreviewHistoryPushed(false)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [showImagePreview])

  const ownerStats = useMemo(() => memberStats(owner), [owner, bookings])
  const activeCount = members.filter(m => m.active !== false).length
  const walkersCount = members.filter(m => (m.role || '').toLowerCase().includes('walker') && m.active !== false).length
  const groomersCount = members.filter(m => (m.role || '').toLowerCase().includes('groom') && m.active !== false).length
  const webFeaturedCount = members.filter(m => m.showOnWeb !== false && m.active !== false).length

  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch = !q ||
        (m.name || '').toLowerCase().includes(q) ||
        (m.phone || '').includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.role || '').toLowerCase().includes(q)
      if (!matchesSearch) return false

      if (roleTab === 'All') return true
      if (roleTab === 'Active') return m.active !== false
      if (roleTab === 'Inactive') return m.active === false
      if (roleTab === 'Walkers') return (m.role || '').toLowerCase().includes('walker')
      if (roleTab === 'Groomers') return (m.role || '').toLowerCase().includes('groom')
      if (roleTab === 'Website') return m.showOnWeb !== false && m.active !== false
      if (roleTab === 'Home') return m.showOnHome === true
      return true
    })
  }, [members, searchQuery, roleTab])

  const getRoleStripe = (role = '') => {
    const r = (role || '').toLowerCase()
    if (r.includes('walker')) return 'linear-gradient(90deg, #10B981, #059669)'
    if (r.includes('groom')) return 'linear-gradient(90deg, #F59E0B, #D97706)'
    if (r.includes('board') || r.includes('care')) return 'linear-gradient(90deg, #3B82F6, #1D4ED8)'
    return 'linear-gradient(90deg, var(--accent), #D97706)'
  }

  const getRoleBadge = (role = '') => {
    const r = (role || '').toLowerCase()
    if (r.includes('walker')) {
      return { bg: '#ECFDF5', text: '#047857', border: '#86EFAC', icon: <Footprints size={12} /> }
    }
    if (r.includes('groom')) {
      return { bg: '#FFFBEB', text: '#B45309', border: '#FCD34D', icon: <Scissors size={12} /> }
    }
    if (r.includes('board') || r.includes('care')) {
      return { bg: '#EFF6FF', text: '#1D4ED8', border: '#93C5FD', icon: <Calendar size={12} /> }
    }
    if (r.includes('manager') || r.includes('lead')) {
      return { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A', icon: <Crown size={12} /> }
    }
    return { bg: '#F8FAFC', text: '#334155', border: '#CBD5E1', icon: <UserRound size={12} /> }
  }

  return (
    <div className="admin-page">
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}
      <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
        <div>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '26px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>Team</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={openShowcaseModal}
            style={{ fontSize: '12px', padding: '7px 12px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Settings size={14} /> Showcase Settings
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openAdd}
            style={{ fontSize: '12px', padding: '7px 14px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Plus size={15} /> Add Team Member
          </button>
        </div>
      </div>

      {/* ── Search & Filter Toolbar ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search staff by name, phone, email, or role..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 36px 9px 36px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          {[
            { id: 'All', label: `All (${members.length})` },
            { id: 'Walkers', label: `Walkers (${walkersCount})` },
            { id: 'Groomers', label: `Groomers (${groomersCount})` },
            { id: 'Active', label: `Active (${activeCount})` },
            { id: 'Inactive', label: `Inactive (${members.length - activeCount})` },
          ].map(tab => {
            const active = roleTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRoleTab(tab.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '999px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                  background: active ? 'var(--accent)' : 'var(--card)',
                  color: active ? '#ffffff' : 'var(--text)',
                  boxShadow: active ? '0 2px 6px rgba(217, 119, 6, 0.2)' : 'none',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Simple Staff List UI ── */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner text="Loading team members..." />
        </div>
      ) : (
        <div className="admin-team-simple-list">
          {/* Owner & Founder Row (Always displayed at top when on 'All' or no active role filter) */}
          {(!roleTab || roleTab === 'All' || roleTab === 'Active') && (!searchQuery || (owner?.name || '').toLowerCase().includes(searchQuery.toLowerCase())) && (
            <div
              className="admin-team-row is-owner"
              onClick={() => setSelectedMember(owner)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'var(--card)',
                border: '1.5px solid var(--accent)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'var(--surface)',
                  border: '2px solid var(--accent)',
                  flexShrink: 0,
                }}
              >
                <Avatar person={owner} owner />
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 800 }}>{owner.name}</strong>
                  <span className="badge badge-completed" style={{ fontSize: '10.5px', padding: '1px 7px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <Crown size={11} /> Owner & Founder
                  </span>
                  <span className="badge" style={{ background: '#FFFBEB', color: '#B45309', border: '1px solid #FCD34D', fontSize: '10px', padding: '1px 6px' }}>
                    ⭐ 5.0 Rating
                  </span>
                </div>
                <small style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                  {owner.email || 'Admin'} • {ownerStats.total} bookings ({ownerStats.completed} completed)
                </small>
              </div>

              <ChevronRight size={18} color="var(--muted)" style={{ flexShrink: 0 }} />
            </div>
          )}

          {filteredMembers.length === 0 && searchQuery ? (
            <div className="admin-booking-empty" style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--card)', borderRadius: '14px', border: '1px dashed var(--border)' }}>
              <Users size={32} style={{ margin: '0 auto 10px', color: 'var(--muted)' }} />
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                No team members matching "{searchQuery}"
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
                Try clearing your search query or switching filters.
              </p>
              <button type="button" className="btn btn-secondary" onClick={() => { setSearchQuery(''); setRoleTab('All') }}>
                Clear Search & Filters
              </button>
            </div>
          ) : (
            filteredMembers.map(member => {
              const stats = memberStats(member)
              const roleBadge = getRoleBadge(member.role)
              const isInactive = member.active === false

              return (
                <div
                  key={member.id}
                  className={`admin-team-row${isInactive ? ' is-inactive' : ''}`}
                  onClick={() => setSelectedMember(member)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      background: 'var(--surface)',
                      border: '1.5px solid var(--border)',
                      flexShrink: 0,
                    }}
                  >
                    <Avatar person={member} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 800 }}>
                        {member.name || 'Team Member'}
                      </strong>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: '999px',
                          background: roleBadge.bg,
                          color: roleBadge.text,
                          border: `1px solid ${roleBadge.border}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        {roleBadge.icon} {member.role || 'Staff'}
                      </span>
                      {isInactive && (
                        <span className="badge badge-cancelled" style={{ fontSize: '9.5px', padding: '1px 6px' }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    <small style={{ fontSize: '11.5px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      <Phone size={11} /> {member.phone || '-'}
                      <span>•</span>
                      <span>{stats.total} bookings ({stats.completed} done)</span>
                    </small>
                  </div>

                  {member.monthlySalary ? (
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {formatCurrency(member.monthlySalary)}/mo
                    </div>
                  ) : null}

                  <ChevronRight size={18} color="var(--muted)" style={{ flexShrink: 0 }} />
                </div>
              )
            })
          )}
        </div>
      )}

      {selectedMember && (() => {
        const stats = memberStats(selectedMember)
        return (
          <div className="modal-overlay" onClick={() => setSelectedMember(null)}>
            <div className="modal-box admin-team-detail-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-team-modal-head">
                <div>
                  <h2 style={{ margin: 0 }}>Team Details</h2>
                </div>
                <button type="button" onClick={() => setSelectedMember(null)} aria-label="Close team details"><X size={18} /></button>
              </div>

              <div className="admin-team-detail-body">
                <div className="admin-team-detail-grid">
                  <section className="admin-team-profile-panel">
                    <div className="admin-team-profile-head">
                      <div
                        className="admin-team-profile-avatar"
                        style={{
                          width: '70px',
                          height: '70px',
                          flex: '0 0 70px',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          cursor: selectedMember?.photoUrl ? 'pointer' : 'default',
                        }}
                        onClick={selectedMember?.photoUrl ? openProfileImage : undefined}
                      >
                        <Avatar person={selectedMember} owner={selectedMember.isOwner} size={32} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="admin-team-title">
                          <strong>{selectedMember.name}</strong>
                          {selectedMember.isOwner ? <span className="badge badge-completed">Owner</span> : <span className="badge badge-online">{selectedMember.role || 'Team Member'}</span>}
                          {!selectedMember.isOwner && selectedMember.active === false && <span className="badge badge-cancelled">Inactive</span>}
                        </div>
                        <p><Mail size={13} /> {selectedMember.email || '-'}</p>
                        <p>
                          <Phone size={13} />
                          {selectedMember.phone ? (
                            <a href={`tel:${selectedMember.phone}`} style={{ color: 'inherit', textDecoration: 'none', marginLeft: '6px' }}>
                              {selectedMember.phone}
                            </a>
                          ) : '-'}
                        </p>
                      </div>
                    </div>

                    <div className="admin-team-stat-card-grid">
                      <div className="admin-team-stat-card">
                        <div className="admin-team-stat-icon"><Users size={18} /></div>
                        <span>Total Assigned</span>
                        <strong>{stats.total}</strong>
                      </div>
                      <div className="admin-team-stat-card">
                        <div className="admin-team-stat-icon"><CheckSquare size={18} /></div>
                        <span>Completed</span>
                        <strong>{stats.completed}</strong>
                      </div>
                      <div className="admin-team-stat-card">
                        <div className="admin-team-stat-icon"><IndianRupee size={18} /></div>
                        <span>Earnings</span>
                        <strong>Rs {money(stats.earnings)}</strong>
                      </div>
                    </div>

                    {!selectedMember.isOwner && (
                      <>
                        <div className="admin-team-info-panel">
                          <div className="admin-team-info-row">
                            <div className="admin-team-info-left">
                              <div className="admin-team-info-icon"><Calendar size={16} /></div>
                              <span>Joining Date</span>
                            </div>
                            <strong>{formatShortDate(selectedMember.joiningDate)}</strong>
                          </div>
                          <div className="admin-team-info-row">
                            <div className="admin-team-info-left">
                              <div className="admin-team-info-icon"><IndianRupee size={16} /></div>
                              <span>Monthly Salary</span>
                            </div>
                            <strong>{formatCurrency(Number(selectedMember.monthlySalary) || 0)}</strong>
                          </div>
                          <div className={`admin-team-info-row status-row${selectedMember.active === false ? ' inactive' : ''}`}>
                            <div className="admin-team-info-left">
                              <div className="admin-team-status-indicator" />
                              <span>Status</span>
                            </div>
                            <strong>{selectedMember.active === false ? 'Inactive' : 'Active'}</strong>
                          </div>
                        </div>

                        {/* Dedicated Walker Portal Access Card for Walker roles */}
                        {(selectedMember.role || '').toLowerCase().includes('walker') && (
                          <div style={{ marginTop: '16px', padding: '16px', background: 'linear-gradient(135deg, rgba(197, 139, 36, 0.08), rgba(197, 139, 36, 0.02))', border: '1.5px solid rgba(197, 139, 36, 0.3)', borderRadius: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '13.5px', color: 'var(--text)' }}>
                                <Footprints size={18} color="var(--accent)" /> Walker Security & Portal Access
                              </div>
                              {selectedMember.isActivated ? (
                                <span className="badge badge-online" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <ShieldCheck size={12} /> Account Active
                                </span>
                              ) : (
                                <span className="badge badge-pending" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <KeyRound size={12} /> Pending Password Setup
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
                              {selectedMember.isActivated
                                ? `Account is active. ${selectedMember.name} can log in with their phone (${selectedMember.phone}) and password on any single device.`
                                : `Activation link is ready. Send the link to ${selectedMember.name} on WhatsApp so they can set their private password and activate their portal.`}
                            </p>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => handleShareWalkerWhatsApp(selectedMember)}
                                className="btn btn-primary"
                                style={{ background: '#25D366', borderColor: '#20BA5C', color: '#fff', fontSize: '12px', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              >
                                <MessageCircle size={15} /> {selectedMember.isActivated ? 'Send Login Link (WhatsApp)' : 'Send Setup Link (WhatsApp)'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyWalkerLink(selectedMember)}
                                className="btn btn-secondary"
                                style={{ fontSize: '12px', padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              >
                                <Copy size={15} /> Copy Link
                              </button>
                              {selectedMember.isActivated && (
                                <button
                                  type="button"
                                  onClick={() => handleResetWalkerPassword(selectedMember)}
                                  className="btn btn-secondary"
                                  style={{ fontSize: '12px', padding: '8px 12px', color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                  title="Reset Walker Password"
                                >
                                  <KeyRound size={13} /> Reset Password
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="admin-team-detail-actions">
                          <button type="button" className="btn admin-team-edit-button" onClick={() => openEdit(selectedMember)}>
                            <Edit3 size={18} /> Edit
                          </button>
                          <button type="button" className={selectedMember.active === false ? 'btn admin-team-activate-button' : 'btn admin-team-deactivate-button'} onClick={() => toggleMember(selectedMember)} disabled={saving}>
                            <Trash2 size={18} /> {selectedMember.active === false ? 'Activate' : 'Deactivate'}
                          </button>
                        </div>
                      </>
                    )}
                  </section>

                  {showImagePreview && selectedMember?.photoUrl && (
                    <div className="modal-overlay" style={{ zIndex: 1400 }} onClick={closeProfileImage}>
                      <div className="modal-box admin-team-image-preview" style={{ maxWidth: '92vw', width: 'min(680px, calc(100vw - 32px))', padding: '18px', background: 'var(--card)', position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={closeProfileImage} aria-label="Close image preview" style={{ position: 'absolute', top: '14px', right: '14px', width: '40px', height: '40px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
                        <img src={selectedMember.photoUrl} alt={selectedMember.name || 'Team member'} style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '14px' }} />
                      </div>
                    </div>
                  )}

                  {!selectedMember.isOwner && (
                    <section className="admin-team-payroll-panel">
                      <div className="admin-team-payroll-summary-head">
                        <div>
                          <span className="section-label">Payroll Summary</span>
                        </div>
                        <div className="admin-team-month-controls">
                          <button type="button" className="icon-btn" onClick={() => updateSelectedPayrollMonth(-1)} aria-label="Previous month">
                            <ChevronLeft size={18} />
                          </button>
                          <div className="admin-team-month-select-wrapper">
                            <Calendar size={16} />
                            <select className="input admin-team-month-select" value={`${selectedPayrollMonth.month}-${selectedPayrollMonth.year}`} onChange={e => {
                              const [month, year] = e.target.value.split('-').map(Number)
                              setSelectedPayrollMonth({ month, year })
                            }}>
                              {getMonthOptions(12).map(option => (
                                <option key={`${option.month}-${option.year}`} value={`${option.month}-${option.year}`}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                          <button type="button" className="icon-btn" onClick={() => updateSelectedPayrollMonth(1)} aria-label="Next month">
                            <ChevronRight size={18} />
                          </button>
                        </div>
                      </div>

                      <div className="admin-team-payroll-card-grid">
                        <div className="admin-team-payroll-card-sm admin-team-paid-card">
                          <span>Paid This Month</span>
                          <strong>{formatCurrency(salaryPaidThisMonth)}</strong>
                        </div>
                        <div className="admin-team-payroll-card-sm admin-team-pending-card">
                          <span>Pending Salary</span>
                          <strong>{formatCurrency(pendingSalary)}</strong>
                        </div>
                        <div className="admin-team-payroll-card-sm admin-team-advance-card">
                          <span>Advance Paid</span>
                          <strong>{formatCurrency(advancePaid)}</strong>
                        </div>
                      </div>

                      <div className="admin-team-payroll-meta-row">
                        <div className="admin-team-payroll-status-box">
                          <span>Salary Status</span>
                          <div className={`admin-team-payroll-status-pill ${salaryStatusClass}`}>
                            <strong>{salaryStatus}</strong>
                          </div>
                        </div>
                        <div className="admin-team-last-payment admin-team-last-payment-inline">
                          <div className="admin-team-last-payment-icon"><Calendar size={16} /></div>
                          <div>
                            <span>Last Payment Date</span>
                            <strong>{formatShortDate(lastPaymentDate)}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="admin-team-payroll-actions-row">
                        <button type="button" className="btn admin-team-pay-button" onClick={handlePayFullSalary} disabled={saving}>
                          <CreditCard size={18} />
                          Pay Full Salary
                        </button>
                        <button type="button" className="btn admin-team-advance-button" onClick={() => openPaymentModal('Advance')} disabled={saving}>
                          <ArrowUpCircle size={18} />
                          Give Advance
                        </button>
                        <button type="button" className="btn admin-team-bonus-button" onClick={() => openPaymentModal('Bonus')} disabled={saving}>
                          <Gift size={18} />
                          Give Bonus
                        </button>
                        <button type="button" className="btn admin-team-add-payment-button" onClick={() => openPaymentModal('Salary')}>
                          <Plus size={18} />
                          Add Payment
                        </button>
                      </div>

                      <div className="admin-team-payment-history-head">
                        <div>
                          <h4>Payment History</h4>
                          <p>{showAllPayments ? `${filteredPayments.length} records` : `${Math.min(3, filteredPayments.length)} latest records`}</p>
                        </div>
                        <div className="admin-team-payment-history-actions">
                          <div className="admin-team-payment-filters">
                            <label htmlFor="payment-filter-dropdown" className="sr-only">Payment type</label>
                            <select
                              id="payment-filter-dropdown"
                              className="input admin-team-payment-filter-select"
                              value={paymentFilter}
                              onChange={e => {
                                setPaymentFilter(e.target.value)
                                setShowAllPayments(false)
                              }}
                            >
                              {FILTER_TYPES.map(filter => (
                                <option key={filter} value={filter}>{filter}</option>
                              ))}
                            </select>
                          </div>
                          {filteredPayments.length > 3 && (
                            <button type="button" className="btn btn-secondary admin-team-view-all" onClick={() => setShowAllPayments(prev => !prev)}>
                              {showAllPayments ? 'Show Less' : 'View All'}
                            </button>
                          )}
                        </div>
                      </div>

                      {payrollLoading ? <Spinner text="Loading payroll..." /> : filteredPayments.length === 0 ? (
                        <div className="admin-booking-empty">
                          <Users size={24} style={{ margin: '0 auto 10px', color: 'var(--muted)' }} />
                          No payments found for this employee.
                        </div>
                      ) : (
                        <div className="admin-team-payment-list">
                          {displayedPayments.map(payment => (
                            <div key={payment.id} className="admin-team-payment-card">
                              <div className="admin-team-payment-card-main">
                                <div className={`admin-team-payment-icon ${payment.paymentType?.toLowerCase()}`}>
                                  {payment.paymentType === 'Salary' ? <IndianRupee size={18} /> : payment.paymentType === 'Advance' ? <ArrowUpCircle size={18} /> : <Gift size={18} />}
                                </div>
                                <div className="admin-team-payment-card-title">
                                  <strong>{payment.paymentType || 'Other'}</strong>
                                  <span>{MONTH_LABELS[(Number(payment.salaryMonth) || 1) - 1]} {payment.salaryYear || '-'}</span>
                                </div>
                                <div className="admin-team-payment-amount">
                                  <span>Rs</span>
                                  <strong>{formatCurrency(payment.amount)}</strong>
                                </div>
                              </div>
                              <div className="admin-team-payment-card-meta">
                                <div>
                                  <span className="admin-team-payment-label">Method</span>
                                  <strong>{payment.paymentMethod || '-'}</strong>
                                </div>
                                <div>
                                  <span className="admin-team-payment-label">Date</span>
                                  <strong>{formatShortDate(payment.paymentDate)}</strong>
                                </div>
                                <div className="admin-team-payment-notes">
                                  <span className="admin-team-payment-label">Notes</span>
                                  <strong>{payment.notes || 'No notes'}</strong>
                                </div>
                              </div>
                              <div className="admin-team-payment-card-actions">
                                <button type="button" className="btn btn-icon" onClick={() => handleEditPayment(payment)}>
                                  <Edit3 size={14} />
                                </button>
                                <button type="button" className="btn btn-icon btn-danger" onClick={() => handleDeletePayment(payment)}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <button type="button" className="btn btn-secondary admin-team-export-button" onClick={downloadMemberPayroll}>
                        <Save size={14} /> Export Payroll PDF
                      </button>
                    </section>
                  )}

                  {selectedMember.isOwner && (
                    <div className="admin-team-owner-note">
                      Owner details come from the saved profile and auth photo.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {paymentModalOpen && (
        <div className="modal-overlay" onClick={closePaymentModal}>
          <form className="modal-box admin-team-modal" onSubmit={savePayment} onClick={e => e.stopPropagation()}>
            <div className="admin-team-modal-head">
              <div>
                <h2>{editingPayment ? 'Edit Payment' : 'Add Payment'}</h2>
                <p>{editingPayment ? 'Update this payment record.' : 'Record a salary, advance, bonus, or other payment.'}</p>
              </div>
              <button type="button" onClick={closePaymentModal} aria-label="Close payment form"><X size={18} /></button>
            </div>

            <div className="admin-team-form">
              <label>Amount *</label>
              <input className="input" type="number" min="1" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))} placeholder="0" autoFocus />

              <label>Payment Type *</label>
              <select className="input" value={paymentForm.paymentType} onChange={e => setPaymentForm(prev => ({ ...prev, paymentType: e.target.value }))}>
                {PAYMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>

              <label>Payment Method *</label>
              <select className="input" value={paymentForm.paymentMethod} onChange={e => setPaymentForm(prev => ({ ...prev, paymentMethod: e.target.value }))}>
                {PAYMENT_METHODS.map(method => <option key={method} value={method}>{method}</option>)}
              </select>

              <label>Payment Date</label>
              <input className="input" type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))} />

              <label>Salary Month</label>
              <select className="input" value={`${paymentForm.salaryMonth}-${paymentForm.salaryYear}`} onChange={e => {
                const [month, year] = e.target.value.split('-').map(Number)
                setPaymentForm(prev => ({ ...prev, salaryMonth: month, salaryYear: year }))
              }}>
                {getMonthOptions(18).map(option => (
                  <option key={`${option.month}-${option.year}`} value={`${option.month}-${option.year}`}>{option.label}</option>
                ))}
              </select>

              <label>Notes</label>
              <textarea className="input" value={paymentForm.notes} onChange={e => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))} rows={3} placeholder="Notes or description" />

              <div className="admin-team-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closePaymentModal} disabled={paymentSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={paymentSaving || !paymentForm.amount || !paymentForm.paymentType || !paymentForm.paymentMethod}>
                  {editingPayment ? 'Save Payment' : 'Add Payment'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deletingPayment)}
        title="Delete payment"
        message={deletingPayment ? `Delete ${formatCurrency(deletingPayment.amount)} ${deletingPayment.paymentType || 'payment'}? This cannot be undone.` : 'Delete payment?'}
        confirmText="Delete"
        danger={true}
        loading={saving}
        onConfirm={confirmDeletePayment}
        onCancel={() => setDeletingPayment(null)}
      />

      <ConfirmModal
        open={confirmFullSalary}
        title="Confirm full salary"
        message={`Pay ${formatCurrency(paymentForm.amount)} to ${selectedMember?.name || 'the employee'} for ${selectedMonthLabel}?`}
        confirmText="Pay Salary"
        danger={false}
        loading={paymentSaving}
        onConfirm={confirmPayFullSalary}
        onCancel={() => setConfirmFullSalary(false)}
      />

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
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {['Walker', 'Groomer', 'Manager', 'Assistant'].map(r => {
                  const isSelected = form.role?.trim().toLowerCase() === r.toLowerCase()
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => update('role', r)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        background: isSelected ? 'var(--accent-bg)' : 'var(--surface)',
                        color: isSelected ? 'var(--accent)' : 'var(--muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {r === 'Walker' ? <Footprints size={12} /> : null} {r}
                    </button>
                  )
                })}
              </div>
              <input className="input" value={form.role} onChange={e => update('role', e.target.value)} placeholder="Walker, Groomer, Driver, Assistant..." />
              <label>Monthly Salary</label>
              <input className="input" type="number" min="0" value={form.monthlySalary} onChange={e => update('monthlySalary', e.target.value)} placeholder="0" />
              <label>Joining Date</label>
              <input className="input" type="date" value={form.joiningDate} onChange={e => update('joiningDate', e.target.value)} />

              <div className="admin-team-modal-actions" style={{ marginTop: '18px' }}>
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

      {/* MODAL: Website Showcase & Home Screen Settings */}
      {showSectionModal && (
        <div className="modal-overlay" onClick={() => setShowSectionModal(false)}>
          <div className="modal-box" style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 4px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings size={18} color="var(--accent)" /> Public Team Showcase Settings
                </h2>
                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--muted)' }}>
                  Customize the heading, description, and decide which staff appear on the Home screen and in what order.
                </p>
              </div>
              <button type="button" onClick={() => setShowSectionModal(false)} className="icon-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveSectionSettings}>
              {/* Showcase Content Section */}
              <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '20px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '12px' }}>
                  📝 Section Text & Visibility
                </span>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '14px' }}>
                  <input
                    type="checkbox"
                    checked={sectionSettings.enabled !== false}
                    onChange={e => setSectionSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    Display "Our Team" Section on Home Screen
                  </span>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                      Badge / Tagline
                    </label>
                    <input
                      className="input"
                      value={sectionSettings.badge || ''}
                      onChange={e => setSectionSettings(prev => ({ ...prev, badge: e.target.value }))}
                      placeholder="e.g. Certified & Passionate"
                      style={{ fontSize: '12.5px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                      Section Heading
                    </label>
                    <input
                      className="input"
                      value={sectionSettings.title || ''}
                      onChange={e => setSectionSettings(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. Meet Our Pet Care Team"
                      style={{ fontSize: '12.5px' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Section Description (shown below heading)
                  </label>
                  <textarea
                    className="input"
                    rows={2}
                    value={sectionSettings.description || ''}
                    onChange={e => setSectionSettings(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Brief description about your team for customers..."
                    style={{ resize: 'vertical', minHeight: '52px', fontSize: '12.5px' }}
                  />
                </div>
              </div>

              {/* Founder / Owner Profile Configuration */}
              <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '20px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '12px' }}>
                  👑 Founder & Owner Profile (Shown on "Our Team" Page)
                </span>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '14px' }}>
                  <input
                    type="checkbox"
                    checked={sectionSettings.showOwner !== false}
                    onChange={e => setSectionSettings(prev => ({ ...prev, showOwner: e.target.checked }))}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    Feature Founder & Leadership Card on "Our Team" Page
                  </span>
                </label>

                {/* Founder Photo Section */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', flexWrap: 'wrap', padding: '12px', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '50%',
                    padding: '2px',
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(217, 119, 6, 0.25)',
                  }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {sectionSettings.ownerPhotoUrl ? (
                        <img src={sectionSettings.ownerPhotoUrl} alt="Founder Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (adminPhoto ? (
                        <img src={adminPhoto} alt="Admin Profile Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <UserRound size={30} color="var(--accent)" />
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '220px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <label className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px', cursor: 'pointer', opacity: uploadingOwnerPhoto ? 0.7 : 1 }}>
                        <Upload size={13} /> {optimizingOwnerPhoto ? 'Optimizing...' : uploadingOwnerPhoto ? 'Uploading...' : 'Upload Photo'}
                        <input type="file" accept={IMAGE_FILE_ACCEPT} disabled={uploadingOwnerPhoto || savingSection} onChange={e => handleOwnerPhotoUpload(e.target.files?.[0])} style={{ display: 'none' }} />
                      </label>

                      {adminPhoto && sectionSettings.ownerPhotoUrl !== adminPhoto && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setSectionSettings(prev => ({ ...prev, ownerPhotoUrl: adminPhoto }))}
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                        >
                          Use Admin Profile Photo
                        </button>
                      )}

                      {sectionSettings.ownerPhotoUrl && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => setSectionSettings(prev => ({ ...prev, ownerPhotoUrl: '' }))}
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                        >
                          <X size={13} /> Clear
                        </button>
                      )}
                    </div>
                    <small style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Admin profile photo is automatically linked as owner. You can also upload a custom photo.
                    </small>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                      Founder / Owner
                    </label>
                    <input
                      className="input"
                      value={sectionSettings.ownerName || ''}
                      onChange={e => setSectionSettings(prev => ({ ...prev, ownerName: e.target.value }))}
                      placeholder="e.g. Prem Tandalekar"
                      style={{ fontSize: '12.5px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                      Title / Role
                    </label>
                    <input
                      className="input"
                      value={sectionSettings.ownerRole || ''}
                      onChange={e => setSectionSettings(prev => ({ ...prev, ownerRole: e.target.value }))}
                      placeholder="e.g. Founder & Pet Care Director"
                      style={{ fontSize: '12.5px' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Experience / Credentials
                  </label>
                  <input
                    className="input"
                    value={sectionSettings.ownerExperience || ''}
                    onChange={e => setSectionSettings(prev => ({ ...prev, ownerExperience: e.target.value }))}
                    placeholder="e.g. 6+ Years Experience · Canine Specialist"
                    style={{ fontSize: '12.5px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                    Founder Message / Vision Quote
                  </label>
                  <textarea
                    className="input"
                    rows={2}
                    value={sectionSettings.ownerBio || ''}
                    onChange={e => setSectionSettings(prev => ({ ...prev, ownerBio: e.target.value }))}
                    placeholder="Founder vision message..."
                    style={{ resize: 'vertical', minHeight: '52px', fontSize: '12.5px' }}
                  />
                </div>
              </div>

              {/* Team Members Website Showcase & Ratings Editor */}
              <div style={{ background: 'var(--card)', padding: '16px', borderRadius: '14px', border: '1.5px solid var(--accent-border)', marginBottom: '20px' }}>
                <div style={{ marginBottom: '14px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '2px' }}>
                    🌐 Team Members Website Showcase & Ratings
                  </span>
                  <small style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                    Customize star ratings, customer quotes/bios, verified badge, skills, and choose who appears on the public website and home screen.
                  </small>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {members.filter(m => m.active !== false).map(m => {
                    const sc = memberShowcase[m.id] || {
                      rating: m.rating || '5.0',
                      verified: m.verified !== false,
                      badgeText: m.badgeText || 'Verified',
                      tagline: m.tagline || '',
                      experience: m.experience || '',
                      bio: m.bio || '',
                      skills: Array.isArray(m.skills) ? m.skills.join(', ') : (m.skills || ''),
                      bookingButtonText: m.bookingButtonText || '',
                      showOnWeb: m.showOnWeb !== false,
                      showOnHome: m.showOnHome === true,
                      order: m.order !== undefined && m.order !== null ? String(m.order) : (m.homeOrder !== undefined && m.homeOrder !== null ? String(m.homeOrder) : ''),
                    }
                    const isExpanded = expandedShowcaseMember === m.id

                    return (
                      <div
                        key={m.id}
                        style={{
                          borderRadius: '12px',
                          border: isExpanded ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                          background: isExpanded ? 'var(--accent-bg)' : 'var(--surface)',
                          overflow: 'hidden',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {/* Member Header Bar */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            gap: '10px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '160px' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', background: 'var(--border)', flexShrink: 0 }}>
                              {m.photoUrl ? (
                                <img src={m.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: 'var(--muted)' }}>
                                  {(m.name || 'T')[0]}
                                </div>
                              )}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <strong style={{ fontSize: '13.5px', color: 'var(--text)' }}>{m.name}</strong>
                                <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#B45309', background: '#FFFBEB', padding: '1px 6px', borderRadius: '4px', border: '1px solid #FCD34D' }}>
                                  ⭐ {sc.rating || '5.0'}
                                </span>
                              </div>
                              <small style={{ fontSize: '11px', color: 'var(--muted)' }}>{m.role || 'Staff'}</small>
                            </div>
                          </div>

                          {/* Quick Toggles */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={sc.showOnWeb !== false}
                                onChange={e => updateMemberShowcase(m.id, 'showOnWeb', e.target.checked)}
                                style={{ width: '15px', height: '15px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                              />
                              <span>On Web</span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text)', cursor: 'pointer', margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={sc.showOnHome === true}
                                onChange={e => updateMemberShowcase(m.id, 'showOnHome', e.target.checked)}
                                style={{ width: '15px', height: '15px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                              />
                              <span>⭐ Home</span>
                            </label>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)' }}>Order:</span>
                              <input
                                type="number"
                                min="1"
                                placeholder="1"
                                value={sc.order || ''}
                                onChange={e => updateMemberShowcase(m.id, 'order', e.target.value)}
                                disabled={!sc.showOnHome}
                                style={{
                                  width: '46px',
                                  padding: '3px 6px',
                                  fontSize: '11.5px',
                                  textAlign: 'center',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border)',
                                  background: sc.showOnHome ? 'var(--card)' : '#f3f4f6',
                                  color: 'var(--text)',
                                }}
                                title="Home screen display sequence"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => setExpandedShowcaseMember(isExpanded ? null : m.id)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: isExpanded ? 'var(--accent)' : 'var(--card)',
                                color: isExpanded ? '#ffffff' : 'var(--text)',
                                border: '1px solid var(--accent-border)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              {isExpanded ? 'Hide Details ▲' : 'Showcase Details ▼'}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Details Editor */}
                        {isExpanded && (
                          <div style={{ padding: '14px', borderTop: '1px solid var(--accent-border)', background: 'var(--card)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                              <div>
                                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                                  ⭐ Rating Score
                                </label>
                                <input
                                  className="input"
                                  value={sc.rating || ''}
                                  onChange={e => updateMemberShowcase(m.id, 'rating', e.target.value)}
                                  placeholder="5.0"
                                  style={{ fontSize: '12px', padding: '6px 10px' }}
                                />
                              </div>

                              <div>
                                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                                  Badge Text
                                </label>
                                <input
                                  className="input"
                                  value={sc.badgeText || ''}
                                  onChange={e => updateMemberShowcase(m.id, 'badgeText', e.target.value)}
                                  placeholder="Verified"
                                  style={{ fontSize: '12px', padding: '6px 10px' }}
                                />
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', paddingTop: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', margin: 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={sc.verified !== false}
                                    onChange={e => updateMemberShowcase(m.id, 'verified', e.target.checked)}
                                    style={{ width: '15px', height: '15px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                                  />
                                  <span>Show "✓ Verified" Badge</span>
                                </label>
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                              <div>
                                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                                  Tagline / Specialty Title
                                </label>
                                <input
                                  className="input"
                                  value={sc.tagline || ''}
                                  onChange={e => updateMemberShowcase(m.id, 'tagline', e.target.value)}
                                  placeholder="e.g. Dedicated Specialist"
                                  style={{ fontSize: '12px', padding: '6px 10px' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                                  Experience Subtitle
                                </label>
                                <input
                                  className="input"
                                  value={sc.experience || ''}
                                  onChange={e => updateMemberShowcase(m.id, 'experience', e.target.value)}
                                  placeholder="e.g. 3+ Years Experience"
                                  style={{ fontSize: '12px', padding: '6px 10px' }}
                                />
                              </div>
                            </div>

                            <div style={{ marginBottom: '10px' }}>
                              <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                                Customer Quote / Bio Description
                              </label>
                              <textarea
                                className="input"
                                rows={2}
                                value={sc.bio || ''}
                                onChange={e => updateMemberShowcase(m.id, 'bio', e.target.value)}
                                placeholder="e.g. Specializes in active leash walks, positive reinforcement, and safe hydration breaks."
                                style={{ resize: 'vertical', minHeight: '48px', fontSize: '12px', padding: '6px 10px' }}
                              />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                              <div>
                                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                                  Specialty Skill Chips (Comma-separated)
                                </label>
                                <input
                                  className="input"
                                  value={sc.skills || ''}
                                  onChange={e => updateMemberShowcase(m.id, 'skills', e.target.value)}
                                  placeholder="e.g. Leash Training, GPS Tracked, Hydration Care"
                                  style={{ fontSize: '12px', padding: '6px 10px' }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
                                  Booking Button Label (Optional)
                                </label>
                                <input
                                  className="input"
                                  value={sc.bookingButtonText || ''}
                                  onChange={e => updateMemberShowcase(m.id, 'bookingButtonText', e.target.value)}
                                  placeholder="e.g. Book Dog Walking"
                                  style={{ fontSize: '12px', padding: '6px 10px' }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowSectionModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingSection} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Save size={15} /> {savingSection ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
