# The Last Cast

A lightweight multiplayer fishing game that runs in the browser. Walk around Mirror Lake, cast your line, and reel in fish while everyone else at the lake watches your catches in real time.

## How to play

| Action | Controls |
| --- | --- |
| Move | `WASD` / arrow keys |
| Aim | Mouse |
| Cast | Hold `Space` or left mouse to charge power, release to cast |
| Hook a fish | Press `Space` / click when the bobber dips and shows **!** |
| Reel | Hold `Space` / mouse. **Release when the fish pulls** or the line snaps |
| Reel in / give up | `Esc`, `E` or right-click |
| Gear shop / Fish Index / Catch History | `G` / `I` / `H` (or the buttons under your score) |

**Where you stand and cast matters:**

- **Water zones.** Each area of the lake has its own fish and bite speed:
  - **Shallows:** fast bites, small common fish.
  - **Reed Bed:** perch, bass and pike.
  - **Rocky Drop-off:** trout and bass.
  - **Open Lake:** a bit of everything.
  - **Deep Water:** slow bites but the biggest fish, plus the legendary *Pale Ghost*. You can only reach it from the end of the dock.
- **Hotspots.** Rippling circles that move around the lake. Casting inside one gives faster bites, much better odds of rare fish, and +25% points.
- **Crowding.** Every other bobber within ~90 units of yours slows your bites. Spread out, or race others to the hotspot.

The aim line previews where your cast will land and which zone it hits.

### Progression

- **Coins.** Every catch earns coins equal to its points. Score is never spent and drives the leaderboard; coins are what you spend.
- **Gear** (`G`). Three upgrade paths with four tiers each. Buy them in order:
  - **Rod:** longer cast range (reach further from the shore or the dock) and stronger line (tension builds more slowly).
  - **Reel:** reel fish in faster.
  - **Bait:** faster bites and better odds of uncommon, rare and legendary fish (and less junk).
- **Fish Index** (`I`). Every species, with how many you've caught and your heaviest. Undiscovered fish show as `???` with a hint about where they live.
- **Catch History** (`H`). Your last 50 catches: weight, points, where, and whether it was in a hotspot.

Progress is saved on the server and linked to your browser through a random token stored in `localStorage`. There are no accounts, so clearing site data or switching browsers starts a new profile. If you open a second tab while one is already playing, it joins as an unsaved guest.

## Running locally

Requires **Node.js 20+**.

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:3000. To play multiplayer locally, open the page in two or more browser tabs or windows. Extra tabs in the same browser play as guests; use a private window or another browser for a second saved profile. Other devices on your network can join at `http://<your-ip>:3000`.

`npm start` runs the multiplayer server: one Node process serves the web client over HTTP and runs the game over WebSockets at `/ws`. For development with auto-restart on server changes:

```bash
npm run dev
```

Client files (`client/`, `shared/`) are served with `no-cache`, so a browser refresh picks up changes. Changes to `shared/` also affect the server, so restart it (or use `npm run dev`).

Run the tests (game logic unit tests and a real two-client WebSocket test):

```bash
npm test
```

### Environment variables

See `.env.example`. None are required locally.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP + WebSocket port (Railway sets this automatically) |
| `HOST` | `0.0.0.0` | Interface to bind |
| `MAX_PLAYERS` | `50` | Max simultaneous players |
| `DATA_DIR` | `./data` | Where player profiles are saved (`profiles.json`) |

## Deploying to Railway

The repo includes `railway.json` (start command `node server/index.js`, run directly rather than through npm so shutdown signals reach the server and it can save profiles; health check on `/health`). The Node version comes from `engines` in `package.json`.

1. Push this repository to GitHub.
2. In Railway, choose **New Project → Deploy from GitHub repo** and pick `TheLastCast`.
3. Railway detects Node, runs `npm install`, then starts the server. You don't need to set `PORT`; Railway injects it.
4. Open the service's **Settings → Networking** and click **Generate Domain**.
5. Visit the domain. The client connects automatically to `wss://<your-domain>/ws`.

