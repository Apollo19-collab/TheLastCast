// Fishing state machine for a single player's line. Server-side only.
//
// idle -> casting -> waiting -> bite -> reeling -> (catch | snap | escape) -> idle
//
// Every function takes a `ctx` (the Game) that provides: world, rng(),
// hotspotAt(x, y), countBobbersNear(player, x, y, r), emitTo(player, ev),
// emitAll(ev), profileChanged(player), checkAchievements(player),
// castBlocked(player), mods (special-event modifiers at sea), duels and hooks.
//
// Fish caught in a duel go to the duel's scoreboard instead of the profile
// (see duel.js).
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
  COINS_PER_POINT,
} from '../shared/constants.js';
import { SPECIES, STRENGTH_TIERS, fishDifficulty, scoreCatch, strengthTier } from '../shared/fish.js';
import { affinityFor } from '../shared/gear.js';
import { CABINET_LIMIT, GIANT_FIGHT, TROPHY_TIERS, kgFromRoll, trophyName, trophyTier } from '../shared/trophies.js';
import { NO_ARMOUR } from '../shared/armour.js';
import { areaAt } from '../shared/world.js';
import { HISTORY_LIMIT } from './profiles.js';
import { zoneAt } from '../shared/world.js';

const { IDLE, CASTING, WAITING, BITE, REELING } = FishingState;

// How much a hotspot multiplies the odds of each rarity.
const HOTSPOT_RARITY_BOOST = { junk: 0.3, common: 1, uncommon: 1.5, rare: 3, legendary: 4, mythic: 4 };
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
  // At sea the zone changes from stop to stop; fall back to the current one.
  return world.zones.find((z) => z.id === id) ?? world.zones[0];
}

export function tryCast(ctx, player, angle, power) {
  if (player.line.state !== IDLE) return;
  if (!Number.isFinite(angle) || !Number.isFinite(power)) return;
  const blocked = ctx.castBlocked?.(player);
  if (blocked) {
    ctx.emitTo(player, { kind: 'castFail', message: blocked });
    return;
  }

  const dist = castDistance(power, player.stats.castRange + armourOf(ctx, player).castRange);
  const x = player.x + Math.cos(angle) * dist;
  const y = player.y + Math.sin(angle) * dist;
  player.facing = angle;

  const zone = zoneAt(ctx.world, x, y);
  if (!zone) {
    ctx.emitTo(player, { kind: 'castFail', message: ctx.world.castFail ?? 'Your cast landed on dry ground. Aim for the water.' });
    return;
  }
  player.line = { state: CASTING, x, y, timer: CAST_FLIGHT_TIME, zoneId: zone.id };
}

export function hook(ctx, player) {
  const line = player.line;
  if (line.state !== BITE) return;
  const mods = ctx.mods ?? {};
  const giant = trophyTier(line.fish.species, line.fish.kg) === 'giant';
  const fight = fishDifficulty(line.fish.species, line.fish.kg) * (mods.fight ?? 1) * armourOf(ctx, player).fight * (giant ? GIANT_FIGHT : 1);
  Object.assign(line, {
    state: REELING,
    progress: 0.1 + 0.07 * Math.min(fight, 2), // weak fish start further out, so even they need reeling in
    tension: 0,
    reeling: false,
    pulling: false,
    pullTimer: 0.5 + ctx.rng(),
    fight, // difficulty: rarity x size (see fishDifficulty)
    tier: strengthTier(fight),
    reelSpeed: player.stats.reelSpeed * (mods.reelSpeed ?? 1) * armourOf(ctx, player).reel,
    lineStrength: player.stats.lineStrength / ((mods.tension ?? 1) * armourOf(ctx, player).tension),
    drag: player.stats.drag,
  });
  ctx.emitTo(player, { kind: 'hooked', strength: STRENGTH_TIERS[strengthTier(fight)].label, ...(giant ? { giant: true } : {}) });
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
  const ev = ctx.eventMods?.(player, line.x, line.y) ?? null; // map events (shared/events.js)
  // In a Feeding Shoal, company helps instead of crowding.
  const crowd = ev?.ignoreCrowd ? 0 : ctx.countBobbersNear(player, line.x, line.y, CROWD_RADIUS);

  const armour = armourOf(ctx, player);
  const zoneArmour = armour.zoneBites.reduce((m, z) => (z.zones.includes(zone.kind ?? zone.id) ? m * z.mult : m), 1);
  const rate = (zone.biteRate * player.stats.biteSpeed * (hotspot ? HOTSPOT_BITE_BOOST : 1) * (ctx.mods?.biteSpeed ?? 1)
    * armour.bite * zoneArmour * (ctx.chumBiteBonus?.(line.x, line.y) ?? 1) * (ev?.bite ?? 1))
    / (1 + (ctx.world.crowdPenalty ?? CROWD_PENALTY) * crowd);
  line.state = WAITING;
  line.timer = (4 + ctx.rng() * 8) / rate;
  line.hotspot = !!hotspot;
  ctx.emitTo(player, { kind: 'landed', zone: zone.name, hotspot: !!hotspot, crowd });
  ctx.hooks?.onLand?.(player, line);
}

