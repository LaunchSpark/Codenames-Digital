/**
 * A whole table on one laptop: the game server, a TV window and one Chromium
 * per phone. Each phone is its own browser, so each keeps its own seat token,
 * just like separate devices.
 *
 * Phones load the LAN address and the TV loads localhost, so only the TV is
 * the host — the same split as a real game night.
 */
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { chromium, devices, type Browser, type Page } from 'playwright'
import type { Team } from '../src/shared/protocol'
import { startServer } from '../server/index'
import { pickLanAddress } from '../server/lan'

export const NAMES = ['Ann', 'Ben', 'Cy', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo']

/** Joiners alternate teams: Ann red, Ben blue, Cy red, ... */
export const teamOf = (i: number): Team => (i % 2 === 0 ? 'red' : 'blue')

export interface TableOptions {
  phones: number
  headless: boolean
  port?: number
  /** Top-left of the TV window and of the first phone window (headed only). */
  tvAt?: [number, number]
  phonesAt?: [number, number]
  /** Seeded so tests get the same board every run. */
  rand?: () => number
  /** Word pool the server deals from (read at each deal, so it can be refilled). */
  words?: readonly string[]
}

export interface Phone {
  name: string
  team: Team
  page: Page
  browser: Browser
}

export interface Table {
  joinUrl: string
  tvUrl: string
  tv: Page
  phones: Phone[]
  /** Stops the server only (phones and TV stay open), to test a restart. */
  restartServer(): Promise<void>
  close(): Promise<void>
}

/**
 * E2E_CHANNEL=chrome runs the tests in the installed Chrome instead of
 * Playwright's own Chromium (which no longer supports macOS 12).
 */
export const BROWSER_CHANNEL = process.env.E2E_CHANNEL || undefined

const PHONE = devices['Pixel 7']
const PHONE_WINDOW = { w: 460, h: 990 }

export async function openTable(opts: TableOptions): Promise<Table> {
  const port = opts.port ?? 3100
  const ip = pickLanAddress(networkInterfaces()) ?? 'localhost'
  const joinUrl = `http://${ip}:${port}/`
  const tvUrl = `http://localhost:${port}/tv`
  const staticDir = fileURLToPath(new URL('../dist', import.meta.url))
  const ctx = { ...(opts.rand && { rand: opts.rand }), ...(opts.words && { words: opts.words }) }
  const serverOpts = { port, joinUrl, staticDir, ctx }
  let server = await startServer(serverOpts)

  const browsers: Browser[] = []
  const launch = async (x: number, y: number, w: number, h: number) => {
    const browser = await chromium.launch({
      channel: BROWSER_CHANNEL,
      headless: opts.headless,
      args: opts.headless ? [] : [`--window-position=${x},${y}`, `--window-size=${w},${h}`],
    })
    browsers.push(browser)
    return browser
  }

  const [tvX, tvY] = opts.tvAt ?? [0, 0]
  const tvBrowser = await launch(tvX, tvY, 1920, 1040)
  const tvContext = await tvBrowser.newContext(opts.headless ? { viewport: { width: 1920, height: 1080 } } : { viewport: null })
  const tv = await tvContext.newPage()
  await tv.goto(tvUrl)

  const [px, py] = opts.phonesAt ?? [1920, 0]
  const perRow = 4
  const phones: Phone[] = []
  for (let i = 0; i < opts.phones; i++) {
    const row = Math.floor(i / perRow)
    // Extra rows cascade slightly so every window's title bar stays reachable.
    const x = px + (i % perRow) * PHONE_WINDOW.w + row * 40
    const y = py + row * 60
    const browser = await launch(x, y, PHONE_WINDOW.w, PHONE_WINDOW.h)
    const page = await (await browser.newContext({ ...PHONE })).newPage()
    await page.goto(joinUrl)
    phones.push({ name: NAMES[i % NAMES.length] + (i >= NAMES.length ? i : ''), team: teamOf(i), page, browser })
  }

  return {
    joinUrl,
    tvUrl,
    tv,
    phones,
    async restartServer() {
      await server.close()
      server = await startServer(serverOpts)
    },
    async close() {
      await Promise.all(browsers.map((b) => b.close().catch(() => {})))
      await server.close()
    },
  }
}

/** Types the phone's name and taps its team. */
export async function join(phone: Phone) {
  await phone.page.getByLabel('Your name').fill(phone.name)
  await phone.page.getByRole('button', { name: `Join ${phone.team === 'red' ? 'Red' : 'Blue'}` }).click()
}
