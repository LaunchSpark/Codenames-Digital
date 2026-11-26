import { useState } from 'react'
import { TEAM_NAME } from '../components/teams'
import type { ClientMessage, GameView, PlayerInfo, Team } from '../shared/protocol'

interface HostMenuProps {
  view: GameView
  send: (m: ClientMessage) => void
  disabled?: boolean
}

const TEAMS: Team[] = ['red', 'blue']

/**
 * Mid-game fixes for the host. Opens on its own when a team has lost its
 * clue-giver, because play can't continue until one is picked.
 */
export function HostMenu({ view, send, disabled }: HostMenuProps) {
  const [userOpen, setUserOpen] = useState(false)
  const [removing, setRemoving] = useState<PlayerInfo | null>(null)

  const needsPick = TEAMS.filter((t) => view.teams[t].clueGiverId === null)
  const open = userOpen || needsPick.length > 0

  return (
    <div className={`host-menu${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="btn btn--ghost host-menu__toggle"
        aria-expanded={open}
        onClick={() => setUserOpen((o) => !o)}
      >
        Host menu
      </button>

      {open && (
        <div className="host-menu__panel">
          {TEAMS.map((t) => {
            const { players, clueGiverId } = view.teams[t]
            return (
              <section key={t} className={`host-menu__section roster--${t}`}>
                <h3 className={clueGiverId === null ? 'host-menu__prompt' : undefined}>
                  {clueGiverId === null
                    ? `Pick a new clue-giver for ${TEAM_NAME[t]}`
                    : `${TEAM_NAME[t]} clue-giver`}
                </h3>
                <div className="host-menu__players">
                  {players.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="chip"
                      aria-pressed={p.id === clueGiverId}
                      disabled={disabled || p.id === clueGiverId}
                      onClick={() => send({ type: 'host:make-clue-giver', playerId: p.id })}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </section>
            )
          })}

          <section className="host-menu__section">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={disabled}
              onClick={() => send({ type: 'host:skip-turn' })}
            >
              Skip turn
            </button>
          </section>

          <section className="host-menu__section">
            <h3>Remove a player</h3>
            {removing ? (
              <div className="host-menu__confirm">
                <p>Remove {removing.name} from the game?</p>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={disabled}
                  onClick={() => {
                    send({ type: 'host:remove-player', playerId: removing.id })
                    setRemoving(null)
                  }}
                >
                  Yes, remove
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setRemoving(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="host-menu__players">
                {TEAMS.flatMap((t) => view.teams[t].players).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`chip chip--${p.team}`}
                    aria-label={`Remove ${p.name}`}
                    disabled={disabled}
                    onClick={() => setRemoving(p)}
                  >
                    ✕ {p.name}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
