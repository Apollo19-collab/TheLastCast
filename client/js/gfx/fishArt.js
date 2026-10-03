// Fish sprites: a side-view illustration for every species, generated from a
// short description (body shape, colours, markings, features).
//
// fishSprite(id)                 -> canvas (cached)
// fishImageURL(id, {silhouette}) -> data URL for <img> tags (cached)
//
// To use painted art later, make fishSprite() return a loaded image for that
// id; the catch popup, Fish Index and world effects all go through it.

import { seeded, seedFrom } from './noise.js';

const W = 240; // logical sprite size; drawn at 2x for crisp popups
const H = 140;
const PX = 2;

// Body plans. h: height/length; peak: where the body is tallest (0 = nose);
// ped: tail-stem height relative to max; snout: beak length, snoutW: [tip, base]
// beak width (thin needle by default; pike have a broad "duck-bill");
// dorsal/anal: [start, end, height(, 'spiny')] along the body.
const SHAPES = {
  minnow: { h: 0.3, peak: 0.36, ped: 0.26, tail: 'forked', tailLen: 0.24, dorsal: [[0.42, 0.56, 0.22]], anal: [[0.62, 0.74, 0.14]] },
  sunfish: { h: 0.6, peak: 0.45, ped: 0.22, tail: 'notched', tailLen: 0.2, dorsal: [[0.25, 0.72, 0.17, 'spiny']], anal: [[0.52, 0.76, 0.16]] },
  perch: { h: 0.36, peak: 0.4, ped: 0.24, tail: 'forked', tailLen: 0.22, dorsal: [[0.26, 0.48, 0.24, 'spiny'], [0.52, 0.7, 0.18]], anal: [[0.62, 0.74, 0.14]] },
  bass: { h: 0.38, peak: 0.42, ped: 0.26, tail: 'notched', tailLen: 0.22, dorsal: [[0.28, 0.48, 0.2, 'spiny'], [0.5, 0.72, 0.2]], anal: [[0.6, 0.76, 0.15]] },
  trout: { h: 0.28, peak: 0.42, ped: 0.3, tail: 'notched', tailLen: 0.22, dorsal: [[0.38, 0.52, 0.2]], anal: [[0.64, 0.76, 0.14]], adipose: 0.78 },
  carp: { h: 0.4, peak: 0.4, ped: 0.26, tail: 'forked', tailLen: 0.26, dorsal: [[0.32, 0.72, 0.16]], anal: [[0.66, 0.78, 0.14]] },
  catfish: { h: 0.26, peak: 0.28, ped: 0.3, tail: 'forked', tailLen: 0.2, dorsal: [[0.26, 0.34, 0.24]], anal: [[0.56, 0.84, 0.12]], adipose: 0.74, flatHead: true },
  pike: { h: 0.2, peak: 0.55, ped: 0.4, tail: 'forked', tailLen: 0.2, dorsal: [[0.68, 0.8, 0.22]], anal: [[0.7, 0.82, 0.18]], snout: 0.12, snoutW: [0.34, 0.5] },
  gar: { h: 0.14, peak: 0.55, ped: 0.45, tail: 'round', tailLen: 0.16, dorsal: [[0.74, 0.82, 0.24]], anal: [[0.74, 0.82, 0.22]], snout: 0.26 },
  bowfin: { h: 0.26, peak: 0.36, ped: 0.4, tail: 'round', tailLen: 0.18, dorsal: [[0.36, 0.88, 0.16]], anal: [[0.72, 0.84, 0.12]] },
  sturgeon: { h: 0.18, peak: 0.32, ped: 0.3, tail: 'hetero', tailLen: 0.26, dorsal: [[0.66, 0.74, 0.18]], anal: [[0.7, 0.78, 0.14]], snout: 0.1 },
  // sea fish
  tuna: { h: 0.32, peak: 0.42, ped: 0.1, tail: 'forked', tailLen: 0.3, dorsal: [[0.28, 0.4, 0.24, 'spiny'], [0.48, 0.6, 0.22]], anal: [[0.56, 0.66, 0.18]] },
  sword: { h: 0.22, peak: 0.42, ped: 0.12, tail: 'forked', tailLen: 0.28, dorsal: [[0.3, 0.42, 0.5]], anal: [[0.64, 0.72, 0.14]], snout: 0.3, snoutW: [0.04, 0.2] },
  grouper: { h: 0.42, peak: 0.4, ped: 0.32, tail: 'round', tailLen: 0.2, dorsal: [[0.24, 0.5, 0.18, 'spiny'], [0.52, 0.76, 0.18]], anal: [[0.6, 0.78, 0.15]] },
  flat: { h: 0.56, peak: 0.46, ped: 0.18, tail: 'round', tailLen: 0.16, dorsal: [[0.1, 0.86, 0.1]], anal: [[0.3, 0.86, 0.1]] },
  eel: { h: 0.15, peak: 0.2, ped: 0.4, tail: 'round', tailLen: 0.08, dorsal: [[0.06, 0.98, 0.45]], anal: [[0.55, 0.98, 0.14]] },
  opah: { h: 0.66, peak: 0.42, ped: 0.16, tail: 'forked', tailLen: 0.2, dorsal: [[0.22, 0.6, 0.3]], anal: [[0.56, 0.78, 0.14]] },
};

// Per-species look: shape, back colour, belly colour, and options.
const A = (shape, back, belly, opts = {}) => ({ shape, back, belly, fin: back, ...opts });

