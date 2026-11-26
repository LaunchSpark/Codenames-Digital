import type { ClientMessage, ServerMessage, Team } from '../../src/shared/protocol'
import { addSeat, changeSeat, removeSeat, seatOf } from './roster'
import {
  backToLobby,
  castEndVote,
  castVote,
  giveClue,
  makeClueGiver,
  newGame,
  settleVotes,
  skipTurn,
  startGame,
} from './rules'
import { GameError, type ServerState } from './state'
import { hostUndo, undo } from './undo'

export type Sender = { host: boolean; seatId: string | null }

export interface DispatchContext {
  words: readonly string[]
  rand: () => number
  newId: () => string
  newToken: () => string
}

export interface DispatchResult {
  state: ServerState
  /** Sent only to the sender. */
  reply?: ServerMessage
  /** The seat the sender's connection is now bound to (after a first join). */
  seatId?: string
}

function seated(from: Sender): string {
  if (!from.seatId) throw new GameError('unknown-player', 'Join the game first')
  return from.seatId
}

/** Applies one client message. Throws GameError when it is not allowed. */
export function dispatch(s: ServerState, from: Sender, msg: ClientMessage, ctx: DispatchContext): DispatchResult {
  if (msg.type.startsWith('host:') && !from.host) {
    throw new GameError('not-host', 'Only the host can do that')
  }

  switch (msg.type) {
    case 'hello':
      throw new GameError('bad-message', 'Already connected')

    case 'join': {
      // A connection whose seat the host removed joins afresh.
      if (from.seatId && seatOf(s, from.seatId)) {
        return { state: changeSeat(s, from.seatId, msg.name, msg.team) }
      }
      const id = ctx.newId()
      const token = ctx.newToken()
      const state = settleVotes(addSeat(s, { id, token, name: msg.name, team: msg.team }))
      return { state, reply: { type: 'welcome', token, playerId: id }, seatId: id }
    }

    case 'clue':
      return { state: giveClue(s, seated(from), msg.word, msg.number) }
    case 'vote':
      return { state: castVote(s, seated(from), msg.card) }
    case 'vote-end':
      return { state: castEndVote(s, seated(from)) }
    case 'undo':
      return { state: undo(s, seated(from)) }

    case 'host:start':
      return { state: startGame(s, ctx.words, ctx.rand) }
    case 'host:new-game':
      return { state: newGame(s, ctx.words, ctx.rand) }
    case 'host:lobby':
      return { state: backToLobby(s) }
    case 'host:make-clue-giver':
      return { state: makeClueGiver(s, msg.playerId) }
    case 'host:skip-turn':
      return { state: skipTurn(s) }
    case 'host:remove-player':
      return { state: settleVotes(removeSeat(s, msg.playerId)) }
    case 'host:undo':
      return { state: hostUndo(s, msg.steps) }
  }
}

const isTeam = (v: unknown): v is Team => v === 'red' || v === 'blue'
const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Field checks per message type; a message must pass its type's check. */
const SHAPES: Record<ClientMessage['type'], (m: Record<string, unknown>) => boolean> = {
  hello: (m) => m.client === 'tv' || (m.client === 'player' && (m.token === null || isString(m.token))),
  join: (m) => isString(m.name) && isTeam(m.team),
  clue: (m) => isString(m.word) && isNumber(m.number),
  vote: (m) => isNumber(m.card),
  'vote-end': () => true,
  undo: () => true,
  'host:start': () => true,
  'host:new-game': () => true,
  'host:lobby': () => true,
  'host:make-clue-giver': (m) => isString(m.playerId),
  'host:skip-turn': () => true,
  'host:remove-player': (m) => isString(m.playerId),
  'host:undo': (m) => isNumber(m.steps),
}

export function parseClientMessage(raw: string): ClientMessage {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new GameError('bad-message', 'Not JSON')
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new GameError('bad-message', 'Expected an object')
  }
  const m = data as Record<string, unknown>
  const check = isString(m.type) && Object.hasOwn(SHAPES, m.type) ? SHAPES[m.type as ClientMessage['type']] : null
  if (!check || !check(m)) throw new GameError('bad-message', 'Unrecognised message')
  return m as unknown as ClientMessage
}
