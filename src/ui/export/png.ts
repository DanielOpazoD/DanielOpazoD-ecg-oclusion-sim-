/**
 * PNG export at 300 dpi with a pHYs chunk (pixels-per-meter) so viewers
 * honor physical scale. The source canvas is redrawn offscreen at the
 * requested DPI before encoding.
 */

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function crc32(buf: Uint8Array): number {
  let c: number;
  const table: number[] = ((crc32 as { t?: number[] }).t ??= (() => {
    const t: number[] = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Insert a pHYs chunk (ppmX = ppmY = dpi/0.0254) into a PNG blob. */
export async function withPhysDpi(blob: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIG[i]) return blob;
  const ppm = Math.round(dpi / 0.0254);
  const phys = new Uint8Array(9);
  const dv = new DataView(phys.buffer);
  dv.setUint32(0, ppm);
  dv.setUint32(4, ppm);
  phys[8] = 1; // unit: metre
  const physChunk = chunk('pHYs', phys);
  const out = new Uint8Array(bytes.length + physChunk.length);
  out.set(bytes.subarray(0, 8), 0);
  out.set(physChunk, 8);
  out.set(bytes.subarray(8), 8 + physChunk.length);
  return new Blob([out.buffer], { type: 'image/png' });
}

/** Re-render the source canvas scaled for `dpi` and download as PNG. */
export async function exportPng300(
  source: HTMLCanvasElement,
  redraw: (canvas: HTMLCanvasElement) => void,
  footer: string,
  name = 'ecg.png',
): Promise<void> {
  const dpi = 300;
  const scale = dpi / 96;
  const off = document.createElement('canvas');
  off.width = Math.round(source.clientWidth * scale);
  off.height = Math.round(source.clientHeight * scale + 80); // footer strip
  // CSS px → canvas px at this dpi: scale so redraw sees the same cssW.
  Object.defineProperty(off, 'clientWidth', { value: source.clientWidth });
  Object.defineProperty(off, 'clientHeight', { value: source.clientHeight });
  const dprSpy = scale;
  const prevDpr = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
  Object.defineProperty(window, 'devicePixelRatio', { value: dprSpy, configurable: true });
  try {
    redraw(off);
  } finally {
    if (prevDpr) Object.defineProperty(window, 'devicePixelRatio', prevDpr);
  }
  const ctx = off.getContext('2d');
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fbf7ef';
    ctx.fillRect(0, off.height - 80, off.width, 80);
    ctx.fillStyle = '#444';
    ctx.font = `${Math.round(11 * scale)}px system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText(footer, Math.round(12 * scale), off.height - 40);
  }
  await new Promise<void>((resolve) => {
    off.toBlob((blob) => {
      void (async () => {
        if (!blob) return resolve();
        const phys = await withPhysDpi(blob, dpi);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(phys);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
        resolve();
      })();
    }, 'image/png');
  });
}
