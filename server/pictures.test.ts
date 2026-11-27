import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findPictures } from './pictures'

let dir: string | null = null
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

describe('findPictures', () => {
  it('lists consecutive card-N.jpg from 0, stopping at the first gap', () => {
    dir = mkdtempSync(join(tmpdir(), 'codenames-cards-'))
    for (const n of [0, 1, 3]) writeFileSync(join(dir, `card-${n}.jpg`), '')
    expect(findPictures(dir)).toEqual(['card-0', 'card-1'])
  })

  it('is empty when the folder is missing', () => {
    expect(findPictures(join(tmpdir(), 'codenames-no-such-folder'))).toEqual([])
  })
})
