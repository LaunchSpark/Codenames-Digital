import type { Team } from '../shared/protocol'

export const TEAM_NAME: Record<Team, string> = { red: 'Red', blue: 'Blue' }

export const otherTeam = (t: Team): Team => (t === 'red' ? 'blue' : 'red')

export const guessesLeftText = (n: number) => `${n} ${n === 1 ? 'guess' : 'guesses'} left`
