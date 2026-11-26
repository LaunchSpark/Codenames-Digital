// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Banner } from './Banner'

afterEach(cleanup)

describe('Banner', () => {
  it('says reconnecting while not open', () => {
    const { container } = render(<Banner status="reconnecting" error={{ message: 'ignored' }} />)
    expect(container.textContent).toBe('Reconnecting…')
  })

  it('also shows while first connecting', () => {
    const { container } = render(<Banner status="connecting" error={null} />)
    expect(container.textContent).toBe('Reconnecting…')
  })

  it('shows the error when open', () => {
    const { container } = render(<Banner status="open" error={{ message: 'That name is taken' }} />)
    expect(container.textContent).toBe('That name is taken')
  })

  it('renders nothing when open and fine', () => {
    const { container } = render(<Banner status="open" error={null} />)
    expect(container.innerHTML).toBe('')
  })
})
