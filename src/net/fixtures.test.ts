import { describe, expect, it } from 'vitest'
import { BOARD_CELLS } from '../shared/protocol'
import { FIXTURES, isFixtureName } from './fixtures'

const entries = Object.entries(FIXTURES)

describe('fixtures', () => {
  it('non-clue-giver fixtures hide unrevealed colours', () => {
    for (const [name, { view, you }] of entries) {
      const isClueGiver = you.kind === 'player' && you.role === 'clue-giver'
      if (isClueGiver || view.phase.name === 'over' || !view.board) continue
      const leaked = view.board.filter((c) => !c.revealed && c.color !== null)
      expect(leaked, name).toEqual([])
    }
  })

  it('every in-game fixture has 25 cards', () => {
    for (const [name, { view }] of entries) {
      if (view.phase.name === 'lobby') {
        expect(view.board, name).toBeNull()
      } else {
        expect(view.board?.length, name).toBe(BOARD_CELLS)
      }
    }
  })

  it('revealed cards always carry their colour', () => {
    for (const [name, { view }] of entries) {
      for (const card of view.board ?? []) {
        if (card.revealed) expect(card.color, name).not.toBeNull()
      }
    }
  })

  it('votes never exceed the voters', () => {
    for (const [name, { view }] of entries) {
      const cast = (view.board ?? []).reduce((n, c) => n + c.votes, 0) + view.endTurnVotes
      expect(cast, name).toBeLessThanOrEqual(view.voterCount)
    }
  })

  it('recognises fixture names', () => {
    expect(isFixtureName('tv-guess')).toBe(true)
    expect(isFixtureName('nope')).toBe(false)
    expect(isFixtureName('toString')).toBe(false)
    expect(isFixtureName(null)).toBe(false)
  })
})
