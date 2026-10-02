// Fishing state machine for a single player's line. Server-side only.
//
// idle -> casting -> waiting -> bite -> reeling -> (catch | snap | escape) -> idle
//
// Every function takes a `ctx` (the Game) that provides: world, rng(),
// hotspotAt(x, y), countBobbersNear(player, x, y, r), emitTo(player, ev),
// emitAll(ev), profileChanged(player).
//
// Gear modifies the line through `player.stats` (see shared/gear.js):
// castRange, lineStrength, reelSpeed, biteSpeed, rareBoost.

import {
  BITE_WINDOW,
  CAST_FLIGHT_TIME,
  CROWD_RADIUS,
  FishingState,
  castDistance,
} from '../shared/constants.js';
import { SPECIES, scoreCatch } from '../shared/fish.js';
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
  const s = SPECIES[line.fish.species];
  const sizeFrac = (line.fish.kg - s.minKg) / Math.max(0.0001, s.maxKg - s.minKg);
  Object.assign(line, {
    state: REELING,
    progress: 0.25,
    tension: 0,
    reeling: false,
    pulling: false,
    pullTimer: 0.5 + ctx.rng(),
    fight: Math.min(1, s.fight * (0.85 + 0.3 * sizeFrac)),
    reelSpeed: player.stats.reelSpeed,
    lineStrength: player.stats.lineStrength,
  });
  ctx.emitTo(player, { kind: 'hooked' });
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
  const species = pickSpecies(ctx.rng, zone, line.hotspot, player.stats.rareBoost);
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

export function pickSpecies(rng, zone, hotspot, rareBoost = 1) {
  const entries = Object.entries(zone.fish).map(([id, w]) => {
    const { rarity } = SPECIES[id];
    const boost = (hotspot ? HOTSPOT_RARITY_BOOST[rarity] : 1) * baitBoost(rarity, rareBoost);
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
function fight(ctx, player, dt) {
  const line = player.line;
  const f = line.fight;
  const reelSpeed = line.reelSpeed ?? 1;
  const lineStrength = line.lineStrength ?? 1;

  line.pullTimer -= dt;
  if (line.pullTimer <= 0) {
    line.pulling = !line.pulling;
    line.pullTimer = line.pulling ? 0.4 + ctx.rng() * (0.6 + f) : 0.6 + ctx.rng() * 1.4;
  }

  if (line.reeling) {
    line.progress += dt * (line.pulling ? 0.05 : 0.32 - 0.12 * f) * reelSpeed;
    line.tension += (dt * (line.pulling ? 0.35 + 0.9 * f : 0.08)) / lineStrength;
  } else {
    line.progress -= dt * (line.pulling ? 0.04 + 0.12 * f : 0.015);
    line.tension = Math.max(0, line.tension - dt * 0.7);
  }

  if (line.tension >= 1) {
    resetLine(player);
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

  resetLine(player);
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
