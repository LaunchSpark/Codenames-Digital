/**
 * Phones shouldn't scroll: every phone screen fits a 390x664 or 360x640
 * viewport (the visible area of an ordinary phone with browser bars showing).
 * Uses the app's ?mock= fixtures, so no game needs to be played.
 */
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startServer } from '../server/index'

const SCREENS = [
  'phone-spectator-lobby',
  'phone-spectator-midgame',
  'phone-lobby',
  'phone-cluegiver-clue',
  'phone-cluegiver-waiting',
  'phone-guesser-guess',
  'phone-guesser-waiting',
  'phone-over',
]
const SIZES = [
  { width: 390, height: 664 },
  { width: 360, height: 640 },
]

let browser: Browser
let server: Awaited<ReturnType<typeof startServer>>

beforeAll(async () => {
  server = await startServer({ port: 0, joinUrl: 'http://x/', staticDir: fileURLToPath(new URL('../dist', import.meta.url)) })
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
  await server?.close()
})

describe('phone screens fit without scrolling', () => {
  for (const size of SIZES) {
    it(`at ${size.width}x${size.height}`, async () => {
      const page = await (await browser.newContext({ viewport: size, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage()
      const tooTall: string[] = []
      for (const fx of SCREENS) {
        await page.goto(`http://localhost:${server.port}/?mock=${fx}`)
        await page.waitForTimeout(100)
        const h = await page.evaluate('document.documentElement.scrollHeight')
        if (Number(h) > size.height) tooTall.push(`${fx}: ${h}px`)
      }
      expect(tooTall).toEqual([])
    })
  }

  it('keeps the Join buttons above an open keyboard (top half of a 360x640 phone)', async () => {
    const size = { width: 360, height: 640 }
    const page = await (await browser.newContext({ viewport: size, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage()
    for (const fx of ['phone-spectator-lobby', 'phone-spectator-midgame']) {
      await page.goto(`http://localhost:${server.port}/?mock=${fx}`)
      for (const team of ['Red', 'Blue']) {
        const box = await page.getByRole('button', { name: `Join ${team}` }).boundingBox()
        expect(box!.y + box!.height, `${fx} Join ${team}`).toBeLessThanOrEqual(size.height / 2)
      }
    }
  })
})
