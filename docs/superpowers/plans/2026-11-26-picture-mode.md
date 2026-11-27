# Picture Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host-chosen Pictures deck for VS: 20 random images from `public/cards/` on a 5×4 board, dealt 8/7/4/1.

**Architecture:** `deck: 'words' | 'pictures'` lives on `ServerState` beside `mode`, set by a lobby-only host message. `dealGame` deals by deck; a picture card's `word` is its image id (`card-17`). The client draws an `<img>` for picture cards; the grid stays 5 columns, so 20 cards make 4 rows.

**Tech Stack:** TypeScript, React 19, Vite 8, Node `ws` server, Vitest (+ jsdom, Testing Library), Playwright for the final look.

**Spec:** `docs/superpowers/specs/2026-11-26-picture-mode-design.md`

## Global Constraints

- Words deck: 25 cards, 9/8/7/1 — unchanged behaviour, all existing tests pass untouched except where a signature in this plan changes them.
- Pictures deck: 20 cards, starting team 8, other team 7, 4 neutral, 1 assassin, 20 distinct images.
- Image ids are `card-N`; served at `/cards/card-N.jpg`; `public/cards` is git-ignored (already done).
- Deck changes only in the lobby (`not-in-lobby` otherwise), only by the host (`not-host` via the existing `host:` prefix check).
- Pictures cannot be chosen when fewer than 20 images were found at startup.
- VS only; `mode` is untouched.
- Work in `/Users/lucasstarkey/Documents/GitHub/Codenames Digital-pictures`, branch `feat/picture-mode`. Never start anything on ports 3000 or 5173.

## Review Focus

1. A vote for card 20–24 on a picture board must be refused (`invalid-vote`), not crash or reveal `undefined` — Task 1 test.
2. Host plays a picture game, goes back to the lobby, switches to Words, starts: the board is 25 words — Task 1 test.
3. "New game" from a finished picture game deals pictures again (deck is not in `Board`, so undo/new-game never flip it) — Task 1 test.
4. Images folder missing: `host:set-deck` pictures is refused and the TV picker shows Pictures disabled — Task 2 and Task 3 tests.
5. Team wins on its 8th picture card (counts come from the board, not constants) — Task 1 test.

---

### Task 0: Worktree setup

- [ ] **Step 1:** In the worktree, `ln -s "../Codenames Digital/node_modules" node_modules` (fall back to `npm ci` if Vite/Tailwind fail to resolve).
- [ ] **Step 2:** Run `npm test` — Expected: all pass (baseline).

### Task 1: Deck rules on the server

**Files:**
- Modify: `src/shared/protocol.ts` (types, remove `BOARD_CELLS`)
- Modify: `server/game/board.ts`, `server/game/state.ts`, `server/game/roster.ts:7-13` (`emptyState`), `server/game/rules.ts`
- Test: `server/game/board.test.ts`, `server/game/rules.test.ts`, `server/game/testing.ts`

**Interfaces:**
- Produces (protocol): `export type Deck = 'words' | 'pictures'`; `ErrorCode` gains `'no-pictures'`. `BOARD_CELLS` is deleted.
- Produces (board.ts): `export interface DeckSpec { size: number; counts: { starting: number; other: number; neutral: number; assassin: number } }`; `export const DECKS: Record<Deck, DeckSpec>` = words `{25, 9/8/7/1}`, pictures `{20, 8/7/4/1}`; `newBoard(items: readonly string[], rand: () => number, spec: DeckSpec = DECKS.words): Board`.
- Produces (state.ts): `ServerState.deck: Deck`; `emptyState()` sets `'words'`.
- Produces (rules.ts): `startGame(s, words, rand, pictures: readonly string[] = [])`, `newGame(s, words, rand, pictures: readonly string[] = [])`, `dealGame(s, words, rand, pictures = [])` — deals `newBoard(pictures, rand, DECKS.pictures)` when `s.deck === 'pictures'`; `setDeck(s: ServerState, deck: Deck, pictures: readonly string[]): ServerState`.
- Produces (testing.ts): `export const PICTURES = Array.from({ length: 30 }, (_, i) => \`card-${i}\`)`.

- [ ] **Step 1: Write the failing tests**

`board.test.ts`:
- `deals 20 distinct pictures with 8/7/4/1` — `newBoard(PICTURES, seededRandom(2), DECKS.pictures)`: length 20, 20 distinct, all in `PICTURES`, counts 8 / 7 / 4 / 1.
- `throws on fewer than 20 pictures` — `PICTURES.slice(0, 19)` throws.

