import { describe, expect, it } from 'vitest'
import { WORDS } from './words'

describe('WORDS', () => {
  it('has at least 300 words', () => expect(WORDS.length).toBeGreaterThanOrEqual(300))

  it('is lowercase, trimmed, non-empty', () => {
    for (const w of WORDS) expect(w).toMatch(/^[a-z][a-z -]*[a-z]$/)
  })

  it('has no duplicates', () => expect(new Set(WORDS).size).toBe(WORDS.length))
})
