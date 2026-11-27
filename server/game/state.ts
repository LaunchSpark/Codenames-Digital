import type { CardColor, Clue, Deck, ErrorCode, Phase, Team } from '../../src/shared/protocol'

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

/** What the game looked like just before one logged action. */
export interface TimelineEntry {
  /** Describes the action that came after this snapshot, e.g. "Red clue: OCEAN 2". */
  label: string
  board: Board
  clueGivers: Record<Team, string | null>
  history: Board[]
}

export type Vote = number[] | 'end'

export interface Game {
  board: Board
  /** Prior Boards for clue-giver undo, most recent last. */
  history: Board[]
  /** Every game move and host correction this game, oldest first — for host undo. */
  timeline: TimelineEntry[]
  /** Outside Board on purpose: undo never reverts a host reassignment. */
  clueGivers: Record<Team, string | null>
  /**
   * seatId → the cards they back (oldest first, at most guessesLeft) or 'end'.
   * Cleared on every Board change, except a reveal that keeps the turn going.
   */
  votes: Record<string, Vote>
}

export interface ServerState {
  mode: 'vs'
  /** Set in the lobby; a running game never changes it. */
  deck: Deck
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
