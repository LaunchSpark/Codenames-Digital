import { otherTeam, TEAM_NAME } from '../components/teams'
import type { Team } from '../shared/protocol'
import { myName, type PhoneScreenProps } from './types'

export function PhoneLobby({ view, you, send, disabled }: PhoneScreenProps) {
  const other = otherTeam(you.team)
  const name = myName(view, you)

  return (
    <div className="phone-lobby">
      <h1 className={`team-text-${you.team}`}>You're on {TEAM_NAME[you.team]}</h1>
      <p className="phone-muted">Waiting for the host to start…</p>

      {(['red', 'blue'] as Team[]).map((t) => (
        <section key={t} className={`phone-roster phone-roster--${t}`}>
          <h2>{TEAM_NAME[t]}</h2>
          <ul>
            {view.teams[t].players.map((p) => (
              <li key={p.id} className={p.id === you.id ? 'is-me' : undefined}>
                {p.name}
                {p.id === you.id && ' (you)'}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <button
        type="button"
        className={`btn btn--${other}`}
        disabled={disabled}
        onClick={() => send({ type: 'join', name, team: other })}
      >
        Switch to {TEAM_NAME[other]}
      </button>
    </div>
  )
}
