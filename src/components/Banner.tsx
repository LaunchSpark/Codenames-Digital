import type { ConnectionStatus } from '../net/connection'
import './banner.css'

/** "Reconnecting…" while the socket is down; otherwise the last rejected action, if any. */
export function Banner({ status, error }: { status: ConnectionStatus; error: { message: string } | null }) {
  if (status !== 'open') {
    return (
      <div className="banner banner--offline" role="status">
        Reconnecting…
      </div>
    )
  }
  if (error) {
    return (
      <div className="banner banner--error" role="alert">
        {error.message}
      </div>
    )
  }
  return null
}
