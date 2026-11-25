// 7. plasma — colour-cycling plasma field filling the name.
import { artFor, centerInStage, injectStyle } from './core.js';
import type { BannerCtx } from './registry.js';
import { runTicker, reducedMotion } from './core.js';

const CSS = `
  .pl-bg { color: var(--sz-overlay0, #6c7086); opacity: .55; }
  .pl-c0 { color: var(--sz-mauve, #cba6f7); }
  .pl-c1 { color: var(--sz-blue, #89b4fa); }
  .pl-c2 { color: var(--sz-teal, #94e2d5); }
  .pl-c3 { color: var(--sz-green, #a6e3a1); }
  .pl-c4 { color: var(--sz-pink, #f5c2e7); }
`;

const PLASMA_RAMP = '.:-=+*#%@';
const PLASMA_BG_RAMP = '.:-+';
const PLASMA_LAYER_CLASSES = ['pl-c0', 'pl-c1', 'pl-c2', 'pl-c3', 'pl-c4'];

export function mount(host: HTMLElement, ctx: BannerCtx): () => void {
  injectStyle(host, CSS);
  const { cols: PLASMA_W, rows: PLASMA_H } = ctx;
  const art = artFor(ctx.banner);
  const layers = PLASMA_LAYER_CLASSES.map(cls => {
    const pre = document.createElement('pre');
    pre.className = cls;
    return pre;
  });
  const bgLayer = document.createElement('pre');
  bgLayer.className = 'pl-bg';
  host.append(bgLayer, ...layers);

  if (art.length === 0) return () => {};

  const stageArt = centerInStage(art, PLASMA_W, PLASMA_H);
  const onMask: boolean[][] = stageArt.map(line => Array.from(line).map(ch => ch !== ' '));

  const renderFrame = (t: number) => {
    const lineBufs: string[][] = PLASMA_LAYER_CLASSES.map(() => []);
    const bgLines: string[] = [];
    for (let row = 0; row < PLASMA_H; row++) {
      const rowBufs = PLASMA_LAYER_CLASSES.map(() => new Array<string>(PLASMA_W).fill(' '));
      const bgRow = new Array<string>(PLASMA_W).fill(' ');
      for (let col = 0; col < PLASMA_W; col++) {
        const x = col, y = row;
        const v = (
          Math.sin(x * 0.16 + t) +
          Math.sin(y * 0.35 - t * 1.3) +
          Math.sin((x + y) * 0.09 + t * 0.7) +
          Math.sin(Math.hypot(x - PLASMA_W / 2, y - PLASMA_H / 2) * 0.22 - t * 1.6)
        ) / 4;
        const norm = (v + 1) / 2;
        const charIndex = Math.min(PLASMA_RAMP.length - 1, Math.floor(norm * PLASMA_RAMP.length));
        if (!onMask[row][col]) {
          // Background field: sparse and dim so the name stays the focus.
          if (norm > 0.55) bgRow[col] = PLASMA_BG_RAMP[Math.min(PLASMA_BG_RAMP.length - 1, Math.floor((norm - 0.55) / 0.45 * PLASMA_BG_RAMP.length))];
          continue;
        }
        const bucket = Math.floor(((norm + t * 0.05) % 1) * 5) % 5;
        rowBufs[bucket][col] = PLASMA_RAMP[charIndex];
      }
      for (let i = 0; i < rowBufs.length; i++) lineBufs[i].push(rowBufs[i].join(''));
      bgLines.push(bgRow.join(''));
    }
    for (let i = 0; i < layers.length; i++) layers[i].textContent = lineBufs[i].join('\n');
    bgLayer.textContent = bgLines.join('\n');
  };

  if (reducedMotion.matches) {
    renderFrame(0);
    return () => {};
  }

  const start = performance.now();
  const stop = runTicker(host, 24, now => {
    renderFrame((now - start) * 0.0012);
  });
  return () => stop();
}
