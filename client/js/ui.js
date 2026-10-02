// DOM-based HUD: player panel, leaderboard, activity feed, status line, the
// menu (tackle, fish index, achievements, history, options, changelog), and
// the multiplayer bits: duel invites and scoreboard, the boat timer, the
// voyage panel, banners and results.

import { FAMILIES, RARITY, SPECIES } from '/shared/fish.js';
import { ITEMS, SLOTS, SLOT_LABELS, computeStats, itemsForSlot } from '/shared/gear.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, progressOf, unlocksFor } from '/shared/achievements.js';
import { CHANGELOG, VERSION } from '/shared/version.js';
import { SEA_EVENTS, SEA_LOCATIONS, seaLocationsFor } from '/shared/voyage.js';
import { DUEL } from '/shared/duel.js';
import { VOLUME_CHANNELS } from './audio.js';
import { fishImageURL } from './gfx/fishArt.js';
import { gearIconURL } from './gfx/gearArt.js';

const $ = (id) => document.getElementById(id);
const MAX_FEED = 8;

/** Tiny DOM builder: h('div', { class: 'x' }, 'text', childEl). Text is never parsed as HTML. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
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

/** 125 -> "2:05" */
export function clock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "Trout & salmon ×1.8, Steelhead ×1.5" */
function affinityText(affinity) {
  return Object.entries(affinity || {})
    .map(([k, m]) => `${FAMILIES[k] || SPECIES[k]?.name || k} ×${Math.round(m * 100) / 100}`)
    .join(', ');
}

