# VS Mode — Track B: TV + Phone Screens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The React client: a TV screen (lobby with QR, live board with pips, clue history, end screen, host menu) and a phone screen (join, lobby, clue-giver key + clue entry + undo, guesser voting), driven entirely by `GameView`/`You` from the server.

**Architecture:** A framework-free `createConnection` owns the WebSocket, seat token and reconnects; a `useGame` hook exposes its snapshot to React (or a named fixture when `?mock=` is in the URL, so every screen can be built before the server exists). Screens are pure functions of `{ view, you }` plus a `send(ClientMessage)` callback. The client never decides rules or hides anything: it renders what the server sends.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + `@testing-library/react` + `jsdom`, `qrcode`, `nosleep.js`.

**Spec:** [docs/superpowers/specs/2026-11-25-lan-vs-mode-design.md](../specs/2026-11-25-lan-vs-mode-design.md)
**Contract:** [docs/superpowers/plans/2026-11-25-vs-00-contract.md](2026-11-25-vs-00-contract.md) — read it first; every type named below without a definition comes from `src/shared/protocol.ts`.

**Parallel work:** Track A (rules + server) builds against the same contract at the same time. If Track A's Task 1 isn't on `main` yet, copy the contract's `protocol.ts` block verbatim into `src/shared/protocol.ts` (identical file, merges cleanly). Don't touch `server/`, `vite.config.ts`, or `src/shared/protocol.ts` beyond that copy — those are Track A's. Expect a trivial `package.json` merge (both tracks add deps).

## Global Constraints

- Routes: `/tv` (and anything under it) → TV app; everything else → phone app.
- WebSocket URL: `` `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${WS_PATH}` ``.
- Seat token in `localStorage[SEAT_STORAGE_KEY]`; deleted when the server answers a token'd `hello` with `you.kind === 'spectator'`.
- Reconnect backoff: 500 ms doubling to a 5 s cap; reset on successful open; also reconnect immediately when the page becomes visible or the browser fires `online`.
- The client renders `CardView.color` as given and never infers key colours. Cards with `color === null` render neutral-unknown.
- Pips: each unrevealed card shows `view.voterCount` pip slots with `card.votes` filled, only while `phase.name === 'guess'`.
- Host-only controls (Start, New game, Back to lobby, host menu) render only when `you.kind === 'tv' && you.host`.
- Mode picker: VS selectable, Coop shown disabled with the text "Coming soon".
- Clue number input: integers 1–9. Name input: maxlength 20.
- TV text must be readable across a room (board words ≥ 2.2vw, clue ≥ 4vw); phone grid cells ≥ 44 px tall, 5 columns, no horizontal scroll at 360 px wide.
- Keep-awake starts from the Join tap (a user gesture).

## Review Focus

