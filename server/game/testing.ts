/** Test helpers only — never imported by production code. */
import type { CardColor, Team } from '../../src/shared/protocol'
import { seededRandom } from './random'
import { addSeat, emptyState } from './roster'
import { startGame } from './rules'
import { GameError, type ServerState } from './state'
import { WORDS } from './words'

/** The GameError code a call throws, or null if it doesn't throw. */
export function codeOf(fn: () => unknown) {
  try {
    fn()
  } catch (e) {
    if (e instanceof GameError) return e.code
    throw e
  }
  return null
}

/** The standard test table: red ann/bob/cy, blue dee/eve. */
export const lobby = () => lobbyWith({ red: ['ann', 'bob', 'cy'], blue: ['dee', 'eve'] })

/** A started game where red goes first (red: ann gives clues, bob + cy guess; blue: dee gives clues). */
export function startRed(s: ServerState = lobby(), from = 1): ServerState {
  for (let seed = from; ; seed++) {
    const started = startGame(s, WORDS, seededRandom(seed))
    if (started.game!.board.startingTeam === 'red') return started
  }
}

/** A lobby with the given names joined in order; seat id = name, token = `t-${name}`. */
export function lobbyWith(teams: { red: string[]; blue: string[] }): ServerState {
  let s = emptyState()
  for (const team of ['red', 'blue'] as Team[]) {
    for (const name of teams[team]) s = addSeat(s, { id: name, token: `t-${name}`, name, team })
  }
  return s
}

/** Index of the nth unrevealed card of a colour on the current board. */
export function colorIndex(s: ServerState, color: CardColor, nth = 0): number {
  const cards = s.game?.board.cards ?? []
  let seen = 0
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].color === color && !cards[i].revealed && seen++ === nth) return i
  }
  throw new Error(`No unrevealed ${color} card #${nth}`)
}