export const FISH_ART = {
  boot: { shape: 'boot' },
  shiner: A('minnow', '#b8952a', '#f5e6a8', { fin: '#e0b84a', stripe: '#f0d060' }),
  pumpkinseed: A('sunfish', '#6b8f3a', '#f2a541', { pattern: 'spots', patternColor: '#e07a2f', fin: '#8aa64a', earSpot: '#d62828' }),
  bluegill: A('sunfish', '#3e5c76', '#f4c96b', { pattern: 'bars', patternColor: 'rgba(20,30,50,0.35)', fin: '#4a6a85', earSpot: '#14213d' }),
  rudd: A('minnow', '#7a8b5a', '#e9e4c9', { fin: '#d1495b', tall: 1.15 }),
  perch: A('perch', '#9aa63a', '#f1e8b8', { pattern: 'bars', patternColor: 'rgba(40,50,20,0.55)', fin: '#e07a2f' }),
  crappie: A('sunfish', '#6f7b6b', '#e8ebe4', { pattern: 'mottled', patternColor: 'rgba(20,25,20,0.55)', fin: '#5e6b5b', tall: 0.9 }),
  cisco: A('minnow', '#6c8ca8', '#e9eef2', { fin: '#9fb4c6' }),
  carp: A('carp', '#a77c2d', '#eed9a0', { fin: '#8c5a2b', barbels: true, scales: true }),
  bullhead: A('catfish', '#5b4a32', '#d9c9a3', { fin: '#4a3b28', whiskers: true }),
  mooneye: A('minnow', '#a9b8c4', '#f4f7f9', { fin: '#c9d3db', bigEye: true }),
  chub: A('minnow', '#6b6f5a', '#ece8d8', { fin: '#8a8a70', stripe: '#3a3d30', tall: 1.1 }),
  rockbass: A('sunfish', '#5a4a32', '#d8c8a0', { pattern: 'spots', patternColor: 'rgba(30,20,10,0.6)', fin: '#4a3b28', redEye: true, tall: 0.85 }),
  sucker: A('carp', '#6a6250', '#efe9da', { fin: '#8a8270', tall: 0.75 }),
  trout: A('trout', '#6f8c5a', '#f2ede4', { pattern: 'spots', patternColor: '#2d3a2a', stripe: '#e56b8a', fin: '#90a07a' }),
  bass: A('bass', '#5b7a3a', '#eef0d0', { stripe: '#2f4420', fin: '#6a8a48', bigMouth: true }),
  smallmouth: A('bass', '#8a6a3a', '#efe3c0', { pattern: 'bars', patternColor: 'rgba(60,40,20,0.45)', fin: '#9a7a4a', bigMouth: true, redEye: true }),
  tench: A('carp', '#4f6b2c', '#c8c47a', { fin: '#3d5222', barbels: true, redEye: true }),
  bowfin: A('bowfin', '#5a6b3a', '#d8d3a6', { fin: '#4b5a2e', tailSpot: '#1a1a1a' }),
  whitefish: A('trout', '#8aa0b2', '#f4f6f8', { fin: '#aebdca', scales: true }),
  walleye: A('bass', '#8f7d3a', '#efe8c9', { pattern: 'mottled', patternColor: 'rgba(70,60,20,0.5)', fin: '#a0904a', glassyEye: true, tall: 0.8 }),
  catfish: A('catfish', '#6d7f8c', '#eef1f3', { pattern: 'spots', patternColor: '#2c3a44', fin: '#5f707c', whiskers: true }),
  gar: A('gar', '#6e7a4f', '#e6e2c8', { pattern: 'spots', patternColor: '#2d3320', fin: '#7a8a50' }),
  pickerel: A('pike', '#5f7a3a', '#efe8c0', { pattern: 'chain', patternColor: '#2b3a1a', fin: '#7a8a4a' }),
  brooktrout: A('trout', '#3f5a3a', '#f08a4b', { pattern: 'spots', patternColor: '#e9d16a', haloSpots: '#e63946', fin: '#e07a3f', finEdge: '#ffffff' }),
  sauger: A('perch', '#7a6a3a', '#ece4c4', { pattern: 'mottled', patternColor: 'rgba(50,40,15,0.55)', fin: '#8a7a4a', glassyEye: true, tall: 0.8 }),
  grayling: A('trout', '#6f7f95', '#eef0f4', { pattern: 'spots', patternColor: '#2a3040', fin: '#7d5ba6', finEdge: '#ff8fab', tall: 0.95 }),
  redhorse: A('carp', '#9a8a6a', '#f1ece0', { fin: '#d1495b', scales: true, tall: 0.85 }),
  pike: A('pike', '#4f6b3a', '#efe9c4', { pattern: 'spots', patternColor: '#e7e3b0', fin: '#8a5a2b' }),
  burbot: A('catfish', '#6b5a3a', '#d9cfa8', { pattern: 'mottled', patternColor: 'rgba(40,30,15,0.6)', fin: '#5b4a2e', whiskers: 'chin' }),
  laketrout: A('trout', '#4f5f6a', '#ece9e2', { pattern: 'spots', patternColor: '#d8dccf', fin: '#5d6e7a', finEdge: '#ffffff' }),
  koi: A('carp', '#f4f1ea', '#fffaf2', { pattern: 'koi', patternColor: '#e85d04', fin: '#f7c59f', barbels: true }),
  muskie: A('pike', '#7a8a5a', '#efe8c8', { pattern: 'bars', patternColor: 'rgba(50,60,30,0.5)', fin: '#9a6a3a' }),
  sturgeon: A('sturgeon', '#5d5a50', '#d9d4c4', { fin: '#4e4b42', scutes: true, whiskers: 'chin' }),
  steelhead: A('trout', '#5d7a8c', '#f3f1ec', { pattern: 'spots', patternColor: '#2a3440', stripe: '#d9547a', fin: '#7d93a3' }),
  chinook: A('trout', '#4d6a7a', '#eef0f0', { pattern: 'spots', patternColor: '#1e2a33', fin: '#5a7686', tall: 1.12 }),
  paddlefish: A('sturgeon', '#5a6f80', '#e6ecef', { fin: '#4a5f70', pattern: 'mottled', patternColor: 'rgba(30,40,50,0.35)' }),
  goldentrout: A('trout', '#c9a227', '#ff6b6b', { pattern: 'spots', patternColor: '#3a2a10', stripe: '#e63946', fin: '#ffd166', finEdge: '#ffffff' }),
  alligatorgar: A('gar', '#4f5a3a', '#d9d4b0', { pattern: 'spots', patternColor: '#262b1a', fin: '#5f6a40', tall: 1.35 }),
  mossback: A('pike', '#3e5a2a', '#c9cf8a', { pattern: 'mottled', patternColor: 'rgba(120,160,60,0.6)', fin: '#5a7a3a', legendary: '#9be564' }),
  stonejaw: A('trout', '#6b6f75', '#c9ccd1', { pattern: 'mottled', patternColor: 'rgba(40,42,46,0.6)', fin: '#55595f', legendary: '#cfd8e3', hookJaw: true, tall: 1.1 }),
  ghost: A('sturgeon', '#dfeaf0', '#ffffff', { fin: '#cfe3ec', legendary: '#bde0fe', translucent: true, scutes: true, whiskers: 'chin' }),
  frostfin: A('trout', '#a8dadc', '#f1faff', { pattern: 'spots', patternColor: '#ffffff', fin: '#caf0f8', finEdge: '#ffffff', legendary: '#90e0ef' }),
  marshqueen: A('bowfin', '#2d4a2a', '#b9b26a', { fin: '#3a5a2a', tailSpot: '#ffd166', legendary: '#ffd166', crown: true }),
  riverking: A('trout', '#7a2e2e', '#e9d8c9', { pattern: 'spots', patternColor: '#2a1515', fin: '#8a3a3a', legendary: '#ff7b54', hookJaw: true, tall: 1.15 }),
  emeraldjaw: A('bass', '#127a4a', '#c8f7dc', { stripe: '#0b4d2e', fin: '#1fa463', legendary: '#2dd881', bigMouth: true, redEye: true }),
  dockmaster: A('catfish', '#3d4650', '#d6dbe0', { pattern: 'spots', patternColor: '#1b2128', fin: '#2e353d', legendary: '#9ad1ff', whiskers: true, crown: true, tall: 1.2 }),
  // mythic: a glow plus rainbow sparkles
  aurora: A('trout', '#2a9d8f', '#e0fbfc', { pattern: 'rainbow', fin: '#7df9ff', finEdge: '#ff5ce1', legendary: '#7df9ff', mythic: true, tall: 1.1 }),
  lakewyrm: A('eel', '#1b4332', '#95d5b2', { pattern: 'spots', patternColor: '#d8f3dc', fin: '#ff5ce1', legendary: '#ff5ce1', mythic: true, redEye: true, crown: true, tall: 1.6 }),
  emberkoi: A('carp', '#ff7b00', '#ffe8a3', { pattern: 'koi', patternColor: '#9d0208', fin: '#ffba08', legendary: '#ff7b00', mythic: true, barbels: true }),

  // ---- the ponds and the East River ----
  goldfish: A('carp', '#f77f00', '#ffd6a5', { fin: '#fcbf49', tall: 0.9 }),
  warmouth: A('sunfish', '#5a4a3a', '#d8b98a', { pattern: 'mottled', patternColor: 'rgba(90,40,20,0.5)', fin: '#6b4a32', redEye: true, bigMouth: true }),
  redfin: A('pike', '#5f6a3a', '#efe2c0', { pattern: 'bars', patternColor: 'rgba(40,50,20,0.55)', fin: '#d1495b' }),
  tigertrout: A('trout', '#7a6a3a', '#f1e8c8', { pattern: 'chain', patternColor: '#2b2410', fin: '#d98a3a' }),
  willowwisp: A('trout', '#b7e4c7', '#f1faee', { fin: '#d8f3dc', legendary: '#b7e4c7', translucent: true, pattern: 'spots', patternColor: 'rgba(255,255,255,0.7)' }),
  mudminnow: A('minnow', '#5a5238', '#c9bf98', { pattern: 'bars', patternColor: 'rgba(40,35,20,0.45)', fin: '#5a5238', tall: 1.1 }),
  greensunfish: A('sunfish', '#3d6b4a', '#e9d48a', { pattern: 'spots', patternColor: 'rgba(120,220,220,0.5)', fin: '#4a7a58', earSpot: '#14213d', bigMouth: true }),
  yellowbullhead: A('catfish', '#9a7a2a', '#f4e3a1', { fin: '#7a5a1a', whiskers: true }),
  flathead: A('catfish', '#6b5a3a', '#e3d6b0', { pattern: 'mottled', patternColor: 'rgba(40,30,15,0.55)', fin: '#5a4a2e', whiskers: true, tall: 0.85 }),
  oldwhiskers: A('catfish', '#4a4a3a', '#cfc8a8', { pattern: 'mottled', patternColor: 'rgba(20,20,10,0.6)', fin: '#3a3a2e', whiskers: true, legendary: '#e9c46a', crown: true, tall: 1.2 }),
  cutthroat: A('trout', '#7a8a5a', '#f1e8d8', { pattern: 'spots', patternColor: '#2d3320', fin: '#90a07a', stripe: '#e63946' }),
  splake: A('trout', '#4f6a5a', '#ece6d0', { pattern: 'mottled', patternColor: 'rgba(230,230,200,0.6)', fin: '#e07a3f', finEdge: '#ffffff' }),
  arcticchar: A('trout', '#3d5a6a', '#ff7b54', { pattern: 'spots', patternColor: '#ffd6a5', fin: '#e85d04', finEdge: '#ffffff' }),
  crystalchar: A('trout', '#a8dadc', '#ffffff', { pattern: 'spots', patternColor: '#e0fbfc', fin: '#caf0f8', finEdge: '#ffffff', legendary: '#bde0fe', translucent: true }),
  glimmerfin: A('trout', '#4cc9f0', '#f1faff', { pattern: 'rainbow', fin: '#ff9ef0', finEdge: '#ffffff', legendary: '#7df9ff', mythic: true, tall: 1.05 }),
  blackbullhead: A('catfish', '#2a2a24', '#8a8670', { fin: '#1f1f1a', whiskers: true }),
  dollarsunfish: A('sunfish', '#3f6f8a', '#f4a261', { pattern: 'spots', patternColor: 'rgba(120,230,255,0.55)', fin: '#4a7a95', earSpot: '#14213d', tall: 1.05 }),
  americaneel: A('eel', '#4a4a2a', '#cfc8a0', { fin: '#3a3a20' }),
  spottedgar: A('gar', '#5a5a3a', '#e6dcc0', { pattern: 'spots', patternColor: '#1a1a10', fin: '#5a5a3a' }),
  snakehead: A('bowfin', '#4a5a3a', '#cfcf9a', { pattern: 'mottled', patternColor: 'rgba(20,25,10,0.65)', fin: '#3a4a2a', bigMouth: true }),
  nightbowfin: A('bowfin', '#14141f', '#4a4a6a', { fin: '#1f1f33', tailSpot: '#c77dff', legendary: '#9d4edd', redEye: true }),
  mirefang: A('eel', '#1b2a1b', '#4a6a3a', { pattern: 'spots', patternColor: '#b9fbc0', fin: '#ff5ce1', legendary: '#b9fbc0', mythic: true, redEye: true, crown: true, tall: 1.5 }),
  whitecrappie: A('sunfish', '#8a948a', '#f1f3ee', { pattern: 'bars', patternColor: 'rgba(40,45,40,0.4)', fin: '#7a847a', tall: 0.9 }),
  buffalo: A('carp', '#5a5a5a', '#d9d4c4', { fin: '#4a4a4a', scales: true, tall: 1.1 }),
  hybridbass: A('bass', '#6a7a8a', '#f1f3f5', { pattern: 'stripes', patternColor: 'rgba(30,38,48,0.7)', fin: '#7a8a9a' }),
  spottedbass: A('bass', '#6b7a3a', '#efeacb', { pattern: 'spots', patternColor: 'rgba(40,50,20,0.55)', fin: '#7a8a48', bigMouth: true }),
  bigheadcarp: A('carp', '#6a6a6a', '#e3e0d8', { pattern: 'mottled', patternColor: 'rgba(40,40,40,0.4)', fin: '#5a5a5a', bigEye: true, tall: 1.15 }),
  millstone: A('carp', '#5a5040', '#cfc4a0', { fin: '#4a4030', scales: true, barbels: true, legendary: '#d4a373', crown: true, tall: 1.25 }),
  fallfish: A('minnow', '#9aa3ad', '#f4f6f8', { fin: '#b8c0c8', scales: true }),
  logperch: A('perch', '#b5a46a', '#f4eccf', { pattern: 'bars', patternColor: 'rgba(40,35,15,0.6)', fin: '#a0905a', tall: 0.75 }),
  browntrout: A('trout', '#8a6a3a', '#f4e3b8', { pattern: 'spots', patternColor: '#3a2a10', haloSpots: '#e63946', fin: '#9a7a4a' }),
  atlanticsalmon: A('trout', '#5d7a8c', '#f3f1ec', { pattern: 'spots', patternColor: '#1e2a33', fin: '#6b8595', tall: 1.1 }),
  shovelnose: A('sturgeon', '#8a7a5a', '#ece4cc', { fin: '#7a6a4a', scutes: true, whiskers: 'chin' }),
  rapidsrunner: A('trout', '#2a6f97', '#e9f5f9', { pattern: 'spots', patternColor: '#ffffff', stripe: '#4cc9f0', fin: '#468faf', legendary: '#90e0ef', hookJaw: true, tall: 1.15 }),

  // ---- sea fish ----
  herring: A('minnow', '#3f6f99', '#eef3f7', { fin: '#9fb7cc', scales: true }),
  mackerel: A('tuna', '#2a6f5a', '#f1f5f2', { pattern: 'bars', patternColor: 'rgba(10,35,30,0.6)', fin: '#4f8a76', tall: 0.75 }),
  sardine: A('minnow', '#3d6f8f', '#f4f7f9', { pattern: 'spots', patternColor: 'rgba(20,40,60,0.5)', fin: '#8fb3c9', scales: true }),
  mahimahi: A('tuna', '#2a9d4a', '#f9e04b', { pattern: 'spots', patternColor: '#1d6fa3', fin: '#1d6fa3', tall: 1.2 }),
  cod: A('trout', '#7a6f4f', '#ece6d0', { pattern: 'mottled', patternColor: 'rgba(70,60,30,0.45)', fin: '#8a7f5f', whiskers: 'chin', tall: 1.15 }),
  seabass: A('bass', '#55606e', '#eef1f3', { pattern: 'stripes', patternColor: 'rgba(30,38,48,0.75)', fin: '#6b7787' }),
  sheephead: A('bass', '#c44536', '#f3a68f', { pattern: 'ends', patternColor: '#1d1d1f', fin: '#2a2a2a', redEye: true }),
  flounder: A('flat', '#a7b8b0', '#d6e3de', { pattern: 'spots', patternColor: 'rgba(80,95,90,0.5)', fin: '#b9c9c2', translucent: true }),
  parrotfish: A('grouper', '#2a9d8f', '#90e0ef', { pattern: 'mottled', patternColor: 'rgba(244,162,97,0.55)', fin: '#f4a261', scales: true, tall: 0.85 }),
  bluefin: A('tuna', '#1d3557', '#e9eef2', { fin: '#457b9d', finEdge: '#ffd166', stripe: '#a8dadc' }),
  grouper: A('grouper', '#6b5b3e', '#d9c8a0', { pattern: 'mottled', patternColor: 'rgba(50,40,20,0.5)', fin: '#5b4b2e', bigMouth: true }),
  swordfish: A('sword', '#4a4e69', '#d8d8e0', { fin: '#3c3f58' }),
  oarfish: A('eel', '#c9d6df', '#f4f7f9', { fin: '#e63946', pattern: 'spots', patternColor: 'rgba(60,70,90,0.5)' }),
  opah: A('opah', '#c85a54', '#f4a7a0', { pattern: 'spots', patternColor: '#fff4f0', fin: '#e63946', bigEye: true }),
  marlin: A('sword', '#1d4e89', '#e8f1f8', { pattern: 'bars', patternColor: 'rgba(120,190,255,0.5)', fin: '#14365f' }),
  treasure: { shape: 'chest' },
  kelpbeard: A('grouper', '#3e5a2a', '#b9c48a', { pattern: 'mottled', patternColor: 'rgba(120,160,60,0.6)', fin: '#4a6a2a', legendary: '#9be564', whiskers: true, bigMouth: true }),
  prismwrasse: A('grouper', '#5a3fd6', '#f1e6ff', { pattern: 'rainbow', fin: '#ff8fab', legendary: '#e0aaff', scales: true, tall: 0.85 }),
  thunderfin: A('tuna', '#14213d', '#e9eef2', { fin: '#fca311', finEdge: '#ffffff', stripe: '#ffd166', legendary: '#ffd166' }),
  drownedcaptain: A('grouper', '#4f6d6a', '#c9dcd4', { pattern: 'mottled', patternColor: 'rgba(30,50,48,0.55)', fin: '#3e5755', legendary: '#7fffd4', translucent: true, crown: true, bigMouth: true }),
  stormcaller: A('sword', '#2b2d42', '#adb5bd', { fin: '#1d1e30', stripe: '#4cc9f0', legendary: '#90e0ef' }),
  glasshalibut: A('flat', '#cfeff3', '#ffffff', { fin: '#e0fbfc', legendary: '#e0fbfc', translucent: true, pattern: 'spots', patternColor: 'rgba(150,200,210,0.5)' }),
  leviathan: A('eel', '#0b2545', '#3c5a80', { fin: '#e63946', pattern: 'spots', patternColor: '#90e0ef', legendary: '#ff4d6d', redEye: true, tall: 1.3 }),
  silvermoon: A('opah', '#b8c0cc', '#eef2f7', { pattern: 'spots', patternColor: '#ffffff', fin: '#ff6b6b', legendary: '#e0e7ff', bigEye: true }),
  abyssking: A('grouper', '#10002b', '#5a189a', { pattern: 'spots', patternColor: '#7df9ff', fin: '#3c096c', legendary: '#7df9ff', mythic: true, crown: true, bigMouth: true, redEye: true, tall: 1.15 }),
  tidemother: A('opah', '#0077b6', '#caf0f8', { pattern: 'rainbow', fin: '#ff5ce1', legendary: '#ff5ce1', mythic: true, bigEye: true, crown: true }),
};

