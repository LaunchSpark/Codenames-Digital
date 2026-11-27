import { useState } from 'react'
import { ArrowLeftRight, ScanLine, Shuffle, UsersRound, X } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LobbyBrand } from '../components/LobbyBrand'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { otherTeam, TEAM_NAME } from '../components/teams'
import type { ClientMessage, Deck, GameView, PlayerInfo, Team, You } from '../shared/protocol'
import { JoinQr } from './JoinQr'
import '../components/lobby.css'

export interface TvScreenProps {
  view: GameView
  you: Extract<You, { kind: 'tv' }>
  send: (m: ClientMessage) => void
  /** True while the connection is down: actions render but can't be used. */
  disabled?: boolean
}

const MIN_PER_TEAM = 2
const DECKS: [Deck, string][] = [['words', 'Words'], ['pictures', 'Pictures']]

export function Lobby({ view, you, send, disabled }: TvScreenProps) {
  /** Player the host is about to kick, awaiting confirmation. */
  const [removing, setRemoving] = useState<PlayerInfo | null>(null)
  const ready = (['red', 'blue'] as Team[]).every((t) => view.teams[t].players.length >= MIN_PER_TEAM)
  const playerCount = view.teams.red.players.length + view.teams.blue.players.length

  return (
    <div className="tv-lobby">
      <header className="tv-lobby__header">
        <LobbyBrand />
        <div className="tv-lobby__header-end">
          <Badge variant="outline" className="tv-lobby__count"><UsersRound aria-hidden="true" /> {playerCount} {playerCount === 1 ? 'player' : 'players'} joined</Badge>
          <div className="mode-picker" role="group" aria-label="Mode">
            <Button type="button" variant="secondary" aria-pressed="true">VS</Button>
            <Button type="button" variant="ghost" disabled>Coop <Badge variant="outline">Coming soon</Badge></Button>
          </div>
          <div className="mode-picker" role="group" aria-label="Deck">
            {DECKS.map(([deck, label]) => (
              <Button key={deck} type="button" variant={view.deck === deck ? 'secondary' : 'ghost'}
                aria-pressed={view.deck === deck}
                disabled={!you.host || disabled || (deck === 'pictures' && !view.picturesAvailable)}
                onClick={() => send({ type: 'host:set-deck', deck })}>{label}</Button>
            ))}
          </div>
        </div>
      </header>
      <div className="tv-lobby__body">
        <Card className="tv-join-card">
          <CardHeader><h2><ScanLine aria-hidden="true" /> Take a seat.</h2><p>Scan with your phone to join.</p></CardHeader>
          <CardContent>
            <div className="tv-join-card__qr"><JoinQr url={view.joinUrl} /></div>
            <p className="tv-join-card__or">Or open this address</p>
            <p className="tv-join-card__url">{view.joinUrl}</p>
          </CardContent>
        </Card>
        {(['red', 'blue'] as Team[]).map((t) => (
          <Roster key={t} team={t} view={view} host={you.host} send={send} disabled={disabled} onRemove={setRemoving} />
        ))}
      </div>
      <footer className="tv-lobby__footer">
        <div><strong>{ready ? 'Everyone ready?' : 'The table is coming together.'}</strong>
          <p>{ready ? 'Your clue-givers will be chosen when the game starts.' : 'Each team needs at least 2 players'}{view.deck === 'pictures' && ' · 20 picture cards, 5×4.'}</p></div>
        {you.host && <div className="tv-lobby__actions">
          <Button type="button" variant="outline" disabled={disabled || playerCount < 2}
            onClick={() => send({ type: 'host:shuffle-teams' })}><Shuffle aria-hidden="true" />Random teams</Button>
          <Button type="button" disabled={!ready || disabled} onClick={() => send({ type: 'host:start' })}>Start</Button>
        </div>}
      </footer>
      {removing && (
        <ConfirmDialog
          message={`Remove ${removing.name} from the game?`}
          confirmLabel="Yes, remove"
          disabled={disabled}
          onConfirm={() => {
            // The kicked phone drops back to the join form, name empty.
            send({ type: 'host:remove-player', playerId: removing.id })
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}

interface RosterProps {
  team: Team
  view: GameView
  /** Host gets a move-to-other-team button per player. */
  host: boolean
  send: (m: ClientMessage) => void
  disabled?: boolean
  /** Host: ask to kick this player. */
  onRemove: (p: PlayerInfo) => void
}

function Roster({ team, view, host, send, disabled, onRemove }: RosterProps) {
  const { players } = view.teams[team]
  return (
    <Card className={`team-card tv-team-card team-card--${team}`}>
      <CardHeader className="team-card__header">
        <h2><UsersRound aria-hidden="true" />{TEAM_NAME[team]} team</h2>
        <Badge variant="secondary">{players.length}</Badge>
      </CardHeader>
      <CardContent className="tv-team-card__content">
        <ol className="lobby-roster" aria-label={`${TEAM_NAME[team]} team`}>
          {players.map((p) => (
            <li key={p.id}>
              <span className="player-avatar" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
              <span className={`player-name${p.connected ? '' : ' is-away'}`}>{p.name}</span>
              {p.connected
                ? <span className="presence is-online" aria-label="connected" />
                : <Badge variant="outline" className="presence-away">away</Badge>}
              {host && <Button type="button" variant="ghost" size="icon" className="lobby-roster__move"
                aria-label={`Move ${p.name} to ${TEAM_NAME[otherTeam(team)]}`}
                title={`Move to ${TEAM_NAME[otherTeam(team)]}`} disabled={disabled}
                onClick={() => send({ type: 'host:move-player', playerId: p.id, team: otherTeam(team) })}>
                <ArrowLeftRight aria-hidden="true" />
              </Button>}
              {host && <Button type="button" variant="ghost" size="icon" className="lobby-roster__move lobby-roster__remove"
                aria-label={`Remove ${p.name}`} title="Remove from the game" disabled={disabled}
                onClick={() => onRemove(p)}>
                <X aria-hidden="true" />
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
