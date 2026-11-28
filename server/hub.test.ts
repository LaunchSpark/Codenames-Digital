import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { seededRandom } from './game/random'
import { WORDS } from './game/words'
import { createHub, type HubSocket } from './hub'

class FakeSocket extends EventEmitter implements HubSocket {
  sent: unknown[] = []
  pings = 0
  terminated = false
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  ping() {
    this.pings++
  }
  terminate() {
    this.terminated = true
    this.emit('close')
  }
}

const hub = () =>
  createHub({
    joinUrl: 'http://test/',
    ctx: { words: WORDS, pictures: [], rand: seededRandom(1), newId: () => 'p1', newToken: () => 't1' },
  })

describe('server id', () => {
  it('stamps every state with an id that changes when the server restarts', () => {
    const ids = [hub(), hub()].map((h) => {
      const tv = new FakeSocket()
      h.attach(tv, true)
      tv.emit('message', JSON.stringify({ type: 'hello', client: 'tv' }))
      const state = (tv.sent as { type: string; server?: string }[]).find((m) => m.type === 'state')!
      return state.server as string
    })
    expect(ids[0]).toMatch(/\S/)
    expect(ids[0]).not.toBe(ids[1])
  })
})

describe('hub resilience', () => {
  it('survives a socket error such as a malformed frame', () => {
    const h = hub()
    const phone = new FakeSocket()
    h.attach(phone, false)
    expect(() => phone.emit('error', new Error('Invalid UTF-8 sequence'))).not.toThrow()
  })

  it('answers an unexpected internal error with bad-message and keeps the state', () => {
    const h = createHub({
      joinUrl: 'http://test/',
      ctx: {
        words: WORDS,
        pictures: [],
        rand: seededRandom(1),
        newId: () => {
          throw new TypeError('boom')
        },
        newToken: () => 't1',
      },
    })
    const phone = new FakeSocket()
    h.attach(phone, false)
    phone.emit('message', JSON.stringify({ type: 'hello', client: 'player', token: null }))
    const before = h.state()
    expect(() => phone.emit('message', JSON.stringify({ type: 'join', name: 'ann', team: 'red' }))).not.toThrow()
    expect(phone.sent.at(-1)).toMatchObject({ type: 'error', code: 'bad-message' })
    expect(h.state()).toBe(before)
  })
})

describe('hub seats', () => {
  it('does not let a TV connection take a seat', () => {
    const h = hub()
    const tv = new FakeSocket()
    h.attach(tv, true)
    tv.emit('message', JSON.stringify({ type: 'hello', client: 'tv' }))
    tv.emit('message', JSON.stringify({ type: 'join', name: 'ann', team: 'red' }))
    expect(tv.sent.at(-1)).toMatchObject({ type: 'error', code: 'bad-message' })
    expect(h.state().roster.seats).toEqual({})
  })
})

describe('hub heartbeat', () => {
  it('drops a socket that misses a ping, freeing its seat', () => {
    const h = hub()
    const phone = new FakeSocket()
    h.attach(phone, false)
    phone.emit('message', JSON.stringify({ type: 'hello', client: 'player', token: null }))
    phone.emit('message', JSON.stringify({ type: 'join', name: 'ann', team: 'red' }))
    expect(h.state().roster.seats.p1.connections).toBe(1)

    h.heartbeat()
    expect(phone.pings).toBe(1)
    h.heartbeat() // no pong in between: the phone is gone
    expect(phone.terminated).toBe(true)
    expect(h.state().roster.seats.p1.connections).toBe(0)
  })

  it('keeps a socket that answers its pings', () => {
    const h = hub()
    const tv = new FakeSocket()
    h.attach(tv, true)
    for (let i = 0; i < 3; i++) {
      h.heartbeat()
      tv.emit('pong')
    }
    expect(tv.terminated).toBe(false)
    expect(tv.pings).toBe(3)
  })
})
