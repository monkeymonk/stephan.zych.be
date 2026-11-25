// 10. life — Conway's Game of Life seeded with the name.
import { wordBitmap, padLines, halfBlock, centerBitmap, reducedMotion, runTicker, injectStyle } from './core.js';
import type { BannerCtx } from './registry.js';

const CSS = `
  .lf-out { color: var(--sz-accent, #89b4fa); }
`;

const LIFE_HOLD_MS = 2500;
const LIFE_RUN_MS = 5000;
const LIFE_REASSEMBLE_MS = 1200;
const LIFE_STEP_MS = 125;

function lifeStep(grid: Uint8Array<ArrayBuffer>, width: number, height: number): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = (y + dy + height) % height;
          const nx = (x + dx + width) % width;
          neighbors += grid[ny * width + nx];
        }
      }
      const alive = grid[y * width + x] === 1;
      next[y * width + x] = alive ? (neighbors === 2 || neighbors === 3 ? 1 : 0) : (neighbors === 3 ? 1 : 0);
    }
  }
  return next;
}

function renderLifeGrid(layer: HTMLElement, grid: Uint8Array<ArrayBuffer>, width: number, height: number): void {
  const bitmap: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < width; x++) row.push(grid[y * width + x] === 1);
    bitmap.push(row);
  }
  layer.textContent = padLines(halfBlock(bitmap)).join('\n');
}

export function mount(host: HTMLElement, ctx: BannerCtx): () => void {
  injectStyle(host, CSS);
  const { cols: LIFE_W, rows: LIFE_H } = ctx;
  const pixelRows = LIFE_H * 2;
  const layer = document.createElement('pre');
  layer.className = 'lf-out';
  host.append(layer);

  const centered = centerBitmap(wordBitmap(ctx.banner), LIFE_W, LIFE_H);
  const target = new Uint8Array(LIFE_W * pixelRows);
  if (centered.length === 0) return () => {};
  for (let y = 0; y < pixelRows; y++) {
    for (let x = 0; x < LIFE_W; x++) target[y * LIFE_W + x] = centered[y][x] ? 1 : 0;
  }

  if (reducedMotion.matches) {
    renderLifeGrid(layer, target, LIFE_W, pixelRows);
    return () => {};
  }

  let grid = target.slice();
  let phase: 'hold' | 'life' | 'reassemble' = 'hold';
  let phaseStart = performance.now();
  let lastStep = phaseStart;
  let onSchedule: Float32Array | null = null;
  let offSchedule: Float32Array | null = null;

  renderLifeGrid(layer, grid, LIFE_W, pixelRows);

  const stop = runTicker(host, 24, now => {
    const elapsed = now - phaseStart;
    if (phase === 'hold') {
      if (elapsed >= LIFE_HOLD_MS) {
        phase = 'life';
        phaseStart = now;
        lastStep = now;
        grid = target.slice();
      }
      return;
    }
    if (phase === 'life') {
      if (now - lastStep >= LIFE_STEP_MS) {
        lastStep = now;
        grid = lifeStep(grid, LIFE_W, pixelRows);
        renderLifeGrid(layer, grid, LIFE_W, pixelRows);
      }
      if (elapsed >= LIFE_RUN_MS) {
        phase = 'reassemble';
        phaseStart = now;
        onSchedule = new Float32Array(LIFE_W * pixelRows);
        offSchedule = new Float32Array(LIFE_W * pixelRows);
        for (let i = 0; i < LIFE_W * pixelRows; i++) {
          onSchedule[i] = Math.random() * LIFE_REASSEMBLE_MS;
          offSchedule[i] = Math.random() * LIFE_REASSEMBLE_MS;
        }
      }
      return;
    }
    const onSched = onSchedule as Float32Array;
    const offSched = offSchedule as Float32Array;
    const next = new Uint8Array(LIFE_W * pixelRows);
    for (let i = 0; i < LIFE_W * pixelRows; i++) {
      const isTarget = target[i] === 1;
      const wasAlive = grid[i] === 1;
      if (isTarget) {
        next[i] = elapsed >= onSched[i] || wasAlive ? 1 : 0;
      } else {
        next[i] = wasAlive && elapsed < offSched[i] ? 1 : 0;
      }
    }
    grid = next;
    renderLifeGrid(layer, grid, LIFE_W, pixelRows);
    if (elapsed >= LIFE_REASSEMBLE_MS) {
      phase = 'hold';
      phaseStart = now;
      grid = target.slice();
      renderLifeGrid(layer, grid, LIFE_W, pixelRows);
    }
  });

  return () => stop();
}
