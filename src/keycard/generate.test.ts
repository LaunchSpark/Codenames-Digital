import { describe, expect, it } from 'vitest'
import { bystandersNeeded, coopComposition, generateCoop } from './generate'
import type { Color, KeyCard } from './types'

const SIZES = [4, 5, 6, 7]
const PLAYER_COUNTS = [2, 3]

/** Every (size, players) pair, each generated with a handful of seeds. */
const cases = SIZES.flatMap((size) =>
  PLAYER_COUNTS.flatMap((players) =>
    [1, 2, 3, 99, 12345].map((seed) => ({ size, players, seed })),
  ),
)

const count = (view: Color[], color: Color) => view.filter((c) => c === color).length

/** How many cells are green for exactly `degree` players. */
const cellsSeenBy = ({ views }: KeyCard, degree: number) =>
  views[0].filter((_, i) => views.filter((v) => v[i] === 'green').length === degree).length

describe('coopComposition', () => {
  it('reproduces the real Duet key card at 5x5 with 2 players', () => {
    expect(coopComposition(5, 2)).toEqual({
      cells: 25,
      regionSizes: [6, 3],
      greenPerView: 9,
      blackPerView: 3,
      totalAgents: 15,
    })
  })

  it('gives the agreed 7x7 profile for 3 players', () => {
    expect(coopComposition(7, 3)).toEqual({
      cells: 49,
      regionSizes: [6, 3, 2],
      greenPerView: 14,
      blackPerView: 4,
      totalAgents: 29,
    })
  })

  it('puts at least one cell in every Venn region', () => {
    for (const { size, players } of cases) {
      const { regionSizes } = coopComposition(size, players)
      expect(regionSizes).toHaveLength(players)
      for (const n of regionSizes) expect(n).toBeGreaterThanOrEqual(1)
    }
  })

  it('keeps overlap thinning out as more players share a cell', () => {
    for (const { size, players } of cases) {
      const { regionSizes } = coopComposition(size, players)
      for (let k = 1; k < regionSizes.length; k++) {
        expect(regionSizes[k]).toBeLessThanOrEqual(regionSizes[k - 1])
      }
    }
  })

  it('keeps agents near 60% of the board, as in Duet', () => {
    for (const { size, players } of cases) {
      const { cells, totalAgents } = coopComposition(size, players)
      expect(totalAgents / cells).toBeGreaterThan(0.5)
      expect(totalAgents / cells).toBeLessThan(0.7)
    }
  })

  it('leaves room for every green, black and agent it asks for', () => {
    for (const { size, players } of cases) {
      const { cells, greenPerView, blackPerView, totalAgents } = coopComposition(size, players)
      // Each view's greens fit inside the agent cells, with room left over for
      // the one black per player that must land on someone else's agent.
      expect(totalAgents - greenPerView).toBeGreaterThanOrEqual(players)
      expect(blackPerView).toBeGreaterThanOrEqual(1)
      expect(bystandersNeeded(blackPerView, players)).toBeLessThanOrEqual(cells - totalAgents)
    }
  })
})

