import { randomUUID } from 'node:crypto'
import type { ServerMessage } from '../src/shared/protocol'
import { dispatch, parseClientMessage, type DispatchContext } from './game/dispatch'
import { emptyState, seatByToken, setConnected } from './game/roster'
import { awaitingReturn, expireClue, settle } from './game/review'
import { GameError, type ServerState } from './game/state'
import { DECKS } from './game/board'
import { viewFor, type Viewer } from './game/views'

/** The parts of a `ws` WebSocket the hub uses — small enough to fake in tests. */
export interface HubSocket {
  send(data: string): void
  on(event: 'message', fn: (data: unknown) => void): unknown
  on(event: 'close' | 'pong', fn: () => void): unknown
  on(event: 'error', fn: (err: Error) => void): unknown
  ping(): void
  terminate(): void
}

interface Conn {
  host: boolean
  client: 'tv' | 'player' | null
  seatId: string | null
  alive: boolean
}

export interface Hub {
  attach(socket: HubSocket, host: boolean): void
  /** Call on an interval: drops sockets that missed the previous ping (sleeping phones). */
  heartbeat(): void
  state(): ServerState
}

export function createHub(opts: { joinUrl: string; ctx: DispatchContext; clueGraceMs?: number }): Hub {
  let state = emptyState()
  /** New every start: pages that see it change reload to pick up the new build. */
  const serverId = randomUUID()
  /** Pending grace-period check for a waiting clue whose checker is offline. */
  let clueTimer: ReturnType<typeof setTimeout> | null = null
  const picturesAvailable = opts.ctx.pictures.length >= DECKS.pictures.size
  const conns = new Map<HubSocket, Conn>()

  const send = (socket: HubSocket, msg: ServerMessage) => socket.send(JSON.stringify(msg))

  const viewerOf = (conn: Conn): Viewer =>
    conn.client === 'tv'
      ? { kind: 'tv', host: conn.host }
      : conn.seatId
        ? { kind: 'player', seatId: conn.seatId }
        : { kind: 'spectator' }

  /**
   * A waiting clue whose checker dropped (a refresh, a locked phone) gets a
   * grace period to come back before it goes through. Re-checked on every
   * broadcast, so one timer covers drops, returns and new clues.
   */
  const armClueTimer = () => {
    if (!awaitingReturn(state)) {
      if (clueTimer) clearTimeout(clueTimer)
      clueTimer = null
      return
    }
    clueTimer ??= setTimeout(() => {
      clueTimer = null
      const next = expireClue(state)
      if (next !== state) {
        state = next
        broadcast()
      }
    }, opts.clueGraceMs ?? 15_000)
    // Never hold the process open just for this.
    clueTimer.unref?.()
  }

  const broadcast = () => {
    armClueTimer()
    for (const [socket, conn] of conns) {
      if (!conn.client) continue
      send(socket, { type: 'state', ...viewFor(state, viewerOf(conn), opts.joinUrl, picturesAvailable), server: serverId })
    }
  }

  function handle(socket: HubSocket, conn: Conn, raw: string) {
    const msg = parseClientMessage(raw)

    if (!conn.client) {
      if (msg.type !== 'hello') throw new GameError('bad-message', 'Say hello first')
      conn.client = msg.client
      if (msg.client === 'player' && msg.token) {
        const seat = seatByToken(state, msg.token)
        if (seat) {
          conn.seatId = seat.id
          state = settle(setConnected(state, seat.id, 1))
        }
      }
      broadcast()
      return
    }

    if (msg.type === 'join' && conn.client !== 'player') {
      throw new GameError('bad-message', "The TV can't join as a player")
    }
    const result = dispatch(state, { host: conn.host, seatId: conn.seatId }, msg, opts.ctx)
    state = result.state
    // addSeat counts the joining connection, so no extra setConnected here.
    if (result.seatId) conn.seatId = result.seatId
    if (result.reply) send(socket, result.reply)
    broadcast()
  }

  return {
    attach(socket, host) {
      const conn: Conn = { host, client: null, seatId: null, alive: true }
      conns.set(socket, conn)

      socket.on('message', (data) => {
        try {
          handle(socket, conn, String(data))
        } catch (e) {
          // One bad message must never end everyone's game: state is only
          // replaced after a handler succeeds, so it is unchanged here.
          if (e instanceof GameError) {
            send(socket, { type: 'error', code: e.code, message: e.message })
          } else {
            console.error('Unexpected error handling a message:', e)
            send(socket, { type: 'error', code: 'bad-message', message: 'Something went wrong' })
          }
        }
      })
      // Protocol errors (e.g. a malformed frame) are emitted here; ws closes the socket itself.
      socket.on('error', (err) => console.warn('Socket error:', err.message))
      socket.on('pong', () => {
        conn.alive = true
      })
      socket.on('close', () => {
        conns.delete(socket)
        if (conn.seatId) {
          state = settle(setConnected(state, conn.seatId, -1))
          broadcast()
        }
      })
    },

    heartbeat() {
      for (const [socket, conn] of conns) {
        if (!conn.alive) {
          socket.terminate()
          continue
        }
        conn.alive = false
        socket.ping()
      }
    },

    state: () => state,
  }
}
