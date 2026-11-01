import { config } from './config';

export interface P3 { x: number; y: number; z: number }

const MCPS = [5, 9, 13, 17];
const TIPS = [8, 12, 16, 20];

const dist = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Raw fist amount 0..1 from world landmarks (aspect/rotation independent). Thumb ignored. */
export function computeFistRaw(world: P3[]): number {
  const wrist = world[0];
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const r = dist(world[TIPS[i]], wrist) / dist(world[MCPS[i]], wrist);
    sum += clamp01((config.r_open - r) / (config.r_open - config.r_closed));
  }
  return sum / 4;
}

/** Smooths the fist value and handles lost-hand hold + relax. Never jumps on tracking loss. */
export class FistSignal {
  smoothed = 0;
  raw = 0;
  private lastSeen = 0;
  private lostAt = 0;
  private valueAtLoss = 0;
  private hasHand = false;

  update(world: P3[] | null, now: number): number {
    if (world) {
      this.hasHand = true;
      this.lastSeen = now;
      this.raw = computeFistRaw(world);
      const a = config.fistSmoothingAlpha;
      this.smoothed += (this.raw - this.smoothed) * a;
    } else {
      if (this.hasHand) {
        this.hasHand = false;
        this.lostAt = now;
        this.valueAtLoss = this.smoothed;
      }
      const lostFor = now - this.lastSeen;
      if (lostFor > config.lostHandHoldMs) {
        const t = clamp01((lostFor - config.lostHandHoldMs) / config.lostHandRelaxMs);
        this.smoothed = this.valueAtLoss * (1 - t);
      }
    }
    return this.smoothed;
  }

  get handPresent() { return this.hasHand; }
  get lostMs() { return this.hasHand ? 0 : performance.now() - this.lostAt; }
}
