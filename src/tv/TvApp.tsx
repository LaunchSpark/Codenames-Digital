import { Banner } from '../components/Banner'
import { useGame } from '../net/useGame'
import { BoardScreen } from './BoardScreen'
import { GameOver } from './GameOver'
import { Lobby } from './Lobby'
import './tv.css'

export function TvApp() {
  const { status, view, you, error, send } = useGame('tv')
  const disabled = status !== 'open'

  let screen = <p className="tv-waiting">Connecting to the game server…</p>
  if (view && you?.kind === 'tv') {
    const props = { view, you, send, disabled }
    screen =
      view.phase.name === 'lobby' ? (
        <Lobby {...props} />
      ) : view.phase.name === 'over' ? (
        <GameOver {...props} />
      ) : (
        <BoardScreen {...props} />
      )
  }

  return (
    <main className="app tv">
      <Banner status={status} error={error} />
      {screen}
    </main>
  )
}
