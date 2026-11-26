import type { Team } from '../../src/shared/protocol'
import { GameError, type Game, type Seat, type ServerState } from './state'

const MAX_NAME = 20

export function emptyState(): ServerState {
  return {
    mode: 'vs',
    roster: { seats: {}, order: { red: [], blue: [] }, nextClueGiver: { red: 0, blue: 0 } },
    game: null,
  }
}

export const isConnected = (seat: Seat): boolean => seat.connections > 0

/** Own-property lookup, so ids like "toString" or "__proto__" are simply unknown. */
export const seatOf = (s: ServerState, id: string): Seat | undefined =>
  Object.hasOwn(s.roster.seats, id) ? s.roster.seats[id] : undefined

export const seatByToken = (s: ServerState, token: string): Seat | undefined =>
  Object.values(s.roster.seats).find((seat) => seat.token === token)

function validName(s: ServerState, raw: string, selfId?: string): string {
  const name = raw.trim()
  if (name.length < 1 || name.length > MAX_NAME) {
    throw new GameError('name-invalid', `Names must be 1–${MAX_NAME} characters`)
  }
  const lower = name.toLowerCase()
  const taken = Object.values(s.roster.seats).some(
    (seat) => seat.id !== selfId && seat.name.toLowerCase() === lower,
  )
  if (taken) throw new GameError('name-taken', `"${name}" is already taken`)
  return name
}

export function addSeat(
  s: ServerState,
  seat: { id: string; token: string; name: string; team: Team },
): ServerState {
  const name = validName(s, seat.name)
  const { roster } = s
  return {
    ...s,
    roster: {
      ...roster,
      seats: { ...roster.seats, [seat.id]: { ...seat, name, connections: 1 } },
      order: { ...roster.order, [seat.team]: [...roster.order[seat.team], seat.id] },
    },
  }
}

export function changeSeat(s: ServerState, id: string, rawName: string, team: Team): ServerState {
  if (s.game) throw new GameError('not-in-lobby', 'Teams are locked while a game is running')
  const seat = seatOf(s, id)
  if (!seat) throw new GameError('unknown-player', 'No such player')
  const name = validName(s, rawName, id)
  const { roster } = s
  const order =
    team === seat.team
      ? roster.order
      : {
          ...roster.order,
          [seat.team]: roster.order[seat.team].filter((x) => x !== id),
          [team]: [...roster.order[team], id],
        }
  return { ...s, roster: { ...roster, seats: { ...roster.seats, [id]: { ...seat, name, team } }, order } }
}

const withoutVote = (game: Game, id: string): Game => {
  if (!(id in game.votes)) return game
  const votes = { ...game.votes }
  delete votes[id]
  return { ...game, votes }
}

export function removeSeat(s: ServerState, id: string): ServerState {
  const seat = seatOf(s, id)
  if (!seat) throw new GameError('unknown-player', 'No such player')
  const seats = { ...s.roster.seats }
  delete seats[id]
  const order = { ...s.roster.order, [seat.team]: s.roster.order[seat.team].filter((x) => x !== id) }

  let game = s.game
  if (game) {
    game = withoutVote(game, id)
    if (game.clueGivers[seat.team] === id) {
      game = { ...game, clueGivers: { ...game.clueGivers, [seat.team]: null } }
    }
  }
  return { ...s, roster: { ...s.roster, seats, order }, game }
}

export function setConnected(s: ServerState, id: string, delta: 1 | -1): ServerState {
  const seat = seatOf(s, id)
  if (!seat) return s
  const connections = Math.max(0, seat.connections + delta)
  const game = s.game && connections === 0 ? withoutVote(s.game, id) : s.game
  return {
    ...s,
    roster: { ...s.roster, seats: { ...s.roster.seats, [id]: { ...seat, connections } } },
    game,
  }
}

/** Assigns each team's clue-giver for a new game from the rotation, then advances it. */
export function pickClueGivers(s: ServerState): { state: ServerState; clueGivers: Record<Team, string | null> } {
  const { order, nextClueGiver } = s.roster
  const next = { ...nextClueGiver }
  const clueGivers: Record<Team, string | null> = { red: null, blue: null }
  for (const team of ['red', 'blue'] as Team[]) {
    const ids = order[team]
    if (!ids.length) continue
    // Pass over disconnected players; if nobody is connected, take whoever is due.
    const start = next[team] % ids.length
    let skip = ids.findIndex((_, k) => isConnected(s.roster.seats[ids[(start + k) % ids.length]]))
    if (skip < 0) skip = 0
    clueGivers[team] = ids[(start + skip) % ids.length]
    next[team] += skip + 1
  }
  return { state: { ...s, roster: { ...s.roster, nextClueGiver: next } }, clueGivers }
}
