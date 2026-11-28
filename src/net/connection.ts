import type { ClientMessage, ErrorCode, GameView, ServerMessage, You } from '../shared/protocol'
import { SEAT_STORAGE_KEY } from '../shared/protocol'

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting'

export interface Snapshot {
  status: ConnectionStatus
  view: GameView | null
  you: You | null
  error: { code: ErrorCode; message: string } | null
}

type Win = Pick<Window, 'addEventListener' | 'removeEventListener'> & {
  document: Pick<Document, 'visibilityState'>
  location: Pick<Location, 'reload'>
}

export interface ConnectionOptions {
  url: string
  client: 'tv' | 'player'
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  onChange: (s: Snapshot) => void
  WebSocketImpl?: typeof WebSocket
  win?: Win
}

export interface Connection {
  send(msg: ClientMessage): void
  close(): void
}

const BACKOFF_START_MS = 500
const BACKOFF_MAX_MS = 5000

/**
 * Owns one device's WebSocket to the game server: sends `hello` on every
 * (re)connect, keeps the seat token in storage, reconnects with backoff, and
 * reports a fresh Snapshot to `onChange` whenever anything changes.
 */
export function createConnection(opts: ConnectionOptions): Connection {
  const WS = opts.WebSocketImpl ?? WebSocket
  const win: Win = opts.win ?? window
  const { storage, client } = opts

  let snapshot: Snapshot = { status: 'connecting', view: null, you: null, error: null }
  let socket: WebSocket | null = null
  let isOpen = false
  let closed = false
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  /** Token presented in this connection's hello, until the server rejects it. */
  let helloToken: string | null = null
  /** The server instance this page has been talking to; a different one means it restarted. */
  let serverId: string | null = null

  const update = (patch: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...patch }
    opts.onChange(snapshot)
  }

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const handleMessage = (msg: ServerMessage) => {
    switch (msg.type) {
      case 'welcome':
        storage.setItem(SEAT_STORAGE_KEY, msg.token)
        break
      case 'state':
        // The server restarted, probably with a new build: reload rather than
        // keep running this page's old code against it.
        if (serverId !== null && msg.server !== serverId) {
          win.location.reload()
          return
        }
        serverId = msg.server
        if (msg.you.kind === 'spectator' && helloToken !== null) {
          // The server doesn't know our seat (e.g. it restarted): forget it.
          storage.removeItem(SEAT_STORAGE_KEY)
          helloToken = null
        }
        update({ view: msg.view, you: msg.you, error: null })
        break
      case 'error':
        update({ error: { code: msg.code, message: msg.message } })
        break
    }
  }

  const connect = () => {
    clearTimer()
    const ws = new WS(opts.url)
    socket = ws

    ws.onopen = () => {
      if (ws !== socket) return
      isOpen = true
      attempt = 0
      if (client === 'tv') {
        ws.send(JSON.stringify({ type: 'hello', client: 'tv' } satisfies ClientMessage))
      } else {
        helloToken = storage.getItem(SEAT_STORAGE_KEY)
        ws.send(
          JSON.stringify({
            type: 'hello',
            client: 'player',
            token: helloToken,
          } satisfies ClientMessage),
        )
      }
      update({ status: 'open' })
    }

    ws.onmessage = (e: MessageEvent) => {
      if (ws !== socket) return
      let msg: ServerMessage
      try {
        msg = JSON.parse(String(e.data))
      } catch {
        return
      }
      if (msg && typeof msg === 'object') handleMessage(msg)
    }

    ws.onclose = () => {
      if (ws !== socket || closed) return
      socket = null
      isOpen = false
      update({ status: 'reconnecting' })
      scheduleReconnect()
    }

    // Browsers follow an error with a close; reconnecting is handled there.
    ws.onerror = () => {}
  }

  const scheduleReconnect = () => {
    clearTimer()
    const delay = Math.min(BACKOFF_START_MS * 2 ** attempt, BACKOFF_MAX_MS)
    attempt++
    timer = setTimeout(connect, delay)
  }

  /** Skip the backoff wait when the device likely has a network again. */
  const reconnectNow = () => {
    if (closed || socket !== null) return
    connect()
  }

  const onVisibility = () => {
    if (win.document.visibilityState === 'visible') reconnectNow()
  }

  win.addEventListener('visibilitychange', onVisibility)
  win.addEventListener('online', reconnectNow)

  opts.onChange(snapshot)
  connect()

  return {
    send(msg) {
      if (!isOpen || !socket) return
      socket.send(JSON.stringify(msg))
    },
    close() {
      if (closed) return
      closed = true
      clearTimer()
      win.removeEventListener('visibilitychange', onVisibility)
      win.removeEventListener('online', reconnectNow)
      const ws = socket
      socket = null
      isOpen = false
      ws?.close()
    },
  }
}
