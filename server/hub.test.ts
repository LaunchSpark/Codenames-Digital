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
    ctx: { words: WORDS, rand: seededRandom(1), newId: () => 'p1', newToken: () => 't1' },
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