`rules.test.ts` (`describe('picture deck')`):
- `setDeck switches the lobby deck` — `setDeck(lobby(), 'pictures', PICTURES).deck === 'pictures'`.
- `setDeck refuses mid-game` — `codeOf(() => setDeck(startRed(), 'pictures', PICTURES)) === 'not-in-lobby'`.
- `setDeck refuses pictures with fewer than 20 images` — `codeOf(() => setDeck(lobby(), 'pictures', PICTURES.slice(0, 19))) === 'no-pictures'`; `setDeck(…, 'words', [])` still works.
- `a picture game deals 20 cards` — start from the pictures lobby with `startGame(s, WORDS, seededRandom(1), PICTURES)`: 20 cards, every `word` matches `/^card-\d+$/`.
- `refuses a vote past the 20th card` — red picture game in guess phase; `codeOf(() => castVote(s, 'bob', 20)) === 'invalid-vote'` and same for 24.
- `new game keeps pictures; back to lobby + words deals 25` — `newGame(pictureGame, WORDS, rand, PICTURES)` → 20 cards; `startGame(setDeck(backToLobby(pictureGame), 'words', PICTURES), WORDS, rand, PICTURES)` → 25 cards.
- `wins on the 8th picture card` — reveal all 8 of the starting team's cards via `reveal`; phase is `{ name: 'over', winner: startingTeam, reason: 'cards' }`.
- `labels a revealed picture by number` — red picture game, clue given, then `reveal(s, i)` on a red card whose `word` is `card-N`: `timelineLabels(game).at(-1)` equals `` `Red revealed picture ${N} (red)` ``.

Extend `startRed(s, from)` to forward `PICTURES` as the 4th argument so picture lobbies work with it.

- [ ] **Step 2:** `npx vitest run server/game` — Expected: new tests FAIL (`DECKS` / `setDeck` not exported).

- [ ] **Step 3: Implement**
- `newBoard` builds colours from `spec.counts`, needs `spec.size` distinct items, slices `spec.size`.
- `setDeck`: throws `not-in-lobby` if `s.game`; throws `no-pictures` ("Add at least 20 pictures to public/cards") when `deck === 'pictures' && pictures.length < DECKS.pictures.size`; returns `{ ...s, deck }`.
- `castVote`: bound by `game.board.cards.length` instead of `BOARD_CELLS`.
- `reveal` label: name the card `s.deck === 'pictures' ? \`picture ${word.slice('card-'.length)}\` : word.toUpperCase()`.

- [ ] **Step 4:** `npx vitest run server` — Expected: all PASS. `npx tsc -b` — Expected: no errors.

- [ ] **Step 5: Commit** — `feat: picture deck rules (20 cards, 8/7/4/1)`

### Task 2: Wire the deck through dispatch, views and startup

**Files:**
- Create: `server/pictures.ts`, `server/pictures.test.ts`
- Modify: `src/shared/protocol.ts`, `server/game/dispatch.ts`, `server/game/views.ts`, `server/hub.ts`, `server/index.ts`, `server/main.ts`
- Test: `server/game/dispatch.test.ts`, `server/game/views.test.ts`

**Interfaces:**
- Consumes: `setDeck`, `startGame`/`newGame` 4th arg, `DECKS` (Task 1).
- Produces (protocol): `ClientMessage` gains `{ type: 'host:set-deck'; deck: Deck }` (lobby only). `GameView` gains `deck: Deck` and `picturesAvailable: boolean` ("at least 20 images were found at startup"). `board` doc comment → "20 or 25 cards, row-major; null in lobby".
- Produces (dispatch.ts): `DispatchContext.pictures: readonly string[]`.
- Produces (views.ts): `viewFor(s, viewer, joinUrl, picturesAvailable = false)`.
- Produces (pictures.ts): `findPictures(dir: string): string[]` — `card-0`, `card-1`, … for each consecutive `card-N.jpg` from 0, stopping at the first gap; `[]` when the folder is missing.

- [ ] **Step 1: Write the failing tests**
- `pictures.test.ts`: in a temp dir with `card-0.jpg`, `card-1.jpg`, `card-3.jpg` → `['card-0', 'card-1']`; missing dir → `[]`.
- `dispatch.test.ts`: add `pictures: PICTURES` to `ctx`; `host:set-deck` from host sets `state.deck`; from `as('ann')` → `not-host`; then `host:start` deals 20 cards; `parseClientMessage('{"type":"host:set-deck","deck":"emoji"}')` → `bad-message`.
- `views.test.ts`: lobby view has `deck: 'words'`, `picturesAvailable: false` by default and `true` when passed; after `setDeck` the view's `deck` is `'pictures'`.

- [ ] **Step 2:** `npx vitest run server` — Expected: new tests FAIL.

- [ ] **Step 3: Implement**
- dispatch: case `'host:set-deck'` → `setDeck(s, msg.deck, ctx.pictures)`; pass `ctx.pictures` to `startGame`/`newGame`; SHAPES entry checks `m.deck === 'words' || m.deck === 'pictures'`.
- hub: `viewFor(state, viewerOf(conn), opts.joinUrl, opts.ctx.pictures.length >= DECKS.pictures.size)`.
- index.ts: default `ctx.pictures: []`. main.ts: `const pictures = findPictures(fileURLToPath(new URL('../public/cards', import.meta.url)))`; pass via `ctx: { pictures }`; log `Pictures: N found` or, under 20, a warning that Pictures mode is off.

