# The Last Cast

**Version 0.18.0** · see [CHANGELOG.md](CHANGELOG.md), or click the version label in-game.

A lightweight multiplayer fishing game that runs in the browser. Walk around Mirror Lake, cast your line, and reel in fish while everyone else at the lake watches your catches in real time. Challenge other anglers to duels, or catch the boat that docks every 15 minutes and sail out to sea with the crew.

## How to play

| Action | Controls |
| --- | --- |
| Move | `WASD` / arrow keys |
| Sprint | Hold `Shift` while moving (uses stamina) |
| Aim | Mouse |
| Cast | Hold `Space` or left mouse to charge power, release to cast |
| Hook a fish | Press `Space` / click when the bobber dips and shows **!** |
| Reel | Hold `Space` / mouse. **Release when the fish pulls** or the line snaps |
| Reel in / give up | `Esc` or right-click |
| Open the Bait Shop / board the boat / challenge an angler to a duel | `E` when you're next to the shop, the boat or another angler |
| Accept / decline a duel | `Y` / `N` |
| Put down a chum bucket | `C` |
| Tackle / Armour / Pets / Fish Index / Achievements / Catch History / Events | `G` / `R` / `P` / `I` / `T` / `H` / `V` (or the icon dock at the bottom of the screen) |
| Options (volume, controls) | `O` (or the Options button) |
| Sound on/off | `M` (or the Sound button) |

### The lake

Mirror Lake is a big lake with a shore you can walk all the way around, in a valley of woods, meadows and smaller ponds. Beyond the valley lie **the wilds**: a huge map (12,800 x 9,600) of forest and meadow with dozens of generated ponds and two great lakes, **Silvermere** and **Stillwater Lake**. The camera stays centred on you, a **minimap** (bottom-right) shows the area around you with every player and hotspot, and your current location is shown under your score.

The ground is natural: shorelines curve and wander, and beaches, rocky ground, meadows, forest and dirt trails blend into each other. Water and land come from one organic shape (soft ellipses and a river, domain-warped with noise) in `shared/world.js`. The server's collision and the client's rendering sample the same field, so the shore you see is the shore you walk on.

**Only what's on screen is worked out.** The shoreline field is computed in 512-unit blocks the first time anything looks there, checking only nearby shapes. On the client, ground types, water tints, surf, sparkles, reeds and current are built per 256-unit tile as the camera gets close, kept in small caches and dropped when you leave. Off-screen anglers aren't drawn. The minimap's overview fills in block by block, nearest you first. A huge map loads as fast as a small one.

**The wilds are generated** from a fixed seed (`extendWorld` in `shared/world.js`), so every player and server gets the same map. Ponds are scattered on a jittered grid, away from the river and each other. Each one copies one of the valley's pond types (fish, bite rate, decor) under its own name, with a jetty from its nearest shore. Dirt trails join every jetty to the valley's paths, nearest first, and the river gets bridges where trails cross it. Generated zones keep `kind` = their type, so achievements like Pond Hopper count them all.

| Location | Waters | Signature fish |
| --- | --- | --- |
| **South Beach** (start) | Shallows, Dock Shade, Deep Water (from the end of the dock), Reed Bed, Rocky Drop-off | Pumpkinseed, Crappie, Rudd, Smallmouth; rare *Escaped Koi*, *Muskellunge*; legendaries *Old Mossback*, *Stonejaw*, *The Dockmaster*; mythic *The Ember Koi* |
| **Pine Point** (north) | Weedy Cove (west of the point), Cold Spring (east of the point), Deep Basin (from the end of the jetty) | Chain Pickerel, Brook Trout, Lake Trout, Sturgeon; legendaries *Frostfin*, *The Pale Ghost*, *Emerald Jaw*; mythics *Aurora Trout*, *The Lake Wyrm* |
| **River Mouth** (east) | River Mouth, including the river channel under the bridge | Mooneye, Sauger, Steelhead, Chinook Salmon, Paddlefish; legendary *The River King* |
| **Lily Marsh** (west) | Lily Marsh (fish it from the boardwalk) | Brown Bullhead, Bowfin, Alligator Gar; legendary *The Marsh Queen* |
| **Willowmere** (north-east) | Willow Pond (jetty) | Feral Goldfish, Warmouth, Redfin Pickerel, Tiger Trout; legendary *The Willow Wisp* |
| **Millside** (east) | East River (two bridges), Mill Pond (dock) | Fallfish, Brown Trout, Atlantic Salmon, Shovelnose Sturgeon; Bigmouth Buffalo, Hybrid Striped Bass, Bighead Carp; legendaries *The Rapids Runner*, *Old Millstone* |
| **Frog Hollow** (south-west) | Frog Pond (jetty) | Mudminnow, Green Sunfish, Yellow Bullhead, Flathead Catfish; legendary *Old Whiskers* |
| **Crystal Springs** (south) | Crystal Pond (boardwalk to the island) | Cutthroat Trout, Splake, Arctic Char; legendary *The Crystal Char*; mythic *Glimmerfin* |
| **The Black Bog** (south-east) | Black Bog (boardwalk) | Black Bullhead, American Eel, Spotted Gar, Northern Snakehead; legendary *The Midnight Bowfin*; mythic *Mirefang* |

