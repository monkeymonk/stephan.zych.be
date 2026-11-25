// 5. spin — 3D voxel ASCII render of the wordmark, rotating.
import { wordBitmap, reducedMotion, runTicker, injectStyle } from './core.js';
import type { BannerCtx, Banner } from './registry.js';

const CSS = `
  .sp-out { color: var(--sz-accent, #89b4fa); }
`;

function buildVoxelPoints(banner: Banner | null): Float32Array {
  const bitmap = wordBitmap(banner);
  const rows = bitmap.length;
  const cols = bitmap[0]?.length ?? 0;
  const depth = 4;
  const offsets = [0.17, 0.5, 0.83];
  const points: number[] = [];

  const isOn = (x: number, y: number): boolean => y >= 0 && y < rows && x >= 0 && x < cols && bitmap[y][x];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!bitmap[y][x]) continue;
      for (let z = 0; z < depth; z++) {
        const faces: Array<[number, number, number]> = [];
        if (z === 0) faces.push([0, 0, -1]);
        if (z === depth - 1) faces.push([0, 0, 1]);
        if (!isOn(x - 1, y)) faces.push([-1, 0, 0]);
        if (!isOn(x + 1, y)) faces.push([1, 0, 0]);
        if (!isOn(x, y - 1)) faces.push([0, -1, 0]);
        if (!isOn(x, y + 1)) faces.push([0, 1, 0]);

        for (const [nx, ny, nz] of faces) {
          for (const ox of offsets) {
            for (const oy of offsets) {
              let px = x + ox - cols / 2;
              let py = y + oy - rows / 2;
              let pz = z + 0.5 - depth / 2;
              if (nx !== 0) px = x + (nx > 0 ? 1 : 0) - cols / 2;
              if (ny !== 0) py = y + (ny > 0 ? 1 : 0) - rows / 2;
              if (nz !== 0) pz = z + (nz > 0 ? 1 : 0) - depth / 2;
              points.push(px, py, pz, nx, ny, nz);
            }
          }
        }
      }
    }
  }
  return new Float32Array(points);
}

const SPIN_SHADES = '.,-~:;=!*#$@';

function renderSpinFrame(points: Float32Array, ay: number, ax: number, cols: number, rows: number): string {
  const cosY = Math.cos(ay), sinY = Math.sin(ay);
  const cosX = Math.cos(ax), sinX = Math.sin(ax);
  const lx = -0.3, ly = -0.35, lz = -0.89;
  const llen = Math.hypot(lx, ly, lz);
  const nlx = lx / llen, nly = ly / llen, nlz = lz / llen;

  const zbuf = new Float32Array(cols * rows).fill(Infinity);
  const chars = new Array<string>(cols * rows).fill(' ');

  for (let i = 0; i < points.length; i += 6) {
    const x = points[i], y = points[i + 1], z = points[i + 2];
    const nx = points[i + 3], ny = points[i + 4], nz = points[i + 5];

    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;

    const nx1 = nx * cosY + nz * sinY;
    const nz1 = -nx * sinY + nz * cosY;
    const ny2 = ny * cosX - nz1 * sinX;
    const nz2 = ny * sinX + nz1 * cosX;

    if (nz2 > 0.05) continue;

    const f = 70 / (70 + z2);
    const u = Math.floor(cols / 2 + x1 * 1.6 * f);
    const v = Math.floor(rows / 2 + y2 * 1.0 * f);
    if (u < 0 || u >= cols || v < 0 || v >= rows) continue;

    const idx = v * cols + u;
    if (z2 >= zbuf[idx]) continue;
    zbuf[idx] = z2;

    const lum = Math.max(0, nx1 * nlx + ny2 * nly + nz2 * nlz);
    const shadeIndex = Math.min(SPIN_SHADES.length - 1, Math.round(lum * (SPIN_SHADES.length - 1)));
    chars[idx] = SPIN_SHADES[shadeIndex];
  }

  const outRows: string[] = [];
  for (let v = 0; v < rows; v++) {
    outRows.push(chars.slice(v * cols, (v + 1) * cols).join(''));
  }
  return outRows.join('\n');
}

export function mount(host: HTMLElement, ctx: BannerCtx): () => void {
  injectStyle(host, CSS);
  const { cols, rows } = ctx;
  const out = document.createElement('pre');
  out.className = 'sp-out';
  host.append(out);

  const points = buildVoxelPoints(ctx.banner);
  if (points.length === 0) return () => {};

  if (reducedMotion.matches) {
    out.textContent = renderSpinFrame(points, 0.25, 0.12, cols, rows);
    return () => {};
  }

  const start = performance.now();
  const stop = runTicker(host, 30, now => {
    const t = now - start;
    const ay = 0.4 * Math.sin(t * 0.0011);
    const ax = 0.12 + 0.08 * Math.sin(t * 0.0007);
    out.textContent = renderSpinFrame(points, ay, ax, cols, rows);
  });

  return () => stop();
}
