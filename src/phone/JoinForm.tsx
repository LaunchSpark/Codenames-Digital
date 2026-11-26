import { useState } from 'react'
import { UsersRound } from 'lucide-react'
import { LobbyBrand } from '../components/LobbyBrand'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { TEAM_NAME } from '../components/teams'
import type { ClientMessage, GameView, Team } from '../shared/protocol'
import { keepAwake } from '../wake/keepAwake'
import '../components/lobby-preview.css'

interface JoinFormProps {
  view: GameView
  send: (m: ClientMessage) => void
  disabled: boolean
}

export function JoinForm({ view, send, disabled }: JoinFormProps) {
  const [name, setName] = useState('')
  const midGame = view.phase.name !== 'lobby'
  const trimmed = name.trim()

  const join = (team: Team) => {
    keepAwake()
    send({ type: 'join', name: trimmed, team })
  }

  return (
    <div className="join-preview">
      <LobbyBrand />
      <header className="join-preview__intro">
        <span className="lobby-eyebrow">A GAME OF WORDS & INSTINCT</span>
        <h1>Good clues.<br /><span>Great company.</span></h1>
        <p>Pick a name. Choose a side.</p>
      </header>
      <Card className="join-preview__card">
        <CardHeader>
          <CardTitle className="text-xl">Join the table</CardTitle>
          <CardDescription>Choose a name everyone will recognize.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="join-preview__form" onSubmit={(e) => e.preventDefault()}>
            <div className="join-preview__field">
              <Label htmlFor="player-name">Your name</Label>
              <Input id="player-name" className="h-12 text-base md:text-base" placeholder="e.g. Alex"
                value={name} maxLength={20} autoComplete="nickname" autoCapitalize="words"
                enterKeyHint="done" onChange={(e) => setName(e.target.value)} />
            </div>
            {midGame && <p className="join-preview__note">Game in progress &mdash; you'll join as a guesser</p>}
            <fieldset>
              <legend className="join-preview__legend">Choose your team</legend>
              <div className="join-preview__teams">
                {(['red', 'blue'] as Team[]).map((t) => (
                  <Button key={t} type="button" variant="outline"
                    className={`join-team join-team--${t}`} disabled={disabled || !trimmed} onClick={() => join(t)}>
                    <UsersRound aria-hidden="true" />
                    <span>Join {TEAM_NAME[t]}</span>
                    <span className="join-team__count" aria-hidden="true">
                      {view.teams[t].players.length} {view.teams[t].players.length === 1 ? 'player' : 'players'}
                    </span>
                  </Button>
                ))}
              </div>
            </fieldset>
          </form>
        </CardContent>
      </Card>
      <p className="join-preview__footer">One phone per player. One screen for the table.</p>
    </div>
  )
}
