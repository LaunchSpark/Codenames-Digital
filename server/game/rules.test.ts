import { describe, expect, it } from 'vitest'
import { seededRandom } from './random'
import { setConnected } from './roster'
import { castEndVote, castVote, giveClue, settleVotes, startGame, voters } from './rules'
import type { ServerState } from './state'
import { codeOf, colorIndex, lobbyWith, startRed } from './testing'
import { WORDS } from './words'

/** Red's guess phase after ann's clue. */
const redGuessing = (number = 2) => giveClue(startRed(), 'ann', 'ocean', number)

/** Both red guessers vote for a card. */
const bothVote = (s: ServerState, card: number) => castVote(castVote(s, 'bob', card), 'cy', card)

const phase = (s: ServerState) => s.game!.board.phase

describe('starting', () => {
  it('needs two per team', () => {
    const s = lobbyWith({ red: ['ann', 'bob'], blue: ['dee'] })
    expect(codeOf(() => startGame(s, WORDS, seededRandom(1)))).toBe('not-enough-players')
  })

  it('makes the first joiner on each team the first clue-giver', () => {
    expect(startRed().game!.clueGivers).toEqual({ red: 'ann', blue: 'dee' })
  })

  it('only starts from the lobby', () => {
    expect(codeOf(() => startGame(startRed(), WORDS, seededRandom(1)))).toBe('not-in-lobby')
  })
})

describe('clues', () => {
  it('may only come from the active clue-giver', () => {
    const s = startRed()
    expect(codeOf(() => giveClue(s, 'dee', 'ocean', 2))).toBe('not-your-turn')
    expect(codeOf(() => giveClue(s, 'bob', 'ocean', 2))).toBe('not-your-turn')
  })

  it('rejects bad clues', () => {
    const s = startRed()
    const boardWord = s.game!.board.cards[0].word.toUpperCase()
    for (const [word, n] of [
      ['ocean', 0],
      ['ocean', 10],
      ['ocean', 2.5],
      ['', 2],
      ['two words', 2],
      ['abc1', 2],
      [boardWord, 2],
    ] as const) {
      expect(codeOf(() => giveClue(s, 'ann', word, n)), `${word} ${n}`).toBe('invalid-clue')
    }
    expect(phase(giveClue(s, 'ann', 'ice-cream', 2)).name).toBe('guess')
  })

  it('open guessing with number + 1 guesses', () => {
    const s = redGuessing(2)
    expect(phase(s)).toEqual({
      name: 'guess',
      team: 'red',
      clue: { team: 'red', word: 'ocean', number: 2 },
      guessesLeft: 3,
      guessesMade: 0,
    })
    expect(s.game!.board.clues).toEqual([{ team: 'red', word: 'ocean', number: 2 }])
  })
})

describe('voting', () => {
  it('needs every connected guesser', () => {
    const s = redGuessing()
    const card = colorIndex(s, 'red')
    const one = castVote(s, 'bob', card)
    expect(one.game!.board.cards[card].revealed).toBe(false)
    expect(one.game!.votes).toEqual({ bob: card })
    expect(castVote(one, 'cy', card).game!.board.cards[card].revealed).toBe(true)
  })

  it('clears a vote when the same card is tapped again', () => {
    const s = redGuessing()
    const card = colorIndex(s, 'red')
    expect(castVote(castVote(s, 'bob', card), 'bob', card).game!.votes).toEqual({})
  })

  it('rejects votes from outside the guessing team and on bad cards', () => {
    const s = redGuessing()
    expect(codeOf(() => castVote(s, 'dee', 0))).toBe('not-your-turn')
    expect(codeOf(() => castVote(s, 'ann', 0))).toBe('not-your-turn')
    expect(codeOf(() => castVote(s, 'bob', 25))).toBe('invalid-vote')
    const revealed = bothVote(s, colorIndex(s, 'red'))
    expect(codeOf(() => castVote(revealed, 'bob', colorIndex(s, 'red')))).toBe('invalid-vote')
  })

  it('lets a lone connected guesser reveal on one tap', () => {
    const s = settleVotes(setConnected(redGuessing(), 'cy', -1))
    expect(voters(s)).toEqual(['bob'])
    const card = colorIndex(s, 'red')
    expect(castVote(s, 'bob', card).game!.board.cards[card].revealed).toBe(true)
  })

  it('reveals nothing with zero connected guessers', () => {
    const s = setConnected(setConnected(redGuessing(), 'cy', -1), 'bob', -1)
    expect(voters(s)).toEqual([])
    const settled = settleVotes(s)
    expect(phase(settled)).toEqual(phase(s))
    expect(settled.game!.board.cards.some((c) => c.revealed)).toBe(false)
  })

  it('completes the vote when the holdout disconnects', () => {
    const s = redGuessing()
    const x = colorIndex(s, 'red', 0)
    const y = colorIndex(s, 'red', 1)
    const split = castVote(castVote(s, 'bob', x), 'cy', y)
    const after = settleVotes(setConnected(split, 'cy', -1))
    expect(after.game!.board.cards[x].revealed).toBe(true)
  })
})

describe('reveals', () => {
  it('continue on own colour until number + 1 guesses are used', () => {
    let s = redGuessing(1)
    s = bothVote(s, colorIndex(s, 'red'))
    expect(phase(s)).toMatchObject({ name: 'guess', guessesLeft: 1, guessesMade: 1 })
    s = bothVote(s, colorIndex(s, 'red'))
    expect(phase(s)).toEqual({ name: 'clue', team: 'blue' })
  })

  it('end the turn on a neutral card', () => {
    const s = redGuessing()
    expect(phase(bothVote(s, colorIndex(s, 'neutral')))).toEqual({ name: 'clue', team: 'blue' })
  })

  it("end the turn on the opponent's card, which counts for them", () => {
    const s = redGuessing()
    const card = colorIndex(s, 'blue')
    const after = bothVote(s, card)
    expect(phase(after)).toEqual({ name: 'clue', team: 'blue' })
    expect(after.game!.board.cards[card].revealed).toBe(true)
  })

  it('lose the game for the guessing team on the assassin', () => {
    const s = redGuessing()
    expect(phase(bothVote(s, colorIndex(s, 'assassin')))).toEqual({
      name: 'over',
      winner: 'blue',
      reason: 'assassin',
    })
  })

  it("win it for the opponent when their last card is revealed", () => {
    let s = redGuessing()
    // Reveal all but one blue card directly on the board.
    const cards = s.game!.board.cards.map((c) => ({ ...c }))
    const blues = cards.flatMap((c, i) => (c.color === 'blue' ? [i] : []))
    for (const i of blues.slice(1)) cards[i].revealed = true
    s = { ...s, game: { ...s.game!, board: { ...s.game!.board, cards } } }
    expect(phase(bothVote(s, blues[0]))).toEqual({ name: 'over', winner: 'blue', reason: 'cards' })
  })
})

describe('ending the turn', () => {
  it('needs a reveal first, then every guesser', () => {
    let s = redGuessing(3)
    expect(codeOf(() => castEndVote(s, 'bob'))).toBe('invalid-vote')
    s = bothVote(s, colorIndex(s, 'red'))
    s = castEndVote(s, 'bob')
    expect(phase(s).name).toBe('guess')
    s = castEndVote(s, 'cy')
    expect(phase(s)).toEqual({ name: 'clue', team: 'blue' })
  })
})
