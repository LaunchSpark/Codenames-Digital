import { describe, expect, it } from 'vitest'
import { removeSeat, setConnected } from './roster'
import { clueVerdict, expireClue, settle, submitClue, withdrawClue } from './review'
import { makeClueGiver, skipTurn } from './rules'
import type { ServerState } from './state'
import { codeOf, startRed } from './testing'
import { timelineLabels, undo } from './undo'

const game = (s: ServerState) => s.game!
const phaseName = (s: ServerState) => game(s).board.phase.name
const clueLabels = (s: ServerState) => timelineLabels(game(s)).filter((l) => l.includes('clue:'))
/** Red's ann has sent OCEAN 2; blue's dee (connected) has to check it. */
const waiting = () => submitClue(startRed(), 'ann', 'ocean', 2)

describe('clue review', () => {
  it("waits for blue when blue's clue-giver is connected", () => {
    const s = waiting()
    expect(phaseName(s)).toBe('clue')
    expect(game(s).pendingClue?.clue).toEqual({ team: 'red', word: 'ocean', number: 2 })
    expect(game(s).timeline).toEqual([])
  })

  it("waits for blue's clue-giver even while their phone is offline", () => {
    const s = submitClue(setConnected(startRed(), 'dee', -1), 'ann', 'ocean', 2)
    expect(phaseName(s)).toBe('clue')
    expect(game(s).pendingClue).not.toBeNull()
  })

  it('expiring approves a clue only if its checker is still offline', () => {
    const offline = settle(setConnected(waiting(), 'dee', -1))
    expect(phaseName(expireClue(offline))).toBe('guess')
    expect(phaseName(expireClue(waiting()))).toBe('clue')
    expect(phaseName(expireClue(settle(setConnected(offline, 'dee', 1))))).toBe('clue')
  })

  it('goes straight through with no blue clue-giver', () => {
    const s = submitClue(removeSeat(startRed(), 'dee'), 'ann', 'ocean', 2)
    expect(phaseName(s)).toBe('guess')
  })

  it('refuses a second clue while one waits', () => {
    expect(codeOf(() => submitClue(waiting(), 'ann', 'sea', 1))).toBe('not-your-turn')
  })

  it("only blue's clue-giver can rule", () => {
    expect(codeOf(() => clueVerdict(waiting(), 'eve', true))).toBe('not-your-turn')
    expect(codeOf(() => clueVerdict(waiting(), 'ann', true))).toBe('not-your-turn')
    expect(codeOf(() => clueVerdict(startRed(), 'dee', true))).toBe('not-your-turn')
  })

  it('approve commits the clue', () => {
    const s = clueVerdict(waiting(), 'dee', true)
    const phase = game(s).board.phase
    expect(phase.name === 'guess' && phase.clue).toEqual({ team: 'red', word: 'ocean', number: 2 })
    expect(timelineLabels(game(s)).at(-1)).toBe('Red clue: OCEAN 2')
    expect(game(s).pendingClue).toBeNull()
  })

  it('reject hands the clue back', () => {
    const s = clueVerdict(waiting(), 'dee', false)
    expect(game(s).pendingClue).toBeNull()
    expect(game(s).rejectedClue).toEqual({ team: 'red', word: 'ocean', number: 2 })
    expect(phaseName(s)).toBe('clue')
    expect(game(s).timeline).toEqual([])
  })

  it('reject, resend, approve logs one clue', () => {
    let s = clueVerdict(waiting(), 'dee', false)
    s = submitClue(s, 'ann', 'sea', 1)
    expect(game(s).rejectedClue).toBeNull()
    s = clueVerdict(s, 'dee', true)
    expect(clueLabels(s)).toEqual(['Red clue: SEA 1'])
  })

  it('the giver takes a waiting clue back, even on the first clue', () => {
    const s = withdrawClue(waiting(), 'ann')
    expect(game(s).pendingClue).toBeNull()
    expect(game(s).history).toHaveLength(0)
    expect(game(s).timeline).toEqual([])
  })

  it('a take-back that arrives after a reject leaves the game alone', () => {
    const rejected = clueVerdict(waiting(), 'dee', false)
    expect(withdrawClue(rejected, 'ann')).toBe(rejected)
  })

  it("undo is always a board undo, never a take-back", () => {
    expect(codeOf(() => undo(waiting(), 'ann'))).toBe('nothing-to-undo')
  })

  it('a verdict for a clue that has since changed is refused', () => {
    let s = withdrawClue(waiting(), 'ann')
    s = submitClue(s, 'ann', 'wave', 3)
    expect(codeOf(() => clueVerdict(s, 'dee', true, { word: 'ocean', number: 2 }))).toBe('not-your-turn')
    expect(game(s).pendingClue?.clue.word).toBe('wave')
    expect(phaseName(clueVerdict(s, 'dee', true, { word: 'wave', number: 3 }))).toBe('guess')
  })

  it('checker going offline (a refresh, a locked phone) keeps the clue waiting', () => {
    const s = settle(setConnected(waiting(), 'dee', -1))
    expect(phaseName(s)).toBe('clue')
    expect(game(s).pendingClue).not.toBeNull()
  })

  it("swapping red's clue-giver drops the waiting clue", () => {
    expect(game(makeClueGiver(waiting(), 'bob')).pendingClue).toBeNull()
  })

  it("swapping blue's clue-giver keeps it, even if the new one is offline for now", () => {
    expect(game(makeClueGiver(waiting(), 'eve')).pendingClue).not.toBeNull()
    expect(game(makeClueGiver(setConnected(waiting(), 'eve', -1), 'eve')).pendingClue).not.toBeNull()
  })

  it('a board change clears it', () => {
    const rejected = clueVerdict(waiting(), 'dee', false)
    for (const s of [skipTurn(waiting()), skipTurn(rejected)]) {
      expect(game(s).pendingClue).toBeNull()
      expect(game(s).rejectedClue).toBeNull()
    }
  })
})
