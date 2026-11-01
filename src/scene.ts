import { config } from './config';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

interface Crumb { el: HTMLImageElement; x: number; y: number; vx: number; vy: number; rot: number; spin: number; age: number }

/** Builds a few extra crumbs by clipping random polygons out of the texture swatch. */
function makeProceduralCrumbs(swatch: HTMLImageElement, n: number): string[] {
  const urls: string[] = [];
  for (let i = 0; i < n; i++) {
    const size = 14 + Math.random() * 22;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * 2);
    const ctx = c.getContext('2d')!;
    const sides = 5 + Math.floor(Math.random() * 3);
    ctx.beginPath();
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + Math.random() * 0.5;
      const r = size * (0.55 + Math.random() * 0.45);
      const x = size + Math.cos(a) * r, y = size + Math.sin(a) * r;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(swatch, -Math.random() * (swatch.naturalWidth - c.width), -Math.random() * (swatch.naturalHeight - c.height));
    urls.push(c.toDataURL('image/png'));
  }
  return urls;
}

/** Slightly rough, uneven paper edge via clip-path. */
function roughEdge(): string {
  const j = () => (Math.random() * 1.6).toFixed(2);
  const pts: string[] = [];
  for (let x = 0; x <= 100; x += 6) pts.push(`${x}% ${j()}%`);
  for (let y = 10; y < 100; y += 18) pts.push(`${(100 - Number(j()) * 0.6).toFixed(2)}% ${y}%`);
  for (let x = 100; x >= 0; x -= 6) pts.push(`${x}% ${(100 - Number(j())).toFixed(2)}%`);
  for (let y = 90; y > 0; y -= 18) pts.push(`${(Number(j()) * 0.6).toFixed(2)}% ${y}%`);
  return `polygon(${pts.join(',')})`;
}

/** The broken-state timeline: halves, crumbs, fortune strip. Times are ms from the break. */
export class BrokenScene {
  private crumbs: Crumb[] = [];
  private t0 = 0;
  private lastNow = 0;
  private u = 1;           // display scale relative to a 420px-tall cookie
  private halfW = [0, 0];
  private halfH = [0, 0];
  private stripEndY = 0;
  private dragX = 0;
  private dragY = 0;
  private offY = 0;          // shifts the finished composition so it is vertically centred
  private procUrls: string[] = [];
  private cache = new Map<string, HTMLImageElement>();
  active = false;

  constructor(
    private els: {
      cookie: HTMLElement; cookieImg: HTMLImageElement; swatch: HTMLImageElement;
      halfL: HTMLImageElement; halfR: HTMLImageElement; strip: HTMLElement; text: HTMLElement;
      crumbLayer: HTMLElement; flash: HTMLElement; scene: HTMLElement;
    },
    private reduceMotion: boolean,
  ) {}

  /** Decode everything the break needs up front, so the first break doesn't stall the main thread. */
  preload() {
    const e = this.els;
    const warm = (img: HTMLImageElement) => img.decode?.().catch(() => {});
    warm(e.halfL); warm(e.halfR);
    const build = () => {
      if (!this.procUrls.length && e.swatch.naturalWidth) this.procUrls = makeProceduralCrumbs(e.swatch, 10);
      const urls = [
        ...Array.from({ length: 12 }, (_, i) => `${import.meta.env.BASE_URL}assets/crumb_${String(i + 1).padStart(2, '0')}.png`),
        ...this.procUrls,
      ];
      for (const url of urls) {
        if (this.cache.has(url)) continue;
        const img = new Image();
        img.src = url;
        warm(img);
        this.cache.set(url, img);
      }
    };
    if (e.swatch.complete) build(); else e.swatch.addEventListener('load', build, { once: true });
  }

  /** Lets the fortune strip be dragged around (the cookie pieces stay put). */
  enableDrag() {
    const strip = this.els.strip;
    let start: { x: number; y: number; dx: number; dy: number } | null = null;
    strip.addEventListener('pointerdown', (e) => {
      strip.setPointerCapture(e.pointerId);
      strip.classList.add('dragging');
      start = { x: e.clientX, y: e.clientY, dx: this.dragX, dy: this.dragY };
    });
    strip.addEventListener('pointermove', (e) => {
      if (!start) return;
      this.dragX = start.dx + e.clientX - start.x;
      this.dragY = start.dy + e.clientY - start.y;
    });
    const end = () => { start = null; strip.classList.remove('dragging'); };
    strip.addEventListener('pointerup', end);
    strip.addEventListener('pointercancel', end);
  }

  private fitText() {
    // two lines at most: shrink the font slightly instead of overflowing
    const { strip, text } = this.els;
    let size = 18;
    text.style.fontSize = `${size}px`;
    while (size > 12 && text.scrollHeight > text.clientHeight + 1) {
      size -= 0.5;
      text.style.fontSize = `${size}px`;
    }
    void strip;
  }

  start(now: number, message: string) {
    const e = this.els;
    this.active = true;
    this.dragX = 0;
    this.dragY = 0;
    this.t0 = now;
    this.lastNow = now;
    const cookieH = e.cookie.offsetHeight;
    this.u = cookieH / 420;
    const k = (cookieH / e.cookieImg.naturalHeight) * config.halfScale;
    this.halfW = [e.halfL.naturalWidth * k, e.halfR.naturalWidth * k];
    this.halfH = [e.halfL.naturalHeight * k, e.halfR.naturalHeight * k];
    e.halfL.style.width = `${this.halfW[0]}px`;
    e.halfR.style.width = `${this.halfW[1]}px`;

    e.text.textContent = message;
    e.text.style.opacity = '0';
    e.scene.style.opacity = '1';
    e.scene.hidden = false;
    e.halfL.style.visibility = 'hidden';
    e.halfR.style.visibility = 'hidden';
    e.strip.style.opacity = '0';
    e.strip.style.clipPath = roughEdge();
    this.fitText();
    // settle just above the halves, tucked slightly behind them so it reads as sitting between the pieces
    const bottom = cookieH / 2 - 8 * this.u;
    const top = bottom - Math.max(...this.halfH);
    this.stripEndY = top - e.strip.offsetHeight * 0.2;
    const groupTop = this.stripEndY - e.strip.offsetHeight / 2;
    const groupBottom = bottom + 20 * this.u;
    this.offY = -(groupTop + groupBottom) / 2;

    this.spawnCrumbs();
  }

