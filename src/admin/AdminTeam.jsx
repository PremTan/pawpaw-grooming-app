import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { format } from 'date-fns'
import Cropper from 'react-easy-crop'
import { AlertTriangle, Calendar, Camera, CheckCircle, CheckSquare, ChevronLeft, ChevronRight, CreditCard, Edit3, Gift, IndianRupee, Mail, Phone, Plus, Save, Slash, Trash2, Upload, UserRound, Users, X, ArrowUpCircle } from 'lucide-react'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import { useAuth } from '../context/AuthContext'
import { db } from '../firebase'
import { downloadPayrollPdf } from '../utils/payrollPdf'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import { getOwnerAssignee } from '../utils/teamMembers'

const EMPTY = { name: '', phone: '', email: '', role: 'Groomer', photoUrl: '', monthlySalary: '', joiningDate: '' }
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

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height)

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(new File([blob], fileName, { type: 'image/jpeg' })), 'image/jpeg', 0.9)
  })
}

export default function AdminTeam() {
  const { user } = useAuth()
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
      } catch {}
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
      } catch {}
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
        await addDoc(collection(db, 'teamMembers'), { ...payload, active: true, createdAt: serverTimestamp() })
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

  const Avatar = ({ person, owner: isOwner = false }) => (
    person.photoUrl ? <img className="admin-team-photo" src={person.photoUrl} alt={person.name || 'Team member'} /> : <div className="admin-team-avatar"><UserRound size={isOwner ? 18 : 19} /></div>
  )

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

  return (
    <div className="admin-page">
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Team</h1>
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Add staff members and assign confirmed appointments to them.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd}>
          <Plus size={16} /> Add Team Member
        </button>
      </div>

      <div className="admin-team-compact-list">
        <button type="button" className="admin-team-list-item" onClick={() => setSelectedMember(owner)}>
          <Avatar person={owner} owner />
          <span className="admin-team-list-copy">
            <strong>{owner.name}</strong>
            <small>Owner</small>
          </span>
        </button>

        {loading ? <Spinner text="Loading team..." /> : members.length === 0 ? (
          <div className="admin-booking-empty">
            <Users size={24} style={{ margin: '0 auto 10px', color: 'var(--muted)' }} />
            No team members added yet.
          </div>
        ) : members.map(member => (
          <button key={member.id} type="button" className={`admin-team-list-item${member.active === false ? ' inactive' : ''}`} onClick={() => setSelectedMember(member)}>
            <Avatar person={member} />
            <span className="admin-team-list-copy">
              <strong>{member.name || 'Team Member'}</strong>
              <small>{member.role || 'Team Member'}{member.active === false ? ' - Inactive' : ''}</small>
            </span>
          </button>
        ))}
      </div>

      {selectedMember && (() => {
        const stats = memberStats(selectedMember)
        return (
        <div className="modal-overlay" onClick={() => setSelectedMember(null)}>
          <div className="modal-box admin-team-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-team-modal-head">
              <div>
                <h2>Team Details</h2>
                <p>{selectedMember.isOwner ? 'Owner profile' : 'Staff profile'}</p>
              </div>
              <button type="button" onClick={() => setSelectedMember(null)} aria-label="Close team details"><X size={18} /></button>
            </div>

            <div className="admin-team-detail-body">
              <div className="admin-team-detail-grid">
                <section className="admin-team-profile-panel">
                  <div className="admin-team-profile-head">
                    <div className="admin-team-profile-avatar" style={{ cursor: selectedMember?.photoUrl ? 'pointer' : 'default' }} onClick={selectedMember?.photoUrl ? openProfileImage : undefined}>
                        <Avatar person={selectedMember} owner={selectedMember.isOwner} />
                    </div>
                    <div>
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
              <input className="input" value={form.role} onChange={e => update('role', e.target.value)} placeholder="Groomer, Driver, Assistant..." />
              <label>Monthly Salary</label>
              <input className="input" type="number" min="0" value={form.monthlySalary} onChange={e => update('monthlySalary', e.target.value)} placeholder="0" />
              <label>Joining Date</label>
              <input className="input" type="date" value={form.joiningDate} onChange={e => update('joiningDate', e.target.value)} />
              <div className="admin-team-modal-actions">
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
    </div>
  )
}
