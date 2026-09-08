import { Card } from './Card'
import type { Color } from '../keycard/types'

interface GridProps {
  size: number
  view: Color[]
}

/** One player's whole view of the key card, as a size x size grid. */
export function Grid({ size, view }: GridProps) {
  return (
    <div className="grid" style={{ '--grid-size': size } as React.CSSProperties}>
      {view.map((color, i) => (
        <Card key={i} color={color} />
      ))}
    </div>
  )
}
