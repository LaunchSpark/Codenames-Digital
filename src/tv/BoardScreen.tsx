import { Pips, WordGrid } from '../components/WordGrid'
import { guessesLeftText, TEAM_NAME } from '../components/teams'
import type { GameView, Team } from '../shared/protocol'
import { HostMenu } from './HostMenu'
import { JoinQr } from './JoinQr'
import type { TvScreenProps } from './Lobby'

export function BoardScreen({ view, you, send, disabled }: TvScreenProps) {
  const { phase } = view
  const guessing = phase.name === 'guess'

  return (
    <div className="tv-board">
      <header className={`tv-status team-${'team' in phase ? phase.team : 'none'}`}>
        <TurnStatus view={view} />
        {guessing && (
          <div className="tv-status__end">
            End turn <Pips filled={view.endTurnVotes} slots={view.voterCount} />
          </div>
        )}
      </header>

      <main className="tv-board__grid">
        {view.board && (
          <WordGrid cards={view.board} showPips={guessing} voterCount={view.voterCount} variant="tv" />
        )}
      </main>

      <aside className="tv-side">
        <Remaining view={view} />
        <section className="tv-clues">
          <h2>Clues</h2>
          <ol aria-label="Clues">
            {[...view.clues].reverse().map((c, i) => (
              <li key={view.clues.length - i} className={`team-${c.team}`}>
                <span className="tv-clues__word">{c.word}</span> <span>{c.number}</span>
              </li>
            ))}
          </ol>
        </section>
        <div className="tv-side__join">
          <JoinQr url={view.joinUrl} className="tv-side__qr" />
          <span>Join: {view.joinUrl}</span>
        </div>
        {you.host && <HostMenu view={view} send={send} disabled={disabled} />}
      </aside>
    </div>
  )
}

function TurnStatus({ view }: { view: GameView }) {
  const { phase } = view
  if (phase.name === 'clue') {
    return <p className="tv-status__line">{TEAM_NAME[phase.team]} is thinking of a clue</p>
  }
  if (phase.name === 'guess') {
    return (
      <p className="tv-status__line">
        {TEAM_NAME[phase.team]}:{' '}
        <strong className="tv-status__clue">
          {phase.clue.word} {phase.clue.number}
        </strong>{' '}
        — {guessesLeftText(phase.guessesLeft)}
      </p>
    )
  }
  return null
}

function Remaining({ view }: { view: GameView }) {
  const order: Team[] = view.startingTeam === 'blue' ? ['blue', 'red'] : ['red', 'blue']
  return (
    <section className="tv-remaining">
      {order.map((t) => (
        <div key={t} className={`tv-remaining__team team-${t}`}>
          <span className="tv-remaining__n">{view.teams[t].remaining ?? '–'}</span>
          <span>{TEAM_NAME[t]} left</span>
        </div>
      ))}
    </section>
  )
}