const cache = new Map();
const urlCache = new Map();

export function fishSprite(id) {
  if (!cache.has(id)) cache.set(id, render(id));
  return cache.get(id);
}

export function fishImageURL(id, { silhouette = false } = {}) {
  const key = `${id}|${silhouette}`;
  if (!urlCache.has(key)) {
    const src = fishSprite(id);
    if (!silhouette) urlCache.set(key, src.toDataURL());
    else {
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#8fa9b5'; // a mysterious grey shape until discovered
      g.fillRect(0, 0, c.width, c.height);
      urlCache.set(key, c.toDataURL());
    }
  }
  return urlCache.get(key);
}

/** Sprite size in logical units (the canvas is drawn at 2x). */
export const FISH_SPRITE_SIZE = { w: W, h: H };

// ---- rendering --------------------------------------------------------------------

function render(id) {
  const art = FISH_ART[id] || FISH_ART.boot;
  const c = document.createElement('canvas');
  c.width = W * PX;
  c.height = H * PX;
  const g = c.getContext('2d');
  g.scale(PX, PX);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (art.shape === 'boot') drawBoot(g);
  else if (art.shape === 'chest') drawChest(g);
  else drawFish(g, art, seeded(seedFrom('fish', id)));
  return c;
}

function profile(t, sh) {
  const s = sh.snout || 0;
  const [tipW, baseW] = sh.snoutW || [0.12, 0.32];
  if (t < s) return tipW + (baseW - tipW) * (t / s);
  if (t < sh.peak) {
    const k = (t - s) / (sh.peak - s);
    const start = s ? baseW : 0.1;
    return start + (1 - start) * Math.sqrt(1 - (1 - k) * (1 - k));
  }
  const k = (t - sh.peak) / (1 - sh.peak);
  return sh.ped + (1 - sh.ped) * (0.5 + 0.5 * Math.cos(Math.PI * k));
}

