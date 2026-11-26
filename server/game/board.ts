import { BOARD_CELLS, type CardColor, type Team } from '../../src/shared/protocol'
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

/** A fresh 5x5 board: starting team 9, other team 8, 7 neutral, 1 assassin. */
export function newBoard(words: readonly string[], rand: () => number): Board {
  const unique = [...new Set(words)]
  if (unique.length < BOARD_CELLS) {
    throw new Error(`Need at least ${BOARD_CELLS} distinct words, got ${unique.length}`)
  }

  const startingTeam: Team = rand() < 0.5 ? 'red' : 'blue'
  const colors: CardColor[] = [
    ...Array<CardColor>(9).fill(startingTeam),
    ...Array<CardColor>(8).fill(otherTeam(startingTeam)),
    ...Array<CardColor>(7).fill('neutral'),
    'assassin',
  ]
  const dealt = shuffle(unique, rand).slice(0, BOARD_CELLS)
  const shuffledColors = shuffle(colors, rand)

  return {
    cards: dealt.map((word, i) => ({ word, color: shuffledColors[i], revealed: false })),
    startingTeam,
    phase: { name: 'clue', team: startingTeam },
    clues: [],
  }
}
