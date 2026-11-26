import { WordGrid } from '../components/WordGrid'
import { guessesLeftText, TEAM_NAME } from '../components/teams'
import type { PhoneScreenProps } from './types'

export function GuesserScreen({ view, you, send, disabled }: PhoneScreenProps) {
  const { phase } = view
  const myGuess = phase.name === 'guess' && phase.team === you.team

  let status: string
  if (phase.name === 'guess') {
    const clue = `${phase.clue.word} ${phase.clue.number}`
    status = myGuess
      ? `${clue} — ${guessesLeftText(phase.guessesLeft)}. Tap a word to vote.`
      : `${TEAM_NAME[phase.team]} is guessing: ${clue}`
  } else if (phase.name === 'clue') {
    status = phase.team === you.team ? `Waiting for ${TEAM_NAME[phase.team]}'s clue…` : `${TEAM_NAME[phase.team]}'s turn`
  } else {
    status = ''
  }

  return (
    <div className={`phone-game team-${you.team}`}>
      <header className="phone-head">
        <h1 className={`team-text-${you.team}`}>{TEAM_NAME[you.team]} guesser</h1>
      </header>

      <p className={`phone-status${myGuess ? ' phone-status--active' : ''}`}>{status}</p>

      {view.board && (
        <WordGrid
          cards={view.board}
          showPips={phase.name === 'guess'}
          voterCount={view.voterCount}
          myVote={you.vote}
          onTap={myGuess ? (card) => send({ type: 'vote', card }) : undefined}
          disabled={disabled}
          variant="phone"
          dimmed={!myGuess}
        />
      )}

      {myGuess && (
        <button
          type="button"
          className={`btn end-turn${you.vote === 'end' ? ' end-turn--mine' : ''}`}
          aria-pressed={you.vote === 'end'}
          disabled={disabled || phase.guessesMade < 1}
          onClick={() => send({ type: 'vote-end' })}
        >
          End turn{' '}
          <span className="end-turn__count">
            {view.endTurnVotes}/{view.voterCount}
          </span>
        </button>
      )}
    </div>
  )
}
