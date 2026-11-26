import type { Phase, Team } from '../../src/shared/protocol'
import { BOARD_CELLS } from '../../src/shared/protocol'
import { newBoard, otherTeam } from './board'
import { assignTeam, isConnected, pickClueGivers, seatOf } from './roster'
import { GameError, type Board, type Game, type Seat, type ServerState } from './state'
import { commit, logged, type CommitOptions } from './undo'

const CLUE_WORD = /^[\p{L}]+(-[\p{L}]+)*$/u
const MIN_PER_TEAM = 2

function requireGame(s: ServerState): Game {
  if (!s.game) throw new GameError('not-in-lobby', 'No game is running')
  return s.game
}

const withPhase = (board: Board, phase: Phase): Board => ({ ...board, phase })

/** "Red" / "Blue", for timeline labels. */
const teamName = (team: Team) => (team === 'red' ? 'Red' : 'Blue')

export function startGame(s: ServerState, words: readonly string[], rand: () => number): ServerState {
  if (s.game) throw new GameError('not-in-lobby', 'A game is already running')
  requireEnoughPlayers(s)
  return dealGame(s, words, rand)
}

function requireEnoughPlayers(s: ServerState) {
  for (const team of ['red', 'blue'] as Team[]) {
    if (s.roster.order[team].length < MIN_PER_TEAM) {
      throw new GameError('not-enough-players', `Each team needs at least ${MIN_PER_TEAM} players`)
    }
  }
}

/** Picks clue-givers and deals a fresh board, keeping the roster. */
export function dealGame(s: ServerState, words: readonly string[], rand: () => number): ServerState {
  const { state, clueGivers } = pickClueGivers(s)
  return { ...state, game: { board: newBoard(words, rand), history: [], timeline: [], clueGivers, votes: {} } }
}

export function guessersOf(s: ServerState, team: Team): Seat[] {
  const clueGiver = s.game?.clueGivers[team] ?? null
  return s.roster.order[team].filter((id) => id !== clueGiver).map((id) => s.roster.seats[id])
}

/** Connected guessers on the guessing team; empty outside the guess phase. */
export function voters(s: ServerState): string[] {
  const phase = s.game?.board.phase
  if (phase?.name !== 'guess') return []
  return guessersOf(s, phase.team)
    .filter(isConnected)
    .map((seat) => seat.id)
}

export function remaining(board: Board, team: Team): number {
  return board.cards.filter((c) => c.color === team && !c.revealed).length
}

export function giveClue(s: ServerState, seatId: string, rawWord: string, number: number): ServerState {
  const game = requireGame(s)
  const { phase } = game.board
  if (phase.name !== 'clue' || game.clueGivers[phase.team] !== seatId) {
    throw new GameError('not-your-turn', "It isn't your turn to give a clue")
  }
  const word = rawWord.trim()
  if (!Number.isInteger(number) || number < 1 || number > 9) {
    throw new GameError('invalid-clue', 'The number must be 1–9')
  }
  if (!CLUE_WORD.test(word)) {
    throw new GameError('invalid-clue', 'A clue is one word (letters and hyphens)')
  }
  const lower = word.toLowerCase()
  if (game.board.cards.some((c) => c.word.toLowerCase() === lower)) {
    throw new GameError('invalid-clue', "The clue can't be a word on the board")
  }
  const clue = { team: phase.team, word, number }
  return commit(
    s,
    {
      ...game.board,
      clues: [...game.board.clues, clue],
      phase: { name: 'guess', team: phase.team, clue, guessesLeft: number + 1, guessesMade: 0 },
    },
    `${teamName(phase.team)} clue: ${word.toUpperCase()} ${number}`,
  )
}

function requireVoter(s: ServerState, seatId: string): Game {
  const game = requireGame(s)
  if (!voters(s).includes(seatId)) throw new GameError('not-your-turn', "It isn't your turn to guess")
  return game
}

function withVote(s: ServerState, game: Game, seatId: string, vote: number | 'end' | null): ServerState {
  const votes = { ...game.votes }
  if (vote === null) delete votes[seatId]
  else votes[seatId] = vote
  return { ...s, game: { ...game, votes } }
}

export function castVote(s: ServerState, seatId: string, card: number): ServerState {
  const game = requireVoter(s, seatId)
  if (!Number.isInteger(card) || card < 0 || card >= BOARD_CELLS || game.board.cards[card]?.revealed !== false) {
    throw new GameError('invalid-vote', "That card can't be picked")
  }
  const next = game.votes[seatId] === card ? null : card
  return settleVotes(withVote(s, game, seatId, next))
}

