import type { IncomingMessage } from 'node:http'
import type { NetworkInterfaceInfo } from 'node:os'

const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|tailscale|zerotier|vpn|utun|tun|tap/i

const isPrivate = (a: string) =>
  a.startsWith('10.') || a.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(a)

/** The address phones should use: a private IPv4 on a real adapter, else any external IPv4. */
export function pickLanAddress(ifaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string | null {
  const external = Object.entries(ifaces).flatMap(([name, infos]) =>
    (infos ?? [])
      .filter((i) => i.family === 'IPv4' && !i.internal)
      .map((i) => ({ name, address: i.address })),
  )
  const real = external.find((i) => !VIRTUAL.test(i.name) && isPrivate(i.address))
  return (real ?? external[0])?.address ?? null
}

export function isLoopback(addr: string | undefined): boolean {
  if (!addr) return false
  const a = addr.startsWith('::ffff:') ? addr.slice(7) : addr
  return a === '::1' || a.startsWith('127.')
}

/**
 * Host = the laptop itself. Behind Vite's dev proxy every connection comes from
 * loopback, so then the real client is the last X-Forwarded-For hop.
 */
export function isHostRequest(req: IncomingMessage): boolean {
  if (!isLoopback(req.socket.remoteAddress)) return false
  const header = req.headers['x-forwarded-for']
  const forwarded = Array.isArray(header) ? header.join(',') : header
  if (!forwarded) return true
  const last = forwarded.split(',').at(-1)!.trim()
  return isLoopback(last)
}
