import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameView, ServerMessage, You } from '../shared/protocol'
import { SEAT_STORAGE_KEY } from '../shared/protocol'
import { createConnection, type Snapshot } from './connection'

/** Stands in for the browser WebSocket; each instance records what was sent. */
class FakeSocket {
  static instances: FakeSocket[] = []
  url: string
  sent: unknown[] = []
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close() {
    this.closed = true
  }

  // Test controls ---------------------------------------------------------
  open() {
    this.onopen?.()
  }

  receive(msg: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }

  drop() {
    this.onclose?.()
  }
}

const latest = () => FakeSocket.instances[FakeSocket.instances.length - 1]

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    removeItem: vi.fn((k: string) => void data.delete(k)),
    data,
  }
}

function fakeWindow() {
  const target = new EventTarget()
  return {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    document: { visibilityState: 'visible' as DocumentVisibilityState },
  }
}

const view = { phase: { name: 'lobby' } } as unknown as GameView
const spectator: You = { kind: 'spectator' }
const player: You = { kind: 'player', id: 'p1', team: 'red', role: null, votes: [], votedEnd: false, pendingClue: null, rejectedClue: null }

function setup(opts: { client?: 'tv' | 'player'; stored?: Record<string, string> } = {}) {
  const storage = memoryStorage(opts.stored)
  const win = fakeWindow()
  const snapshots: Snapshot[] = []
  const conn = createConnection({
    url: 'ws://test/ws',
    client: opts.client ?? 'player',
    storage,
    onChange: (s) => snapshots.push(s),
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    win,
  })
  const last = () => snapshots[snapshots.length - 1]
  return { conn, storage, win, snapshots, last }
}

