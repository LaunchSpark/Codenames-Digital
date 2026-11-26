/** Test helpers only — never imported by production code. */
import type { CardColor, Team } from '../../src/shared/protocol'
import { addSeat, emptyState } from './roster'
import type { ServerState } from './state'

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
