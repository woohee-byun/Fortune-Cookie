/** Warm paper fibre speckle, generated once on a canvas (re-generated only on resize). */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function paintPaper(canvas: HTMLCanvasElement) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth, h = innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const r = rng(1234);
  const count = Math.floor((w * h) / 90);
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h;
    ctx.globalAlpha = 0.04 + r() * 0.04;
    ctx.strokeStyle = '#7a6f64';
    ctx.fillStyle = '#7a6f64';
    if (r() < 0.7) {
      const len = 2 + r() * 7, a = r() * Math.PI * 2;
      ctx.lineWidth = 0.4 + r() * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 0.3 + r() * 0.7, 0, 7);
      ctx.fill();
    }
  }
}
