import { Grid2X2 } from 'lucide-react'
import { Badge } from './ui/badge'

export function LobbyBrand() {
  return (
    <div className="lobby-brand">
      <span className="lobby-brand__mark" aria-hidden="true"><Grid2X2 /></span>
      <span>Codenames<span className="lobby-brand__caption">THE WORD IS OUT.</span></span>
      <Badge variant="outline" className="lobby-brand__badge">VS</Badge>
    </div>
  )
}
