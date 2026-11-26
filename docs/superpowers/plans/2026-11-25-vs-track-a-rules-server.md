# VS Mode — Track A: Game Rules + Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host-run Node server that holds the authoritative VS game, applies every rule in the spec, and pushes each connected device a view filtered for what it may see.

**Architecture:** Pure, immutable rule functions in `server/game/` (state in → new state out, throwing `GameError` on illegal moves), a `dispatch` that maps `ClientMessage`s onto them with permission checks, a `viewFor` that builds per-device `GameView`s, and a thin `ws` + static-file server in `server/` that owns connections and broadcasts after every accepted message.

**Tech Stack:** Node 22, TypeScript run by `tsx`, `ws`, `sirv` (static files), Vitest.

**Spec:** [docs/superpowers/specs/2026-11-25-lan-vs-mode-design.md](../specs/2026-11-25-lan-vs-mode-design.md)
**Contract:** [docs/superpowers/plans/2026-11-25-vs-00-contract.md](2026-11-25-vs-00-contract.md) — read it first; every type named below without a definition comes from `src/shared/protocol.ts`.

**Parallel work:** Track B (TV + phone screens) builds against the same contract at the same time. Merge Task 1 to `main` as soon as it's done. Don't touch `src/App.tsx`, `src/components/`, `src/rotation*`, or client CSS — those are Track B's.

## Global Constraints

