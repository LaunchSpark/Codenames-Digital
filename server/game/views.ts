import type { CardView, GameView, Team, TeamView, You } from '../../src/shared/protocol'
import { dueClueGiver, isConnected, seatOf } from './roster'
import { cardsOf, remaining, voters } from './rules'
import type { ServerState } from './state'
import { canUndo, timelineLabels } from './undo'

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
  const vote = game?.votes[seat.id]
  const pending = game?.pendingClue?.clue ?? null
  const rejected = game?.rejectedClue ?? null
  const isGiver = (team: Team) => game?.clueGivers[team] === seat.id
  return {
    kind: 'player',
    id: seat.id,
    team: seat.team,
    role,
    votes: cardsOf(vote),
    votedEnd: vote === 'end',
    // Only the two clue-givers ever see a clue before it's approved.
    pendingClue: pending && (isGiver('red') || isGiver('blue')) ? pending : null,
    rejectedClue: rejected && isGiver(rejected.team) ? rejected : null,
  }
}

/** Builds what one device may see. The only place hidden colours are filtered. */
export function viewFor(
  s: ServerState,
  viewer: Viewer,
  joinUrl: string,
  picturesAvailable = false,
): { view: GameView; you: You } {
  const game = s.game
  const voterIds = voters(s)
  const votes = voterIds.map((id) => game?.votes[id])
  const key = seesKey(s, viewer)

  const board: CardView[] | null = game
    ? game.board.cards.map((card, i) => ({
        word: card.word,
        revealed: card.revealed,
        color: card.revealed || key ? card.color : null,
        votes: votes.filter((v) => cardsOf(v).includes(i)).length,
      }))
    : null

  const teamView = (team: Team): TeamView => ({
    team,
    players: s.roster.order[team].map((id) => {
      const seat = s.roster.seats[id]
      return { id, name: seat.name, team, connected: isConnected(seat) }
    }),
    clueGiverId: game?.clueGivers[team] ?? null,
    nextClueGiverId: game ? null : dueClueGiver(s, team),
    remaining: game ? remaining(game.board, team) : null,
  })

  const [red, blue] = TEAMS.map(teamView)
  return {
    view: {
      mode: s.mode,
      deck: s.deck,
      picturesAvailable,
      phase: game?.board.phase ?? { name: 'lobby' },
      board,
      teams: { red, blue },
      startingTeam: game?.board.startingTeam ?? null,
      clues: game?.board.clues ?? [],
      checking: game?.pendingClue?.clue.team ?? null,
      voterCount: voterIds.length,
      endTurnVotes: votes.filter((v) => v === 'end').length,
      canUndo: canUndo(s),
      timeline: game && viewer.kind === 'tv' && viewer.host ? timelineLabels(game) : null,
      joinUrl,
    },
    you: youFor(s, viewer),
  }
}