/** One line describing what an item does. */
function itemStats(it) {
  const parts = [];
  if (it.slot === 'rod') parts.push(`Cast ${it.range}`, `Power ×${it.power}`);
  if (it.slot === 'reel') parts.push(`Reel speed ×${it.speed}`);
  if (it.slot === 'line') parts.push(`Strength ×${it.strength}`);
  if (it.drag) parts.push(`Drag ×${it.drag}`);
  if (it.slot === 'bait') parts.push(`Bites ×${it.bite}`, `Rare odds ×${it.rare}`);
  else {
    if (it.bite) parts.push(`Bites ×${it.bite}`);
    if (it.rare) parts.push(`Rare odds ×${it.rare}`);
  }
  const aff = affinityText(it.affinity);
  if (aff) parts.push(`Favours ${aff}`);
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
    for (const el of document.querySelectorAll('.version-label')) {
      el.textContent = `v${VERSION} · What's new`;
      el.addEventListener('click', () => this.openMenu('news'));
    }
    this.audio = audio;
    this.flashUntil = 0;
    this.lastBoard = '';
    this.profile = null;
    this.menuTab = null; // null when the menu is closed

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
    if (!this.profile) { body.replaceChildren(h('p', {}, 'Join the lake to see this.')); return; }
    const scroll = body.scrollTop;
    const render = {
      gear: () => this.renderTackle(),
      index: () => this.renderIndex(),
      history: () => this.renderHistory(),
      achievements: () => this.renderAchievements(),
    };
    body.replaceChildren(...[].concat(render[this.menuTab]()));
    body.scrollTop = scroll; // keep your place when the profile updates
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
    return [
      h('h4', { class: 'option-heading' }, 'Sound'),
      ...sliders,
      h('label', { class: 'option-row option-check' }, mute, h('span', {}, 'Mute all sound '), h('kbd', {}, 'M')),
      h('h4', { class: 'option-heading' }, 'Controls'),
      h('table', { class: 'controls' }, h('tbody', {}, [
        ['Move', 'WASD / arrow keys'],
        ['Aim', 'Mouse'],
        ['Cast', 'Hold Space or left mouse, release to cast'],
        ['Hook', 'Space / click when the bobber dips'],
        ['Reel', 'Hold; release when the fish pulls'],
        ['Reel in', 'Esc or right-click'],
        ['Interact', 'E: board the boat, or challenge a nearby angler to a duel'],
        ['Duels', 'Y accept · N decline a challenge'],
        ['Menus', 'G tackle · I fish index · H history · T achievements · O options'],
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
      h('span', { class: 'loadout-name' }, ITEMS[id].name));
    }));
    const aff = affinityText(stats.affinity);
    const summary = h('div', { class: 'loadout-stats' },
      `Cast ${stats.castRange} · Line strength ×${stats.lineStrength} · Reel ×${stats.reelSpeed} · Drag ×${stats.drag}`
      + ` · Bites ×${stats.biteSpeed} · Rare odds ×${stats.rareBoost}`,
      aff ? h('div', {}, `Specialties: ${aff}`) : null);

    const list = itemsForSlot(this.tackleSlot).sort((a, b) => a.price - b.price).map((it) => {
      let action;
      if (p.equipped[it.slot] === it.id) action = h('span', { class: 'tag equipped' }, 'Equipped');
      else if (owned.has(it.id)) action = h('button', { class: 'btn', onclick: () => this.onEquip(it.id) }, 'Equip');
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

    return [
      h('p', { class: 'menu-note' }, h('b', {}, `${num(p.coins)} coins`), '. Mix and match: equip any rod, reel, line and bait you own.'),
      loadout,
      summary,
      h('div', { class: 'slot-tabs' }, SLOTS.map((slot) => h('button', {
        class: slot === this.tackleSlot ? 'active' : '',
        onclick: () => { this.tackleSlot = slot; this.renderMenu(); },
      }, SLOT_LABELS[slot]))),
      ...list,
    ];
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
    const zonesFor = (id) => [
      ...this.world.zones.filter((z) => z.fish[id]).map((z) => z.name),
      ...seaLocationsFor(id).map((where) => `At sea: ${where}`),
    ];
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
          h('div', { class: 'index-where' }, `Found in: ${zonesFor(id).join(', ') || 'unknown'}`));
      })),
    ];
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
    btn.firstChild.textContent = muted ? 'Sound off ' : 'Sound on ';
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
      h('div', { class: 'catch-title' }, ev.isNew ? 'New species!' : 'You caught'),
      h('img', { class: 'catch-fish', src: fishImageURL(ev.species), alt: '' }),
      h('div', { class: 'catch-name' }, ev.speciesName),
      h('div', { class: 'catch-meta' },
        h('span', { class: 'catch-rarity' }, rarity.label),
        ` · ${ev.kg} kg · +${ev.points} ${ev.duel ? 'duel pts' : 'pts'}`,
        ev.hotspot ? ' · hotspot bonus' : '',
        ev.event ? ' · event bonus' : ''),
      ev.duel ? h('div', { class: 'catch-note' }, 'Duel catch: counts for the duel only') : null,
    );
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth; // restart the pop-in animation
    el.style.animation = '';
    el.onclick = () => { el.hidden = true; };
    clearTimeout(this.catchTimer);
    this.catchTimer = setTimeout(() => { el.hidden = true; }, ev.rarity === 'legendary' ? 5500 : 3400);
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
    $('me-location').textContent = `📍 ${areaName}`;
    $('me-name').textContent = me.name;
    $('me-score').textContent = me.sc;
    $('me-catches').textContent = me.c;
    $('aim-zone').textContent = zoneName ? `Aiming at: ${zoneName}` : '';
  }

  /** room: 'lake' ranks by score; 'voyage' ranks by points this voyage. */
  updateLeaderboard(players, meId, room = 'lake') {
    const atSea = room === 'voyage';
    const value = (p) => (atSea ? p.vp ?? 0 : p.sc);
    const sorted = [...players].sort((a, b) => value(b) - value(a)).slice(0, 10);
    const key = room + sorted.map((p) => `${p.id}:${value(p)}:${p.c}:${p.best?.points}:${p.du ?? ''}:${p.ab ?? ''}`).join('|');
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
      score.textContent = atSea ? `${num(value(p))} pts` : `${p.sc} pts · ${p.c}🐟`;
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
    el.textContent = text || '';
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
      !ev && v.phase === 'fishing' ? h('div', { class: 'ep-note' }, `${loc.desc} Special event here: ${SEA_EVENTS[loc.event].name}.`) : null,
      h('div', { class: 'ep-stats' }, `You: ${num(v.myPoints)} pts (#${v.rank} of ${v.crewSize}) · Crew: ${num(v.crew)} pts`),
      h('div', { class: 'missions' }, v.missions.map((m) => h('div', { class: `mission${m.progress >= m.goal ? ' done' : ''}` },
        h('span', {}, m.progress >= m.goal ? '✓ ' : '○ ', m.text),
        h('span', { class: 'mission-count' }, `${Math.min(m.progress, m.goal)}/${m.goal}`)))),
    );
    el.hidden = false;
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
      h('td', {}, `#${x.rank}`), h('td', {}, x.name), h('td', {}, num(x.points)), h('td', {}, String(x.catches))));
    const b = r.breakdown;
    this.showResults([
      h('h2', {}, '⛴ Voyage complete!'),
      h('p', { class: 'results-big' }, `You placed #${r.rank} and earned `, h('b', {}, `${num(r.bonus)} bonus coins`), '.'),
      h('p', { class: 'menu-note' },
        `${num(b.points)} for your points · ${num(b.missions)} for crew missions${b.rank ? ` · ${num(b.rank)} for your placing` : ''}`),
      h('table', { class: 'history results-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Angler'), h('th', {}, 'Points'), h('th', {}, 'Fish'))),
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
    if (color) el.style.color = color;
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
    $('status').textContent = text;
  }
}
