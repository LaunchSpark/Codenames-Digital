import { otherTeam, TEAM_NAME } from '../components/teams'
import type { ClientMessage, GameView, Team, You } from '../shared/protocol'
import { JoinQr } from './JoinQr'

export interface TvScreenProps {
  view: GameView
  you: Extract<You, { kind: 'tv' }>
  send: (m: ClientMessage) => void
  /** True while the connection is down: actions render but can't be used. */
  disabled?: boolean
}

const MIN_PER_TEAM = 2

export function Lobby({ view, you, send, disabled }: TvScreenProps) {
  const ready = (['red', 'blue'] as Team[]).every((t) => view.teams[t].players.length >= MIN_PER_TEAM)

  return (
    <div className="tv-lobby">
      <header className="tv-lobby__head">
        <h1 className="tv-title">Codenames</h1>
        <div className="mode-picker" role="group" aria-label="Mode">
          <button type="button" className="mode" aria-pressed="true">
            VS
          </button>
          <button type="button" className="mode" disabled>
            Coop <span className="mode__soon">Coming soon</span>
          </button>
        </div>
      </header>

      <section className="tv-lobby__join">
        <JoinQr url={view.joinUrl} className="tv-lobby__qr" />
        <p className="tv-lobby__hint">Scan to join, or open</p>
        <p className="tv-lobby__url">{view.joinUrl}</p>
      </section>

      <section className="tv-lobby__teams">
        {(['red', 'blue'] as Team[]).map((t) => (
          <Roster key={t} team={t} view={view} host={you.host} send={send} disabled={disabled} />
        ))}
      </section>

      {you.host && (
        <footer className="tv-lobby__start">
          <button
            type="button"
            className="btn btn--primary btn--huge"
            disabled={!ready || disabled}
            onClick={() => send({ type: 'host:start' })}
          >
            Start
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={disabled || view.teams.red.players.length + view.teams.blue.players.length < 2}
            onClick={() => send({ type: 'host:shuffle-teams' })}
          >
            Random teams
          </button>
          <p className="tv-lobby__need" style={{ visibility: ready ? 'hidden' : 'visible' }} aria-hidden={ready}>
            Each team needs at least 2 players
          </p>
        </footer>
      )}
    </div>
  )
}

interface RosterProps {
  team: Team
  view: GameView
  /** Host gets a swap button per player. */
  host: boolean
  send: (m: ClientMessage) => void
  disabled?: boolean
}

function Roster({ team, view, host, send, disabled }: RosterProps) {
  const { players } = view.teams[team]
  return (
    <div className={`roster roster--${team}`}>
      <h2 className="roster__title">
        {TEAM_NAME[team]} <span className="roster__count">{players.length}</span>
      </h2>
      <ol className="roster__list" aria-label={`${TEAM_NAME[team]} team`}>
        {players.map((p) => (
          <li key={p.id} className={p.connected ? '' : 'is-away'}>
            <span
              className={`dot ${p.connected ? 'dot--on' : 'dot--off'}`}
              aria-label={p.connected ? 'connected' : 'disconnected'}
            />
            <span className="roster__name">{p.name}</span>
            {host && (
              <button
                type="button"
                className="roster__move"
                aria-label={`Move ${p.name} to ${TEAM_NAME[otherTeam(team)]}`}
                title={`Move to ${TEAM_NAME[otherTeam(team)]}`}
                disabled={disabled}
                onClick={() => send({ type: 'host:move-player', playerId: p.id, team: otherTeam(team) })}
              >
                ⇄
              </button>
            )}
          </li>
        ))}
        {players.length === 0 && <li className="roster__empty" aria-hidden="true" />}
      </ol>
    </div>
  )
}
