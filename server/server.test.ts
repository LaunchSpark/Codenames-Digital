import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import type { ClientMessage, GameView, ServerMessage, You } from '../src/shared/protocol'
import { seededRandom } from './game/random'
import { startServer } from './index'

type State = Extract<ServerMessage, { type: 'state' }>

/** A test client that records every frame and can wait for one matching a predicate. */
class Client {
  readonly frames: ServerMessage[] = []
  private cursor = 0
  private waiters: (() => void)[] = []
  readonly ws: WebSocket

  private constructor(ws: WebSocket) {
    this.ws = ws
    ws.on('message', (raw) => {
      this.frames.push(JSON.parse(String(raw)))
      for (const w of this.waiters.splice(0)) w()
    })
  }

  static async open(port: number): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    await new Promise((resolve, reject) => ws.once('open', resolve).once('error', reject))
    return new Client(ws)
  }

  send(msg: ClientMessage | string) {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }

  /** Next frame (after the last one waited for) matching the predicate. */
  async waitFor<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, ms?: number): Promise<T>
  async waitFor(pred: (m: ServerMessage) => boolean, ms?: number): Promise<ServerMessage>
  async waitFor(pred: (m: ServerMessage) => boolean, ms = 2000): Promise<ServerMessage> {
    const deadline = Date.now() + ms
    for (;;) {
      for (; this.cursor < this.frames.length; this.cursor++) {
        const m = this.frames[this.cursor]
        if (pred(m)) {
          this.cursor++
          return m
        }
      }
      if (Date.now() > deadline) throw new Error('Timed out waiting for a frame')
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve)
        setTimeout(resolve, 50)
      })
    }
  }

  state(pred: (s: State) => boolean = () => true): Promise<State> {
    return this.waitFor((m): m is State => m.type === 'state' && pred(m))
  }

  async close() {
    if (this.ws.readyState === WebSocket.CLOSED) return
    await new Promise((resolve) => {
      this.ws.once('close', resolve)
      this.ws.close()
    })
  }
}

const isPlayer = (you: You, id?: string) => you.kind === 'player' && (id === undefined || you.id === id)
const leaks = (v: GameView) => (v.board ?? []).filter((c) => !c.revealed && c.color !== null)

let server: Awaited<ReturnType<typeof startServer>>
const clients: Client[] = []

async function boot() {
  server = await startServer({ port: 0, joinUrl: 'http://test/', ctx: { rand: seededRandom(3) } })
}

async function open() {
  const c = await Client.open(server.port)
  clients.push(c)
  return c
}

async function joinPlayer(name: string, team: 'red' | 'blue') {
  const c = await open()
  c.send({ type: 'hello', client: 'player', token: null })
  await c.state()
  c.send({ type: 'join', name, team })
  const welcome = await c.waitFor((m): m is Extract<ServerMessage, { type: 'welcome' }> => m.type === 'welcome')
  await c.state((s) => isPlayer(s.you, welcome.playerId))
  return { c, ...welcome }
}

/**
 * Three players per team, game started. Returns the starting team's clue-giver
 * and two guessers, plus a guesser on the other team.
 */
async function startedTable() {
  const tv = await open()
  tv.send({ type: 'hello', client: 'tv' })
  await tv.state()
  const red = [await joinPlayer('ann', 'red'), await joinPlayer('bob', 'red'), await joinPlayer('cy', 'red')]
  const blue = [await joinPlayer('dee', 'blue'), await joinPlayer('eve', 'blue'), await joinPlayer('fay', 'blue')]
  tv.send({ type: 'host:start' })
  const started = await tv.state((s) => s.view.phase.name === 'clue')
  const team = started.view.startingTeam!
  const [mine, theirs] = team === 'red' ? [red, blue] : [blue, red]
  return { tv, team, giver: mine[0], guessers: [mine[1], mine[2]], otherGuesser: theirs[1] }
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()))
  await server?.close()
})

