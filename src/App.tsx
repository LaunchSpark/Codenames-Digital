import { useState } from 'react'
import { Grid } from './components/Grid'
import { coopComposition, generateCoop } from './keycard/generate'
import type { KeyCard } from './keycard/types'
import { advanceRotation } from './rotation'
import './App.css'

const SIZES = [4, 5, 6, 7]
const PLAYER_COUNTS = [2, 3]

/** The board each player count plays best on. Overridable in setup. */
const DEFAULT_SIZE: Record<number, number> = { 2: 5, 3: 7 }

/**
 * setup   — pick the board shape
 * handoff — a deliberately blank screen while the device changes hands
 * viewing — the current player's key card
 */
type Phase =
  | { name: 'setup' }
  | { name: 'handoff'; player: number }
  | { name: 'viewing'; player: number }

export default function App() {
  const [size, setSize] = useState(5)
  const [players, setPlayers] = useState(2)
  const [card, setCard] = useState<KeyCard | null>(null)
  const [phase, setPhase] = useState<Phase>({ name: 'setup' })
  /** Quarter turns each player has applied, so everyone gets their angle back. */
  const [rotations, setRotations] = useState<number[]>([])

  const start = () => {
    setCard(generateCoop({ size, players }))
    setRotations(new Array<number>(players).fill(0))
    setPhase({ name: 'handoff', player: 0 })
  }

  const rotate = (player: number) =>
    setRotations((current) => advanceRotation(current, player))

  const choosePlayers = (n: number) => {
    setPlayers(n)
    setSize(DEFAULT_SIZE[n] ?? size)
  }

  const passOn = (player: number) =>
    setPhase({ name: 'handoff', player: (player + 1) % players })

  return (
    <main className="app">
      {phase.name === 'setup' && (
        <Setup
          size={size}
          players={players}
          onSize={setSize}
          onPlayers={choosePlayers}
          onStart={start}
        />
      )}

      {phase.name === 'handoff' && (
        <Handoff player={phase.player} onReveal={() => setPhase({ name: 'viewing', player: phase.player })} />
      )}

      {phase.name === 'viewing' && card && (
        <Viewing
          card={card}
          player={phase.player}
          rotation={rotations[phase.player] ?? 0}
          onRotate={() => rotate(phase.player)}
          onPass={() => passOn(phase.player)}
          onRestart={() => setPhase({ name: 'setup' })}
        />
      )}
    </main>
  )
}

interface SetupProps {
  size: number
  players: number
  onSize: (n: number) => void
  onPlayers: (n: number) => void
  onStart: () => void
}

function Setup({ size, players, onSize, onPlayers, onStart }: SetupProps) {
  const { greenPerView, blackPerView, totalAgents, regionSizes } = coopComposition(size, players)

  return (
    <section className="panel">
      <h1>Codenames Coop</h1>
      <p className="subtitle">Duet-style key cards for any board size.</p>

      <Choice label="Board size" options={SIZES} value={size} onChange={onSize} format={(n) => `${n}×${n}`} />
      <Choice label="Players" options={PLAYER_COUNTS} value={players} onChange={onPlayers} />

      <dl className="summary">
        <div>
          <dt>Agents to find</dt>
          <dd>{totalAgents}</dd>
        </div>
        <div>
          <dt>Green per player</dt>
          <dd>{greenPerView}</dd>
        </div>
        <div>
          <dt>Assassins per player</dt>
          <dd>{blackPerView}</dd>
        </div>
      </dl>

      <div className="venn">
        <h2 className="venn__title">Agent overlap</h2>
        <ul className="venn__regions">
          {regionSizes.map((n, i) => (
            <li key={i}>
              <span className="venn__count">{n}</span>
              <span className="venn__label">{regionLabel(i + 1, players)}</span>
            </li>
          ))}
        </ul>
      </div>

      <button className="btn btn--primary" onClick={onStart}>
        Generate key card
      </button>
    </section>
  )
}

/** Describes one Venn region: how many players share the cells in it. */
function regionLabel(degree: number, players: number) {
  if (degree === players) return players === 2 ? 'shared by both' : `shared by all ${players}`
  if (degree === 1) return 'seen by one player only'
  return `in each ${degree === 2 ? 'pair' : `group of ${degree}`}`
}

interface ChoiceProps {
  label: string
  options: number[]
  value: number
  onChange: (n: number) => void
  format?: (n: number) => string
}

function Choice({ label, options, value, onChange, format = String }: ChoiceProps) {
  return (
    <div className="choice">
      <span className="choice__label">{label}</span>
      <div className="choice__options" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            className="chip"
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {format(option)}
          </button>
        ))}
      </div>
    </div>
  )
}

function Handoff({ player, onReveal }: { player: number; onReveal: () => void }) {
  return (
    <section className="panel panel--handoff">
      <p className="handoff__eyebrow">Pass the device to</p>
      <h1 className="handoff__player">Player {player + 1}</h1>
      <p className="subtitle">Nobody else should be looking at the screen.</p>
      <button className="btn btn--primary" onClick={onReveal}>
        I'm Player {player + 1} — reveal my key
      </button>
    </section>
  )
}

interface ViewingProps {
  card: KeyCard
  player: number
  rotation: number
  onRotate: () => void
  onPass: () => void
  onRestart: () => void
}

function Viewing({ card, player, rotation, onRotate, onPass, onRestart }: ViewingProps) {
  return (
    <section className="panel panel--viewing">
      <header className="viewing__header">
        <h1>Player {player + 1}</h1>
        <div className="viewing__actions">
          <button className="btn btn--ghost" onClick={onRotate} aria-label="Rotate the key card">
            ⟳ Rotate
          </button>
          <button className="btn btn--ghost" onClick={onRestart}>
            New card
          </button>
        </div>
      </header>

      {/* Badge and grid turn as one piece, the way a real card would. */}
      <div className="keycard" style={{ transform: `rotate(${rotation * 90}deg)` }}>
        <p className="keycard__top">Top</p>
        <Grid size={card.size} view={card.views[player]} />
      </div>

      <button className="btn btn--primary" onClick={onPass}>
        Done — pass on
      </button>
    </section>
  )
}