describe('generateCoop', () => {
  it('is deterministic for a given seed', () => {
    expect(generateCoop({ size: 7, players: 3, seed: 42 })).toEqual(
      generateCoop({ size: 7, players: 3, seed: 42 }),
    )
  })

  it('gives different cards for different seeds', () => {
    const a = generateCoop({ size: 5, players: 2, seed: 1 })
    const b = generateCoop({ size: 5, players: 2, seed: 2 })
    expect(a.views).not.toEqual(b.views)
  })

  it('emits one full-length view per player', () => {
    for (const { size, players, seed } of cases) {
      const card = generateCoop({ size, players, seed })
      expect(card.views).toHaveLength(players)
      for (const view of card.views) {
        expect(view).toHaveLength(size * size)
      }
    }
  })

  it('hits the exact per-view colour counts', () => {
    for (const { size, players, seed } of cases) {
      const { cells, greenPerView, blackPerView } = coopComposition(size, players)
      for (const view of generateCoop({ size, players, seed }).views) {
        expect(count(view, 'green')).toBe(greenPerView)
        expect(count(view, 'black')).toBe(blackPerView)
        expect(count(view, 'yellow')).toBe(cells - greenPerView - blackPerView)
      }
    }
  })

  it('never uses the competitive colours in coop', () => {
    for (const { size, players, seed } of cases) {
      for (const view of generateCoop({ size, players, seed }).views) {
        expect(view).not.toContain('red')
        expect(view).not.toContain('blue')
      }
    }
  })

  it('fills every Venn region to exactly its target size', () => {
    for (const { size, players, seed } of cases) {
      const { regionSizes } = coopComposition(size, players)
      const card = generateCoop({ size, players, seed })
      for (let degree = 1; degree <= players; degree++) {
        // One region per subset of that size, all the same target size.
        const regions = choose(players, degree)
        expect(cellsSeenBy(card, degree)).toBe(regions * regionSizes[degree - 1])
      }
    }
  })

  it('shares each region evenly across the specific players in it', () => {
    // At 7x7 every pair of players must share exactly 3 + 2 = 5 cells.
    const { views } = generateCoop({ size: 7, players: 3, seed: 7 })
    const pairs = [
      [0, 1],
      [0, 2],
      [1, 2],
    ]
    for (const [a, b] of pairs) {
      const shared = views[a].filter((c, i) => c === 'green' && views[b][i] === 'green')
      expect(shared).toHaveLength(5)
    }
  })

  it('produces exactly the intended number of distinct agents', () => {
    for (const { size, players, seed } of cases) {
      const { totalAgents } = coopComposition(size, players)
      const { views } = generateCoop({ size, players, seed })
      const agents = views[0].filter((_, i) => views.some((v) => v[i] === 'green'))
      expect(agents).toHaveLength(totalAgents)
    }
  })

  it('gives each player exactly one green/black conflict', () => {
    for (const { size, players, seed } of cases) {
      const { views } = generateCoop({ size, players, seed })
      for (const view of views) {
        // Cells this player must avoid that another player needs them to guess.
        const conflicts = view.filter(
          (color, i) => color === 'black' && views.some((v) => v[i] === 'green'),
        )
        expect(conflicts).toHaveLength(1)
      }
    }
  })

  it('leaves exactly one cell that is lethal to everybody', () => {
    for (const { size, players, seed } of cases) {
      const { blackPerView } = coopComposition(size, players)
      if (blackPerView < 2) continue
      const { views } = generateCoop({ size, players, seed })
      const shared = views[0].filter((_, i) => views.every((v) => v[i] === 'black'))
      expect(shared).toHaveLength(1)
    }
  })

  it('never doubles up the blacks that are not the shared one', () => {
    for (const { size, players, seed } of cases) {
      const { views } = generateCoop({ size, players, seed })
      const blackFor = views[0].map((_, i) => views.filter((v) => v[i] === 'black').length)
      // Every black cell is either one player's alone, or black for all of them.
      for (const n of blackFor) {
        expect(n === 0 || n === 1 || n === players).toBe(true)
      }
    }
  })

  it('keeps roughly a fifth of the board lethal, as in Duet', () => {
    for (const { size, players, seed } of cases) {
      const { views } = generateCoop({ size, players, seed })
      const lethal = views[0].filter((_, i) => views.some((v) => v[i] === 'black'))
      expect(lethal.length / (size * size)).toBeLessThanOrEqual(0.26)
    }
  })

  it('reproduces the full Duet joint distribution at 5x5 with 2 players', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const [a, b] = generateCoop({ size: 5, players: 2, seed }).views
      const pairs: Record<string, number> = {}
      a.forEach((color, i) => {
        const key = `${color}/${b[i]}`
        pairs[key] = (pairs[key] ?? 0) + 1
      })
      expect(pairs).toEqual({
        'green/green': 3,
        'green/yellow': 5,
        'green/black': 1,
        'yellow/green': 5,
        'yellow/yellow': 7,
        'yellow/black': 1,
        'black/green': 1,
        'black/yellow': 1,
        'black/black': 1,
      })
    }
  })

  it('rejects shapes it cannot satisfy', () => {
    expect(() => generateCoop({ size: 1, players: 2 })).toThrow()
    expect(() => generateCoop({ size: 5, players: 1 })).toThrow()
  })
})

const choose = (n: number, k: number): number =>
  k < 0 || k > n ? 0 : k === 0 ? 1 : (choose(n - 1, k - 1) * n) / k