- Board is 5×5: starting team 9 cards, other team 8, 7 `neutral`, 1 `assassin`. Starting team is random and goes first.
- Clue number: integer 1–9. Clue word: one word, letters and hyphens only (`/^[\p{L}]+(-[\p{L}]+)*$/u`), not equal (case-insensitive) to any board word, revealed or not.
- Guesses allowed = number + 1.
- Names: trimmed, 1–20 chars, unique case-insensitively.
- Start needs ≥ 2 players per team.
- Unanimity counts **connected guessers on the guessing team** only.
- End-turn vote only after ≥ 1 reveal this turn.
- Undo: either current clue-giver; reverts clue / reveal / end-turn (incl. turn change & game over); never touches roster, seats, connections or clue-giver assignment; host actions are not undo steps.
- A current clue-giver's view is the **only** non-'over' view that may contain the colour of an unrevealed card.
- Host = connection whose real client address is loopback.
- Default port `3000`; env `PORT` overrides. Env `CODENAMES_HOST_IP` overrides the detected LAN IP. CLI flag `--join-port <n>` overrides the port in the join URL (dev uses Vite's 5173).
- One game per server, in memory only.

## Review Focus

- **Key leakage via a former clue-giver.** After `host:make-clue-giver` or `host:remove-player`, the demoted player's next view must have `color: null` on unrevealed cards. → test in Task 7.
- **Stale seat token after a server restart.** `hello` with an unknown token must give `you.kind === 'spectator'`, not an error or a crash. → test in Task 9.
- **Same seat open in two tabs/sockets.** The seat stays `connected` until its *last* socket closes; closing one tab must not clear the player's vote. → test in Task 9.
- **Dev proxy makes every phone look like loopback.** Through Vite's proxy (`xfwd: true`), host status must come from the last `X-Forwarded-For` hop when the socket peer is loopback. → test in Task 9.
- **Single connected guesser.** One tap reveals immediately; zero connected guessers reveal nothing and don't crash `settleVotes`. → tests in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/protocol.ts` | The contract (verbatim from contract doc). |
| `server/game/words.ts` | `WORDS: readonly string[]`, converted from `words.txt`. |
| `server/game/random.ts` | `seededRandom(seed: number): () => number` (mulberry32), used in tests. |
| `server/game/state.ts` | Internal types + `GameError`. |
| `server/game/board.ts` | `newBoard`. |
| `server/game/roster.ts` | Seats, teams, names, connections, rotation. |
| `server/game/rules.ts` | Game moves, vote settling, host corrections. |
| `server/game/undo.ts` | Undo history. |
| `server/game/views.ts` | `viewFor`. |
| `server/game/dispatch.ts` | `ClientMessage` → state, with permission checks. |
| `server/game/testing.ts` | Test helpers (not imported by production code). |
| `server/lan.ts` | LAN IP pick + host detection. |
| `server/hub.ts` | Connections, hello/seat binding, broadcast. |
| `server/index.ts` | HTTP + static + WS wiring, CLI, startup log. |
| `tsconfig.server.json` | Type-check config for `server/`. |

### Internal state (`server/game/state.ts`) — used by every task

```ts
import type { CardColor, Clue, ErrorCode, Phase, Team } from '../../src/shared/protocol'

export interface Seat { id: string; token: string; name: string; team: Team; connections: number }

export interface Roster {
  seats: Record<string, Seat>
  /** Seat ids per team, in rotation order. */
  order: Record<Team, string[]>
  /** Rotation index used at the next game start (wraps over current list length). */
  nextClueGiver: Record<Team, number>
}

export interface Card { word: string; color: CardColor; revealed: boolean }

/** Everything Undo restores. */
export interface Board { cards: Card[]; startingTeam: Team; phase: Phase; clues: Clue[] }

export interface Game {
  board: Board
  /** Prior Boards, most recent last. */
  history: Board[]
  /** Outside Board on purpose: undo never reverts a host reassignment. */
  clueGivers: Record<Team, string | null>
  /** seatId → vote; cleared on every Board change. */
  votes: Record<string, number | 'end'>
}

export interface ServerState { mode: 'vs'; roster: Roster; game: Game | null }

export class GameError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message) }
}
```

All rule functions are pure: they never mutate their input and return a new `ServerState`.

---

### Task 1: Contract, word list, server scaffolding

**Files:**
- Create: `src/shared/protocol.ts`, `server/game/words.ts`, `server/game/random.ts`, `server/game/state.ts`, `tsconfig.server.json`
- Modify: `tsconfig.json` (add reference), `package.json` (deps)
- Delete: `words.txt` (after conversion)
- Test: `server/game/words.test.ts`

**Interfaces:**
- Produces: everything in the contract; `WORDS`; `seededRandom(seed: number): () => number`; the types in "Internal state" above.

- [ ] **Step 1:** Copy the contract's `protocol.ts` block verbatim into `src/shared/protocol.ts`. Write `server/game/state.ts` exactly as above.
- [ ] **Step 2:** Install deps: `npm i ws sirv` and `npm i -D tsx @types/ws`.
- [ ] **Step 3:** Add `tsconfig.server.json` (compilerOptions like `tsconfig.node.json` but `"module": "esnext"`, `"moduleResolution": "bundler"`, `"types": ["node"]`, own `tsBuildInfoFile`; `"include": ["server"]`) and add `{ "path": "./tsconfig.server.json" }` to `tsconfig.json` references.
- [ ] **Step 4: Write the failing test** `server/game/words.test.ts`:

```ts
it('has at least 300 words', () => expect(WORDS.length).toBeGreaterThanOrEqual(300))
it('is lowercase, trimmed, non-empty', () => { for (const w of WORDS) expect(w).toMatch(/^[a-z][a-z -]*[a-z]$/) })
it('has no duplicates', () => expect(new Set(WORDS).size).toBe(WORDS.length))
```

- [ ] **Step 5:** Run `npx vitest run server/game/words.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 6:** Generate `server/game/words.ts` from `words.txt` (it's a Go slice: one `"word",` per line). Extract every double-quoted string, lowercase/trim/dedupe, emit `export const WORDS: readonly string[] = [ ... ]`. Write `random.ts` (mulberry32, same algorithm as `makeRng` in `src/keycard/generate.ts`). Delete `words.txt`.
- [ ] **Step 7:** Run `npx vitest run server/game/words.test.ts && npx tsc -p tsconfig.server.json` — Expected: PASS, no type errors.
- [ ] **Step 8:** Commit `feat: shared protocol contract, word list, server scaffolding` and **merge to main** so Track B can rebase onto it.

---

### Task 2: Board generation

**Files:** Create `server/game/board.ts`; Test `server/game/board.test.ts`

**Interfaces:**
- Produces: `newBoard(words: readonly string[], rand: () => number): Board` — phase is `{ name: 'clue', team: startingTeam }`, `clues: []`, all cards unrevealed.

- [ ] **Step 1: Write the failing tests:**
  - `deals 25 distinct words from the list` — `cards.length === 25`, `new Set(words).size === 25`, every word ∈ input.
  - `deals 9/8/7/1` — count of `startingTeam` = 9, other team = 8, `neutral` = 7, `assassin` = 1.
  - `starts with the starting team's clue phase` — `phase` deep-equals `{ name: 'clue', team: startingTeam }`.
  - `picks both starting teams across seeds` — over seeds 1..50, both `'red'` and `'blue'` occur.
  - `is reproducible` — same seed → deep-equal boards.
  - `throws on fewer than 25 words`.
- [ ] **Step 2:** Run `npx vitest run server/game/board.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement with a Fisher–Yates shuffle driven by `rand`.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat: VS board generation`.

---

### Task 3: Roster — seats, names, teams, connections, rotation

**Files:** Create `server/game/roster.ts`, `server/game/testing.ts`; Test `server/game/roster.test.ts`

**Interfaces:**
- Produces:
  - `emptyState(): ServerState`
  - `addSeat(s: ServerState, seat: { id: string; token: string; name: string; team: Team }): ServerState` — validates name; appends to `order[team]`; `connections: 1`. If a game is running, the seat is simply a guesser (no game change needed beyond roster).
  - `changeSeat(s, id, name: string, team: Team): ServerState` — lobby only (`not-in-lobby`), re-validates name excluding self; if team changed, removes from old order and appends to new.
  - `removeSeat(s, id): ServerState` — removes from seats/order; drops their vote; if they were a current clue-giver sets that team's `clueGivers[team] = null`.
  - `setConnected(s, id, delta: 1 | -1): ServerState` — adjusts `connections` (min 0); when it reaches 0, drops that seat's vote.
  - `isConnected(seat: Seat): boolean` (`connections > 0`)
  - `seatByToken(s, token: string): Seat | undefined`
  - `pickClueGivers(s): ServerState` — for each team, `clueGivers[team] = order[team][next % len]`, then `nextClueGiver[team] = next + 1`. Only called at game start (Task 4/5).
  - In `testing.ts`: `lobbyWith(teams: { red: string[]; blue: string[] }): ServerState` (seat id = name, token = `t-${name}`), and `colorIndex(s, color: CardColor, nth = 0): number` returning the index of the nth unrevealed card of that colour.

- [ ] **Step 1: Write the failing tests:**
  - `rejects empty, whitespace-only and 21-char names` → `GameError` code `name-invalid`; `'  Ann  '` is stored as `'Ann'`.
  - `rejects a duplicate name case-insensitively` → `name-taken`; `changeSeat` keeping own name succeeds.
  - `appends joiners to their team order` — `lobbyWith({red:['a','b'],blue:['c','d']}).roster.order.red` = `['a','b']`.
  - `switching team in the lobby moves you to the back of the new team`.
  - `changeSeat mid-game throws not-in-lobby`.
  - `stays connected until the last connection closes` — +1, +1, −1 → connected; −1 → not connected.
  - `removing a current clue-giver leaves that team without one` → `game.clueGivers.red === null`.
- [ ] **Step 2:** Run `npx vitest run server/game/roster.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat: roster seats, names and connections`.

---

### Task 4: Turn play — start, clue, votes, reveals, win

**Files:** Create `server/game/rules.ts`; Test `server/game/rules.test.ts`

**Interfaces:**
- Consumes: Task 2 `newBoard`, Task 3 roster functions.
- Produces:
  - `startGame(s, words: readonly string[], rand: () => number): ServerState` — lobby only (`not-in-lobby`); ≥ 2 seats per team (`not-enough-players`); `pickClueGivers`; `game = { board: newBoard(...), history: [], votes: {} }`.
  - `guessersOf(s, team: Team): Seat[]` — seats in `order[team]` except the clue-giver.
  - `voters(s): string[]` — ids of **connected** guessers on the guessing team; `[]` outside 'guess'.
  - `giveClue(s, seatId, word: string, number: number): ServerState` — sender must be the clue-giver of the team in 'clue' phase (`not-your-turn`); validate per Global Constraints (`invalid-clue`); store `word` trimmed; push `Clue` to `board.clues`; phase → `guess` with `guessesLeft: number + 1, guessesMade: 0`.
  - `castVote(s, seatId, card: number): ServerState` — sender ∈ `voters(s)` (`not-your-turn`); card in 0..24 and unrevealed (`invalid-vote`); same card as current vote clears it, otherwise sets it; then `settleVotes`.
  - `castEndVote(s, seatId): ServerState` — sender ∈ voters; `guessesMade >= 1` else `invalid-vote`; toggles `'end'`; then `settleVotes`.
  - `settleVotes(s): ServerState` — if phase 'guess' and `voters(s).length >= 1` and every voter's vote is the same card → `reveal`; if every voter's vote is `'end'` → `endTurn`. Otherwise unchanged. Called after every vote and by roster changes that alter `voters` (connect/disconnect/addSeat/removeSeat — wire this in Task 8's dispatch and Task 9's hub, not inside roster.ts).
  - `reveal(s, card: number): ServerState` (internal but exported for tests) — marks revealed, clears votes, then: assassin → `over` (other team wins, `reason: 'assassin'`); any team now has 0 unrevealed cards → `over` (that team wins, `reason: 'cards'`; checked after assassin); own colour → `guessesMade + 1`, `guessesLeft − 1`, end turn if `guessesLeft` hits 0; neutral or opponent → end turn.
  - `endTurn(s): ServerState` — phase → `{ name: 'clue', team: other }`, votes cleared.
  - Every function that changes `board` must go through `commit(s, nextBoard)` (defined in Task 6; for now a stub that just sets `board` and clears `votes`), so undo can be added without rewriting moves.

- [ ] **Step 1: Write the failing tests** (use `lobbyWith({red:['ann','bob','cy'], blue:['dee','eve']})`, `startGame(..., WORDS, seededRandom(1))`, and `colorIndex`):
  - `start needs two per team` → `not-enough-players` with blue = `['dee']`.
  - `first joiner on each team is the first clue-giver` → `clueGivers` = `{ red: 'ann', blue: 'dee' }`.
  - `only the active clue-giver may give a clue` → `not-your-turn` for the other team's clue-giver and for a guesser.
  - `rejects bad clues` — number 0, 10, 2.5; word `''`, `'two words'`, `'abc1'`, and a board word in different case → all `invalid-clue`; `'ice-cream'` accepted.
  - `clue opens guessing with number + 1 guesses`.
  - `a guess needs every connected guesser` — with red guessers bob+cy: bob votes card X → unrevealed, `votes` has 1; cy votes X → revealed.
  - `tapping the same card again clears the vote`.
  - `a lone connected guesser reveals on one tap` — disconnect cy (`setConnected(s,'cy',-1)` then `settleVotes`), bob votes → revealed.
  - `zero connected guessers reveals nothing` — both disconnected; `settleVotes` returns state with phase unchanged.
  - `disconnecting the holdout completes the vote` — bob votes X, cy votes Y, cy disconnects → `settleVotes` reveals X.
  - `own colour continues the turn; guesses run out at number + 1` — clue number 1: two own-colour reveals → phase `clue` for other team.
  - `neutral or opponent card ends the turn`; `opponent card counts for the opponent` (`remaining` falls).
  - `assassin loses for the guessing team` → `{ name:'over', winner: other, reason:'assassin' }`.
  - `revealing the opponent's last card wins it for them`.
  - `end-turn needs a reveal first, then unanimity` → `invalid-vote` before any reveal; after one reveal, both voters `castEndVote` → other team's clue phase.
- [ ] **Step 2:** Run `npx vitest run server/game/rules.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat: VS turn play with consensus voting`.

---

### Task 5: Host corrections and game lifecycle

**Files:** Modify `server/game/rules.ts`; Test `server/game/host.test.ts`

**Interfaces:**
- Produces:
  - `skipTurn(s): ServerState` — in 'clue' or 'guess' → `endTurn` (not an undo step: bypasses `commit`'s history push — see Task 6).
  - `makeClueGiver(s, seatId): ServerState` — seat must exist and be mid-game (`unknown-player` / `not-in-lobby`); sets `clueGivers[seat.team] = seatId`; clears votes. Does not change `nextClueGiver`.
  - `newGame(s, words, rand): ServerState` — from any non-lobby phase: `pickClueGivers`, fresh board, empty history and votes.
  - `backToLobby(s): ServerState` — `game = null`; roster and `nextClueGiver` kept.

- [ ] **Step 1: Write the failing tests:**
  - `clue-giver rotates each game in join order and wraps` — red `['ann','bob','cy']`: games 1–4 clue-givers = ann, bob, cy, ann.
  - `rotation counts the team list as it stands` — after game 1 (ann), back to lobby, `cy` switches to blue; next red clue-giver = `bob` (index 1 of `['ann','bob']`).
  - `make clue-giver hands over the key without changing next game's rotation` — make `cy` red clue-giver in game 1; game 2 red clue-giver = `bob`.
  - `skip turn passes to the other team's clue phase`.
  - `back to lobby keeps players and rotation`.
- [ ] **Step 2:** Run `npx vitest run server/game/host.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat: host corrections and game lifecycle`.

---

### Task 6: Undo

**Files:** Create `server/game/undo.ts`; Modify `server/game/rules.ts` (replace the `commit` stub); Test `server/game/undo.test.ts`

**Interfaces:**
- Produces:
  - `commit(s, next: Board, { undoable = true } = {}): ServerState` — when undoable, pushes the current `board` onto `history`; always sets `board = next` and `votes = {}`. `giveClue`, `reveal` (incl. the turn-end/game-over it causes, as one step) and a vote-driven `endTurn` are undoable; `skipTurn` passes `{ undoable: false }`.
  - `undo(s, seatId): ServerState` — sender must be a current clue-giver of either team (`not-your-turn`); empty history → `nothing-to-undo`; pops last `Board` into `board`, clears votes. `clueGivers` and roster untouched.
  - `canUndo(s): boolean`.

- [ ] **Step 1: Write the failing tests:**
  - `undo reverts a reveal and the turn change it caused` — neutral reveal ends red's turn; undo → phase is red `guess` with the same `guessesLeft`, card unrevealed.
  - `undo reverts a clue back to the clue phase`.
  - `undo brings a finished game back to the board` — assassin reveal → over; undo → phase 'guess'.
  - `undo walks back to the start of the game, then refuses` → `nothing-to-undo`.
  - `the opposing clue-giver may undo`; `a guesser may not` → `not-your-turn`.
  - `undo clears pending votes`.
  - `undo leaves players and clue-giver reassignment alone` — make cy clue-giver after a clue, add a late seat, undo → `clueGivers.red === 'cy'`, late seat still present.
  - `skip turn is not an undo step` — clue, skip, undo → phase is red `clue` (the snapshot before the clue), and history is then empty.
- [ ] **Step 2:** Run `npx vitest run server/game/undo.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement; re-run `rules.test.ts` and `host.test.ts` to confirm nothing regressed.
- [ ] **Step 4:** Run `npx vitest run server/game` — Expected: PASS.
- [ ] **Step 5:** Commit `feat: undo for clue-givers`.

---

### Task 7: Per-device views

**Files:** Create `server/game/views.ts`; Test `server/game/views.test.ts`

**Interfaces:**
- Produces: `viewFor(s: ServerState, viewer: Viewer, joinUrl: string): { view: GameView; you: You }` where
  `type Viewer = { kind: 'tv'; host: boolean } | { kind: 'spectator' } | { kind: 'player'; seatId: string }` (export it).
  - `board`: null in lobby. Per card: `color` = real colour if `revealed`, or if phase is 'over', or if viewer is a player who is a current `clueGivers[team]` of **either** team; else `null`. `votes` = number of voters' votes on that card.
  - `teams[t].players` in `order[t]` order with `connected`; `clueGiverId`; `remaining` = unrevealed cards of colour `t` (null in lobby).
  - `voterCount = voters(s).length`, `endTurnVotes` = voters voting `'end'`, `canUndo = canUndo(s)`, `mode: 'vs'`.
  - `you` for a player: `role` null in lobby, `'clue-giver'` if their id is their team's `clueGivers` entry, else `'guesser'`; `vote` from `votes`.

- [ ] **Step 1: Write the failing tests:**
  - `TV, spectator and guessers never see unrevealed colours mid-game` — for every card with `!revealed`, `color === null`, in 'clue' and 'guess' phases.
  - `both clue-givers see the whole key` — every card has a non-null colour.
  - `everyone sees the key once the game is over`.
  - `a demoted clue-giver loses the key` — after `makeClueGiver(s,'cy')`, `viewFor(s,{kind:'player',seatId:'ann'})` has null colours on unrevealed cards.
  - `removing the clue-giver leaves no red player holding the key` — after `removeSeat(s,'ann')`, every remaining red player's view has null colours on unrevealed cards and `teams.red.clueGiverId === null`.
  - `pips count only current voters` — bob votes X → card X `votes === 1`, `voterCount === 2`; bob disconnects → `voterCount === 1`, X `votes === 0`.
  - `lobby view has null board, remaining and startingTeam`.
  - `JSON.stringify of a guesser view contains no unrevealed card colour` — belt-and-braces: for each unrevealed card, the serialized view doesn't contain `"color":"<its colour>"` at that card (assert via parsed object, not string search).
- [ ] **Step 2:** Run `npx vitest run server/game/views.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat: per-device filtered views`.

---

### Task 8: Dispatch — messages, permissions, settling

**Files:** Create `server/game/dispatch.ts`; Test `server/game/dispatch.test.ts`

**Interfaces:**
- Consumes: Tasks 3–7.
- Produces:
  - `type Sender = { host: boolean; seatId: string | null }`
  - `interface DispatchContext { words: readonly string[]; rand: () => number; newId: () => string; newToken: () => string }`
  - `dispatch(s: ServerState, from: Sender, msg: ClientMessage, ctx: DispatchContext): { state: ServerState; reply?: ServerMessage; seatId?: string }` — throws `GameError`.
    - `hello` → throw `bad-message` (handled by the hub, never here).
    - `join` with `seatId === null` → `addSeat` with fresh id/token, then `settleVotes`; returns `reply: { type:'welcome', token, playerId }` and `seatId`. With a seat → `changeSeat`.
    - `clue`/`vote`/`vote-end`/`undo` → need a seat (`unknown-player`), then the rule.
    - `host:*` → `from.host` else `not-host`; `host:remove-player` then `settleVotes`.
  - `parseClientMessage(raw: string): ClientMessage` — JSON parse + shape check of `type` and field types; throws `bad-message`.

- [ ] **Step 1: Write the failing tests:**
  - `non-host cannot send host actions` → `not-host` for each `host:*` type.
  - `join returns a welcome with a token and the new seat id`.
  - `a mid-game join seats a guesser and adds a pip slot` — during red 'guess', a new red joiner → `voters` grows by 1, nothing revealed.
  - `seatless senders cannot play` → `unknown-player`.
  - `removing a voter re-settles the vote` — bob votes X, cy votes Y, host removes cy → X revealed.
  - `parseClientMessage rejects junk` — `'nope'`, `'{}'`, `'{"type":"vote","card":"3"}'` → `bad-message`; a valid `vote` parses.
- [ ] **Step 2:** Run `npx vitest run server/game/dispatch.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat: message dispatch with permissions`.

---

### Task 9: The server — WebSockets, static files, host detection, LAN URL

**Files:**
- Create: `server/lan.ts`, `server/hub.ts`, `server/index.ts`; Test `server/lan.test.ts`, `server/server.test.ts`
- Modify: `package.json` scripts, `vite.config.ts`, `README.md`

**Interfaces:**
- Produces:
  - `pickLanAddress(ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string | null` — first non-internal IPv4 in 10/8, 172.16/12 or 192.168/16, skipping interfaces whose name matches `/vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|tailscale|zerotier|vpn|utun|tun|tap/i`; falls back to any non-internal IPv4; else null.
  - `isLoopback(addr: string | undefined): boolean` — `127.*`, `::1`, `::ffff:127.*`.
  - `isHostRequest(req: IncomingMessage): boolean` — peer not loopback → false; peer loopback and `x-forwarded-for` present → `isLoopback(last comma-separated hop)`; else true.
  - `createHub(opts: { joinUrl: string; ctx: DispatchContext }): { attach(socket: WebSocket, host: boolean): void; state(): ServerState }` — per socket: wait for `hello` (anything else first → `error bad-message`); tv → viewer `{kind:'tv', host}`; player with known token → bind seat, `setConnected +1`, `settleVotes`; unknown/null token → spectator. Every other frame → `parseClientMessage` → `dispatch`; on success replace state, send `reply` to that socket, rebind it to `seatId` if returned (and `setConnected +1` for the new seat), then broadcast `state` to all sockets via `viewFor`. On `GameError` → `error` to sender only. On close → `setConnected −1` for its seat + `settleVotes` + broadcast. Messages are handled synchronously in arrival order (no awaits between read-state and write-state).
  - `startServer(opts: { port: number; joinUrl: string; staticDir?: string; ctx?: Partial<DispatchContext> }): Promise<{ port: number; close(): Promise<void> }>` — `http.createServer` serving `staticDir` via `sirv(dir, { single: true })` when given; `WebSocketServer({ noServer: true })` handling `upgrade` on `WS_PATH` only, passing `isHostRequest(req)`. `port: 0` picks a free port (tests).
  - `server/index.ts` CLI: port from `PORT` or 3000; IP from `CODENAMES_HOST_IP` or `pickLanAddress` (fallback `localhost` with a warning); join port from `--join-port` or the port; serves `dist/`; logs `Players join: http://<ip>:<joinPort>/` and `TV (open on this laptop): http://localhost:<joinPort>/tv`.

- [ ] **Step 1: Write the failing tests** `server/lan.test.ts`:
  - `prefers the real Wi-Fi adapter over WSL/Hyper-V` — ifaces `{ 'vEthernet (WSL)': [172.20.0.1], 'Wi-Fi': [192.168.1.20] }` → `'192.168.1.20'`.
  - `returns null with only loopback`.
  - `isHostRequest`: peer `192.168.1.5` → false; peer `127.0.0.1` no XFF → true; peer `::ffff:127.0.0.1` with XFF `'127.0.0.1, 192.168.1.5'` → false; with XFF `'127.0.0.1'` → true.
- [ ] **Step 2: Write the failing tests** `server/server.test.ts` (real server on port 0, `ws` clients; helper `nextMessage(ws, type)`):
  - `a TV gets a lobby state after hello`.
  - `join then reconnect with the token restores the seat` — welcome token; close; new socket `hello` with token → `you.kind === 'player'`, same id.
  - `unknown token after restart is a spectator` (Review Focus).
  - `two sockets on one seat stay connected until both close; closing one keeps the vote` (Review Focus) — during 'guess', vote from socket A, close socket B → `you.vote` unchanged and `connected` true.
  - `a guesser's socket never receives an unrevealed colour` — start a game (host socket is loopback in tests, so it can `host:start`), collect every frame a guesser socket receives through a clue and a vote, assert no unrevealed card has non-null `color`.
  - `bad JSON gets bad-message and changes nothing`.
- [ ] **Step 3:** Run `npx vitest run server` — Expected: FAIL.
- [ ] **Step 4:** Implement `lan.ts`, `hub.ts`, `index.ts`.
- [ ] **Step 5:** Run `npx vitest run server` — Expected: PASS.
- [ ] **Step 6:** Wire dev/host workflow:
  - `package.json` scripts: `"host": "vite build && tsx server/index.ts"`, `"dev:server": "tsx watch server/index.ts --join-port 5173"`; make `build` also run `tsc -p tsconfig.server.json` (via the `tsc -b` reference).
  - `vite.config.ts`: `server: { host: true, proxy: { '/ws': { target: 'ws://localhost:3000', ws: true, xfwd: true } } }`.
  - `README.md`: replace the template text with: how to run `npm run host`, open `http://localhost:3000/tv` on the laptop, Windows Firewall will ask to allow Node on first run (allow on Private networks), `CODENAMES_HOST_IP` if the QR shows the wrong address, and the dev workflow (`npm run dev:server` + `npm run dev`).
- [ ] **Step 7:** Manual check: `npm run host`; from a phone on the same Wi-Fi open the printed join URL and confirm the page loads (Track B's screens, or the current build). Run `npm test && npm run lint && npm run build` — Expected: all pass.
- [ ] **Step 8:** Commit `feat: LAN game server with WebSockets and host detection`.
