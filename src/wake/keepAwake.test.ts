// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const instances: { enable: ReturnType<typeof vi.fn>; isEnabled: boolean }[] = []

vi.mock('nosleep.js', () => ({
  default: class {
    isEnabled = false
    enable = vi.fn(() => {
      this.isEnabled = true
      return Promise.resolve()
    })
    disable = vi.fn()
    constructor() {
      instances.push(this)
    }
  },
}))

async function load() {
  vi.resetModules()
  instances.length = 0
  return (await import('./keepAwake')).keepAwake
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

const tap = () => document.dispatchEvent(new Event('pointerdown'))

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

describe('keepAwake', () => {
  it('enables once however often it is called', async () => {
    const keepAwake = await load()
    keepAwake()
    keepAwake()
    keepAwake()
    expect(instances).toHaveLength(1)
    expect(instances[0].enable).toHaveBeenCalledTimes(1)
  })

  it('enables synchronously inside the calling gesture', async () => {
    const keepAwake = await load()
    keepAwake()
    expect(instances[0].enable).toHaveBeenCalledTimes(1)
  })

  it("re-arms on the next tap after the page comes back", async () => {
    const keepAwake = await load()
    keepAwake()
    const ns = instances[0]
    ns.isEnabled = false

    setVisibility('hidden')
    setVisibility('visible')
    expect(ns.enable).toHaveBeenCalledTimes(1)

    tap()
    expect(ns.enable).toHaveBeenCalledTimes(2)
    tap()
    expect(ns.enable).toHaveBeenCalledTimes(2)
  })

  it('re-arms even while NoSleep still reports enabled (paused video fallback)', async () => {
    const keepAwake = await load()
    keepAwake()
    const ns = instances[0]
    expect(ns.isEnabled).toBe(true)

    setVisibility('hidden')
    setVisibility('visible')
    tap()
    expect(ns.enable).toHaveBeenCalledTimes(2)
  })

  it('arms only one listener for repeated visibility events', async () => {
    const keepAwake = await load()
    keepAwake()
    const ns = instances[0]
    setVisibility('visible')
    setVisibility('visible')
    tap()
    tap()
    expect(ns.enable).toHaveBeenCalledTimes(2)
  })

  it('does nothing before the first call', async () => {
    await load()
    setVisibility('visible')
    tap()
    expect(instances).toHaveLength(0)
  })

  it('swallows an enable rejection', async () => {
    const keepAwake = await load()
    keepAwake()
    const ns = instances[0]
    ns.isEnabled = false
    ns.enable.mockImplementationOnce(() => Promise.reject(new Error('NotAllowedError')))
    setVisibility('visible')
    expect(() => tap()).not.toThrow()
    await Promise.resolve()
  })
})
