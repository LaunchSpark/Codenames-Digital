import type { Team } from '../../src/shared/protocol'
import { seatOf } from './roster'
import { GameError, type Board, type Game, type ServerState } from './state'

export interface CommitOptions {
  /**
   * False for host corrections: not a clue-giver undo step, and a barrier —
   * clue-giver undo can no longer reach earlier moves, so it can never silently
   * revert the correction. (Host undo still can; see hostUndo.)
   */
  undoable?: boolean
}

/** The game with `label` logged to the host timeline, snapshotting how it looked before. */
export function logged(game: Game, label: string): Game {
  const entry = { label, board: game.board, clueGivers: game.clueGivers, history: game.history }
  return { ...game, timeline: [...game.timeline, entry] }
}

/** Replaces the board, clears votes, logs `label`, and (by default) records the old board for undo. */
export function commit(
  s: ServerState,
  next: Board,
  label: string,
  { undoable = true }: CommitOptions = {},
): ServerState {
  if (!s.game) throw new GameError('not-in-lobby', 'No game is running')
  const game = logged(s.game, label)
  const history = undoable ? [...game.history, game.board] : []
  return { ...s, game: { ...game, board: next, history, votes: {}, pendingClue: null, rejectedClue: null } }
}

export const canUndo = (s: ServerState): boolean => (s.game?.history.length ?? 0) > 0

/** Either current clue-giver steps the board back one move. Roster and clue-givers are untouched. */
export function undo(s: ServerState, seatId: string): ServerState {
  const game = s.game
  if (!game || (game.clueGivers.red !== seatId && game.clueGivers.blue !== seatId)) {
    throw new GameError('not-your-turn', 'Only a clue-giver can undo')
  }
  // The giver takes back a clue that's still being checked: nothing else changes.
  if (game.pendingClue?.by === seatId) return { ...s, game: { ...game, pendingClue: null } }
  if (!canUndo(s)) throw new GameError('nothing-to-undo', 'Nothing to undo')
  const name = seatOf(s, seatId)?.name ?? 'A clue-giver'
  const history = game.history.slice(0, -1)
  const board = game.history[game.history.length - 1]
  return {
    ...s,
    game: { ...logged(game, `${name} pressed Undo`), board, history, votes: {}, pendingClue: null, rejectedClue: null },
  }
}

/**
 * Host undo: steps back through the timeline — clues, reveals, turn ends, the
 * host's own skips and clue-giver changes, and clue-giver undos. Removed
 * players stay removed; a restored clue-giver who has since left becomes null,
 * so the host is asked to pick one.
 */
export function hostUndo(s: ServerState, steps: number): ServerState {
  const game = s.game
  if (!game) throw new GameError('not-in-lobby', 'No game is running')
  if (!Number.isInteger(steps) || steps < 1 || steps > game.timeline.length) {
    throw new GameError('nothing-to-undo', 'Nothing to undo that far back')
  }
  const keep = game.timeline.length - steps
  const entry = game.timeline[keep]
  const stillHere = (team: Team) => {
    const id = entry.clueGivers[team]
    return id && seatOf(s, id)?.team === team ? id : null
  }
  return {
    ...s,
    game: {
      ...game,
      board: entry.board,
      history: entry.history,
      clueGivers: { red: stillHere('red'), blue: stillHere('blue') },
      timeline: game.timeline.slice(0, keep),
      votes: {},
      pendingClue: null,
      rejectedClue: null,
    },
  }
}

export const timelineLabels = (game: Game): string[] => game.timeline.map((e) => e.label)
