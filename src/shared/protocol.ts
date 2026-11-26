export type Team = 'red' | 'blue'
export type CardColor = Team | 'neutral' | 'assassin'
export type Mode = 'vs' | 'coop'

export interface PlayerInfo {
  id: string
  name: string
  team: Team
  connected: boolean
}

export interface Clue {
  team: Team
  word: string
  /** 1–9. */
  number: number
}

export type Phase =
  | { name: 'lobby' }
  | { name: 'clue'; team: Team }
  | {
      name: 'guess'
      team: Team
      clue: Clue
      /** Starts at clue.number + 1. */
      guessesLeft: number
      /** Reveals made this turn; end-turn voting needs >= 1. */
      guessesMade: number
    }
  | { name: 'over'; winner: Team; reason: 'cards' | 'assassin' }

export interface CardView {
  word: string
  revealed: boolean
  /**
   * The card's colour if this viewer may know it: always when revealed; for an
   * unrevealed card ONLY in a current clue-giver's view or once phase is
   * 'over'. Otherwise null. The server enforces this — never the client.
   */
  color: CardColor | null
  /** Guessers on the active team currently voting for this card (pips filled). */
  votes: number
}

export interface TeamView {
  team: Team
  /** In clue-giver rotation order. */
  players: PlayerInfo[]
  /** Current game's clue-giver; null in lobby or when the host must pick one. */
  clueGiverId: string | null
  /** Unrevealed cards of this colour; null in lobby. */
  remaining: number | null
}

export interface GameView {
  mode: Mode
  phase: Phase
  /** 25 cards, row-major; null in lobby. */
  board: CardView[] | null
  teams: Record<Team, TeamView>
  /** Team owning 9 cards and going first; null in lobby. */
  startingTeam: Team | null
  /** All clues this game, oldest first. */
  clues: Clue[]
  /** Pip slots per card = connected guessers on the guessing team (0 outside 'guess'). */
  voterCount: number
  /** Guessers currently voting to end the turn. */
  endTurnVotes: number
  /** True when there is a move to undo. */
  canUndo: boolean
  /**
   * Host TV only (null for everyone else and in the lobby): every move and host
   * correction this game, oldest first, e.g. "Red clue: OCEAN 2". Undoing back to
   * just before entry i is `{ type: 'host:undo', steps: timeline.length - i }`.
   */
  timeline: string[] | null
  /** e.g. "http://192.168.1.20:3000/" — what the TV's QR code encodes. */
  joinUrl: string
}

export type You =
  | { kind: 'tv'; host: boolean }
  | { kind: 'spectator' }
  | {
      kind: 'player'
      id: string
      team: Team
      /** null in lobby. */
      role: 'clue-giver' | 'guesser' | null
      /** This player's own current vote. */
      vote: number | 'end' | null
    }

export type ErrorCode =
  | 'not-host'
  | 'bad-message'
  | 'name-invalid'
  | 'name-taken'
  | 'not-in-lobby'
  | 'not-enough-players'
  | 'not-your-turn'
  | 'invalid-clue'
  | 'invalid-vote'
  | 'nothing-to-undo'
  | 'unknown-player'

export type ServerMessage =
  | { type: 'welcome'; token: string; playerId: string }
  | { type: 'state'; view: GameView; you: You }
  | { type: 'error'; code: ErrorCode; message: string }

export type ClientMessage =
  | { type: 'hello'; client: 'tv' }
  | { type: 'hello'; client: 'player'; token: string | null }
  /** Join (first time, lobby or mid-game) or, in lobby only, switch team. */
  | { type: 'join'; name: string; team: Team }
  /** Active clue-giver, during their team's 'clue' phase. */
  | { type: 'clue'; word: string; number: number }
  /** Guesser on the guessing team. Same card again clears the vote. */
  | { type: 'vote'; card: number }
  /** Guesser; toggles their end-turn vote. Needs guessesMade >= 1. */
  | { type: 'vote-end' }
  /** Either current clue-giver. */
  | { type: 'undo' }
  | { type: 'host:start' }
  | { type: 'host:new-game' }
  | { type: 'host:lobby' }
  | { type: 'host:make-clue-giver'; playerId: string }
  | { type: 'host:skip-turn' }
  | { type: 'host:remove-player'; playerId: string }
  /** Step back through the timeline, host corrections included; steps >= 1. */
  | { type: 'host:undo'; steps: number }

export const SEAT_STORAGE_KEY = 'codenames-seat'
export const WS_PATH = '/ws'
export const BOARD_CELLS = 25
