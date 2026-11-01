/** All sounds are synthesized with Web Audio (no files). On by default, but browsers only allow audio after a user gesture. */
export class Sound {
  muted = false;
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;

  /** True when sound is on but the browser is still refusing to start audio (needs a click or key press). */
  blocked = false;

  /** Create the audio graph right away. Without a user gesture it starts suspended and may be allowed later. */
  init() { this.build(); }

  /** Ask the browser to start audio; resolves once we know whether it was allowed. */
  async probe() {
    this.build();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* blocked */ } }
    await new Promise((r) => setTimeout(r, 150));
    this.blocked = !this.muted && ctx.state !== 'running';
  }

  /** Call from a user gesture (click, key, pointer). Safe to call repeatedly. */
  unlock() {
    this.build();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.ctx) this.blocked = false;
  }

  private build() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      // gentle limiter so dense crunch bursts add up without clipping
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 6;
      comp.attack.value = 0.002; comp.release.value = 0.12;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (!m) this.build();
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  private ready() {
    if (!this.ctx || !this.master || this.muted) return false;
    if (this.ctx.state !== 'running') { void this.ctx.resume().catch(() => {}); this.blocked = true; return false; }
    this.blocked = false;
    return true;
  }

  private burst(opts: { type: BiquadFilterType; freq: number; freqEnd?: number; q: number; gain: number; attack: number; decay: number; delay?: number }) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type;
    f.Q.value = opts.q;
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + opts.attack + opts.decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + opts.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.attack + opts.decay);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + opts.attack + opts.decay + 0.05);
  }

  /** One piece of the cookie giving way: a small, dry snap. `strength` 0..1 grows as the crack spreads. */
  snap(strength: number, delaySec = 0) {
    if (!this.ready()) return;
    const k = 0.15 + 0.35 * strength;
    this.burst({ type: 'bandpass', freq: 650 + Math.random() * 900, q: 0.9, gain: k, attack: 0.001, decay: 0.035 + Math.random() * 0.025, delay: delaySec });
    this.burst({ type: 'lowpass', freq: 420, q: 0.7, gain: k * 0.6, attack: 0.001, decay: 0.05, delay: delaySec });
  }

  /** Crispy cookie crack: a hard snap, then a dense, full-bodied crunch that rolls off, then crumbs landing. */
  crack() {
    if (!this.ready()) return;
    const g = (v: number) => Math.min(0.95, v * 1.25);
    // snap: sharp click plus a dry mid-range body
    this.burst({ type: 'highpass', freq: 1700, q: 0.7, gain: 0.95, attack: 0.0006, decay: 0.025 });
    this.burst({ type: 'bandpass', freq: 1150, q: 1.0, gain: 0.8, attack: 0.001, decay: 0.07 });
    this.burst({ type: 'lowpass', freq: 580, q: 0.7, gain: 0.5, attack: 0.001, decay: 0.06 });
    // crunch: ~40 overlapping grains across ~0.34 s, loud at first and thinning out.
    // Mixing low-mid grains (the "wa") with bright ones (the "sak") is what makes it read as crunch.
    const grains = 34 + Math.floor(Math.random() * 12);
    for (let i = 0; i < grains; i++) {
      const t = 0.004 + Math.pow(Math.random(), 1.25) * 0.34;
      const env = 1 - t / 0.4;
      const bright = Math.random() < 0.55;
      this.burst({
        type: 'bandpass',
        freq: bright ? 2100 + Math.random() * 3000 : 400 + Math.random() * 1350,
        q: 0.9 + Math.random() * 2.2,
        gain: g((0.25 + Math.random() * 0.35) * env * (bright ? 0.85 : 1.1)),
        attack: 0.0008, decay: 0.008 + Math.random() * 0.022, delay: t,
      });
    }
    // crumbs landing
    const m = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < m; i++) {
      this.burst({
        type: 'bandpass', freq: 2500 + Math.random() * 3300, q: 3,
        gain: 0.07 + Math.random() * 0.08, attack: 0.001, decay: 0.01 + Math.random() * 0.014,
        delay: 0.3 + Math.random() * 0.55,
      });
    }
  }

  /** Soft filtered noise sweep as the fortune strip rises. */
  paper(delaySec = 0) {
    if (!this.ready()) return;
    this.burst({ type: 'bandpass', freq: 1100, freqEnd: 3800, q: 0.8, gain: 0.045, attack: 0.2, decay: 0.45, delay: delaySec });
  }
}