The middle of the lake is Open Lake: a mix of Crappie, Carp, Walleye and Longnose Gar. Dirt trails lead from South Beach to every pond. There are 84 species around the lake and ponds, plus 26 more out at sea. The Fish Index shows where each one lives.

**Rarities:** Junk, Common, Uncommon, Rare, Legendary and **Mythic**. The five mythic fish are the rarest of all (about 1 in 1,000+ catches even with good bait, a few hundred with the best gear), fight harder than any legendary and need endgame tackle to land. When anyone lands one, the whole lake hears about it.

**Where you stand and cast matters:**

- **Water zones.** Each zone has its own fish table and bite speed. Shallow and weedy water bites fast; deep water is slow but holds the biggest fish. At the Rocky Drop-off the bottom falls away, so deep-water fish (*Lake Trout*, *Burbot*, even *Sturgeon*) come in close.
- **Hotspots.** Rippling circles that move around the lake. Casting inside one gives faster bites, much better odds of rare fish, and +25% points.
- **Crowding.** Every other bobber within ~90 units of yours slows your bites. Spread out, or race others to the hotspot.

The aim line previews where your cast will land and which zone it hits.

### Map events

Every 10 minutes something happens at one of the lakes or ponds: in the valley, or at a wild pond within reach. All three kinds are built for fishing together, and they take turns, so each one comes round every 30 minutes. The schedule follows the clock with a fixed seed (`shared/events.js`), so everyone sees the same plan. The **Events** window (`V`) lists what's on now, with live progress, and the next six events: where they are, how far away and when they start. A live event also gets a panel at the top of the screen, a ring on the water, a star on the minimap and a line on your player card.

| Event | Length | How it works | Rewards |
| --- | --- | --- | --- |
| 🐟 **Feeding Shoal** | 6 min | Bites in the shoal are 25% faster, plus 30% for every other angler fishing it (up to 2.6x). Crowding helps here instead of hurting, and rare fish are 40% more likely. | 5 coins per fish you catch in it (up to 40), times the number of anglers who fished it (up to 4) |
| 🧺 **The Great Haul** | 8 min | One shared goal: `10 + 6 x anglers online` fish (counting up to 10 anglers) caught in the area. Bites are 15% faster there. It ends as soon as the goal is hit. | Hit it: 150 coins + 15 per fish you caught (up to 40) + 250 XP each. Miss it: 5 coins per fish |
| ✨ **Golden Tide** | 8 min | Every catch in the area adds its points to a shared meter (`250 + 120 x anglers online`). When it fills, everyone there gets a 45-second **Golden Rush**: double points (so coins and XP too) and rare fish 50% more likely. Then it fills again. | 50 coins + 40 per Golden Rush |

Only catches inside the event's ring count, and duels don't. Each event you join counts towards the **Community Angler** achievement (10 events).

### Duels

Walk up to another angler at the lake and press `E` to challenge them. They have 20 seconds to accept (`Y`) or decline (`N`).

- After a 5-second countdown you both fish for **3 minutes**. The most points wins. Points come from each fish's species, rarity and size, so where you cast still matters.
- **Matched tackle:** both duelists use the same loadout (Carbon Rod, Baitcaster, Fluorocarbon, Spinner Lure). Your own tackle isn't touched and comes back when the duel ends. You can't change tackle during a duel.
- **No rewards for duel fish:** they don't give coins or score, and don't go in your Fish Index, history or achievements.
- **The winner gets 1,000 coins.** The winner must have landed at least one fish, and the same two anglers can only win the prize once every 10 minutes, so it can't be farmed by trading wins. A draw pays nothing. Leaving or forfeiting gives the win to your opponent.
- A scoreboard with the timer appears at the top of the screen. Everyone at the lake sees the result in their feed.