export function castEndVote(s: ServerState, seatId: string): ServerState {
  const game = requireVoter(s, seatId)
  const { phase } = game.board
  if (phase.name !== 'guess' || phase.guessesMade < 1) {
    throw new GameError('invalid-vote', 'Make at least one guess before ending the turn')
  }
  const next = game.votes[seatId] === 'end' ? null : 'end'
  return settleVotes(withVote(s, game, seatId, next))
}

/** Reveals or ends the turn when every connected guesser agrees. */
export function settleVotes(s: ServerState): ServerState {
  const ids = voters(s)
  if (!s.game || ids.length === 0) return s
  const first = s.game.votes[ids[0]]
  if (first === undefined || !ids.every((id) => s.game!.votes[id] === first)) return s
  return first === 'end' ? endTurn(s) : reveal(s, first)
}

export function reveal(s: ServerState, card: number): ServerState {
  const game = requireGame(s)
  const { phase } = game.board
  if (phase.name !== 'guess') return s
  const cards = game.board.cards.map((c, i) => (i === card ? { ...c, revealed: true } : c))
  const board: Board = { ...game.board, cards }
  const color = cards[card].color
  const guessing = phase.team
  const label = `${teamName(guessing)} revealed ${cards[card].word.toUpperCase()} (${color})`
  const wins = (team: Team) => `${label} — ${teamName(team)} wins`

  if (color === 'assassin') {
    const winner = otherTeam(guessing)
    return commit(s, withPhase(board, { name: 'over', winner, reason: 'assassin' }), wins(winner))
  }
  for (const team of [guessing, otherTeam(guessing)]) {
    if (remaining(board, team) === 0) {
      return commit(s, withPhase(board, { name: 'over', winner: team, reason: 'cards' }), wins(team))
    }
  }
  if (color === guessing) {
    const guessesLeft = phase.guessesLeft - 1
    if (guessesLeft > 0) {
      return commit(s, withPhase(board, { ...phase, guessesLeft, guessesMade: phase.guessesMade + 1 }), label)
    }
  }
  return commit(s, withPhase(board, { name: 'clue', team: otherTeam(guessing) }), label)
}

/** Host correction: hand play to the other team. */
export function skipTurn(s: ServerState): ServerState {
  const phase = s.game?.board.phase
  const team = phase && (phase.name === 'clue' || phase.name === 'guess') ? phase.team : null
  return endTurn(s, { undoable: false, label: team ? `Host skipped ${teamName(team)}'s turn` : 'Host skipped the turn' })
}

/** Host correction: give a team's key to another player for the rest of this game. */
export function makeClueGiver(s: ServerState, seatId: string): ServerState {
  const seat = seatOf(s, seatId)
  if (!seat) throw new GameError('unknown-player', 'No such player')
  const game = requireGame(s)
  const label = `Host made ${seat.name} ${teamName(seat.team)}'s clue-giver`
  return {
    ...s,
    game: { ...logged(game, label), clueGivers: { ...game.clueGivers, [seat.team]: seatId }, votes: {} },
  }
}

/**
 * Host: move a player to another team — in the lobby, or mid-game as a guesser.
 * A current clue-giver can't move mid-game: they would take the key across.
 */
export function moveSeat(s: ServerState, seatId: string, team: Team): ServerState {
  if (!seatOf(s, seatId)) throw new GameError('unknown-player', 'No such player')
  const game = s.game
  if (game && (game.clueGivers.red === seatId || game.clueGivers.blue === seatId)) {
    throw new GameError('clue-giver-locked', 'Make someone else clue-giver before moving this player')
  }
  return settleVotes(assignTeam(s, seatId, team))
}

export function newGame(s: ServerState, words: readonly string[], rand: () => number): ServerState {
  requireGame(s)
  requireEnoughPlayers(s)
  return dealGame(s, words, rand)
}

export function backToLobby(s: ServerState): ServerState {
  return { ...s, game: null }
}

export function endTurn(s: ServerState, { label, ...options }: CommitOptions & { label?: string } = {}): ServerState {
  const game = requireGame(s)
  const { phase } = game.board
  if (phase.name !== 'clue' && phase.name !== 'guess') return s
  const next = withPhase(game.board, { name: 'clue', team: otherTeam(phase.team) })
  return commit(s, next, label ?? `${teamName(phase.team)} ended their turn`, options)
}
