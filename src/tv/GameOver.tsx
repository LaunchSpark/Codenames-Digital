import { WordGrid } from '../components/WordGrid'
import { otherTeam, TEAM_NAME } from '../components/teams'
import type { TvScreenProps } from './Lobby'

export function GameOver({ view, you, send, disabled }: TvScreenProps) {
  if (view.phase.name !== 'over') return null
  const { winner, reason } = view.phase
  const why =
    reason === 'assassin'
      ? `${TEAM_NAME[otherTeam(winner)]} hit the assassin`
      : `${TEAM_NAME[winner]} found all their agents`

  return (
    <div className="tv-over">
      <header className={`tv-over__head team-${winner}`}>
        <h1 className="tv-title">{TEAM_NAME[winner]} wins</h1>
        <p className="tv-over__why">{why}</p>
      </header>

      {view.board && <WordGrid cards={view.board} showPips={false} voterCount={0} variant="tv" />}

      {you.host && (
        <footer className="tv-over__actions">
          <button
            type="button"
            className="btn btn--primary btn--huge"
            disabled={disabled}
            onClick={() => send({ type: 'host:new-game' })}
          >
            New game
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--huge"
            disabled={disabled}
            onClick={() => send({ type: 'host:lobby' })}
          >
            Back to lobby
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--huge"
            disabled={disabled || !view.timeline?.length}
            onClick={() => send({ type: 'host:undo', steps: 1 })}
          >
            Undo last move
          </button>
        </footer>
      )}
    </div>
  )
}
