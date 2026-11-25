// 6. rain - matrix-style rain carving the name out of falling characters.
import { artFor, centerOffsets, reducedMotion, runTicker, injectStyle } from './core.js';
import type { BannerCtx } from './registry.js';

const CSS = `
  .rn-trail { color: var(--sz-green, #a6e3a1); opacity: .45; }
  .rn-head { color: var(--sz-text, #cdd6f4); }
  .rn-name { color: var(--sz-accent, #89b4fa); }
`;

const RAIN_CHARS = '0123456789abcdef<>*+=:';

interface RainDrop {
  head: number;
  speed: number;
  trail: number;
  active: boolean;
  startDelay: number;
}

export function mount(host: HTMLElement, ctx: BannerCtx): () => void {
  injectStyle(host, CSS);
  const { cols: RAIN_W, rows: RAIN_H } = ctx;
  const art = artFor(ctx.banner);
  const artWidth = art[0]?.length ?? 0;
  const artHeight = art.length;
  const trailLayer = document.createElement('pre');
  trailLayer.className = 'rn-trail';
  const headLayer = document.createElement('pre');
  headLayer.className = 'rn-head';
  const nameLayer = document.createElement('pre');
  nameLayer.className = 'rn-name';
  host.append(trailLayer, headLayer, nameLayer);

  if (artHeight === 0) return () => {};

  const { colOffset: RAIN_ART_COL, rowOffset: RAIN_ART_ROW } = centerOffsets(artWidth, artHeight, RAIN_W, RAIN_H);

  // revealed[row][col] in the RAIN_W x RAIN_H grid; true once a drop's head
  // has passed over a non-space ART cell there.
  const revealed: boolean[][] = Array.from({ length: RAIN_H }, () => new Array(RAIN_W).fill(false));
  const isArtCell = (row: number, col: number): boolean => {
    const ar = row - RAIN_ART_ROW;
    const ac = col - RAIN_ART_COL;
    if (ar < 0 || ar >= art.length) return false;
    const line = art[ar];
    return ac >= 0 && ac < line.length && line[ac] !== ' ';
  };
  const artChar = (row: number, col: number): string => art[row - RAIN_ART_ROW][col - RAIN_ART_COL];

  const renderNameLayer = () => {
    const rows: string[] = [];
    for (let row = 0; row < RAIN_H; row++) {
      let line = '';
      for (let col = 0; col < RAIN_W; col++) {
        line += revealed[row][col] && isArtCell(row, col) ? artChar(row, col) : ' ';
      }
      rows.push(line);
    }
    nameLayer.textContent = rows.join('\n');
  };

  if (reducedMotion.matches) {
    for (let row = 0; row < RAIN_H; row++) {
      for (let col = 0; col < RAIN_W; col++) revealed[row][col] = true;
    }
    renderNameLayer();
    trailLayer.textContent = '';
    headLayer.textContent = '';
    return () => {};
  }

  const hasUnrevealed = (col: number): boolean => {
    for (let row = 0; row < RAIN_H; row++) {
      if (isArtCell(row, col) && !revealed[row][col]) return true;
    }
    return false;
  };

  const allRevealed = (): boolean => {
    for (let row = 0; row < RAIN_H; row++) {
      for (let col = 0; col < RAIN_W; col++) {
        if (isArtCell(row, col) && !revealed[row][col]) return false;
      }
    }
    return true;
  };

  const spawn = (): RainDrop => ({
    head: -Math.random() * RAIN_H,
    speed: 0.35 + Math.random() * 0.55,
    trail: 3 + Math.floor(Math.random() * 4),
    active: true,
    startDelay: Math.random() * 40,
  });

  const drops: RainDrop[] = Array.from({ length: RAIN_W }, () => spawn());

  const replay = () => {
    for (let row = 0; row < RAIN_H; row++) revealed[row].fill(false);
    renderNameLayer();
    for (let col = 0; col < RAIN_W; col++) drops[col] = spawn();
    startTicker();
  };

  let stopFn: (() => void) | null = null;

  const startTicker = () => {
    stopFn?.();
    stopFn = runTicker(host, 20, () => {
      const trailGrid: string[][] = Array.from({ length: RAIN_H }, () => new Array(RAIN_W).fill(' '));
      const headGrid: string[][] = Array.from({ length: RAIN_H }, () => new Array(RAIN_W).fill(' '));

      let anyActive = false;
      for (let col = 0; col < RAIN_W; col++) {
        const drop = drops[col];
        if (!drop.active) continue;
        anyActive = true;
        if (drop.startDelay > 0) {
          drop.startDelay -= 1;
          continue;
        }

        const headRow = Math.floor(drop.head);
        if (headRow >= 0 && headRow < RAIN_H) {
          headGrid[headRow][col] = RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)];
          if (isArtCell(headRow, col)) revealed[headRow][col] = true;
        }
        for (let t = 1; t <= drop.trail; t++) {
          const r = Math.floor(drop.head - t);
          if (r >= 0 && r < RAIN_H) {
            trailGrid[r][col] = RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)];
          }
        }

        drop.head += drop.speed;
        if (drop.head - drop.trail > RAIN_H) {
          if (hasUnrevealed(col) || !allRevealed()) {
            drops[col] = { ...spawn(), startDelay: Math.random() * 10 };
          } else {
            drop.active = false;
          }
        }
      }

      trailLayer.textContent = trailGrid.map(row => row.join('')).join('\n');
      headLayer.textContent = headGrid.map(row => row.join('')).join('\n');
      renderNameLayer();

      if (!anyActive) {
        trailLayer.textContent = '';
        headLayer.textContent = '';
        stopFn?.();
        return false;
      }
    });
  };

  startTicker();
  host.style.cursor = 'pointer';
  host.addEventListener('click', replay);

  return () => {
    stopFn?.();
    host.removeEventListener('click', replay);
  };
}
