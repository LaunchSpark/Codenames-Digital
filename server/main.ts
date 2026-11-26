/** `npm run host` / `npm run dev:server` entry point. */
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { startServer } from './index'
import { pickLanAddress } from './lan'

const { values } = parseArgs({ options: { 'join-port': { type: 'string' }, 'no-static': { type: 'boolean' } } })

const port = Number(process.env.PORT ?? 3000)
const joinPort = Number(values['join-port'] ?? port)
let ip = process.env.CODENAMES_HOST_IP ?? pickLanAddress(networkInterfaces())
if (!ip) {
  console.warn('Could not find a network address — phones will not be able to join. Set CODENAMES_HOST_IP.')
  ip = 'localhost'
}

const joinUrl = `http://${ip}:${joinPort}/`
const staticDir = values['no-static'] ? undefined : fileURLToPath(new URL('../dist', import.meta.url))

const { port: actual } = await startServer({ port, joinUrl, staticDir })

console.log(`\nCodenames server running on port ${actual}`)
console.log(`  Players join:               ${joinUrl}`)
console.log(`  TV (open on this laptop):   http://localhost:${joinPort}/tv`)
console.log(`  Wrong address in the QR code? Set CODENAMES_HOST_IP and restart.\n`)
