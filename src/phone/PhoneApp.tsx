import { useGame } from '../net/useGame'

/** Placeholder until the phone screens land (Track B, Task 5). */
export function PhoneApp() {
  const { status, view, you } = useGame('player')
  return (
    <main className="app">
      <h1>Phone</h1>
      <p>
        {status} · {view?.phase.name ?? 'no state'} · {you?.kind ?? '-'}
      </p>
    </main>
  )
}
