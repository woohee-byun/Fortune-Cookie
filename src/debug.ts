import type { P3 } from './fist';

const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

export class DebugOverlay {
  private ctx: CanvasRenderingContext2D;
  visible = false;
  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = 320; canvas.height = 240;
    this.ctx = canvas.getContext('2d')!;
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyD' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) this.toggle();
    });
  }
  toggle() { this.visible = !this.visible; this.canvas.hidden = !this.visible; }

  draw(video: HTMLVideoElement, image: P3[] | null, raw: number, smoothed: number, state: string) {
    if (!this.visible) return;
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w, 0); ctx.scale(-1, 1); // mirror like a mirror
    if (video.readyState >= 2) ctx.drawImage(video, 0, 0, w, h);
    if (image) {
      ctx.strokeStyle = '#7cf'; ctx.lineWidth = 1.5;
      for (const [a, b] of CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(image[a].x * w, image[a].y * h);
        ctx.lineTo(image[b].x * w, image[b].y * h);
        ctx.stroke();
      }
      ctx.fillStyle = '#fd5';
      for (const p of image) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 2.5, 0, 7); ctx.fill(); }
    }
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(`raw      ${raw.toFixed(3)}`, 8, 16);
    ctx.fillText(`smoothed ${smoothed.toFixed(3)}`, 8, 32);
    ctx.fillText(`state    ${state}`, 8, 48);
    ctx.fillStyle = '#333'; ctx.fillRect(8, h - 16, w - 16, 8);
    ctx.fillStyle = '#7cf'; ctx.fillRect(8, h - 16, (w - 16) * smoothed, 8);
  }
}
