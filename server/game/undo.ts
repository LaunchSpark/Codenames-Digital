import { GameError, type Board, type ServerState } from './state'

export interface CommitOptions {
  /** False for host corrections, which are not undo steps. */
  undoable?: boolean
}

/** Replaces the board, clears votes, and (by default) records the old board for undo. */
export function commit(s: ServerState, next: Board, { undoable = true }: CommitOptions = {}): ServerState {
  const game = s.game
  if (!game) throw new GameError('not-in-lobby', 'No game is running')
  const history = undoable ? [...game.history, game.board] : game.history
  return { ...s, game: { ...game, board: next, history, votes: {} } }
}

export const canUndo = (s: ServerState): boolean => (s.game?.history.length ?? 0) > 0

/** Either current clue-giver steps the board back one move. Roster and clue-givers are untouched. */
export function undo(s: ServerState, seatId: string): ServerState {
  const game = s.game
  if (!game || (game.clueGivers.red !== seatId && game.clueGivers.blue !== seatId)) {
    throw new GameError('not-your-turn', 'Only a clue-giver can undo')
  }
  if (!canUndo(s)) throw new GameError('nothing-to-undo', 'Nothing to undo')
  const history = game.history.slice(0, -1)
  return { ...s, game: { ...game, board: game.history[game.history.length - 1], history, votes: {} } }
}
