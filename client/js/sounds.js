// Sound recipes, synthesized with the Web Audio API so no audio files are needed.
// Each recipe receives a kit `k` (see audio.js) and draws on k.out, which is
// already panned and volume-adjusted for where the sound happened.
//
// To swap in recorded samples later, replace a recipe with something like
// `(k) => k.sample('splash.ogg')` and keep the same name; callers don't change.

const NOTE = { C5: 523, E5: 659, G5: 784, C6: 1047, E6: 1319, G6: 1568, C7: 2093, E7: 2637 };

const CATCH_NOTES = {
  junk: [NOTE.G5, NOTE.E5],
  common: [NOTE.C5, NOTE.E5, NOTE.G5],
  uncommon: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6],
  rare: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6],
  legendary: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7],
};

export const SOUNDS = {
  // Line whooshing out.
  cast(k) {
    k.noise({ dur: 0.35, gain: 0.45, filter: 'bandpass', freq: 500, to: 2600, q: 0.8, attack: 0.08 });
  },

  // Bobber hits the water.
  splash(k) {
    k.noise({ dur: 0.4, gain: 0.3, filter: 'lowpass', freq: 2200, to: 300, attack: 0.004 });
    k.tone({ freq: 650, to: 170, dur: 0.14, gain: 0.18 });
  },

  // A fish takes the bait: a plunk and an alert ping.
  bite(k) {
    k.tone({ freq: 320, to: 110, dur: 0.16, gain: 0.3 });
    k.noise({ dur: 0.2, gain: 0.15, filter: 'lowpass', freq: 1500, to: 400 });
    k.tone({ freq: NOTE.C6, dur: 0.12, gain: 0.16, at: 0.08, type: 'triangle' });
    k.tone({ freq: NOTE.E6, dur: 0.18, gain: 0.16, at: 0.18, type: 'triangle' });
  },

  // Setting the hook: a tug and a thump.
  hook(k) {
    k.tone({ freq: 140, to: 55, dur: 0.16, gain: 0.35, type: 'triangle' });
    k.noise({ dur: 0.05, gain: 0.2, filter: 'highpass', freq: 3000 });
  },

  // One click of the reel's ratchet (repeated while reeling).
  reelClick(k) {
    k.noise({ dur: 0.025, gain: 0.12, filter: 'highpass', freq: 3500 });
    k.tone({ freq: 1900, dur: 0.02, gain: 0.04, type: 'square' });
  },

  // The drag buzzing as the fish pulls line out: a warning to ease off.
  dragClick(k) {
    k.noise({ dur: 0.018, gain: 0.2, filter: 'bandpass', freq: 5200, q: 2 });
  },

  // Landing a fish: an arpeggio that gets longer with rarity.
  catch(k, { rarity = 'common', isNew = false } = {}) {
    k.noise({ dur: 0.5, gain: 0.25, filter: 'lowpass', freq: 2500, to: 500 });
    const notes = CATCH_NOTES[rarity] || CATCH_NOTES.common;
    notes.forEach((f, i) => k.tone({ freq: f, dur: 0.35, gain: 0.24, at: 0.1 + i * 0.09, type: 'triangle', reverb: 0.4 }));
    if (isNew) {
      const end = 0.1 + notes.length * 0.09;
      [NOTE.C7, NOTE.E7, NOTE.C7, NOTE.E7].forEach((f, i) =>
        k.tone({ freq: f, dur: 0.12, gain: 0.05, at: end + i * 0.06, reverb: 0.6 }));
    }
  },

  // Someone else at the lake landed a fish: a softer chime.
  catchOther(k, { rarity = 'common' } = {}) {
    const notes = CATCH_NOTES[rarity] || CATCH_NOTES.common;
    notes.slice(0, 3).forEach((f, i) => k.tone({ freq: f, dur: 0.25, gain: 0.06, at: i * 0.08, reverb: 0.5 }));
  },

  // The line breaks.
  snap(k) {
    k.tone({ freq: 1500, to: 180, dur: 0.28, gain: 0.18, type: 'sawtooth' });
    k.noise({ dur: 0.08, gain: 0.25, filter: 'highpass', freq: 2500 });
  },

  // Fish got away / missed the bite.
  lose(k) {
    k.tone({ freq: 392, to: 330, dur: 0.18, gain: 0.14, type: 'triangle' });
    k.tone({ freq: 330, to: 247, dur: 0.3, gain: 0.14, at: 0.17, type: 'triangle' });
  },

  // Earned an achievement: a bright little fanfare.
  achievement(k) {
    [[NOTE.G5, 0], [NOTE.C6, 0.1], [NOTE.E6, 0.2], [NOTE.G6, 0.3], [NOTE.C7, 0.42]].forEach(([f, at]) =>
      k.tone({ freq: f, dur: 0.4, gain: 0.16, at, type: 'triangle', reverb: 0.5 }));
    k.tone({ freq: NOTE.C6, dur: 0.9, gain: 0.08, at: 0.42, reverb: 0.6 });
  },

  // Bought gear.
  coin(k) {
    k.tone({ freq: NOTE.E6, dur: 0.09, gain: 0.14 });
    k.tone({ freq: 1760, dur: 0.3, gain: 0.14, at: 0.08, reverb: 0.3 });
  },

  // Can't do that (not enough coins, cast onto land).
  error(k) {
    k.tone({ freq: 160, dur: 0.14, gain: 0.08, type: 'square' });
  },

  // The boat's horn: two long low blasts.
  horn(k) {
    for (const at of [0, 1.1]) {
      k.tone({ freq: 110, dur: 0.9, gain: 0.16, at, attack: 0.08, type: 'sawtooth', reverb: 0.8 });
      k.tone({ freq: 165, dur: 0.9, gain: 0.08, at, attack: 0.08, type: 'triangle', reverb: 0.8 });
    }
  },

  // A duel starts: a boxing-ring bell.
  duelStart(k) {
    for (const at of [0, 0.32]) {
      k.tone({ freq: 1250, dur: 0.9, gain: 0.14, at, reverb: 0.5 });
      k.tone({ freq: 2510, dur: 0.6, gain: 0.05, at, reverb: 0.5 });
    }
  },

  // Winning a duel: a short brass-like fanfare.
  duelWin(k) {
    [[NOTE.C5, 0, 0.18], [NOTE.C5, 0.18, 0.12], [NOTE.G5, 0.32, 0.18], [NOTE.C6, 0.52, 0.7]].forEach(([f, at, dur]) =>
      k.tone({ freq: f, dur, gain: 0.14, at, type: 'sawtooth', reverb: 0.4 }));
  },

  // A special event at sea: a rising shimmer.
  seaEvent(k) {
    [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7, NOTE.E7].forEach((f, i) =>
      k.tone({ freq: f, dur: 0.6, gain: 0.08, at: i * 0.07, type: 'triangle', reverb: 0.9 }));
    k.noise({ dur: 1.2, gain: 0.08, filter: 'highpass', freq: 4000, attack: 0.3, reverb: 0.6 });
  },

  // A sea monster roars from the deep.
  bossRoar(k) {
    k.tone({ freq: 70, to: 45, dur: 1.6, gain: 0.3, attack: 0.15, type: 'sawtooth', reverb: 0.9 });
    k.tone({ freq: 105, to: 60, dur: 1.4, gain: 0.15, attack: 0.2, type: 'square', reverb: 0.9 });
    k.noise({ dur: 1.5, gain: 0.2, filter: 'lowpass', freq: 400, to: 120, attack: 0.2, reverb: 0.8 });
  },

  // A crew mission is complete.
  mission(k) {
    k.tone({ freq: NOTE.G5, dur: 0.2, gain: 0.14, type: 'triangle' });
    k.tone({ freq: NOTE.C6, dur: 0.45, gain: 0.14, at: 0.12, type: 'triangle', reverb: 0.5 });
  },

  // ---- ambience one-shots (scheduled at random by the engine) ----

  // Small wave slapping the shore.
  lap(k) {
    k.noise({ dur: 0.6 + Math.random() * 0.6, gain: 0.05, filter: 'lowpass', freq: 900, to: 250, attack: 0.15 });
  },

  // A small songbird somewhere on the bank.
  bird(k) {
    const base = 2600 + Math.random() * 1400;
    const chirps = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < chirps; i++) {
      k.tone({ freq: base, to: base * (1.2 + Math.random() * 0.4), dur: 0.07, gain: 0.025, at: i * 0.11, reverb: 0.5 });
    }
  },

  // A gull crying overhead, out at sea.
  gull(k) {
    const f = 1500 + Math.random() * 400;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      k.tone({ freq: f, to: f * 0.7, dur: 0.22, gain: 0.03, at: i * 0.26, type: 'sawtooth', reverb: 0.6 });
    }
  },

  // A loon calling across the water: the sound of a big lake.
  loon(k) {
    const f = 560 + Math.random() * 60;
    k.tone({
      freq: f, dur: 2.2, gain: 0.035, attack: 0.35, reverb: 0.9, vibrato: { rate: 5.5, depth: 9 },
      glide: [[0.5, f * 1.42], [1.7, f * 1.3]],
    });
  },
};