beforeEach(() => {
  FakeSocket.instances = []
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('hello', () => {
  it('sends hello with the stored token on open', () => {
    setup({ stored: { [SEAT_STORAGE_KEY]: 'abc' } })
    latest().open()
    expect(latest().sent).toEqual([{ type: 'hello', client: 'player', token: 'abc' }])
  })

  it('sends token null when none is stored', () => {
    setup()
    latest().open()
    expect(latest().sent).toEqual([{ type: 'hello', client: 'player', token: null }])
  })

  it('sends a TV hello without a token', () => {
    setup({ client: 'tv' })
    latest().open()
    expect(latest().sent).toEqual([{ type: 'hello', client: 'tv' }])
  })

  it('connects to the given url', () => {
    setup()
    expect(latest().url).toBe('ws://test/ws')
  })
})

describe('seat token', () => {
  it('stores the token from welcome', () => {
    const { storage } = setup()
    latest().open()
    latest().receive({ type: 'welcome', token: 'new-token', playerId: 'p1' })
    expect(storage.setItem).toHaveBeenCalledWith(SEAT_STORAGE_KEY, 'new-token')
  })

  it('forgets a token the server no longer knows', () => {
    const { storage } = setup({ stored: { [SEAT_STORAGE_KEY]: 'old' } })
    latest().open()
    latest().receive({ type: 'state', view, you: spectator })
    expect(storage.removeItem).toHaveBeenCalledTimes(1)
    expect(storage.removeItem).toHaveBeenCalledWith(SEAT_STORAGE_KEY)

    // Still a spectator on later broadcasts: nothing more to forget.
    latest().receive({ type: 'state', view, you: spectator })
    expect(storage.removeItem).toHaveBeenCalledTimes(1)

    // And the next reconnect no longer presents the stale token.
    latest().drop()
    vi.advanceTimersByTime(500)
    latest().open()
    expect(latest().sent).toEqual([{ type: 'hello', client: 'player', token: null }])
    latest().receive({ type: 'state', view, you: spectator })
    expect(storage.removeItem).toHaveBeenCalledTimes(1)
  })

  it('keeps a token the server recognises', () => {
    const { storage } = setup({ stored: { [SEAT_STORAGE_KEY]: 'good' } })
    latest().open()
    latest().receive({ type: 'state', view, you: player })
    expect(storage.removeItem).not.toHaveBeenCalled()
  })
})

describe('reconnect', () => {
  it('reconnects with backoff 500, 1000, 2000, 4000, 5000, 5000 ms', () => {
    setup()
    latest().drop()
    for (const delay of [500, 1000, 2000, 4000, 5000, 5000]) {
      const before = FakeSocket.instances.length
      vi.advanceTimersByTime(delay - 1)
      expect(FakeSocket.instances.length).toBe(before)
      vi.advanceTimersByTime(1)
      expect(FakeSocket.instances.length).toBe(before + 1)
      latest().drop()
    }
  })

  it('resets backoff after a successful open', () => {
    setup()
    latest().drop()
    vi.advanceTimersByTime(500)
    latest().drop()
    vi.advanceTimersByTime(1000)
    latest().open()
    latest().drop()

    const before = FakeSocket.instances.length
    vi.advanceTimersByTime(500)
    expect(FakeSocket.instances.length).toBe(before + 1)
  })

  it('reconnects immediately on visibilitychange to visible', () => {
    const { win } = setup()
    latest().drop()
    const before = FakeSocket.instances.length
    win.document.visibilityState = 'visible'
    win.dispatchEvent(new Event('visibilitychange'))
    expect(FakeSocket.instances.length).toBe(before + 1)

    // The pending backoff timer doesn't open a second socket.
    vi.advanceTimersByTime(10_000)
    expect(FakeSocket.instances.length).toBe(before + 1)
  })

  it('reconnects immediately when the browser comes back online', () => {
    const { win } = setup()
    latest().drop()
    const before = FakeSocket.instances.length
    win.dispatchEvent(new Event('online'))
    expect(FakeSocket.instances.length).toBe(before + 1)
  })

  it('does not reconnect on visibilitychange while the page is hidden', () => {
    const { win } = setup()
    latest().drop()
    const before = FakeSocket.instances.length
    win.document.visibilityState = 'hidden'
    win.dispatchEvent(new Event('visibilitychange'))
    expect(FakeSocket.instances.length).toBe(before)
  })

  it('does not open a second socket while one is already open', () => {
    const { win } = setup()
    latest().open()
    win.dispatchEvent(new Event('visibilitychange'))
    win.dispatchEvent(new Event('online'))
    expect(FakeSocket.instances.length).toBe(1)
  })

  it('stops for good after close()', () => {
    const { conn, win } = setup()
    latest().open()
    conn.close()
    expect(latest().closed).toBe(true)
    latest().drop()
    vi.advanceTimersByTime(10_000)
    win.dispatchEvent(new Event('online'))
    expect(FakeSocket.instances.length).toBe(1)
  })
})

describe('snapshot', () => {
  it('status goes connecting → open → reconnecting', () => {
    const { snapshots, last } = setup()
    expect(snapshots[0].status).toBe('connecting')
    latest().open()
    expect(last().status).toBe('open')
    latest().drop()
    expect(last().status).toBe('reconnecting')
  })

  it('a state frame sets view and you', () => {
    const { last } = setup()
    latest().open()
    latest().receive({ type: 'state', view, you: player })
    expect(last().view).toEqual(view)
    expect(last().you).toEqual(player)
  })

  it('an error frame sets snapshot.error, cleared by the next state', () => {
    const { last } = setup()
    latest().open()
    latest().receive({ type: 'error', code: 'name-taken', message: 'That name is taken' })
    expect(last().error).toEqual({ code: 'name-taken', message: 'That name is taken' })
    latest().receive({ type: 'state', view, you: spectator })
    expect(last().error).toBeNull()
  })

  it('keeps the last view while reconnecting', () => {
    const { last } = setup()
    latest().open()
    latest().receive({ type: 'state', view, you: player })
    latest().drop()
    expect(last().view).toEqual(view)
  })

  it('ignores frames that are not JSON', () => {
    const { snapshots } = setup()
    latest().open()
    const count = snapshots.length
    latest().onmessage?.({ data: 'not json' })
    expect(snapshots.length).toBe(count)
  })
})

describe('send', () => {
  it('sends while open', () => {
    const { conn } = setup()
    latest().open()
    conn.send({ type: 'vote', card: 3 })
    expect(latest().sent).toContainEqual({ type: 'vote', card: 3 })
  })

  it('drops messages while not open', () => {
    const { conn } = setup()
    conn.send({ type: 'vote', card: 3 })
    latest().open()
    latest().drop()
    conn.send({ type: 'vote', card: 4 })
    expect(FakeSocket.instances.flatMap((s) => s.sent)).toEqual([
      { type: 'hello', client: 'player', token: null },
    ])
  })
})
