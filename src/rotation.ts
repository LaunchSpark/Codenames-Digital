/** Quarter turns, so four presses of the rotate button come full circle. */
const QUARTER_TURNS = 4

/**
 * Turns one player's key card a quarter further, leaving everyone else's angle
 * alone. Indexes the player safely: a missing entry counts as square, so the
 * button still works if the array is shorter than the player count.
 */
export function advanceRotation(rotations: number[], player: number): number[] {
  const next = [...rotations]
  for (let i = 0; i <= player; i++) next[i] ??= 0
  next[player] = (next[player] + 1) % QUARTER_TURNS
  return next
}
