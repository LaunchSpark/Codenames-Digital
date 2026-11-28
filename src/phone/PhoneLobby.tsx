import { Check, UsersRound } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { otherTeam, TEAM_NAME } from '../components/teams'
import type { Team } from '../shared/protocol'
import { myName, type PhoneScreenProps } from './types'
import '../components/lobby.css'

export function PhoneLobby({ view, you, send, disabled }: PhoneScreenProps) {
  const other = otherTeam(you.team)
  const name = myName(view, you)

  return (
    <div className="phone-lobby">
      <header className={`lobby-welcome lobby-welcome--${you.team}`}>
        <span className="lobby-welcome__icon" aria-hidden="true"><Check /></span>
        <Badge variant="outline">You're in, {name}</Badge>
        <h1>You're on {TEAM_NAME[you.team]}</h1>
        <p>Waiting for the host to start&hellip;</p>
        <p className="lobby-welcome__deck">{view.deck === 'pictures' ? 'Picture cards' : 'Word cards'}</p>
      </header>
      <div className="phone-lobby__rosters">
        {(['red', 'blue'] as Team[]).map((t) => (
          <Card key={t} className={`team-card team-card--${t}`}>
            <CardHeader className="team-card__header">
              <h2><UsersRound aria-hidden="true" /> {TEAM_NAME[t]} team</h2>
              <Badge variant="secondary">{view.teams[t].players.length}</Badge>
            </CardHeader>
            <CardContent>
              <ul className="phone-lobby__players">
                {view.teams[t].players.map((p) => (
                  <li key={p.id}>
                    <span className="player-avatar" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
                    <span className="player-name">{p.name}</span>
                    {view.teams[t].nextClueGiverId === p.id && <Badge variant="secondary">clue-giver</Badge>}
                    {p.id === you.id && <Badge variant="outline">you</Badge>}
                  </li>
                ))}
                {view.teams[t].players.length === 0 && <li className="empty-roster">Waiting for teammates</li>}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button type="button" variant="outline" className="h-12 w-full" disabled={disabled}
        onClick={() => send({ type: 'join', name, team: other })}>Switch to {TEAM_NAME[other]}</Button>
      <p className="screen-footer">Keep this screen open. Your next move starts here.</p>
    </div>
  )
}
