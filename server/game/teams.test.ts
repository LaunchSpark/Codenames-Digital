import { describe, expect, it } from 'vitest'
import { dispatch, parseClientMessage } from './dispatch'
import { seededRandom } from './random'
import { shuffleTeams } from './roster'
import { castVote, giveClue, moveSeat, voters } from './rules'
import { codeOf, colorIndex, lobby, lobbyWith, startRed } from './testing'
import { WORDS } from './words'

describe('host moves a player', () => {
  it('moves a lobby player to the back of the other team', () => {
    const s = moveSeat(lobby(), 'ann', 'blue')
    expect(s.roster.seats.ann.team).toBe('blue')
    expect(s.roster.order.red).toEqual(['bob', 'cy'])
    expect(s.roster.order.blue).toEqual(['dee', 'eve', 'ann'])
  })

  it('does nothing when the player is already on that team', () => {
    const s = lobby()
    expect(moveSeat(s, 'ann', 'red')).toEqual(s)
  })

  it('moves a guesser mid-game, re-checking both teams’ votes', () => {
    let s = giveClue(startRed(), 'ann', 'ocean', 2)
    const x = colorIndex(s, 'red')
    s = castVote(s, 'bob', x)
    s = moveSeat(s, 'cy', 'blue')
    // bob is now red's only guesser, and his vote stands alone: revealed.
    expect(s.game!.board.cards[x].revealed).toBe(true)
    expect(s.roster.order.blue).toEqual(['dee', 'eve', 'cy'])
  })

  it('drops the moved player’s vote', () => {
    let s = giveClue(startRed(lobbyWith({ red: ['ann', 'bob', 'cy', 'dan'], blue: ['dee', 'eve'] })), 'ann', 'ocean', 2)
    s = castVote(s, 'cy', 0)
    s = moveSeat(s, 'cy', 'blue')
    expect(s.game!.votes).toEqual({})
    expect(voters(s)).toEqual(['bob', 'dan'])
  })

  it('refuses to move a current clue-giver mid-game', () => {
    expect(codeOf(() => moveSeat(startRed(), 'ann', 'blue'))).toBe('clue-giver-locked')
  })

  it('refuses unknown players', () => {
    expect(codeOf(() => moveSeat(lobby(), 'toString', 'blue'))).toBe('unknown-player')
  })
})

describe('random teams', () => {
  it('splits everyone into balanced teams', () => {
    const s = shuffleTeams(lobbyWith({ red: ['a', 'b', 'c', 'd', 'e'], blue: [] }), seededRandom(1))
    const sizes = [s.roster.order.red.length, s.roster.order.blue.length].sort()
    expect(sizes).toEqual([2, 3])
    expect([...s.roster.order.red, ...s.roster.order.blue].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    for (const t of ['red', 'blue'] as const) {
      for (const id of s.roster.order[t]) expect(s.roster.seats[id].team).toBe(t)
    }
  })

  it('actually mixes people up across seeds', () => {
    const base = lobby()
    const reds = new Set<string>()
    for (let seed = 1; seed <= 20; seed++) reds.add(shuffleTeams(base, seededRandom(seed)).roster.order.red.join())
    expect(reds.size).toBeGreaterThan(3)
  })

  it('is lobby-only', () => {
    expect(codeOf(() => shuffleTeams(startRed(), seededRandom(1)))).toBe('not-in-lobby')
  })
})

describe('over the wire', () => {
  const ctx = { words: WORDS, pictures: [], rand: seededRandom(3), newId: () => 'x', newToken: () => 'y' }

  it('both are host-only', () => {
    const guest = { host: false, seatId: 'ann' }
    expect(codeOf(() => dispatch(lobby(), guest, { type: 'host:move-player', playerId: 'bob', team: 'blue' }, ctx))).toBe('not-host')
    expect(codeOf(() => dispatch(lobby(), guest, { type: 'host:shuffle-teams' }, ctx))).toBe('not-host')
  })

  it('routes to the roster', () => {
    const host = { host: true, seatId: null }
    const moved = dispatch(lobby(), host, { type: 'host:move-player', playerId: 'bob', team: 'blue' }, ctx).state
    expect(moved.roster.seats.bob.team).toBe('blue')
    const shuffled = dispatch(lobby(), host, { type: 'host:shuffle-teams' }, ctx).state
    expect(shuffled.roster.order.red.length + shuffled.roster.order.blue.length).toBe(5)
  })

  it('parses the new messages', () => {
    expect(parseClientMessage('{"type":"host:move-player","playerId":"a","team":"red"}')).toEqual({
      type: 'host:move-player',
      playerId: 'a',
      team: 'red',
    })
    expect(parseClientMessage('{"type":"host:shuffle-teams"}')).toEqual({ type: 'host:shuffle-teams' })
    expect(codeOf(() => parseClientMessage('{"type":"host:move-player","playerId":"a","team":"green"}'))).toBe('bad-message')
  })
})
