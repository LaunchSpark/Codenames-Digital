import { useState } from 'react'
import { UsersRound } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { TEAM_NAME } from '../components/teams'
import type { ClientMessage, GameView, Team } from '../shared/protocol'
import { keepAwake } from '../wake/keepAwake'
import '../components/lobby.css'

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
    // Inside the tap: the only moment the wake lock / looping video may start.
    // Keep this synchronous — after an await, phones refuse it silently.
    keepAwake()
    send({ type: 'join', name: trimmed, team })
  }

  return (
    // Everything sits at the top, so the Join buttons stay above the keyboard
    // that opens while you type your name.
    <div className="join-screen">
      <Card className="join-screen__card">
        <CardContent>
          <h1 className="join-screen__title">Join Codenames</h1>
          <form className="join-screen__form" onSubmit={(e) => e.preventDefault()}>
            <div className="join-screen__field">
              <Label htmlFor="player-name">Your name</Label>
              <Input id="player-name" className="h-12 text-base md:text-base" placeholder="e.g. Alex"
                value={name} maxLength={20} autoComplete="nickname" autoCapitalize="words"
                enterKeyHint="done" onChange={(e) => setName(e.target.value)} />
            </div>
            {midGame && <p className="join-screen__note">Game in progress &mdash; you'll join as a guesser</p>}
            <fieldset>
              <legend className="sr-only">Choose your team</legend>
              <div className="join-screen__teams">
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
    </div>
  )
}