function bite(ctx, player) {
  const line = player.line;
  const zone = zoneById(ctx.world, line.zoneId);
  const mods = ctx.mods ?? {};
  const armour = armourOf(ctx, player);
  const ev = ctx.eventMods?.(player, line.x, line.y) ?? null;
  const species = pickSpecies(ctx.rng, zone, line.hotspot, {
    rareBoost: player.stats.rareBoost * (mods.rareBoost ?? 1) * armour.rare * (ev?.rare ?? 1),
    legendaryBoost: armour.legendary,
    mythicBoost: armour.mythic,
    affinity: mergeAffinity(player.stats.affinity, armour.affinity),
  }, mods.extraFish);
  ctx.useBait?.(player); // the fish took one bait, whether or not you hook it
  line.fish = { species, kg: rollKg(ctx.rng, species, armour.weight) };
  line.state = BITE;
  line.timer = BITE_WINDOW + armour.biteWindow;
  ctx.emitTo(player, { kind: 'bite' });
}

/** Tackle specialties times a pet's (affinities multiply). */
function mergeAffinity(a, b) {
  if (!b) return a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 1) * v;
  return out;
}

/** Armour and pet bonuses for a player (none in plain test contexts). */
function armourOf(ctx, player) {
  return ctx.armourOf?.(player) ?? NO_ARMOUR;
}

/**
 * A fish's weight. The squared roll skews towards smaller fish, so trophies
 * are uncommon and giants rare (see shared/trophies.js); `weight` > 1 (Trophy
 * Hunter armour) shifts it towards bigger fish.
 */
export function rollKg(rng, speciesId, weight = 1) {
  return kgFromRoll(speciesId, rng() ** (2 / weight));
}

// Better bait shifts odds away from junk and towards rarer fish.
function baitBoost(rarity, rareBoost) {
  if (rarity === 'rare' || rarity === 'legendary' || rarity === 'mythic') return rareBoost;
  if (rarity === 'uncommon') return (1 + rareBoost) / 2;
  if (rarity === 'junk') return 1 / rareBoost;
  return 1;
}

/**
 * mods: tackle stats ({ rareBoost, affinity }); only those two are used here.
 * extraFish: { speciesId: weight } added to the zone's fish (special events).
 */
