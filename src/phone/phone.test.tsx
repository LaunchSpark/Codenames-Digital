// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Snapshot } from '../net/connection'
import { FIXTURES, type FixtureName } from '../net/fixtures'
import type { ClientMessage } from '../shared/protocol'
import { PhoneScreen } from './PhoneApp'

vi.mock('../wake/keepAwake', () => ({ keepAwake: vi.fn() }))
const { keepAwake } = await import('../wake/keepAwake')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function game(name: FixtureName, over: Partial<Snapshot> = {}): Snapshot {
  const { view, you } = structuredClone(FIXTURES[name])
  return { status: 'open', view, you, error: null, ...over }
}

function setup(name: FixtureName, over: Partial<Snapshot> = {}) {
  const send = vi.fn<(m: ClientMessage) => void>()
  const g = game(name, over)
  const utils = render(<PhoneScreen game={g} send={send} />)
  const rerender = (next: Snapshot) => utils.rerender(<PhoneScreen game={next} send={send} />)
  return { ...utils, send, rerender }
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const nameInput = () => screen.getByLabelText('Your name') as HTMLInputElement

describe('join', () => {
  it('spectator sees the join form, mid-game too', () => {
    setup('phone-spectator-lobby')
    expect(nameInput().maxLength).toBe(20)
    expect(button('Join Red')).toBeTruthy()
    expect(button('Join Blue')).toBeTruthy()
    expect(screen.queryByText(/Game in progress/)).toBeNull()
    cleanup()

    setup('phone-spectator-midgame')
    expect(nameInput()).toBeTruthy()
    expect(screen.getByText("Game in progress — you'll join as a guesser")).toBeTruthy()
  })

  it('join sends name and team and calls keepAwake', () => {
    const { send } = setup('phone-spectator-lobby')
    fireEvent.change(nameInput(), { target: { value: '  Gus ' } })
    fireEvent.click(button('Join Blue'))
    expect(keepAwake).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ type: 'join', name: 'Gus', team: 'blue' })
  })

  it('join buttons wait for a name', () => {
    setup('phone-spectator-lobby')
    expect(button('Join Red').disabled).toBe(true)
    fireEvent.change(nameInput(), { target: { value: '   ' } })
    expect(button('Join Red').disabled).toBe(true)
  })

  it('a rejected join keeps the name and shows the error', () => {
    const { rerender } = setup('phone-spectator-lobby')
    fireEvent.change(nameInput(), { target: { value: 'Ana' } })
    fireEvent.click(button('Join Red'))
    rerender(game('phone-spectator-lobby', { error: { code: 'name-taken', message: 'That name is taken' } }))
    expect(nameInput().value).toBe('Ana')
    expect(screen.getByText('That name is taken')).toBeTruthy()
  })
})

describe('lobby', () => {
  it('shows my team and switches', () => {
    const { send } = setup('phone-lobby')
    expect(screen.getByText("You're on Red")).toBeTruthy()
    fireEvent.click(button('Switch to Blue'))
    expect(send).toHaveBeenCalledWith({ type: 'join', name: 'Ben', team: 'blue' })
  })
})

