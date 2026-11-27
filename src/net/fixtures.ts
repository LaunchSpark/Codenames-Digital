import type {
  CardColor,
  CardView,
  Clue,
  Deck,
  GameView,
  Phase,
  PlayerInfo,
  Team,
  TeamView,
  You,
} from '../shared/protocol'

/**
 * Sample `{ view, you }` pairs for building and testing screens without a
 * server. Open any of them with `?mock=<name>` (TV ones under `/tv`).
 *
 * They follow the contract's hiding rules: unrevealed colours are only present
 * for a clue-giver or once the game is over.
 */

export type FixtureName =
  | 'tv-lobby'
  | 'tv-lobby-host'
  | 'tv-clue'
  | 'tv-guess'
  | 'tv-guess-host'
  | 'tv-guess-pictures'
  | 'tv-needs-clue-giver'
  | 'tv-over'
  | 'phone-spectator-lobby'
  | 'phone-spectator-midgame'
  | 'phone-lobby'
  | 'phone-cluegiver-clue'
  | 'phone-cluegiver-waiting'
  | 'phone-guesser-guess'
  | 'phone-guesser-waiting'
  | 'phone-guesser-pictures'
  | 'phone-cluegiver-pictures'
  | 'phone-over'

export interface Fixture {
  view: GameView
  you: You
}

const WORDS = [
  'APPLE', 'BERLIN', 'CASTLE', 'DIAMOND', 'EAGLE',
  'FOREST', 'MILLIONAIRE', 'SHAKESPEARE', 'SCUBA DIVER', 'JUPITER',
  'KNIGHT', 'LEMON', 'MOUNT', 'REVOLUTION', 'OLIVE',
  'PIANO', 'QUEEN', 'ROCKET', 'SHARK', 'TOKYO',
  'UNICORN', 'VOLCANO', 'WHALE', 'YARD', 'ZEBRA',
]

/** 9 red (starts), 8 blue, 7 neutral, 1 assassin (index 7). */
const KEY: CardColor[] = (
  'R B N R B ' +
  'N R A R B ' +
  'B N R N R ' +
  'B R N B R ' +
  'N R B N B'
)
  .trim()
  .split(/\s+/)
  .map((c) => ({ R: 'red', B: 'blue', N: 'neutral', A: 'assassin' })[c] as CardColor)

/** The picture board: 20 images, the word KEY's first 20 with card 17 made blue — 8 red (starts), 7 blue, 4 neutral, 1 assassin. */
const PICTURES = Array.from({ length: 20 }, (_, i) => `card-${i}`)
const PICTURE_KEY: CardColor[] = KEY.slice(0, 20).map((c, i) => (i === 17 ? 'blue' : c))

const JOIN_URL = 'http://192.168.1.20:3000/'

const PLAYERS: Record<Team, PlayerInfo[]> = {
  red: [
    { id: 'p1', name: 'Ana', team: 'red', connected: true },
    { id: 'p2', name: 'Ben', team: 'red', connected: true },
    { id: 'p3', name: 'Cara', team: 'red', connected: true },
  ],
  blue: [
    { id: 'p4', name: 'Dev', team: 'blue', connected: true },
    { id: 'p5', name: 'Eli', team: 'blue', connected: false },
    { id: 'p6', name: 'Fern', team: 'blue', connected: true },
  ],
}

const ANA: You = { kind: 'player', id: 'p1', team: 'red', role: 'clue-giver', votes: [], votedEnd: false }
const BEN: You = { kind: 'player', id: 'p2', team: 'red', role: 'guesser', votes: [], votedEnd: false }

const CLUES: Clue[] = [
  { team: 'red', word: 'ANIMAL', number: 2 },
  { team: 'blue', word: 'MOUNTAIN', number: 2 },
  { team: 'red', word: 'OCEAN', number: 3 },
]

/** Red guessed 0 and 3 off ANIMAL; blue found 4 then hit neutral 2. */
const AFTER_TWO_TURNS = [0, 3, 4, 2]
/** ...and red has found 8 off OCEAN so far. */
const MID_OCEAN = [...AFTER_TWO_TURNS, 8]

const OCEAN_GUESS: Phase = {
  name: 'guess',
  team: 'red',
  clue: CLUES[2],
  guessesLeft: 3,
  guessesMade: 1,
}

function lobbyView(): GameView {
  const team = (t: Team): TeamView => ({
    team: t,
    players: PLAYERS[t],
    clueGiverId: null,
    remaining: null,
  })
  return {
    mode: 'vs',
    deck: 'words',
    picturesAvailable: true,
    phase: { name: 'lobby' },
    board: null,
    teams: { red: team('red'), blue: team('blue') },
    startingTeam: null,
    clues: [],
    voterCount: 0,
    endTurnVotes: 0,
    canUndo: false,
    timeline: null,
    joinUrl: JOIN_URL,
  }
}

