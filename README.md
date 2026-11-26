# Codenames Digital

A party word game for one room: the board goes on a TV, and everyone plays from
their own phone over the home Wi-Fi. Red vs blue, typed clues, and every
guesser on a team has to agree before a card is revealed.

## Hosting a game

On the laptop that's plugged into the TV (Node 22+):

```sh
npm install
npm run host
```

The server prints two addresses:

- **TV (open on this laptop):** `http://localhost:3000/tv` — open it full-screen
  on the TV. Only this laptop gets the host controls (Start, New game, the host
  menu).
- **Players join:** `http://<laptop-ip>:3000/` — the TV shows it as a QR code.

**Windows Firewall** will ask whether to allow Node.js the first time. Allow it
on **Private networks**, or phones won't be able to connect.

**Wrong address in the QR code?** Laptops with WSL, Hyper-V, VPNs or Docker
have extra network adapters. Find the Wi-Fi address (`ipconfig`) and restart
with it:

```sh
CODENAMES_HOST_IP=192.168.1.20 npm run host      # bash
$env:CODENAMES_HOST_IP="192.168.1.20"; npm run host   # PowerShell
```

`PORT` changes the port (default 3000).

## Development

Two terminals:

```sh
npm run dev:server   # game server on :3000 (restarts on change)
npm run dev          # Vite on :5173, proxies /ws to the server
```

Open `http://localhost:5173/tv` on the laptop; phones use the printed
`http://<laptop-ip>:5173/` address.

### Playtesting without a pile of phones

```sh
npm run playtest                     # TV + 4 phone windows, everyone joined, game started
npm run playtest -- --phones 6       # 2–10 phones
npm run playtest -- --no-auto        # leave the join screens for you
npm run playtest -- --phones-at 0,0  # where the phone row starts (default: a second screen at x=1920)
```

Each window is its own Chromium (via Playwright), so each phone keeps its own seat.
Phones use the LAN address and the TV uses localhost, so only the TV gets host
controls — same as a real game night. Ctrl+C or closing the TV window ends it.
First time only: `npx playwright install chromium`.

```sh
npm test        # Vitest
npm run lint    # oxlint
npm run build   # type-check (client + server) and build the client
npm run e2e     # headless end-to-end check: real server, TV + 6 phones
```

### Layout

- `src/shared/protocol.ts` — the messages between server and devices (the contract).
- `server/game/` — the rules as pure functions, plus `viewFor`, which decides what each device may see.
- `server/hub.ts`, `server/index.ts`, `server/main.ts` — WebSockets, static files, startup.
- `src/` — the React TV and phone screens.

Design and plans live in [docs/superpowers/](docs/superpowers/).
