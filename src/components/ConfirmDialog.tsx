import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './dialog.css'

interface ConfirmDialogProps {
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  disabled?: boolean
}

/**
 * A modal confirmation. It floats over the page instead of expanding inline,
 * so nothing underneath moves. Escape or a tap outside cancels.
 */
export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel, disabled }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Focus the safe choice, so a stray Enter doesn't confirm.
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={message}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="dialog__message">{message}</p>
        <div className="dialog__actions">
          <button ref={cancelRef} type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" disabled={disabled} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
