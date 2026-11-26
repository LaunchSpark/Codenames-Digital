import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage } from '../shared/protocol'
import { WS_PATH } from '../shared/protocol'
import { createConnection, type Connection, type ConnectionStatus, type Snapshot } from './connection'
import { FIXTURES, isFixtureName } from './fixtures'

export type Game = Snapshot & { send(msg: ClientMessage): void }

const STATUSES: ConnectionStatus[] = ['connecting', 'open', 'reconnecting']

/**
 * `?mock=<fixture>` swaps the server for a fixture, so screens can be built
 * without one; `&status=reconnecting` previews the disconnected state.
 */
function readMock(): Snapshot | null {
  const params = new URLSearchParams(location.search)
  const name = params.get('mock')
  if (!isFixtureName(name)) return null
  const status = params.get('status') as ConnectionStatus | null
  return {
    ...FIXTURES[name],
    status: status && STATUSES.includes(status) ? status : 'open',
    error: null,
  }
}

function wsUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}`
}

const INITIAL: Snapshot = { status: 'connecting', view: null, you: null, error: null }

/** The live game as this device sees it, plus a way to act on it. */
export function useGame(client: 'tv' | 'player'): Game {
  const [mock] = useState(readMock)
  const [snapshot, setSnapshot] = useState<Snapshot>(mock ?? INITIAL)
  const conn = useRef<Connection | null>(null)

  useEffect(() => {
    if (mock) return
    const c = createConnection({ url: wsUrl(), client, storage: localStorage, onChange: setSnapshot })
    conn.current = c
    return () => {
      c.close()
      if (conn.current === c) conn.current = null
    }
  }, [client, mock])

  const send = useCallback(
    (msg: ClientMessage) => {
      if (mock) console.info('[mock] send', msg)
      else conn.current?.send(msg)
    },
    [mock],
  )

  return { ...snapshot, send }
}