function drawFish(g, art, rnd) {
  const sh = SHAPES[art.shape];
  const hRatio = sh.h * (art.tall || 1);
  const BL = Math.min(W * 0.7, (H * 0.6) / hRatio);
  const HB = BL * hRatio; // body height
  const total = BL * (1 + sh.tailLen);
  const noseX = W / 2 + total / 2;
  const cy = H / 2 + 4;
  const X = (t) => noseX - t * BL;
  const half = (t) => (HB / 2) * profile(t, sh);
  const top = (t) => cy - half(t) * (sh.flatHead && t < 0.3 ? 0.78 + 0.22 * (t / 0.3) : 1);
  const bot = (t) => cy + half(t) * 0.92;

  const bodyPath = () => {
    const p = new Path2D();
    const N = 56;
    for (let i = 0; i <= N; i++) p[i ? 'lineTo' : 'moveTo'](X(i / N), top(i / N));
    for (let i = N; i >= 0; i--) p.lineTo(X(i / N), bot(i / N));
    p.closePath();
    return p;
  };
  const body = bodyPath();
  const finFill = (color) => {
    g.fillStyle = color;
    g.globalAlpha = art.translucent ? 0.6 : 0.92;
  };

  // ---- fins behind the body ----
  drawTail(g, art, sh, X(1), cy, half(1), BL, HB, finFill);
  for (const [s, e, hgt, kind] of sh.dorsal) drawFin(g, art, X, top, s, e, -HB * hgt, kind === 'spiny', finFill);
  for (const [s, e, hgt] of sh.anal || []) drawFin(g, art, X, bot, s, e, HB * hgt, false, finFill);
  // pelvic fin
  finFill(art.fin);
  g.beginPath();
  g.moveTo(X(0.42), bot(0.42) - 1);
  g.lineTo(X(0.5), bot(0.47) + HB * 0.16);
  g.lineTo(X(0.52), bot(0.5) - 1);
  g.fill();
  g.globalAlpha = 1;
  if (sh.adipose) {
    g.fillStyle = art.fin;
    g.beginPath();
    g.ellipse(X(sh.adipose), top(sh.adipose) - 1.5, BL * 0.03, HB * 0.06, 0, Math.PI, Math.PI * 2);
    g.fill();
  }

  // ---- body ----
  const grad = g.createLinearGradient(0, cy - HB / 2, 0, cy + HB / 2);
  grad.addColorStop(0, art.back);
  grad.addColorStop(0.5, mix(art.back, art.belly, 0.55));
  grad.addColorStop(0.75, art.belly);
  grad.addColorStop(1, art.belly);
  if (art.legendary) {
    g.save();
    g.shadowColor = art.legendary;
    g.shadowBlur = 22;
    g.fillStyle = grad;
    g.fill(body);
    g.fill(body);
    g.restore();
  }
  g.globalAlpha = art.translucent ? 0.88 : 1;
  g.fillStyle = grad;
  g.fill(body);
  g.globalAlpha = 1;

  // ---- markings, clipped to the body ----
  g.save();
  g.clip(body);
  drawPattern(g, art, rnd, X, top, bot, cy, BL, HB);
  if (art.stripe) {
    g.strokeStyle = art.stripe;
    g.globalAlpha = 0.7;
    g.lineWidth = HB * 0.09;
    g.beginPath();
    g.moveTo(X(0.15), cy - HB * 0.02);
    g.quadraticCurveTo(X(0.55), cy - HB * 0.06, X(0.98), cy);
    g.stroke();
    g.globalAlpha = 1;
  }
  if (art.scales || art.shape === 'carp') {
    g.strokeStyle = 'rgba(255,255,255,0.13)';
    g.lineWidth = 0.6;
    const step = BL * 0.04;
    for (let x = X(0.95); x < X(0.2); x += step) {
      for (let y = cy - HB / 2; y < cy + HB / 2; y += step * 0.8) {
        const off = Math.round((y - cy) / (step * 0.8)) % 2 ? step / 2 : 0;
        g.beginPath();
        g.arc(x + off, y, step * 0.55, -Math.PI / 2, Math.PI / 2);
        g.stroke();
      }
    }
  }
  // Shading: dark back, bright belly, and a soft highlight.
  const shade = g.createLinearGradient(0, cy - HB / 2, 0, cy + HB / 2);
  shade.addColorStop(0, 'rgba(0,0,0,0.28)');
  shade.addColorStop(0.45, 'rgba(0,0,0,0)');
  shade.addColorStop(0.85, 'rgba(255,255,255,0.12)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.ellipse(X(0.35), cy - HB * 0.2, BL * 0.22, HB * 0.1, -0.05, 0, Math.PI * 2);
  g.fill();
  // Lateral line.
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(X(0.2), cy - HB * 0.12);
  g.quadraticCurveTo(X(0.55), cy - HB * 0.14, X(0.97), cy - 0.5);
  g.stroke();
  g.restore();

  if (art.scutes) {
    g.fillStyle = 'rgba(240,235,220,0.85)';
    for (let t = 0.14; t < 0.66; t += 0.055) {
      for (const y of [top(t) + 1.2, cy - HB * 0.02]) {
        g.beginPath();
        g.moveTo(X(t) - 2.2, y);
        g.lineTo(X(t), y - 1.8);
        g.lineTo(X(t) + 2.2, y);
        g.lineTo(X(t), y + 1.8);
        g.fill();
      }
    }
  }

  // Gill cover.
  const gt = (sh.snout || 0) + 0.17;
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(X(gt) + 2, top(gt) + HB * 0.08);
  g.quadraticCurveTo(X(gt) - BL * 0.035, cy, X(gt) + 2, bot(gt) - HB * 0.06);
  g.stroke();
  if (art.earSpot) {
    g.fillStyle = art.earSpot;
    g.beginPath();
    g.ellipse(X(gt) - 1, cy - HB * 0.08, BL * 0.022, HB * 0.06, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Outline.
  g.strokeStyle = 'rgba(0,0,0,0.38)';
  g.lineWidth = 1.2;
  g.stroke(body);

  // Pectoral fin on top of the body.
  finFill(art.fin);
  g.beginPath();
  g.ellipse(X(gt + 0.08), cy + HB * 0.16, BL * 0.075, HB * 0.07, 0.45, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;

  drawHead(g, art, sh, X, top, bot, cy, BL, HB);

  if (art.legendary) sparkles(g, art.legendary, rnd);
  if (art.mythic) for (const c of ['#ff5ce1', '#7df9ff', '#ffd166']) sparkles(g, c, rnd);
}

function drawFin(g, art, X, edge, s, e, height, spiny, finFill) {
  finFill(art.fin);
  g.beginPath();
  g.moveTo(X(s), edge(s));
  if (spiny) {
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = s + ((e - s) * i) / n;
      const hgt = height * (1 - 0.35 * (i / n)) * (i % 2 ? 0.75 : 1);
      g.lineTo(X(t), edge(t) + hgt);
    }
  } else {
    g.quadraticCurveTo(X(s + (e - s) * 0.15), edge(s) + height * 1.05, X(s + (e - s) * 0.45), edge(s) + height);
    g.quadraticCurveTo(X(e) + 2, edge(e) + height * 0.5, X(e), edge(e) + height * 0.25);
  }
  g.lineTo(X(e), edge(e));
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  // Fin rays.
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = 0.6;
  for (let i = 1; i < 6; i++) {
    const t = s + ((e - s) * i) / 6;
    g.beginPath();
    g.moveTo(X(t), edge(t));
    g.lineTo(X(t) + 1.5, edge(t) + height * 0.8 * (1 - (i / 6) * 0.4));
    g.stroke();
  }
  if (art.finEdge) {
    g.strokeStyle = art.finEdge;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(X(s), edge(s) + height * 0.2);
    g.lineTo(X(s + (e - s) * 0.4), edge(s) + height);
    g.stroke();
  }
}

function drawTail(g, art, sh, xb, cy, ph, BL, HB, finFill) {
  const TL = BL * sh.tailLen;
  const TH = HB * 0.5;
  finFill(art.fin);
  g.beginPath();
  g.moveTo(xb + 3, cy - ph);
  if (sh.tail === 'forked' || sh.tail === 'notched') {
    const notch = sh.tail === 'forked' ? 0.6 : 0.82;
    const spread = sh.tail === 'forked' ? 0.95 : 0.78;
    g.quadraticCurveTo(xb - TL * 0.5, cy - ph - TH * 0.4, xb - TL, cy - ph - TH * spread);
    g.quadraticCurveTo(xb - TL * 0.75, cy - TH * 0.2, xb - TL * notch, cy);
    g.quadraticCurveTo(xb - TL * 0.75, cy + TH * 0.2, xb - TL, cy + ph + TH * spread);
    g.quadraticCurveTo(xb - TL * 0.5, cy + ph + TH * 0.4, xb + 3, cy + ph);
  } else if (sh.tail === 'round') {
    g.bezierCurveTo(xb - TL * 0.7, cy - ph - TH * 0.7, xb - TL * 1.2, cy - TH * 0.3, xb - TL, cy);
    g.bezierCurveTo(xb - TL * 1.2, cy + TH * 0.3, xb - TL * 0.7, cy + ph + TH * 0.7, xb + 3, cy + ph);
  } else {
    // heterocercal (sturgeon): long upper lobe
    g.quadraticCurveTo(xb - TL * 0.5, cy - ph - TH * 0.3, xb - TL * 1.1, cy - ph - TH * 0.85);
    g.quadraticCurveTo(xb - TL * 0.6, cy - ph * 0.2, xb - TL * 0.55, cy + ph + TH * 0.35);
    g.quadraticCurveTo(xb - TL * 0.25, cy + ph + TH * 0.15, xb + 3, cy + ph);
  }
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(0,0,0,0.2)';
  g.lineWidth = 0.6;
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(xb, cy + (ph * i) / 4);
    g.lineTo(xb - TL * 0.8, cy + ((ph + TH * 0.7) * i) / 3.2);
    g.stroke();
  }
  if (art.tailSpot) {
    // Eyespot on the upper base of the tail fin.
    g.fillStyle = art.tailSpot;
    g.beginPath();
    g.arc(xb - TL * 0.28, cy - ph * 0.35, Math.max(2, ph * 0.38), 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,220,120,0.6)';
    g.lineWidth = 0.8;
    g.stroke();
  }
}

function drawPattern(g, art, rnd, X, top, bot, cy, BL, HB) {
  const c = art.patternColor;
  switch (art.pattern) {
    case 'bars':
      g.fillStyle = c;
      for (let i = 0; i < 7; i++) {
        const t = 0.22 + i * 0.1 + (rnd() - 0.5) * 0.02;
        const w = BL * (0.035 + rnd() * 0.015);
        g.beginPath();
        g.moveTo(X(t) - w / 2, top(t) - 2);
        g.lineTo(X(t) + w / 2, top(t) - 2);
        g.lineTo(X(t) + w * 0.2, cy + HB * 0.25);
        g.lineTo(X(t) - w * 0.2, cy + HB * 0.25);
        g.fill();
      }
      break;
    case 'spots':
      for (let i = 0; i < 34; i++) {
        const t = 0.12 + rnd() * 0.85;
        const y = top(t) + (cy + HB * 0.15 - top(t)) * rnd();
        const r = BL * (0.007 + rnd() * 0.01);
        if (art.haloSpots && i % 3 === 0) {
          g.fillStyle = '#9ad1ff';
          g.beginPath();
          g.arc(X(t), y, r * 1.9, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = art.haloSpots;
        } else g.fillStyle = c;
        g.beginPath();
        g.arc(X(t), y, r, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'mottled':
      g.fillStyle = c;
      for (let i = 0; i < 22; i++) {
        const t = 0.1 + rnd() * 0.88;
        const y = top(t) + (cy + HB * 0.2 - top(t)) * rnd();
        g.beginPath();
        g.ellipse(X(t), y, BL * (0.02 + rnd() * 0.035), HB * (0.04 + rnd() * 0.07), rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'chain':
      g.strokeStyle = c;
      g.lineWidth = 1.3;
      for (let row = 0; row < 3; row++) {
        for (let t = 0.12; t < 0.95; t += 0.06) {
          const tt = t + (row % 2) * 0.03;
          const y = top(tt) + (HB * 0.18) * (row + 0.7);
          g.beginPath();
          g.ellipse(X(tt), y, BL * 0.028, HB * 0.07, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      break;
    case 'stripes':
      // Horizontal lines along the body (sea bass).
      g.strokeStyle = c;
      g.lineWidth = 1.4;
      for (let i = 0; i < 6; i++) {
        const k = -0.32 + i * 0.11;
        g.beginPath();
        g.moveTo(X(0.12), cy + HB * k);
        g.quadraticCurveTo(X(0.55), cy + HB * (k - 0.03), X(0.98), cy + HB * k * 0.3);
        g.stroke();
      }
      break;
    case 'ends':
      // Dark head and tail with a bright middle (sheephead).
      g.fillStyle = c;
      g.fillRect(X(0.28), 0, W, H);
      g.fillRect(0, 0, X(0.72), H);
      break;
    case 'rainbow':
      for (let i = 0; i < 7; i++) {
        g.fillStyle = `hsla(${i * 50}, 85%, 62%, 0.55)`;
        g.fillRect(X(0.1 + (i + 1) * 0.12), 0, BL * 0.12 + 1, H);
      }
      break;
    case 'koi':
      g.fillStyle = c;
      for (let i = 0; i < 4; i++) {
        const t = 0.1 + i * 0.22 + rnd() * 0.06;
        g.beginPath();
        g.ellipse(X(t), top(t) + HB * 0.18, BL * (0.07 + rnd() * 0.04), HB * (0.17 + rnd() * 0.08), rnd(), 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#1b1b1b';
      for (let i = 0; i < 3; i++) {
        const t = 0.25 + rnd() * 0.6;
        g.beginPath();
        g.ellipse(X(t), top(t) + HB * 0.12, BL * 0.025, HB * 0.06, rnd(), 0, Math.PI * 2);
        g.fill();
      }
      break;
  }
}

function drawHead(g, art, sh, X, top, bot, cy, BL, HB) {
  const s = sh.snout || 0;
  const et = s + 0.075;
  const ex = X(et);
  const ey = cy - (cy - top(et)) * 0.35;
  const er = Math.max(BL * 0.026, 3.2) * (art.bigEye ? 1.4 : 1);
  // Mouth.
  g.strokeStyle = 'rgba(30,20,10,0.7)';
  g.lineWidth = 1.2;
  g.beginPath();
  const mouthEnd = art.bigMouth ? et + 0.06 : s + 0.04;
  g.moveTo(X(0) - 0.5, cy + HB * 0.04);
  g.quadraticCurveTo(X(mouthEnd * 0.6), cy + HB * 0.09, X(mouthEnd), cy + HB * 0.05);
  g.stroke();
  if (art.hookJaw) {
    g.strokeStyle = mix(art.back, '#000000', 0.3);
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(X(0.02), cy + HB * 0.1);
    g.quadraticCurveTo(X(0) + 5, cy + HB * 0.08, X(0) + 3, cy - HB * 0.04);
    g.stroke();
  }
  // Eye.
  g.fillStyle = art.glassyEye ? '#e8eef0' : art.redEye ? '#c1121f' : '#e9c46a';
  g.beginPath();
  g.arc(ex, ey, er, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = art.glassyEye ? 'rgba(40,50,60,0.6)' : '#111';
  g.beginPath();
  g.arc(ex + er * 0.12, ey, er * 0.58, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(ex + er * 0.35, ey - er * 0.35, er * 0.25, 0, Math.PI * 2);
  g.fill();
  // Whiskers / barbels.
  if (art.whiskers || art.barbels) {
    g.strokeStyle = mix(art.back, '#000000', 0.35);
    g.lineCap = 'round';
    const chinOnly = art.whiskers === 'chin';
    const lines = art.barbels ? [[0.12, 0.22]] : chinOnly ? [[0.18, 0.3]] : [[0.1, 0.32], [0.2, 0.38], [0.04, 0.24]];
    lines.forEach(([dy, len], i) => {
      g.lineWidth = art.barbels ? 1 : 1.3;
      g.beginPath();
      const sx = X(0.015);
      const sy = cy + HB * dy * (chinOnly ? 1.4 : 1);
      g.moveTo(sx, sy);
      g.quadraticCurveTo(sx + BL * 0.02, sy + HB * len * 0.6, sx - BL * len * (0.4 + i * 0.1), sy + HB * len);
      g.stroke();
    });
  }
  if (art.crown) {
    const x = X(et + 0.02);
    const y = top(et + 0.02) - 4;
    g.fillStyle = '#ffd166';
    g.strokeStyle = '#b8860b';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x - 8, y);
    g.lineTo(x - 8, y - 6);
    g.lineTo(x - 4, y - 3);
    g.lineTo(x, y - 9);
    g.lineTo(x + 4, y - 3);
    g.lineTo(x + 8, y - 6);
    g.lineTo(x + 8, y);
    g.closePath();
    g.fill();
    g.stroke();
  }
}

function sparkles(g, color, rnd) {
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 6;
  for (let i = 0; i < 7; i++) {
    const x = 18 + rnd() * (W - 36);
    const y = 12 + rnd() * (H - 24);
    const r = 2 + rnd() * 3;
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rr = k % 2 ? r * 0.3 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.fill();
  }
  g.shadowBlur = 0;
}

function drawBoot(g) {
  g.save();
  g.translate(W / 2 - 50, H / 2 - 40);
  const leather = g.createLinearGradient(0, 0, 100, 80);
  leather.addColorStop(0, '#7a5230');
  leather.addColorStop(1, '#4a2f1a');
  g.fillStyle = leather;
  g.strokeStyle = '#2b1a0d';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(18, 0);
  g.lineTo(52, 0);
  g.lineTo(54, 46);
  g.quadraticCurveTo(70, 50, 92, 56);
  g.quadraticCurveTo(102, 60, 100, 72);
  g.lineTo(14, 72);
  g.quadraticCurveTo(10, 40, 18, 0);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#2b1a0d';
  g.fillRect(12, 70, 90, 8); // sole
  g.strokeStyle = '#e9d8a6';
  g.lineWidth = 1.5;
  for (let y = 10; y < 44; y += 8) {
    g.beginPath();
    g.moveTo(42, y);
    g.lineTo(54, y + 5);
    g.moveTo(54, y);
    g.lineTo(42, y + 5);
    g.stroke();
  }
  // A strand of weed and a drip, for character.
  g.strokeStyle = '#5a8a3a';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(24, 2);
  g.quadraticCurveTo(10, 20, 2, 18);
  g.stroke();
  g.fillStyle = '#9ad1ff';
  g.beginPath();
  g.arc(96, 84, 2.5, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawChest(g) {
  g.save();
  g.translate(W / 2 - 52, H / 2 - 38);
  const wood = g.createLinearGradient(0, 0, 0, 76);
  wood.addColorStop(0, '#8a5a2b');
  wood.addColorStop(1, '#4a2f14');
  // Lid (slightly open) and body.
  g.fillStyle = wood;
  g.strokeStyle = '#2b1a0d';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(4, 30);
  g.quadraticCurveTo(52, -6, 100, 30);
  g.lineTo(100, 34);
  g.lineTo(4, 34);
  g.closePath();
  g.fill();
  g.stroke();
  // Gold glinting out of the gap.
  g.fillStyle = '#ffd166';
  g.shadowColor = '#ffd166';
  g.shadowBlur = 14;
  g.fillRect(8, 33, 88, 6);
  g.shadowBlur = 0;
  g.fillStyle = wood;
  g.beginPath();
  g.rect(4, 38, 96, 38);
  g.fill();
  g.stroke();
  // Iron bands, lock and barnacles.
  g.fillStyle = '#6c757d';
  for (const x of [16, 82]) g.fillRect(x, 6, 8, 70);
  g.fillStyle = '#d4af37';
  g.fillRect(45, 36, 14, 16);
  g.fillStyle = '#2b1a0d';
  g.fillRect(50, 42, 4, 6);
  g.fillStyle = 'rgba(230,225,210,0.85)';
  for (const [x, y, r] of [[10, 70, 3], [14, 66, 2], [92, 44, 2.5], [70, 72, 2]]) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#5a8a3a';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(96, 40);
  g.quadraticCurveTo(110, 56, 104, 74);
  g.stroke();
  g.restore();
}

function mix(a, b, t) {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

function parseHex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
