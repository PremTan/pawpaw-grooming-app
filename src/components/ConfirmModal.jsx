import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmModal({
  open,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Delete',
  cancelText = 'Cancel',
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null

  return (
    <div className="modal-overlay confirm-modal-overlay" onClick={onCancel}>
      <div className="modal-box confirm-modal" onClick={event => event.stopPropagation()}>
        <div className="confirm-modal-head">
          <div className={danger ? 'confirm-modal-icon danger' : 'confirm-modal-icon'}>
            <AlertTriangle size={19} />
          </div>
          <button type="button" onClick={onCancel} aria-label="Close confirmation">
            <X size={18} />
          </button>
        </div>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>{cancelText}</button>
          <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm} disabled={loading}>{loading ? 'Please wait...' : confirmText}</button>
        </div>
      </div>
    </div>
  )
}
