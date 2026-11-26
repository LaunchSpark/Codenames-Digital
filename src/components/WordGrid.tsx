import type { CSSProperties } from 'react'
import type { CardView } from '../shared/protocol'
import './word-grid.css'

interface WordGridProps {
  cards: CardView[]
  /** Pip rows under unrevealed words; true only during a guess phase. */
  showPips: boolean
  /** Pip slots per card. */
  voterCount: number
  /** This device's own vote, highlighted. */
  myVote?: number | 'end' | null
  /** Makes unrevealed cards tappable. */
  onTap?: (index: number) => void
  /** Keeps tappable cards visible but inert (e.g. while reconnecting). */
  disabled?: boolean
  variant: 'tv' | 'phone'
  /** Fades the board when it isn't this player's turn to act. */
  dimmed?: boolean
}

/**
 * The 5×5 board. Colours come straight from the server: a card with
 * `color: null` is drawn as unknown, and nothing here infers the key.
 */
export function WordGrid({ cards, showPips, voterCount, myVote, onTap, disabled, variant, dimmed }: WordGridProps) {
  return (
    <div className={`word-grid word-grid--${variant}${dimmed ? ' word-grid--dimmed' : ''}`}>
      {cards.map((card, i) => {
        const className = [
          'word',
          `word--${card.color ?? 'unknown'}`,
          card.revealed && 'word--revealed',
          myVote === i && 'word--mine',
        ]
          .filter(Boolean)
          .join(' ')

        // Longest run that can't wrap, so CSS can shrink long words to fit.
        const style = { '--chars': Math.max(...card.word.split(/\s+/).map((w) => w.length)) } as CSSProperties

        const body = (
          <>
            <span className="word__text">{card.word}</span>
            {showPips && !card.revealed && <Pips filled={card.votes} slots={voterCount} />}
          </>
        )

        return onTap && !card.revealed ? (
          <button
            key={i}
            type="button"
            className={className}
            style={style}
            aria-pressed={myVote === i}
            disabled={disabled}
            onClick={() => onTap(i)}
          >
            {body}
          </button>
        ) : (
          <div key={i} className={className} style={style}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

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
