// 11. stack - tetris-ish build of the name, then line-clear and repeat.
import { wordBitmap, padLines, halfBlock, centerBitmap, reducedMotion, runTicker, injectStyle } from './core.js';
import type { BannerCtx } from './registry.js';

const CSS = `
  .sk-landed { color: var(--sz-accent, #89b4fa); }
  .sk-falling { color: var(--sz-peach, #fab387); }
`;

const STACK_BATCH_MS = 60;
const STACK_HOLD_MS = 4000;

interface StackPiece {
  blockRow: number;
  blockCol: number;
  pixelRow: number;
  landed: boolean;
  launchAt: number;
}

function buildStackPieces(bitmap: boolean[][], blockRows: number, blockCols: number): StackPiece[] {
  const groups = new Map<number, StackPiece[]>();
  for (let br = 0; br < blockRows; br++) {
    for (let bc = 0; bc < blockCols; bc++) {
      const r0 = br * 2, c0 = bc * 2;
      const hasPixel = bitmap[r0][c0] || bitmap[r0][c0 + 1] || bitmap[r0 + 1][c0] || bitmap[r0 + 1][c0 + 1];
      if (!hasPixel) continue;
      const piece: StackPiece = { blockRow: br, blockCol: bc, pixelRow: -2, landed: false, launchAt: 0 };
      if (!groups.has(br)) groups.set(br, []);
      groups.get(br)!.push(piece);
    }
  }
  const order: StackPiece[] = [];
  for (let br = blockRows - 1; br >= 0; br--) {
    const group = groups.get(br);
    if (!group) continue;
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
    order.push(...group);
  }
  order.forEach((p, i) => { p.launchAt = Math.floor(i / 4) * STACK_BATCH_MS; });
  return order;
}

export function mount(host: HTMLElement, ctx: BannerCtx): () => void {
  injectStyle(host, CSS);
  const { cols: STACK_COLS_PX, rows: STACK_ROWS } = ctx;
  const landedLayer = document.createElement('pre');
  landedLayer.className = 'sk-landed';
  const fallingLayer = document.createElement('pre');
  fallingLayer.className = 'sk-falling';
  host.append(landedLayer, fallingLayer);

  const pixelH = STACK_ROWS * 2;
  const pixelW = STACK_COLS_PX;
  const blockCols = Math.floor(pixelW / 2);

  const bitmap = centerBitmap(wordBitmap(ctx.banner), pixelW, STACK_ROWS);

  if (bitmap.length === 0) return () => {};

  if (reducedMotion.matches) {
    landedLayer.textContent = padLines(halfBlock(bitmap)).join('\n');
    fallingLayer.textContent = '';
    return () => {};
  }

  let pieces = buildStackPieces(bitmap, STACK_ROWS, blockCols);
  let cycleStart = performance.now();
  let phase: 'drop' | 'hold' | 'clear' = 'drop';
  let clearRow = 0;
  let lastClearStep = cycleStart;
  const clearStepMs = 600 / (STACK_ROWS + 1);

  const renderDrop = (elapsed: number) => {
    const canvas: boolean[][] = Array.from({ length: pixelH }, () => new Array(pixelW).fill(false));
    const fallingCanvas: boolean[][] = Array.from({ length: pixelH }, () => new Array(pixelW).fill(false));
    for (const p of pieces) {
      if (elapsed < p.launchAt) continue;
      const targetPixelRow = p.blockRow * 2;
      if (!p.landed) {
        const dt = elapsed - p.launchAt;
        const pr = -2 + dt * 0.9 * (30 / 1000);
        if (pr >= targetPixelRow) {
          p.landed = true;
          p.pixelRow = targetPixelRow;
        } else {
          p.pixelRow = pr;
        }
      }
      const target = p.landed ? canvas : fallingCanvas;
      const r0 = Math.round(p.pixelRow);
      const c0 = p.blockCol * 2;
      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          const rr = r0 + dr;
          if (rr >= 0 && rr < pixelH && bitmap[p.blockRow * 2 + dr][c0 + dc]) target[rr][c0 + dc] = true;
        }
      }
    }
    landedLayer.textContent = padLines(halfBlock(canvas)).join('\n');
    fallingLayer.textContent = padLines(halfBlock(fallingCanvas)).join('\n');
  };

  const allLanded = () => pieces.every(p => p.landed);

  const startCycle = () => {
    pieces = buildStackPieces(bitmap, STACK_ROWS, blockCols);
    cycleStart = performance.now();
    phase = 'drop';
  };

  const stop = runTicker(host, 30, now => {
    const elapsed = now - cycleStart;
    if (phase === 'drop') {
      renderDrop(elapsed);
      if (allLanded()) {
        phase = 'hold';
        cycleStart = now;
      }
      return;
    }
    if (phase === 'hold') {
      if (elapsed >= STACK_HOLD_MS) {
        phase = 'clear';
        cycleStart = now;
        lastClearStep = now;
        clearRow = 0;
      }
      return;
    }
    if (now - lastClearStep >= clearStepMs) {
      lastClearStep = now;
      const canvas: boolean[][] = Array.from({ length: pixelH }, (_, r) =>
        Math.floor(r / 2) < clearRow ? new Array(pixelW).fill(false) : bitmap[r].slice(),
      );
      landedLayer.textContent = padLines(halfBlock(canvas)).join('\n');
      fallingLayer.textContent = '';
      clearRow++;
      if (clearRow > STACK_ROWS) startCycle();
    }
  });

  return () => stop();
}
