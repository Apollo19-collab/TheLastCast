// Audio engine: sound effects, positional volume/panning, the reel's ratchet
// while fighting a fish, and an ambient "big lake" background.
// What each sound *is* lives in sounds.js; this file only plays them.
//
// Browsers block audio until the player interacts with the page, so call
// unlock() from a click or key press; until then play() does nothing.

import { SOUNDS } from './sounds.js';

const MUTE_KEY = 'lastcast.muted';
const VOLUME_KEY = 'lastcast.volume';
// Player-facing volume channels, 0-100.
export const VOLUME_CHANNELS = { master: 'Master', effects: 'Effects', ambience: 'Ambience' };
const DEFAULT_VOLUME = { master: 80, effects: 100, ambience: 70 };
const HEARING_RANGE = 900; // world units: sounds further away than this are silent
const PAN_RANGE = 500; // world units to the side for a fully panned sound

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

function readVolume() {
  try {
    const saved = JSON.parse(localStorage.getItem(VOLUME_KEY) || '{}');
    const out = { ...DEFAULT_VOLUME };
    for (const k of Object.keys(out)) if (Number.isFinite(saved[k])) out[k] = clamp(saved[k], 0, 100);
    return out;
  } catch {
    return { ...DEFAULT_VOLUME };
  }
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = readMuted();
    this.volume = readVolume();
    this.listener = { x: 0, y: 0 }; // usually the local player
    this.nextClick = 0;
    this.strain = null;
    this.scene = 'lake'; // 'lake' or 'sea': picks the ambience
  }

  /** Switch the ambience between the lake and the open sea. */
  setScene(scene) {
    this.scene = scene;
    if (!this.amb) return;
    const now = this.ctx.currentTime;
    const sea = scene === 'sea';
    this.amb.wash.gain.gain.setTargetAtTime(sea ? 0.38 : 0.22, now, 1);
    this.amb.wash.filter.frequency.setTargetAtTime(sea ? 520 : 380, now, 1);
    this.amb.wind.gain.gain.setTargetAtTime(sea ? 0.03 : 0.012, now, 1);
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      try { this.ctx = new AudioCtx(); } catch { return; }
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch { /* not saved */ }
    this.applyVolume();
    return this.muted;
  }

  /** Set a channel ('master', 'effects', 'ambience') to 0-100 and remember it. */
  setVolume(channel, value) {
    if (!(channel in DEFAULT_VOLUME)) return;
    this.volume[channel] = clamp(Math.round(Number(value) || 0), 0, 100);
    try { localStorage.setItem(VOLUME_KEY, JSON.stringify(this.volume)); } catch { /* not saved */ }
    this.applyVolume();
  }

  applyVolume() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const v = this.volume;
    this.master.gain.setTargetAtTime(this.muted ? 0 : v.master / 100, now, 0.05);
    this.sfx.gain.setTargetAtTime(v.effects / 100, now, 0.05);
    this.ambience.gain.setTargetAtTime(v.ambience / 100, now, 0.05);
  }

  // ---- graph -------------------------------------------------------------------

  build() {
    const ctx = this.ctx;
    const v = this.volume;
    this.master = this.gainNode(this.muted ? 0 : v.master / 100, ctx.destination);
    this.sfx = this.gainNode(v.effects / 100, this.master);
    this.ambience = this.gainNode(v.ambience / 100, this.master);
    // A long, soft reverb gives the feeling of open water.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8);
    this.reverb.connect(this.gainNode(0.5, this.master));
    this.whiteNoise = this.noiseBuffer(2, false);
    this.brownNoise = this.noiseBuffer(4, true);
    this.startAmbience();
  }

  gainNode(value, dest) {
    const g = this.ctx.createGain();
    g.gain.value = value;
    if (dest) g.connect(dest);
    return g;
  }

  noiseBuffer(seconds, brown) {
    const { sampleRate } = this.ctx;
    const buf = this.ctx.createBuffer(1, seconds * sampleRate, sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else data[i] = white;
    }
    return buf;
  }

  impulse(seconds) {
    const { sampleRate } = this.ctx;
    const buf = this.ctx.createBuffer(2, seconds * sampleRate, sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    }
    return buf;
  }

  // ---- one-shot sounds -----------------------------------------------------------

  /**
   * Play a named sound from sounds.js.
   * opts.x/opts.y: where it happened (quieter and panned relative to the listener).
   * opts.volume: extra multiplier. Other opts are passed to the recipe.
   */
  play(name, opts = {}) {
    if (!this.ctx || this.muted || !SOUNDS[name]) return;
    let volume = opts.volume ?? 1;
    let pan = 0;
    if (opts.x != null && opts.y != null) {
      const dx = opts.x - this.listener.x;
      const dist = Math.hypot(dx, opts.y - this.listener.y);
      volume *= clamp(1 - dist / HEARING_RANGE, 0, 1);
      pan = clamp(dx / PAN_RANGE, -0.8, 0.8);
    }
    if (volume < 0.02) return;
    this.playOn(this.sfx, SOUNDS[name], volume, pan, opts);
  }

  playOn(bus, recipe, volume, pan, opts) {
    const ctx = this.ctx;
    const out = this.gainNode(volume);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = pan;
      out.connect(panner).connect(bus);
    } else out.connect(bus);
    // The reverb is shared, so scale this sound's send by its own channel's volume.
    const channel = bus === this.ambience ? this.volume.ambience : this.volume.effects;
    const wet = this.gainNode(volume * (channel / 100), this.reverb);
    recipe(this.kit(out, wet), opts);
    setTimeout(() => { out.disconnect(); panner?.disconnect(); wet.disconnect(); }, 6000);
  }

  /** The building blocks recipes use. All times are seconds from now. */
  kit(out, wet) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const envelope = (t0, attack, dur, peak, reverb) => {
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(peak, t0 + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      env.connect(out);
      if (reverb) env.connect(this.gainNode(reverb, wet));
      return env;
    };
    return {
      tone: ({ freq, to, type = 'sine', at = 0, dur = 0.2, gain = 0.2, attack = 0.005, reverb = 0, vibrato, glide }) => {
        const t0 = now + at;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        for (const [t, f] of glide || []) osc.frequency.linearRampToValueAtTime(f, t0 + t);
        if (vibrato) {
          const lfo = ctx.createOscillator();
          lfo.frequency.value = vibrato.rate;
          lfo.connect(this.gainNode(vibrato.depth, osc.frequency));
          lfo.start(t0);
          lfo.stop(t0 + dur + 0.05);
        }
        osc.connect(envelope(t0, Math.min(attack, dur / 2), dur, gain, reverb));
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
      },
      noise: ({ at = 0, dur = 0.3, gain = 0.2, filter = 'lowpass', freq = 1000, to, q = 1, attack = 0.005, reverb = 0 }) => {
        const t0 = now + at;
        const src = ctx.createBufferSource();
        src.buffer = this.whiteNoise;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = filter;
        f.Q.value = q;
        f.frequency.setValueAtTime(freq, t0);
        if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        src.connect(f).connect(envelope(t0, Math.min(attack, dur / 2), dur, gain, reverb));
        src.start(t0, Math.random() * 1.5);
        src.stop(t0 + dur + 0.05);
      },
    };
  }

  // ---- the reel: ratchet clicks, drag buzz and line strain -----------------------

  /** Call every frame with the local player's line: { reeling, pulling, tension, progress }. */
  updateReel(line) {
    if (!this.ctx || this.muted || this.volume.effects === 0) return this.setStrain(0);
    const now = this.ctx.currentTime;
    if (line && (line.pulling || line.reeling) && now >= this.nextClick) {
      // The fish pulling line off the drag buzzes fast; reeling in clicks steadily.
      this.play(line.pulling ? 'dragClick' : 'reelClick');
      this.nextClick = now + (line.pulling ? 0.035 : 0.1 - 0.05 * (line.progress ?? 0));
    }
    // A rising whine as the line gets close to snapping.
    this.setStrain(line ? clamp(((line.tension ?? 0) - 0.55) / 0.45, 0, 1) : 0);
  }

  setStrain(amount) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (amount > 0 && !this.strain) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const gain = this.gainNode(0, this.sfx);
      osc.connect(gain);
      osc.start();
      this.strain = { osc, gain };
    }
    if (!this.strain) return;
    this.strain.osc.frequency.setTargetAtTime(300 + amount * 500, now, 0.05);
    this.strain.gain.gain.setTargetAtTime(amount * 0.07, now, 0.05);
    if (amount === 0) {
      const { osc, gain } = this.strain;
      this.strain = null;
      setTimeout(() => { osc.stop(); gain.disconnect(); }, 300);
    }
  }

  // ---- ambience: water, wind and wildlife across a large lake --------------------

  startAmbience() {
    const ctx = this.ctx;
    const loop = (buffer, filterType, freq, q, level) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = this.gainNode(level, this.ambience);
      src.connect(filter).connect(gain);
      src.start(0, Math.random() * 2);
      return { filter, gain };
    };
    const lfo = (rate, depth, param) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = rate;
      osc.connect(this.gainNode(depth, param));
      osc.start();
    };

    // Low wash of the whole lake, slowly swelling like distant waves.
    const wash = loop(this.brownNoise, 'lowpass', 380, 0.7, 0.22);
    lfo(0.06, 0.08, wash.gain.gain);
    // Nearer water lapping, on a different rhythm.
    const lapping = loop(this.whiteNoise, 'bandpass', 650, 0.6, 0.025);
    lfo(0.11, 0.02, lapping.gain.gain);
    // A light breeze that shifts in tone.
    const wind = loop(this.whiteNoise, 'bandpass', 1400, 0.4, 0.012);
    lfo(0.04, 600, wind.filter.frequency);

    this.amb = { wash, lapping, wind };
    this.setScene(this.scene);

    // Occasional sounds, scattered left and right. Some only at the lake or at sea.
    this.scatter('lap', 1.5, 4.5, 2);
    this.scatter('bird', 6, 16, 4, 'lake');
    this.scatter('loon', 25, 60, 12, 'lake');
    this.scatter('gull', 5, 14, 3, 'sea');
  }

  scatter(name, minGap, maxGap, firstDelay, scene = null) {
    const tick = () => {
      if (!this.muted && (!scene || scene === this.scene)) this.playOn(this.ambience, SOUNDS[name], rand(0.7, 1.2), rand(-0.8, 0.8), {});
      setTimeout(tick, rand(minGap, maxGap) * 1000);
    };
    setTimeout(tick, firstDelay * 1000);
  }
}
