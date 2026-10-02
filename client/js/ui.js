// DOM-based HUD: player panel, leaderboard, activity feed, status line and
// the menu (gear shop, fish index, catch history).

import { RARITY, SPECIES } from '/shared/fish.js';
import { GEAR, GEAR_SLOTS, nextTier } from '/shared/gear.js';

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

function timeAgo(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function statLine(slot, tier) {
  if (slot === 'rod') return `Cast range ${tier.castRange} · Line strength ×${tier.lineStrength}`;
  if (slot === 'reel') return `Reel speed ×${tier.reelSpeed}`;
  return `Bite speed ×${tier.biteSpeed} · Rare odds ×${tier.rareBoost}`;
}

export class UI {
  /** world: location data (for fish-index hints). onBuy(slot): purchase callback. */
  constructor({ world, onBuy }) {
    this.world = world;
    this.onBuy = onBuy;
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
    $('me-coins').textContent = profile.coins;
    $('me-score').textContent = profile.score;
    $('me-catches').textContent = profile.catches;
    if (this.menuOpen) this.renderMenu();
  }

  renderMenu() {
    const body = $('menu-body');
    if (!this.profile) { body.replaceChildren(h('p', {}, 'Loading...')); return; }
    const render = { gear: () => this.renderGear(), index: () => this.renderIndex(), history: () => this.renderHistory() };
    body.replaceChildren(...[].concat(render[this.menuTab]()));
  }

  renderGear() {
    const { coins, gear } = this.profile;
    return [
      h('p', { class: 'menu-note' }, h('b', {}, `${coins} coins`), '. Every catch earns coins equal to its points.'),
      ...GEAR_SLOTS.map((slot) => {
        const tiers = GEAR[slot].tiers;
        const current = tiers[gear[slot]];
        const next = nextTier(gear, slot);
        return h('div', { class: 'gear-card' },
          h('div', { class: 'gear-head' },
            h('span', { class: 'gear-slot' }, GEAR[slot].label),
            h('span', { class: 'gear-tier' }, `Tier ${gear[slot] + 1}/${tiers.length}`)),
          h('div', { class: 'gear-name' }, current.name),
          h('div', { class: 'gear-stats' }, statLine(slot, current)),
          next
            ? h('div', { class: 'gear-next' },
              h('div', {},
                h('div', {}, 'Next: ', h('b', {}, next.name)),
                h('div', { class: 'gear-stats' }, `${statLine(slot, next)}. ${next.desc}`)),
              h('button', { disabled: coins < next.price, onclick: () => this.onBuy(slot) }, `Buy · ${next.price}`))
            : h('div', { class: 'gear-next maxed' }, 'Fully upgraded'));
      }),
    ];
  }

  renderIndex() {
    const { index } = this.profile;
    const ids = Object.keys(SPECIES);
    const found = ids.filter((id) => index[id]).length;
    const zonesFor = (id) => this.world.zones.filter((z) => z.fish[id]).map((z) => z.name);
    return [
      h('p', { class: 'menu-note' }, h('b', {}, `${found} / ${ids.length}`), ' species discovered.'),
      h('div', { class: 'index-grid' }, ids.map((id) => {
        const s = SPECIES[id];
        const e = index[id];
        const rarity = RARITY[s.rarity];
        return h('div', { class: `index-card${e ? '' : ' unknown'}`, style: { borderColor: e ? rarity.color : '' } },
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
            h('td', { style: { color: RARITY[s?.rarity]?.color } }, s?.name ?? c.species),
            h('td', {}, `${c.kg} kg`),
            h('td', {}, `+${c.points}`),
            h('td', {}, c.hotspot ? `${c.zone} ★` : c.zone));
        }))),
    ];
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

  showGame() {
    $('join').hidden = true;
    $('hud').hidden = false;
  }

  showJoin(message = '') {
    $('join').hidden = false;
    $('join-error').textContent = message;
  }

  updateMe(me, zoneName) {
    if (!me) return;
    $('me-name').textContent = me.name;
    $('me-score').textContent = me.sc;
    $('me-catches').textContent = me.c;
    $('aim-zone').textContent = zoneName ? `Aiming at: ${zoneName}` : '';
  }

  updateLeaderboard(players, meId) {
    const sorted = [...players].sort((a, b) => b.sc - a.sc).slice(0, 10);
    const key = sorted.map((p) => `${p.id}:${p.sc}:${p.c}:${p.best?.points}`).join('|');
    if (key === this.lastBoard) return;
    this.lastBoard = key;

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
      score.textContent = `${p.sc} pts · ${p.c}🐟`;
      li.append(dot, name, score);
      if (p.best) li.title = `Best: ${SPECIES[p.best.species]?.name} ${p.best.kg} kg`;
      return li;
    }));
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
