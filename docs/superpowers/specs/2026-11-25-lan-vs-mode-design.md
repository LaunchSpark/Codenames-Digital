# LAN VS Mode — Design

Date: 2026-11-25
Status: draft, awaiting approval

## Intent

Turn the pass-and-play key-card generator into a full digital Codenames-style
game for a party of up to ~10 people on a home network, played with no physical
table. One host machine runs a server and drives a TV showing the word board.
Everyone else joins from their own phone by QR code or link, picks red or blue,
and plays entirely on their phone: clue-givers see the key and type clues,
guessers tap words and the team must agree before a guess counts.

The competitive red-vs-blue ("VS") game is the focus. The existing Duet-style
coop mode stays in the product as a mode choice but its networked gameplay is
deferred.

## Goals

- Host runs one command; the TV shows a QR code + URL; phones join in seconds.
- Players pick red or blue on their phone (and can switch while in the lobby).
- The game engine runs the whole VS game: clues, guesses, turn changes, scoring,
  win/lose, new games.
- Guessing is consensus-based, shown as pips under each word on the TV.
- The key never reaches a device that shouldn't see it.
- Phones that sleep or drop return to the same seat automatically.
- Phones are kept awake during play where the browser allows.

## Non-goals (this project)

- Coop gameplay over the network (mode exists in the picker as "coming soon").
- Play over the internet, accounts, or multiple simultaneous games on one host.
- Persisting a game across a server restart.
- Board sizes other than 5×5 for VS.
- Turn timers.
- HTTPS / certificates.

## Anti-goals (failure even if it "works")

- A guesser can see the key by any means, including browser dev tools.
- A phone that slept loses its seat or forces a rejoin mid-game.
- Pips or reveals visibly lag behind taps.
- A misclick permanently ruins a game (hence undo).

## Constraints

- Home network, up to ~10 phones plus the TV. Plain `http://<lan-ip>:<port>`.
- Existing stack: React 19 + TypeScript + Vite, Vitest for tests, Oxlint.
- Word list: [words.txt](../../../words.txt), ~400 words, currently formatted as a
  Go slice (copied from bcspragu/Codenames; the list is public, no licensing
  concern). Needs converting to a TS/JSON module.
- The TV is the host laptop's display over HDMI (confirmed by the user); the
  host clicks on the TV screen with the laptop's mouse/keyboard.

## Approaches considered

1. **Host server with a live WebSocket connection per device — chosen.** Server
   holds the one authoritative game state in memory and pushes each device a
   view filtered for its role the instant anything changes. Instant pips;
   cost is reconnection handling.
2. **Host server, devices poll over HTTP every ~500 ms.** Same authority and
   filtering, simpler, nothing to reconnect — but pips/reveals lag and 10
   devices chatter constantly. Rejected because instant pips are the core feel.
3. Rejected outright: hosted realtime services (need internet, data leaves the
   network) and peer-to-peer (still needs a signalling server; hiding the key
   gets harder).

The user picked approach 1.

## Design

### Shape

- One repo. Add a small Node server (TypeScript) that serves the built React
  app and a WebSocket endpoint, holds game state, and prints the LAN URL on
  start. In development, Vite's dev server proxies to it.
- **Host command:** a single `npm run host` builds the client and starts the
  server. *(My call.)* LAN IP is auto-detected (first private IPv4 on a
  non-virtual adapter — Windows often has WSL/Hyper-V/VPN adapters), with an
  env-var override if it picks wrong. The README notes that Windows Firewall
  will prompt to allow the server on first run.
- The React app has three entry screens by URL:
  - **TV** (`/tv`, opened on the host): mode picker, lobby, board, end screen.
  - **Join / phone** (`/` or `/join`): name + team pick, then the player's
    in-game screen.
- Game rules are pure functions (state + action → new state), unit-tested with
  Vitest, independent of networking — same style as the existing
  [keycard/generate.ts](../../../src/keycard/generate.ts).
- The server keeps one game at a time. *(My call.)*

