export type Team = 'red' | 'blue'
export type CardColor = Team | 'neutral' | 'assassin'
export type Mode = 'vs' | 'coop'
/** Which cards the board deals: 25 words, or 20 pictures from public/cards. */
export type Deck = 'words' | 'pictures'

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
  /** The lobby's deck choice; a running game was dealt from it. */
  deck: Deck
  /** At least a board's worth of pictures was found at startup; Pictures can't be picked otherwise. */
  picturesAvailable: boolean
  phase: Phase
  /** 20 or 25 cards, row-major; null in lobby. */
  board: CardView[] | null
  teams: Record<Team, TeamView>
  /** Team owning 9 cards and going first; null in lobby. */
  startingTeam: Team | null
  /** All clues this game, oldest first. */
  clues: Clue[]
  /** The team whose clue the other clue-giver is checking; the clue itself only reaches the two clue-givers. */
  checking: Team | null
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
      /** Cards this player is voting for, oldest first (the next to move when out of votes). */
      votes: number[]
      /** This player is voting to end the turn (never alongside card votes). */
      votedEnd: boolean
      /** The clue waiting to be checked: set only for its giver and the checking clue-giver. */
      pendingClue: Clue | null
      /** This team's last rejected clue: set only for that team's clue-giver. */
      rejectedClue: Clue | null
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
  | 'clue-giver-locked'
  | 'no-pictures'

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
  /**
   * The other team's clue-giver, while a clue waits: approve shows it, reject hands it back.
   * Names the clue it rules on, so a verdict can't land on a clue sent after it.
   */
  | { type: 'clue-verdict'; approve: boolean; word: string; number: number }
  /** The giver takes back their waiting clue; does nothing once it's been ruled on. */
  | { type: 'withdraw-clue' }
  /**
   * Guesser on the guessing team. Toggles this card in their votes; they may
   * back up to guessesLeft cards, and a new card past that replaces their oldest.
   * Clears an end-turn vote.
   */
  | { type: 'vote'; card: number }
  /** Guesser; toggles their end-turn vote, dropping any card votes. Needs guessesMade >= 1. */
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
  /** Lobby or mid-game; refused (clue-giver-locked) for a current clue-giver mid-game. */
  | { type: 'host:move-player'; playerId: string; team: Team }
  /** Lobby only: everyone into two balanced teams, random order. */
  | { type: 'host:shuffle-teams' }
  /** Lobby only; Pictures needs picturesAvailable. */
  | { type: 'host:set-deck'; deck: Deck }

export const SEAT_STORAGE_KEY = 'codenames-seat'
export const WS_PATH = '/ws'
