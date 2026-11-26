import { useState } from 'react'
import { TEAM_NAME } from '../components/teams'
import type { ClientMessage, GameView, Team } from '../shared/protocol'
import { keepAwake } from '../wake/keepAwake'

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
    // Inside the tap: the only moment the wake lock / video may start.
    keepAwake()
    send({ type: 'join', name: trimmed, team })
  }

  return (
    <form className="phone-join" onSubmit={(e) => e.preventDefault()}>
      <h1>Codenames</h1>
      {midGame && <p className="phone-join__note">Game in progress — you'll join as a guesser</p>}

      <label className="field">
        <span className="field__label">Your name</span>
        <input
          className="field__input"
          value={name}
          maxLength={20}
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="done"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <div className="phone-join__teams">
        {(['red', 'blue'] as Team[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`btn btn--${t} phone-join__team`}
            disabled={disabled || trimmed === ''}
            onClick={() => join(t)}
          >
            Join {TEAM_NAME[t]}
            <span className="phone-join__count" aria-hidden="true">{view.teams[t].players.length} players</span>
          </button>
        ))}
      </div>
    </form>
  )
}
