import { config } from './config';

export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];
export interface Fragment {
  poly: Pt[];       // normalised 0..1 outline, with jagged edges
  cx: number; cy: number;
  start: number;    // crack progress at which this piece begins to separate
  rot: number;      // final tilt in degrees
  dx: number; dy: number; // unit direction it drifts when separating
}

/** Sutherland-Hodgman clip of a polygon to the half-plane of points closer to `a` than `b`. */
function clipCloser(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const nx = b[0] - a[0], ny = b[1] - a[1];
  const f = (p: Pt) => (p[0] - mx) * nx + (p[1] - my) * ny; // <= 0 keeps
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const fp = f(p), fq = f(q);
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

const noise = (x: number, y: number) =>
  Math.sin(x * 41 + y * 27) * 0.5 + Math.sin(x * 73 - y * 59 + 1.3) * 0.3 + Math.sin(x * 113 + y * 97 + 4.1) * 0.2;

/** Roughen an edge. Computed from a canonical direction so both neighbouring pieces get the same crack line. */
function jag(a: Pt, b: Pt): Pt[] {
  const flip = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const [p, q] = flip ? [b, a] : [a, b];
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const n = Math.max(1, Math.ceil(len / 0.035));
  const nx = -(q[1] - p[1]) / (len || 1), ny = (q[0] - p[0]) / (len || 1);
  const pts: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / n;
    const x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t;
    const d = k === 0 ? 0 : noise(x, y) * 0.011;
    pts.push([x + nx * d, y + ny * d]);
  }
  pts.push(q);
  // walk a->b and leave out b: the next edge starts there
  if (flip) pts.reverse();
  return pts.slice(0, -1);
}

/**
 * The whole cookie is cut into jagged pieces (a seeded Voronoi split). As the fist closes the pieces
 * separate a little, so cracks open along the cookie's own silhouette instead of lines drawn on top.
 */
export function generateCracks(seed: number): Fragment[] {
  const rand = mulberry32(seed);
  const cols = 3, rows = 3;
  const sites: Pt[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      sites.push([
        0.08 + ((c + 0.5 + (rand() - 0.5) * 0.95) / cols) * 0.84,
        0.05 + ((r + 0.5 + (rand() - 0.5) * 0.95) / rows) * 0.9,
      ]);

  const origin: Pt = [0.52, 0.1]; // cracks spread from the top of the fold
  return sites.map((s, i) => {
    let poly: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    sites.forEach((o, j) => { if (j !== i && poly.length) poly = clipCloser(poly, s, o); });
    const rough: Pt[] = [];
    for (let k = 0; k < poly.length; k++) rough.push(...jag(poly[k], poly[(k + 1) % poly.length]));
    const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
    const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
    let dx = cx - 0.5, dy = cy - 0.5 + 0.12;
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
    const dist = Math.hypot(cx - origin[0], cy - origin[1]);
    return {
      poly: rough, cx, cy,
      start: Math.min(0.55, dist * 0.7) + rand() * 0.06,
      rot: (rand() - 0.5) * 5, dx, dy,
    };
  });
}

export function progressFromAmount(amount: number) {
  const p = (amount - config.crackStart) / (config.crackFull - config.crackStart);
  return Math.min(1, Math.max(0, p));
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
let tmp: HTMLCanvasElement | null = null;

/** Draws the fractured cookie. Returns true when it painted (the plain <img> should then be hidden). */
export function drawCracks(
  canvas: HTMLCanvasElement,
  cookie: HTMLImageElement,
  frags: Fragment[],
  amount: number,
): boolean {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const p = progressFromAmount(amount);
  if (p <= 0 || !cookie.complete || !w) return false;

  tmp ??= document.createElement('canvas');
  const px = w / 300;
  const maxMove = 0.02 * w;

  for (const f of frags) {
    // hairline first; the pieces only drift apart near the end, letting the background show through
    const open = clamp01((p - 0.55 - f.start * 0.35) / 0.45);
    const seen = clamp01((p - f.start) / 0.1);
    const e = open * open * (3 - 2 * open);

    // piece bounds in pixels
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (const [x, y] of f.poly) {
      x0 = Math.min(x0, x * w); y0 = Math.min(y0, y * h); x1 = Math.max(x1, x * w); y1 = Math.max(y1, y * h);
    }
    x0 = Math.floor(x0 - 2); y0 = Math.floor(y0 - 2);
    const bw = Math.ceil(x1 - x0 + 4), bh = Math.ceil(y1 - y0 + 4);
    if (tmp.width < bw || tmp.height < bh) { tmp.width = Math.max(tmp.width, bw); tmp.height = Math.max(tmp.height, bh); }
    const t = tmp.getContext('2d')!;
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.clearRect(0, 0, tmp.width, tmp.height);

    t.save();
    t.translate(-x0, -y0);
    t.beginPath();
    f.poly.forEach(([x, y], i) => (i ? t.lineTo(x * w, y * h) : t.moveTo(x * w, y * h)));
    t.closePath();
    t.clip();
    t.drawImage(cookie, 0, 0, w, h);
    // hairline only while the crack is still closed; once it opens there is no outline, just the gap
    t.globalCompositeOperation = 'source-atop';
    t.lineJoin = 'round';
    t.strokeStyle = `rgba(110,64,26,${0.3 * seen * (1 - e)})`;
    t.lineWidth = 0.9 * px;
    t.stroke();
    t.restore();

    ctx.save();
    const cx = f.cx * w, cy = f.cy * h;
    ctx.translate(cx + f.dx * maxMove * e, cy + f.dy * maxMove * e);
    ctx.rotate((f.rot * e * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    // soft shadow once a piece has lifted away, so it reads as a separate piece resting on the paper
    if (e > 0.02) {
      ctx.shadowColor = `rgba(70, 45, 25, ${0.4 * e})`;
      ctx.shadowBlur = 7 * px;
      ctx.shadowOffsetX = -1.5 * px;
      ctx.shadowOffsetY = 2.5 * px;
    }
    ctx.drawImage(tmp, 0, 0, bw, bh, x0, y0, bw, bh);
    ctx.restore();
  }
  return true;
}
