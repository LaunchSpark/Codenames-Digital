import { useEffect, useState } from 'react'
import { Undo2 } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { WordGrid } from '../components/WordGrid'
import { checkingLine, guessesLeftText, otherTeam, TEAM_NAME } from '../components/teams'
import type { CardView, Clue, ClientMessage, Phase, Team } from '../shared/protocol'
import type { PhoneScreenProps } from './types'

export function ClueGiverScreen({ view, you, send, disabled }: PhoneScreenProps) {
  const { phase } = view
  const myClueTurn = phase.name === 'clue' && phase.team === you.team
  /** My clue, waiting for the other clue-giver. */
  const myWaiting = you.pendingClue?.team === you.team ? you.pendingClue : null
  /** Their clue, waiting for me to check it. */
  const toCheck = you.pendingClue && you.pendingClue.team !== you.team ? you.pendingClue : null
  const writing = myClueTurn && !myWaiting
  const rejected = you.rejectedClue

  return (
    <div className={`phone-game team-${you.team}`}>
      <header className="phone-head">
        <h1 className={`team-text-${you.team}`}>{TEAM_NAME[you.team]} clue-giver</h1>
        <UndoButton canUndo={view.canUndo} disabled={disabled} send={send} />
      </header>

      {/*
        The clue box and the status line share one slot, sized to the larger,
        so the board never jumps when the turn changes. The clue box is reset
        for each new clue (keyed on the clue count).
      */}
      <div className="turn-slot">
        <div aria-hidden={!writing} inert={!writing} className={writing ? '' : 'is-hidden'}>
          {rejected && (
            <p className="clue-rejected">
              {TEAM_NAME[otherTeam(rejected.team)]} rejected {clueText(rejected)} — try another
            </p>
          )}
          <ClueForm
            key={`${view.clues.length}-${rejected?.word ?? ''}`}
            initial={rejected}
            send={send}
            disabled={disabled || !writing}
          />
        </div>
        {toCheck ? (
          <CheckClue clue={toCheck} send={send} disabled={disabled} />
        ) : myWaiting ? (
          <div className="clue-waiting">
            <p className="phone-status phone-status--active">
              Waiting for {TEAM_NAME[otherTeam(myWaiting.team)]} to check {clueText(myWaiting)}…
            </p>
            <button type="button" className="btn btn--ghost" disabled={disabled}
              onClick={() => send({ type: 'withdraw-clue' })}>Take back</button>
          </div>
        ) : (
          <p className={`phone-status${writing ? ' is-hidden' : ''}`} aria-hidden={writing}>
            {view.checking ? checkingLine(view.checking) : statusLine(phase, you.team)}
          </p>
        )}
      </div>

      {view.board && (
        <WordGrid
          cards={view.board}
          showPips={phase.name === 'guess'}
          voterCount={view.voterCount}
          variant="phone"
          dimmed={!myClueTurn}
          keyCard
          pictures={view.deck === 'pictures'}
        />
      )}

      {view.board && <MyWords cards={view.board} team={you.team} pictures={view.deck === 'pictures'} />}
    </div>
  )
}

/**
 * The team's words still to be found, for planning the next clue. Below the
 * board, so it can shrink as cards are picked without moving anything above.
 */
/** The team's unpicked cards: words as chips, pictures as thumbnails. */
function MyWords({ cards, team, pictures }: { cards: CardView[]; team: Team; pictures: boolean }) {
  const words = cards.filter((c) => c.color === team && !c.revealed).map((c) => c.word)
  const label = pictures ? 'Your pictures' : 'Your words'
  return (
    <section className="my-words">
      <header className="my-words__head">
        <h2>{label}</h2>
        <span>{words.length} left</span>
      </header>
      <ul className={`my-words__list${pictures ? ' my-words__list--pictures' : ''}`} aria-label={label}>
        {words.map((w) => (
          <li key={w}>{pictures ? <img src={`/cards/${w}.jpg`} alt={`Picture ${w.replace(/^card-/, '')}`} /> : w}</li>
        ))}
      </ul>
    </section>
  )
}

const clueText = (clue: Clue) => `${clue.word.toUpperCase()} ${clue.number}`

/** The other team's clue, for this clue-giver to approve or reject. Buzzes once when it arrives. */
function CheckClue({ clue, send, disabled }: { clue: Clue; send: (m: ClientMessage) => void; disabled: boolean }) {
  useEffect(() => {
    navigator.vibrate?.(200)
  }, [clue])
  return (
    <section className="check-clue" aria-label={`${TEAM_NAME[clue.team]}'s clue`}>
      <p className="check-clue__label">{TEAM_NAME[clue.team]}'s clue — OK to give?</p>
      <p className="check-clue__clue">{clueText(clue)}</p>
      <div className="check-clue__actions">
        <button type="button" className="btn btn--ghost" disabled={disabled}
          onClick={() => send({ type: 'clue-verdict', approve: false, word: clue.word, number: clue.number })}>Reject</button>
        <button type="button" className="btn btn--primary" disabled={disabled}
          onClick={() => send({ type: 'clue-verdict', approve: true, word: clue.word, number: clue.number })}>Approve</button>
      </div>
    </section>
  )
}

function statusLine(phase: Phase, mine: Team) {
  if (phase.name === 'guess') {
    const clue = `${phase.clue.word} ${phase.clue.number}`
    return phase.team === mine
      ? `Your team is guessing: ${clue}`
      : `${TEAM_NAME[phase.team]} is guessing: ${clue} — ${guessesLeftText(phase.guessesLeft)}`
  }
  if (phase.name === 'clue') return `${TEAM_NAME[phase.team]}'s turn`
  return ''
}

/** Remounted for each new clue, so every turn starts blank. */
function ClueForm({
  initial,
  send,
  disabled,
}: {
  /** A rejected clue, handed back for editing. */
  initial: Clue | null
  send: (m: ClientMessage) => void
  disabled: boolean
}) {
  const [word, setWord] = useState(initial?.word ?? '')
  const [number, setNumber] = useState(initial?.number ?? 1)
  const trimmed = word.trim()

  return (
    <form
      className="clue-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!trimmed || disabled) return
        send({ type: 'clue', word: trimmed, number })
      }}
    >
      <label className="field clue-form__word">
        <span className="field__label">Clue</span>
        <input
          className="field__input"
          value={word}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="send"
          onChange={(e) => setWord(e.target.value)}
        />
      </label>
      <label className="field clue-form__number">
        <span className="field__label">Number</span>
        <select className="field__input" value={number} onChange={(e) => setNumber(Number(e.target.value))}>
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn--primary clue-form__send" disabled={disabled || !trimmed}>
        Give clue
      </button>
    </form>
  )
}

function UndoButton({
  canUndo,
  disabled,
  send,
}: {
  canUndo: boolean
  disabled: boolean
  send: (m: ClientMessage) => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={disabled || !canUndo}
        onClick={() => setConfirming(true)}
      >
        <Undo2 aria-hidden="true" size={18} />
        Undo
      </button>
      {confirming && canUndo && (
        <ConfirmDialog
          message="Undo last move?"
          confirmLabel="Yes, undo"
          disabled={disabled}
          onConfirm={() => {
            send({ type: 'undo' })
            setConfirming(false)
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}