### Boat voyages (based on Ocean Fishing in Final Fantasy XIV)

Every 15 minutes (on the quarter hour) a boat sails in through the **River Mouth**, under the bridge and across the lake, and docks beside the **South Beach dock**. Walk up to it and press `E` to board. You have **2 minutes**, and you can step off again (`E`) before it leaves. Then it sails back out with everyone aboard.

- **The voyage:** a trawler visits **3 of 8 sea locations**, picked at random, from Morning through Afternoon to Sunset. You fish for 2¼ minutes at each stop and sail between them, then face the boss. The whole trip is back before the next boat docks. Walk around the deck and cast over the rail.
- **Special events:** once per stop, that location's event kicks in for 50 seconds:

  | Location | Event | Effect |
  | --- | --- | --- |
  | Kelp Forest | Feeding Frenzy | Bites 3× faster |
  | Coral Gardens | Spectral Current | Rare fish 4× as likely, catches score 1.5× |
  | Whale Road | Whale Song | Reel 60% faster, line tension builds half as fast |
  | Sunken Galleon | Treasure Tide | Sunken treasure chests can be hooked (big coins) |
  | Storm Banks | Squall | Fish fight 30% harder, catches score 2× |
  | Glass Shallows | Golden Hour | Catches score 2×, faster bites |
  | Abyssal Trench | Leviathan Rising | **The Leviathan** can bite (only now), better rare odds |
  | Moonlit Reef | Glowtide | Bites 2× faster, rare fish 2× as likely |

- **Sea fish:** herring, mackerel, cod, sea bass and signature fish for each location (sheephead, parrotfish, bluefin tuna, grouper, swordfish, flounder, oarfish, opah). Each location also has a **legendary** that mostly bites during its event, and one of two **mythics** (*The Abyssal King* or *Tidemother*) at tiny odds, better during the event.
- **The boss:** after the last stop, one of four sea monsters rises: **The Kraken**, **Megalodon**, **The Sea Serpent** or **The Ghost Whale**. The crew has **4 minutes** to drive it off, in three phases: **Surfacing**, **Enraged** (below 60% health) and **Desperate** (below 25%). Each phase attacks faster and moves its weak spot more often.
  - **Fishing:** every fish landed deals its points as damage. Fish from the glowing red **weak spot** bite faster and deal **double damage**.
  - **Harpoons:** every 20-28 seconds the boss **breaches** beside the boat. Land your bobber inside the golden ring within 7 seconds to harpoon it for 30 damage (once per breach each).
  - **Grabs:** tentacles (jaws, coils, barnacles...) seize the rail. Walk over and **mash E** to beat them off within 15 seconds. That deals 25 damage, shared between the strikers. If one holds on, the boss heals 8% and the boat lurches (line tension spikes). More anglers means more strikes are needed, and in later phases two grab at once.
  - **Attacks**, with a 3-second warning: **Thrash** (tension spike), **Ink Cloud** (bites half as fast), **Whirlpool** (fish fight 40% harder) and the **Slam**, which marks part of the deck in red. Anyone still standing there when it lands is **dazed** for 5 seconds and loses their fish.
  - **Health** is `(140 + 640 × crew) ×` the boss's multiplier. A new player alone has about even odds, mid-level tackle wins comfortably, and crews of any size get a similar fight (a test checks this).
  - **Prize pool:** fish and harpoon damage count 1:1 towards your **contribution**, and each strike on a grab is worth 6. The pool is `(300 + 300 × crew) ×` the boss's multiplier. Everyone who contributed gets an even share of 30% of it, and the other 70% is split by contribution. Win: the full pool, plus 200 coins and 1,200 XP each and +150 coins for the MVP (top contributor). If it escapes: a quarter of the pool, plus 100 coins and 300 XP each.
- **Rewards:** sea fish pay coins and score as normal. The voyage also keeps a **points table**, and the crew shares **3 missions** (e.g. "Catch 20 fish", "Land 2 rare or legendary fish"). At the end everyone gets bonus coins: 25% of their voyage points, plus 100 per completed mission, plus 300/150/75 for the top three. Then the boat brings you back to the dock.

### Progression

