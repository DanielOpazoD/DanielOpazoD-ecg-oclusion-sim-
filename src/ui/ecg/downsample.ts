/**
 * Per-column min/max rasterizer: for each output pixel column keep the min
 * and max sample value in its sample window, then stroke the vertical span.
 * Preserves narrow transients (pacing spikes ~2–4 ms) that plain decimation
 * would alias away. Same trick as the paper recorder in simuladorecg.
 */
export interface MinMaxColumn {
  min: number;
  max: number;
}

/** Reduce `sig` (samples) into `columns` pixel columns, each min/max pair. */
export function minMaxDownsample(sig: ArrayLike<number>, columns: number): MinMaxColumn[] {
  const out = new Array<MinMaxColumn>(columns);
  const n = sig.length;
  for (let c = 0; c < columns; c++) {
    const a = Math.floor((c * n) / columns);
    const b = Math.max(a + 1, Math.floor(((c + 1) * n) / columns));
    let min = Infinity;
    let max = -Infinity;
    for (let i = a; i < b && i < n; i++) {
      const v = sig[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[c] = { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
  }
  return out;
}

/**
 * Stroke a signal into a canvas path using min/max columns. A 4 ms spike at
 * fs 500 is ~2 samples wide — with min/max rasterization every window keeps
 * its excursion, so the spike survives any zoom level.
 */
export function strokeMinMax(
  ctx: CanvasRenderingContext2D,
  sig: ArrayLike<number>,
  fs: number,
  x0: number,
  y0: number,
  pxPerS: number,
  yScale: number,
  nSamples?: number,
  offset = 0,
): void {
  const n = Math.min(sig.length - offset, nSamples ?? sig.length);
  if (n <= 0) return;
  const widthPx = Math.max(1, Math.round((n / fs) * pxPerS));
  // Few samples per pixel → plain polyline is cheaper and smoother.
  if (n / widthPx <= 2) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x0 + (i / fs) * pxPerS;
      const py = y0 - sig[offset + i]! * yScale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    return;
  }
  const cols = minMaxDownsample(
    Array.from({ length: n }, (_, k) => sig[offset + k]!),
    widthPx,
  );
  ctx.beginPath();
  const prevY = y0 - ((cols[0]!.min + cols[0]!.max) / 2) * yScale;
  ctx.moveTo(x0, prevY);
  for (let c = 0; c < cols.length; c++) {
    const { min, max } = cols[c]!;
    const px = x0 + c;
    const yMin = y0 - max * yScale; // larger value → higher on screen
    const yMax = y0 - min * yScale;
    if (yMax - yMin < 0.6) {
      ctx.lineTo(px, (yMin + yMax) / 2);
    } else {
      ctx.moveTo(px, yMin);
      ctx.lineTo(px, yMax);
    }
  }
  ctx.stroke();
}