  private spawnCrumbs() {
    const e = this.els;
    if (!this.procUrls.length && e.swatch.naturalWidth) this.procUrls = makeProceduralCrumbs(e.swatch, 10);
    const png = Array.from({ length: 12 }, (_, i) => `${import.meta.env.BASE_URL}assets/crumb_${String(i + 1).padStart(2, '0')}.png`);
    const proc = [...this.procUrls].sort(() => Math.random() - 0.5).slice(0, 6 + Math.floor(Math.random() * 5));
    let urls = [...png, ...proc];
    if (this.reduceMotion) urls = urls.sort(() => Math.random() - 0.5).slice(0, 6);
    const cx = innerWidth / 2, cy = innerHeight / 2;
    for (const url of urls) {
      const el = (this.cache.get(url)?.cloneNode() as HTMLImageElement | undefined) ?? document.createElement('img');
      const size = () => { el.style.width = `${el.naturalWidth * this.u * 0.9}px`; };
      el.onload = size;                 // attach before src so a cached image can't slip past
      el.alt = '';
      el.draggable = false;
      el.className = 'crumb';
      el.style.display = 'none';
      el.src = url;
      if (el.complete && el.naturalWidth) size();
      e.crumbLayer.appendChild(el);
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.crumbs.push({
        el,
        x: cx + (Math.random() - 0.5) * 80 * this.u, y: cy - 10 * this.u + (Math.random() - 0.5) * 40,
        vx: dir * (120 + Math.random() * 480) * this.u,
        vy: -(450 + Math.random() * 650) * this.u,
        rot: Math.random() * 360, spin: (Math.random() - 0.5) * 900, age: 0,
      });
    }
  }

  /** Returns the cookie's pulse scale (the cookie element itself is driven by the caller). */
  update(now: number): { pulse: number; hideCookie: boolean } {
    const e = this.els;
    const t = now - this.t0;
    const dt = Math.min(0.05, (now - this.lastNow) / 1000);
    this.lastNow = now;
    const u = this.u;

    const pulse = t < 140 ? 1 + 0.06 * Math.sin((Math.PI * t) / 140) : 1;
    e.flash.style.opacity = String(0.25 * (1 - clamp01(t / 120)));

    // halves
    const swapped = t >= 60;
    e.halfL.style.visibility = e.halfR.style.visibility = swapped ? 'visible' : 'hidden';
    const p = easeOut(clamp01((t - 60) / 640));
    const drift = 20 * u * easeInOut(clamp01((t - 700) / 500));
    const bottom = e.cookie.offsetHeight / 2 - 8 * u;
    const shift = this.offY * p;
    const yL = bottom - this.halfH[0] / 2 + drift + shift, yR = bottom - this.halfH[1] / 2 + drift + shift;
    const spread = 140 * u * p;
    e.halfL.style.transform =
      `translate(calc(-50% + ${-this.halfW[0] / 2 - spread}px), calc(-50% + ${yL}px)) rotate(${-18 * p}deg) scale(${pulse})`;
    e.halfR.style.transform =
      `translate(calc(-50% + ${this.halfW[1] / 2 + spread}px), calc(-50% + ${yR}px)) rotate(${22 * p}deg) scale(${pulse})`;

    // fortune strip: rises from between the halves with a slight tilt
    const sp = easeOut(clamp01((t - 150) / 500));
    const startY = this.stripEndY + e.strip.offsetHeight * 0.9;
    const y = startY + (this.stripEndY - startY) * sp + drift + this.offY * Math.max(p, sp);
    e.strip.style.opacity = String(clamp01((t - 150) / 120));
    e.strip.style.transform = `translate(calc(-50% + ${this.dragX}px), calc(-50% + ${y + this.dragY}px)) rotate(-3deg)`;
    e.text.style.opacity = String(clamp01((t - 700) / 400));

    // crumbs
    for (const c of this.crumbs) {
      if (t < 60) continue;
      c.age += dt;
      c.vy += config.crumbGravity * u * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.spin * dt;
      const nearBottom = clamp01((c.y - (innerHeight - 140)) / 100);
      const life = clamp01((c.age - 1.3) / 0.3);
      const o = 1 - Math.max(nearBottom, life);
      c.el.style.display = o > 0 ? '' : 'none';
      c.el.style.opacity = String(o);
      c.el.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -50%) rotate(${c.rot}deg)`;
    }
    return { pulse, hideCookie: swapped };
  }

  /** Fade strip/halves/crumbs out; 0..1 progress. */
  fade(p: number) {
    this.els.scene.style.opacity = String(1 - p);
    this.els.crumbLayer.style.opacity = String(1 - p);
  }

  clear() {
    this.active = false;
    for (const c of this.crumbs) c.el.remove();
    this.crumbs = [];
    this.els.scene.hidden = true;
    this.els.scene.style.opacity = '1';
    this.els.crumbLayer.style.opacity = '1';
    this.els.flash.style.opacity = '0';
  }
}
