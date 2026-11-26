/**
 * End-to-end: the real server, a headless TV and six headless phones, walking
 * the Track B integration checklist. Run with `npm run e2e`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { Team } from '../src/shared/protocol'
import { seededRandom } from '../server/game/random'
import { join, openTable, type Phone, type Table } from './harness'

const cards = (page: Page) => page.locator('.word-grid .word')
const card = (page: Page, i: number) => cards(page).nth(i)
const other = (t: Team): Team => (t === 'red' ? 'blue' : 'red')

/** Indexes of unrevealed cards of a colour, read off a clue-giver's phone. */
async function keyIndexes(page: Page, color: string): Promise<number[]> {
  const classes = await cards(page).evaluateAll((els) => els.map((e) => e.className))
  return classes.flatMap((c, i) => (c.includes(`word--${color}`) && !c.includes('word--revealed') ? [i] : []))
}

async function waitRevealed(page: Page, i: number) {
  await expect.poll(() => card(page, i).getAttribute('class')).toContain('word--revealed')
}

async function giveClue(giver: Phone, word: string, number: number) {
  await giver.page.getByLabel('Clue').fill(word)
  await giver.page.getByLabel('Number').selectOption(String(number))
  await giver.page.getByRole('button', { name: /give clue/i }).click()
}

let table: Table
let byTeam: Record<Team, { giver: Phone; guessers: Phone[] }>
let starting: Team

describe('VS game night, end to end', () => {
  beforeAll(async () => {
    table = await openTable({ phones: 6, headless: true, port: 3200, rand: seededRandom(11) })
  })
  afterAll(async () => table?.close())

  it('lobby shows the QR code and join address', async () => {
    await expect.poll(() => table.tv.getByAltText('Join QR code').count()).toBe(1)
    expect(await table.tv.getByText(table.joinUrl).count()).toBeGreaterThan(0)
  })

  it('six phones join, and the host starts the game', async () => {
    for (const phone of table.phones) await join(phone)
    for (const phone of table.phones) {
      await expect.poll(() => table.tv.getByText(phone.name, { exact: true }).count()).toBeGreaterThan(0)
    }
    await table.tv.getByRole('button', { name: 'Start' }).click()
    await expect.poll(() => cards(table.tv).count()).toBe(25)

    // First joiner on each team gives the clues: Ann (red) and Ben (blue).
    const team = (t: Team) => table.phones.filter((p) => p.team === t)
    byTeam = {
      red: { giver: team('red')[0], guessers: team('red').slice(1) },
      blue: { giver: team('blue')[0], guessers: team('blue').slice(1) },
    }
    await expect.poll(async () => (await byTeam.red.giver.page.getByLabel('Clue').count()) + (await byTeam.blue.giver.page.getByLabel('Clue').count())).toBe(1)
    starting = (await byTeam.red.giver.page.getByLabel('Clue').count()) ? 'red' : 'blue'
  })

  it('only clue-givers see the key', async () => {
    for (const t of ['red', 'blue'] as Team[]) {
      await expect.poll(() => byTeam[t].giver.page.locator('.word--unknown').count()).toBe(0)
      for (const g of byTeam[t].guessers) expect(await g.page.locator('.word--unknown').count()).toBe(25)
    }
    expect(await table.tv.locator('.word--unknown').count()).toBe(25)
  })

  it('a clue shows on the TV; pips fill per tap; the card reveals on agreement', async () => {
    const { giver, guessers } = byTeam[starting]
    await giveClue(giver, 'zzyzx', 2)
    await expect.poll(() => table.tv.getByText(/zzyzx/i).count()).toBeGreaterThan(0)

    const [own] = await keyIndexes(giver.page, starting)
    await card(guessers[0].page, own).click()
    await expect.poll(() => card(table.tv, own).locator('.pip--filled').count()).toBe(1)
    expect(await card(table.tv, own).getAttribute('class')).not.toContain('word--revealed')

    await card(guessers[1].page, own).click()
    await waitRevealed(table.tv, own)
  })

  it('a phone that reloads (woke from sleep) keeps its seat', async () => {
    const g = byTeam[starting].guessers[0]
    await g.page.reload()
    await expect.poll(() => cards(g.page).count()).toBe(25)
    expect(await g.page.getByLabel('Your name').count()).toBe(0)
  })

  it('a wrong card passes the turn, and the other clue-giver can undo it', async () => {
    const { giver, guessers } = byTeam[starting]
    const [neutral] = await keyIndexes(giver.page, 'neutral')
    for (const g of guessers) await card(g.page, neutral).click()
    await waitRevealed(table.tv, neutral)
    const next = byTeam[other(starting)].giver
    await expect.poll(() => next.page.getByLabel('Clue').count()).toBe(1)

    await next.page.getByRole('button', { name: 'Undo' }).click()
    await next.page.getByRole('group', { name: 'Confirm undo' }).getByRole('button', { name: /undo/i }).click()
    await expect.poll(() => card(table.tv, neutral).getAttribute('class')).not.toContain('word--revealed')
  })

  it('host menu: skip turn, then host undo brings it back', async () => {
    const tv = table.tv
    await tv.getByRole('button', { name: 'Host menu' }).click()
    await tv.getByRole('button', { name: 'Skip turn' }).click()
    await expect.poll(() => byTeam[other(starting)].giver.page.getByLabel('Clue').count()).toBe(1)

    await tv.getByRole('button', { name: 'Undo last move' }).click()
    // Back in the starting team's guess phase: its guessers can tap again.
    await expect.poll(() => byTeam[starting].guessers[0].page.locator('button.word').count()).toBeGreaterThan(0)
  })

  it('the assassin ends the game; host undo un-ends it; new game rotates clue-givers', async () => {
    const { giver, guessers } = byTeam[starting]
    const [assassin] = await keyIndexes(giver.page, 'assassin')
    for (const g of guessers) await card(g.page, assassin).click()
    await expect.poll(() => table.tv.getByText(/wins/).count()).toBeGreaterThan(0)

    await table.tv.getByRole('button', { name: 'Undo last move' }).click()
    await expect.poll(() => card(table.tv, assassin).getAttribute('class')).not.toContain('word--revealed')

    for (const g of guessers) await card(g.page, assassin).click()
    await table.tv.getByRole('button', { name: 'New game' }).click()
    // Second joiners now hold the key: Cy (red) and Dee (blue).
    for (const t of ['red', 'blue'] as Team[]) {
      await expect.poll(() => byTeam[t].guessers[0].page.locator('.word--unknown').count()).toBe(0)
      await expect.poll(() => byTeam[t].giver.page.locator('.word--unknown').count()).toBe(25)
    }
  })

  it('after a server restart, phones fall back to the join form', async () => {
    await table.restartServer()
    for (const phone of table.phones) {
      await expect.poll(() => phone.page.getByLabel('Your name').count(), { timeout: 15_000 }).toBe(1)
    }
  })
})