- **Coins.** Every catch earns 1.25 coins per point (`COINS_PER_POINT` in `shared/constants.js`). Score is never spent and drives the leaderboard; coins are what you spend.
- **Bait Shop.** Bait and lures are consumables: each bite uses one, whether you hook the fish or not, and casting without a bite costs nothing. Buy them in packs at the **Bait Shop** stall on South Beach (press `E` next to it), or from the deckhand by the wheelhouse on a voyage. Five packs at once are 10% cheaper. **Bread Crumbs** are free and never run out, and you switch back to them automatically when your bait runs out. Prices run from about 1 coin a bite (Earthworms) to 50 (the Mythic Fly), well below what the fish they attract pay. Duels use matched tackle for free.
- **Tackle** (`G`). 50 items across four slots: **Rod**, **Reel**, **Line** and **Bait & lures**. Own as many as you like and **equip any mix**: your loadout's combined stats are shown at the top.
  - **Rods:** cast range and power. Power multiplies line strength.
  - **Reels:** reel speed, and drag (how fast tension eases).
  - **Lines:** strength, but strong lines can make fish shy. Fluorocarbon and stealth leaders get more bites.
  - **Bait & lures:** bite speed and rare-fish odds. Used up as you fish (see Bait Shop below).
  - **Specialties:** some items favour certain fish. Fly rods and salmon roe for trout, corn for carp, nightcrawlers for catfish, steel leaders and frog poppers for pike, glow jigs for deep-water fish, centerpin reels for river fish, the Deep Sea Rod and Squid Strips for sea fish.
  - **Unlocks:** 16 items are available from the start. The other 22, most of the late-game tackle and bait, unlock through achievements. Rods, reels and lines are bought once; bait is bought in packs.
- **Achievements** (`T`). 27 long-term goals: catch counts, fish families, zones, exploring all four areas, trophy weights, hotspots, legendaries, collecting species, duels, voyages, and more. Each pays coins, and many unlock tackle. The window shows your progress on each. Goals that unlock tackle are tuned so none can be reached in your first hour, and a test checks this.
- **Chum buckets.** Sold at the Bait Shop (60 coins). Press `C` to put one down where you stand; it lasts 10 minutes or 30 fish, and you can have one out at a time. Each fish you land within range of your bucket has a chance to turn into random bait for your bag. Rarer fish give better bait (common fish: worms, corn, nightcrawlers; rare fish: spinners, minnows, Golden Lures...; legendaries can make a Mythic Fly), and only bait you've unlocked can come out. The chum also makes everyone's bobbers near a bucket bite 15% faster. A bucket returns roughly 1-1.5x its price in bait early on and about 2x late game; a test keeps it in that range (`shared/chum.js`).
- **Levels.** Every catch gives XP (1 per point, plus armour bonuses). Finishing a voyage and playing duels give XP too. There are 75 levels: early ones take minutes, the last ones a couple of hours. Level 50 takes about 40 hours and level 75 about 85 (`shared/levels.js`; a test checks this against simulated fishing). Each level up pays `level × 20` coins. Levels never change your tackle.
- **Armour** (`R`). Four slots (hat, jacket, waders, boots), separate from tackle. Higher levels unlock better sets, bought with coins. Every piece gives a small bonus. Wear all four pieces of one set for its **set effect**:

  | Set | Level | Full-set effect |
  | --- | --- | --- |
  | Canvas Workwear | 2 | Penny Pincher: +10% coins |
  | Oilskin | 6 | Steady Hands: line tension builds 15% slower |
  | Reedwalker | 10 | Weed Whisperer: bites 30% faster in the Reed Bed, Weedy Cove and Lily Marsh |
  | Four-Leaf | 15 | Double Catch: 10% chance of a second fish |
  | Sea Dog | 20 | Old Sea Dog: +30% points, coins and XP at sea |
  | Trophy Hunter | 26 | Heavy Hitter: much bigger fish |
  | Stormbreaker | 32 | Second Wind: 25% chance a snapping line holds |
  | Grand Mariner | 38 | Scholar of the Deep: +25% XP, bites 15% faster |
  | Legend's Regalia | 44 | Fortune's Favourite: 20% Double Catch, rare odds ×1.3 |
  | Golden Angler | 50 | Golden Touch: 25% Double Catch, +25% coins and XP, legendaries ×1.5 |
  | Abyssal Diver | 55 | Pressure Proof: tension 25% slower, fish 20% bigger |
  | Tidecaller | 60 | Call of the Tide: bites 20% faster, +30% at sea |
  | Emberforged | 65 | Rise from the Ashes: 40% chance a snapping line holds, reel 20% faster |
  | Celestial | 70 | Starlit: 25% Double Catch, +30% XP, rare odds ×1.3 |
  | Mythweaver | 75 | Myth Made Real: 30% Double Catch, +30% coins and XP, legendaries ×1.5, mythics ×2 |

  Armour shows on your angler and is switched off in duels. Sets live in `shared/armour.js`, and their effects are applied in `server/fishing.js`.
