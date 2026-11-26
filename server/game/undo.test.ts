import { describe, expect, it } from 'vitest'
import { addSeat } from './roster'
import { castEndVote, castVote, giveClue, makeClueGiver, skipTurn } from './rules'
import type { ServerState } from './state'
import { codeOf, colorIndex, startRed } from './testing'
import { canUndo, undo } from './undo'

const redGuessing = () => giveClue(startRed(), 'ann', 'ocean', 2)
const bothVote = (s: ServerState, card: number) => castVote(castVote(s, 'bob', card), 'cy', card)
const phase = (s: ServerState) => s.game!.board.phase

describe('undo', () => {
  it('reverts a reveal and the turn change it caused', () => {
    const before = redGuessing()
    const card = colorIndex(before, 'neutral')
    const after = bothVote(before, card)
    expect(phase(after)).toEqual({ name: 'clue', team: 'blue' })
    const undone = undo(after, 'ann')
    expect(phase(undone)).toEqual(phase(before))
    expect(undone.game!.board.cards[card].revealed).toBe(false)
  })

  it('reverts a clue back to the clue phase', () => {
    expect(phase(undo(redGuessing(), 'ann'))).toEqual({ name: 'clue', team: 'red' })
  })

  it('brings a finished game back to the board', () => {
    const s = redGuessing()
    const over = bothVote(s, colorIndex(s, 'assassin'))
    expect(phase(over).name).toBe('over')
    expect(phase(undo(over, 'dee')).name).toBe('guess')
  })

  it('walks back to the start of the game, then refuses', () => {
    let s = redGuessing()
    s = bothVote(s, colorIndex(s, 'red'))
    expect(canUndo(s)).toBe(true)
    s = undo(undo(s, 'ann'), 'ann')
    expect(phase(s)).toEqual({ name: 'clue', team: 'red' })
    expect(canUndo(s)).toBe(false)
    expect(codeOf(() => undo(s, 'ann'))).toBe('nothing-to-undo')
  })

  it('is open to the opposing clue-giver but not to guessers', () => {
    const s = redGuessing()
    expect(phase(undo(s, 'dee')).name).toBe('clue')
    expect(codeOf(() => undo(s, 'bob'))).toBe('not-your-turn')
  })

  it('clears pending votes', () => {
    const s = castVote(redGuessing(), 'bob', 0)
    expect(undo(s, 'ann').game!.votes).toEqual({})
  })

  it('leaves players and clue-giver reassignment alone', () => {
    let s = redGuessing()
    s = makeClueGiver(s, 'cy')
    s = addSeat(s, { id: 'late', token: 't-late', name: 'late', team: 'red' })
    s = undo(s, 'dee')
    expect(s.game!.clueGivers.red).toBe('cy')
    expect(s.roster.seats.late).toBeDefined()
  })

  it('does not count a skipped turn as a step', () => {
    let s = skipTurn(redGuessing())
    expect(phase(s)).toEqual({ name: 'clue', team: 'blue' })
    s = undo(s, 'ann')
    expect(phase(s)).toEqual({ name: 'clue', team: 'red' })
    expect(s.game!.history).toEqual([])
  })

  it('counts a voted end of turn as a step', () => {
    let s = redGuessing()
    s = bothVote(s, colorIndex(s, 'red'))
    const beforeEnd = phase(s)
    s = castEndVote(castEndVote(s, 'bob'), 'cy')
    expect(phase(s)).toEqual({ name: 'clue', team: 'blue' })
    expect(phase(undo(s, 'ann'))).toEqual(beforeEnd)
  })
})
