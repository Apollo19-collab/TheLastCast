// Fishing duels: one angler challenges another at the lake. Both fish with
// the same matched tackle for a few minutes; most points wins. Fish caught in
// a duel give no coins, score or Fish Index entries. Only the winner is
// paid, a flat prize. The server runs duels (server/duel.js).

export const DUEL = Object.freeze({
  duration: 180, // seconds of fishing
  countdown: 5, // seconds before lines can go out
  challengeTime: 20, // seconds to accept a challenge
  range: 160, // how close you must stand to challenge someone (world units)
  prize: 1000, // coins for the winner
  // The same pair of anglers can win the prize once per this many seconds,
  // so two friends can't farm coins by trading wins.
  rematchCooldown: 600,
  declineCooldown: 30, // seconds before you can re-challenge someone who said no
  // Matched tackle both duelists use. Their own loadout is untouched and
  // comes back when the duel ends.
  loadout: Object.freeze({ rod: 'carbon', reel: 'baitcaster', line: 'fluoro', bait: 'spinner' }),
});
