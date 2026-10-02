// Every visual constant lives here. Swapping colours, sizes or (later) sprite
// sheets should only touch this file and renderer.js — never game logic.

export const THEME = {
  background: '#1d2b1f',

  water: '#2f6f8f',
  waterHighlight: 'rgba(255,255,255,0.06)',
  // Optional tint per water zone id (drawn over the base water colour).
  zoneTint: {
    deep: 'rgba(8, 30, 60, 0.45)',
    reeds: 'rgba(60, 110, 60, 0.18)',
    rocks: 'rgba(30, 40, 60, 0.2)',
    dockShade: 'rgba(10, 30, 40, 0.22)',
    shallows: 'rgba(120, 200, 210, 0.18)',
  },
  zoneLabel: 'rgba(255,255,255,0.18)',

  land: {
    sand: '#d9c48f',
    grass: '#4f7d3a',
    rock: '#7c7f86',
  },
  shoreEdge: 'rgba(255,255,255,0.25)',

  dock: '#8a5a33',
  dockPlank: '#6e4526',

  reed: '#6f9c4a',
  tree: '#2f5a2a',
  treeDark: '#24461f',
  stone: '#5f6269',

  hotspot: 'rgba(255, 240, 160, 0.55)',
  hotspotFill: 'rgba(255, 240, 160, 0.08)',

  player: {
    radius: 12,
    outline: 'rgba(0,0,0,0.55)',
    selfRing: '#ffffff',
    rod: '#3b2a1a',
    rodLength: 22,
  },
  name: { font: '600 12px system-ui, sans-serif', color: '#ffffff', shadow: 'rgba(0,0,0,0.7)' },

  line: 'rgba(255,255,255,0.65)',
  bobberTop: '#e63946',
  bobberBottom: '#f1faee',
  bobberRadius: 5,

  aim: 'rgba(255,255,255,0.5)',
  aimBad: '#ff6b6b',
  aimFont: '600 12px system-ui, sans-serif',

  bars: {
    width: 56,
    height: 6,
    back: 'rgba(0,0,0,0.55)',
    progress: '#7bd389',
    tension: '#ff6b6b',
    tensionSafe: '#f9c74f',
  },

  splash: 'rgba(255,255,255,0.8)',
  floatFont: '700 14px system-ui, sans-serif',
};
