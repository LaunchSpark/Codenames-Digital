/**
 * No wiggles: the board must not move on any screen while play goes on around
 * it — phase changes, status text, error messages, confirmations.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { Team } from '../src/shared/protocol'
import { seededRandom } from '../server/game/random'
import { join, openTable, type Phone, type Table } from './harness'

let table: Table
const tops = new Map<Page, number[]>()

/** Records where the board sits on a page right now. */
async function snap(page: Page, label: string) {
  const box = await page.locator('.word-grid').boundingBox()
  if (!box) throw new Error(`no board on page at "${label}"`)
  const list = tops.get(page) ?? []
  list.push(Math.round(box.y))
  tops.set(page, list)
}

const pages = () => [table.tv, ...table.phones.map((p) => p.page)]
const snapAll = async (label: string) => {
  for (const p of pages()) await snap(p, label)
}
const settle = () => table.tv.waitForTimeout(250)

describe('layout stays put', () => {
  beforeAll(async () => {
    table = await openTable({ phones: 4, headless: true, port: 3210, rand: seededRandom(5) })
    for (const phone of table.phones) await join(phone)
    await table.tv.getByRole('button', { name: 'Start' }).click()
    await settle()
  })
  afterAll(async () => table?.close())

  it('the board never moves through a turn, an error, and an undo confirmation', async () => {
    const team = (t: Team) => table.phones.filter((p) => p.team === t)
    const givers = [team('red')[0], team('blue')[0]]
    const giver = (await givers[0].page.getByLabel('Clue').isVisible()) ? givers[0] : givers[1]
    const otherGiver = givers.find((g) => g !== giver)!
    const guesser = team(giver.team)[1]
    // Clue-givers see a colour-only key card, so take a board word from the TV.
    const word = (await table.tv.locator('.word-grid .word').first().innerText()).trim()

    // Tailwind's reset must not leave the in-game headings at normal weight.
    const weight = async (p: Page, sel: string) =>
      Number(await p.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).fontWeight`))
    expect(await weight(guesser.page, 'h1')).toBeGreaterThanOrEqual(600)
    expect(await weight(giver.page, 'h1')).toBeGreaterThanOrEqual(600)
    expect(await weight(table.tv, '.tv-clues h2')).toBeGreaterThanOrEqual(600)

    await snapAll('start')

    // A rejected clue shows an error message.
    await giver.page.getByLabel('Clue').fill(word)
    await giver.page.getByRole('button', { name: /give clue/i }).click()
    await expect.poll(() => giver.page.getByRole('alert').count()).toBe(1)
    await snapAll('error shown')

    await giver.page.getByLabel('Clue').fill('zzyzx')
    await giver.page.getByRole('button', { name: /give clue/i }).click()
    await settle()
    await snapAll('guessing')

    await guesser.page.locator('.word-grid .word').nth(0).click()
    await settle()
    await snapAll('voted')

    // Undo asks in a modal, which must not push anything around.
    await otherGiver.page.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => otherGiver.page.getByRole('dialog').count()).toBe(1)
    await snapAll('undo confirm open')
    await otherGiver.page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

    // TV host menu rewind confirmation is a modal too.
    await table.tv.getByRole('button', { name: 'Host menu' }).click()
    await table.tv.getByRole('button', { name: /^Go back to before/ }).first().click()
    await expect.poll(() => table.tv.getByRole('dialog').count()).toBe(1)
    await snapAll('host confirm open')
    await table.tv.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()

    await otherGiver.page.getByRole('button', { name: 'Undo' }).click()
    await otherGiver.page.getByRole('dialog').getByRole('button', { name: /yes, undo/i }).click()
    await settle()
    await snapAll('after undo')

    for (const [page, ys] of tops) {
      const who = page === table.tv ? 'TV' : table.phones.find((p: Phone) => p.page === page)!.name
      expect(new Set(ys), `${who} board tops: ${ys.join(', ')}`).toHaveProperty('size', 1)
    }
  })
})
