# Clue Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clue waits for the other team's clue-giver to approve or reject it before the TV and guessers see it; with nobody able to check, it goes straight through.

**Architecture:** The waiting clue lives on `Game` beside `votes` (outside `Board`), so undo and the timeline are untouched. `giveClue` splits into `validateClue` + `commitClue`; a new `server/game/review.ts` owns submit / verdict / withdraw / auto-settle. Views hide the clue from everyone but the two clue-givers.

**Tech Stack:** TypeScript, Node `ws`, React 19, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-26-clue-approval-design.md`

## Global Constraints

- Only the two clue-givers ever receive the waiting clue's word/number; TV, spectators and guessers get only `checking: Team | null`.
- No host approve/reject/override anywhere.
- Timeline and undo history change only when a clue is committed (as today).
- "Nobody to check" = other team's clue-giver is null or has 0 connections → commit immediately.
- Copy: TV/guessers "Blue is checking Red's clue…"; giver "Waiting for Blue to check OCEAN 2…"; reject line "Blue rejected OCEAN 2 — try another".
- Never touch ports 3000 / 5173.

## Review Focus

1. Checker's phone drops while a clue waits → clue commits at once (Task 1 test via `setConnected`).
2. Host reassigns the giving team's clue-giver mid-wait → waiting clue dropped; checking team's → kept, or committed if the new checker is offline (Task 1 tests).
3. Guesser/TV/spectator views never contain the waiting word (Task 2 test asserts JSON of their view lacks it).
4. Giver's first clue of the game (empty undo history) can still be taken back (Task 1 + Task 3 tests).
5. Reject → resend → approve leaves exactly one timeline entry for the approved clue (Task 1 test).

---

### Task 1: Clue review rules

**Files:**
- Create: `server/game/review.ts`, `server/game/review.test.ts`
- Modify: `server/game/state.ts` (Game fields), `server/game/rules.ts` (split `giveClue`; `dealGame`, `makeClueGiver` init/clear), `server/game/undo.ts` (clear fields; withdraw in `undo`)

**Interfaces:**
- Produces (state.ts): `Game.pendingClue: { clue: Clue; by: string } | null` (`by` = giver seat id), `Game.rejectedClue: Clue | null`.
- Produces (rules.ts): `validateClue(s, seatId, rawWord, number): Clue` (today's checks, throws as today); `commitClue(s, clue: Clue): ServerState` (today's commit + label); `giveClue` = `commitClue(s, validateClue(...))`, kept for existing tests.
- Produces (review.ts): `checkerOf(s, team: Team): Seat | null` (other team's clue-giver if connected); `submitClue(s, seatId, rawWord, number)`; `clueVerdict(s, seatId, approve: boolean)`; `settleClue(s): ServerState`; `settle(s) = settleClue(settleVotes(s))`.
- `commit`, `undo`, `hostUndo`, `dealGame` set both new fields to null. `undo` by the waiting clue's `by` seat clears only `pendingClue` (no log, no history change). `makeClueGiver` result goes through `settleClue`.

- [ ] **Step 1: Write failing tests** in `review.test.ts` (red goes first via `startRed()`; red giver `ann`, blue giver `dee`; both connected — use `setConnected(s, id, 1)` for each seat first, since `lobby()` seats start at 0 connections):
  - `waits for blue when blue's clue-giver is connected` — `submitClue(s,'ann','ocean',2)`: phase still `clue`, `pendingClue.clue` = `{team:'red',word:'ocean',number:2}`, timeline unchanged.
  - `goes straight through when blue's clue-giver is offline` — dee at 0 connections: phase `guess`, `pendingClue` null.
  - `goes straight through with no blue clue-giver` — `removeSeat(s,'dee')` then submit: phase `guess`.
  - `refuses a second clue while one waits` — `not-your-turn`.
  - `only blue's clue-giver can rule` — `clueVerdict(s,'eve',true)` and `(s,'ann',true)` → `not-your-turn`; with nothing waiting `(s,'dee',true)` → `not-your-turn`.
  - `approve commits the clue` — phase `guess` with clue ocean 2; last timeline label `Red clue: OCEAN 2`.
  - `reject hands the clue back` — `pendingClue` null, `rejectedClue` ocean 2, phase `clue`, timeline unchanged.
  - `reject, resend, approve logs one clue` — reject ocean, submit `sea` 1 (rejectedClue now null), approve: timeline has exactly one `Red clue:` entry, `Red clue: SEA 1`.
  - `the giver takes a waiting clue back with undo, even on the first clue` — `undo(s,'ann')` → `pendingClue` null, history length unchanged (0), timeline unchanged.
  - `checker going offline approves the waiting clue` — `settle(setConnected(s,'dee',-1))` → phase `guess`.
  - `swapping red's clue-giver drops the waiting clue` — `makeClueGiver(s,'bob')` → `pendingClue` null.
  - `swapping blue's clue-giver keeps it; an offline new checker approves it` — `makeClueGiver(s,'eve')` with eve connected → still waiting; with eve at 0 connections → phase `guess`.
  - `a board change clears it` — `skipTurn` while waiting → `pendingClue` null and `rejectedClue` null.

