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

  latest() {
    return this.snaps.at(-1)?.snapshot ?? null;
  }

  /** Players at render time `now`, positions interpolated between snapshots. */
  samplePlayers(now) {
    if (!this.snaps.length) return [];
    const target = now - this.delayMs;
    let older = null;
    let newer = null;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].time <= target) {
        older = this.snaps[i];
        newer = this.snaps[i + 1] ?? null;
        break;
      }
    }
    if (!older) return this.snaps[0].snapshot.players.map((p) => ({ ...p }));
    if (!newer) return older.snapshot.players.map((p) => ({ ...p }));

    const t = (target - older.time) / Math.max(1, newer.time - older.time);
    const prev = new Map(older.snapshot.players.map((p) => [p.id, p]));
    return newer.snapshot.players.map((p) => {
      const a = prev.get(p.id);
      if (!a) return { ...p };
      return { ...p, x: lerp(a.x, p.x, t), y: lerp(a.y, p.y, t), f: lerpAngle(a.f, p.f, t) };
    });
  }
}