export function pickSpecies(rng, zone, hotspot, mods = {}, extraFish = null) {
  const rareBoost = mods.rareBoost ?? 1;
  const fish = extraFish ? { ...zone.fish, ...extraFish } : zone.fish;
  const entries = Object.entries(fish).map(([id, w]) => {
    const { rarity } = SPECIES[id];
    const special = rarity === 'legendary' ? mods.legendaryBoost ?? 1 : rarity === 'mythic' ? mods.mythicBoost ?? 1 : 1;
    const boost = (hotspot ? HOTSPOT_RARITY_BOOST[rarity] : 1) * baitBoost(rarity, rareBoost) * affinityFor(mods, id) * special;
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
    line.progress -= dt * (line.pulling ? 0.04 + 0.05 * d : 0.01) * armourOf(ctx, player).hold;
    line.tension = Math.max(0, line.tension - dt * 0.7 * drag);
  }

  if (line.tension >= 1 && !line.saved && ctx.rng() < armourOf(ctx, player).snapSave) {
    // Stormbreaker armour: the line holds, once per fight.
    line.saved = true;
    line.tension = 0.55;
    ctx.emitTo(player, { kind: 'lineHeld', message: 'Second Wind! Your line held on.' });
  }
  if ((line.tension >= 1 || line.progress <= 0) && !player.duel && ctx.rng() < armourOf(ctx, player).rescue) {
    // Celestial Peacock: the fish is caught anyway.
    ctx.emitTo(player, { kind: 'petRescue', message: 'Second Life! Your pet saved the fish.' });
    line.progress = 1;
    line.tension = 0;
  }
  if (line.tension >= 1) {
    resetLine(player);
    if (!player.duel) {
      player.profile.counters.snaps += 1;
      ctx.checkAchievements(player);
      ctx.profileChanged(player);
    }
    ctx.emitAll({ kind: 'snap', playerId: player.id, name: player.name });
  } else if (line.progress >= 1) {
    landCatch(ctx, player);
  } else if (line.progress <= 0) {
    resetLine(player);
    ctx.emitTo(player, { kind: 'escape', message: 'The fish shook free and got away.' });
  }
}

function landCatch(ctx, player) {
  const { fish, hotspot, zoneId, x, y } = player.line;
  const s = SPECIES[fish.species];
  const event = ctx.mods?.event ?? null; // a special event at sea is on
  const zone = zoneById(ctx.world, zoneId);

  if (player.duel) {
    // Duel catches only count on the duel scoreboard: no coins, score or index.
    const points = scoreCatch(fish.species, fish.kg, (hotspot ? HOTSPOT_SCORE_BONUS : 1) * (ctx.mods?.points ?? 1));
    resetLine(player);
    ctx.duels.recordCatch(player, points);
    ctx.emitAll({
      kind: 'catch', playerId: player.id, name: player.name, species: fish.species, speciesName: s.name,
      rarity: s.rarity, kg: fish.kg, points, zone: zone.name, hotspot: !!hotspot, isNew: false, duel: true,
    });
    return;
  }

  resetLine(player);
  const armour = armourOf(ctx, player);
  rewardCatch(ctx, player, fish, { hotspot, zone, event, armour, bonus: false, x, y });
  // Armour set effect: a second fish of the same kind on the line.
  if (armour.double && ctx.rng() < armour.double) {
    const extra = { species: fish.species, kg: rollKg(ctx.rng, fish.species, armour.weight) };
    rewardCatch(ctx, player, extra, { hotspot, zone, event, armour, bonus: true, x, y });
  }
  ctx.checkAchievements(player);
  ctx.profileChanged(player);
}

/** Score, coins, XP, Fish Index and history for one landed fish. */
function rewardCatch(ctx, player, fish, { hotspot, zone, event, armour, bonus, x, y }) {
  const s = SPECIES[fish.species];
  const atSea = ctx.kind === 'voyage';
  const ev = ctx.eventMods?.(player, x, y) ?? null; // e.g. a Golden Rush
  const tier = trophyTier(fish.species, fish.kg); // 'trophy', 'giant' or null
  const multiplier = (hotspot ? HOTSPOT_SCORE_BONUS * armour.hotspot : 1) * (ctx.mods?.points ?? 1) * (atSea ? armour.sea : 1) * (ev?.points ?? 1)
    * (tier ? TROPHY_TIERS[tier].points : 1);
  const points = scoreCatch(fish.species, fish.kg, multiplier);
  let coins = Math.round(points * COINS_PER_POINT * armour.coins);
  // Pets that dig up coins (Field Mouse, Raccoon, Pirate Parrot).
  if (armour.find && ctx.rng() < armour.find.chance) {
    const found = armour.find.min + Math.floor(ctx.rng() * (armour.find.max - armour.find.min + 1));
    coins += found;
    ctx.emitTo(player, { kind: 'petFind', coins: found });
  }
  const xp = Math.round(points * armour.xp);

  const profile = player.profile;
  profile.score += points;
  profile.coins += coins;
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
    ...(entry?.trophies || tier ? { trophies: (entry?.trophies ?? 0) + (tier ? 1 : 0) } : {}),
  };
  const trophy = tier ? landTrophy(ctx, player, fish, tier, zone) : undefined;
  profile.history.unshift({ species: fish.species, kg: fish.kg, points, zone: zone.name, hotspot: !!hotspot, at: Date.now() });
  if (profile.history.length > HISTORY_LIMIT) profile.history.length = HISTORY_LIMIT;
  countCatch(ctx, player, fish, s, zone, hotspot, coins);
  ctx.hooks?.onCatch?.(player, { species: fish.species, kg: fish.kg, rarity: s.rarity, points, event, hotspot: !!hotspot, x, y });
  ctx.chumCatch?.(player, s.rarity);
  ctx.gainXp?.(player, xp);

  ctx.emitAll({
    kind: 'catch',
    playerId: player.id,
    name: player.name,
    species: fish.species,
    speciesName: s.name,
    rarity: s.rarity,
    kg: fish.kg,
    points,
    coins,
    xp,
    zone: zone.name,
    hotspot: !!hotspot,
    isNew,
    event: event ? true : undefined,
    double: bonus || undefined,
    trophy,
  });
}

