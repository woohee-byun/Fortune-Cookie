/** Pointer / keyboard fallback: holding raises an amount toward 1, releasing relaxes it. */
export class HoldInput {
  amount = 0;
  private held = new Set<string>();
  constructor(target: HTMLElement) {
    target.addEventListener('pointerdown', (e) => {
      target.setPointerCapture(e.pointerId);
      this.held.add('pointer');
    });
    const up = () => this.held.delete('pointer');
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    target.addEventListener('lostpointercapture', up);
    addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.held.add('key'); }
    });
    addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') this.held.delete('key');
    });
    addEventListener('blur', () => this.held.clear());
  }
  get holding() { return this.held.size > 0; }
  update(dtSec: number) {
    const target = this.holding ? 1 : 0;
    const rate = this.holding ? 0.7 : 1.6; // per second: slow squeeze, quicker release
    const d = target - this.amount;
    this.amount += Math.sign(d) * Math.min(Math.abs(d), rate * dtSec);
    return this.amount;
  }
}