interface GameOpts {
  phase: Phase
  revealed: number[]
  clues: Clue[]
  /** Show unrevealed colours (clue-giver view, or game over). */
  showKey?: boolean
  votes?: Record<number, number>
  endTurnVotes?: number
  clueGivers?: Partial<Record<Team, string | null>>
  /** Host TV only. */
  timeline?: string[] | null
  deck?: Deck
}

function gameView(opts: GameOpts): GameView {
  const revealed = new Set(opts.revealed)
  const deck = opts.deck ?? 'words'
  const key = deck === 'pictures' ? PICTURE_KEY : KEY
  const board: CardView[] = (deck === 'pictures' ? PICTURES : WORDS).map((word, i) => ({
    word,
    revealed: revealed.has(i),
    color: revealed.has(i) || opts.showKey ? key[i] : null,
    votes: opts.votes?.[i] ?? 0,
  }))
  const remaining = (t: Team) => key.filter((c, i) => c === t && !revealed.has(i)).length
  const team = (t: Team): TeamView => ({
    team: t,
    players: PLAYERS[t],
    clueGiverId: opts.clueGivers?.[t] !== undefined ? opts.clueGivers[t]! : PLAYERS[t][0].id,
    remaining: remaining(t),
  })
  const guessing = opts.phase.name === 'guess' ? opts.phase.team : null
  return {
    mode: 'vs',
    deck,
    picturesAvailable: true,
    phase: opts.phase,
    board,
    teams: { red: team('red'), blue: team('blue') },
    startingTeam: 'red',
    clues: opts.clues,
    voterCount: guessing
      ? PLAYERS[guessing].filter((p, i) => i > 0 && p.connected).length
      : 0,
    endTurnVotes: opts.endTurnVotes ?? 0,
    canUndo: opts.revealed.length > 0 || opts.clues.length > 0,
    timeline: opts.timeline ?? null,
    joinUrl: JOIN_URL,
  }
}

/** Red guessing OCEAN 3: Ben is voting for card 9, Cara to end the turn. */
const oceanGuess = (showKey = false, deck: Deck = 'words') =>
  gameView({
    deck,
    phase: OCEAN_GUESS,
    revealed: MID_OCEAN,
    clues: CLUES,
    showKey,
    votes: { 9: 1 },
    endTurnVotes: 1,
  })

const redThinking = (showKey = false) =>
  gameView({
    phase: { name: 'clue', team: 'red' },
    revealed: AFTER_TWO_TURNS,
    clues: CLUES.slice(0, 2),
    showKey,
  })

const blueWinsByAssassin = () =>
  gameView({
    phase: { name: 'over', winner: 'blue', reason: 'assassin' },
    revealed: [...MID_OCEAN, 7],
    clues: CLUES,
    showKey: true,
  })

export const FIXTURES: Record<FixtureName, Fixture> = {
  'tv-lobby': { view: lobbyView(), you: { kind: 'tv', host: false } },
  'tv-lobby-host': { view: lobbyView(), you: { kind: 'tv', host: true } },
  'tv-clue': {
    view: gameView({
      phase: { name: 'clue', team: 'blue' },
      revealed: [0, 3, 11],
      clues: CLUES.slice(0, 1),
    }),
    you: { kind: 'tv', host: false },
  },
  'tv-guess': { view: oceanGuess(), you: { kind: 'tv', host: false } },
  'tv-guess-host': { view: oceanGuess(), you: { kind: 'tv', host: true } },
  'tv-guess-pictures': { view: oceanGuess(false, 'pictures'), you: { kind: 'tv', host: false } },
  'tv-needs-clue-giver': {
    view: gameView({
      phase: { name: 'clue', team: 'red' },
      revealed: AFTER_TWO_TURNS,
      clues: CLUES.slice(0, 2),
      clueGivers: { red: null },
    }),
    you: { kind: 'tv', host: true },
  },
  'tv-over': { view: blueWinsByAssassin(), you: { kind: 'tv', host: false } },

  'phone-spectator-lobby': { view: lobbyView(), you: { kind: 'spectator' } },
  'phone-spectator-midgame': { view: oceanGuess(), you: { kind: 'spectator' } },
  'phone-lobby': { view: lobbyView(), you: { ...BEN, role: null } },
  'phone-cluegiver-clue': { view: redThinking(true), you: ANA },
  'phone-cluegiver-waiting': { view: oceanGuess(true), you: ANA },
  'phone-guesser-guess': { view: oceanGuess(), you: { ...BEN, votes: [9] } },
  'phone-guesser-waiting': { view: redThinking(), you: BEN },
  'phone-cluegiver-pictures': { view: oceanGuess(true, 'pictures'), you: ANA },
  'phone-guesser-pictures': { view: oceanGuess(false, 'pictures'), you: { ...BEN, votes: [9] } },
  'phone-over': { view: blueWinsByAssassin(), you: BEN },
}

export function isFixtureName(name: string | null): name is FixtureName {
  return name !== null && Object.hasOwn(FIXTURES, name)
}
