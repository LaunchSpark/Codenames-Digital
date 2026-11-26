/** The host kicks a player from the lobby; they can rejoin, typing their name again. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seededRandom } from '../server/game/random'
import { join, openTable, type Table } from './harness'

let table: Table

describe('kicking from the lobby', () => {
  beforeAll(async () => {
    table = await openTable({ phones: 4, headless: true, port: 3220, rand: seededRandom(2) })
    for (const phone of table.phones) await join(phone)
  })
  afterAll(async () => table?.close())

  it('removes the player, who must type their name again to rejoin', async () => {
    const [ann] = table.phones
    const tv = table.tv
    await expect.poll(() => tv.getByText('Ann', { exact: true }).count()).toBe(1)

    await tv.getByRole('button', { name: 'Remove Ann' }).click()
    await tv.getByRole('dialog').getByRole('button', { name: 'Yes, remove' }).click()
    await expect.poll(() => tv.getByText('Ann', { exact: true }).count()).toBe(0)

    // Ann's phone is back on the join form, name empty.
    await expect.poll(() => ann.page.getByLabel('Your name').count()).toBe(1)
    expect(await ann.page.getByLabel('Your name').inputValue()).toBe('')

    // Reloading doesn't bring the old seat back either.
    await ann.page.reload()
    await expect.poll(() => ann.page.getByLabel('Your name').count()).toBe(1)
    expect(await ann.page.getByLabel('Your name').inputValue()).toBe('')

    // Typing the name again rejoins, under the same name.
    await join(ann)
    await expect.poll(() => tv.getByText('Ann', { exact: true }).count()).toBe(1)
  })
})
