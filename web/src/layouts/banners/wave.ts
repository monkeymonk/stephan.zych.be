// 9. wave - sine scroller, name stays put, columns bob vertically.
import { wordBitmap, padLines, halfBlock, runTicker, injectStyle, staticMotion } from './core.js';
import type { BannerCtx } from './registry.js';

const CSS = `
  .wv-stars { color: var(--sz-overlay0, #6c7086); }
  .wv-c0 { color: var(--sz-blue, #89b4fa); }
  .wv-c1 { color: var(--sz-mauve, #cba6f7); }
  .wv-c2 { color: var(--sz-pink, #f5c2e7); }
`;

const WAVE_LAYER_CLASSES = ['wv-c0', 'wv-c1', 'wv-c2'];

interface WaveStar {
  row: number;
  col: number;
  speed: number;
  ch: string;
}

export function mount(host: HTMLElement, ctx: BannerCtx): () => void {
  injectStyle(host, CSS);
  const { cols: WAVE_W, rows: WAVE_H } = ctx;
  const bitmap = wordBitmap(ctx.banner);
  const bitmapWidth = bitmap[0]?.length ?? 0;
  const bitmapHeight = bitmap.length;
  const pixelRows = WAVE_H * 2;
  const colOffset = Math.max(0, Math.floor((WAVE_W - bitmapWidth) / 2));
  const baseDy = Math.max(0, Math.floor((pixelRows - bitmapHeight) / 2));
  const starCount = Math.max(1, Math.round((WAVE_W * WAVE_H) / 40));

  const starsLayer = document.createElement('pre');
  starsLayer.className = 'wv-stars';
  const nameLayers = WAVE_LAYER_CLASSES.map(cls => {
    const pre = document.createElement('pre');
    pre.className = cls;
    return pre;
  });
  host.append(starsLayer, ...nameLayers);

  if (bitmapHeight === 0) return () => {};

  const stars: WaveStar[] = Array.from({ length: starCount }, () => ({
    row: Math.floor(Math.random() * WAVE_H),
    col: Math.random() * WAVE_W,
    speed: 0.3 + Math.random() * 0.9,
    ch: Math.random() < 0.5 ? '.' : '*',
  }));

  const renderFrame = (t: number, staticDy: number | null, animateStars: boolean) => {
    const canvas: boolean[][] = Array.from({ length: pixelRows }, () => new Array(WAVE_W).fill(false));
    for (let x = 0; x < bitmapWidth; x++) {
      const dy = staticDy ?? Math.round(baseDy + 3 * Math.sin(t * 0.003 + x * 0.1));
      const cx = x + colOffset;
      if (cx < 0 || cx >= WAVE_W) continue;
      for (let y = 0; y < bitmapHeight; y++) {
        const cy = y + dy;
        if (bitmap[y][x] && cy >= 0 && cy < pixelRows) canvas[cy][cx] = true;
      }
    }
    const nameLines = padLines(halfBlock(canvas));
    const bucketRows: string[][] = [[], [], []];
    for (let row = 0; row < nameLines.length; row++) {
      const bucketLines = ['', '', ''];
      for (let col = 0; col < WAVE_W; col++) {
        const ch = nameLines[row][col];
        if (ch === ' ') {
          bucketLines[0] += ' '; bucketLines[1] += ' '; bucketLines[2] += ' ';
          continue;
        }
        const bucket = Math.floor((col + t * 0.02) / 6) % 3;
        for (let b = 0; b < 3; b++) bucketLines[b] += b === bucket ? ch : ' ';
      }
      for (let b = 0; b < 3; b++) bucketRows[b].push(bucketLines[b]);
    }
    for (let b = 0; b < 3; b++) nameLayers[b].textContent = bucketRows[b].join('\n');

    const starGrid: string[][] = Array.from({ length: WAVE_H }, () => new Array(WAVE_W).fill(' '));
    for (const star of stars) {
      if (animateStars) {
        star.col -= star.speed;
        if (star.col < 0) star.col += WAVE_W;
      }
      const col = Math.floor(star.col);
      if (nameLines[star.row]?.[col] === ' ') starGrid[star.row][col] = star.ch;
    }
    starsLayer.textContent = starGrid.map(r => r.join('')).join('\n');
  };

  if (staticMotion(host)) {
    renderFrame(0, baseDy, false);
    return () => {};
  }

  const start = performance.now();
  const stop = runTicker(host, 30, now => {
    renderFrame(now - start, null, true);
  });
  return () => stop();
}
