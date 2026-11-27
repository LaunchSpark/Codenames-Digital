# Picture mode (VS) — design

## Intent

Play the picture edition at home: the board deals 20 picture cards on a 5×4
grid instead of 25 words, with the picture edition's counts (8/7/4/1). Same
TV-plus-phones flow, same typed clues and team voting. Personal play only.

## Goals

- Host chooses **Words** or **Pictures** in the TV lobby; the choice sticks
  between games until changed.
- Pictures: 20 distinct images drawn at random from `public/cards/card-0.jpg` …
  `card-279.jpg`; starting team 8, other team 7, 4 neutral, 1 assassin.
- Words mode behaves exactly as today.

## Non-goals

- Coop (pictures or otherwise) — VS only for now, but the setting is kept
  separate from `mode` so picture coop can come later.
- Mixing words and pictures on one board.
- Committing the images to git.

## Anti-goals

- Anything that changes or slows the words game.
- A guesser who can't tell pictures apart on their phone — tiles must be big
  enough to recognise what they're voting for.

## Approaches

1. **Deck as a lobby setting, separate from mode** *(picked)*. `deck: 'words' |
   'pictures'` on server state, set by the host in the lobby; `newBoard` deals
   by deck; the view carries `deck`; code that assumes 25 reads the board size.
2. **Pictures as a third mode** next to VS/Coop. Rejected: deck and mode are
   independent (the picture edition has its own coop), so this blocks picture
   coop later.
3. **25-card server board, hide 5 on the client.** Rejected: wrong counts and
   win condition, and the goal is the picture edition's rules.

## Design

**Server**
- `ServerState` gains `deck: Deck` (default `'words'`). New client message
  `{ type: 'host:set-deck'; deck: Deck }`, host-only, lobby-only
  (`not-in-lobby` otherwise).
- `newBoard` takes the deck. Words: as now. Pictures: card ids `card-0` …
  `card-279` (count from a `PICTURE_COUNT = 280` constant), 20 dealt, colours
  8/7/4/1.
- `BOARD_CELLS` stops being the bound for votes; use `board.cards.length`.
- Host timeline label for a revealed picture reads e.g. "Red revealed picture
  17 (red)" rather than "CARD-17".
- The clue-vs-board-word check stays; it simply never matches a picture id.

**Protocol / view**
- `export type Deck = 'words' | 'pictures'`; `GameView.deck: Deck` (set in
  the lobby too, so the picker shows the current choice). `CardView.word`
  carries the picture id. `board` comment becomes "20 or 25 cards, row-major".

**Client**
- TV lobby: a Words / Pictures picker beside the VS/Coop picker, same style;
  host can change it, everyone else sees it read-only. Phone lobby shows which
  deck is set.
- `WordGrid` renders `<img src="/cards/card-N.jpg" alt="Picture N">` when
  `deck === 'pictures'`, filling the tile (`object-fit: cover`), with pips
  overlaid at the bottom. Revealed picture cards show the team colour over a
  faded image so the board still reads at a glance. Still 5 columns; 4 rows.
- Phone guesser: same thumbnails, tiles square — 5 columns on a phone gives
  roughly 65px tiles, which is the floor for recognising an image.
- Clue-giver key card: unchanged (colour tiles only; they look at the TV),
  just 20 tiles.
- `fitWords` is skipped for pictures.

**Images**
- `public/cards/` stays out of git (`.gitignore`); in this worktree it's a
  symlink to the main checkout's folder. If the folder is missing, the server
  logs a warning at start and the Pictures option is disabled.

## Left to the builder

- Exact tile styling for revealed pictures and pip placement over images.
- Whether the TV board needs a different aspect for 4 rows (it currently
  stretches rows to fill height — check it with real images).
- Test coverage: deal counts and distinctness for pictures, `host:set-deck`
  permissions, vote bounds on a 20-card board, rendering in `WordGrid`.

## Work happens on

Branch `feat/picture-mode` in worktree `../Codenames Digital-pictures`, cut
from `main`. `fix/word-fit` (uncommitted `WordGrid` / `word-grid.css` changes)
will need merging in once it lands.