- [ ] **Step 2:** `npx vitest run server/game/review.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the Interfaces above. `submitClue`: validate; throw `not-your-turn` if `pendingClue`; no checker → `commitClue`; else store `{clue, by: seatId}`, `rejectedClue: null`. `settleClue`: if waiting and `clueGivers[clue.team] !== by` → drop; else if `!checkerOf` → `commitClue`.
- [ ] **Step 4:** `npx vitest run server` — Expected: all PASS; `npx tsc -b` clean.
- [ ] **Step 5: Commit** — `feat: clues wait for the other clue-giver`

### Task 2: Protocol, dispatch, hub, views

**Files:**
- Modify: `src/shared/protocol.ts`, `server/game/dispatch.ts`, `server/hub.ts`, `server/game/views.ts`, `src/net/fixtures.ts`
- Test: `server/game/dispatch.test.ts`, `server/game/views.test.ts`

**Interfaces:**
- Consumes: Task 1 `submitClue`, `clueVerdict`, `settle`, `settleClue`.
- Produces: `ClientMessage` `{ type: 'clue-verdict'; approve: boolean }`; `GameView.checking: Team | null`; `You` (player) `pendingClue: Clue | null` (giver or checker only) and `rejectedClue: Clue | null` (that team's current giver only).
- dispatch: `clue` → `submitClue`; `clue-verdict` → `clueVerdict` (SHAPES: `typeof m.approve === 'boolean'`); `join`, `host:remove-player` → `settle(...)`; `host:make-clue-giver` already settles in rules. hub: both `settleVotes(setConnected(...))` → `settle(...)`.
- Fixtures: base views `checking: null`; `ANA`/`BEN` gain `pendingClue: null, rejectedClue: null`.

- [ ] **Step 1: Write failing tests**
  - dispatch: `a clue from ann waits; dee's verdict message approves it` (seats connected); `parseClientMessage('{"type":"clue-verdict","approve":"yes"}')` → `bad-message`.
  - views: while ocean 2 waits — `checking: 'red'` for every viewer; `you.pendingClue` ocean 2 for ann and dee; `null` for bob/eve; `JSON.stringify(view)` for TV, spectator, bob, eve contains no `ocean`. After reject — ann's `you.rejectedClue` ocean 2, dee's null.
- [ ] **Step 2:** `npx vitest run server` — Expected: new tests FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4:** `npm test`, `npx tsc -b`, `npm run lint` — Expected: clean.
- [ ] **Step 5: Commit** — `feat: clue verdicts over the wire, hidden from guessers`

### Task 3: Screens

**Files:**
- Modify: `src/phone/ClueGiverScreen.tsx`, `src/phone/GuesserScreen.tsx`, `src/tv/BoardScreen.tsx`, `src/phone/phone.css`, `src/net/fixtures.ts`
- Test: `src/phone/phone.test.tsx`, `src/tv/tv.test.tsx`

**Interfaces:**
- Consumes: `view.checking`, `you.pendingClue`, `you.rejectedClue`, `clue-verdict`.
- Produces fixtures: `phone-cluegiver-waiting-check` (Ana, red clue phase, pendingClue ocean 2, `checking:'red'`), `phone-cluegiver-checking` (Dev as blue giver with pendingClue ocean 2), `phone-cluegiver-rejected` (Ana, rejectedClue ocean 2), `tv-checking` (red clue phase, `checking:'red'`).

- [ ] **Step 1: Write failing tests**
  - giver waiting: text `Waiting for Blue to check OCEAN 2…`; Undo enabled even with `view.canUndo: false`, click sends `{type:'undo'}`; no clue input.
  - checker: shows `OCEAN 2`; `Approve` sends `{type:'clue-verdict',approve:true}`, `Reject` sends `approve:false`.
  - rejected: text `Blue rejected OCEAN 2 — try another`; clue input value `ocean`.
  - TV `tv-checking`: status `Blue is checking Red's clue…`; guesser (`phone-guesser-waiting` + `checking:'red'`): same text.
- [ ] **Step 2:** `npx vitest run src` — Expected: FAIL.
- [ ] **Step 3: Implement.** Turn slot states: my turn + no wait → `ClueForm` (initial word/number from `rejectedClue`, keyed on clue count + rejected word, reject line above); my turn + waiting → waiting card; checker → check card with Reject/Approve, `navigator.vibrate?.(200)` once when it appears; else status line, which says the checking copy when `view.checking`.
- [ ] **Step 4:** `npm test`, `npx tsc -b`, `npm run lint` — Expected: clean.
- [ ] **Step 5: Commit** — `feat: approve or reject clues on the phone`

### Task 4: Look at it on port 3100

- [ ] Stop the old 3100 demo server (this session's background job) and Chrome script; `npx vite build`; `PORT=3100 npx tsx server/main.ts` in background; Playwright (Chrome channel) script: TV + 4 phones, start a game, red giver sends a clue → screenshot giver, checker, TV; checker rejects → screenshot giver; resend, approve → screenshot TV. Leave open.
