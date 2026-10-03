// Visual palette for the renderer and terrain. Art *shapes* live in gfx/;
// this file holds the colours they use, so the overall look can be tuned here.
// Colours used in per-pixel terrain rendering are [r, g, b] arrays.

export const THEME = {
  background: '#1d2e1f', // shown only while the first terrain tiles render

  water: {
    shallow: [72, 168, 176],
    deep: [16, 54, 92],
    placeholder: '#2f6f8f',
  },
  // Per-zone water tint [r, g, b, strength], blended softly across zone borders.
  waterTint: {
    deep: [18, 48, 90, 0.4],
    basin: [8, 30, 70, 0.55],
    dockShade: [24, 64, 74, 0.35],
    reeds: [74, 118, 78, 0.38],
    weedyCove: [74, 118, 78, 0.38],
    marsh: [78, 104, 56, 0.6],
    river: [70, 150, 140, 0.45],
    coldSpring: [150, 215, 232, 0.4],
    shallows: [96, 196, 192, 0.25],
    rocks: [44, 76, 98, 0.3],
    eastRiver: [70, 150, 140, 0.45],
    willowPond: [70, 140, 120, 0.35],
    frogPond: [86, 112, 52, 0.55],
    crystalPond: [120, 220, 235, 0.45],
    blackBog: [46, 40, 24, 0.65],
    millPond: [70, 96, 70, 0.5],
  },
  caustics: { alpha: 0.085, alpha2: 0.05 },
  current: 'rgba(230,250,250,0.28)',
  zoneLabel: 'rgba(255,255,255,0.16)',

  // Flat colours for placeholders while tiles render.
  land: { sand: '#d9c48f', grass: '#4f7d3a', rock: '#7c7f86', dirt: '#8b6e4a' },

  structure: {
    deck: '#8a5a33',
    plank: [158, 112, 70],
    nail: 'rgba(40,30,20,0.6)',
    edge: 'rgba(50,30,15,0.7)',
    post: '#4a3020',
    rail: '#5b3c22',
    shadow: 'rgba(0,25,35,0.32)',
  },

  reed: { blade: '#6f9c4a', dark: '#4c7a33', head: '#6b4423' },

  hotspot: { glow: 'rgba(255,230,140,', ring: 'rgba(255,240,170,0.6)', fish: 'rgba(10,30,40,0.45)', bubble: 'rgba(230,250,255,0.8)' },

  aim: { line: 'rgba(255,255,255,0.75)', bad: '#ff6b6b', pill: 'rgba(0,0,0,0.55)' },

  areaLabel: { font: '800 34px system-ui, sans-serif', color: 'rgba(255,255,255,0.88)', outline: 'rgba(30,40,30,0.55)' },
  minimap: { border: 'rgba(255,255,255,0.35)', view: 'rgba(255,255,255,0.85)', hotspot: '#ffe066' },

  splash: 'rgba(255,255,255,0.85)',
  floatFont: '800 13px system-ui, sans-serif',
};
