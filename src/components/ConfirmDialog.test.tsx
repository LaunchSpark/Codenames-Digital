// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

afterEach(cleanup)

const open = () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(<ConfirmDialog message="Undo last move?" confirmLabel="Yes, undo" onConfirm={onConfirm} onCancel={onCancel} />)
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('is a modal dialog named by its message, focused on Cancel', () => {
    open()
    const dialog = screen.getByRole('dialog', { name: 'Undo last move?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('confirms and cancels', () => {
    const { onConfirm, onCancel } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('cancels on Escape and on a tap outside, not on a tap inside', () => {
    const { onCancel } = open()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(document.querySelector('.dialog-backdrop')!)
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
