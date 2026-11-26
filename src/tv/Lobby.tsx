import { Shuffle, UsersRound, UserRoundPlus, ScanLine } from 'lucide-react'
import { LobbyBrand } from '../components/LobbyBrand'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { otherTeam, TEAM_NAME } from '../components/teams'
import type { ClientMessage, GameView, Team, You } from '../shared/protocol'
import { JoinQr } from './JoinQr'
import '../components/lobby-preview.css'

export interface TvScreenProps {
  view: GameView
  you: Extract<You, { kind: 'tv' }>
  send: (m: ClientMessage) => void
  disabled?: boolean
}

const MIN_PER_TEAM = 2

export function Lobby({ view, you, send, disabled }: TvScreenProps) {
  const ready = (['red', 'blue'] as Team[]).every((t) => view.teams[t].players.length >= MIN_PER_TEAM)
  const playerCount = view.teams.red.players.length + view.teams.blue.players.length

  return (
    <div className="tv-lobby-preview">
      <header className="tv-lobby-preview__header">
        <LobbyBrand />
        <div className="preview-modes" role="group" aria-label="Mode">
          <Button type="button" variant="secondary" aria-pressed="true">VS</Button>
          <Button type="button" variant="ghost" disabled>Coop <Badge variant="outline">Coming soon</Badge></Button>
        </div>
      </header>
      <div className="tv-lobby-preview__intro">
        <div><span className="lobby-eyebrow">GATHER YOUR PEOPLE</span><h1>Every word is a possibility.</h1></div>
        <Badge variant="outline"><UsersRound aria-hidden="true" /> {playerCount} {playerCount === 1 ? 'player' : 'players'} joined</Badge>
      </div>
      <div className="tv-lobby-preview__body">
        <Card className="tv-join-card">
          <CardHeader><h2><ScanLine aria-hidden="true" /> Take a seat.</h2><p>Scan with your phone to join.</p></CardHeader>
          <CardContent>
            <div className="tv-join-card__qr"><JoinQr url={view.joinUrl} /></div>
            <p className="tv-join-card__or">Or open this address</p>
            <p className="tv-join-card__url">{view.joinUrl}</p>
          </CardContent>
        </Card>
        {(['red', 'blue'] as Team[]).map((t) => (
          <Roster key={t} team={t} view={view} host={you.host} send={send} disabled={disabled} />
        ))}
      </div>
      <footer className="tv-lobby-preview__footer">
        <div><strong>{ready ? 'Everyone ready?' : 'The table is coming together.'}</strong>
          <p>{ready ? 'Your clue-givers will be chosen when the game starts.' : 'Each team needs at least 2 players'}</p></div>
        {you.host && <div className="tv-lobby-preview__actions">
          <Button type="button" variant="outline" disabled={disabled || playerCount < 2}
            onClick={() => send({ type: 'host:shuffle-teams' })}><Shuffle aria-hidden="true" />Random teams</Button>
          <Button type="button" disabled={!ready || disabled} onClick={() => send({ type: 'host:start' })}>Start</Button>
        </div>}
      </footer>
    </div>
  )
}

interface RosterProps {
  team: Team
  view: GameView
  host: boolean
  send: (m: ClientMessage) => void
  disabled?: boolean
}

function Roster({ team, view, host, send, disabled }: RosterProps) {
  const { players } = view.teams[team]
  return (
    <Card className={`team-card tv-team-card team-card--${team}`}>
      <CardHeader className="team-card__header">
        <h2><UsersRound aria-hidden="true" />{TEAM_NAME[team]} team</h2>
        <Badge variant="secondary">{players.length}</Badge>
      </CardHeader>
      <CardContent className="tv-team-card__content">
        <ol className="preview-roster" aria-label={`${TEAM_NAME[team]} team`}>
          {players.map((p) => (
            <li key={p.id}>
              <span className="player-avatar" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
              <span className={`player-name${p.connected ? '' : ' is-away'}`}>{p.name}</span>
              <span className={`preview-presence${p.connected ? ' is-online' : ''}`} aria-label={p.connected ? 'connected' : 'disconnected'} />
              {host && <Button type="button" variant="ghost" size="icon" className="preview-roster__move"
                aria-label={`Move ${p.name} to ${TEAM_NAME[otherTeam(team)]}`}
                title={`Move to ${TEAM_NAME[otherTeam(team)]}`} disabled={disabled}
                onClick={() => send({ type: 'host:move-player', playerId: p.id, team: otherTeam(team) })}>
                <UserRoundPlus aria-hidden="true" />
              </Button>}
            </li>
          ))}
        </ol>
        {players.length === 0 && <div className="tv-team-card__empty">
          <UsersRound aria-hidden="true" /><p>A good team starts with you.</p><span>Join from your phone</span>
        </div>}
      </CardContent>
    </Card>
  )
}