- [ ] **Step 4:** `npm test` — Expected: all PASS; `npx tsc -b` clean; `npm run lint` clean.

- [ ] **Step 5: Commit** — `feat: host can pick the picture deck`

### Task 3: Pictures on screen

**Files:**
- Modify: `src/components/WordGrid.tsx`, `src/components/word-grid.css`, `src/tv/Lobby.tsx`, `src/phone/PhoneLobby.tsx`, `src/tv/BoardScreen.tsx`, `src/tv/GameOver.tsx`, `src/phone/GuesserScreen.tsx`, `src/phone/ClueGiverScreen.tsx`, `src/net/fixtures.ts`
- Test: `src/components/WordGrid.test.tsx`, `src/tv/tv.test.tsx`, `src/phone/phone.test.tsx`

**Interfaces:**
- Consumes: `GameView.deck`, `GameView.picturesAvailable`, `host:set-deck` (Task 2).
- Produces: `WordGridProps.pictures?: boolean`; fixtures `tv-guess-pictures` and `phone-guesser-pictures` (20 cards `card-0`…`card-19`, 8/7/4/1, some revealed, a few votes).

- [ ] **Step 1: Write the failing tests**
- `WordGrid.test.tsx`: `pictures` → each card renders `img[src="/cards/card-3.jpg"][alt="Picture 3"]` and no `.word__text`; with `keyCard` too, no `img` (key card stays colour-only); pips still render over an unrevealed picture in a guess phase.
- `tv.test.tsx`: host lobby shows a group labelled `Deck` with `Words` (pressed) and `Pictures`; clicking `Pictures` sends `{ type: 'host:set-deck', deck: 'pictures' }`; with `picturesAvailable: false`, `Pictures` is disabled; non-host TV sees the buttons disabled with the current one pressed.
- `phone.test.tsx`: phone lobby with `deck: 'pictures'` shows the text `Picture cards`.

- [ ] **Step 2:** `npx vitest run src` — Expected: new tests FAIL.

- [ ] **Step 3: Implement**
- Fixtures: base views get `deck: 'words'`, `picturesAvailable: true`; add the two picture fixtures.
- `WordGrid`: when `pictures && !keyCard`, the card body is the `<img loading="eager" draggable={false}>` plus pips; skip `useFitWords` (pass `''`). Grid gets class `word-grid--pictures`.
- CSS for `.word-grid--pictures .word`: `aspect-ratio: 1; padding: 0; overflow: hidden`; image `position:absolute; inset:0; width/height 100%; object-fit:cover`; pips `position:absolute; bottom` on a dark translucent strip. Revealed: image `opacity: 0.25` under the solid team colour background, so colour reads at a glance. The TV's `height:100%; grid-auto-rows:1fr` rule must not stretch picture tiles out of square — for `.word-grid--pictures` on TV, size the grid by height (`aspect-ratio: 5 / 4; height: 100%; width: auto; margin-inline: auto`).
- Callers pass `pictures={view.deck === 'pictures'}` (BoardScreen, GameOver, GuesserScreen); ClueGiverScreen unchanged.
- TV Lobby: second `.mode-picker` group `aria-label="Deck"`, buttons `Words` / `Pictures`, `aria-pressed` on the current deck, `disabled` unless `you.host && !disabled` (and Pictures also needs `view.picturesAvailable`). Footer hint when pictures: "20 picture cards, 5×4."
- PhoneLobby: under "Waiting for the host to start…", a line "Picture cards" / "Word cards".

- [ ] **Step 4:** `npm test`, `npx tsc -b`, `npm run lint` — Expected: all clean.

- [ ] **Step 5: Commit** — `feat: picture cards on the TV and phones`

### Task 4: Look at it in a real browser (port 3100)

- [ ] **Step 1:** `npm run build`; confirm `dist/cards/card-0.jpg` exists (Vite copies `public/`; if the symlink isn't followed, serve `public/cards` instead and note it).
- [ ] **Step 2:** `PORT=3100 npx tsx server/main.ts` in the background — Expected log: `Pictures: 280 found`, TV at `http://localhost:3100/tv`.
- [ ] **Step 3:** A scratch Playwright script (scratchpad, not the repo) launches headed Chromium: TV at `localhost:3100/tv`, four phone contexts (390×844) joining two per team, host clicks Pictures → Start. Screenshot TV, a guesser phone and the clue-giver phone; leave the browser open for the user.
- [ ] **Step 4:** Check screenshots: 5×4 square tiles on TV, phone tiles recognisable, key card 20 colour tiles. Fix and recommit anything off.
