import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Picture ids (`card-0`, `card-1`, …) for each consecutive card-N.jpg in `dir`, from 0 up to the first gap. */
export function findPictures(dir: string): string[] {
  const ids: string[] = []
  while (existsSync(join(dir, `card-${ids.length}.jpg`))) ids.push(`card-${ids.length}`)
  return ids
}
