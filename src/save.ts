const PAPER = '#eeebe3';
const INK = '#25326b';
const ACCENT = '#34469a';

function roughPolygon(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const j = (m: number) => Math.random() * m;
  ctx.beginPath();
  for (let x = 0; x <= w; x += w / 18) ctx.lineTo(x, j(h * 0.014));
  for (let y = h * 0.1; y < h; y += h * 0.18) ctx.lineTo(w - j(w * 0.005), y);
  for (let x = w; x >= 0; x -= w / 18) ctx.lineTo(x, h - j(h * 0.012));
  for (let y = h * 0.9; y > 0; y -= h * 0.18) ctx.lineTo(j(w * 0.005), y);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Renders the fortune strip to a transparent PNG and downloads it. Everything stays in the browser. */
export async function saveFortune(text: string) {
  await document.fonts.load('48px Newsreader');
  const W = 1200, H = 380;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;

  ctx.save();
  roughPolygon(ctx, W, H);
  ctx.clip();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.4, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(120,105,80,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(120,105,80,${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random(), 1 + Math.random());
  }
  ctx.fillStyle = ACCENT;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(0, 0, W * 0.13, H * 0.22);
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0, H - 4, W * 0.13, 4);
  ctx.globalAlpha = 1;
  ctx.restore();

  const maxW = W - 220;
  let size = 52, lines: string[] = [];
  for (; size >= 28; size -= 2) {
    ctx.font = `${size}px Newsreader, Georgia, 'Times New Roman', serif`;
    lines = wrap(ctx, text, maxW);
    if (lines.length <= 2) break;
  }
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${size * 0.02}px`;
  const lh = size * 1.4;
  const y0 = H / 2 + 14 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, W / 2 + 20, y0 + i * lh));

  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  a.download = `fortune_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
