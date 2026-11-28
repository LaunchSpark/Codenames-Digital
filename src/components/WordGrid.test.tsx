// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardView } from '../shared/protocol'
import { WordGrid } from './WordGrid'

afterEach(cleanup)

const card = (over: Partial<CardView> = {}): CardView => ({
  word: 'WORD',
  revealed: false,
  color: null,
  votes: 0,
  ...over,
})

const cells = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.word'))

describe('WordGrid', () => {
  it('shows every word', () => {
    const { getByText } = render(
      <WordGrid cards={[card({ word: 'APPLE' }), card({ word: 'PEAR' })]} showPips={false} voterCount={0} variant="tv" />,
    )
    expect(getByText('APPLE')).toBeTruthy()
    expect(getByText('PEAR')).toBeTruthy()
  })

  it('draws pictures instead of words', () => {
    const { container } = render(
      <WordGrid cards={[card({ word: 'card-3' }), card({ word: 'card-12' })]} showPips={false} voterCount={0} variant="tv" pictures />,
    )
    const img = container.querySelector<HTMLImageElement>('img[alt="Picture 3"]')
    expect(img?.getAttribute('src')).toBe('/cards/card-3.jpg')
    expect(container.querySelectorAll('img')).toHaveLength(2)
    expect(container.querySelector('.word__text')).toBeNull()
  })

  it('keeps pips on an unrevealed picture', () => {
    const { container } = render(
      <WordGrid cards={[card({ word: 'card-3', votes: 1 })]} showPips voterCount={2} variant="phone" pictures />,
    )
    expect(container.querySelectorAll('.pip')).toHaveLength(2)
  })

  it('a picture key card stays colour-only', () => {
    const { container, getByLabelText } = render(
      <WordGrid cards={[card({ word: 'card-3', color: 'blue' })]} showPips={false} voterCount={0} variant="phone" keyCard pictures />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(getByLabelText('Picture 3: blue')).toBeTruthy()
  })

  it('dims the whole board when asked, and only then', () => {
    const dim = render(<WordGrid cards={[card()]} showPips={false} voterCount={0} variant="phone" dimmed />)
    expect(dim.container.querySelector('.word-grid--dimmed')).not.toBeNull()
    cleanup()
    const lit = render(<WordGrid cards={[card()]} showPips={false} voterCount={0} variant="phone" />)
    expect(lit.container.querySelector('.word-grid--dimmed')).toBeNull()
  })

  it('as a key card, shows colours without visible words but keeps them for screen readers', () => {
    const { container, queryByText, getByLabelText } = render(
      <WordGrid
        cards={[card({ word: 'APPLE', color: 'red' }), card({ word: 'PEAR', color: 'neutral', revealed: true })]}
        showPips={false}
        voterCount={0}
        variant="phone"
        keyCard
      />,
    )
    expect(container.querySelector('.word-grid--key')).not.toBeNull()
    expect(queryByText('APPLE')).toBeNull()
    expect(getByLabelText('APPLE: red')).toBeTruthy()
    expect(getByLabelText('PEAR: neutral, picked')).toBeTruthy()
  })

  it('shows 3 pip slots with 2 filled', () => {
    const { container } = render(
      <WordGrid cards={[card({ votes: 2 })]} showPips voterCount={3} variant="tv" />,
    )
    expect(container.querySelectorAll('.pip')).toHaveLength(3)
    expect(container.querySelectorAll('.pip--filled')).toHaveLength(2)
  })

  it('no pips on revealed cards or when showPips is false', () => {
    const revealed = render(
      <WordGrid
        cards={[card({ revealed: true, color: 'red', votes: 1 })]}
        showPips
        voterCount={3}
        variant="tv"
      />,
    )
    expect(revealed.container.querySelectorAll('.pip')).toHaveLength(0)
    cleanup()

    const off = render(<WordGrid cards={[card({ votes: 1 })]} showPips={false} voterCount={3} variant="tv" />)
    expect(off.container.querySelectorAll('.pip')).toHaveLength(0)
  })

  it('renders unknown colour for color null', () => {
    const { container } = render(<WordGrid cards={[card()]} showPips={false} voterCount={0} variant="tv" />)
    expect(cells(container)[0].classList).toContain('word--unknown')
  })

  it('marks revealed cards and key colours', () => {
    const { container } = render(
      <WordGrid
        cards={[card({ revealed: true, color: 'blue' }), card({ color: 'assassin' })]}
        showPips={false}
        voterCount={0}
        variant="phone"
      />,
    )
    const [a, b] = cells(container)
    expect(a.classList).toContain('word--blue')
    expect(a.classList).toContain('word--revealed')
    expect(b.classList).toContain('word--assassin')
    expect(b.classList).not.toContain('word--revealed')
  })

  it('only unrevealed cards are tappable', () => {
    const onTap = vi.fn()
    const { container } = render(
      <WordGrid
        cards={[card({ revealed: true, color: 'red' }), card()]}
        showPips
        voterCount={2}
        onTap={onTap}
        variant="phone"
      />,
    )
    const [revealed, hidden] = cells(container)
    expect(revealed.tagName).not.toBe('BUTTON')
    expect(hidden.tagName).toBe('BUTTON')
    fireEvent.click(hidden)
    expect(onTap).toHaveBeenCalledWith(1)
  })

  it('nothing is tappable without onTap', () => {
    const { container } = render(<WordGrid cards={[card()]} showPips={false} voterCount={0} variant="tv" />)
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('disabled turns the buttons off', () => {
    const onTap = vi.fn()
    const { container } = render(
      <WordGrid cards={[card()]} showPips={false} voterCount={0} onTap={onTap} disabled variant="phone" />,
    )
    const button = container.querySelector('button')!
    expect(button.disabled).toBe(true)
  })

  it('marks my votes', () => {
    const cards = Array.from({ length: 6 }, () => card())
    const { container } = render(
      <WordGrid cards={cards} showPips voterCount={2} myVotes={[4, 1]} variant="phone" />,
    )
    const marked = cells(container).filter((c) => c.classList.contains('word--mine'))
    expect(marked.map((c) => cells(container).indexOf(c))).toEqual([1, 4])
  })
})
