// Fishing state machine for a single player's line. Server-side only.
//
// idle -> casting -> waiting -> bite -> reeling -> (catch | snap | escape) -> idle
//
// Every function takes a `ctx` (the Game) that provides: world, rng(),
// hotspotAt(x, y), countBobbersNear(player, x, y, r), emitTo(player, ev),
// emitAll(ev), profileChanged(player), checkAchievements(player).
//
// Tackle modifies the line through `player.stats` (see computeStats in
// shared/gear.js): castRange, lineStrength, reelSpeed, drag, biteSpeed,
// rareBoost and affinity (specialist bonuses for some fish).

import {
  BITE_WINDOW,
  CAST_FLIGHT_TIME,
  CROWD_RADIUS,
  FishingState,
  castDistance,
} from '../shared/constants.js';
import { SPECIES, STRENGTH_TIERS, fishDifficulty, scoreCatch, strengthTier } from '../shared/fish.js';
import { affinityFor } from '../shared/gear.js';
import { areaAt } from '../shared/world.js';
import { HISTORY_LIMIT } from './profiles.js';
import { zoneAt } from '../shared/world.js';

const { IDLE, CASTING, WAITING, BITE, REELING } = FishingState;

// How much a hotspot multiplies the odds of each rarity.
const HOTSPOT_RARITY_BOOST = { junk: 0.3, common: 1, uncommon: 1.5, rare: 3, legendary: 4 };
const HOTSPOT_BITE_BOOST = 1.8;
const HOTSPOT_SCORE_BONUS = 1.25;
const CROWD_PENALTY = 0.6; // each nearby bobber adds this much to the wait divisor

export function newLine() {
  return { state: IDLE };
}

function resetLine(player) {
  player.line = newLine();
}

function zoneById(world, id) {
  return world.zones.find((z) => z.id === id);
}

export function tryCast(ctx, player, angle, power) {
  if (player.line.state !== IDLE) return;
  if (!Number.isFinite(angle) || !Number.isFinite(power)) return;

  const dist = castDistance(power, player.stats.castRange);
  const x = player.x + Math.cos(angle) * dist;
  const y = player.y + Math.sin(angle) * dist;
  player.facing = angle;

  const zone = zoneAt(ctx.world, x, y);
  if (!zone) {
    ctx.emitTo(player, { kind: 'castFail', message: 'Your cast landed on dry ground. Aim for the water.' });
    return;
  }
  player.line = { state: CASTING, x, y, timer: CAST_FLIGHT_TIME, zoneId: zone.id };
}

export function hook(ctx, player) {
  const line = player.line;
  if (line.state !== BITE) return;
  const fight = fishDifficulty(line.fish.species, line.fish.kg);
  Object.assign(line, {
    state: REELING,
    progress: 0.1 + 0.07 * Math.min(fight, 2), // weak fish start further out, so even they need reeling in
    tension: 0,
    reeling: false,
    pulling: false,
    pullTimer: 0.5 + ctx.rng(),
    fight, // difficulty: rarity x size (see fishDifficulty)
    tier: strengthTier(fight),
    reelSpeed: player.stats.reelSpeed,
    lineStrength: player.stats.lineStrength,
    drag: player.stats.drag,
  });
  ctx.emitTo(player, { kind: 'hooked', strength: STRENGTH_TIERS[strengthTier(fight)].label });
}

export function setReel(player, on) {
  if (player.line.state === REELING) player.line.reeling = !!on;
}

export function cancel(ctx, player) {
  if (player.line.state === IDLE) return;
  const wasFighting = player.line.state === REELING;
  resetLine(player);
  ctx.emitTo(player, { kind: 'info', message: wasFighting ? 'You let the fish go.' : 'You reel your line in.' });
}

export function updateLine(ctx, player, dt) {
  const line = player.line;
  switch (line.state) {
    case CASTING:
      line.timer -= dt;
      if (line.timer <= 0) land(ctx, player);
      break;
    case WAITING:
      line.timer -= dt;
      if (line.timer <= 0) bite(ctx, player);
      break;
    case BITE:
      line.timer -= dt;
      if (line.timer <= 0) {
        resetLine(player);
        ctx.emitTo(player, { kind: 'missed', message: 'Too slow, the fish stole your bait.' });
      }
      break;
    case REELING:
      fight(ctx, player, dt);
      break;
  }
}

function land(ctx, player) {
  const line = player.line;
  const zone = zoneById(ctx.world, line.zoneId);
  const hotspot = ctx.hotspotAt(line.x, line.y);
  const crowd = ctx.countBobbersNear(player, line.x, line.y, CROWD_RADIUS);

  const rate = (zone.biteRate * player.stats.biteSpeed * (hotspot ? HOTSPOT_BITE_BOOST : 1))
    / (1 + CROWD_PENALTY * crowd);
  line.state = WAITING;
  line.timer = (4 + ctx.rng() * 8) / rate;
  line.hotspot = !!hotspot;
  ctx.emitTo(player, { kind: 'landed', zone: zone.name, hotspot: !!hotspot, crowd });
}

function bite(ctx, player) {
  const line = player.line;
  const zone = zoneById(ctx.world, line.zoneId);
  const species = pickSpecies(ctx.rng, zone, line.hotspot, player.stats);
  const s = SPECIES[species];
  // Squared roll skews towards smaller fish; trophies are uncommon.
  const kg = s.minKg + (s.maxKg - s.minKg) * ctx.rng() ** 2;
  line.fish = { species, kg: Math.round(kg * 100) / 100 };
  line.state = BITE;
  line.timer = BITE_WINDOW;
  ctx.emitTo(player, { kind: 'bite' });
}

