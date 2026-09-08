import type { Color } from '../keycard/types'

/** One cell of the key card. Colour is the whole content — there are no words yet. */
export function Card({ color }: { color: Color }) {
  return <div className={`card card--${color}`} role="presentation" />
}
