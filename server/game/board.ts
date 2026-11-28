import type { CardColor, Deck, Team } from '../../src/shared/protocol'
import type { Board } from './state'

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const otherTeam = (team: Team): Team => (team === 'red' ? 'blue' : 'red')

export interface DeckSpec {
  size: number
  counts: { starting: number; other: number; neutral: number; assassin: number }
}

/** Words: 5x5, 9/8/7/1. Pictures: 5x4, 8/7/4/1. */
export const DECKS: Record<Deck, DeckSpec> = {
  words: { size: 25, counts: { starting: 9, other: 8, neutral: 7, assassin: 1 } },
  pictures: { size: 20, counts: { starting: 8, other: 7, neutral: 4, assassin: 1 } },
}

/** A fresh board dealt from `items` (words or picture ids) to the deck's size and counts. */
export function newBoard(items: readonly string[], rand: () => number, spec: DeckSpec = DECKS.words): Board {
  const unique = [...new Set(items)]
  if (unique.length < spec.size) {
    throw new Error(`Need at least ${spec.size} distinct cards, got ${unique.length}`)
  }

  const startingTeam: Team = rand() < 0.5 ? 'red' : 'blue'
  const { counts } = spec
  const colors: CardColor[] = [
    ...Array<CardColor>(counts.starting).fill(startingTeam),
    ...Array<CardColor>(counts.other).fill(otherTeam(startingTeam)),
    ...Array<CardColor>(counts.neutral).fill('neutral'),
    ...Array<CardColor>(counts.assassin).fill('assassin'),
  ]
  const dealt = shuffle(unique, rand).slice(0, spec.size)
  const shuffledColors = shuffle(colors, rand)

  return {
    cards: dealt.map((word, i) => ({ word, color: shuffledColors[i], revealed: false })),
    startingTeam,
    phase: { name: 'clue', team: startingTeam },
    clues: [],
  }
}