### Mode picker

TV start screen offers **VS** and **Coop**. Coop is shown disabled with "coming
soon". The existing coop key-card generator and its tests stay in the codebase
untouched; the pass-and-play UI (handoff/viewing screens in
[App.tsx](../../../src/App.tsx)) is removed, along with
[rotation.ts](../../../src/rotation.ts) and its test (quarter-turn card rotation,
pass-and-play only). The VS key (9/8/7/1) is new code; the coop generator is not
reused for it.

### The host and the TV

- The host machine opens the TV screen at `http://localhost:<port>/tv`. The
  server treats connections from loopback as **host**; only host connections may
  send host actions (Start, New game, Back to lobby, and the host menu below).
  *(My call — simplest reliable boundary given the laptop-on-HDMI setup.)*
- Anyone on the network may open `/tv` read-only; multiple TV tabs are fine.
  The TV view never contains the key before the end screen, so it isn't a
  hiding boundary.

### Host menu (TV only)

A small menu on the TV, usable only from the host connection, for when a game
gets stuck (requested by the user):

- **Make clue-giver** — pick a player on a team to take over that team's key for
  the rest of this game (e.g. clue-giver's phone died or they left). Rotation
  for the next game continues from the original order.
- **Skip turn** — end the active team's turn and hand play to the other team
  (e.g. all its guessers dropped).
- **Remove player** — delete a seat that isn't coming back. If it was a current
  clue-giver, the host is prompted to pick a replacement.

- **Undo (host)** — added 2026-11-26. Steps back through everything this
  game: clues, reveals, turn ends, clue-giver undos, and the host's own skips
  and clue-giver changes. Shows the recent moves as a list so the host can jump
  straight back to a point. Removed players stay removed; if a restored
  clue-giver has left, the host is asked to pick one.

Host-menu actions are not undoable via the clue-givers' Undo. *(My call —
Undo is for game moves, these are corrections.)*

### Joining and seats

- TV lobby shows a QR code encoding the LAN join URL, the URL as text, and the
  red and blue rosters live.
- Phone: enter a display name *(my call — needed for rosters)*, tap Red or
  Blue. Can switch teams freely in the lobby.
- Identity: on first join the server issues a random seat token; the phone
  stores it in `localStorage` and presents it on every (re)connect. Server maps
  token → seat (name, team, join order). Reconnect = same seat, same view.
- Each team keeps an ordered list of its players; joining a team (including
  switching teams in the lobby) appends you to the end of that team's list.
  *(My call.)* This list is the clue-giver rotation order.
- Late joiners (mid-game) pick a team, play as a guesser, and are appended to
  the end of that team's list.
- Start requires each team to have at least 2 players (1 clue-giver + 1
  guesser). *(My call — consensus needs at least one guesser.)*
- Host presses **Start** on the TV.

### Roles and rotation

- Each game ("round"), each team's clue-giver is the next player in that team's
  join order; the first game uses the first joiner on each team.
- Clue-giver stays fixed for the whole game (unless the host reassigns it). On
  **New game**, each team's rotation advances by one (wrapping), applied to the
  team list as it stands when the new game starts. Rotation is stored as an
  index into the team's list; if players have left or switched, the index wraps
  over the current list. *(My call.)*
- Everyone else on the team is a guesser.

### Board and key

- 25 distinct random words from the word list, 5×5.
- Starting team is random, owns 9 cards and goes first; the other team 8;
  7 neutral; 1 assassin.

### Turn flow

1. **Clue phase.** The active team's clue-giver types one word and a number on
   their phone and submits. Clue appears on the TV (and in a clue history list
   there).
   - Number range 1–9. *(My call — skip the 0/unlimited variants for now.)*
   - A clue is a single word (letters, hyphens allowed, no spaces) and may not
     match any board word, revealed or not (case-insensitive). *(My call.)*
   - Guess allowance doesn't need capping — the turn ends naturally when the
     team's cards run out or a wrong card is hit.
