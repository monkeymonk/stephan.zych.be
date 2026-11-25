// 8. fire - doom-style fire rising from the name's silhouette.
import { artFor, reducedMotion, runTicker, injectStyle } from './core.js';
import type { BannerCtx } from './registry.js';

const CSS = `
  .fi-low { color: var(--sz-red, #f38ba8); }
  .fi-mid { color: var(--sz-peach, #fab387); }
  .fi-high { color: var(--sz-yellow, #f9e2af); }
  .fi-name { color: var(--sz-text, #cdd6f4); }
`;

export function mount(host: HTMLElement, ctx: BannerCtx): () => void {
  injectStyle(host, CSS);
  const { cols: FIRE_W, rows: FIRE_H } = ctx;
  const art = artFor(ctx.banner);
  const artWidth = art[0]?.length ?? 0;
  const artHeight = art.length;
  const lowLayer = document.createElement('pre');
  lowLayer.className = 'fi-low';
  const midLayer = document.createElement('pre');
  midLayer.className = 'fi-mid';
  const highLayer = document.createElement('pre');
  highLayer.className = 'fi-high';
  const nameLayer = document.createElement('pre');
  nameLayer.className = 'fi-name';
  host.append(lowLayer, midLayer, highLayer, nameLayer);

  if (artHeight === 0) return () => {};

  const FIRE_ART_COL = Math.max(0, Math.floor((FIRE_W - artWidth) / 2));
  const FIRE_ART_ROW = Math.max(0, FIRE_H - artHeight - 2);

  const isArtCell = (row: number, col: number): boolean => {
    const ar = row - FIRE_ART_ROW;
    const ac = col - FIRE_ART_COL;
    if (ar < 0 || ar >= art.length) return false;
    const line = art[ar];
    return ac >= 0 && ac < line.length && line[ac] !== ' ';
  };
  const artChar = (row: number, col: number): string => art[row - FIRE_ART_ROW][col - FIRE_ART_COL];

  const nameRows: string[] = [];
  for (let row = 0; row < FIRE_H; row++) {
    let line = '';
    for (let col = 0; col < FIRE_W; col++) line += isArtCell(row, col) ? artChar(row, col) : ' ';
    nameRows.push(line);
  }
  nameLayer.textContent = nameRows.join('\n');

  if (reducedMotion.matches) {
    lowLayer.textContent = '';
    midLayer.textContent = '';
    highLayer.textContent = '';
    return () => {};
  }

  const heat = new Uint8Array(FIRE_W * FIRE_H);

  const step = () => {
    for (let col = 0; col < FIRE_W; col++) {
      for (let row = 0; row < FIRE_H; row++) {
        if (isArtCell(row, col)) heat[row * FIRE_W + col] = Math.random() < 0.15 ? 30 : 36;
      }
      // Faint base row across the full width: fire also rises from the
      // ground, not just from the letters.
      if (!isArtCell(FIRE_H - 1, col)) {
        heat[(FIRE_H - 1) * FIRE_W + col] = Math.random() < 0.6 ? Math.floor(Math.random() * 18) : 0;
      }
    }
    for (let y = FIRE_H - 1; y >= 1; y--) {
      for (let x = 0; x < FIRE_W; x++) {
        const src = heat[y * FIRE_W + x];
        const dstX = Math.min(FIRE_W - 1, Math.max(0, x + (Math.floor(Math.random() * 3) - 1)));
        if (isArtCell(y - 1, dstX)) continue;
        const decay = Math.floor(Math.random() * 9);
        heat[(y - 1) * FIRE_W + dstX] = Math.max(0, src - decay);
      }
    }
  };

  const render = () => {
    const low: string[] = [];
    const mid: string[] = [];
    const high: string[] = [];
    for (let row = 0; row < FIRE_H; row++) {
      let lLine = '', mLine = '', hLine = '';
      for (let col = 0; col < FIRE_W; col++) {
        if (isArtCell(row, col)) { lLine += ' '; mLine += ' '; hLine += ' '; continue; }
        const h = heat[row * FIRE_W + col];
        if (h >= 24) { hLine += '#'; mLine += ' '; lLine += ' '; }
        else if (h >= 14) { mLine += Math.random() < 0.5 ? '*' : '+'; hLine += ' '; lLine += ' '; }
        else if (h >= 6) { lLine += Math.random() < 0.5 ? '.' : ':'; mLine += ' '; hLine += ' '; }
        else { lLine += ' '; mLine += ' '; hLine += ' '; }
      }
      low.push(lLine); mid.push(mLine); high.push(hLine);
    }
    lowLayer.textContent = low.join('\n');
    midLayer.textContent = mid.join('\n');
    highLayer.textContent = high.join('\n');
  };

  const stop = runTicker(host, 24, () => {
    step();
    render();
  });
  return () => stop();
}