/** Name a trophy, put it in the angler's cabinet and enter it for the records. */
function landTrophy(ctx, player, fish, tier, zone) {
  const profile = player.profile;
  const name = trophyName(tier, profile.id, fish.species, fish.kg, profile.catches);
  const at = Date.now();
  (profile.trophies ??= []).unshift({ species: fish.species, kg: fish.kg, name, tier, zone: zone.name, at });
  if (profile.trophies.length > CABINET_LIMIT) {
    // Full: let the oldest ordinary trophy go (giants are kept for good).
    const drop = profile.trophies.findLastIndex((t) => t.tier !== 'giant');
    profile.trophies.splice(drop >= 0 ? drop : CABINET_LIMIT, 1);
  }
  const c = profile.counters;
  c.trophies = (c.trophies || 0) + 1;
  if (tier === 'giant') c.giants = (c.giants || 0) + 1;
  const record = ctx.records?.submit(profile, { species: fish.species, kg: fish.kg, name, tier, zone: zone.name }) ?? {};
  return { tier, name, ...(record.allTime != null ? { allTime: record.allTime } : {}), ...(record.weekly != null ? { weekly: record.weekly } : {}) };
}

/** Lifetime counters that achievements measure. */
function countCatch(ctx, player, fish, species, zone, hotspot, coins) {
  const c = player.profile.counters;
  const bump = (group, key) => { c[group][key] = (c[group][key] || 0) + 1; };
  c.catches += 1;
  c.coinsEarned += coins;
  if (hotspot) c.hotspotCatches += 1;
  if (species.rarity === 'legendary') c.legendaryCatches += 1;
  if (species.rarity === 'mythic') c.mythicCatches = (c.mythicCatches || 0) + 1;
  if (fish.kg >= 10) c.bigFish += 1;
  c.heaviest = Math.max(c.heaviest, fish.kg);
  bump('family', species.family);
  bump('zone', zone.kind ?? zone.id); // generated ponds count as their type
  const area = areaAt(ctx.world, player.x, player.y);
  if (area) bump('area', area.id);
}
