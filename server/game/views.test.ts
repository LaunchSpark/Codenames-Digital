import { describe, expect, it } from 'vitest'
import type { GameView } from '../../src/shared/protocol'
import { removeSeat, setConnected } from './roster'
import { clueVerdict, submitClue } from './review'
import { castVote, giveClue, makeClueGiver, setDeck } from './rules'
import type { ServerState } from './state'
import { colorIndex, lobby, PICTURES, startRed } from './testing'
import { viewFor, type Viewer } from './views'

const URL = 'http://192.168.1.20:3000/'
const view = (s: ServerState, viewer: Viewer) => viewFor(s, viewer, URL).view
const player = (seatId: string): Viewer => ({ kind: 'player', seatId })

/** Unrevealed cards whose colour leaked into a view. */
const leaks = (v: GameView) => (v.board ?? []).filter((c) => !c.revealed && c.color !== null)

const clue = () => startRed()
const guess = () => giveClue(startRed(), 'ann', 'ocean', 2)

describe('viewFor', () => {
  it('shows a waiting clue only to the two clue-givers', () => {
    const s = submitClue(startRed(), 'ann', 'ocean', 2)
    const viewers: Viewer[] = [{ kind: 'tv', host: true }, { kind: 'spectator' }, player('bob'), player('eve'), player('ann'), player('dee')]
    for (const viewer of viewers) expect(view(s, viewer).checking, JSON.stringify(viewer)).toBe('red')
    const you = (id: string) => viewFor(s, player(id), URL).you
    const clue = { team: 'red', word: 'ocean', number: 2 }
    expect(you('ann')).toMatchObject({ pendingClue: clue, rejectedClue: null })
    expect(you('dee')).toMatchObject({ pendingClue: clue })
    expect(you('bob')).toMatchObject({ pendingClue: null, rejectedClue: null })
    expect(you('eve')).toMatchObject({ pendingClue: null })
    for (const viewer of [{ kind: 'tv', host: true }, { kind: 'spectator' }, player('bob'), player('eve')] as Viewer[]) {
      expect(JSON.stringify(viewFor(s, viewer, URL)), JSON.stringify(viewer)).not.toContain('ocean')
    }
  })

  it('hands a rejected clue back to its giver only', () => {
    const s = clueVerdict(submitClue(startRed(), 'ann', 'ocean', 2), 'dee', false)
    expect(viewFor(s, player('ann'), URL).you).toMatchObject({ rejectedClue: { team: 'red', word: 'ocean', number: 2 } })
    expect(viewFor(s, player('dee'), URL).you).toMatchObject({ rejectedClue: null })
    expect(view(s, player('ann')).checking).toBeNull()
  })

  it('carries the deck and whether pictures are available', () => {
    const v = view(lobby(), { kind: 'tv', host: true })
    expect(v.deck).toBe('words')
    expect(v.picturesAvailable).toBe(false)
    expect(viewFor(lobby(), { kind: 'tv', host: true }, URL, true).view.picturesAvailable).toBe(true)
    expect(view(setDeck(lobby(), 'pictures', PICTURES), player('bob')).deck).toBe('pictures')
  })

  it('never shows unrevealed colours to the TV, spectators or guessers mid-game', () => {
    for (const s of [clue(), guess()]) {
      for (const viewer of [
        { kind: 'tv', host: true },
        { kind: 'tv', host: false },
        { kind: 'spectator' },
        player('bob'),
        player('cy'),
        player('eve'),
      ] as Viewer[]) {
        expect(leaks(view(s, viewer)), JSON.stringify(viewer)).toEqual([])
      }
    }
  })

  it('shows both clue-givers the whole key', () => {
    for (const id of ['ann', 'dee']) {
      expect(view(guess(), player(id)).board!.every((c) => c.color !== null)).toBe(true)
    }
  })

  it('shows everyone the key once the game is over', () => {
    const s = guess()
    const card = colorIndex(s, 'assassin')
    const over = castVote(castVote(s, 'bob', card), 'cy', card)
    expect(view(over, { kind: 'tv', host: false }).board!.every((c) => c.color !== null)).toBe(true)
    expect(view(over, player('bob')).board!.every((c) => c.color !== null)).toBe(true)
  })

  it('takes the key away from a demoted clue-giver', () => {
    const s = makeClueGiver(guess(), 'cy')
    expect(leaks(view(s, player('ann')))).toEqual([])
    expect(view(s, player('cy')).board!.every((c) => c.color !== null)).toBe(true)
  })

  it('leaves no red player holding the key after the clue-giver is removed', () => {
    const s = removeSeat(guess(), 'ann')
    for (const id of ['bob', 'cy']) expect(leaks(view(s, player(id)))).toEqual([])
    expect(view(s, player('bob')).teams.red.clueGiverId).toBeNull()
  })

  it('counts pips from current voters only', () => {
    const s = guess()
    const card = colorIndex(s, 'red')
    const voted = castVote(s, 'bob', card)
    expect(view(voted, player('cy')).board![card].votes).toBe(1)
    expect(view(voted, player('cy')).voterCount).toBe(2)
    const dropped = setConnected(voted, 'bob', -1)
    expect(view(dropped, player('cy')).voterCount).toBe(1)
    expect(view(dropped, player('cy')).board![card].votes).toBe(0)
  })

  it('has a null board, remaining and starting team in the lobby', () => {
    const v = view(lobby(), { kind: 'tv', host: true })
    expect(v.board).toBeNull()
    expect(v.startingTeam).toBeNull()
    expect(v.teams.red.remaining).toBeNull()
    expect(v.phase).toEqual({ name: 'lobby' })
    expect(v.joinUrl).toBe(URL)
  })

  it('describes the viewer', () => {
    const s = castVote(guess(), 'bob', 3)
    expect(viewFor(s, player('bob'), URL).you).toEqual({ kind: 'player', id: 'bob', team: 'red', role: 'guesser', votes: [3], votedEnd: false, pendingClue: null, rejectedClue: null })
    expect(viewFor(s, player('ann'), URL).you).toMatchObject({ role: 'clue-giver', votes: [], votedEnd: false })
    expect(viewFor(lobby(), player('ann'), URL).you).toMatchObject({ role: null })
    expect(viewFor(s, { kind: 'tv', host: true }, URL).you).toEqual({ kind: 'tv', host: true })
  })

  it('reports teams, remaining, clues, end votes and undo', () => {
    const v = view(guess(), player('bob'))
    expect(v.teams.red.players.map((p) => p.id)).toEqual(['ann', 'bob', 'cy'])
    expect(v.teams.red.players.every((p) => p.connected)).toBe(true)
    expect(v.teams.red.remaining).toBe(9)
    expect(v.teams.blue.remaining).toBe(8)
    expect(v.clues).toEqual([{ team: 'red', word: 'ocean', number: 2 }])
    expect(v.endTurnVotes).toBe(0)
    expect(v.canUndo).toBe(true)
    expect(v.mode).toBe('vs')
  })
})
