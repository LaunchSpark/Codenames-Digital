import { describe, expect, it } from 'vitest'
import { DECKS, newBoard } from './board'
import { seededRandom } from './random'
import { PICTURES } from './testing'
import { WORDS } from './words'

const count = (board: ReturnType<typeof newBoard>, color: string) =>
  board.cards.filter((c) => c.color === color).length

describe('newBoard', () => {
  it('deals 25 distinct words from the list', () => {
    const board = newBoard(WORDS, seededRandom(1))
    const words = board.cards.map((c) => c.word)
    expect(board.cards).toHaveLength(25)
    expect(new Set(words).size).toBe(25)
    for (const w of words) expect(WORDS).toContain(w)
  })

  it('deals 9/8/7/1', () => {
    const board = newBoard(WORDS, seededRandom(2))
    const other = board.startingTeam === 'red' ? 'blue' : 'red'
    expect(count(board, board.startingTeam)).toBe(9)
    expect(count(board, other)).toBe(8)
    expect(count(board, 'neutral')).toBe(7)
    expect(count(board, 'assassin')).toBe(1)
  })

  it("starts with the starting team's clue phase, nothing revealed", () => {
    const board = newBoard(WORDS, seededRandom(3))
    expect(board.phase).toEqual({ name: 'clue', team: board.startingTeam })
    expect(board.clues).toEqual([])
    expect(board.cards.every((c) => !c.revealed)).toBe(true)
  })

  it('picks both starting teams across seeds', () => {
    const starters = new Set<string>()
    for (let seed = 1; seed <= 50; seed++) starters.add(newBoard(WORDS, seededRandom(seed)).startingTeam)
    expect(starters).toEqual(new Set(['red', 'blue']))
  })

  it('is reproducible', () => {
    expect(newBoard(WORDS, seededRandom(7))).toEqual(newBoard(WORDS, seededRandom(7)))
  })

  it('throws on fewer than 25 words', () => {
    expect(() => newBoard(WORDS.slice(0, 24), seededRandom(1))).toThrow()
  })

  it('deals 20 distinct pictures with 8/7/4/1', () => {
    const board = newBoard(PICTURES, seededRandom(2), DECKS.pictures)
    const ids = board.cards.map((c) => c.word)
    const other = board.startingTeam === 'red' ? 'blue' : 'red'
    expect(board.cards).toHaveLength(20)
    expect(new Set(ids).size).toBe(20)
    for (const id of ids) expect(PICTURES).toContain(id)
    expect(count(board, board.startingTeam)).toBe(8)
    expect(count(board, other)).toBe(7)
    expect(count(board, 'neutral')).toBe(4)
    expect(count(board, 'assassin')).toBe(1)
  })

  it('throws on fewer than 20 pictures', () => {
    expect(() => newBoard(PICTURES.slice(0, 19), seededRandom(1), DECKS.pictures)).toThrow()
  })
})
