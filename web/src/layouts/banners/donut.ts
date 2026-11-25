// 12. donut — classic donut.c spinning ASCII torus, no text.
import { injectStyle } from './core.js';
import type { BannerCtx } from './registry.js';
import { runTicker } from './core.js';

const CSS = `
  .dn-hi { color: var(--sz-accent, #89b4fa); }
  .dn-lo { color: var(--sz-mauve, #cba6f7); }
`;

const DONUT_LUM = '.,-~:;=!*#$@';
const DONUT_R1 = 1;
const DONUT_R2 = 2;
const DONUT_K2 = 5;

function renderDonutFrame(A: number, B: number, cols: number, rows: number, k1: number): { chars: string[]; buckets: number[] } {
  const cosA = Math.cos(A), sinA = Math.sin(A);
  const cosB = Math.cos(B), sinB = Math.sin(B);
  const chars = new Array<string>(cols * rows).fill(' ');
  const buckets = new Array<number>(cols * rows).fill(-1);
  const zbuf = new Array<number>(cols * rows).fill(0);

  for (let theta = 0; theta < 6.28; theta += 0.07) {
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    for (let phi = 0; phi < 6.28; phi += 0.02) {
      const cosP = Math.cos(phi), sinP = Math.sin(phi);
      const circleX = DONUT_R2 + DONUT_R1 * cosT;
      const circleY = DONUT_R1 * sinT;

      const x = circleX * (cosB * cosP + sinA * sinB * sinP) - circleY * cosA * sinB;
      const y = circleX * (sinB * cosP - sinA * cosB * sinP) + circleY * cosA * cosB;
      const z = DONUT_K2 + cosA * circleX * sinP + circleY * sinA;
      const ooz = 1 / z;

      const xp = Math.floor(cols / 2 + k1 * ooz * x * 2);
      const yp = Math.floor(rows / 2 - k1 * ooz * y);
      if (xp < 0 || xp >= cols || yp < 0 || yp >= rows) continue;

      const L = cosP * cosT * sinB - cosA * cosT * sinP - sinA * sinT + cosB * (cosA * sinT - cosT * sinA * sinP);
      const idx = yp * cols + xp;
      if (ooz > zbuf[idx]) {
        zbuf[idx] = ooz;
        const lumIndex = Math.min(DONUT_LUM.length - 1, Math.max(0, Math.floor(L * 8)));
        chars[idx] = DONUT_LUM[lumIndex];
        buckets[idx] = lumIndex;
      }
    }
  }
  return { chars, buckets };
}

export function mount(host: HTMLElement, ctx: BannerCtx): () => void {
  injectStyle(host, CSS);
  const { cols: DONUT_W, rows: DONUT_H } = ctx;
  const hiLayer = document.createElement('pre');
  hiLayer.className = 'dn-hi';
  const loLayer = document.createElement('pre');
  loLayer.className = 'dn-lo';
  host.append(hiLayer, loLayer);

  // K1 is derived from the stage height (not width) so the donut always
  // fits vertically regardless of how many columns the stage has.
  const k1 = (DONUT_H * DONUT_K2 * 3) / (8 * (DONUT_R1 + DONUT_R2));

  const paint = (A: number, B: number) => {
    const { chars, buckets } = renderDonutFrame(A, B, DONUT_W, DONUT_H, k1);
    const hiRows: string[] = [];
    const loRows: string[] = [];
    for (let row = 0; row < DONUT_H; row++) {
      let hi = '', lo = '';
      for (let col = 0; col < DONUT_W; col++) {
        const idx = row * DONUT_W + col;
        const ch = chars[idx];
        const b = buckets[idx];
        if (b >= 7) { hi += ch; lo += ' '; }
        else if (b >= 0) { lo += ch; hi += ' '; }
        else { hi += ' '; lo += ' '; }
      }
      hiRows.push(hi);
      loRows.push(lo);
    }
    hiLayer.textContent = hiRows.join('\n');
    loLayer.textContent = loRows.join('\n');
  };

  const stop = runTicker(host, 30, now => {
    paint(now * 0.0010, now * 0.0005);
  });
  return () => stop();
}