// Better bait shifts odds away from junk and towards rarer fish.
function baitBoost(rarity, rareBoost) {
  if (rarity === 'rare' || rarity === 'legendary') return rareBoost;
  if (rarity === 'uncommon') return (1 + rareBoost) / 2;
  if (rarity === 'junk') return 1 / rareBoost;
  return 1;
}

/** mods: tackle stats ({ rareBoost, affinity }); only those two are used here. */
export function pickSpecies(rng, zone, hotspot, mods = {}) {
  const rareBoost = mods.rareBoost ?? 1;
  const entries = Object.entries(zone.fish).map(([id, w]) => {
    const { rarity } = SPECIES[id];
    const boost = (hotspot ? HOTSPOT_RARITY_BOOST[rarity] : 1) * baitBoost(rarity, rareBoost) * affinityFor(mods, id);
    return [id, w * boost];
  });
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [id, w] of entries) {
    roll -= w;
    if (roll <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

// Reeling mini-game. The fish alternates between resting and pulling.
// Reeling while it pulls builds tension fast; release to let tension drop,
// but the fish swims away while you wait.
//
// `fight` (difficulty) scales everything: harder fish pull longer and more
// often, build tension faster, drag progress back further and come in slower.
// Tackle pushes back: line strength slows tension, reel speed adds progress,
// drag lets tension ease faster.
function fight(ctx, player, dt) {
  const line = player.line;
  const d = line.fight;
  const reelSpeed = line.reelSpeed ?? 1;
  const lineStrength = line.lineStrength ?? 1;
  const drag = line.drag ?? 1;

  line.pullTimer -= dt;
  if (line.pullTimer <= 0) {
    line.pulling = !line.pulling;
    line.pullTimer = line.pulling
      ? 0.4 + ctx.rng() * (0.5 + 0.45 * d)
      : (0.7 + ctx.rng() * 1.3) / (0.8 + 0.25 * d);
    // Big fish start each run with a sudden surge on the line.
    if (line.pulling) line.tension += (0.08 * Math.max(0, d - 1)) / lineStrength;
  }

  if (line.reeling) {
    // During a run, strong fish strip line even while you reel against them.
    line.progress += dt * (line.pulling ? 0.05 * reelSpeed - 0.03 * d : (0.18 / (0.6 + 0.4 * d) + 0.05 * Math.max(0, d - 1)) * reelSpeed);
    line.tension += (dt * (line.pulling ? 0.45 + 0.6 * d : 0.05 * (0.5 + 0.5 * d))) / lineStrength;
  } else {
    line.progress -= dt * (line.pulling ? 0.04 + 0.05 * d : 0.01);
    line.tension = Math.max(0, line.tension - dt * 0.7 * drag);
  }

  if (line.tension >= 1) {
    resetLine(player);
    player.profile.counters.snaps += 1;
    ctx.checkAchievements(player);
    ctx.profileChanged(player);
    ctx.emitAll({ kind: 'snap', playerId: player.id, name: player.name });
  } else if (line.progress >= 1) {
    landCatch(ctx, player);
  } else if (line.progress <= 0) {
    resetLine(player);
    ctx.emitTo(player, { kind: 'escape', message: 'The fish shook free and got away.' });
  }
}

function landCatch(ctx, player) {
  const { fish, hotspot, zoneId } = player.line;
  const s = SPECIES[fish.species];
  const points = scoreCatch(fish.species, fish.kg, hotspot ? HOTSPOT_SCORE_BONUS : 1);
  const zone = zoneById(ctx.world, zoneId);

  const profile = player.profile;
  profile.score += points;
  profile.coins += points;
  profile.catches += 1;
  if (!profile.best || points > profile.best.points) {
    profile.best = { species: fish.species, kg: fish.kg, points };
  }
  const entry = profile.index[fish.species];
  const isNew = !entry;
  profile.index[fish.species] = {
    count: (entry?.count ?? 0) + 1,
    bestKg: Math.max(entry?.bestKg ?? 0, fish.kg),
    firstAt: entry?.firstAt ?? Date.now(),
  };
  profile.history.unshift({ species: fish.species, kg: fish.kg, points, zone: zone.name, hotspot: !!hotspot, at: Date.now() });
  if (profile.history.length > HISTORY_LIMIT) profile.history.length = HISTORY_LIMIT;
  countCatch(ctx, player, fish, s, zone, hotspot, points);

  resetLine(player);
  ctx.checkAchievements(player);
  ctx.profileChanged(player);
  ctx.emitAll({
    kind: 'catch',
    playerId: player.id,
    name: player.name,
    species: fish.species,
    speciesName: s.name,
    rarity: s.rarity,
    kg: fish.kg,
    points,
    zone: zone.name,
    hotspot: !!hotspot,
    isNew,
  });
}

/** Lifetime counters that achievements measure. */
function countCatch(ctx, player, fish, species, zone, hotspot, points) {
  const c = player.profile.counters;
  const bump = (group, key) => { c[group][key] = (c[group][key] || 0) + 1; };
  c.catches += 1;
  c.coinsEarned += points;
  if (hotspot) c.hotspotCatches += 1;
  if (species.rarity === 'legendary') c.legendaryCatches += 1;
  if (fish.kg >= 10) c.bigFish += 1;
  c.heaviest = Math.max(c.heaviest, fish.kg);
  bump('family', species.family);
  bump('zone', zone.id);
  const area = areaAt(ctx.world, player.x, player.y);
  if (area) bump('area', area.id);
}
