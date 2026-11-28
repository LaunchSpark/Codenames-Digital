/**
 * Every word in the list fits its card on one line: no "AMBULANC / E". Deals
 * the whole list, 25 words a game, and checks the TV and a guesser's phone at
 * common screen sizes.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { WORDS } from '../server/game/words'
import { WS_PATH } from '../src/shared/protocol'
import { join, openTable, type Table } from './harness'

const PORT = 3230
const TV_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
]
const PHONE_SIZES = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]

let table: Table
/** The server reads this at every deal; each batch refills it. */
const pool: string[] = []
let host: WebSocket

/**
 * Words on this page's board that take more lines than they have words. A
 * string, as e2e code is typechecked without DOM types (see fit.e2e.ts).
 */
const BROKEN_WORDS = `(async () => {
  // Let layout settle after a resize or a new board.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  return [...document.querySelectorAll('.word__text')].flatMap((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
    const text = el.textContent ?? ''
    return lines > text.split(/\\s+/).length ? [text.toUpperCase()] : []
  })
})()`
const brokenWords = (page: Page) => page.evaluate(BROKEN_WORDS) as Promise<string[]>

async function boardWords(page: Page) {
  return (await page.locator('.word__text').allInnerTexts()).map((w) => w.trim().toLowerCase()).sort()
}

describe('every word fits its card', () => {
  beforeAll(async () => {
    pool.push(...WORDS.slice(0, 25))
    table = await openTable({ phones: 4, headless: true, port: PORT, words: pool })
    for (const phone of table.phones) await join(phone)
    await table.tv.getByRole('button', { name: 'Start' }).click()
    // A second host connection deals new boards mid-game, which the TV only offers at game over.
    host = new WebSocket(`ws://localhost:${PORT}${WS_PATH}`)
    await new Promise((resolve, reject) => host.once('open', resolve).once('error', reject))
    host.send(JSON.stringify({ type: 'hello', client: 'tv' }))
  })
  afterAll(async () => {
    host?.close()
    await table?.close()
  })

  it('on the TV and a guesser phone, at every size', async () => {
    const broken = new Set<string>()
    for (let i = 0; i < WORDS.length; i += 25) {
      // Pad the last batch with words from the start of the list.
      const batch = [...WORDS.slice(i, i + 25), ...WORDS].slice(0, 25)
      pool.splice(0, pool.length, ...batch)
      host.send(JSON.stringify({ type: 'host:new-game' }))
      const want = [...batch].sort()
      await expect.poll(() => boardWords(table.tv)).toEqual(want)

      for (const size of TV_SIZES) {
        await table.tv.setViewportSize(size)
        for (const w of await brokenWords(table.tv)) broken.add(`${w} on TV ${size.width}x${size.height}`)
      }

      // Roles move each game, so find whoever is guessing (clue-givers see colours, not words).
      let guesser: Page | undefined
      await expect
        .poll(async () => {
          for (const p of table.phones) {
            if ((await boardWords(p.page)).join() === want.join()) return (guesser = p.page) && true
          }
          return false
        })
        .toBe(true)
      for (const size of PHONE_SIZES) {
        await guesser!.setViewportSize(size)
        for (const w of await brokenWords(guesser!)) broken.add(`${w} on phone ${size.width}x${size.height}`)
      }
    }
    expect([...broken]).toEqual([])
  })
})
