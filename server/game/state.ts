import type { CardColor, Clue, ErrorCode, Phase, Team } from '../../src/shared/protocol'

export interface Seat {
  id: string
  token: string
  name: string
  team: Team
  connections: number
}

export interface Roster {
  seats: Record<string, Seat>
  /** Seat ids per team, in rotation order. */
  order: Record<Team, string[]>
  /** Rotation index used at the next game start (wraps over current list length). */
  nextClueGiver: Record<Team, number>
}

export interface Card {
  word: string
  color: CardColor
  revealed: boolean
}

/** Everything Undo restores. */
export interface Board {
  cards: Card[]
  startingTeam: Team
  phase: Phase
  clues: Clue[]
}

export interface Game {
  board: Board
  /** Prior Boards, most recent last. */
  history: Board[]
  /** Outside Board on purpose: undo never reverts a host reassignment. */
  clueGivers: Record<Team, string | null>
  /** seatId → vote; cleared on every Board change. */
  votes: Record<string, number | 'end'>
}

export interface ServerState {
  mode: 'vs'
  roster: Roster
  game: Game | null
}

export class GameError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
}
