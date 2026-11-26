import type { ClientMessage, GameView, You } from '../shared/protocol'

export type Player = Extract<You, { kind: 'player' }>

export interface PhoneScreenProps {
  view: GameView
  you: Player
  send: (m: ClientMessage) => void
  /** True while the connection is down: actions render but can't be used. */
  disabled: boolean
}

export const myName = (view: GameView, you: Player) =>
  view.teams[you.team].players.find((p) => p.id === you.id)?.name ?? ''
