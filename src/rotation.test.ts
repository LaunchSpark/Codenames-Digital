import { describe, expect, it } from 'vitest'
import { advanceRotation } from './rotation'

describe('advanceRotation', () => {
  it('turns only the given player a quarter further', () => {
    expect(advanceRotation([0, 0, 0], 1)).toEqual([0, 1, 0])
    expect(advanceRotation([2, 1, 3], 0)).toEqual([3, 1, 3])
  })

  it('wraps back to square after four turns', () => {
    expect(advanceRotation([3, 0], 0)).toEqual([0, 0])
  })

  it('turns a player the board has no entry for yet', () => {
    // A hot reload can leave the array empty while a card is still on screen;
    // the button must still work rather than silently doing nothing.
    expect(advanceRotation([], 0)).toEqual([1])
    expect(advanceRotation([2], 2)).toEqual([2, 0, 1])
  })

  it('leaves the array it was given alone', () => {
    const before = [0, 1, 2]
    advanceRotation(before, 1)
    expect(before).toEqual([0, 1, 2])
  })
})
