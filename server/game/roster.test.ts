import { describe, expect, it } from 'vitest'
import { addSeat, changeSeat, emptyState, isConnected, removeSeat, seatByToken, setConnected } from './roster'
import { GameError, type ServerState } from './state'
import { lobbyWith } from './testing'

const codeOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    if (e instanceof GameError) return e.code
    throw e
  }
  return null
}

const join = (s: ServerState, name: string, team: 'red' | 'blue' = 'red') =>
  addSeat(s, { id: `id-${name.trim()}`, token: `t-${name.trim()}`, name, team })

describe('roster', () => {
  it('rejects empty, whitespace-only and 21-char names, trims the rest', () => {
    const s = emptyState()
    expect(codeOf(() => join(s, ''))).toBe('name-invalid')
    expect(codeOf(() => join(s, '   '))).toBe('name-invalid')
    expect(codeOf(() => join(s, 'x'.repeat(21)))).toBe('name-invalid')
    expect(join(s, 'x'.repeat(20)).roster.seats['id-' + 'x'.repeat(20)]).toBeDefined()
    expect(join(s, '  Ann  ').roster.seats['id-Ann'].name).toBe('Ann')
  })

  it('rejects a duplicate name case-insensitively, but you may keep your own', () => {
    const s = join(emptyState(), 'Ann')
    expect(codeOf(() => addSeat(s, { id: 'x', token: 'tx', name: 'ann', team: 'blue' }))).toBe('name-taken')
    expect(changeSeat(s, 'id-Ann', 'ANN', 'red').roster.seats['id-Ann'].name).toBe('ANN')
  })

  it('appends joiners to their team order', () => {
    const s = lobbyWith({ red: ['a', 'b'], blue: ['c', 'd'] })
    expect(s.roster.order.red).toEqual(['a', 'b'])
    expect(s.roster.order.blue).toEqual(['c', 'd'])
  })

  it('switching team in the lobby moves you to the back of the new team', () => {
    const s = changeSeat(lobbyWith({ red: ['a', 'b'], blue: ['c', 'd'] }), 'a', 'a', 'blue')
    expect(s.roster.order.red).toEqual(['b'])
    expect(s.roster.order.blue).toEqual(['c', 'd', 'a'])
    expect(s.roster.seats.a.team).toBe('blue')
  })

  it('changeSeat mid-game throws not-in-lobby', () => {
    const s = withGame(lobbyWith({ red: ['a', 'b'], blue: ['c', 'd'] }))
    expect(codeOf(() => changeSeat(s, 'a', 'a', 'blue'))).toBe('not-in-lobby')
  })

  it('stays connected until the last connection closes', () => {
    let s = lobbyWith({ red: ['a'], blue: [] })
    s = setConnected(s, 'a', 1)
    s = setConnected(s, 'a', -1)
    expect(isConnected(s.roster.seats.a)).toBe(true)
    s = setConnected(s, 'a', -1)
    expect(isConnected(s.roster.seats.a)).toBe(false)
    s = setConnected(s, 'a', -1)
    expect(s.roster.seats.a.connections).toBe(0)
  })

  it('dropping the last connection clears that seat’s vote', () => {
    let s = withGame(lobbyWith({ red: ['a', 'b'], blue: ['c', 'd'] }))
    s = { ...s, game: { ...s.game!, votes: { b: 3 } } }
    s = setConnected(s, 'b', -1)
    expect(s.game!.votes).toEqual({})
  })

  it('removing a current clue-giver leaves that team without one', () => {
    let s = withGame(lobbyWith({ red: ['a', 'b'], blue: ['c', 'd'] }))
    s = removeSeat(s, 'a')
    expect(s.game!.clueGivers.red).toBeNull()
    expect(s.roster.order.red).toEqual(['b'])
    expect(s.roster.seats.a).toBeUndefined()
  })

  it('finds seats by token', () => {
    const s = lobbyWith({ red: ['a'], blue: [] })
    expect(seatByToken(s, 't-a')?.id).toBe('a')
    expect(seatByToken(s, 'nope')).toBeUndefined()
  })
})

/** A minimal running game with the first joiner of each team as clue-giver. */
function withGame(s: ServerState): ServerState {
  return {
    ...s,
    game: {
      board: { cards: [], startingTeam: 'red', phase: { name: 'clue', team: 'red' }, clues: [] },
      history: [],
      timeline: [],
      clueGivers: { red: s.roster.order.red[0] ?? null, blue: s.roster.order.blue[0] ?? null },
      votes: {},
    },
  }
}
