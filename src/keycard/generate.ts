import type { Color, CoopComposition, KeyCard } from './types'

export interface CoopOptions {
  size: number
  players: number
  /** Omit for a random card; pass a number to reproduce one exactly. */
  seed?: number
}

/** Agents as a share of the board — 15 of 25 cells, as in Codenames Duet. */
const AGENT_RATIO = 15 / 25
/** Cells lethal to at least one player — 5 of 25, as in Duet. */
const LETHAL_RATIO = 5 / 25

/**
 * Cell counts for a coop card of the given shape.
 *
 * Overlap is set by Venn region rather than by scaling per-player totals: a
 * region shared by `k` players gets `base / k` cells. That single rule
 * reproduces Duet's key card at 5x5 with 2 players (6 solo each, 3 shared) and
 * gives 6/3/2 at 7x7 with 3 players — a few cells in every region either way.
 */
export function coopComposition(size: number, players: number): CoopComposition {
  const cells = size * size

  let denom = 0
  for (let k = 1; k <= players; k++) denom += choose(players, k) / k
  const base = Math.round(cells * AGENT_RATIO) / denom
  const regionSizes = Array.from({ length: players }, (_, i) =>
    Math.max(1, Math.round(base / (i + 1))),
  )

  let totalAgents = 0
  let greenPerView = 0
  for (let k = 1; k <= players; k++) {
    // choose(players, k) regions of degree k; each player sits in
    // choose(players - 1, k - 1) of them.
    totalAgents += choose(players, k) * regionSizes[k - 1]
    greenPerView += choose(players - 1, k - 1) * regionSizes[k - 1]
  }

  // Each player's blacks: one on someone else's agent, one lethal to everybody,
  // and enough of their own to keep the board's lethal share near Duet's.
  const soloBlacks = Math.max(
    0,
    Math.round((Math.round(cells * LETHAL_RATIO) - players - 1) / players),
  )

  return { cells, regionSizes, greenPerView, blackPerView: 2 + soloBlacks, totalAgents }
}

/** Non-agent cells the blacks need: one shared, plus each player's own. */
export const bystandersNeeded = (blackPerView: number, players: number) =>
  blackPerView < 2 ? 0 : 1 + players * (blackPerView - 2)

/**
 * Builds a Duet-style coop key card for any board size and player count.
 *
 * Every view gets exactly `greenPerView` greens and `blackPerView` blacks, the
 * greens overlap into exactly the Venn regions `coopComposition` asks for, and
 * each player has exactly one black sitting on a cell somebody else must guess.
 */
export function generateCoop({ size, players, seed }: CoopOptions): KeyCard {
  if (!Number.isInteger(size) || size < 2) {
    throw new Error(`Board size must be an integer of at least 2, got ${size}`)
  }
  if (!Number.isInteger(players) || players < 2) {
    throw new Error(`Coop needs at least 2 players, got ${players}`)
  }

  const { cells, regionSizes, greenPerView, blackPerView, totalAgents } = coopComposition(
    size,
    players,
  )
  if (
    totalAgents - greenPerView < players ||
    totalAgents + bystandersNeeded(blackPerView, players) > cells
  ) {
    throw new Error(`No valid coop key card exists for ${size}x${size} with ${players} players`)
  }

  const rand = makeRng(seed)
  const shuffled = shuffle(range(cells), rand)
  const isGreen = falseGrid(players, cells)
  const isBlack = falseGrid(players, cells)

  // 1. Deal each Venn region its cells. Every non-empty subset of players is
  //    one region; a subset of size k gets regionSizes[k - 1] cells.
  let dealt = 0
  for (let subset = 1; subset < 1 << players; subset++) {
    for (let i = 0; i < regionSizes[popcount(subset) - 1]; i++) {
      const cell = shuffled[dealt++]
      for (let p = 0; p < players; p++) {
        if (subset & (1 << p)) isGreen[p][cell] = true
      }
    }
  }
  const agents = shuffled.slice(0, dealt)
  const bystanders = shuffled.slice(dealt)

  // 2. One black per player lands on an agent cell that player can't see as
  //    green — the Duet green/assassin tension, one distinct cell per player.
  const taken = new Set<number>()
  for (const p of shuffle(range(players), rand)) {
    const candidates = agents.filter((cell) => !isGreen[p][cell] && !taken.has(cell))
    const cell = candidates[Math.floor(rand() * candidates.length)]
    isBlack[p][cell] = true
    taken.add(cell)
  }

  // 3. The remaining blacks sit on cells nobody has to guess: one is lethal to
  //    everyone, and the rest belong to a single player each.
  const spare = shuffle([...bystanders], rand)
  let next = 0
  if (blackPerView >= 2) {
    const shared = spare[next++]
    for (let p = 0; p < players; p++) isBlack[p][shared] = true
  }
  for (let p = 0; p < players; p++) {
    for (let i = 0; i < blackPerView - 2; i++) isBlack[p][spare[next++]] = true
  }

  const views: Color[][] = isGreen.map((greens, p) =>
    greens.map((green, cell): Color => {
      if (green) return 'green'
      return isBlack[p][cell] ? 'black' : 'yellow'
    }),
  )

  return { size, players, views }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

const falseGrid = (players: number, cells: number) =>
  Array.from({ length: players }, () => new Array<boolean>(cells).fill(false))

const choose = (n: number, k: number): number =>
  k < 0 || k > n ? 0 : k === 0 ? 1 : (choose(n - 1, k - 1) * n) / k

const popcount = (n: number) => {
  let bits = 0
  for (let v = n; v; v >>= 1) bits += v & 1
  return bits
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** mulberry32 — small, fast, and seedable so a card can be reproduced. */
function makeRng(seed?: number): () => number {
  let state = (seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
