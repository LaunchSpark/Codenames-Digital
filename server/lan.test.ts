import type { IncomingMessage } from 'node:http'
import type { NetworkInterfaceInfo } from 'node:os'
import { describe, expect, it } from 'vitest'
import { isHostRequest, isLoopback, pickLanAddress } from './lan'

const v4 = (address: string, internal = false) =>
  ({ address, family: 'IPv4', internal, netmask: '255.255.255.0', mac: '', cidr: null }) as NetworkInterfaceInfo

const req = (remoteAddress: string, xff?: string) =>
  ({ socket: { remoteAddress }, headers: xff ? { 'x-forwarded-for': xff } : {} }) as unknown as IncomingMessage

describe('pickLanAddress', () => {
  it('prefers the real Wi-Fi adapter over WSL/Hyper-V', () => {
    expect(
      pickLanAddress({ 'vEthernet (WSL)': [v4('172.20.0.1')], 'Wi-Fi': [v4('192.168.1.20')] }),
    ).toBe('192.168.1.20')
  })

  it('falls back to any non-internal IPv4', () => {
    expect(pickLanAddress({ 'vEthernet (WSL)': [v4('172.20.0.1')] })).toBe('172.20.0.1')
  })

  it('returns null with only loopback', () => {
    expect(pickLanAddress({ lo: [v4('127.0.0.1', true)] })).toBeNull()
  })
})

describe('isLoopback', () => {
  it('recognises IPv4, IPv6 and mapped loopback', () => {
    for (const a of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1']) expect(isLoopback(a), a).toBe(true)
    for (const a of ['192.168.1.5', '::ffff:192.168.1.5', undefined]) expect(isLoopback(a), String(a)).toBe(false)
  })
})

describe('isHostRequest', () => {
  it('trusts only loopback peers, and the last forwarded hop behind a proxy', () => {
    expect(isHostRequest(req('192.168.1.5'))).toBe(false)
    expect(isHostRequest(req('192.168.1.5', '127.0.0.1'))).toBe(false)
    expect(isHostRequest(req('127.0.0.1'))).toBe(true)
    expect(isHostRequest(req('::ffff:127.0.0.1', '127.0.0.1, 192.168.1.5'))).toBe(false)
    expect(isHostRequest(req('::ffff:127.0.0.1', '::1'))).toBe(true)
  })
})
