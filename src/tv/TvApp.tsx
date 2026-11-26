import { useGame } from '../net/useGame'

/** Placeholder until the TV screens land (Track B, Task 4). */
export function TvApp() {
  const { status, view, you } = useGame('tv')
  return (
    <main className="app">
      <h1>TV</h1>
      <p>
        {status} · {view?.phase.name ?? 'no state'} · {you?.kind ?? '-'}
      </p>
    </main>
  )
}
