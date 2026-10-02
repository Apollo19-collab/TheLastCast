// Game version and player-facing changelog (newest first).
// Bump VERSION together with "version" in package.json (a test checks they
// match) and add an entry here and in CHANGELOG.md.

export const VERSION = '0.10.0';

export const CHANGELOG = [
  {
    version: '0.10.0',
    date: '2026-10-02',
    title: 'Levels & Armour',
    changes: [
      'Levels: earn XP from every catch (1 XP per point), voyages and duels. There are 50 levels, and reaching the top takes about 40 hours. Each level up pays coins.',
      'Your level and XP bar show under your name, and your level shows on your name tag and the leaderboard.',
      'Armour (R): a new hat, jacket, waders and boots slot. Levels never change your rod; they unlock armour.',
      '10 armour sets, unlocking from level 2 to level 50. Every piece gives a small bonus, and wearing a full set unlocks its set effect: Double Catch, Steady Hands, Weed Whisperer, Old Sea Dog, Heavy Hitter, Second Wind, Golden Touch and more.',
      'Armour shows on your angler, and the top sets glow. It is switched off in duels.',
      'Existing players start with XP equal to their score so far.',
      'New achievements: Rising Star (level 10) and Master Angler (level 50).',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-10-02',
    title: 'The Bait Shop',
    changes: [
      'Bait and lures are now used up: each bite takes one. Bread Crumbs are still free and never run out.',
      'New Bait Shop stall on South Beach, next to where you start: press E to buy bait in packs (5 packs at once are 10% cheaper). On a voyage, the deckhand by the wheelhouse sells bait.',
      'Your bait and how many are left show under your coins. If you run out, you switch back to Bread Crumbs.',
      'Easier money: every catch now pays 1.25 coins per point. Bait is cheap: Earthworms cost about a coin a bite.',
      'Bait you already owned turned into 40 uses of each.',
      'Smoother lake: the boat is drawn from a cached image and skipped when off screen, and the HUD only updates text that changed.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-10-02',
    title: 'Duels & the boat',
    changes: [
      'Fishing duels: stand next to another angler and press E to challenge them. If they accept (Y), you both fish for 3 minutes with the same matched tackle, and the most points wins.',
      'Duel fish give no coins, score or Fish Index entries. The winner gets 1,000 coins, and your own tackle comes back when the duel ends.',
      'The boat: every 15 minutes a boat sails in through the River Mouth and docks beside the South Beach dock. Press E next to it within 2 minutes to board.',
      'Ocean voyages: the boat visits 4 of 8 sea locations, from Morning to Night. Each location has its own fish, a legendary and a special event: Feeding Frenzy, Spectral Current, Whale Song, Treasure Tide, Squall, Golden Hour, Leviathan Rising and Glowtide.',
      'Crew missions, a points table and bonus coins at the end of every voyage.',
      '21 new sea fish, including 8 sea legendaries. The Leviathan only bites while it is rising.',
      'New tackle (Deep Sea Rod, Squid Strips) and 5 new achievements for duels and voyages.',
      'Fish Index: Collector now needs 40 species, and Completionist needs every species, lake and sea.',
    ],
  },
  {
    version: '0.7.2',
    date: '2026-10-02',
    title: 'Every fish is a fight',
    changes: [
      'Early fish take longer to land: fights start further out and reeling in is slower, so even a bluegill takes a few seconds.',
      'Small fish now make runs that build line tension, so you need to ease off for them too.',
      'Big and legendary fish keep their challenge. Better tackle still makes the biggest difference.',
    ],
  },
  {
    version: '0.7.1',
    date: '2026-10-02',
    title: 'Fish fight back',
    changes: [
      'Reeling difficulty now depends on the fish: rarer and bigger fish pull longer, surge harder and strip line.',
      'Small common fish stay easy. Big rare fish test your timing, and legendaries need serious tackle.',
      'Stronger lines, faster reels and smooth drag make a real difference in a fight.',
      'Your REEL and LINE bars are 4x bigger, show how strong the fish is, warn you when it pulls, and mark the danger zone near snapping.',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-10-02',
    title: 'Tackle & Achievements',
    changes: [
      'Tackle overhaul: 36 rods, reels, lines and baits to collect. Equip any mix you like.',
      'New Line slot: trade strength for stealth, or the other way round.',
      'Specialist tackle: fly rods for trout, corn for carp, nightcrawlers for catfish, steel leaders for pike, and more.',
      '22 achievements with a new Achievements window (T) showing your progress.',
      'Most late-game tackle is unlocked by achievements.',
      'Existing gear moves into your new inventory, and achievement progress is counted from your catch history.',
      'Game version and this changelog.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-02',
    title: 'Graphics overhaul',
    changes: [
      'Textured terrain, natural shorelines, depth-shaded water with moving light, surf and sparkles.',
      'Trees, pines, flowers, rocks, lily pads, and plank docks with posts.',
      'New anglers with hats; rods, reels and bobbers show your gear.',
      'Every fish has its own picture: a "You caught..." card and leaping fish when you land one.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-02',
    title: 'A bigger lake',
    changes: [
      'Mirror Lake is three times bigger with a walkable shore all the way round.',
      'New locations: Pine Point, River Mouth and Lily Marsh, with 9 new species.',
      'The camera follows you; minimap and location names added.',
      'Options menu with Master, Effects and Ambience volume.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-02',
    title: 'Sound',
    changes: ['Fishing sound effects and a big-lake ambience: waves, wind, birds and loons.'],
  },
  {
    version: '0.3.0',
    date: '2026-10-02',
    title: 'Accounts & new fish',
    changes: [
      'Sign up and log in to keep your progress on any device.',
      'Every zone has its own fish, including deep-water fish at the Rocky Drop-off.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-02',
    title: 'Progression',
    changes: ['Coins, gear upgrades, Fish Index and catch history.'],
  },
  {
    version: '0.1.0',
    date: '2026-10-02',
    title: 'First cast',
    changes: ['The first playable multiplayer version of The Last Cast.'],
  },
];