2. **Guess phase.** Guesses allowed = number + 1.
   - Each guesser taps an unrevealed word on their phone; that's their current
     vote (one vote per guesser; tapping another word moves it, tapping the same
     word clears it).
   - TV shows pips under each word: one pip slot per guesser on the active team,
     filled count = votes on that word.
   - When every guesser on the active team has voted for the same word, it is
     revealed and scored; all votes clear.
   - "Who counts" for unanimity = active team's guessers who are currently
     connected. *(My call — so a sleeping phone doesn't block the team. Pip
     slots follow the same count.)*
   - When a guesser disconnects, their vote is cleared. Unanimity is
     re-checked on every change (vote, disconnect, reconnect, late join), so
     the remaining guessers agreeing can trigger a reveal; a reconnecting or
     newly joined guesser starts with no vote and adds an empty pip slot.
     *(My call.)*
   - If the active team has zero connected guessers, play waits; the host can
     use **Skip turn** (see Host menu). If the clue-giver is disconnected, play
     waits for them to reconnect or for the host to **Make clue-giver**.
   - **End turn** is also a vote: a button on guessers' phones with its own
     pips on the TV; same unanimity rules. Only available after at least one
     guess this turn. *(My call, standard rule.)*
3. **Reveal outcome.**
   - Own team's card: continue if guesses remain, else turn ends.
   - Neutral: turn ends.
   - Other team's card: it counts for them; turn ends.
   - Assassin: guessing team loses immediately.
   - A team wins when all its cards are revealed, whoever revealed the last one.
4. Turn passes to the other team's clue phase.

### What each device sees

The server builds a separate view per device; the key is only ever serialized
into views for the two current clue-givers.

- **TV:** words, revealed colours, pips, current clue + guesses left, clue
  history, scores (cards remaining per team), whose turn. Full key only on the
  end screen.
- **Clue-giver phone (both teams, whole game):** the board with key colours
  over the words; during their own clue phase, the clue input; an **Undo**
  button.
- **Guesser phone:** board words with revealed colours, their own current vote
  highlighted, pip counts, End turn button; tapping disabled when it's not
  their team's guess phase. A late joiner gets this same view immediately.
- **Lobby phone:** name, team pick, roster.

### Undo

- Both teams' clue-givers have Undo, usable any time during a game — including
  the opposing clue-giver undoing your team's move (intended: it's a misclick
  safety net, not a competitive action).
- Undo reverts the most recent scoring action — a submitted clue, a reveal, or
  an end-turn — including any turn change or game-over it caused. Undoing a
  game-ending reveal takes the TV and phones from the end screen back to the
  live board. Repeatable back to the start-of-game state, then disabled.
- Undo clears in-progress votes. Votes themselves aren't undoable (guessers can
  just re-tap).
- The undo stack holds game state only (board, reveals, clues, turn, guess
  count) — never rosters, seats, or connections, so undo never moves or removes
  players. The server applies messages one at a time, so simultaneous undos
  just undo two steps. *(My calls.)*

### End of game

TV shows the winner and reveals the full key; phones show the result. Host
presses **New game** on the TV: new board, rotation advances, rosters kept.
**Back to lobby** lets people change teams before the next game.

### Keeping phones awake

- Use the Screen Wake Lock API where the browser exposes it.
- Over plain `http` on a LAN IP it usually won't be available (secure-context
  only), so fall back to the hidden looping-video technique (as NoSleep.js
  does).
- Both must start from a user gesture: activate on the Join tap and re-acquire
  on `visibilitychange` back to visible.
- Seat-token reconnection is the backstop if a phone sleeps anyway.

## Left to the builder

- WebSocket library (plain `ws` suggested), message protocol shape, reconnect
  backoff.
- QR code library, exact LAN IP detection heuristic, port choice.
- File layout for server/client/shared rules code.
- Visual styling of TV and phone screens (TV must be legible from across a
  room; phone grid must be tappable one-handed).
- How the dev workflow runs both server and Vite.
