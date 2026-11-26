import type { CardView, GameView, Team, TeamView, You } from '../../src/shared/protocol'
import { isConnected, seatOf } from './roster'
import { remaining, voters } from './rules'
import type { ServerState } from './state'
import { canUndo } from './undo'

export type Viewer = { kind: 'tv'; host: boolean } | { kind: 'spectator' } | { kind: 'player'; seatId: string }

const TEAMS: Team[] = ['red', 'blue']

/** Whether this viewer may see the colours of unrevealed cards. */
function seesKey(s: ServerState, viewer: Viewer): boolean {
  const game = s.game
  if (!game) return false
  if (game.board.phase.name === 'over') return true
  return viewer.kind === 'player' && (game.clueGivers.red === viewer.seatId || game.clueGivers.blue === viewer.seatId)
}

function youFor(s: ServerState, viewer: Viewer): You {
  if (viewer.kind !== 'player') return viewer
  const seat = seatOf(s, viewer.seatId)
  if (!seat) return { kind: 'spectator' }
  const game = s.game
  const role = !game ? null : game.clueGivers[seat.team] === seat.id ? 'clue-giver' : 'guesser'
  return { kind: 'player', id: seat.id, team: seat.team, role, vote: game?.votes[seat.id] ?? null }
}

/** Builds what one device may see. The only place hidden colours are filtered. */
export function viewFor(s: ServerState, viewer: Viewer, joinUrl: string): { view: GameView; you: You } {
  const game = s.game
  const voterIds = voters(s)
  const votes = voterIds.map((id) => game?.votes[id])
  const key = seesKey(s, viewer)

  const board: CardView[] | null = game
    ? game.board.cards.map((card, i) => ({
        word: card.word,
        revealed: card.revealed,
        color: card.revealed || key ? card.color : null,
        votes: votes.filter((v) => v === i).length,
      }))
    : null

  const teamView = (team: Team): TeamView => ({
    team,
    players: s.roster.order[team].map((id) => {
      const seat = s.roster.seats[id]
      return { id, name: seat.name, team, connected: isConnected(seat) }
    }),
    clueGiverId: game?.clueGivers[team] ?? null,
    remaining: game ? remaining(game.board, team) : null,
  })

  const [red, blue] = TEAMS.map(teamView)
  return {
    view: {
      mode: s.mode,
      phase: game?.board.phase ?? { name: 'lobby' },
      board,
      teams: { red, blue },
      startingTeam: game?.board.startingTeam ?? null,
      clues: game?.board.clues ?? [],
      voterCount: voterIds.length,
      endTurnVotes: votes.filter((v) => v === 'end').length,
      canUndo: canUndo(s),
      joinUrl,
    },
    you: youFor(s, viewer),
  }
}
