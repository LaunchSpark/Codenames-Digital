// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIXTURES, type FixtureName } from '../net/fixtures'
import type { GameView, You } from '../shared/protocol'
import { BoardScreen } from './BoardScreen'
import { GameOver } from './GameOver'
import { Lobby } from './Lobby'

afterEach(cleanup)

type TvYou = Extract<You, { kind: 'tv' }>

function fixture(name: FixtureName) {
  const { view, you } = FIXTURES[name]
  return { view: structuredClone(view), you: you as TvYou }
}

function renderLobby(view: GameView, you: TvYou) {
  const send = vi.fn()
  render(<Lobby view={view} you={you} send={send} />)
  return send
}

describe('Lobby', () => {
  it('shows the QR and join URL', async () => {
    const { view, you } = fixture('tv-lobby')
    renderLobby(view, you)
    const img = await screen.findByAltText('Join QR code')
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(screen.getByText(view.joinUrl)).toBeTruthy()
  })

  it('coop is shown but disabled', () => {
    const { view, you } = fixture('tv-lobby')
    renderLobby(view, you)
    const coop = screen.getByRole('button', { name: /coop/i }) as HTMLButtonElement
    expect(coop.disabled).toBe(true)
    expect(coop.textContent).toContain('Coming soon')
    const vs = screen.getByRole('button', { name: /vs/i })
    expect(vs.getAttribute('aria-pressed')).toBe('true')
  })

  it('lists both rosters in order', () => {
    const { view, you } = fixture('tv-lobby')
    renderLobby(view, you)
    const red = screen.getByRole('list', { name: 'Red team' })
    expect(within(red).getAllByRole('listitem').map((li, i) => within(li).getByText(view.teams.red.players[i].name, { exact: true }).textContent)).toEqual(['Ana', 'Ben', 'Cara'])
  })

  it('says in words when a player is away', () => {
    const { view, you } = fixture('tv-lobby')
    renderLobby(view, you)
    const blue = screen.getByRole('list', { name: 'Blue team' })
    const eli = within(blue).getByText('Eli', { exact: true }).closest('li')!
    expect(within(eli).getByText('away')).toBeTruthy()
    const dev = within(blue).getByText('Dev', { exact: true }).closest('li')!
    expect(within(dev).queryByText('away')).toBeNull()
  })

  it('start is host-only', () => {
    const guest = fixture('tv-lobby')
    renderLobby(guest.view, guest.you)
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
    cleanup()

    const host = fixture('tv-lobby-host')
    const send = renderLobby(host.view, host.you)
    const start = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement
    expect(start.disabled).toBe(false)
    fireEvent.click(start)
    expect(send).toHaveBeenCalledWith({ type: 'host:start' })
  })

  it('host can move a lobby player to the other team', () => {
    const { view, you } = fixture('tv-lobby-host')
    const send = renderLobby(view, you)
    fireEvent.click(screen.getByRole('button', { name: 'Move Ben to Blue' }))
    expect(send).toHaveBeenCalledWith({ type: 'host:move-player', playerId: 'p2', team: 'blue' })
  })

  it('host can shuffle teams', () => {
    const { view, you } = fixture('tv-lobby-host')
    const send = renderLobby(view, you)
    fireEvent.click(screen.getByRole('button', { name: 'Random teams' }))
    expect(send).toHaveBeenCalledWith({ type: 'host:shuffle-teams' })
  })

  it('team tools are host-only', () => {
    const { view, you } = fixture('tv-lobby')
    renderLobby(view, you)
    expect(screen.queryByRole('button', { name: 'Random teams' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move Ben to Blue' })).toBeNull()
  })

  it('start is disabled when a team has fewer than 2 players', () => {
    const { view, you } = fixture('tv-lobby-host')
    view.teams.blue.players = view.teams.blue.players.slice(0, 1)
    renderLobby(view, you)
    const start = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    expect(screen.getByText('Each team needs at least 2 players')).toBeTruthy()
  })
})

describe('BoardScreen', () => {
  it('guess phase shows the clue and pips', () => {
    const { view, you } = fixture('tv-guess')
    const { container } = render(<BoardScreen view={view} you={you} send={vi.fn()} />)
    expect(screen.getAllByText(/OCEAN/).length).toBeGreaterThan(0)
    expect(screen.getByText(/3 guesses left/)).toBeTruthy()
    expect(container.querySelectorAll('.word-grid .pip').length).toBeGreaterThan(0)
    expect(screen.getByText(/End turn/)).toBeTruthy()
  })

  it('clue phase says who is thinking, without pips', () => {
    const { view, you } = fixture('tv-clue')
    const { container } = render(<BoardScreen view={view} you={you} send={vi.fn()} />)
    expect(screen.getByText('Blue is thinking of a clue')).toBeTruthy()
    expect(container.querySelectorAll('.pip')).toHaveLength(0)
  })

  it('lists clues newest first', () => {
    const { view, you } = fixture('tv-guess')
    render(<BoardScreen view={view} you={you} send={vi.fn()} />)
    const items = within(screen.getByRole('list', { name: 'Clues' })).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['OCEAN 3', 'MOUNTAIN 2', 'ANIMAL 2'])
  })

  it('host menu is host-only and sends skip-turn', () => {
    const guest = fixture('tv-guess')
    render(<BoardScreen view={guest.view} you={guest.you} send={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Host menu' })).toBeNull()
    cleanup()

    const host = fixture('tv-guess-host')
    const send = vi.fn()
    render(<BoardScreen view={host.view} you={host.you} send={send} />)
    expect(screen.queryByRole('button', { name: 'Skip turn' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Host menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip turn' }))
    expect(send).toHaveBeenCalledWith({ type: 'host:skip-turn' })
  })

  it('host menu makes a clue-giver', () => {
    const { view, you } = fixture('tv-guess-host')
    const send = vi.fn()
    render(<BoardScreen view={view} you={you} send={send} />)
    fireEvent.click(screen.getByRole('button', { name: 'Host menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fern' }))
    expect(send).toHaveBeenCalledWith({ type: 'host:make-clue-giver', playerId: 'p6' })
  })

  it('host menu removes a player after confirming', () => {
    const { view, you } = fixture('tv-guess-host')
    const send = vi.fn()
    render(<BoardScreen view={view} you={you} send={send} />)
    fireEvent.click(screen.getByRole('button', { name: 'Host menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ben' }))
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Remove Ben from the game?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
    expect(send).toHaveBeenCalledWith({ type: 'host:remove-player', playerId: 'p2' })
  })

  it('host menu prompts for a missing clue-giver', () => {
    const { view, you } = fixture('tv-needs-clue-giver')
    const send = vi.fn()
    render(<BoardScreen view={view} you={you} send={send} />)
    expect(screen.getByText('Pick a new clue-giver for Red')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ben' }))
    expect(send).toHaveBeenCalledWith({ type: 'host:make-clue-giver', playerId: 'p2' })
  })

  it('no missing-clue-giver prompt for a non-host TV', () => {
    const { view } = fixture('tv-needs-clue-giver')
    render(<BoardScreen view={view} you={{ kind: 'tv', host: false }} send={vi.fn()} />)
    expect(screen.queryByText('Pick a new clue-giver for Red')).toBeNull()
  })

  it('host undo jumps back to a chosen move after confirming', () => {
    const { view, you } = fixture('tv-guess-host')
    view.timeline = ['Red clue: OCEAN 2', 'Red revealed APPLE (red)']
    const send = vi.fn()
    render(<BoardScreen view={view} you={you} send={send} />)
    fireEvent.click(screen.getByRole('button', { name: 'Host menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go back to before: Red clue: OCEAN 2' }))
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Go back to before “Red clue: OCEAN 2”?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, go back' }))
    expect(send).toHaveBeenCalledWith({ type: 'host:undo', steps: 2 })
  })

  it('host undo last steps back one move, and is off with nothing to undo', () => {
    const { view, you } = fixture('tv-guess-host')
    view.timeline = ['Red clue: OCEAN 2']
    const send = vi.fn()
    const { unmount } = render(<BoardScreen view={view} you={you} send={send} />)
    fireEvent.click(screen.getByRole('button', { name: 'Host menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo last move' }))
    expect(send).toHaveBeenCalledWith({ type: 'host:undo', steps: 1 })
    unmount()

    view.timeline = []
    render(<BoardScreen view={view} you={you} send={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Host menu' }))
    expect((screen.getByRole('button', { name: 'Undo last move' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('host menu moves a guesser mid-game, but not a clue-giver', () => {
    const { view, you } = fixture('tv-guess-host')
    const send = vi.fn()
    render(<BoardScreen view={view} you={you} send={send} />)
    fireEvent.click(screen.getByRole('button', { name: 'Host menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move Ben to Blue' }))
    expect(send).toHaveBeenCalledWith({ type: 'host:move-player', playerId: 'p2', team: 'blue' })
    expect((screen.getByRole('button', { name: 'Move Ana to Blue' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('disabled turns host actions off', () => {
    const { view, you } = fixture('tv-needs-clue-giver')
    render(<BoardScreen view={view} you={you} send={vi.fn()} disabled />)
    expect((screen.getByRole('button', { name: 'Ben' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('GameOver', () => {
  it('shows the winner and host controls', () => {
    const { view } = fixture('tv-over')
    const send = vi.fn()
    render(<GameOver view={view} you={{ kind: 'tv', host: true }} send={send} />)
    expect(screen.getByText('Blue wins')).toBeTruthy()
    expect(screen.getByText('Red hit the assassin')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to lobby' }))
    expect(send.mock.calls).toEqual([[{ type: 'host:new-game' }], [{ type: 'host:lobby' }]])
  })

  it('lets the host undo the game-ending move', () => {
    const { view } = fixture('tv-over')
    view.timeline = ['Red clue: OCEAN 3', 'Red revealed CENTAUR (assassin) — Blue wins']
    const send = vi.fn()
    render(<GameOver view={view} you={{ kind: 'tv', host: true }} send={send} />)
    fireEvent.click(screen.getByRole('button', { name: 'Undo last move' }))
    expect(send).toHaveBeenCalledWith({ type: 'host:undo', steps: 1 })
  })

  it('hides host controls from a non-host TV', () => {
    const { view } = fixture('tv-over')
    render(<GameOver view={view} you={{ kind: 'tv', host: false }} send={vi.fn()} />)
    expect(screen.getByText('Blue wins')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New game' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back to lobby' })).toBeNull()
  })

  it('a win on cards names the winner', () => {
    const { view } = fixture('tv-over')
    view.phase = { name: 'over', winner: 'red', reason: 'cards' }
    render(<GameOver view={view} you={{ kind: 'tv', host: false }} send={vi.fn()} />)
    expect(screen.getByText('Red found all their agents')).toBeTruthy()
  })
})
