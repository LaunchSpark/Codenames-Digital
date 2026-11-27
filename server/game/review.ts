import type { Team } from '../../src/shared/protocol'
import { otherTeam } from './board'
import { isConnected, seatOf } from './roster'
import { commitClue, settleVotes, validateClue } from './rules'
import { GameError, type Seat, type ServerState } from './state'

/**
 * Clue review: a clue waits on `Game.pendingClue` (outside Board, so undo and
 * the timeline never see it) until the other team's clue-giver rules on it.
 * With no clue-giver on the other team it goes straight through. A clue-giver
 * who is merely offline (a refresh, a locked phone) gets a grace period: the
 * hub calls `expireClue` once it runs out (see `awaitingReturn`).
 */

/** The clue-giver who checks `team`'s clues, if there is one and they're connected. */
/** Whether the other team has a clue-giver at all, connected or not. */
const hasChecker = (s: ServerState, team: Team): boolean => Boolean(s.game?.clueGivers[otherTeam(team)])

export function checkerOf(s: ServerState, team: Team): Seat | null {
  const id = s.game?.clueGivers[otherTeam(team)]
  const seat = id ? seatOf(s, id) : undefined
  return seat && isConnected(seat) ? seat : null
}

export function submitClue(s: ServerState, seatId: string, rawWord: string, number: number): ServerState {
  const clue = validateClue(s, seatId, rawWord, number)
  const game = s.game!
  if (game.pendingClue) throw new GameError('not-your-turn', 'Your clue is still being checked')
  if (!hasChecker(s, clue.team)) return commitClue(s, clue)
  return { ...s, game: { ...game, pendingClue: { clue, by: seatId }, rejectedClue: null } }
}

/** The checking clue-giver approves (commits) or rejects (hands back) the waiting clue. */
export function clueVerdict(
  s: ServerState,
  seatId: string,
  approve: boolean,
  expected?: { word: string; number: number },
): ServerState {
  const game = s.game
  const pending = game?.pendingClue
  if (!game || !pending || game.clueGivers[otherTeam(pending.clue.team)] !== seatId) {
    throw new GameError('not-your-turn', 'There is no clue for you to check')
  }
  if (expected && (expected.word !== pending.clue.word || expected.number !== pending.clue.number)) {
    throw new GameError('not-your-turn', 'That clue was changed — check the new one')
  }
  if (approve) return commitClue(s, pending.clue)
  return { ...s, game: { ...game, pendingClue: null, rejectedClue: pending.clue } }
}

/** The giver takes back their waiting clue. A no-op once it's been approved, rejected or dropped. */
export function withdrawClue(s: ServerState, seatId: string): ServerState {
  const game = s.game
  if (!game || game.pendingClue?.by !== seatId) return s
  return { ...s, game: { ...game, pendingClue: null } }
}

/** Drops a waiting clue whose giver was replaced; commits one the other team has no clue-giver to check. */
export function settleClue(s: ServerState): ServerState {
  const game = s.game
  const pending = game?.pendingClue
  if (!game || !pending) return s
  if (game.clueGivers[pending.clue.team] !== pending.by) return { ...s, game: { ...game, pendingClue: null } }
  return hasChecker(s, pending.clue.team) ? s : commitClue(s, pending.clue)
}

/** A clue is waiting on a checker who is offline: the hub gives them a grace period to come back. */
export function awaitingReturn(s: ServerState): boolean {
  const pending = s.game?.pendingClue
  return Boolean(pending && hasChecker(s, pending.clue.team) && !checkerOf(s, pending.clue.team))
}

/** The grace period ran out: approve the waiting clue if its checker is still offline. */
export function expireClue(s: ServerState): ServerState {
  return awaitingReturn(s) ? commitClue(s, s.game!.pendingClue!.clue) : s
}

/** After any roster or connection change: votes, then the waiting clue. */
export const settle = (s: ServerState): ServerState => settleClue(settleVotes(s))

