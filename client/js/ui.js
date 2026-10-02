// DOM-based HUD: player panel, leaderboard, activity feed and status line.

import { RARITY, SPECIES } from '/shared/fish.js';

const $ = (id) => document.getElementById(id);
const MAX_FEED = 8;

export class UI {
  constructor() {
    this.flashUntil = 0;
    this.lastBoard = '';
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
