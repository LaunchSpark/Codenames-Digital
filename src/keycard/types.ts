export type Color = 'red' | 'blue' | 'green' | 'yellow' | 'black'

/** A generated key card: one colour view per player, each of length size*size. */
export interface KeyCard {
  size: number
  players: number
  views: Color[][]
}

/** The cell counts a coop key card of a given shape must hit. */
export interface CoopComposition {
  cells: number
  /**
   * Size of one Venn region, indexed by overlap degree - 1: `regionSizes[0]`
   * is how many cells only a single player sees, `regionSizes[1]` how many
   * each pair shares, and so on up to the region everybody shares.
   */
  regionSizes: number[]
  /** Green cells in every single player's view. */
  greenPerView: number
  /** Black cells in every single player's view. */
  blackPerView: number
  /** Distinct cells that are green for at least one player. */
  totalAgents: number
}