describe('game server', () => {
  it('sends a TV the lobby after hello', async () => {
    await boot()
    const tv = await open()
    tv.send({ type: 'hello', client: 'tv' })
    const s = await tv.state()
    expect(s.view.phase).toEqual({ name: 'lobby' })
    expect(s.you).toEqual({ kind: 'tv', host: true })
    expect(s.view.joinUrl).toBe('http://test/')
  })

  it('restores the seat when a phone reconnects with its token', async () => {
    await boot()
    const { c, token, playerId } = await joinPlayer('ann', 'red')
    await c.close()
    const again = await open()
    again.send({ type: 'hello', client: 'player', token })
    const s = await again.state()
    expect(s.you).toMatchObject({ kind: 'player', id: playerId, team: 'red' })
    expect(s.view.teams.red.players).toEqual([{ id: playerId, name: 'ann', team: 'red', connected: true }])
  })

  it('treats an unknown token (server restarted) as a spectator', async () => {
    await boot()
    const c = await open()
    c.send({ type: 'hello', client: 'player', token: 'from-before-the-restart' })
    expect((await c.state()).you).toEqual({ kind: 'spectator' })
  })

  it('keeps a seat connected, and its vote, until its last socket closes', async () => {
    await boot()
    const { team, giver, guessers } = await startedTable()
    const [me, teammate] = guessers

    const second = await open()
    second.send({ type: 'hello', client: 'player', token: me.token })
    await second.state((s) => isPlayer(s.you, me.playerId))

    giver.c.send({ type: 'clue', word: 'zzyzx', number: 2 })
    await me.c.state((s) => s.view.phase.name === 'guess')
    me.c.send({ type: 'vote', card: 0 })
    await me.c.state((s) => s.you.kind === 'player' && s.you.votes[0] === 0)

    await second.close()
    // Wait for the broadcast caused by the closed socket, seen by the teammate.
    await teammate.c.state((s) => s.view.board![0].votes === 1)
    const after = await me.c.state((s) => s.view.voterCount === 2)
    expect(after.you).toMatchObject({ votes: [0] })
    expect(after.view.teams[team].players.find((p) => p.id === me.playerId)!.connected).toBe(true)

    await me.c.close()
    const gone = await teammate.c.state((s) => s.view.voterCount === 1)
    expect(gone.view.board![0].votes).toBe(0)
  })

  it('never sends a guesser the colour of an unrevealed card', async () => {
    await boot()
    const { giver, guessers, otherGuesser } = await startedTable()

    giver.c.send({ type: 'clue', word: 'zzyzx', number: 2 })
    await guessers[0].c.state((s) => s.view.phase.name === 'guess')
    for (const g of guessers) g.c.send({ type: 'vote', card: 0 })
    await otherGuesser.c.state((s) => s.view.board?.[0].revealed === true)

    for (const who of [...guessers, otherGuesser]) {
      for (const f of who.c.frames) {
        if (f.type === 'state' && f.view.phase.name !== 'over') expect(leaks(f.view)).toEqual([])
      }
    }
    expect(JSON.stringify(giver.c.frames)).toContain('"color":"assassin"')
  })

  it('answers bad JSON with bad-message and changes nothing', async () => {
    await boot()
    const tv = await open()
    tv.send({ type: 'hello', client: 'tv' })
    await tv.state()
    tv.send('{not json')
    const err = await tv.waitFor((m) => m.type === 'error')
    expect(err).toMatchObject({ type: 'error', code: 'bad-message' })
  })

  it('requires hello first', async () => {
    await boot()
    const c = await open()
    c.send({ type: 'host:start' })
    expect(await c.waitFor((m) => m.type === 'error')).toMatchObject({ code: 'bad-message' })
  })
})

describe('static files', () => {
  it('survives the client being rebuilt underneath it', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'codenames-static-'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><p>app</p>')
    writeFileSync(join(dir, 'old.css'), 'p{}')
    server = await startServer({ port: 0, joinUrl: 'http://test/', staticDir: dir })
    const url = (p: string) => `http://127.0.0.1:${server.port}/${p}`

    expect((await fetch(url('old.css'))).status).toBe(200)
    rmSync(join(dir, 'old.css')) // a rebuild replaces hashed assets
    writeFileSync(join(dir, 'new.css'), 'p{}')

    expect((await fetch(url('old.css'))).status).toBe(404)
    expect((await fetch(url('new.css'))).status).toBe(200)
    expect(await (await fetch(url('tv'))).text()).toContain('app')
    rmSync(dir, { recursive: true, force: true })
  })
})