- **Pets** (`P`). 30 pets, 5 per rarity, each with a unique ability. They're sold by the **Travelling Zoo**: its wagon moves between South Beach, Pine Point, Lily Marsh and the River Mouth every 15 minutes (on the quarter hour) with 3 new animals. Stock is picked from the clock, so everyone sees the same zoo, and rarer pets turn up less often. Walk up to the wagon (purple on the minimap) and press `E` to adopt. One pet comes with you at a time (it follows you, visible to everyone) and its ability stacks with your armour. Pets stay home during duels.

  | Rarity | Price | Pets |
  | --- | --- | --- |
  | Common | 400 | Lily Frog (faster bites in marsh and reeds), Duckling (10% bait saved), Sand Crab (70% fewer boots), Garden Snail (+10% XP), Field Mouse (finds 5-20 coins) |
  | Uncommon | 1,200 | Otter Pup (more trout), Flamingo (+0.5 s to hook), Hermit Crab (+20% hotspot points), Pond Turtle (tension 10% slower), Kingfisher (cast +40) |
  | Rare | 3,000 | Raccoon (finds 20-60 coins), Barn Owl (rare fish +25%), Beaver (fish slip away 40% slower), Penguin (8% Double Catch), Seal Pup (+25% at sea) |
  | Epic | 7,500 | Snow Fox (Cold Spring and Frostfin), Bald Eagle (legendaries x2), Grizzly Cub (reel +25%, tension -15%), Octopus (fish fight 20% less), Pirate Parrot (treasure x4, finds coins) |
  | Legendary | 18,000 | Baby Dragon (+30% coins, 15% Double Catch), Celestial Peacock (half of lost fish caught anyway), Kraken Spawn (sea legendaries x3), Unicorn (rare +50%, half your bait saved), Spirit Koi (reel, bites and XP) |
  | Mythic | 45,000 | Phoenix Chick (75% of lost fish caught anyway), Leviathan Hatchling (mythics x3, +30% at sea), Qilin (+50% coins, 25% Double Catch), Moon Moth (bites, rare odds and XP), Star Whale (legendaries and mythics x2, 60% bait saved) |

  Pets and abilities live in `shared/pets.js`; `combineBonuses()` merges a pet with armour and `server/fishing.js` applies the result.
- **Fish Index** (`I`). Every species, with how many you've caught and your heaviest. Undiscovered fish show as `???` with a hint about where they live.
- **Catch History** (`H`). Your last 50 catches: weight, points, where, and whether it was in a hotspot.

### Graphics

All art is generated in code. There are no image files to download or license, and each piece sits behind a small interface so painted sprites can replace it later.

