// Game version and player-facing changelog (newest first).
// Bump VERSION together with "version" in package.json (a test checks they
// match) and add an entry here and in CHANGELOG.md.

export const VERSION = '0.7.0';

export const CHANGELOG = [
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
