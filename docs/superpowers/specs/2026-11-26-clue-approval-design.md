# Clue approval — design

## Intent

At a real table, borderline clues get negotiated: "is OCEAN OK with WAVE on
the board?" The other team's clue-giver makes that call. In the app a clue
goes straight to the TV, so that negotiation has no place. Picture mode makes
it matter more, because the server's "not a word on the board" check means
nothing there.

So: a clue first goes to the other team's clue-giver, who approves or
rejects it. Only approved clues reach the TV and guessers.

## Goals

- Every clue (word and number) waits for the other team's clue-giver to approve or reject it.
- While it waits, only the two clue-givers see it. The TV and every guesser see "Blue is checking Red's clue…".
- Reject sends the clue back to the giver, still in their box, with "Blue rejected OCEAN 2 — try another".
- The giver can take a waiting clue back.
- **Nobody to check means it goes straight through.** That covers no clue-giver assigned on the other team, or that clue-giver not connected. A checker who disconnects while a clue waits approves it at that moment.

## Non-goals / anti-goals

- **No host involvement.** The TV is public, so showing the clue there would defeat the point. The host gets no approve, reject or override.
- No typed reasons. Everyone is in one room and says them out loud.
- Approved clues show up in the timeline exactly as today. Waiting, rejected and taken-back clues aren't game moves: no timeline entries, nothing to undo.

## Approaches

- **A. A "checking" phase inside `Board`.** Rejected: `Board` is what undo and the host timeline snapshot, so every check, reject and take-back would become an undo or timeline case to special-case.
- **B. The waiting clue lives on `Game`, next to `votes`, outside `Board`** *(picked)*. The phase stays `clue`. Approving runs the existing `giveClue` path, so validation and the timeline label don't change. Rejecting or taking back clears the waiting clue. Undo and the timeline need no changes.
- **C. Relay between the two phones only, with no server state.** Not considered further: a reconnecting phone loses the clue, and the server can't tell when nobody is there to check.

## Design (approach B)

**Server state** (`Game`, outside `Board`):
- `pendingClue: Clue | null`: the clue waiting to be checked.
- `rejectedClue: Clue | null`: the giver's last rejected clue, for their message and box. It clears on their next send or when the turn changes.

**Rules**
- `clue` message, sent by the current giver in their `clue` phase: validate exactly as today, then either
  - commit it now, if the other team has no clue-giver or theirs isn't connected, or
  - store it as `pendingClue`, clearing `rejectedClue`.
  A second `clue` while one is waiting is refused (`not-your-turn`).
- New `{ type: 'clue-verdict'; approve: boolean }`: only the other team's current clue-giver can send it, and only while a clue is waiting (`not-your-turn` otherwise).
  - Approve commits the clue through the existing path.
  - Reject moves it to `rejectedClue`.
- Taking a clue back: the giver's existing `undo`, while their clue waits, clears `pendingClue` and nothing else. Without a waiting clue, `undo` works as today.
- Any `Board` change (undo, host undo, skip turn, new game, back to lobby) clears both fields, the same way votes are cleared.
- If the host makes someone else the **giving** team's clue-giver, the waiting clue is dropped. If they change the **checking** team's clue-giver, it stays and the new clue-giver checks it. If the new clue-giver isn't connected, it goes through.
- **Auto-approve hook:** wherever the hub already runs `settleVotes` after a connect, disconnect or roster change, also settle the waiting clue. With nobody to check, commit it.

**Protocol / views**
- `GameView.checking: Team | null`: the team whose clue is waiting. Everyone gets it, for the TV and guesser status lines.
- `You` (player) gains `pendingClue: Clue | null` and `rejectedClue: Clue | null`. They're filled only for the giver, plus `pendingClue` for the checker, and null for everyone else. The server enforces this in `viewFor`.

**Screens**
- **Giver's phone:** after sending, the clue box becomes "Waiting for Blue to check OCEAN 2…" with the Undo button. After a reject, the box comes back holding the rejected word and number, with the reject line above it.
- **Checker's phone:** the turn slot shows the clue with **Reject** and **Approve** buttons. The phone vibrates if it can (`navigator.vibrate`).
- **TV and guesser phones:** the status line says "Blue is checking Red's clue…".

## Left to the builder

- Exact copy and styling of the waiting and checking cards.
- Tests: commit now vs wait, verdict permissions, reject/take-back/new-send cycle, auto-approve on disconnect and on a disconnected new checker, clearing on board changes, `viewFor` hiding, and the screens.

## Work happens on

Branch `feat/clue-approval` in `../Codenames Digital-pictures`, cut from
`feat/picture-mode` (PR #9).