- **Terrain:** grass, sand and rock textures. Wet, muddy banks and natural, wavy shorelines are worked out from the distance to the water. Trees (pines around Pine Point), bushes, flowers, boulders, driftwood and lily pads are scattered deterministically, so every player sees the same lake. Docks have planks, posts and shadows. The forest continues past the map edge, and the river keeps flowing.
- **Water:** turquoise shallows fade to deep blue, and each zone gets its own tint (murky marsh, teal river, icy Cold Spring). Moving light patterns, sparkles, surf washing the shore, swaying reeds and river current animate on top.
- **Anglers:** top-down characters with a hat, skin tone and shirt colour that stay the same per player, plus a walking motion.
  - **Rods** show the rod tier (willow, fiberglass, carbon, golden Master's), bend under line tension, and their reel handle spins while reeling.
  - **Bobbers and lures** show the bait tier.
- **Fish:** a side-view sprite for each of the 36 species, built from its body shape, colours, markings and features (whiskers, beaks, scutes), with glows for legendaries. Catching a fish pops up a **"You caught..." card** with the sprite and makes the fish leap above the angler for everyone to see. The Fish Index shows sprites, with silhouettes until a fish is discovered, and catch history shows icons.
- **Gear shop:** an icon for every rod, reel and bait tier.

Terrain is drawn as 256×256-unit tiles, each rendered once with a per-frame time budget and cached. Nearby tiles are pre-rendered before you walk into view.

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

Browsers only allow sound after you click or press a key, so sound starts with your first interaction. **Options** (`O`) has separate **Master**, **Effects** and **Lake ambience** volume sliders and a mute switch. They're remembered per browser.

**Graphics** (also in Options): **Low**, **Medium** or **High** (the default), remembered per browser. The presets live in `client/js/graphics.js`:

| Setting | Low | Medium | High |
| --- | --- | --- | --- |
| Canvas resolution | 75% of the screen | 1x | up to 2x on high-DPI screens |
| Terrain tile detail | 1x | up to 1.5x | up to 2x |
| Trees and scenery | 45% | 80% | all |
| Water shimmer layers | none | 1 | 2 |
| Sparkles, surf, reeds, river current | off | on | on |
| Rain at sea | 30% | 70% | all |
| Pre-render tiles just off screen | off | on | on |

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
| `BOAT_INTERVAL_MINUTES` | `15` | Minutes between boat visits (minimum 4). Lower it to try voyages locally. |
| `VOYAGE_STOP_SECONDS` | `135` | Seconds of fishing at each voyage stop (minimum 10). Lower it to reach the boss fight quickly when testing locally. |

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
  hub.js        Owns every room (the lake + voyages at sea) and moves players between them
  game.js       Game (one room): players, movement, hotspots, snapshots, events
  fishing.js    Per-player fishing state machine: cast → wait → bite → reel → catch
  duel.js       Duels: challenges, matched tackle, scoring, the prize
  boat.js       The boat's visits to the lake and boarding
  voyage.js     One voyage at sea: stops, special events, missions, payouts
  profiles.js   Profiles + accounts, login sessions and guest tokens, saved to a JSON file
  auth.js       Password hashing (scrypt), token hashing, validation, login rate limiting
  static.js     Static file serving for client/ and shared/
shared/         Imported by BOTH server and browser (plain ES modules)
  constants.js  Tuning values and message types
  world.js      Location data (land, docks, water zones, fish tables) + geometry helpers
  fish.js       Species, rarity and scoring
  gear.js       Tackle catalog (36 items), loadout -> stats, specialties
  achievements.js  Achievements, their goals/rewards, and progress from lifetime counters
  levels.js     XP curve (75 levels, ~85 hours) and XP rewards
  armour.js     Armour sets, pieces, level requirements and set effects
  chum.js       Chum buckets: price, duration, and what each rarity turns into
  pets.js       Pets, their abilities, and the Travelling Zoo's schedule and stock
  version.js    Game version + in-game changelog (keep package.json and CHANGELOG.md in sync)
  duel.js       Duel rules: length, prize, matched tackle
  voyage.js     The boat's schedule and route, sea locations, events, missions, the sea world
client/
  index.html, css/style.css
  js/main.js           Wires everything together; sends intentions, never outcomes
  js/account.js        Join screen (log in / sign up / guest) and saved session/guest tokens
  js/audio.js          Audio engine: positional sound effects, reel/drag/strain feedback, lake ambience
  js/sounds.js         ALL sound recipes, by name (swap any for a recorded sample later)
  js/net.js            WebSocket wrapper
  js/input.js          Keyboard / mouse
  js/interpolation.js  Smooths other players between server snapshots
  js/renderer.js       Puts the layers together each frame (and the minimap)
  js/theme.js          Colour palette for terrain, water and effects
  js/gfx/terrain.js    Distance field, per-pixel ground/water tiles, docks, scenery placement
  js/gfx/sprites.js    Scenery sprites: trees, pines, bushes, rocks, flowers, lily pads
  js/gfx/characters.js Anglers, rods (by tier), lines, bobbers/lures, name tags
  js/gfx/fishArt.js    Fish sprite generator + per-species look (FISH_ART)
  js/gfx/gearArt.js    How each gear tier looks, plus the shop icons
  js/gfx/boat.js       The boat (lake and sea), its wake and the gangplank
  js/gfx/sea.js        The open sea: per-location water and scenery, events, time of day
  js/gfx/noise.js      Deterministic noise for textures
  js/ui.js             DOM HUD + menu (gear shop, fish index, catch history)
test/                  node:test suites
```

### How multiplayer works

- The **server is authoritative**. Clients only send intentions: held movement keys, cast angle and power, hook, and reel on/off. The server moves players, checks where casts land, rolls bite timing and the species (hidden from clients until caught), runs the reel fight and awards points. A client cannot teleport, pick its fish or edit its score.
- Every tick (20/s) the server broadcasts a state snapshot. One-off events (catches, snapped lines, joins) go to everyone, and private feedback (bites, cast results) goes only to the player concerned.
- Other players are rendered ~100 ms in the past and interpolated so movement looks smooth. Your own player follows the newest snapshot.
- **Rooms.** The lake is one room and every voyage at sea is another, each a `Game` with its own world. The `Hub` moves players between them, and each room's snapshots and events only go to the players in it. The boat's timetable follows the wall clock, so it keeps to schedule across restarts.

## Extending the game

The first version is deliberately small. Here is where planned features plug in:

| Feature | Where |
| --- | --- |
| Better sound | Each sound in `client/js/sounds.js` is a named recipe. Replace one with a recorded sample (e.g. `client/assets/splash.ogg`) by adding a sample loader to the kit in `audio.js`. Callers use `audio.play('splash')` and don't change. |
| Painted art / sprite sheets | Each art module has one entry point to swap: `fishSprite(id)` in `gfx/fishArt.js`, `spritePools()` in `gfx/sprites.js`, `drawAngler()` in `gfx/characters.js`, `gearIconURL()` in `gfx/gearArt.js`. Put image files in `client/assets/`; they're served automatically. |
| More animations | Animation state lives in `Renderer.updateAnims()` (walk cycle) and `drawEffects()` (splashes, fish leaps); add new effect types there. |
| More places on this lake | Add `land`/`structures`/`zones` rectangles and an `areas` entry in `shared/world.js`. The renderer, minimap and HUD pick them up automatically, and a test checks that everything is reachable on foot. |
| More lakes | Add an entry to `LOCATIONS` in `shared/world.js` and create another `Game` room for it in `server/hub.js`. Players already move between rooms (see `Hub.startVoyage()` / `endVoyage()`), and the client switches world and renderer on `MSG.ROOM`. |
| More sea locations / events | Add to `SEA_LOCATIONS` and `SEA_EVENTS` in `shared/voyage.js` (fish, water colours, event modifiers), plus scenery in `client/js/gfx/sea.js`. Event modifiers (`biteSpeed`, `rareBoost`, `reelSpeed`, `tension`, `fight`, `points`, `extraFish`) are applied in `server/fishing.js`. |
| More species / rare fish | Add to `SPECIES` in `shared/fish.js`, then reference them in zone `fish` tables in `shared/world.js`. A test checks that every species lives somewhere. |
| Password reset / email | Add an `email` field when registering in `ProfileStore.register()` and a reset-token flow. You'd need an email provider. |
| More tackle | Add an entry to `ITEMS` in `shared/gear.js` (optionally with `unlock: '<achievement id>'`) and a look in `client/js/gfx/gearArt.js`. New stats go in `computeStats()` and are applied in `server/fishing.js`. |
| More achievements | Add to `ACHIEVEMENTS` in `shared/achievements.js`. If it needs a new statistic, count it in `countCatch()` (`server/fishing.js`) and in `newCounters()`. If it unlocks tackle, add a first-hour estimate to the "first hour" test. |
| Releasing a version | Bump `VERSION` in `shared/version.js` and `version` in `package.json`, add a `CHANGELOG` entry, and regenerate `CHANGELOG.md`. A test checks all three agree. Players see "What's new" once after updating. |
| Selling fish / levels | `profile.history`, `profile.index` and `profile.counters` already record catches; add fields in `newProfile()` (old saves are filled in by `normalize()`). |
| Weather & time | A world-level state on `Game` that is ticked and included in the snapshot. Apply it as a multiplier in `land()` / `pickSpecies()`. |
| Leaderboards / persistence | Profiles are in one JSON file. For many players or an all-time leaderboard, swap `ProfileStore` for a database (e.g. Railway Postgres) behind the same `getOrCreate()` / `markDirty()` interface. |
| Larger areas / more players | The camera follows the player, and off-screen decoration is skipped when drawing. For many players, send each client only nearby players in `snapshot()` (interest management). |
