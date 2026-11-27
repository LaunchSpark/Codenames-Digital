import { describe, expect, it } from 'vitest'
import { dispatch, parseClientMessage } from './dispatch'
import { seededRandom } from './random'
import { removeSeat } from './roster'
import { castEndVote, castVote, giveClue, makeClueGiver, newGame, skipTurn } from './rules'
import type { ServerState } from './state'
import { codeOf, colorIndex, lobby, startRed } from './testing'
import { canUndo, hostUndo, undo } from './undo'
import { viewFor } from './views'
import { WORDS } from './words'

const bothVote = (s: ServerState, card: number) => castVote(castVote(s, 'bob', card), 'cy', card)
const phase = (s: ServerState) => s.game!.board.phase
const labels = (s: ServerState) => viewFor(s, { kind: 'tv', host: true }, '').view.timeline

/** Red clue, one red reveal, end turn, host skip of blue, host hands red's key to cy. */
function busyGame() {
  let s = giveClue(startRed(), 'ann', 'ocean', 2)
  const word = s.game!.board.cards[colorIndex(s, 'red')].word
  s = bothVote(s, colorIndex(s, 'red'))
  s = castEndVote(castEndVote(s, 'bob'), 'cy')
  s = skipTurn(s)
  s = makeClueGiver(s, 'cy')
  return { s, word }
}

describe('game timeline', () => {
  it('logs every game move and host correction with a readable label', () => {
    const { s, word } = busyGame()
    expect(labels(s)).toEqual([
      'Red clue: OCEAN 2',
      `Red revealed ${word.toUpperCase()} (red)`,
      'Red ended their turn',
      "Host skipped Blue's turn",
      "Host made cy Red's clue-giver",
    ])
  })

  it("logs a clue-giver's undo too", () => {
    const s = undo(giveClue(startRed(), 'ann', 'ocean', 2), 'dee')
    expect(labels(s)).toEqual(['Red clue: OCEAN 2', 'dee pressed Undo'])
  })

  it('starts empty for each new game', () => {
    const { s } = busyGame()
    expect(labels(newGame(s, WORDS, seededRandom(9)))).toEqual([])
  })
})

describe('host undo', () => {
  it('reverts a clue-giver reassignment', () => {
    const { s } = busyGame()
    expect(hostUndo(s, 1).game!.clueGivers.red).toBe('ann')
  })

  it('steps back past a skipped turn, restoring clue-giver undo', () => {
    const { s } = busyGame()
    const back = hostUndo(s, 2)
    expect(phase(back)).toEqual({ name: 'clue', team: 'blue' })
    expect(canUndo(back)).toBe(true)
    expect(labels(back)).toHaveLength(3)
  })

  it('jumps several moves at once', () => {
    const { s } = busyGame()
    const back = hostUndo(s, 5)
    expect(phase(back)).toEqual({ name: 'clue', team: 'red' })
    expect(back.game!.board.clues).toEqual([])
    expect(labels(back)).toEqual([])
    expect(canUndo(back)).toBe(false)
  })

  it("can undo a clue-giver's undo", () => {
    const s = undo(giveClue(startRed(), 'ann', 'ocean', 2), 'dee')
    expect(phase(hostUndo(s, 1)).name).toBe('guess')
  })

  it('brings a finished game back to the board', () => {
    let s = giveClue(startRed(), 'ann', 'ocean', 2)
    s = bothVote(s, colorIndex(s, 'assassin'))
    expect(phase(s).name).toBe('over')
    expect(labels(s)!.at(-1)).toMatch(/\(assassin\) — Blue wins$/)
    expect(phase(hostUndo(s, 1)).name).toBe('guess')
  })

  it('keeps removed players removed, leaving their team to pick a new clue-giver', () => {
    let s = giveClue(startRed(), 'ann', 'ocean', 2)
    s = removeSeat(s, 'ann')
    s = hostUndo(s, 1)
    expect(s.roster.seats.ann).toBeUndefined()
    expect(s.game!.clueGivers.red).toBeNull()
    expect(phase(s)).toEqual({ name: 'clue', team: 'red' })
  })

  it('clears pending votes', () => {
    let s = giveClue(startRed(), 'ann', 'ocean', 2)
    s = castVote(s, 'bob', 0)
    expect(hostUndo(s, 1).game!.votes).toEqual({})
  })

  it('refuses bad step counts and the lobby', () => {
    const { s } = busyGame()
    for (const steps of [0, -1, 1.5, 6]) expect(codeOf(() => hostUndo(s, steps)), String(steps)).toBe('nothing-to-undo')
    expect(codeOf(() => hostUndo(lobby(), 1))).toBe('not-in-lobby')
  })

  it('is host-only over the wire', () => {
    const ctx = { words: WORDS, pictures: [], rand: seededRandom(1), newId: () => 'x', newToken: () => 'y' }
    const s = giveClue(startRed(), 'ann', 'ocean', 2)
    expect(codeOf(() => dispatch(s, { host: false, seatId: 'ann' }, { type: 'host:undo', steps: 1 }, ctx))).toBe('not-host')
    expect(phase(dispatch(s, { host: true, seatId: null }, { type: 'host:undo', steps: 1 }, ctx).state).name).toBe('clue')
    expect(parseClientMessage('{"type":"host:undo","steps":2}')).toEqual({ type: 'host:undo', steps: 2 })
    expect(codeOf(() => parseClientMessage('{"type":"host:undo"}'))).toBe('bad-message')
  })
})

describe('timeline in views', () => {
  it('is only sent to the host TV', () => {
    const { s } = busyGame()
    expect(viewFor(s, { kind: 'tv', host: true }, '').view.timeline).toHaveLength(5)
    expect(viewFor(s, { kind: 'tv', host: false }, '').view.timeline).toBeNull()
    expect(viewFor(s, { kind: 'player', seatId: 'cy' }, '').view.timeline).toBeNull()
    expect(viewFor(lobby(), { kind: 'tv', host: true }, '').view.timeline).toBeNull()
  })
})
