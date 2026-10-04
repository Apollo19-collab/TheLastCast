// DOM-based HUD: player panel, leaderboard, activity feed, status line, the
// menu (tackle, fish index, achievements, history, options, changelog), and
// the multiplayer bits: duel invites and scoreboard, the boat timer, the
// voyage panel, banners and results.

import { EVENT_TYPES, directionTo, eventsAround, shoalBite } from '/shared/events.js';
import { FAMILIES, RARITY, SPECIES } from '/shared/fish.js';
import { QUALITY, graphics } from './graphics.js';
import { BULK_PACKS, ITEMS, SLOTS, SLOT_LABELS, STARTER, baitCount, computeStats, isConsumable, itemsForSlot, packPrice, shopStock } from '/shared/gear.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, progressOf, unlocksFor } from '/shared/achievements.js';
import { CHANGELOG, VERSION } from '/shared/version.js';
import { BOSS, BOSSES, BOSS_ATTACKS, DECK_AREAS, SEA_EVENTS, SEA_LOCATIONS, seaLocationsFor } from '/shared/voyage.js';
import { DUEL } from '/shared/duel.js';
import { CHUM } from '/shared/chum.js';
import { PETS, PET_IDS, PET_RARITIES, petPrice } from '/shared/pets.js';
import { ARMOUR_SLOTS, ARMOUR_SLOT_LABELS, SETS, computeArmour } from '/shared/armour.js';
import { MAX_LEVEL, levelFor, levelProgress } from '/shared/levels.js';
import { TROPHY_TIERS, trophyKg, weeklyPrize } from '/shared/trophies.js';

const SLOT_ICONS = { head: '🎩', body: '🧥', legs: '👖', feet: '🥾' };

/** "+10% coins, bites 15% faster" for a computeArmour() result. */
function armourBonusText(a) {
  const pct = (v) => `${Math.round((v - 1) * 100)}%`;
  const parts = [];
  if (a.coins > 1) parts.push(`+${pct(a.coins)} coins`);
  if (a.xp > 1) parts.push(`+${pct(a.xp)} XP`);
  if (a.bite > 1) parts.push(`bites +${pct(a.bite)}`);
  if (a.rare > 1) parts.push(`rare odds +${pct(a.rare)}`);
  if (a.tension < 1) parts.push(`tension ${Math.round((1 - a.tension) * 100)}% slower`);
  if (a.reel > 1) parts.push(`reel +${pct(a.reel)}`);
  if (a.weight > 1) parts.push(`fish ${pct(a.weight)} bigger`);
  return parts.join(' · ');
}
import { VOLUME_CHANNELS } from './audio.js';
import { fishImageURL } from './gfx/fishArt.js';
import { gearIconURL } from './gfx/gearArt.js';

const $ = (id) => document.getElementById(id);
const MAX_FEED = 6;

/** Tiny DOM builder: h('div', { class: 'x' }, 'text', childEl). Text is never parsed as HTML. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') {
      for (const [prop, value] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, value); // CSS variables
        else el.style[prop] = value;
      }
    }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

/** Set an element's text only when it changed (avoids re-layout every frame). */
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

/** Replace an element's children, skipping null/false ones. */
function fill(el, ...children) {
  el.replaceChildren(...children.flat().filter((c) => c != null && c !== false));
}

