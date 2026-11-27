import { describe, expect, it } from 'vitest'
import { seededRandom } from './random'
import { setConnected } from './roster'
import { backToLobby, castEndVote, castVote, giveClue, newGame, reveal, setDeck, settleVotes, startGame, voters } from './rules'
import type { ServerState } from './state'
import { codeOf, colorIndex, lobby, lobbyWith, PICTURES, startRed } from './testing'
import { timelineLabels } from './undo'
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
    expect(one.game!.votes).toEqual({ bob: [card] })
    expect(castVote(one, 'cy', card).game!.board.cards[card].revealed).toBe(true)
  })

  it('clears a vote when the same card is tapped again', () => {
    const s = redGuessing()
    const card = colorIndex(s, 'red')
    expect(castVote(castVote(s, 'bob', card), 'bob', card).game!.votes).toEqual({})
  })

  it('lets a guesser back several cards, up to the guesses left', () => {
    const s = redGuessing(1) // 2 guesses left
    const [a, b, c] = [0, 1, 2].map((n) => colorIndex(s, 'red', n))
    const two = castVote(castVote(s, 'bob', a), 'bob', b)
    expect(two.game!.votes).toEqual({ bob: [a, b] })
    // Out of votes: the next tap moves the oldest one.
    expect(castVote(two, 'bob', c).game!.votes).toEqual({ bob: [b, c] })
  })

  it('rescinds just the tapped vote', () => {
    const s = redGuessing(2)
    const [a, b, c] = [0, 1, 2].map((n) => colorIndex(s, 'red', n))
    let t = castVote(castVote(castVote(s, 'bob', a), 'bob', b), 'bob', c)
    t = castVote(t, 'bob', b)
    expect(t.game!.votes).toEqual({ bob: [a, c] })
  })

  it('reveals a card once every guesser backs it, keeping their other votes', () => {
    const s = redGuessing(2) // 3 guesses left
    const [a, b, c] = [0, 1, 2].map((n) => colorIndex(s, 'red', n))
    let t = castVote(castVote(s, 'bob', a), 'bob', b)
    t = castVote(castVote(t, 'cy', c), 'cy', a)
    expect(t.game!.board.cards[a].revealed).toBe(true)
    expect(phase(t)).toMatchObject({ name: 'guess', guessesLeft: 2, guessesMade: 1 })
    expect(t.game!.votes).toEqual({ bob: [b], cy: [c] })
  })

  it('drops all votes when the turn ends on a reveal', () => {
    const s = redGuessing(2)
    const red = colorIndex(s, 'red')
    const neutral = colorIndex(s, 'neutral')
    let t = castVote(castVote(s, 'bob', red), 'bob', neutral)
    t = castVote(t, 'cy', neutral)
    expect(phase(t)).toEqual({ name: 'clue', team: 'blue' })
    expect(t.game!.votes).toEqual({})
  })

  it('reveals every card that becomes unanimous at once, while the turn lasts', () => {
    const s = redGuessing(2)
    const [a, b, c] = [0, 1, 2].map((n) => colorIndex(s, 'red', n))
    let t = castVote(castVote(s, 'bob', a), 'bob', b)
    t = castVote(t, 'cy', c)
    // cy leaves: bob's two votes now stand alone.
    t = settleVotes(setConnected(t, 'cy', -1))
    expect([a, b].map((i) => t.game!.board.cards[i].revealed)).toEqual([true, true])
    expect(phase(t)).toMatchObject({ name: 'guess', guessesLeft: 1, guessesMade: 2 })
  })

  it('treats an end-turn vote and card votes as either/or', () => {
    let s = redGuessing(2)
    s = bothVote(s, colorIndex(s, 'red'))
    const [a, b] = [0, 1].map((n) => colorIndex(s, 'red', n + 1))
    s = castVote(castVote(s, 'bob', a), 'bob', b)
    s = castEndVote(s, 'bob')
    expect(s.game!.votes).toEqual({ bob: 'end' })
    expect(castVote(s, 'bob', a).game!.votes).toEqual({ bob: [a] })
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

describe('picture deck', () => {
  const pictureLobby = () => setDeck(lobby(), 'pictures', PICTURES)
  /** A started picture game where red goes first, in red's guess phase (8 guesses allowed). */
  const pictureGuessing = () => giveClue(startRed(pictureLobby()), 'ann', 'ocean', 8)

  it('setDeck switches the lobby deck', () => {
    expect(lobby().deck).toBe('words')
    expect(pictureLobby().deck).toBe('pictures')
  })

  it('setDeck refuses mid-game', () => {
    expect(codeOf(() => setDeck(startRed(), 'pictures', PICTURES))).toBe('not-in-lobby')
  })

  it('setDeck refuses pictures with fewer than 20 images', () => {
    expect(codeOf(() => setDeck(lobby(), 'pictures', PICTURES.slice(0, 19)))).toBe('no-pictures')
    expect(setDeck(pictureLobby(), 'words', []).deck).toBe('words')
  })

  it('a picture game deals 20 cards', () => {
    const s = startGame(pictureLobby(), WORDS, seededRandom(1), PICTURES)
    expect(s.game!.board.cards).toHaveLength(20)
    for (const c of s.game!.board.cards) expect(c.word).toMatch(/^card-\d+$/)
  })

  it('refuses a vote past the 20th card', () => {
    const s = pictureGuessing()
    expect(codeOf(() => castVote(s, 'bob', 20))).toBe('invalid-vote')
    expect(codeOf(() => castVote(s, 'bob', 24))).toBe('invalid-vote')
  })

  it('new game keeps pictures; back to lobby + words deals 25', () => {
    const game = startRed(pictureLobby())
    expect(newGame(game, WORDS, seededRandom(2), PICTURES).game!.board.cards).toHaveLength(20)
    const words = setDeck(backToLobby(game), 'words', PICTURES)
    expect(startGame(words, WORDS, seededRandom(2), PICTURES).game!.board.cards).toHaveLength(25)
  })

  it('wins on the 8th picture card', () => {
    let s = pictureGuessing()
    const team = s.game!.board.startingTeam
    for (let i = 0; i < 8; i++) s = reveal(s, colorIndex(s, team))
    expect(phase(s)).toEqual({ name: 'over', winner: team, reason: 'cards' })
  })

  it('labels a revealed picture by number', () => {
    const s = pictureGuessing()
    const i = colorIndex(s, 'red')
    const n = s.game!.board.cards[i].word.slice('card-'.length)
    expect(timelineLabels(reveal(s, i).game!).at(-1)).toBe(`Red revealed picture ${n} (red)`)
  })
})
