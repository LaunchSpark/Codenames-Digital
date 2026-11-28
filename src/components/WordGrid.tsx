import { useRef } from 'react'
import type { CardView } from '../shared/protocol'
import { useFitWords } from './fitWords'
import './word-grid.css'

interface WordGridProps {
  cards: CardView[]
  /** Pip rows under unrevealed words; true only during a guess phase. */
  showPips: boolean
  /** Pip slots per card. */
  voterCount: number
  /** Cards this device is voting for, highlighted. */
  myVotes?: readonly number[]
  /** Makes unrevealed cards tappable. */
  onTap?: (index: number) => void
  /** Keeps tappable cards visible but inert (e.g. while reconnecting). */
  disabled?: boolean
  variant: 'tv' | 'phone'
  /** Fades the board when it isn't this player's turn to act. */
  dimmed?: boolean
  /**
   * A clue-giver's key card: solid colours, no visible words (they read the
   * words off the TV). Each tile keeps its word and colour as its label.
   */
  keyCard?: boolean
  /** Cards are picture ids (`card-17`), drawn from /cards/. */
  pictures?: boolean
}

/**
 * The board: 5 columns, 25 words or 20 pictures. Colours come straight from the server: a card with
 * `color: null` is drawn as unknown, and nothing here infers the key.
 */
export function WordGrid({ cards, showPips, voterCount, myVotes = [], onTap, disabled, variant, dimmed, keyCard, pictures }: WordGridProps) {
  const gridClass = ['word-grid', `word-grid--${variant}`, dimmed && 'word-grid--dimmed', keyCard && 'word-grid--key', pictures && 'word-grid--pictures']
    .filter(Boolean)
    .join(' ')
  const gridRef = useRef<HTMLDivElement>(null)
  useFitWords(gridRef, keyCard || pictures ? '' : cards.map((c) => c.word).join('|'))
  return (
    <div ref={gridRef} className={gridClass}>
      {cards.map((card, i) => {
        const className = [
          'word',
          `word--${card.color ?? 'unknown'}`,
          card.revealed && 'word--revealed',
          myVotes.includes(i) && 'word--mine',
        ]
          .filter(Boolean)
          .join(' ')

        const name = pictures ? pictureName(card.word) : card.word
        const body = (
          <>
            {!keyCard && pictures && (
              <img className="word__picture" src={`/cards/${card.word}.jpg`} alt={name} draggable={false} />
            )}
            {!keyCard && !pictures && <span className="word__text">{card.word}</span>}
            {showPips && !card.revealed && <Pips filled={card.votes} slots={voterCount} />}
          </>
        )

        return onTap && !card.revealed ? (
          <button
            key={i}
            type="button"
            className={className}
            aria-pressed={myVotes.includes(i)}
            disabled={disabled}
            onClick={() => onTap(i)}
          >
            {body}
          </button>
        ) : (
          <div
            key={i}
            className={className}
            role={keyCard ? 'img' : undefined}
            aria-label={keyCard ? `${name}: ${card.color ?? 'unknown'}${card.revealed ? ', picked' : ''}` : undefined}
          >
            {body}
          </div>
        )
      })}
    </div>
  )
}

/** "Picture 17" for `card-17`. */
const pictureName = (id: string) => `Picture ${id.replace(/^card-/, '')}`

/** `slots` dots, the first `filled` of them solid. Also used for end-turn votes. */
export function Pips({ filled, slots }: { filled: number; slots: number }) {
  return (
    <span className="pips" aria-label={`${filled} of ${slots} votes`}>
      {Array.from({ length: slots }, (_, i) => (
        <span key={i} className={i < filled ? 'pip pip--filled' : 'pip'} />
      ))}
    </span>
  )
}
