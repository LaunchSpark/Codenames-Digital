import type { ServerMessage } from '../src/shared/protocol'
import { dispatch, parseClientMessage, type DispatchContext } from './game/dispatch'
import { emptyState, seatByToken, setConnected } from './game/roster'
import { settleVotes } from './game/rules'
import { GameError, type ServerState } from './game/state'
import { viewFor, type Viewer } from './game/views'

/** The parts of a `ws` WebSocket the hub uses — small enough to fake in tests. */
export interface HubSocket {
  send(data: string): void
  on(event: 'message', fn: (data: unknown) => void): unknown
  on(event: 'close' | 'pong', fn: () => void): unknown
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

export function createHub(opts: { joinUrl: string; ctx: DispatchContext }): Hub {
  let state = emptyState()
  const conns = new Map<HubSocket, Conn>()

  const send = (socket: HubSocket, msg: ServerMessage) => socket.send(JSON.stringify(msg))

  const viewerOf = (conn: Conn): Viewer =>
    conn.client === 'tv'
      ? { kind: 'tv', host: conn.host }
      : conn.seatId
        ? { kind: 'player', seatId: conn.seatId }
        : { kind: 'spectator' }

  const broadcast = () => {
    for (const [socket, conn] of conns) {
      if (!conn.client) continue
      send(socket, { type: 'state', ...viewFor(state, viewerOf(conn), opts.joinUrl) })
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
          state = settleVotes(setConnected(state, seat.id, 1))
        }
      }
      broadcast()
      return
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
          if (!(e instanceof GameError)) throw e
          send(socket, { type: 'error', code: e.code, message: e.message })
        }
      })
      socket.on('pong', () => {
        conn.alive = true
      })
      socket.on('close', () => {
        conns.delete(socket)
        if (conn.seatId) {
          state = settleVotes(setConnected(state, conn.seatId, -1))
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