6. **Keep progress across deploys:** without a volume, the container's disk is wiped on each deploy and saved progress is lost.
   1. Right-click the service and choose **Attach Volume**, with mount path `/data`.
   2. Add the variable `DATA_DIR=/data`.

Optional: set `MAX_PLAYERS` under the service's **Variables** tab.

With the Railway CLI instead:

```bash
railway init
```

```bash
railway up
```

```bash
railway domain
```

> Player profiles are saved to `DATA_DIR` (debounced, plus on shutdown). Everything else (positions, lines, hotspots) lives in memory. Run **one replica**: each server process is its own lake with its own save file.

## Project structure

```
server/
  index.js      HTTP server, WebSocket server, fixed 20 Hz game loop, rate limiting
  game.js       Game (one lake): players, movement, hotspots, snapshots, events
  fishing.js    Per-player fishing state machine: cast → wait → bite → reel → catch
  profiles.js   Saved player profiles (score, coins, gear, fish index, history) in a JSON file
  static.js     Static file serving for client/ and shared/
shared/         Imported by BOTH server and browser (plain ES modules)
  constants.js  Tuning values and message types
  world.js      Location data (land, docks, water zones, fish tables) + geometry helpers
  fish.js       Species, rarity and scoring
  gear.js       Equipment tiers, prices and stats
client/
  index.html, css/style.css
  js/main.js           Wires everything together; sends intentions, never outcomes
  js/net.js            WebSocket wrapper
  js/input.js          Keyboard / mouse
  js/interpolation.js  Smooths other players between server snapshots
  js/renderer.js       ALL canvas drawing
  js/theme.js          ALL colours and sizes used by the renderer
  js/ui.js             DOM HUD + menu (gear shop, fish index, catch history)
test/                  node:test suites
```

### How multiplayer works

- The **server is authoritative**. Clients only send intentions: held movement keys, cast angle and power, hook, and reel on/off. The server moves players, checks where casts land, rolls bite timing and the species (hidden from clients until caught), runs the reel fight and awards points. A client cannot teleport, pick its fish or edit its score.
- Every tick (20/s) the server broadcasts a state snapshot. One-off events (catches, snapped lines, joins) go to everyone, and private feedback (bites, cast results) goes only to the player concerned.
- Other players are rendered ~100 ms in the past and interpolated so movement looks smooth. Your own player follows the newest snapshot.

## Extending the game

The first version is deliberately small. Here is where planned features plug in:

| Feature | Where |
| --- | --- |
| Better graphics / animations | Replace `draw*` methods in `client/js/renderer.js` with sprites. Colours and sizes are in `theme.js`. Static assets can go in `client/assets/` and are served automatically. |
| More fishing locations | Add an entry to `LOCATIONS` in `shared/world.js`. Then run one `Game` per location in `server/index.js` (rooms) and let the client pick one in the welcome flow. `welcome` already sends `locationId`. |
| More species / rare fish | Add to `SPECIES` in `shared/fish.js`, then reference them in zone `fish` tables. |
| More gear / new gear slots | Add tiers or slots in `shared/gear.js` and expose any new stat in `gearStats()`. Apply it in `fishing.js`, which reads `player.stats`. |
| Inventory / selling fish | `profile.history` and `profile.index` already record catches. Add an `inventory` array to `newProfile()` in `server/profiles.js` (old saves are filled in by `normalize()`). |
| Levels / XP | Derive a level from `profile.score`, or add an `xp` field, and gate gear tiers on it in `Game.buy()`. |
| Weather & time | A world-level state on `Game` that is ticked and included in the snapshot. Apply it as a multiplier in `land()` / `pickSpecies()`. |
| Leaderboards / persistence | Profiles are in one JSON file. For many players or an all-time leaderboard, swap `ProfileStore` for a database (e.g. Railway Postgres) behind the same `getOrCreate()` / `markDirty()` interface. |
| Larger areas | The camera already follows the player and clamps to world bounds. For many players, send each client only nearby players in `snapshot()` (interest management). |
