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
| Sound on/off | `M` (or the Sound button) |

**Where you stand and cast matters:**

- **Water zones.** Each area of the lake has its own fish (27 species in total) and bite speed:

  | Zone | Bites | Signature fish |
  | --- | --- | --- |
  | Shallows | fastest | Pumpkinseed, Golden Shiner, Bluegill; rare *Escaped Koi* |
  | Dock Shade (the water beside the dock) | fast | Black Crappie, Catfish, Bass hiding under the boards |
  | Reed Bed | normal | Rudd, Tench, Bowfin, Pike; rare *Muskellunge*; legendary *Old Mossback* |
  | Rocky Drop-off | slower | Smallmouth Bass, Walleye, Trout. The bottom falls away here, so deep-water fish (*Lake Trout*, *Burbot*, even *Sturgeon*) come in close; legendary *Stonejaw* |
  | Open Lake | slower | A mix: Crappie, Carp, Walleye, Longnose Gar |
  | Deep Water (only reachable from the end of the dock) | slowest | Cisco, Lake Whitefish, Lake Trout, Burbot, Sturgeon; legendary *The Pale Ghost* |

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

### Sound

Everything is synthesized in the browser with the Web Audio API, so there are no audio files to download.

- **Fishing feedback:**
  - a whoosh when you cast, and a splash where the bobber lands;
  - a plunk and ping on a bite, and a thump when you hook the fish;
  - the reel clicks while you wind in. When the fish pulls, it switches to a fast **drag buzz**, your cue to let go;
  - a rising whine as the line nears snapping;
  - a fanfare when you land a fish, which gets longer for rarer fish, with extra sparkle for a new species;
  - a twang when the line snaps, and short sounds for an escaped fish, buying gear, or casting onto land.
- **Other players:** their splashes, catches and snaps play quieter, and are panned left or right by where they are relative to you.
- **Lake ambience:** a slow wash of distant waves, water lapping, a light breeze, songbirds on the bank, and the occasional loon calling across the water.

Browsers only allow sound after you click or press a key, so sound starts with your first interaction. Mute is remembered per browser.

### Accounts

The join screen has three options:

- **Sign up.** Pick a username (3-16 letters, numbers or `_`) and a password (at least 6 characters). Your progress is saved to your account and works on any device. If you were playing as a guest in this browser, that progress moves into the new account.
- **Log in.** You stay logged in on that browser (for 90 days) until you press **Log out**. An account can only play in one window at a time; logging in somewhere else disconnects the older window.
- **Guest.** No account needed. Progress is saved on the server but tied to this browser only. You can sign up later from the **Sign up** button under your name without losing anything.

How it's protected:
- Passwords are hashed with scrypt and a random salt, and are never stored or logged in plain text.
- Login sessions and guest IDs are random secrets, stored on the server only as SHA-256 hashes.
- Failed logins are limited to 10 per IP address every 10 minutes, and new accounts to 5 per IP per hour.
- On Railway everything runs over HTTPS/WSS.

There is no password reset yet, because accounts have no email address.

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
  profiles.js   Profiles + accounts, login sessions and guest tokens, saved to a JSON file
  auth.js       Password hashing (scrypt), token hashing, validation, login rate limiting
  static.js     Static file serving for client/ and shared/
shared/         Imported by BOTH server and browser (plain ES modules)
  constants.js  Tuning values and message types
  world.js      Location data (land, docks, water zones, fish tables) + geometry helpers
  fish.js       Species, rarity and scoring
  gear.js       Equipment tiers, prices and stats
client/
  index.html, css/style.css
  js/main.js           Wires everything together; sends intentions, never outcomes
  js/account.js        Join screen (log in / sign up / guest) and saved session/guest tokens
  js/audio.js          Audio engine: positional sound effects, reel/drag/strain feedback, lake ambience
  js/sounds.js         ALL sound recipes, by name (swap any for a recorded sample later)
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
| Better sound | Each sound in `client/js/sounds.js` is a named recipe. Replace one with a recorded sample (e.g. `client/assets/splash.ogg`) by adding a sample loader to the kit in `audio.js`. Callers use `audio.play('splash')` and don't change. |
| Better graphics / animations | Replace `draw*` methods in `client/js/renderer.js` with sprites. Colours and sizes are in `theme.js`. Static assets can go in `client/assets/` and are served automatically. |
| More fishing locations | Add an entry to `LOCATIONS` in `shared/world.js`. Then run one `Game` per location in `server/index.js` (rooms) and let the client pick one in the welcome flow. `welcome` already sends `locationId`. |
| More species / rare fish | Add to `SPECIES` in `shared/fish.js`, then reference them in zone `fish` tables in `shared/world.js`. A test checks that every species lives somewhere. |
| Password reset / email | Add an `email` field when registering in `ProfileStore.register()` and a reset-token flow. You'd need an email provider. |
| More gear / new gear slots | Add tiers or slots in `shared/gear.js` and expose any new stat in `gearStats()`. Apply it in `fishing.js`, which reads `player.stats`. |
| Inventory / selling fish | `profile.history` and `profile.index` already record catches. Add an `inventory` array to `newProfile()` in `server/profiles.js` (old saves are filled in by `normalize()`). |
| Levels / XP | Derive a level from `profile.score`, or add an `xp` field, and gate gear tiers on it in `Game.buy()`. |
| Weather & time | A world-level state on `Game` that is ticked and included in the snapshot. Apply it as a multiplier in `land()` / `pickSpecies()`. |
| Leaderboards / persistence | Profiles are in one JSON file. For many players or an all-time leaderboard, swap `ProfileStore` for a database (e.g. Railway Postgres) behind the same `getOrCreate()` / `markDirty()` interface. |
| Larger areas | The camera already follows the player and clamps to world bounds. For many players, send each client only nearby players in `snapshot()` (interest management). |