describe('clue-giver', () => {
  it('sees the key', () => {
    const { container } = setup('phone-cluegiver-clue')
    expect(container.querySelectorAll('.word--unknown')).toHaveLength(0)
  })

  it('clue form sends word and number', () => {
    const { send } = setup('phone-cluegiver-clue')
    expect(button('Give clue').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Clue'), { target: { value: 'ocean' } })
    fireEvent.change(screen.getByLabelText('Number'), { target: { value: '3' } })
    fireEvent.click(button('Give clue'))
    expect(send).toHaveBeenCalledWith({ type: 'clue', word: 'ocean', number: 3 })
  })

  it('number choices are 1 to 9', () => {
    setup('phone-cluegiver-clue')
    const options = Array.from((screen.getByLabelText('Number') as HTMLSelectElement).options)
    expect(options.map((o) => o.value)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  })

  it('clue text survives a state update', () => {
    const { rerender } = setup('phone-cluegiver-clue')
    fireEvent.change(screen.getByLabelText('Clue'), { target: { value: 'oce' } })
    const next = game('phone-cluegiver-clue')
    next.view!.board![10].votes = 1
    rerender(next)
    expect((screen.getByLabelText('Clue') as HTMLInputElement).value).toBe('oce')
  })

  it('shows what the team is doing when not giving a clue', () => {
    setup('phone-cluegiver-waiting')
    expect(screen.queryByLabelText('Clue')).toBeNull()
    expect(screen.getByText('Your team is guessing: OCEAN 3')).toBeTruthy()
  })

  it('undo asks first, then sends', () => {
    const { send } = setup('phone-cluegiver-waiting')
    fireEvent.click(button('Undo'))
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByText('Undo last move?')).toBeTruthy()
    fireEvent.click(button('Yes, undo'))
    expect(send).toHaveBeenCalledWith({ type: 'undo' })
  })

  it('undo is disabled when there is nothing to undo', () => {
    const g = game('phone-cluegiver-clue')
    g.view!.canUndo = false
    render(<PhoneScreen game={g} send={vi.fn()} />)
    expect(button('Undo').disabled).toBe(true)
  })
})

describe('guesser', () => {
  it('taps send votes on their team’s guess phase', () => {
    const { send, container } = setup('phone-guesser-guess')
    const words = container.querySelectorAll<HTMLButtonElement>('button.word')
    expect(words.length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /^KNIGHT/ }))
    expect(send).toHaveBeenCalledWith({ type: 'vote', card: 10 })
    expect(container.querySelector('.word--mine')?.textContent).toContain('JUPITER')
  })

  it('no taps while waiting', () => {
    const { container } = setup('phone-guesser-waiting')
    expect(container.querySelectorAll('button.word')).toHaveLength(0)
    expect(screen.getByText("Waiting for Red's clue…")).toBeTruthy()
    expect(screen.queryByRole('button', { name: /End turn/ })).toBeNull()
  })

  it('end turn is disabled before the first reveal and sends vote-end after', () => {
    const before = game('phone-guesser-guess')
    if (before.view!.phase.name === 'guess') before.view!.phase.guessesMade = 0
    const send = vi.fn()
    render(<PhoneScreen game={before} send={send} />)
    expect(button(/End turn/).disabled).toBe(true)
    cleanup()

    const after = setup('phone-guesser-guess')
    expect(button(/End turn/).textContent).toContain('1/2')
    fireEvent.click(button(/End turn/))
    expect(after.send).toHaveBeenCalledWith({ type: 'vote-end' })
  })

  it('my end-turn vote is highlighted', () => {
    const g = game('phone-guesser-guess')
    if (g.you!.kind === 'player') g.you!.vote = 'end'
    render(<PhoneScreen game={g} send={vi.fn()} />)
    expect(button(/End turn/).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('game over', () => {
  it('shows the winner, full key and a waiting line', () => {
    const { container } = setup('phone-over')
    expect(screen.getByText('Blue wins')).toBeTruthy()
    expect(screen.getByText('Waiting for the host to start the next game')).toBeTruthy()
    expect(container.querySelectorAll('.word--unknown')).toHaveLength(0)
  })
})

describe('reconnecting', () => {
  it('actions are disabled while reconnecting', () => {
    setup('phone-spectator-lobby', { status: 'reconnecting' })
    fireEvent.change(nameInput(), { target: { value: 'Gus' } })
    expect(button('Join Red').disabled).toBe(true)
    expect(screen.getByText('Reconnecting…')).toBeTruthy()
    cleanup()

    setup('phone-cluegiver-clue', { status: 'reconnecting' })
    fireEvent.change(screen.getByLabelText('Clue'), { target: { value: 'ocean' } })
    expect(button('Give clue').disabled).toBe(true)
    cleanup()

    const { container } = setup('phone-guesser-guess', { status: 'reconnecting' })
    expect(button(/End turn/).disabled).toBe(true)
    container.querySelectorAll<HTMLButtonElement>('button.word').forEach((b) => expect(b.disabled).toBe(true))
  })

  it('shows a connecting screen before the first state', () => {
    render(<PhoneScreen game={{ status: 'connecting', view: null, you: null, error: null }} send={vi.fn()} />)
    expect(screen.getByText('Reconnecting…')).toBeTruthy()
  })
})