function timeAgo(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const num = (n) => Math.round(n).toLocaleString();

/** 200000000 -> "2d 7h" (time left, in ms) */
function untilText(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}

const PLACES = ['🥇', '🥈', '🥉', '4th', '5th'];
const RARITY_ORDER = Object.keys(RARITY);

/** 125 -> "2:05" */
export function clock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "Trout & salmon ×1.8, Steelhead ×1.5" */
function affinityText(affinity) {
  // "Legendary fish ×1.6" rather than every legendary by name.
  const keys = Object.keys(affinity || {});
  const rarity = SPECIES[keys[0]]?.rarity;
  const all = rarity ? Object.keys(SPECIES).filter((id) => SPECIES[id].rarity === rarity) : [];
  if (keys.length > 3 && keys.length === all.length && keys.every((k) => SPECIES[k]?.rarity === rarity && affinity[k] === affinity[keys[0]])) {
    return `${RARITY[rarity].label} fish ×${affinity[keys[0]]}`;
  }
  return Object.entries(affinity || {})
    .map(([k, m]) => `${FAMILIES[k] || SPECIES[k]?.name || k} ×${Math.round(m * 100) / 100}`)
    .join(', ');
}

/** One line describing what an item does. */
function itemStats(it) {
  const parts = [];
  if (it.slot === 'rod') parts.push(`Cast ${it.range}`, `Power ×${it.power}`);
  if (it.slot === 'reel') parts.push(`Reel speed ×${it.speed}`);
  if (it.level) parts.push(`Level ${it.level}`);
  if (it.slot === 'line') parts.push(`Strength ×${it.strength}`);
  if (it.drag) parts.push(`Drag ×${it.drag}`);
  if (it.slot === 'bait') parts.push(`Bites ×${it.bite}`, `Rare odds ×${it.rare}`);
  else {
    if (it.bite) parts.push(`Bites ×${it.bite}`);
    if (it.rare) parts.push(`Rare odds ×${it.rare}`);
  }
  const aff = affinityText(it.affinity);
  if (aff) parts.push(`Favours ${aff}`);
  if (it.pack) parts.push(`${it.pack} uses per pack`);
  return parts.join(' · ');
}

export class UI {
  /**
   * world: location data (for fish-index hints). onBuy(itemId) / onEquip(itemId):
   * tackle callbacks. audio: the AudioEngine, for the Options tab.
   */
  constructor({ world, onBuy, onEquip = () => {}, audio }) {
    this.world = world;
    this.onBuy = onBuy;
    this.onEquip = onEquip;
    this.tackleSlot = 'rod';
    this.shopAccess = false; // standing at the Bait Shop (or at sea): bait can be bought
    this.storeHere = null; // the travelling tackle shop you're standing at, if any
    this.storeId = null; // the tackle shop whose window is open
    this.zooAccess = false; // standing at the Travelling Zoo
    this.zoo = null; // { stock, x, y, area, tl } from the latest lake snapshot
    for (const el of document.querySelectorAll('.version-label')) {
      el.textContent = `v${VERSION} · What's new`;
      el.addEventListener('click', () => this.openMenu('news'));
    }
    this.audio = audio;
    this.flashUntil = 0;
    this.lastBoard = '';
    this.profile = null;
    this.menuTab = null; // null when the menu is closed
    this.trophyView = 'cabinet'; // Trophies window: 'cabinet' or 'records'
    this.records = null; // the Hall of Records, as last sent by the server

    $('menu-close').addEventListener('click', () => this.closeMenu());
    for (const btn of document.querySelectorAll('[data-tab]')) {
      btn.addEventListener('click', () => this.openMenu(btn.dataset.tab));
    }
  }

  // ---- menu ----------------------------------------------------------------------

  get menuOpen() {
    return this.menuTab !== null;
  }

  openMenu(tab) {
    this.menuTab = tab;
    if (tab === 'trophies' && this.trophyView === 'records') this.onRecords?.();
    $('menu').hidden = false;
    for (const btn of document.querySelectorAll('#menu [data-tab]')) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    }
    this.renderMenu();
  }

  toggleMenu(tab) {
    if (this.menuTab === tab) this.closeMenu();
    else this.openMenu(tab);
  }

  closeMenu() {
    this.menuTab = null;
    $('menu').hidden = true;
    // Drop focus so Space casts instead of re-clicking a focused button.
    document.activeElement?.blur?.();
  }

  updateProfile(profile) {
    this.profile = profile;
    this.setBait(profile);
    this.setLevel(profile.xp);
    this.setPet(profile);
    if (this.menuTab === 'options') { this.setStats(profile); return; }
    $('me-coins').textContent = profile.coins;
    $('me-score').textContent = profile.score;
    $('me-catches').textContent = profile.catches;
    if (this.menuOpen) this.renderMenu();
  }

  renderMenu() {
    const body = $('menu-body');
    if (this.menuTab === 'options') { body.replaceChildren(...this.renderOptions()); return; }
    if (this.menuTab === 'news') { body.replaceChildren(...this.renderChangelog()); return; }
    if (this.menuTab === 'events') { body.replaceChildren(...this.renderEvents()); return; }
    if (!this.profile) { body.replaceChildren(h('p', {}, 'Join the lake to see this.')); return; }
    const scroll = body.scrollTop;
    const render = {
      gear: () => this.renderTackle(),
      index: () => this.renderIndex(),
      history: () => this.renderHistory(),
      achievements: () => this.renderAchievements(),
      armour: () => this.renderArmour(),
      pets: () => this.renderPets(),
      trophies: () => this.renderTrophies(),
      store: () => this.renderStore(),
    };
    body.replaceChildren(...[].concat(render[this.menuTab]()));
    body.scrollTop = scroll; // keep your place when the profile updates
  }

  // ---- map events -------------------------------------------------------------------

  /** Live map-event state from the lake snapshot, the server clock and where you are. */
  setMapEvents(we, serverNow, pos) {
    this.mapEvent = we ?? null;
    this.serverNow = serverNow;
    this.myPos = pos;
    // The Events window counts down live.
    const second = Math.floor(serverNow);
    if (this.menuTab === 'events' && second !== this.eventsSecond) {
      this.eventsSecond = second;
      this.renderMenu();
    }
  }

  /** The Events window: what's on now, and what's coming up. */
  renderEvents() {
    const world = this.lakeWorld;
    if (!world) return [h('p', { class: 'menu-note' }, 'Join the lake to see the map events.')];
    const now = this.serverNow ?? Date.now() / 1000;
    const { upcoming } = eventsAround(world, now, 6);
    const live = this.mapEvent;
    const where = (x, y) => (this.myPos ? directionTo(this.myPos.x, this.myPos.y, x, y) : '');
    const card = (type, place, title, extra) => {
      const T = EVENT_TYPES[type];
      return h('div', { class: 'event-card', style: { '--accent': T.color } },
        h('div', { class: 'event-icon' }, T.icon),
        h('div', { class: 'event-main' },
          h('div', { class: 'event-title' }, h('b', {}, T.name), ' · ', place),
          h('div', { class: 'event-when' }, title),
          extra ?? h('div', { class: 'event-desc' }, T.desc)));
    };
    const out = [h('p', { class: 'menu-note' }, 'Map events happen at a lake or pond every 10 minutes. They all go better with company: head over, fish together, and everyone who helps is rewarded.')];
    if (live) {
      out.push(h('h4', { class: 'option-heading' }, 'Happening now'));
      out.push(card(live.type, live.pn, `${clock(Math.max(0, live.end - now))} left · ${where(live.px, live.py)}`,
        h('div', { class: 'event-desc' }, this.mapEventProgress(live))));
    }
    out.push(h('h4', { class: 'option-heading' }, 'Coming up'));
    for (const ev of upcoming) {
      out.push(card(ev.type, ev.place.name, `in ${clock(Math.max(0, ev.start - now))} · lasts ${Math.round(EVENT_TYPES[ev.type].duration / 60)} min · ${where(ev.place.x, ev.place.y)}`));
    }
    return out;
  }

  /** One line of progress for a live event. */
  mapEventProgress(we) {
    if (we.type === 'haul') return `Crew catch: ${we.pg} / ${we.gl} fish · ${we.n} angler${we.n === 1 ? '' : 's'} helping`;
    if (we.type === 'tide') return we.ru ? `GOLDEN RUSH! Double points for ${we.ru}s` : `Golden meter: ${Math.round((we.pg / we.gl) * 100)}% · ${we.n} angler${we.n === 1 ? '' : 's'} helping`;
    const n = we.in ?? 1;
    return `${n} angler${n === 1 ? '' : 's'} fishing the shoal: bites ${Math.round(shoalBite(n) * 100)}% as fast · bring friends for more!`;
  }

  /** The live event panel (top of the screen) while an event is on and you're not in a duel. */
  mapEventPanel(we, me) {
    const el = $('event-panel');
    if (!we) { this.hidePanel('mapEvent'); return; }
    if (this.panelKind && this.panelKind !== 'mapEvent') return; // a duel panel takes priority
    const T = EVENT_TYPES[we.type];
    const now = this.serverNow ?? Date.now() / 1000;
    const left = Math.max(0, Math.ceil(we.end - now));
    const dist = me ? directionTo(me.x, me.y, we.px, we.py) : '';
    const frac = we.gl ? Math.min(1, we.pg / we.gl) : 0;
    const key = `ev|${we.id}|${we.pg}|${we.gl}|${we.ru}|${we.n}|${we.in}|${left}|${dist}`;
    if (this.panelKey === key) return;
    this.panelKey = key;
    this.panelKind = 'mapEvent';
    el.className = `panel event-panel map-event${we.ru ? ' rush' : ''}`;
    el.style.setProperty('--accent', T.color);
    fill(el,
      h('div', { class: 'ep-head' }, h('span', { class: 'ep-title' }, `${T.icon} ${T.name}`), h('span', { class: 'ep-time' }, clock(left))),
      h('div', { class: 'ep-note' }, `${we.pn}${dist === 'here' ? ' · you are here!' : ` · ${dist}`}`),
      we.type !== 'shoal' ? h('div', { class: 'boss-bar event-bar' }, h('div', { style: { width: `${(we.ru ? 1 : frac) * 100}%` } }),
        h('span', {}, we.type === 'haul' ? `${we.pg} / ${we.gl} fish` : we.ru ? `RUSH ${we.ru}s` : `${Math.round(frac * 100)}%`)) : null,
      h('div', { class: 'ep-stats' }, this.mapEventProgress(we)));
    el.hidden = false;
  }

  /** "Next event" line on your player card. */
  setEventLine(text, live = false) {
    const el = $('event-line');
    if (!el) return;
    setText(el, text);
    el.classList.toggle('live', live);
  }

  setStats(profile) {
    $('me-coins').textContent = profile.coins;
    $('me-score').textContent = profile.score;
    $('me-catches').textContent = profile.catches;
  }

  renderOptions() {
    const { audio } = this;
    const sliders = Object.entries(VOLUME_CHANNELS).map(([channel, label]) => {
      const value = h('span', { class: 'option-value' }, `${audio.volume[channel]}%`);
      const input = h('input', {
        type: 'range', min: 0, max: 100, step: 1, value: audio.volume[channel], 'aria-label': `${label} volume`,
        oninput: (e) => {
          audio.setVolume(channel, e.target.value);
          value.textContent = `${audio.volume[channel]}%`;
        },
      });
      return h('label', { class: 'option-row' }, h('span', { class: 'option-label' }, label), input, value);
    });
    const mute = h('input', {
      type: 'checkbox', checked: audio.muted,
      onchange: () => { this.setSoundButton(audio.toggleMute()); mute.checked = audio.muted; },
    });
    this.optionsMute = mute;
    const quality = h('div', { class: 'slot-tabs graphics-levels', role: 'radiogroup', 'aria-label': 'Graphics quality' },
      Object.entries(QUALITY).map(([level, q]) => h('button', {
        class: graphics.level === level ? 'active' : '',
        role: 'radio',
        'aria-checked': String(graphics.level === level),
        onclick: () => { graphics.set(level); this.renderMenu(); },
      }, q.label)));
    return [
      h('h4', { class: 'option-heading' }, 'Graphics'),
      quality,
      h('p', { class: 'menu-note graphics-note' }, graphics.settings.desc),
      h('h4', { class: 'option-heading' }, 'Sound'),
      ...sliders,
      h('label', { class: 'option-row option-check' }, mute, h('span', {}, 'Mute all sound '), h('kbd', {}, 'M')),
      h('h4', { class: 'option-heading' }, 'Controls'),
      h('table', { class: 'controls' }, h('tbody', {}, [
        ['Move', 'WASD / arrow keys'],
        ['Sprint', 'Hold Shift while moving (uses stamina)'],
        ['Aim', 'Mouse'],
        ['Cast', 'Hold Space or left mouse, release to cast'],
        ['Hook', 'Space / click when the bobber dips'],
        ['Reel', 'Hold; release when the fish pulls'],
        ['Reel in', 'Esc or right-click'],
        ['Interact', 'E: open the Bait Shop, board the boat, or challenge a nearby angler to a duel'],
        ['Duels', 'Y accept · N decline a challenge'],
        ['Chum', 'C: put a chum bucket down (buy them at the Bait Shop)'],
        ['Pets', 'P: your pets · E at the Travelling Zoo to adopt one'],
        ['Menus', 'G tackle · R armour · P pets · I fish index · H history · K trophies & records · T achievements · V events · O options'],
        ['Sound', 'M mute'],
      ].map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v))))),
    ];
  }

  // ---- tackle: loadout + every item, equip / buy / locked -----------------------

  renderTackle() {
    const p = this.profile;
    const stats = computeStats(p.equipped);
    const owned = new Set(p.inventory);
    const loadout = h('div', { class: 'loadout' }, SLOTS.map((slot) => {
      const id = p.equipped[slot];
      return h('button', {
        class: `loadout-slot${slot === this.tackleSlot ? ' active' : ''}`,
        onclick: () => { this.tackleSlot = slot; this.renderMenu(); },
      },
      h('img', { src: gearIconURL(id), alt: '' }),
      h('span', { class: 'loadout-label' }, SLOT_LABELS[slot].split(' ')[0]),
      h('span', { class: 'loadout-name' }, ITEMS[id].name),
      isConsumable(id) ? h('span', { class: 'loadout-count' }, `×${baitCount(p, id)}`) : null);
    }));
    const aff = affinityText(stats.affinity);
    const summary = h('div', { class: 'loadout-stats' },
      `Cast ${stats.castRange} · Line strength ×${stats.lineStrength} · Reel ×${stats.reelSpeed} · Drag ×${stats.drag}`
      + ` · Bites ×${stats.biteSpeed} · Rare odds ×${stats.rareBoost}`,
      aff ? h('div', {}, `Specialties: ${aff}`) : null);

    const list = itemsForSlot(this.tackleSlot).sort((a, b) => a.price - b.price).map((it) => {
      if (it.slot === 'bait') return this.baitRow(it);
      let action;
      if (p.equipped[it.slot] === it.id) action = h('span', { class: 'tag equipped' }, 'Equipped');
      else if (owned.has(it.id)) action = h('button', { class: 'btn', onclick: () => this.onEquip(it.id) }, 'Equip');
      else if (it.shop) action = this.storeBuy(it);
      else if (it.unlock && !p.achievements[it.unlock]) {
        const a = ACHIEVEMENT_BY_ID[it.unlock];
        const pr = progressOf(p, a);
        action = h('div', { class: 'locked' },
          h('div', {}, '🔒 ', h('b', {}, a.name)),
          h('div', { class: 'bar small' }, h('div', { style: { width: `${pr.fraction * 100}%` } })),
          h('div', { class: 'locked-progress' }, `${num(pr.value)} / ${num(pr.goal)}${a.unit ? ` ${a.unit}` : ''}`));
      } else {
        action = h('button', { class: 'btn buy', disabled: p.coins < it.price, onclick: () => this.onBuy(it.id) }, `Buy · ${num(it.price)}`);
      }
      return h('div', { class: `item-row${owned.has(it.id) ? ' owned' : ''}` },
        h('img', { class: 'gear-icon', src: gearIconURL(it.id), alt: '' }),
        h('div', { class: 'item-text' },
          h('div', { class: 'item-name' }, it.name),
          h('div', { class: 'item-desc' }, it.desc),
          h('div', { class: 'gear-stats' }, itemStats(it))),
        action);
    });

    const baitNote = this.tackleSlot !== 'bait' ? null
      : this.shopAccess
        ? h('p', { class: 'shop-note open' }, '🪱 Bait Shop: buy packs here. Each bite uses one; Bread Crumbs are free and never run out.')
        : h('p', { class: 'shop-note' }, '🪱 Bait and lures are used up, one per bite. Buy more at the Bait Shop on South Beach (or from the deckhand on a voyage).');
    const chumRow = this.tackleSlot === 'bait' ? this.chumRow() : null;
    return [
      h('p', { class: 'menu-note' }, h('b', {}, `${num(p.coins)} coins`), '. Mix and match: equip any rod, reel, line and bait you own.'),
      loadout,
      summary,
      this.storeList(),
      h('div', { class: 'slot-tabs' }, SLOTS.map((slot) => h('button', {
        class: slot === this.tackleSlot ? 'active' : '',
        onclick: () => { this.tackleSlot = slot; this.renderMenu(); },
      }, SLOT_LABELS[slot]))),
      baitNote,
      chumRow,
      ...list,
    ].filter(Boolean);
  }

  /** Chum buckets at the top of the bait list. */
  chumRow() {
    const p = this.profile;
    const actions = [];
    if (p.chum > 0) actions.push(h('button', { class: 'btn', onclick: () => { this.onChum?.(); this.closeMenu(); } }, 'Put one down (C)'));
    if (this.shopAccess) {
      for (const n of [1, 5]) {
        const price = CHUM.price * n;
        actions.push(h('button', { class: 'btn buy', disabled: p.coins < price || p.chum + n > CHUM.maxOwned, onclick: () => this.onBuy('chum', n) },
          `Buy ${n} · ${num(price)}c`));
      }
    }
    return h('div', { class: `item-row${p.chum > 0 ? ' owned' : ''}` },
      h('div', { class: 'gear-icon chum-icon' }, '🪣'),
      h('div', { class: 'item-text' },
        h('div', { class: 'item-name' }, 'Chum Bucket', h('span', { class: 'bait-count' }, ` · ${p.chum || 0} in your bag`)),
        h('div', { class: 'item-desc' }, 'Put it down near the water. Fish you land close to it can turn into random bait: rarer fish give better bait. The chum also makes everyone\'s bites nearby 15% faster.'),
        h('div', { class: 'gear-stats' }, `Lasts ${CHUM.duration / 60} minutes or ${CHUM.maxFish} fish · ${num(CHUM.price)} coins each · One out at a time · Packed away if you leave`)),
      h('div', { class: 'bait-actions' }, actions));
  }

  /** One bait in the Tackle menu: how many you have, equip, and buy (at the shop). */
  baitRow(it) {
    const p = this.profile;
    const count = baitCount(p, it.id);
    const free = it.id === STARTER.bait;
    const locked = it.unlock && !p.achievements[it.unlock];
    const actions = [];
    if (p.equipped.bait === it.id) actions.push(h('span', { class: 'tag equipped' }, 'Equipped'));
    else if (count > 0) actions.push(h('button', { class: 'btn', onclick: () => this.onEquip(it.id) }, 'Equip'));
    if (locked) {
      const a = ACHIEVEMENT_BY_ID[it.unlock];
      const pr = progressOf(p, a);
      actions.push(h('div', { class: 'locked' },
        h('div', {}, '🔒 ', h('b', {}, a.name)),
        h('div', { class: 'bar small' }, h('div', { style: { width: `${pr.fraction * 100}%` } })),
        h('div', { class: 'locked-progress' }, `${num(pr.value)} / ${num(pr.goal)}${a.unit ? ` ${a.unit}` : ''}`)));
    } else if (it.shop && (this.storeHere !== it.shop || levelFor(p.xp) < it.level)) {
      actions.push(this.storeBuy(it));
    } else if (!free && (it.shop ? this.storeHere === it.shop : this.shopAccess)) {
      for (const packs of [1, BULK_PACKS]) {
        const price = packPrice(it.id, packs);
        actions.push(h('button', { class: 'btn buy', disabled: p.coins < price, onclick: () => this.onBuy(it.id, packs) },
          `Buy ${it.pack * packs} · ${num(price)}c`));
      }
    }
    return h('div', { class: `item-row${count > 0 ? ' owned' : ''}` },
      h('img', { class: 'gear-icon', src: gearIconURL(it.id), alt: '' }),
      h('div', { class: 'item-text' },
        h('div', { class: 'item-name' }, it.name, h('span', { class: 'bait-count' }, free ? ' · free, endless' : ` · ${count} left`)),
        h('div', { class: 'item-desc' }, it.desc),
        h('div', { class: 'gear-stats' }, itemStats(it)),
        !free && !locked ? h('div', { class: 'gear-stats' }, `${num(it.price)} coins per pack · ${num(packPrice(it.id, BULK_PACKS))} for ${BULK_PACKS} packs`) : null),
      h('div', { class: 'bait-actions' }, actions));
  }

  /** Open the Bait Shop (the Tackle menu's bait tab, with buying enabled). */
  openShop() {
    this.tackleSlot = 'bait';
    this.shopAccess = true;
    this.openMenu('gear');
  }

  /** Open a travelling tackle shop's window. */
  openStore(shopId) {
    this.storeId = shopId;
    this.storeHere = shopId;
    this.openMenu('store');
  }

  /** The tackle shop you're standing at (or null); refreshes the shop windows if that changes. */
  setStoreAccess(shopId) {
    if (this.storeHere === shopId) return;
    this.storeHere = shopId;
    if (this.menuTab === 'store' || this.menuTab === 'gear') this.renderMenu();
  }

  shopById(id) {
    return this.lakeWorld?.shops.find((s) => s.id === id) ?? null;
  }

  /** "2.4 km north-east" from you to a shop. */
  shopDirection(shop) {
    return this.myPos ? directionTo(this.myPos.x, this.myPos.y, shop.x, shop.y) : '';
  }

  /** The three tackle shops at the top of the Tackle menu: where they are and what they sell. */
  storeList() {
    const shops = this.lakeWorld?.shops.filter((s) => s.kind === 'tackle') ?? [];
    if (!shops.length) return null;
    return h('div', { class: 'store-list' },
      h('div', { class: 'store-list-title' }, '🏪 Travelling tackle shops: walk there to buy their gear'),
      shops.map((s) => {
        const stock = shopStock(s.id);
        const levels = stock.map((it) => it.level);
        return h('div', { class: 'store-chip', style: { '--accent': s.awning[0] } },
          h('b', {}, s.name),
          h('span', {}, ` · ${stock.length} items, level ${Math.min(...levels)}-${Math.max(...levels)} · `),
          h('span', { class: 'store-dir' }, this.storeHere === s.id ? 'you are here' : this.shopDirection(s)));
      }));
  }

  /** Buy button for a shop-only item: works at its shop, from its level. */
  storeBuy(it) {
    const p = this.profile;
    const shop = this.shopById(it.shop);
    const level = levelFor(p.xp);
    if (level < it.level) {
      return h('div', { class: 'locked' }, h('div', {}, '🔒 ', h('b', {}, `Level ${it.level}`)),
        h('div', { class: 'locked-progress' }, `${shop?.name ?? ''}`));
    }
    if (this.storeHere !== it.shop) {
      return h('div', { class: 'locked store-away' }, h('div', {}, '🏪 ', h('b', {}, shop?.name ?? 'A tackle shop')),
        h('div', { class: 'locked-progress' }, `${num(it.price)}c · ${shop ? this.shopDirection(shop) : ''}`));
    }
    return h('button', { class: 'btn buy', disabled: p.coins < it.price, onclick: () => this.onBuy(it.id) }, `Buy · ${num(it.price)}`);
  }

  /** A tackle shop's window: its keeper, and everything it sells. */
  renderStore() {
    const shop = this.shopById(this.storeId);
    if (!shop) return [h('p', { class: 'menu-note' }, 'No shop here.')];
    const p = this.profile;
    const owned = new Set(p.inventory);
    const here = this.storeHere === shop.id;
    const out = [
      h('div', { class: 'store-head', style: { '--accent': shop.awning[0] } },
        h('div', { class: 'store-name' }, shop.name),
        h('div', { class: 'store-keeper' }, `${shop.keeper}: “${shop.greeting}”`),
        h('div', { class: 'store-meta' }, h('b', {}, `${num(p.coins)} coins`), ` · Level ${levelFor(p.xp)}`,
          here ? '' : ` · You've left the counter (${this.shopDirection(shop)}). Walk back to buy.`)),
    ];
    for (const slot of SLOTS) {
      const items = shopStock(shop.id).filter((it) => it.slot === slot).sort((a, b) => a.level - b.level);
      if (!items.length) continue;
      out.push(h('h4', { class: 'option-heading' }, SLOT_LABELS[slot]));
      for (const it of items) {
        if (slot === 'bait') { out.push(this.baitRow(it)); continue; }
        let action;
        if (p.equipped[slot] === it.id) action = h('span', { class: 'tag equipped' }, 'Equipped');
        else if (owned.has(it.id)) action = h('button', { class: 'btn', onclick: () => this.onEquip(it.id) }, 'Equip');
        else action = this.storeBuy(it);
        out.push(h('div', { class: `item-row${owned.has(it.id) ? ' owned' : ''}` },
          h('img', { class: 'gear-icon', src: gearIconURL(it.id), alt: '' }),
          h('div', { class: 'item-text' },
            h('div', { class: 'item-name' }, it.name),
            h('div', { class: 'item-desc' }, it.desc),
            h('div', { class: 'gear-stats' }, itemStats(it))),
          action));
      }
    }
    return out;
  }

  /** Whether you're standing at a shop; refreshes the Tackle menu if that changes. */
  setShopAccess(on) {
    if (this.shopAccess === on) return;
    this.shopAccess = on;
    if (this.menuTab === 'gear') this.renderMenu();
  }

  /** Level badge and XP bar in the player panel. */
  setLevel(xp = 0) {
    const pr = levelProgress(xp);
    setText($('level-badge'), String(pr.level));
    $('xp-fill').style.width = `${Math.round(pr.fraction * 100)}%`;
    setText($('xp-text'), pr.level >= MAX_LEVEL ? 'MAX' : `${num(pr.into)} / ${num(pr.needed)} XP`);
  }

  // ---- armour --------------------------------------------------------------------------

  renderArmour() {
    const p = this.profile;
    const level = levelFor(p.xp || 0);
    const worn = computeArmour(p.armour);
    const owned = new Set(p.armourOwned || []);
    const active = worn.set ? SETS[worn.set] : null;
    const summary = h('div', { class: 'armour-summary' },
      h('div', {}, 'Wearing: ', ARMOUR_SLOTS.map((slot) => {
        const id = p.armour[slot];
        return `${SLOT_ICONS[slot]} ${id ? SETS[id.split('_')[0]].pieces[slot] : 'nothing'}`;
      }).join(' · ')),
      h('div', {}, armourBonusText(worn) || 'No armour bonuses yet.'),
      active ? h('div', {}, 'Set effect: ', h('b', {}, active.effect.name), ` · ${active.effect.desc}`)
        : h('div', {}, 'Wear all four pieces of one set for its set effect.'));

    const sets = Object.entries(SETS).map(([setId, set]) => {
      const locked = level < set.level;
      const pieces = ARMOUR_SLOTS.map((slot) => {
        const id = `${setId}_${slot}`;
        const isWorn = p.armour[slot] === id;
        let action;
        if (owned.has(id)) action = h('button', { class: 'btn', onclick: () => this.onEquip(id) }, isWorn ? 'Take off' : 'Wear');
        else if (!locked) action = h('button', { class: 'btn buy', disabled: p.coins < set.price, onclick: () => this.onBuy(id) }, `Buy · ${num(set.price)}`);
        else action = h('span', { class: 'locked-progress' }, `🔒 Lv ${set.level}`);
        return h('div', { class: `armour-piece${isWorn ? ' worn' : ''}` },
          h('span', { class: 'icon' }, SLOT_ICONS[slot]),
          h('span', {}, set.pieces[slot]),
          action);
      });
      const perk = armourBonusText(computeArmour({ [ARMOUR_SLOTS[0]]: `${setId}_head` }));
      return h('div', { class: `armour-set${locked ? ' is-locked' : ''}${worn.set === setId ? ' active' : ''}` },
        h('div', { class: 'armour-set-head' },
          h('span', { class: 'armour-swatch', style: { background: set.look.jacket } }),
          h('span', { class: 'armour-set-name' }, set.name),
          h('span', { class: 'armour-level' }, locked ? `Unlocks at level ${set.level}` : `Level ${set.level}`)),
        h('div', { class: 'armour-effect' }, `Each piece: ${perk}. Full set: `, h('b', {}, set.effect.name), ` · ${set.effect.desc}`),
        h('div', { class: 'armour-pieces' }, pieces));
    });
    return [
      h('p', { class: 'menu-note' }, h('b', {}, `Level ${level}`), ` · ${num(p.coins)} coins. Armour doesn't change your rod: it adds bonuses of its own. Higher levels unlock better sets. Armour is switched off in duels.`),
      summary,
      ...sets,
    ];
  }

  // ---- pets ------------------------------------------------------------------------------

  petCard(id, { buy = false } = {}) {
    const p = this.profile;
    const pet = PETS[id];
    const rarity = PET_RARITIES[pet.rarity];
    const owned = p.pets.includes(id);
    let action = null;
    if (buy) {
      if (owned) action = h('span', { class: 'tag equipped' }, 'Adopted');
      else if (this.zooAccess) action = h('button', { class: 'btn buy', disabled: p.coins < petPrice(id), onclick: () => this.onBuy(id) }, `Adopt · ${num(petPrice(id))}`);
      else action = h('span', { class: 'locked-progress' }, `${num(petPrice(id))} coins · visit the zoo to adopt`);
    } else if (owned) {
      action = h('button', { class: `btn${p.pet === id ? ' buy' : ''}`, onclick: () => this.onEquip(id) }, p.pet === id ? 'With you · send home' : 'Take along');
    }
    return h('div', { class: `pet-card${owned || buy ? '' : ' missing'}${p.pet === id && !buy ? ' active' : ''}`, style: { '--rarity': rarity.color } },
      h('div', { class: 'pet-top' },
        h('span', { class: 'pet-emoji' }, pet.emoji),
        h('div', {}, h('div', { class: 'pet-name' }, pet.name), h('div', { class: 'pet-rarity' }, rarity.label))),
      h('div', { class: 'pet-ability' }, pet.ability),
      h('div', { class: 'pet-desc' }, pet.desc),
      action);
  }

  renderPets() {
    const p = this.profile;
    const zoo = this.zoo;
    const zooBox = zoo
      ? h('div', { class: 'zoo-box' },
        h('div', { class: 'zoo-head' }, h('span', {}, `🎪 Travelling Zoo · at ${zoo.area}`), h('span', {}, `moves on in ${clock(zoo.tl)}`)),
        h('div', { class: 'pet-grid' }, zoo.stock.map((id) => this.petCard(id, { buy: true }))),
        this.zooAccess ? null : h('p', { class: 'menu-note' }, 'Walk up to the zoo wagon (purple on the minimap) and press E to adopt.'))
      : h('p', { class: 'menu-note' }, 'The Travelling Zoo is back at Mirror Lake. Check its animals when you return.');
    const byRarity = Object.keys(PET_RARITIES).flatMap((r) => PET_IDS.filter((id) => PETS[id].rarity === r));
    return [
      h('p', { class: 'menu-note' }, h('b', {}, `${p.pets.length} / ${PET_IDS.length} pets`),
        ` · ${num(p.coins)} coins. One pet comes with you at a time and gives you its ability. Pets stay home during duels.`),
      zooBox,
      h('h4', { class: 'option-heading' }, 'Your pets'),
      h('div', { class: 'pet-grid' }, byRarity.map((id) => this.petCard(id))),
    ];
  }

  /** Open the Pets tab with adopting enabled. */
  openZoo() {
    this.zooAccess = true;
    this.openMenu('pets');
  }

  setZooAccess(on, zoo) {
    const stockChanged = zoo && (!this.zoo || this.zoo.stock.join() !== zoo.stock.join());
    const secondTick = zoo && this.zoo && zoo.tl !== this.zoo.tl;
    if (zoo) this.zoo = zoo;
    if (this.zooAccess === on && !stockChanged && !(secondTick && this.menuTab === 'pets')) return;
    this.zooAccess = on;
    if (this.menuTab === 'pets') this.renderMenu();
  }

  setPet(profile) {
    const pet = PETS[profile.pet];
    setText($('pet-line'), pet ? `${pet.emoji} ${pet.name} · ${pet.ability}` : '');
  }

  /** The bait line in the player panel. */
  setBait(profile) {
    const id = profile.equipped.bait;
    const it = ITEMS[id];
    const chum = profile.chum ? ` · 🪣 ×${profile.chum}` : '';
    const text = (isConsumable(id) ? `🪱 ${it.name} ×${baitCount(profile, id)}` : `🍞 ${it.name} (free)`) + chum;
    setText($('bait-line'), text);
    $('bait-line').classList.toggle('low', isConsumable(id) && baitCount(profile, id) <= 5);
  }

  // ---- achievements --------------------------------------------------------------------

  renderAchievements() {
    const p = this.profile;
    const earned = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length;
    return [
      h('p', { class: 'menu-note' }, h('b', {}, `${earned} / ${ACHIEVEMENTS.length}`), ' achievements earned. Many unlock new tackle in the shop.'),
      ...ACHIEVEMENTS.map((a) => {
        const pr = progressOf(p, a);
        const when = p.achievements[a.id];
        const unlocks = unlocksFor(a.id).map((id) => ITEMS[id].name);
        return h('div', { class: `ach${pr.done ? ' done' : ''}` },
          h('div', { class: 'ach-icon' }, pr.done ? '🏆' : '🎣'),
          h('div', { class: 'ach-body' },
            h('div', { class: 'ach-head' },
              h('span', { class: 'ach-name' }, a.name),
              h('span', { class: 'ach-count' }, pr.done && when ? `Earned ${new Date(when).toLocaleDateString()}` : `${num(pr.value)} / ${num(pr.goal)}${a.unit ? ` ${a.unit}` : ''}`)),
            h('div', { class: 'ach-desc' }, a.desc),
            h('div', { class: 'bar' }, h('div', { style: { width: `${pr.fraction * 100}%` } })),
            h('div', { class: 'ach-reward' },
              `Reward: ${num(a.coins)} coins`,
              unlocks.length ? h('span', { class: 'ach-unlocks' }, ` · Unlocks ${unlocks.join(', ')}`) : null)));
      }),
    ];
  }

  // ---- changelog -------------------------------------------------------------------------

  renderChangelog() {
    return [
      h('p', { class: 'menu-note' }, `You're playing The Last Cast `, h('b', {}, `v${VERSION}`), '.'),
      ...CHANGELOG.map((e) => h('div', { class: 'release' },
        h('div', { class: 'release-head' },
          h('span', { class: 'release-version' }, `v${e.version}`),
          h('span', { class: 'release-title' }, e.title),
          h('span', { class: 'release-date' }, e.date)),
        h('ul', {}, e.changes.map((c) => h('li', {}, c))))),
    ];
  }

  /** A small notice in the corner, e.g. "Achievement unlocked". */
  toast({ title, name, detail }) {
    const el = h('div', { class: 'toast' },
      h('div', { class: 'toast-icon' }, '🏆'),
      h('div', {},
        h('div', { class: 'toast-title' }, title),
        h('div', { class: 'toast-name' }, name),
        detail ? h('div', { class: 'toast-detail' }, detail) : null));
    $('toasts').append(el);
    setTimeout(() => el.classList.add('leaving'), 6500);
    setTimeout(() => el.remove(), 7000);
  }

  renderIndex() {
    const { index } = this.profile;
    const ids = Object.keys(SPECIES);
    const found = ids.filter((id) => index[id]).length;
    // Generated ponds in the wilds are summed up by type ("any wild Mire")
    // rather than listed one by one.
    const NOUN = { willowPond: 'Pond', frogPond: 'Pool', crystalPond: 'Tarn', blackBog: 'Mire', millPond: 'Millpond', wildLake: 'Lake' };
    const zonesFor = (id) => {
      const zones = this.world.zones.filter((z) => z.fish[id]);
      const wild = [...new Set(zones.filter((z) => z.id.startsWith('wild')).map((z) => z.kind))];
      return [
        ...zones.filter((z) => !z.id.startsWith('wild')).map((z) => z.name),
        ...wild.map((k) => `Any ${NOUN[k] ?? 'pond'} in the wilds`),
        ...seaLocationsFor(id).map((where) => `At sea: ${where}`),
      ];
    };
    return [
      h('p', { class: 'menu-note' }, h('b', {}, `${found} / ${ids.length}`), ' species discovered.'),
      h('div', { class: 'index-grid' }, ids.map((id) => {
        const s = SPECIES[id];
        const e = index[id];
        const rarity = RARITY[s.rarity];
        return h('div', { class: `index-card${e ? '' : ' unknown'}`, style: { borderColor: e ? rarity.color : '' } },
          h('img', { class: 'index-fish', src: fishImageURL(id, { silhouette: !e }), alt: '' }),
          h('div', { class: 'index-name' }, e ? s.name : '???'),
          h('div', { class: 'index-rarity', style: { color: rarity.color } }, rarity.label),
          e
            ? h('div', { class: 'index-stats' }, `Caught ${e.count}× · Best ${e.bestKg} kg`)
            : h('div', { class: 'index-stats' }, 'Not caught yet'),
          trophyKg(id) != null
            ? h('div', { class: `index-trophy${e?.trophies ? ' got' : ''}` },
              `🏆 Trophy ${trophyKg(id)} kg+`, e?.trophies ? ` · ${e.trophies} landed` : '')
            : null,
          h('div', { class: 'index-where' }, `Found in: ${zonesFor(id).join(', ') || 'unknown'}`));
      })),
    ];
  }

  /** The Trophies window: your cabinet, or the Hall of Records. */
  renderTrophies() {
    const views = { cabinet: 'My Trophy Cabinet', records: 'Hall of Records' };
    const tabs = h('div', { class: 'slot-tabs' }, Object.entries(views).map(([key, label]) => h('button', {
      class: key === this.trophyView ? 'active' : '',
      onclick: () => {
        this.trophyView = key;
        if (key === 'records') this.onRecords?.();
        this.renderMenu();
      },
    }, label)));
    return [tabs, ...(this.trophyView === 'records' ? this.renderRecords() : this.renderCabinet())];
  }

  renderCabinet() {
    const list = this.profile.trophies ?? [];
    const c = this.profile.counters ?? {};
    const out = [
      h('p', { class: 'menu-note' },
        'A ', h('b', {}, 'trophy'), ' is one of the heaviest of its kind (the Fish Index shows each trophy weight). About 1 fish in 300 is a ',
        h('b', {}, 'giant'), ', bigger than its kind should ever grow, and fights much harder. Every trophy gets a name, and the heaviest go into the Hall of Records.'),
      h('div', { class: 'trophy-stats' },
        [['🏆', c.trophies || 0, 'trophies'], ['👑', c.giants || 0, 'giants'], ['📜', c.recordsSet || 0, 'records set'], ['🥇', c.weeklyWins || 0, 'weekly wins']]
          .map(([icon, n, label]) => h('div', {}, h('b', {}, `${icon} ${num(n)}`), h('span', {}, label)))),
    ];
    if (!list.length) {
      out.push(h('p', { class: 'menu-note' }, 'Your cabinet is empty. Land a trophy-sized fish to put it on the wall.'));
      return out;
    }
    out.push(h('div', { class: 'trophy-grid' }, list.map((t) => {
      const s = SPECIES[t.species];
      const T = TROPHY_TIERS[t.tier];
      return h('div', { class: `trophy-card tier-${t.tier}`, style: { '--trophy': T.color, '--rarity': RARITY[s.rarity].color } },
        h('div', { class: 'trophy-plaque' }, T.icon),
        h('img', { class: 'trophy-fish', src: fishImageURL(t.species), alt: '' }),
        h('div', { class: 'trophy-name' }, `“${t.name}”`),
        h('div', { class: 'trophy-species' }, s.name),
        h('div', { class: 'trophy-kg' }, `${t.kg} kg`, h('span', {}, ` · ${T.label}`)),
        h('div', { class: 'trophy-when' }, `${t.zone} · ${timeAgo(t.at)}`));
    })));
    if (list.length >= 100) out.push(h('p', { class: 'menu-note' }, 'Your cabinet holds your 100 newest trophies; giants are kept for good.'));
    return out;
  }

  /** Records from the server (a 'records' event). */
  setRecords(records) {
    this.records = records;
    if (this.menuTab === 'trophies' && this.trophyView === 'records') this.renderMenu();
  }

  renderRecords() {
    const r = this.records;
    if (!r) return [h('p', { class: 'menu-note' }, 'Opening the Hall of Records...')];
    const ids = Object.keys(r.species).filter((id) => SPECIES[id])
      .sort((a, b) => RARITY_ORDER.indexOf(SPECIES[b].rarity) - RARITY_ORDER.indexOf(SPECIES[a].rarity) || SPECIES[a].name.localeCompare(SPECIES[b].name));
    const out = [h('p', { class: 'menu-note' },
      'The heaviest trophies anyone has landed. When the week ends (in ', h('b', {}, untilText(r.endsAt - Date.now())),
      '), the top three of each species this week win coins.')];
    if (!ids.length) {
      out.push(h('p', { class: 'menu-note' }, 'No records yet. The first trophy of each kind sets the record!'));
      return out;
    }
    const rows = (list, prize) => (list.length
      ? list.map((e, i) => h('div', { class: `record-row${e.mine ? ' mine' : ''}` },
        h('span', { class: 'record-place' }, PLACES[i]),
        h('span', { class: 'record-angler' }, e.angler, e.tier === 'giant' ? ' 👑' : ''),
        h('span', { class: 'record-kg' }, `${e.kg} kg`),
        h('span', { class: 'record-fish' }, `“${e.name}”`),
        prize ? h('span', { class: 'record-prize' }, `${num(prize(i))}c`) : null))
      : [h('div', { class: 'record-row empty' }, 'Nobody yet this week')]);
    for (const id of ids) {
      const s = SPECIES[id];
      const { all, week } = r.species[id];
      out.push(h('div', { class: 'record-card', style: { '--rarity': RARITY[s.rarity].color } },
        h('div', { class: 'record-head' },
          h('img', { src: fishImageURL(id), alt: '' }),
          h('b', {}, s.name),
          h('span', { class: 'record-trophy' }, `trophy ${trophyKg(id)} kg+ · 1st wins ${num(weeklyPrize(id, 0))}c`)),
        h('div', { class: 'record-cols' },
          h('div', {}, h('div', { class: 'record-col-title' }, 'This week'), rows(week, (i) => weeklyPrize(id, i))),
          h('div', {}, h('div', { class: 'record-col-title' }, 'All-time'), rows(all)))));
    }
    return out;
  }

  renderHistory() {
    const { history } = this.profile;
    if (!history.length) return h('p', { class: 'menu-note' }, 'No catches yet. Go cast a line!');
    return [
      h('p', { class: 'menu-note' }, `Your last ${history.length} catches.`),
      h('table', { class: 'history' },
        h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Fish'), h('th', {}, 'Weight'), h('th', {}, 'Points'), h('th', {}, 'Where'))),
        h('tbody', {}, history.map((c) => {
          const s = SPECIES[c.species];
          return h('tr', {},
            h('td', {}, timeAgo(c.at)),
            h('td', { class: 'history-fish', style: { color: RARITY[s?.rarity]?.color } },
              s ? h('img', { src: fishImageURL(c.species), alt: '' }) : null, s?.name ?? c.species),
            h('td', {}, `${c.kg} kg`),
            h('td', {}, `+${c.points}`),
            h('td', {}, c.hotspot ? `${c.zone} ★` : c.zone));
        }))),
    ];
  }

  /** Sound on/off button; onClick is only bound the first time. */
  setSoundButton(muted, onClick) {
    const btn = $('sound-toggle');
    btn.querySelector('.dock-icon').textContent = muted ? '🔇' : '🔊';
    btn.querySelector('.dock-label').textContent = muted ? 'Muted' : 'Sound';
    btn.classList.toggle('off', muted);
    if (this.optionsMute) this.optionsMute.checked = muted;
    if (onClick && !btn.onclick) btn.onclick = () => { onClick(); btn.blur(); };
  }

  /** Account line under the player name: log out, or sign up for guests. */
  setAccount(username, tempGuest, { onLogout, onSignup }) {
    const action = $('account-action');
    if (username) {
      $('account-label').textContent = 'Logged in';
      action.textContent = 'Log out';
      action.onclick = onLogout;
      action.hidden = false;
    } else {
      $('account-label').textContent = tempGuest ? 'Guest (not saved)' : 'Guest';
      action.textContent = 'Sign up';
      action.onclick = onSignup;
      action.hidden = tempGuest;
    }
  }

  /** The "You caught..." card with the fish's picture. Click to dismiss. */
  showCatch(ev) {
    const el = $('catch-popup');
    const rarity = RARITY[ev.rarity] || RARITY.common;
    el.className = `catch-popup rarity-${ev.rarity}`;
    el.style.setProperty('--rarity', rarity.color);
    fill(el,
      h('div', { class: 'catch-rays' }),
      h('div', { class: 'catch-title' }, ev.trophy?.tier === 'giant' ? 'A GIANT!' : ev.trophy ? 'Trophy fish!' : ev.isNew ? 'New species!' : 'You caught'),
      h('img', { class: 'catch-fish', src: fishImageURL(ev.species), alt: '' }),
      h('div', { class: 'catch-name' }, ev.speciesName),
      h('div', { class: 'catch-meta' },
        h('span', { class: 'catch-rarity' }, rarity.label),
        ` · ${ev.kg} kg · +${ev.points} ${ev.duel ? 'duel pts' : `pts · +${ev.coins ?? ev.points} coins`}`,
        ev.hotspot ? ' · hotspot bonus' : '',
        ev.event ? ' · event bonus' : ''),
      ev.trophy ? this.trophyLine(ev.trophy) : null,
      ev.duel ? h('div', { class: 'catch-note' }, 'Duel catch: counts for the duel only') : null,
    );
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth; // restart the pop-in animation
    el.style.animation = '';
    el.onclick = () => { el.hidden = true; };
    clearTimeout(this.catchTimer);
    this.catchTimer = setTimeout(() => { el.hidden = true; }, ev.rarity === 'legendary' || ev.rarity === 'mythic' || ev.trophy ? 5500 : 3400);
  }

  /** The trophy badge on the catch card: its name and any record it set. */
  trophyLine(t) {
    const T = TROPHY_TIERS[t.tier];
    const notes = [];
    if (t.allTime === 0) notes.push('NEW ALL-TIME RECORD!');
    else if (t.allTime != null) notes.push(`#${t.allTime + 1} all-time`);
    if (t.weekly != null && t.allTime !== 0) notes.push(t.weekly === 0 ? 'top of this week\'s records' : `#${t.weekly + 1} this week`);
    return h('div', { class: `catch-trophy tier-${t.tier}`, style: { '--trophy': T.color } },
      h('div', { class: 'catch-trophy-name' }, `${T.icon} “${t.name}”`),
      h('div', { class: 'catch-trophy-note' }, [`${T.label} · points ×${T.points}`, ...notes].join(' · ')));
  }

  showGame() {
    $('join').hidden = true;
    $('hud').hidden = false;
  }

  showJoin(message = '') {
    $('join').hidden = false;
    $('join-error').textContent = message;
  }

  updateMe(me, zoneName, areaName) {
    if (!me) return;
    setText($('me-location'), `📍 ${areaName}`);
    setText($('me-name'), me.name);
    setText($('me-score'), String(me.sc));
    setText($('me-catches'), String(me.c));

  }

  /** room: 'lake' ranks by score; 'voyage' ranks by points this voyage. */
  updateLeaderboard(players, meId, room = 'lake') {
    const atSea = room === 'voyage';
    const value = (p) => (atSea ? p.vp ?? 0 : p.sc);
    const sorted = [...players].sort((a, b) => value(b) - value(a)).slice(0, 10);
    const key = room + sorted.map((p) => `${p.id}:${value(p)}:${p.c}:${p.lv}:${p.best?.points}:${p.du ?? ''}:${p.ab ?? ''}`).join('|');
    if (key === this.lastBoard) return;
    this.lastBoard = key;
    $('leaderboard-title').textContent = atSea ? 'Crew · this voyage' : 'Anglers';

    const list = $('leaderboard-list');
    list.replaceChildren(...sorted.map((p) => {
      const li = document.createElement('li');
      if (p.id === meId) li.classList.add('me');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      const name = document.createElement('span');
      name.className = 'lb-name';
      name.textContent = p.name;
      const score = document.createElement('span');
      score.className = 'lb-score';
      score.textContent = atSea ? `${num(value(p))} pts` : `Lv${p.lv ?? 1} · ${p.sc} pts`;
      if (p.du) name.textContent += ' ⚔';
      if (p.ab) name.textContent += ' ⛴';
      li.append(dot, name, score);
      if (p.best) li.title = `Best: ${SPECIES[p.best.species]?.name} ${p.best.kg} kg`;
      return li;
    }));
  }

  // ---- multiplayer: prompts, duels, the boat and voyages ------------------------------

  /** A hint under your angler, e.g. "E: board the boat". null hides it. */
  prompt(text) {
    const el = $('prompt');
    if (!text) { el.hidden = true; return; }
    if (el.textContent !== text) el.textContent = text;
    el.hidden = false;
  }

  /** The boat line in the player panel (lake only). */
  setBoatLine(text, highlight = false) {
    const el = $('boat-line');
    setText(el, text || '');
    el.classList.toggle('highlight', highlight);
  }

  /** Someone challenged you: Accept (Y) / Decline (N), with a countdown. */
  showInvite(ev, onAnswer) {
    const el = $('dialog');
    const tackle = Object.values(DUEL.loadout).map((id) => ITEMS[id].name).join(', ');
    const bar = h('div', { class: 'bar' }, h('div', { class: 'invite-time', style: { width: '100%', animationDuration: `${ev.seconds}s` } }));
    fill(el,
      h('div', { class: 'dialog-title' }, '⚔ Duel challenge'),
      h('div', { class: 'dialog-main' }, `${ev.name} challenges you to a fishing duel!`),
      h('div', { class: 'dialog-text' },
        `${Math.round(ev.duration / 60)} minutes, most points wins. Both of you fish with the same tackle: ${tackle}. `
        + `Fish caught in the duel give no rewards; the winner gets ${num(ev.prize)} coins.`),
      bar,
      h('div', { class: 'dialog-buttons' },
        h('button', { class: 'btn buy', onclick: () => onAnswer(true) }, 'Accept ', h('kbd', {}, 'Y')),
        h('button', { class: 'btn', onclick: () => onAnswer(false) }, 'Decline ', h('kbd', {}, 'N'))),
    );
    el.hidden = false;
    clearTimeout(this.inviteTimer);
    this.inviteTimer = setTimeout(() => this.hideInvite(), ev.seconds * 1000);
  }

  hideInvite() {
    clearTimeout(this.inviteTimer);
    $('dialog').hidden = true;
    document.activeElement?.blur?.();
  }

  get inviteOpen() {
    return !$('dialog').hidden;
  }

  /**
   * The top-centre panel. duel: { opponent, me, them, seconds, live, onForfeit }
   * or voyage: see voyagePanel. null hides it.
   */
  duelPanel(d) {
    const el = $('event-panel');
    if (!d) { this.hidePanel('duel'); return; }
    const armed = performance.now() < (this.forfeitArmedUntil ?? 0); // clicked Forfeit once
    const key = `duel|${d.opponent}|${d.me}|${d.them}|${d.seconds}|${d.live}|${armed}`;
    if (this.panelKey === key) return;
    this.panelKey = key;
    this.panelKind = 'duel';
    const leading = d.me > d.them ? 'ahead' : d.me < d.them ? 'behind' : 'level';
    el.className = `panel event-panel duel ${leading}`;
    el.style.removeProperty('--accent');
    fill(el,
      h('div', { class: 'ep-head' },
        h('span', { class: 'ep-title' }, '⚔ Duel'),
        h('span', { class: 'ep-time' }, d.live ? clock(d.seconds) : `Starts in ${d.seconds}`)),
      h('div', { class: 'duel-score' },
        h('div', { class: 'duel-side me' }, h('div', { class: 'duel-name' }, 'You'), h('div', { class: 'duel-pts' }, num(d.me))),
        h('div', { class: 'duel-vs' }, 'vs'),
        h('div', { class: 'duel-side' }, h('div', { class: 'duel-name' }, d.opponent), h('div', { class: 'duel-pts' }, num(d.them)))),
      h('div', { class: 'ep-note' }, 'Matched tackle · duel fish give no rewards'),
      h('button', {
        class: `btn small${armed ? ' danger' : ''}`,
        onclick: () => {
          if (performance.now() < (this.forfeitArmedUntil ?? 0)) {
            this.forfeitArmedUntil = 0;
            d.onForfeit();
          } else {
            this.forfeitArmedUntil = performance.now() + 3000;
            this.panelKey = null; // redraw with the confirm text
          }
        },
      }, armed ? 'Click again to forfeit' : 'Forfeit'),
    );
    el.hidden = false;
  }

  /**
   * v: { phase, stopIndex, stops: [{ loc, time }], timeLeft, next, event, eventLeft,
   *      crew, missions: [{ text, progress, goal }], myPoints, rank, crewSize }
   */
  voyagePanel(v) {
    const el = $('event-panel');
    if (!v) { this.hidePanel('voyage'); return; }
    const key = JSON.stringify(v);
    if (this.panelKey === key) return;
    this.panelKey = key;
    this.panelKind = 'voyage';
    const stop = v.stops[v.stopIndex];
    const loc = stop && SEA_LOCATIONS[stop.loc];
    const ev = v.event ? SEA_EVENTS[v.event] : null;
    let title;
    let time;
    if (v.phase === 'fishing') {
      title = `Stop ${v.stopIndex + 1}/${v.stops.length} · ${loc.name}`;
      time = clock(v.timeLeft);
    } else if (v.phase === 'bossIntro' || v.phase === 'boss') {
      title = `Boss: ${BOSSES[v.boss?.id]?.name ?? '???'}`;
      time = v.phase === 'boss' ? clock(v.timeLeft) : 'Rising...';
    } else if (v.phase === 'results') {
      title = 'Voyage complete';
      time = 'Heading home';
    } else {
      title = `Sailing to ${SEA_LOCATIONS[v.next]?.name ?? 'the fishing grounds'}`;
      time = clock(v.timeLeft);
    }
    el.className = `panel event-panel voyage${ev ? ' event-on' : ''}`;
    if (ev) el.style.setProperty('--accent', ev.color);
    else el.style.removeProperty('--accent');
    fill(el,
      h('div', { class: 'ep-head' }, h('span', { class: 'ep-title' }, `⛴ ${title}`), h('span', { class: 'ep-time' }, time)),
      h('div', { class: 'route' }, v.stops.map((s, i) => h('span', {
        class: `route-stop${i < v.stopIndex || (i === v.stopIndex && v.phase !== 'fishing') ? ' done' : ''}${i === v.stopIndex && v.phase === 'fishing' ? ' here' : ''}`,
        title: `${SEA_LOCATIONS[s.loc].name} (${s.time})`,
      }, `${SEA_LOCATIONS[s.loc].name}`, h('small', {}, s.time)))),
      ev ? h('div', { class: 'ep-event' }, h('b', {}, `${ev.name}! `), `${clock(v.eventLeft)} left · ${ev.desc}`) : null,
      v.boss && (v.phase === 'boss' || v.phase === 'bossIntro') ? this.bossBlock(v) : null,
      !ev && v.phase === 'fishing' ? h('div', { class: 'ep-note' }, `${loc.desc} Special event here: ${SEA_EVENTS[loc.event].name}.`) : null,
      h('div', { class: 'ep-stats' }, `You: ${num(v.myPoints)} pts (#${v.rank} of ${v.crewSize}) · Crew: ${num(v.crew)} pts`),
      h('div', { class: 'missions' }, v.missions.map((m) => h('div', { class: `mission${m.progress >= m.goal ? ' done' : ''}` },
        h('span', {}, m.progress >= m.goal ? '✓ ' : '○ ', m.text),
        h('span', { class: 'mission-count' }, `${Math.min(m.progress, m.goal)}/${m.goal}`)))),
    );
    el.hidden = false;
  }

  /** Boss health bar, incoming attack and your damage. */
  bossBlock(v) {
    const b = v.boss;
    const boss = BOSSES[b.id];
    const frac = b.mx ? b.hp / b.mx : 1;
    const warn = b.w ? BOSS_ATTACKS[b.w] : null;
    const effect = b.e ? BOSS_ATTACKS[b.e] : null;
    const phase = BOSS.phases[b.p ?? 0];
    const share = v.crewContribution ? v.myContribution / v.crewContribution : 0;
    const warnText = warn?.area
      ? `⚠ ${boss.slam} in ${b.wl}! Get off ${DECK_AREAS[b.wa]?.name ?? 'the red area'}!`
      : warn ? `⚠ ${warn.name} in ${b.wl}... ${warn.desc}` : null;
    return h('div', { class: 'boss-block' },
      v.phase === 'boss' ? h('div', { class: `boss-phase p${b.p ?? 0}` }, `Phase ${(b.p ?? 0) + 1}/3 · ${phase.name}`) : null,
      h('div', { class: 'boss-bar' },
        BOSS.phases.slice(1).map((ph) => h('i', { class: 'boss-mark', style: { left: `${ph.at * 100}%` } })),
        h('div', { style: { width: `${Math.max(0, frac * 100)}%` } }),
        h('span', {}, b.mx ? `${num(b.hp)} / ${num(b.mx)}` : '')),
      warnText ? h('div', { class: `boss-warn${warn.area ? ' slam' : ''}` }, warnText) : null,
      b.bk ? h('div', { class: 'boss-breach' }, `🎯 BREACH! Cast into the golden ring to harpoon it (${Math.ceil(b.bk.t)}s)`) : null,
      b.gr?.length ? h('div', { class: 'boss-grab' }, `🪓 ${boss.grab} on the rail! Mash E beside it (${b.gr.map((g) => `${g.hp} hits, ${g.t}s`).join(' · ')})`) : null,
      effect ? h('div', { class: 'boss-effect' }, `${effect.name}: ${effect.desc}`) : null,
      v.phase === 'boss' ? h('div', { class: 'ep-stats' },
        `Your contribution: ${num(v.myContribution)} (${Math.round(share * 100)}%) · Prize pool: ${num(b.pool ?? 0)} coins`) : null);
  }

  hidePanel(kind) {
    if (this.panelKind !== kind) return;
    this.panelKind = null;
    this.panelKey = null;
    $('event-panel').hidden = true;
  }

  /** A big message in the middle of the screen for a moment. */
  banner(title, subtitle = '', color = '#ffd166', ms = 3200) {
    const el = $('banner');
    el.style.setProperty('--accent', color);
    fill(el, h('div', { class: 'banner-title' }, title), subtitle ? h('div', { class: 'banner-sub' }, subtitle) : null);
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  /** End-of-voyage summary. */
  showVoyageResults(r) {
    const rows = r.ranking.map((x) => h('tr', { class: x.me ? 'me' : '' },
      h('td', {}, `#${x.rank}`), h('td', {}, x.name), h('td', {}, num(x.points)), h('td', {}, String(x.catches)),
      h('td', {}, num(x.contribution || 0)), h('td', {}, x.share ? `🪙 ${num(x.share)}` : '-')));
    const b = r.breakdown;
    this.showResults([
      h('h2', {}, '⛴ Voyage complete!'),
      h('p', { class: 'results-big' }, `You placed #${r.rank} and earned `, h('b', {}, `${num(r.bonus)} bonus coins`), '.'),
      h('p', { class: 'menu-note' },
        `${num(b.points)} for your points · ${num(b.missions)} for crew missions${b.rank ? ` · ${num(b.rank)} for your placing` : ''}${b.boss ? ` · ${num(b.boss)} from the boss fight` : ''}${b.pool ? ` · ${num(b.pool)} from the prize pool` : ''} · +${num(r.xp ?? 0)} XP`),
      r.boss ? h('p', { class: `boss-result ${r.boss.result}` },
        r.boss.result === 'won'
          ? `⚔ ${r.boss.name} defeated! Prize pool: ${num(r.boss.pool ?? 0)} coins${r.boss.mvp ? ` · MVP: ${r.boss.mvp}` : ''}`
          : `${r.boss.name} escaped. Consolation pool: ${num(r.boss.pool ?? 0)} coins.`) : null,
      h('table', { class: 'history results-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Angler'), h('th', {}, 'Points'), h('th', {}, 'Fish'), h('th', {}, 'Boss'), h('th', {}, 'Pool'))),
        h('tbody', {}, rows)),
      h('p', {}, `Crew total: `, h('b', {}, `${num(r.crewTotal)} pts`)),
      h('div', { class: 'missions' }, r.missions.map((m) => h('div', { class: `mission${m.done ? ' done' : ''}` }, m.done ? '✓ ' : '✗ ', m.text))),
      h('p', { class: 'menu-note' }, 'The boat is heading back to Mirror Lake.'),
    ]);
  }

  /** Duel result card. */
  showDuelResult(ev) {
    const title = ev.result === 'win' ? '🏆 You won the duel!' : ev.result === 'lose' ? 'You lost the duel' : 'The duel is a draw';
    const why = ev.forfeit === 'them' ? `${ev.opponent} forfeited.` : ev.forfeit === 'you' ? 'You forfeited.' : '';
    this.showResults([
      h('h2', {}, title),
      h('p', { class: 'results-big' }, `You ${num(ev.myScore)} – ${num(ev.theirScore)} ${ev.opponent}`),
      why ? h('p', {}, why) : null,
      ev.prize ? h('p', { class: 'results-prize' }, `+${num(ev.prize)} coins`) : null,
      ev.noPrize ? h('p', { class: 'menu-note' }, ev.noPrize) : null,
      h('p', { class: 'menu-note' }, 'Your own tackle is back on.'),
    ]);
  }

  showResults(children) {
    const box = $('results-body');
    box.replaceChildren(...children.filter(Boolean), h('button', { class: 'btn buy', onclick: () => this.hideResults() }, 'Close'));
    $('results').hidden = false;
  }

  hideResults() {
    $('results').hidden = true;
    document.activeElement?.blur?.();
  }

  feed(text, color) {
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.textContent = text;
    if (color) el.style.setProperty('--tint', color);
    const feed = $('feed');
    feed.prepend(el);
    while (feed.children.length > MAX_FEED) feed.lastChild.remove();
  }

  rarityColor(rarity) {
    return RARITY[rarity]?.color;
  }

  /** Temporary message that overrides the normal status line. */
  flash(text, ms = 2500) {
    this.flashUntil = performance.now() + ms;
    $('status').textContent = text;
  }

  /** Normal status line. `urgent` text (bite, fish pulling) beats any flash. */
  status(text, urgent = false) {
    if (urgent) this.flashUntil = 0;
    else if (performance.now() < this.flashUntil) return;
    setText($('status'), text);
  }
}