- **Rejected action with no visible feedback.** Any `error` frame must show the message on the device that sent it (toast/inline) and clear on the next state change; e.g. a `name-taken` join leaves the form filled in with the error under it. → test in Task 5.
- **Phone wakes after the server restarted.** Stored token → spectator answer → token deleted, join screen shown, no reconnect loop. → test in Task 1.
- **Clue-giver typing while a state update arrives.** Broadcasts re-render often (every pip); the clue input's text must survive re-renders. → test in Task 5.
- **Disconnected banner.** While `status !== 'open'` every screen shows a "Reconnecting…" banner and disables actions instead of silently dropping taps. → test in Task 1 (snapshot) and Task 3 (banner).
- **Spectator opening the phone URL mid-game.** Sees the join form (joins as a guesser), not a blank or broken board. → fixture + test in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/protocol.ts` | Contract (copy only if Track A's isn't merged). |
| `src/net/connection.ts` | `createConnection`: socket, hello, token, reconnect, snapshot. |
| `src/net/useGame.ts` | React hook over the connection or a fixture. |
| `src/net/fixtures.ts` | Named sample `{ view, you }` pairs for every screen. |
| `src/App.tsx` | Route `/tv` vs phone. (Pass-and-play removed.) |
| `src/components/WordGrid.tsx` | The 5×5 board: words, colours, pips, taps. |
| `src/components/Banner.tsx` | Reconnecting / error banner. |
| `src/tv/TvApp.tsx`, `Lobby.tsx`, `BoardScreen.tsx`, `GameOver.tsx`, `HostMenu.tsx`, `tv.css` | TV screens. |
| `src/phone/PhoneApp.tsx`, `JoinForm.tsx`, `PhoneLobby.tsx`, `ClueGiverScreen.tsx`, `GuesserScreen.tsx`, `phone.css` | Phone screens. |
| `src/wake/keepAwake.ts` | Wake lock with video fallback. |
| Delete | `src/rotation.ts`, `src/rotation.test.ts`, `src/components/Grid.tsx`, `src/components/Card.tsx`, pass-and-play parts of `src/App.css`. Keep `src/keycard/*` untouched. |

---

### Task 1: Connection

**Files:** Create `src/net/connection.ts` (and `src/shared/protocol.ts` copy if needed); Test `src/net/connection.test.ts`

**Interfaces:**
- Produces:
  - `type ConnectionStatus = 'connecting' | 'open' | 'reconnecting'`
  - `interface Snapshot { status: ConnectionStatus; view: GameView | null; you: You | null; error: { code: ErrorCode; message: string } | null }`
  - `createConnection(opts: { url: string; client: 'tv' | 'player'; storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; onChange: (s: Snapshot) => void; WebSocketImpl?: typeof WebSocket; win?: Pick<Window, 'addEventListener' | 'removeEventListener'> & { document: Pick<Document, 'visibilityState'> } }): { send(msg: ClientMessage): void; close(): void }`
  - Behaviour: on open → `hello` (player: token from storage or null); `welcome` → store token; `state` → set view/you, clear error; token'd hello answered with spectator → remove token; `error` → set error; close → status `reconnecting`, retry per Global Constraints; `send` while not open is dropped (UI disables actions then).

- [ ] **Step 1: Write the failing tests** with a hand-rolled `FakeSocket` (records `sent`, exposes `open()`, `receive(obj)`, `drop()`) and fake timers:
  - `sends hello with the stored token on open`; `sends token null when none is stored`; TV sends `{type:'hello', client:'tv'}`.
  - `stores the token from welcome`.
  - `forgets a token the server no longer knows` — stored `'old'`, first state has `you.kind === 'spectator'` → `removeItem(SEAT_STORAGE_KEY)` called; a later spectator state without a token'd hello doesn't call it again.
  - `reconnects with backoff 500, 1000, 2000, 4000, 5000, 5000 ms` and `resets backoff after a successful open`.
  - `reconnects immediately on visibilitychange to visible`.
  - `status goes connecting → open → reconnecting`, and an `error` frame sets `snapshot.error`, cleared by the next `state`.
- [ ] **Step 2:** Run `npx vitest run src/net/connection.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat: client connection with seat token and reconnect`.

---

### Task 2: Fixtures, `useGame`, routing, pass-and-play removal

**Files:** Create `src/net/fixtures.ts`, `src/net/useGame.ts`; Modify `src/App.tsx`, `src/App.css`; Delete files listed above; Test `src/net/fixtures.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `FIXTURES: Record<FixtureName, { view: GameView; you: You }>` with `FixtureName` = `'tv-lobby' | 'tv-lobby-host' | 'tv-clue' | 'tv-guess' | 'tv-guess-host' | 'tv-needs-clue-giver' | 'tv-over' | 'phone-spectator-lobby' | 'phone-spectator-midgame' | 'phone-lobby' | 'phone-cluegiver-clue' | 'phone-cluegiver-waiting' | 'phone-guesser-guess' | 'phone-guesser-waiting' | 'phone-over'`. Built from a `baseView()` helper with real words; guesser/TV fixtures have `color: null` on unrevealed cards, clue-giver and `over` fixtures have all colours.
  - `useGame(client: 'tv' | 'player'): Snapshot & { send(msg: ClientMessage): void }` — if `new URLSearchParams(location.search).get('mock')` names a fixture, returns it with `status: 'open'` and a `send` that `console.info`s; otherwise opens one `createConnection` for the component's lifetime (closed on unmount; StrictMode-safe).
  - `App` renders `<TvApp/>` when `location.pathname.startsWith('/tv')`, else `<PhoneApp/>` (placeholders until Tasks 4–5).

- [ ] **Step 1: Write the failing tests** `fixtures.test.ts`:
  - `non-clue-giver fixtures hide unrevealed colours` — for every fixture whose `you` isn't a clue-giver and whose phase isn't `over`, every unrevealed card has `color === null` (keeps fixtures honest to the contract).
  - `every in-game fixture has 25 cards`.
- [ ] **Step 2:** Run `npx vitest run src/net` — Expected: FAIL.
- [ ] **Step 3:** Implement; delete `src/rotation.ts`, `src/rotation.test.ts`, `src/components/Grid.tsx`, `src/components/Card.tsx` and the pass-and-play UI/CSS.
- [ ] **Step 4:** Run `npm test && npm run lint && npx tsc -b` — Expected: PASS (keycard tests still green).
- [ ] **Step 5:** Commit `feat: fixtures, useGame hook and TV/phone routing; remove pass-and-play`.

---

### Task 3: Word grid and banner

**Files:** Create `src/components/WordGrid.tsx`, `src/components/Banner.tsx`, `src/components/word-grid.css`; Modify `package.json` (dev deps); Test `src/components/WordGrid.test.tsx`, `src/components/Banner.test.tsx`

**Interfaces:**
- Produces:
  - `WordGrid(props: { cards: CardView[]; showPips: boolean; voterCount: number; myVote?: number | 'end' | null; onTap?: (index: number) => void; variant: 'tv' | 'phone' })` — each cell shows the word; class `word--${color ?? 'unknown'}` plus `word--revealed` when revealed (revealed cards: solid team colour; key-only colours on unrevealed cards: tinted border/background so a clue-giver can still read the word); `word--mine` when `myVote === index`; pip row when `showPips && !revealed` with `voterCount` dots, `votes` filled; cells are `<button>`s only when `onTap` is given and the card is unrevealed.
  - `Banner(props: { status: ConnectionStatus; error: { message: string } | null })` — "Reconnecting…" when `status !== 'open'`; otherwise the error message if any; renders nothing otherwise.

- [ ] **Step 1:** `npm i -D jsdom @testing-library/react`. Test files start with `// @vitest-environment jsdom`.
- [ ] **Step 2: Write the failing tests:**
  - `shows 3 pip slots with 2 filled` — card `votes: 2`, `voterCount: 3`, `showPips` → 3 pips, 2 with the filled class.
  - `no pips on revealed cards or when showPips is false`.
  - `renders unknown colour for color null` — class `word--unknown`.
  - `only unrevealed cards are tappable` — `onTap` called with the index on click; revealed card is not a button.
  - `marks my vote` — `myVote: 4` → cell 4 has `word--mine`.
  - Banner: `reconnecting` → text "Reconnecting…"; `open` + error → error text; `open` + null → empty.
- [ ] **Step 3:** Run `npx vitest run src/components` — Expected: FAIL.
- [ ] **Step 4:** Implement (CSS grid of 5 columns; sizes per Global Constraints via a `variant` class).
- [ ] **Step 5:** Run — Expected: PASS.
- [ ] **Step 6:** Commit `feat: word grid with pips, connection banner`.

---

### Task 4: TV screens

**Files:** Create `src/tv/TvApp.tsx`, `src/tv/Lobby.tsx`, `src/tv/BoardScreen.tsx`, `src/tv/GameOver.tsx`, `src/tv/HostMenu.tsx`, `src/tv/tv.css`; Modify `package.json` (`npm i qrcode` + `npm i -D @types/qrcode`); Test `src/tv/tv.test.tsx`

**Interfaces:**
- Consumes: `useGame('tv')`, `WordGrid`, `Banner`.
- Produces: `TvApp()`; each screen takes `{ view: GameView; you: Extract<You, { kind: 'tv' }>; send: (m: ClientMessage) => void }`.
  - **Lobby** (phase `lobby`): mode picker (VS selected; Coop disabled + "Coming soon"); QR from `QRCode.toDataURL(view.joinUrl)` as an `<img alt="Join QR code">` plus the URL as text; red and blue rosters in order with a connected/disconnected dot; host-only **Start** button, disabled with the hint "Each team needs at least 2 players" unless both teams have ≥ 2 players.
  - **BoardScreen** (`clue`/`guess`): whose turn + phase ("Red is thinking of a clue" / "Red: OCEAN 3 — 2 guesses left"); remaining per team; `WordGrid variant="tv" showPips={phase.name==='guess'}`; end-turn pips ("End turn ●●○"); clue history list (newest first, team-coloured); a small QR in a corner so late joiners can scan.
  - **GameOver** (`over`): winner + reason ("Blue found all their agents" / "Red hit the assassin"); full key via `WordGrid`; host-only **New game** (`host:new-game`) and **Back to lobby** (`host:lobby`).
  - **HostMenu** (host only, in `clue`/`guess`): a toggle button opening a panel with **Make clue-giver** (per team, pick a player → `host:make-clue-giver`), **Skip turn** (`host:skip-turn`), **Remove player** (pick → confirm → `host:remove-player`). Opens itself with "Pick a new clue-giver for Red" when that team's `clueGiverId` is null mid-game.

- [ ] **Step 1: Write the failing tests** (render with fixtures):
  - `lobby shows the QR and join URL` (`tv-lobby`) — img with alt "Join QR code" appears (await), URL text present.
  - `coop is shown but disabled` — Coop button `disabled`, text "Coming soon".
  - `start is host-only` — absent in `tv-lobby`, present in `tv-lobby-host`; disabled when a team has < 2 players.
  - `guess phase shows the clue and pips` (`tv-guess`) — clue word and "guesses left" text; pip elements present.
  - `host menu is host-only and sends skip-turn` (`tv-guess-host`) — open menu, click Skip turn → `send` called with `{ type: 'host:skip-turn' }`; not rendered for `tv-guess`.
  - `host menu prompts for a missing clue-giver` (`tv-needs-clue-giver`) — prompt text visible without clicking; choosing a player sends `host:make-clue-giver` with that id.
  - `game over shows the winner and host controls` — `tv-over` rendered with `you = { kind: 'tv', host: true }` shows winner text and both buttons; with `host: false`, neither button.
- [ ] **Step 2:** Run `npx vitest run src/tv` — Expected: FAIL.
- [ ] **Step 3:** Implement; check each fixture visually with `npm run dev` at `/tv?mock=<name>` on a 1920×1080 window.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat: TV lobby, board, game over and host menu`.

---

### Task 5: Phone screens

**Files:** Create `src/phone/PhoneApp.tsx`, `src/phone/JoinForm.tsx`, `src/phone/PhoneLobby.tsx`, `src/phone/ClueGiverScreen.tsx`, `src/phone/GuesserScreen.tsx`, `src/phone/phone.css`; Test `src/phone/phone.test.tsx`

**Interfaces:**
- Consumes: `useGame('player')`, `WordGrid`, `Banner`, Task 6's `keepAwake()` (import it; until Task 6 lands, it can be a no-op stub in `src/wake/keepAwake.ts`).
- Produces: `PhoneApp()` choosing a screen from `you`/`view`:
  - `spectator` (any phase) → **JoinForm**: name input (maxlength 20), **Join Red** / **Join Blue** buttons → `keepAwake()` then `send({ type:'join', name, team })`. Mid-game the heading says "Game in progress — you'll join as a guesser".
  - `player` + `lobby` → **PhoneLobby**: "You're on Red", roster, **Switch to Blue** (sends `join` with own name + other team), rename field optional.
  - `player` + `clue-giver` → **ClueGiverScreen**: `WordGrid variant="phone"` with key colours (from view), no taps; during own team's `clue` phase a form: word text input + number `<select>` 1–9 + **Give clue** (`send({type:'clue', word, number})`), submit disabled while word is empty; otherwise status ("Your team is guessing: OCEAN 3", "Blue's turn"); **Undo** button enabled iff `view.canUndo` → `send({type:'undo'})`, with a confirm step ("Undo last move?").
  - `player` + `guesser` → **GuesserScreen**: `WordGrid` with `onTap` (→ `vote`) only when `phase.name==='guess' && phase.team===you.team`, `myVote={you.vote}`, pips shown; **End turn** button showing `endTurnVotes/voterCount`, disabled until `phase.guessesMade >= 1`, highlighted when `you.vote === 'end'`; status line otherwise ("Waiting for Red's clue…").
  - `over` → winner text + full key; "Waiting for the host to start the next game".
  - All screens show `Banner`; action buttons disabled while `status !== 'open'`.

- [ ] **Step 1: Write the failing tests:**
  - `spectator sees the join form, mid-game too` (`phone-spectator-lobby`, `phone-spectator-midgame`) — name input and both team buttons; mid-game heading text.
  - `join sends name and team and calls keepAwake` (mock `keepAwake` module).
  - `a rejected join keeps the name and shows the error` — rerender same spectator fixture with `error: { code:'name-taken', message:'That name is taken' }` → input still has the typed value, error text visible (Review Focus).
  - `clue form sends word and number` (`phone-cluegiver-clue`) — type "ocean", pick 3, submit → `{ type:'clue', word:'ocean', number:3 }`.
  - `clue text survives a state update` — type "oce", rerender with a fixture differing only in `votes` → input value still "oce" (Review Focus).
  - `undo asks first, then sends` and is disabled when `canUndo` is false.
  - `guesser taps send votes only on their team's guess phase` (`phone-guesser-guess` vs `phone-guesser-waiting`).
  - `end turn is disabled before the first reveal` and sends `vote-end` after.
  - `actions are disabled while reconnecting` — `status: 'reconnecting'` → Join/Give clue/End turn disabled, banner visible.
- [ ] **Step 2:** Run `npx vitest run src/phone` — Expected: FAIL.
- [ ] **Step 3:** Implement; check every phone fixture at `/?mock=<name>` in a 360×740 viewport (no horizontal scroll, cells ≥ 44 px).
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat: phone join, lobby, clue-giver and guesser screens`.

---

### Task 6: Keep phones awake

**Files:** Create/replace `src/wake/keepAwake.ts`; Modify `package.json` (`npm i nosleep.js`); Test `src/wake/keepAwake.test.ts`

**Interfaces:**
- Produces: `keepAwake(): void` — idempotent. Uses one `NoSleep` instance (it uses the Screen Wake Lock API when available and a looping hidden video otherwise — needed because plain-`http` LAN pages aren't a secure context). Call `enable()` synchronously inside the calling gesture. On `visibilitychange` → visible, if not enabled, re-arm: add a one-shot `pointerdown` listener on `document` that calls `enable()` (re-enabling the video needs a gesture).

- [ ] **Step 1: Write the failing tests** (`vi.mock('nosleep.js')`):
  - `enables once however often it's called`.
  - `re-arms on the next tap after the page comes back` — set `isEnabled = false`, fire `visibilitychange` (visible), fire `pointerdown` → `enable` called again; a second `pointerdown` doesn't call it again.
- [ ] **Step 2:** Run `npx vitest run src/wake` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5:** Commit `feat: keep phones awake during play`.

---

### Task 7: Integration with Track A (after both tracks merge)

**Files:** fixes only, wherever the end-to-end run finds mismatches.

- [ ] **Step 1:** On `main` with both tracks merged: `npm test && npm run lint && npm run build` — Expected: PASS.
- [ ] **Step 2:** Dev run: `npm run dev:server` and `npm run dev`; open `http://localhost:5173/tv` on the laptop and the printed join URL on two phones + one extra browser tab (4 players). Walk this checklist and fix anything off:
  - QR on the TV opens the join page on a phone.
  - Join two per team; Start enables; first joiners are clue-givers; only clue-giver phones show colours.
  - Clue appears on TV; pips fill per tap; reveal only on agreement; wrong card passes the turn.
  - Lock a guesser's phone for 30 s, unlock → same seat, still a guesser, vote cleared, pip slots shrank and regrew.
  - Undo from the opposing clue-giver; undo a game-ending assassin.
  - Host menu: make clue-giver, skip turn, remove player (and the "pick a new clue-giver" prompt).
  - New game rotates clue-givers; Back to lobby allows team switches.
  - Restart the server mid-game: phones fall back to the join form, no reconnect loop.
- [ ] **Step 3:** Production run: `npm run host`, repeat the QR + one full turn on a phone.
- [ ] **Step 4:** Commit fixes `fix: integration issues from end-to-end run`.
