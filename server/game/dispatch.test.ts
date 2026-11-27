import { describe, expect, it } from 'vitest'
import type { ClientMessage } from '../../src/shared/protocol'
import { dispatch, parseClientMessage, type DispatchContext, type Sender } from './dispatch'
import { seededRandom } from './random'
import { castVote, giveClue, voters } from './rules'
import type { ServerState } from './state'
import { codeOf, colorIndex, lobby, PICTURES, startRed } from './testing'
import { WORDS } from './words'

let n = 0
const ctx: DispatchContext = {
  words: WORDS,
  pictures: PICTURES,
  rand: seededRandom(5),
  newId: () => `p${++n}`,
  newToken: () => `tok${n}`,
}
const host: Sender = { host: true, seatId: null }
const guest: Sender = { host: false, seatId: null }
const as = (seatId: string): Sender => ({ host: false, seatId })
const run = (s: ServerState, from: Sender, msg: ClientMessage) => dispatch(s, from, msg, ctx)

const guess = () => giveClue(startRed(), 'ann', 'ocean', 2)

describe('dispatch', () => {
  it("a clue from ann waits; dee's verdict message approves it", () => {
    const sent = run(startRed(), as('ann'), { type: 'clue', word: 'ocean', number: 2 }).state
    expect(sent.game!.board.phase.name).toBe('clue')
    expect(sent.game!.pendingClue?.clue.word).toBe('ocean')
    const approved = run(sent, as('dee'), { type: 'clue-verdict', approve: true, word: 'ocean', number: 2 }).state
    expect(approved.game!.board.phase.name).toBe('guess')
  })

  it('rejects a malformed verdict', () => {
    expect(codeOf(() => parseClientMessage('{"type":"clue-verdict","approve":"yes","word":"ocean","number":2}'))).toBe('bad-message')
    expect(codeOf(() => parseClientMessage('{"type":"clue-verdict","approve":true}'))).toBe('bad-message')
    expect(parseClientMessage('{"type":"withdraw-clue"}')).toEqual({ type: 'withdraw-clue' })
  })

  it('lets the host pick the picture deck, then deals pictures', () => {
    const picked = run(lobby(), host, { type: 'host:set-deck', deck: 'pictures' }).state
    expect(picked.deck).toBe('pictures')
    expect(run(picked, host, { type: 'host:start' }).state.game!.board.cards).toHaveLength(20)
  })

  it('refuses a deck change from a player', () => {
    expect(codeOf(() => run(lobby(), as('ann'), { type: 'host:set-deck', deck: 'pictures' }))).toBe('not-host')
  })

  it('rejects an unknown deck', () => {
    expect(codeOf(() => parseClientMessage('{"type":"host:set-deck","deck":"emoji"}'))).toBe('bad-message')
  })

  it('refuses host actions from non-host connections', () => {
    const msgs: ClientMessage[] = [
      { type: 'host:start' },
      { type: 'host:new-game' },
      { type: 'host:lobby' },
      { type: 'host:make-clue-giver', playerId: 'bob' },
      { type: 'host:skip-turn' },
      { type: 'host:remove-player', playerId: 'bob' },
    ]
    for (const msg of msgs) expect(codeOf(() => run(guess(), as('ann'), msg)), msg.type).toBe('not-host')
  })

  it('lets the host start, skip and go back to the lobby', () => {
    const started = run(lobby(), host, { type: 'host:start' }).state
    expect(started.game).not.toBeNull()
    expect(run(started, host, { type: 'host:skip-turn' }).state.game!.board.phase.name).toBe('clue')
    expect(run(started, host, { type: 'host:lobby' }).state.game).toBeNull()
  })

  it('answers a join with a welcome carrying the token and new seat id', () => {
    const { state, reply, seatId } = run(lobby(), guest, { type: 'join', name: 'Fay', team: 'blue' })
    expect(reply).toEqual({ type: 'welcome', token: expect.any(String), playerId: seatId })
    expect(state.roster.seats[seatId!].token).toBe((reply as { token: string }).token)
    expect(state.roster.order.blue.at(-1)).toBe(seatId)
  })

  it('treats a seated join in the lobby as a rename or team switch', () => {
    const { state } = run(lobby(), as('bob'), { type: 'join', name: 'Bobby', team: 'blue' })
    expect(state.roster.seats.bob).toMatchObject({ name: 'Bobby', team: 'blue' })
  })

  it('lets a removed player join again from the same connection', () => {
    const removed = run(guess(), host, { type: 'host:remove-player', playerId: 'bob' }).state
    const { state, seatId } = run(removed, as('bob'), { type: 'join', name: 'bob', team: 'red' })
    expect(seatId).toBeDefined()
    expect(state.roster.seats[seatId!]).toMatchObject({ name: 'bob', team: 'red' })
  })

  it('seats a mid-game joiner as a guesser with a new pip slot', () => {
    const s = guess()
    const { state } = run(s, guest, { type: 'join', name: 'Fay', team: 'red' })
    expect(voters(state)).toHaveLength(voters(s).length + 1)
    expect(state.game!.board.cards.some((c) => c.revealed)).toBe(false)
  })

  it('refuses play from seatless senders', () => {
    for (const msg of [
      { type: 'clue', word: 'ocean', number: 2 },
      { type: 'vote', card: 0 },
      { type: 'vote-end' },
      { type: 'undo' },
    ] as ClientMessage[]) {
      expect(codeOf(() => run(guess(), guest, msg)), msg.type).toBe('unknown-player')
    }
  })

  it('routes play messages to the rules', () => {
    let s = run(startRed(), as('ann'), { type: 'clue', word: 'ocean', number: 2 }).state
    s = run(s, as('dee'), { type: 'clue-verdict', approve: true, word: 'ocean', number: 2 }).state
    expect(s.game!.board.phase.name).toBe('guess')
    s = run(s, as('bob'), { type: 'vote', card: 4 }).state
    expect(s.game!.votes).toEqual({ bob: [4] })
    s = run(s, as('dee'), { type: 'undo' }).state
    expect(s.game!.board.phase.name).toBe('clue')
  })

  it('re-settles the vote when the host removes a voter', () => {
    const s = guess()
    const x = colorIndex(s, 'red', 0)
    const split = castVote(castVote(s, 'bob', x), 'cy', colorIndex(s, 'red', 1))
    const { state } = run(split, host, { type: 'host:remove-player', playerId: 'cy' })
    expect(state.game!.board.cards[x].revealed).toBe(true)
  })

  it('treats inherited property names as unknown players', () => {
    for (const playerId of ['toString', 'constructor', '__proto__']) {
      expect(codeOf(() => run(guess(), host, { type: 'host:remove-player', playerId })), playerId).toBe('unknown-player')
      expect(codeOf(() => run(guess(), host, { type: 'host:make-clue-giver', playerId })), playerId).toBe('unknown-player')
      expect(codeOf(() => run(lobby(), as(playerId), { type: 'join', name: 'x', team: 'red' })), playerId).toBeNull()
    }
  })

  it('refuses hello, which only the hub handles', () => {
    expect(codeOf(() => run(lobby(), guest, { type: 'hello', client: 'tv' }))).toBe('bad-message')
  })
})

describe('parseClientMessage', () => {
  it('rejects junk', () => {
    for (const raw of ['nope', '{}', '[]', 'null', '{"type":"vote","card":"3"}', '{"type":"join","name":"a","team":"green"}', '{"type":"hello","client":"player"}']) {
      expect(codeOf(() => parseClientMessage(raw)), raw).toBe('bad-message')
    }
  })

  it('parses valid messages', () => {
    expect(parseClientMessage('{"type":"vote","card":3}')).toEqual({ type: 'vote', card: 3 })
    expect(parseClientMessage('{"type":"hello","client":"player","token":null}')).toEqual({
      type: 'hello',
      client: 'player',
      token: null,
    })
    expect(parseClientMessage('{"type":"host:remove-player","playerId":"x"}')).toEqual({
      type: 'host:remove-player',
      playerId: 'x',
    })
  })
})
