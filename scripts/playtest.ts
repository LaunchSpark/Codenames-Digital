/**
 * Playtest without a pile of phones: opens the TV and N phone windows on this
 * laptop, joins everyone and starts the game. Play by clicking in the windows.
 *
 *   npm run playtest                      # 4 phones, auto-join and start
 *   npm run playtest -- --phones 6        # 2–10 phones
 *   npm run playtest -- --no-auto         # leave the join screens for you
 *   npm run playtest -- --phones-at 0,0   # where the phone row starts (default: second screen)
 *
 * Ctrl+C closes everything.
 */
import { parseArgs } from 'node:util'
import { join, openTable } from '../e2e/harness'

const { values } = parseArgs({
  options: {
    phones: { type: 'string', default: '4' },
    'no-auto': { type: 'boolean', default: false },
    'phones-at': { type: 'string', default: '1920,0' },
    'tv-at': { type: 'string', default: '0,0' },
    port: { type: 'string', default: '3100' },
  },
})

const xy = (s: string) => s.split(',').map(Number) as [number, number]
const phones = Math.min(10, Math.max(2, Number(values.phones)))

const table = await openTable({
  phones,
  headless: false,
  port: Number(values.port),
  tvAt: xy(values['tv-at']),
  phonesAt: xy(values['phones-at']),
})

console.log(`\nTV:     ${table.tvUrl}`)
console.log(`Phones: ${table.joinUrl}  (${phones} windows)`)

if (!values['no-auto']) {
  for (const phone of table.phones) await join(phone)
  if (phones >= 4) {
    await table.tv.getByRole('button', { name: 'Start' }).click()
    console.log('Everyone joined and the game has started.')
  } else {
    console.log('Joined — Start needs at least 2 players per team.')
  }
}
console.log('Ctrl+C to close everything.\n')

const shutdown = async () => {
  await table.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
// Closing the TV window ends the session too.
table.tv.on('close', shutdown)
