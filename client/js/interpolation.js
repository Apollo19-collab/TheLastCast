// Buffers server snapshots and renders other players slightly in the past so
// their movement looks smooth between 20 Hz updates.

const lerp = (a, b, t) => a + (b - a) * t;

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class SnapshotBuffer {
  constructor(delayMs = 100) {
    this.delayMs = delayMs;
    this.snaps = [];
  }

  push(snapshot) {
    this.snaps.push({ time: performance.now(), snapshot });
    if (this.snaps.length > 30) this.snaps.shift();
  }

  /** Forget everything (e.g. after moving between the lake and the sea). */
  clear() {
    this.snaps = [];
  }

  latest() {
    return this.snaps.at(-1)?.snapshot ?? null;
  }

  /** The two snapshots around render time `now`, and how far between them. */
  bracket(now) {
    const target = now - this.delayMs;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].time <= target) {
        const older = this.snaps[i];
        const newer = this.snaps[i + 1] ?? null;
        const t = newer ? (target - older.time) / Math.max(1, newer.time - older.time) : 0;
        return { older: older.snapshot, newer: newer?.snapshot ?? null, t };
      }
    }
    return { older: this.snaps[0]?.snapshot ?? null, newer: null, t: 0 };
  }

  /** Players at render time `now`, positions interpolated between snapshots. */
  samplePlayers(now) {
    const { older, newer, t } = this.bracket(now);
    if (!older) return [];
    if (!newer) return older.players.map((p) => ({ ...p }));
    const prev = new Map(older.players.map((p) => [p.id, p]));
    return newer.players.map((p) => {
      const a = prev.get(p.id);
      if (!a) return { ...p };
      return { ...p, x: lerp(a.x, p.x, t), y: lerp(a.y, p.y, t), f: lerpAngle(a.f, p.f, t) };
    });
  }

  /** The visiting boat at render time `now`, in step with the players on it. */
  sampleBoat(now) {
    const { older, newer, t } = this.bracket(now);
    const a = older?.boat;
    const b = newer?.boat;
    if (!a) return null;
    if (!b || a.x == null || b.x == null) return { ...(b ?? a) };
    return { ...b, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), h: lerpAngle(a.h, b.h, t) };
  }
}
