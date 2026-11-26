import { useEffect } from 'react'
import { Banner } from '../components/Banner'
import { WordGrid } from '../components/WordGrid'
import { otherTeam, TEAM_NAME } from '../components/teams'
import type { Snapshot } from '../net/connection'
import { useGame } from '../net/useGame'
import type { ClientMessage } from '../shared/protocol'
import { ClueGiverScreen } from './ClueGiverScreen'
import { GuesserScreen } from './GuesserScreen'
import { JoinForm } from './JoinForm'
import { PhoneLobby } from './PhoneLobby'
import type { PhoneScreenProps } from './types'
import './phone.css'

export function PhoneApp() {
  const { send, ...game } = useGame('player')
  return <PhoneScreen game={game} send={send} />
}

/** Picks the phone screen for this device from the server's view alone. */
export function PhoneScreen({ game, send }: { game: Snapshot; send: (m: ClientMessage) => void }) {
  const { status, view, you, error } = game
  const disabled = status !== 'open'

  let screen = null
  let screenName = 'connecting'
  if (view && you?.kind === 'spectator') {
    screenName = 'join'
    screen = <JoinForm view={view} send={send} disabled={disabled} />
  } else if (view && you?.kind === 'player') {
    const props: PhoneScreenProps = { view, you, send, disabled }
    if (view.phase.name === 'over') [screenName, screen] = ['over', <PhoneOver {...props} />]
    else if (view.phase.name === 'lobby') [screenName, screen] = ['lobby', <PhoneLobby {...props} />]
    else if (you.role === 'clue-giver') [screenName, screen] = ['clue-giver', <ClueGiverScreen {...props} />]
    else [screenName, screen] = ['guesser', <GuesserScreen {...props} />]
  }

  // A new screen starts at the top: otherwise scrolling down to tap Join
  // leaves the lobby (and then the game) scrolled down. Updates within one
  // screen (votes, players coming and going) never move the page.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screenName])

  return (
    <main className="app phone">
      <Banner status={status} error={error} />
      {screen}
    </main>
  )
}

function PhoneOver({ view }: PhoneScreenProps) {
  if (view.phase.name !== 'over') return null
  const { winner, reason } = view.phase
  return (
    <div className="phone-game">
      <header className="phone-head phone-head--stack">
        <h1 className={`team-text-${winner}`}>{TEAM_NAME[winner]} wins</h1>
        <p className="phone-muted">
          {reason === 'assassin'
            ? `${TEAM_NAME[otherTeam(winner)]} hit the assassin`
            : `${TEAM_NAME[winner]} found all their agents`}
        </p>
      </header>
      {view.board && <WordGrid cards={view.board} showPips={false} voterCount={0} variant="phone" />}
      <p className="phone-status">Waiting for the host to start the next game</p>
    </div>
  )
}
