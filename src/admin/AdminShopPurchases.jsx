import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import {
  Building2,
  Calendar,
  CalendarDays,
  Camera,
  Check,
  Eye,
  FileText,
  ImagePlus,
  IndianRupee,
  Minus,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'
import { optimizeCloudinary } from '../utils/imageOptimizer'

// In-memory cache for instant 0ms loads
let cachedShopPurchases = null
let cachedShopPurchasesTime = 0
const PURCHASES_CACHE_TTL = 3 * 60 * 1000 // 3 minutes

const CATEGORIES = [
  'Shampoo',
  'Conditioner',
  'Tools',
  'Accessories',
  'Medicines',
  'Cleaning',
  'Food & Treats',
  'Other',
]

const CATEGORY_COLORS = {
  Shampoo: { bg: 'rgba(217, 119, 6, 0.12)', text: '#d97706', border: 'rgba(217, 119, 6, 0.25)' },
  Conditioner: { bg: 'rgba(236, 72, 153, 0.12)', text: '#ec4899', border: 'rgba(236, 72, 153, 0.25)' },
  Tools: { bg: 'rgba(59, 130, 246, 0.12)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.25)' },
  Accessories: { bg: 'rgba(168, 85, 247, 0.12)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.25)' },
  Medicines: { bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981', border: 'rgba(16, 185, 129, 0.25)' },
  Cleaning: { bg: 'rgba(6, 182, 212, 0.12)', text: '#06b6d4', border: 'rgba(6, 182, 212, 0.25)' },
  'Food & Treats': { bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.25)' },
  Other: { bg: 'rgba(100, 116, 139, 0.12)', text: '#64748b', border: 'rgba(100, 116, 139, 0.25)' },
}

const todayKey = () => new Date().toISOString().slice(0, 10)
const monthKey = (date = new Date()) => date.toISOString().slice(0, 7)

const EMPTY_FORM = {
  productName: '',
  category: 'Shampoo',
  price: '',
  quantity: '1',
  purchaseDate: todayKey(),
  vendor: '',
  description: '',
  imageUrl: '',
}

const money = (value) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const toNumber = (value) => {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}
const parseDateTime = (value) => {
  if (!value) return 0
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

const formatDateReadable = (dateStr) => {
  if (!dateStr) return 'No date'
  try {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    }
    return dateStr
  } catch {
    return dateStr
  }
}

export default function AdminShopPurchases() {
  const [purchases, setPurchases] = useState(() => cachedShopPurchases || [])
  const [loading, setLoading] = useState(!cachedShopPurchases)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editingPurchase, setEditingPurchase] = useState(null)
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showImageViewer, setShowImageViewer] = useState(false)
  const [imageViewerSrc, setImageViewerSrc] = useState('')
  const [showRemoveImageConfirm, setShowRemoveImageConfirm] = useState(false)

  const totalCost = useMemo(() => toNumber(form.price) * toNumber(form.quantity), [form.price, form.quantity])

  const fetchPurchases = async (isBackground = false) => {
    const isFresh = cachedShopPurchases && (Date.now() - cachedShopPurchasesTime < PURCHASES_CACHE_TTL)
    if (isFresh && !isBackground) {
      setPurchases(cachedShopPurchases)
      setLoading(false)
      fetchPurchases(true)
      return
    }

    if (!isBackground && !cachedShopPurchases) {
      setLoading(true)
    }

    try {
      const snap = await getDocs(collection(db, 'shopPurchases'))
      const rows = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => parseDateTime(b.purchaseDate) - parseDateTime(a.purchaseDate))
      cachedShopPurchases = rows
      cachedShopPurchasesTime = Date.now()
      setPurchases(rows)
    } catch (err) {
      console.error('Failed to load purchases:', err)
      if (!isBackground) {
        setError(err.message || 'Could not load shop purchases.')
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchPurchases()
  }, [])

  useEffect(() => {
    if (!toastMessage) return
    const t = window.setTimeout(() => setToastMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [toastMessage])

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const stats = useMemo(() => {
    const totalsByCategory = purchases.reduce((acc, item) => {
      const cat = item.category || 'Other'
      acc[cat] = (acc[cat] || 0) + Number(item.totalCost || 0)
      return acc
    }, {})
    const top = Object.entries(totalsByCategory).sort((a, b) => b[1] - a[1])[0]
    const currentMonth = monthKey()
    return {
      totalSpent: purchases.reduce((sum, item) => sum + Number(item.totalCost || 0), 0),
      totalItems: purchases.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      thisMonthSpent: purchases
        .filter(item => String(item.purchaseDate || '').startsWith(currentMonth))
        .reduce((sum, item) => sum + Number(item.totalCost || 0), 0),
      topCategory: top?.[0] || 'None',
    }
  }, [purchases])

  const filteredPurchases = useMemo(() => {
    const term = search.trim().toLowerCase()
    return purchases.filter(item => {
      const matchesSearch = !term ||
        String(item.productName || '').toLowerCase().includes(term) ||
        String(item.vendor || '').toLowerCase().includes(term) ||
        String(item.description || '').toLowerCase().includes(term)
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter
      const matchesMonth = !monthFilter || String(item.purchaseDate || '').startsWith(monthFilter)
      return matchesSearch && matchesCategory && matchesMonth
    })
  }, [purchases, search, categoryFilter, monthFilter])

  const openModal = () => {
    setForm({ ...EMPTY_FORM, purchaseDate: todayKey() })
    setFile(null)
    setPreview('')
    setEditingPurchase(null)
    setError('')
    setShowModal(true)
  }

  const openPurchase = (purchase) => {
    setForm({
      productName: purchase.productName || '',
      category: purchase.category || 'Shampoo',
      price: purchase.price ?? '',
      quantity: purchase.quantity ?? '1',
      purchaseDate: purchase.purchaseDate || todayKey(),
      vendor: purchase.vendor || '',
      description: purchase.description || '',
      imageUrl: purchase.imageUrl || '',
    })
    setFile(null)
    setPreview('')
    setEditingPurchase(purchase)
    setError('')
    setShowModal(true)
  }

  const closeModal = () => {
    if (preview) URL.revokeObjectURL(preview)
    setShowModal(false)
    setFile(null)
    setPreview('')
    setEditingPurchase(null)
    setShowImageViewer(false)
    setImageViewerSrc('')
    setShowRemoveImageConfirm(false)
    setForm({ ...EMPTY_FORM, purchaseDate: todayKey() })
  }

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const stepQuantity = (delta) => {
    const current = Math.max(1, toNumber(form.quantity) + delta)
    update('quantity', String(current))
  }

  const handleImageSelect = (selectedFile) => {
    if (!selectedFile) return
    try {
      validateImageFile(selectedFile)
    } catch (err) {
      setError(err.message)
      return
    }
    setError('')
    if (preview) URL.revokeObjectURL(preview)
    setFile(selectedFile)
    setPreview(URL.createObjectURL(selectedFile))
  }

  const clearImage = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview('')
    setForm(prev => ({ ...prev, imageUrl: '' }))
  }

  const openImageViewer = (source = preview || form.imageUrl) => {
    if (!source) return
    setImageViewerSrc(source)
    setShowImageViewer(true)
  }

  const closeImageViewer = () => {
    setShowImageViewer(false)
    setImageViewerSrc('')
  }

  const requestRemoveImage = () => setShowRemoveImageConfirm(true)

  const confirmRemoveImage = () => {
    setShowRemoveImageConfirm(false)
    closeImageViewer()
    clearImage()
  }

  const savePurchase = async () => {
    const productName = form.productName.trim()
    const price = toNumber(form.price)
    const quantity = Math.max(1, toNumber(form.quantity))
    const cleanTotal = price * quantity

    setError('')

    if (!productName) {
      const msg = 'Product name is required.'
      setToastType('error')
      setToastMessage(msg)
      setError(msg)
      return
    }
    if (price < 0) {
      const msg = 'Enter a valid price.'
      setToastType('error')
      setToastMessage(msg)
      setError(msg)
      return
    }

    setSaving(true)
    try {
      let imageUrl = form.imageUrl || ''
      if (file) {
        imageUrl = await uploadToCloudinary(file, {
          onOptimizeStart: () => setOptimizing(true),
          onOptimizeEnd: () => setOptimizing(false),
        })
      }

      const payload = {
        productName,
        category: form.category || 'Other',
        price,
        quantity,
        totalCost: cleanTotal,
        purchaseDate: form.purchaseDate || todayKey(),
        vendor: form.vendor.trim(),
        description: form.description.trim(),
        imageUrl,
        updatedAt: serverTimestamp(),
      }

      if (editingPurchase) {
        await updateDoc(doc(db, 'shopPurchases', editingPurchase.id), payload)
        // Optimistic update
        const updated = purchases.map(p => (p.id === editingPurchase.id ? { ...p, ...payload, id: editingPurchase.id } : p))
        setPurchases(updated)
        cachedShopPurchases = updated
        cachedShopPurchasesTime = Date.now()
      } else {
        const docRef = await addDoc(collection(db, 'shopPurchases'), { ...payload, createdAt: serverTimestamp() })
        // Optimistic update
        const added = [{ id: docRef.id, ...payload }, ...purchases].sort((a, b) => parseDateTime(b.purchaseDate) - parseDateTime(a.purchaseDate))
        setPurchases(added)
        cachedShopPurchases = added
        cachedShopPurchasesTime = Date.now()
      }

      closeModal()
      setToastType('success')
      setToastMessage(editingPurchase ? 'Purchase updated successfully.' : 'Purchase added successfully.')
    } catch (err) {
      const msg = err.message || 'Could not save purchase.'
      setToastType('error')
      setToastMessage(msg)
      setError(msg)
    }
    setOptimizing(false)
    setSaving(false)
  }

  const deletePurchase = async () => {
    if (!deleteTarget) return
    setDeleting(deleteTarget.id)
    setError('')
    try {
      await deleteDoc(doc(db, 'shopPurchases', deleteTarget.id))
      const remaining = purchases.filter(item => item.id !== deleteTarget.id)
      setPurchases(remaining)
      cachedShopPurchases = remaining
      cachedShopPurchasesTime = Date.now()
      setDeleteTarget(null)
      if (editingPurchase && editingPurchase.id === deleteTarget.id) {
        closeModal()
      }
      setToastType('success')
      setToastMessage('Purchase deleted successfully.')
    } catch (err) {
      const msg = err.message || 'Could not delete purchase.'
      setToastType('error')
      setToastMessage(msg)
      setError(msg)
    }
    setDeleting(null)
  }

  const hasActiveFilters = Boolean(search || categoryFilter !== 'all' || monthFilter)

  return (
    <div className="admin-page admin-shop-page">
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}

      {/* Header */}
      <div className="admin-shop-header">
        <div className="admin-shop-title-row">
          <h1>Shop Purchases</h1>
        </div>
        <button type="button" className="btn btn-primary admin-shop-add-btn" onClick={openModal}>
          <Plus size={16} />
          <span>Add Purchase</span>
        </button>
      </div>

      {error && (
        <div className="admin-shop-alert error">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {/* 4 Stats Cards */}
      <div className="admin-shop-stats-grid">
        <div className="admin-shop-stat-card">
          <div className="stat-icon-circle spent">
            <IndianRupee size={18} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Spent</span>
            <strong className="stat-value">₹{money(stats.totalSpent)}</strong>
            <small className="stat-sub">Across all purchases</small>
          </div>
        </div>

        <div className="admin-shop-stat-card">
          <div className="stat-icon-circle month">
            <CalendarDays size={18} />
          </div>
          <div className="stat-info">
            <span className="stat-label">This Month</span>
            <strong className="stat-value">₹{money(stats.thisMonthSpent)}</strong>
            <small className="stat-sub">Spend in {new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</small>
          </div>
        </div>

        <div className="admin-shop-stat-card">
          <div className="stat-icon-circle items">
            <PackageCheck size={18} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Total Items</span>
            <strong className="stat-value">{stats.totalItems}</strong>
            <small className="stat-sub">Units stocked</small>
          </div>
        </div>

        <div className="admin-shop-stat-card">
          <div className="stat-icon-circle category">
            <Tag size={18} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Top Category</span>
            <strong className="stat-value" style={{ fontSize: '18px' }}>{stats.topCategory}</strong>
            <small className="stat-sub">Highest expense category</small>
          </div>
        </div>
      </div>

      {/* Search Bar with Beside Filter Option */}
      <div className="admin-shop-filter-bar">
        <div className="admin-shop-search-row">
          <div className="admin-shop-search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by product, vendor, description..."
            />
            {search && (
              <button type="button" className="search-clear-btn" onClick={() => setSearch('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            className={`admin-shop-filter-toggle-btn${showFilters || (categoryFilter !== 'all' || monthFilter) ? ' active' : ''}`}
            onClick={() => setShowFilters(prev => !prev)}
            aria-label="Toggle filters"
            title="Filter by category or month"
          >
            <SlidersHorizontal size={15} />
            <span>Filter</span>
            {(categoryFilter !== 'all' || monthFilter) && (
              <span className="filter-badge-dot" />
            )}
          </button>
        </div>

        {/* Collapsible Filter Options */}
        {showFilters && (
          <div className="admin-shop-filter-controls">
            <div className="filter-select-wrapper">
              <select
                className="filter-select"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                aria-label="Filter by category"
              >
                <option value="all">All Categories</option>
                {CATEGORIES.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div className="filter-date-wrapper">
              <input
                type="month"
                className="filter-month-input"
                value={monthFilter}
                onChange={e => setMonthFilter(e.target.value)}
                aria-label="Filter by month"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="filter-reset-btn"
                onClick={() => { setSearch(''); setCategoryFilter('all'); setMonthFilter('') }}
                title="Reset all filters"
              >
                <RotateCcw size={14} />
                <span>Clear</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filter Summary */}
      <div className="admin-shop-summary-bar">
        <span>
          Showing <strong>{filteredPurchases.length}</strong> {filteredPurchases.length === 1 ? 'purchase' : 'purchases'}
          {hasActiveFilters && ` (filtered from ${purchases.length})`}
        </span>
        <span className="summary-total">
          Filtered Total: <strong>₹{money(filteredPurchases.reduce((s, i) => s + Number(i.totalCost || 0), 0))}</strong>
        </span>
      </div>

      {/* Content: Loading Skeleton or Empty or Cards Grid */}
      {loading ? (
        <div className="admin-shop-loading-card">
          <Spinner text="Loading shop purchases..." />
        </div>
      ) : filteredPurchases.length === 0 ? (
        <div className="admin-shop-empty-state">
          <div className="empty-icon-wrap">
            <ShoppingCart size={38} />
          </div>
          <h3>No purchases found</h3>
          <p>{hasActiveFilters ? 'No records match your active search or filters. Try clearing them.' : 'Start tracking your salon equipment, inventory, and supply expenses.'}</p>
          {hasActiveFilters ? (
            <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setCategoryFilter('all'); setMonthFilter('') }}>
              Clear Filters
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={openModal}>
              <Plus size={16} /> Add First Purchase
            </button>
          )}
        </div>
      ) : (
        <div className="admin-shop-cards-grid">
          {filteredPurchases.map(item => {
            const catStyle = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other
            const thumbUrl = item.imageUrl ? optimizeCloudinary(item.imageUrl, 200) : ''
            return (
              <div
                key={item.id}
                className="admin-shop-item-card"
                onClick={() => openPurchase(item)}
              >
                {/* Thumbnail Image / Icon */}
                <div
                  className="item-card-media"
                  onClick={(e) => {
                    if (item.imageUrl) {
                      e.stopPropagation()
                      openImageViewer(item.imageUrl)
                    }
                  }}
                  title={item.imageUrl ? 'Click to view full photo' : ''}
                >
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={item.productName} loading="lazy" decoding="async" />
                  ) : (
                    <div className="item-card-media-placeholder" style={{ color: catStyle.text, background: catStyle.bg }}>
                      <Package size={22} />
                    </div>
                  )}
                  {item.imageUrl && (
                    <div className="item-card-media-zoom">
                      <Eye size={12} />
                    </div>
                  )}
                </div>

                {/* Main Body */}
                <div className="item-card-content">
                  <div className="item-card-top">
                    <span
                      className="item-category-pill"
                      style={{ background: catStyle.bg, color: catStyle.text, borderColor: catStyle.border }}
                    >
                      {item.category || 'Other'}
                    </span>
                    <span className="item-date">
                      <Calendar size={12} /> {formatDateReadable(item.purchaseDate)}
                    </span>
                  </div>

                  <h3 className="item-product-name" title={item.productName}>
                    {item.productName}
                  </h3>

                  {item.vendor && (
                    <div className="item-vendor">
                      <Building2 size={12} />
                      <span>{item.vendor}</span>
                    </div>
                  )}

                  {item.description && (
                    <p className="item-description">{item.description}</p>
                  )}
                </div>

                {/* Right / Pricing & Actions */}
                <div className="item-card-pricing-col">
                  <div className="pricing-wrap">
                    <strong className="item-total-cost">₹{money(item.totalCost)}</strong>
                    <span className="item-rate-calc">
                      ₹{money(item.price)} × {item.quantity || 1} {Number(item.quantity) > 1 ? 'units' : 'unit'}
                    </span>
                  </div>

                  <div className="item-actions">
                    <button
                      type="button"
                      className="item-action-btn edit"
                      onClick={(e) => { e.stopPropagation(); openPurchase(item) }}
                      title="Edit / view details"
                      aria-label="Edit purchase"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="item-action-btn delete"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(item) }}
                      title="Delete purchase"
                      aria-label="Delete purchase"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Redesigned Details / Add Modal */}
      {showModal && (
        <div className="admin-shop-modal-overlay" onClick={closeModal}>
          <div className="admin-shop-modal-container" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="admin-shop-modal-header">
              <div className="modal-header-text">
                <div className="modal-badge-icon">
                  <ShoppingCart size={18} />
                </div>
                <div>
                  <h2>{editingPurchase ? 'Purchase Details' : 'Add Shop Purchase'}</h2>
                  <p>{editingPurchase ? 'Review, update, or edit this shop purchase.' : 'Record supplies, tools, cosmetics, or inventory expenses.'}</p>
                </div>
              </div>
              <button type="button" className="modal-close-btn" onClick={closeModal} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>

            {/* Live Calculation Banner */}
            <div className="admin-shop-calc-banner">
              <div className="calc-banner-left">
                <span className="calc-label">Total Expense</span>
                <strong className="calc-amount">₹{money(totalCost)}</strong>
              </div>
              <div className="calc-banner-right">
                <span>Rate: <strong>₹{money(form.price || 0)}</strong></span>
                <span className="calc-separator">×</span>
                <span>Qty: <strong>{form.quantity || 1}</strong></span>
              </div>
            </div>

            {/* Modal Form */}
            <div className="admin-shop-modal-body">
              {error && (
                <div className="admin-shop-modal-alert">
                  <span>{error}</span>
                </div>
              )}

              {/* Product Name */}
              <div className="form-group full-width">
                <label className="form-label">
                  Product Name <span className="req">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={form.productName}
                  onChange={e => update('productName', e.target.value)}
                  placeholder="e.g. Oatmeal Dog Shampoo 5L, Nail Clipper Pro"
                  autoFocus
                />
              </div>

              {/* Category & Vendor */}
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="form-select"
                    value={form.category}
                    onChange={e => update('category', e.target.value)}
                  >
                    {CATEGORIES.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Supplier / Vendor</label>
                  <div className="input-with-icon">
                    <Building2 size={15} className="input-icon" />
                    <input
                      type="text"
                      className="form-input has-icon"
                      value={form.vendor}
                      onChange={e => update('vendor', e.target.value)}
                      placeholder="e.g. PetCare Supplies Pvt Ltd"
                    />
                  </div>
                </div>
              </div>

              {/* Price, Quantity, Date */}
              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">
                    Price per Unit (₹) <span className="req">*</span>
                  </label>
                  <div className="input-with-icon">
                    <IndianRupee size={15} className="input-icon" />
                    <input
                      type="number"
                      className="form-input has-icon"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={e => update('price', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Quantity</label>
                  <div className="quantity-stepper-row">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => stepQuantity(-1)}
                      disabled={toNumber(form.quantity) <= 1}
                      aria-label="Decrease quantity"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      className="stepper-input"
                      min="1"
                      step="1"
                      value={form.quantity}
                      onChange={e => update('quantity', e.target.value)}
                    />
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => stepQuantity(1)}
                      aria-label="Increase quantity"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <div className="label-with-action">
                    <label className="form-label">Purchase Date</label>
                    <button
                      type="button"
                      className="label-action-btn"
                      onClick={() => update('purchaseDate', todayKey())}
                    >
                      Today
                    </button>
                  </div>
                  <div className="input-with-icon">
                    <Calendar size={15} className="input-icon" />
                    <input
                      type="date"
                      className="form-input has-icon"
                      value={form.purchaseDate}
                      onChange={e => update('purchaseDate', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Description / Notes */}
              <div className="form-group full-width">
                <label className="form-label">Description / Invoice Notes</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={form.description}
                  onChange={e => update('description', e.target.value)}
                  placeholder="Invoice number, batch details, warranty, or store notes..."
                />
              </div>

              {/* Receipt / Image Upload */}
              <div className="form-group full-width">
                <label className="form-label">Receipt / Product Photo</label>
                {(preview || form.imageUrl) ? (
                  <div className="receipt-preview-card">
                    <div
                      className="receipt-preview-img-wrap"
                      onClick={() => openImageViewer(preview || form.imageUrl)}
                      title="Click to view full photo"
                    >
                      <img src={preview || optimizeCloudinary(form.imageUrl, 500)} alt="Receipt preview" />
                      <div className="receipt-preview-zoom-hint">
                        <Eye size={14} /> <span>Zoom</span>
                      </div>
                    </div>
                    <div className="receipt-preview-info">
                      <span className="receipt-preview-name">
                        {file ? file.name : 'Receipt / Image attached'}
                      </span>
                      <small className="receipt-preview-sub">Click image to enlarge</small>
                      <button
                        type="button"
                        className="receipt-remove-btn"
                        onClick={requestRemoveImage}
                      >
                        <Trash2 size={13} /> Remove Photo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="upload-dropzone">
                    <div className="upload-dropzone-prompt">
                      <Receipt size={24} className="upload-icon" />
                      <span>Attach invoice receipt or product photo</span>
                    </div>
                    <div className="upload-actions">
                      <label className="upload-btn">
                        <Upload size={14} />
                        <span>Upload File</span>
                        <input
                          type="file"
                          accept={IMAGE_FILE_ACCEPT}
                          onChange={e => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }}
                        />
                      </label>
                      <label className="upload-btn">
                        <Camera size={14} />
                        <span>Take Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={e => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="admin-shop-modal-footer">
              <div className="footer-left">
                {editingPurchase && (
                  <button
                    type="button"
                    className="btn btn-delete-purchase"
                    onClick={() => setDeleteTarget(editingPurchase)}
                    disabled={saving}
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                )}
              </div>
              <div className="footer-right">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-save-purchase"
                  onClick={savePurchase}
                  disabled={saving}
                >
                  {optimizing ? 'Optimizing photo...' : saving ? 'Saving...' : editingPurchase ? 'Update' : 'Save Purchase'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Image Preview Modal */}
      {showImageViewer && imageViewerSrc && (
        <div className="admin-shop-image-viewer-overlay" onClick={closeImageViewer}>
          <div className="admin-shop-image-viewer" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="admin-shop-image-viewer-close"
              onClick={closeImageViewer}
              aria-label="Close image preview"
            >
              <X size={20} />
            </button>
            <img src={optimizeCloudinary(imageViewerSrc, 1200)} alt="Purchase preview" />
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <ConfirmModal
        open={showRemoveImageConfirm}
        title="Remove photo?"
        message={`Remove the current photo from ${editingPurchase?.productName || 'this purchase'}?`}
        confirmText="Remove Photo"
        cancelText="Keep"
        danger
        onCancel={() => setShowRemoveImageConfirm(false)}
        onConfirm={confirmRemoveImage}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete purchase?"
        message={`Delete "${deleteTarget?.productName || 'this purchase'}" from shop purchases? This action cannot be undone.`}
        confirmText="Delete"
        loading={!!deleteTarget && deleting === deleteTarget.id}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deletePurchase}
      />
    </div>
  )
}
