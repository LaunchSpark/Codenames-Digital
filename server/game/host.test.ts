import { describe, expect, it } from 'vitest'
import { seededRandom } from './random'
import { changeSeat, removeSeat, setConnected } from './roster'
import { backToLobby, giveClue, makeClueGiver, newGame, skipTurn, startGame } from './rules'
import { codeOf, lobby, startRed } from './testing'
import { WORDS } from './words'

const rand = seededRandom(42)

describe('clue-giver rotation', () => {
  it('rotates each game in join order and wraps', () => {
    let s = startGame(lobby(), WORDS, rand)
    const reds = [s.game!.clueGivers.red]
    for (let i = 0; i < 3; i++) {
      s = newGame(s, WORDS, rand)
      reds.push(s.game!.clueGivers.red)
    }
    expect(reds).toEqual(['ann', 'bob', 'cy', 'ann'])
    expect(s.game!.clueGivers.blue).toBe('eve')
  })

  it('counts the team list as it stands', () => {
    let s = startGame(lobby(), WORDS, rand)
    s = backToLobby(s)
    s = changeSeat(s, 'cy', 'cy', 'blue')
    s = startGame(s, WORDS, rand)
    expect(s.game!.clueGivers.red).toBe('bob')
  })
})

describe('make clue-giver', () => {
  it("hands over the key without changing next game's rotation", () => {
    let s = startRed()
    s = makeClueGiver(s, 'cy')
    expect(s.game!.clueGivers).toEqual({ red: 'cy', blue: 'dee' })
    s = newGame(s, WORDS, rand)
    expect(s.game!.clueGivers.red).toBe('bob')
  })

  it('needs a real player and a running game', () => {
    expect(codeOf(() => makeClueGiver(startRed(), 'nobody'))).toBe('unknown-player')
    expect(codeOf(() => makeClueGiver(lobby(), 'ann'))).toBe('not-in-lobby')
  })
})

describe('skip turn', () => {
  it("passes to the other team's clue phase", () => {
    expect(skipTurn(startRed()).game!.board.phase).toEqual({ name: 'clue', team: 'blue' })
    const guessing = giveClue(startRed(), 'ann', 'ocean', 2)
    expect(skipTurn(guessing).game!.board.phase).toEqual({ name: 'clue', team: 'blue' })
  })
})

describe('back to lobby', () => {
  it('keeps players and rotation', () => {
    const started = startGame(lobby(), WORDS, rand)
    const s = backToLobby(started)
    expect(s.game).toBeNull()
    expect(s.roster).toEqual(started.roster)
    expect(s.roster.nextClueGiver).toEqual({ red: 1, blue: 1 })
  })
})

describe('new game', () => {
  it('deals a fresh board with empty history and votes', () => {
    const s = newGame(giveClue(startRed(), 'ann', 'ocean', 2), WORDS, rand)
    expect(s.game!.board.clues).toEqual([])
    expect(s.game!.history).toEqual([])
    expect(s.game!.votes).toEqual({})
  })

  it('is not available from the lobby', () => {
    expect(codeOf(() => newGame(lobby(), WORDS, rand))).toBe('not-in-lobby')
  })

  it('needs two per team, like Start', () => {
    const s = removeSeat(startRed(), 'eve')
    expect(codeOf(() => newGame(s, WORDS, rand))).toBe('not-enough-players')
  })
})

describe('rotation and connections', () => {
  it('passes over a disconnected player when picking the clue-giver', () => {
    let s = startGame(lobby(), WORDS, rand) // red: ann
    s = setConnected(s, 'bob', -1)
    s = newGame(s, WORDS, rand)
    expect(s.game!.clueGivers.red).toBe('cy')
    s = newGame(s, WORDS, rand)
    expect(s.game!.clueGivers.red).toBe('ann')
  })

  it('still picks someone when the whole team is disconnected', () => {
    let s = startGame(lobby(), WORDS, rand) // blue: dee
    s = setConnected(setConnected(s, 'dee', -1), 'eve', -1)
    s = newGame(s, WORDS, rand)
    expect(s.game!.clueGivers.blue).toBe('eve')
  })
})
