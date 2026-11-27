import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import sirv from 'sirv'
import { WebSocketServer } from 'ws'
import { WS_PATH } from '../src/shared/protocol'
import type { DispatchContext } from './game/dispatch'
import { WORDS } from './game/words'
import { createHub } from './hub'
import { isHostRequest } from './lan'

export interface ServerOptions {
  port: number
  joinUrl: string
  /** Built client to serve (dist/); omitted in tests and when Vite serves the client. */
  staticDir?: string
  ctx?: Partial<DispatchContext>
  heartbeatMs?: number
}

export async function startServer(opts: ServerOptions): Promise<{ port: number; close(): Promise<void> }> {
  const ctx: DispatchContext = {
    words: WORDS,
    pictures: [],
    rand: Math.random,
    newId: () => randomUUID(),
    newToken: () => randomBytes(16).toString('hex'),
    ...opts.ctx,
  }
  const hub = createHub({ joinUrl: opts.joinUrl, ctx })
  // dev: look files up per request instead of caching the list at startup, so
  // rebuilding dist/ while hosting can't make a request hit a vanished file.
  const serve = opts.staticDir ? sirv(opts.staticDir, { single: true, dev: true }) : null

  const server = createServer((req, res) => {
    const notFound = () => {
      res.statusCode = 404
      res.end('Not found')
    }
    if (serve) serve(req, res, notFound)
    else notFound()
  })

  // Every real message is well under 1 KiB; the 100 MiB default invites abuse.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 })
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== WS_PATH) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => hub.attach(ws, isHostRequest(req)))
  })

  const timer = setInterval(() => hub.heartbeat(), opts.heartbeatMs ?? 10_000)

  await new Promise<void>((resolve) => server.listen(opts.port, resolve))

  return {
    port: (server.address() as AddressInfo).port,
    async close() {
      clearInterval(timer)
      for (const ws of wss.clients) ws.terminate()
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
    },
  }
}
