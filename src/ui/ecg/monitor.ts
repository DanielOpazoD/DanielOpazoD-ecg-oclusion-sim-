import type { Ecg12, LeadId } from '../../engine/index.js';
import type { Delineation } from '../../analysis/delineate/delineate.js';

/**
 * Sweeping bedside monitor (lead II + V1): left-to-right phosphor sweep
 * with erase bar, big HR numeric from the delineation, freeze toggle and
 * optional QRS beep via WebAudio. Honors prefers-reduced-motion by drawing
 * a static strip instead of animating.
 */
export class Monitor {
  private raf = 0;
  private sweepX = 0;
  private lastTs = 0;
  frozen = false;
  beepOn = false;
  private audio: AudioContext | null = null;
  private lastBeepBeat = -1;
  private readonly reducedMotion =
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

  constructor(
    private canvas: HTMLCanvasElement,
    private getEcg: () => Ecg12 | null,
    private getDelineation: () => Delineation | null = () => null,
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

  toggleFreeze(): void {
    this.frozen = !this.frozen;
  }
  toggleBeep(): void {
    this.beepOn = !this.beepOn;
    if (this.beepOn && !this.audio) {
      try {
        this.audio = new AudioContext();
      } catch {
        this.audio = null;
      }
    }
  }

  private beep(): void {
    if (!this.audio) return;
    const t = this.audio.currentTime;
    const osc = this.audio.createOscillator();
    const gain = this.audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(gain).connect(this.audio.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  private draw(ts: number): void {
    const ctx = this.canvas.getContext('2d');
    const ecg = this.getEcg();
    if (!ctx || !ecg) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 160;
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
    if (!this.frozen && !this.reducedMotion) {
      this.sweepX = (this.sweepX + (dt / 1000) * pxPerS) % w;
    }

    const rows: Array<{ lead: LeadId; y0: number }> = [
      { lead: 'II', y0: h * 0.28 },
      { lead: 'V1', y0: h * 0.68 },
    ];
    const scale = h * 0.16;

    const del = this.getDelineation();
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
      ctx.fillText(lead, 4, y0 - h * 0.16);
    }

    // Sweep bar (erases ahead).
    if (!this.reducedMotion) {
      ctx.fillStyle = 'rgb(10 14 18 / 0.85)';
      ctx.fillRect(this.sweepX, 0, w * 0.06, h);
      ctx.fillStyle = '#3ef0c8';
      ctx.fillRect(this.sweepX, 0, 2, h);
    }
    if (this.frozen) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = '600 11px system-ui';
      ctx.fillText('CONGELADO', w - 82, h - 8);
    }

    // Big HR numeric + beep on each QRS crossing the sweep bar.
    const hr = del?.hrBpm ?? null;
    ctx.fillStyle = '#3ef0c8';
    ctx.font = `700 ${Math.round(h * 0.3)}px system-ui`;
    ctx.textAlign = 'right';
    ctx.fillText(hr === null ? '--' : hr.toFixed(0), w - 14, h * 0.32);
    ctx.font = '11px system-ui';
    ctx.fillText('lpm', w - 14, h * 0.32 + 14);
    ctx.textAlign = 'left';

    if (this.beepOn && !this.frozen && del) {
      const sweepT = this.sweepX / pxPerS;
      const beat = del.beats.findIndex(
        (b, i) => Math.abs(b.rOnsetS - sweepT) < 0.05 && i !== this.lastBeepBeat,
      );
      if (beat >= 0) {
        this.lastBeepBeat = beat;
        this.beep();
      }
    }
  }
}
