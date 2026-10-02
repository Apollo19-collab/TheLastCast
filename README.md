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

## Running locally

Requires **Node.js 20+**.

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:3000. To play multiplayer locally, open the page in two or more browser tabs or windows. Other devices on your network can join at `http://<your-ip>:3000`.

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

## Deploying to Railway

The repo includes `railway.json` (start command `npm start`, health check on `/health`). The Node version comes from `engines` in `package.json`.

1. Push this repository to GitHub.
2. In Railway, choose **New Project → Deploy from GitHub repo** and pick `TheLastCast`.
3. Railway detects Node, runs `npm install`, then `npm start`. You don't need to set `PORT`; Railway injects it.
4. Open the service's **Settings → Networking** and click **Generate Domain**.
5. Visit the domain. The client connects automatically to `wss://<your-domain>/ws`.

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

> Game state is kept in memory, so a redeploy or restart resets scores. Run **one replica**: each server process is its own lake, and players on different replicas would not see each other.

## Project structure

```
server/
  index.js      HTTP server, WebSocket server, fixed 20 Hz game loop, rate limiting
  game.js       Game (one lake): players, movement, hotspots, snapshots, events
  fishing.js    Per-player fishing state machine: cast → wait → bite → reel → catch
  static.js     Static file serving for client/ and shared/
shared/         Imported by BOTH server and browser (plain ES modules)
  constants.js  Tuning values and message types
  world.js      Location data (land, docks, water zones, fish tables) + geometry helpers
  fish.js       Species, rarity and scoring
client/
  index.html, css/style.css
  js/main.js           Wires everything together; sends intentions, never outcomes
  js/net.js            WebSocket wrapper
  js/input.js          Keyboard / mouse
  js/interpolation.js  Smooths other players between server snapshots
  js/renderer.js       ALL canvas drawing
  js/theme.js          ALL colours and sizes used by the renderer
  js/ui.js             DOM HUD: score, leaderboard, activity feed, status
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
| Equipment (rods, bait) | Give players an `equipment` object in `game.js`. Apply its modifiers in `fishing.js` (`castDistance`, bite rate in `land()`, rarity weights in `pickSpecies()`, fight values in `hook()`). |
| Inventory | `player.log` already counts catches per species. Store individual catches instead of just score. |
| Economy / shop | Turn points into coins on catch. Add `buy` message types to `MSG` and handle them in `Game.handleMessage`. |
| Weather & time | A world-level state on `Game` that is ticked and included in the snapshot. Apply it as a multiplier in `land()` / `pickSpecies()`. |
| Leaderboards / progression | Currently in memory. Add a persistence layer (e.g. Railway Postgres) and save on catch and on disconnect. Adding names requires accounts or tokens. |
| Larger areas | The camera already follows the player and clamps to world bounds. For many players, send each client only nearby players in `snapshot()` (interest management). |
