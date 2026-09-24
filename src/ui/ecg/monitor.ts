import type { Ecg12 } from '../../engine/index.js';

/**
 * Sweeping monitor strip (lead II + V3): plays in real time while `playing`.
 * The caller advances `tMin` on a timer; this draws the latest ECG as a
 * left-to-right sweep with an erase bar, green phosphor style.
 */
export class Monitor {
  private raf = 0;
  private sweepX = 0;
  private lastTs = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private getEcg: () => Ecg12 | null,
  ) {}

  start(): void {
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      this.draw(ts);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  private draw(ts: number): void {
    const ctx = this.canvas.getContext('2d');
    const ecg = this.getEcg();
    if (!ctx || !ecg) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 120;
    if (this.canvas.width !== Math.round(w * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0e12';
    ctx.fillRect(0, 0, w, h);

    const dt = Math.min(ts - this.lastTs, 100);
    this.lastTs = ts;
    const pxPerS = w / 10; // 10 s window
    this.sweepX = (this.sweepX + (dt / 1000) * pxPerS) % w;

    const rows: Array<{ lead: 'II' | 'V3'; y0: number }> = [
      { lead: 'II', y0: h * 0.28 },
      { lead: 'V3', y0: h * 0.72 },
    ];
    const scale = h * 0.18; // px per mV (≈10 mm/mV at 130px row)

    for (const { lead, y0 } of rows) {
      const sig = ecg.leads[lead];
      const n = Math.min(sig.length, Math.round(10 * ecg.fs));
      ctx.strokeStyle = '#3ef0c8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / ecg.fs) * pxPerS;
        const y = y0 - sig[i]! * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#3ef0c8';
      ctx.font = '10px system-ui';
      ctx.fillText(lead, 4, y0 - h * 0.15);
    }

    // Sweep bar (erases ahead).
    ctx.fillStyle = 'rgb(10 14 18 / 0.85)';
    ctx.fillRect(this.sweepX, 0, w * 0.06, h);
    ctx.fillStyle = '#3ef0c8';
    ctx.fillRect(this.sweepX, 0, 2, h);
  }
}
