import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore'
import { CalendarDays, Camera, ImagePlus, IndianRupee, PackageCheck, Plus, Search, ShoppingCart, Tag, Trash2, Upload, X } from 'lucide-react'
import { db } from '../firebase'
import Spinner from '../components/Spinner'
import Toast from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import { uploadToCloudinary } from '../utils/cloudinary'
import { IMAGE_FILE_ACCEPT, validateImageFile } from '../utils/imageCompression'

const CATEGORIES = ['Shampoo', 'Conditioner', 'Tools', 'Accessories', 'Medicines', 'Cleaning', 'Other']
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

export default function AdminShopPurchases() {
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editingPurchase, setEditingPurchase] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('success')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('')
  const [showImageViewer, setShowImageViewer] = useState(false)
  const [imageViewerSrc, setImageViewerSrc] = useState('')
  const [showRemoveImageConfirm, setShowRemoveImageConfirm] = useState(false)

  const totalCost = useMemo(() => toNumber(form.price) * toNumber(form.quantity), [form.price, form.quantity])

  const fetchPurchases = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'shopPurchases'))
      const rows = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => parseDateTime(b.purchaseDate) - parseDateTime(a.purchaseDate))
      setPurchases(rows)
    } catch (err) {
      setError(err.message || 'Could not load shop purchases.')
    }
    setLoading(false)
  }

  useEffect(() => { fetchPurchases() }, [])

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
      acc[item.category] = (acc[item.category] || 0) + Number(item.totalCost || 0)
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
      const matchesSearch = !term || String(item.productName || '').toLowerCase().includes(term)
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
    setMessage('')
    setShowModal(true)
  }

  const openPurchase = (purchase) => {
    setForm({
      productName: purchase.productName || '',
      category: purchase.category || 'Other',
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
    setMessage('')
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
    const quantity = toNumber(form.quantity)
    const cleanTotal = price * quantity

    setError('')
    setMessage('')

    if (!productName) {
      const msg = 'Product name is required.'
      setToastType('error')
      setToastMessage(msg)
      setError(msg)
      return
    }
    if (price < 0 || quantity <= 0) {
      const msg = 'Enter a valid price and quantity.'
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
        category: form.category,
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
      } else {
        await addDoc(collection(db, 'shopPurchases'), { ...payload, createdAt: serverTimestamp() })
      }

      closeModal()
      setToastType('success')
      setToastMessage(editingPurchase ? 'Purchase updated successfully.' : 'Purchase added successfully.')
      await fetchPurchases()
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
    setMessage('')
    try {
      await deleteDoc(doc(db, 'shopPurchases', deleteTarget.id))
      setPurchases(prev => prev.filter(item => item.id !== deleteTarget.id))
      setDeleteTarget(null)
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

  const L = { fontSize:'10px', fontWeight:700, letterSpacing:'1px', textTransform:'uppercase', color:'var(--muted)', display:'block', marginBottom:'5px' }

  return (
    <div className="admin-shop-page">
      {toastMessage && (
        <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 1300 }}>
          <Toast message={toastMessage} type={toastType} onClose={() => setToastMessage('')} />
        </div>
      )}
      <div className="admin-shop-header">
        <div>
          <h1>Shop Purchases</h1>
          <p>Track grooming supplies, tools, and store purchases for Paw Paw operations.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openModal}>
          <Plus size={16} /> Add Purchase
        </button>
      </div>

      {(message || error) && (
        <div style={{ background:error ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.1)', border:`1px solid ${error ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.25)'}`, color:error ? '#ef4444' : '#34d399', fontSize:'13px', padding:'12px 14px', borderRadius:'12px', marginBottom:'18px' }}>
          {error || message}
        </div>
      )}

      <div className="admin-shop-stats">
        <div className="stat-card">
          <span><IndianRupee size={16} /> Total Spent</span>
          <strong>₹{money(stats.totalSpent)}</strong>
          <small>All purchases</small>
        </div>
        <div className="stat-card">
          <span><PackageCheck size={16} /> Total Items</span>
          <strong>{money(stats.totalItems)}</strong>
          <small>Quantity purchased</small>
        </div>
        <div className="stat-card">
          <span><CalendarDays size={16} /> This Month Spent</span>
          <strong>₹{money(stats.thisMonthSpent)}</strong>
          <small>{monthKey()}</small>
        </div>
        <div className="stat-card">
          <span><Tag size={16} /> Top Category</span>
          <strong>{stats.topCategory}</strong>
          <small>By spend</small>
        </div>
      </div>

      <div className="card admin-shop-filters">
        <label className="admin-shop-search-filter">
          <Search size={15} aria-hidden="true" />
          <span>Search</span>
          <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product name" />
        </label>
        <label>
          <span>Category</span>
          <select className="input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label>
          <span>Month</span>
          <input className="input" type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} />
        </label>
        <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setCategoryFilter('all'); setMonthFilter('') }}>
          <X size={15} /> Clear
        </button>
      </div>

      {loading ? <Spinner text="Loading shop purchases..." /> : filteredPurchases.length === 0 ? (
        <div className="admin-shop-empty">
          <ShoppingCart size={40} />
          <p>No purchases found</p>
          <span>Add a shop purchase or adjust your filters.</span>
          <button type="button" className="btn btn-primary" onClick={openModal}><Plus size={16} /> Add Purchase</button>
        </div>
      ) : (
        <div className="admin-shop-grid">
          {filteredPurchases.map(item => (
            <div key={item.id} className="card admin-shop-card" role="button" tabIndex={0} onClick={() => openPurchase(item)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openPurchase(item) }}>
                <div
                className="admin-shop-card-image"
                role="button"
                tabIndex={0}
                onClick={event => {
                  event.stopPropagation()
                  if (item.imageUrl) {
                    setImageViewerSrc(item.imageUrl)
                    setShowImageViewer(true)
                  }
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    if (item.imageUrl) {
                      setImageViewerSrc(item.imageUrl)
                      setShowImageViewer(true)
                    }
                  }
                }}
              >
                {item.imageUrl ? <img src={item.imageUrl} alt={item.productName} loading="lazy" /> : <ImagePlus size={18} />}
              </div>
              <div className="admin-shop-card-main">
                <h2>{item.productName}</h2>
                <span><CalendarDays size={12} /> {item.purchaseDate || "No date"}</span>
              </div>
              <div className="admin-shop-card-price">
                <strong>₹{money(item.totalCost)}</strong>
                <span>₹{money(item.price)} x {money(item.quantity)}</span>
              </div>
              <button className="admin-shop-delete" type="button" onClick={event => { event.stopPropagation(); setDeleteTarget(item) }} title="Delete purchase" aria-label={"Delete " + item.productName}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-box admin-shop-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-shop-modal-head">
              <div>
                <h2>{editingPurchase ? 'Purchase Details' : 'Add Purchase'}</h2>
                <p>{editingPurchase ? 'Review or update this shop purchase.' : 'Record supplies, tools, medicine, and shop inventory costs.'}</p>
              </div>
              <button type="button" onClick={closeModal} aria-label="Close"><X size={20} /></button>
            </div>

            <div className="admin-shop-form">
              <div className="admin-shop-field-wide">
                <label style={L}>Product Name *</label>
                <input className="input" value={form.productName} onChange={e => update('productName', e.target.value)} placeholder="e.g. Oatmeal shampoo" />
              </div>

              <div>
                <label style={L}>Category</label>
                <select className="input" value={form.category} onChange={e => update('category', e.target.value)}>
                  {CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div>
                <label style={L}>Purchase Date</label>
                <input className="input" type="date" value={form.purchaseDate} onChange={e => update('purchaseDate', e.target.value)} />
              </div>
              <div>
                <label style={L}>Price (₹)</label>
                <input className="input" type="number" min="0" step="0.01" value={form.price} onChange={e => update('price', e.target.value)} />
              </div>
              <div>
                <label style={L}>Quantity</label>
                <input className="input" type="number" min="1" step="1" value={form.quantity} onChange={e => update('quantity', e.target.value)} />
              </div>
              <div>
                <label style={L}>Total Cost</label>
                <input className="input" readOnly value={`₹${money(totalCost)}`} />
              </div>
              <div>
                <label style={L}>Vendor</label>
                <input className="input" value={form.vendor} onChange={e => update('vendor', e.target.value)} placeholder="Supplier or shop name" />
              </div>
              <div className="admin-shop-field-wide">
                <label style={L}>Description</label>
                <textarea className="input" rows={3} value={form.description} onChange={e => update('description', e.target.value)} style={{ resize:'vertical' }} />
              </div>

              <div className="admin-shop-field-wide">
                <label style={L}>Image</label>
                {(preview || form.imageUrl) ? (
                  <div
                    className="admin-shop-preview"
                    role="button"
                    tabIndex={0}
                    onClick={() => openImageViewer(preview || form.imageUrl)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openImageViewer(preview || form.imageUrl)
                      }
                    }}
                  >
                    <img src={preview || form.imageUrl} alt="" />
                    <button type="button" onClick={event => { event.stopPropagation(); requestRemoveImage() }} aria-label="Remove image"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="admin-shop-image-actions">
                    <label className="btn btn-secondary">
                      <Upload size={15} /> Upload File
                      <input type="file" accept={IMAGE_FILE_ACCEPT} onChange={e => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }} />
                    </label>
                    <label className="btn btn-secondary">
                      <Camera size={15} /> Take Photo
                      <input type="file" accept="image/*" capture="environment" onChange={e => { handleImageSelect(e.target.files?.[0]); e.target.value = '' }} />
                    </label>
                  </div>
                )}
              </div>

              <div className="admin-shop-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={savePurchase} disabled={saving}>
                  {optimizing ? 'Optimizing image...' : saving ? 'Saving...' : editingPurchase ? 'Update Purchase' : 'Save Purchase'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImageViewer && imageViewerSrc && (
        <div className="admin-shop-image-viewer-overlay" onClick={closeImageViewer}>
          <div className="admin-shop-image-viewer" onClick={event => event.stopPropagation()}>
            <button type="button" className="admin-shop-image-viewer-close" onClick={closeImageViewer} aria-label="Close image preview">
              <X size={20} />
            </button>
            <img src={imageViewerSrc} alt="Purchase preview" />
          </div>
        </div>
      )}

      <ConfirmModal
        open={showRemoveImageConfirm}
        title="Remove image?"
        message={`Remove the current image from ${editingPurchase?.productName || 'this purchase'}?`}
        confirmText="Remove image"
        cancelText="Keep image"
        danger
        onCancel={() => setShowRemoveImageConfirm(false)}
        onConfirm={confirmRemoveImage}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete purchase?"
        message={`Delete ${deleteTarget?.productName || 'this purchase'} from the shop tracker?`}
        confirmText="Delete"
        loading={!!deleteTarget && deleting === deleteTarget.id}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deletePurchase}
      />
    </div>
  )
}
