// 2. decrypt — matrix-noise resolving into the locked wordmark.
import { artFor, centerInStage, centerOffsets, reducedMotion, runTicker, injectStyle } from './core.js';
import type { BannerCtx } from './registry.js';

const CSS = `
  .dc-noise { color: var(--sz-overlay0, #6c7086); }
  .dc-lock { color: var(--sz-accent, #89b4fa); }
`;

const DECRYPT_NOISE_CHARS = '░▒▓<>/\\|_=+*#%@';

function decryptNoiseChar(): string {
  return DECRYPT_NOISE_CHARS[Math.floor(Math.random() * DECRYPT_NOISE_CHARS.length)];
}

export function mount(host: HTMLElement, ctx: BannerCtx): () => void {
  injectStyle(host, CSS);
  const { cols, rows } = ctx;
  const art = artFor(ctx.banner);
  const artWidth = art[0]?.length ?? 0;
  const artHeight = art.length;
  const noiseLayer = document.createElement('pre');
  noiseLayer.className = 'dc-noise';
  const lockLayer = document.createElement('pre');
  lockLayer.className = 'dc-lock';
  host.append(noiseLayer, lockLayer);

  if (artHeight === 0) return () => {};

  const stageArt = centerInStage(art, cols, rows);
  const { colOffset } = centerOffsets(artWidth, artHeight, cols, rows);

  if (reducedMotion.matches) {
    lockLayer.textContent = stageArt.join('\n');
    noiseLayer.textContent = '';
    return () => {};
  }

  // lockAt[row][col] = ms after mount when that cell is considered "locked".
  const lockAt: number[][] = stageArt.map(line =>
    Array.from(line).map((ch, col) => (ch === ' ' ? -1 : (col - colOffset) * 14 + Math.random() * 450 + 150)),
  );

  let rescrambleTimer: number | null = null;
  let cleanedUp = false;

  const renderFrame = (t: number, scrambleGlyphIndex: number | null, scrambleUntil: number) => {
    const noiseRows: string[] = [];
    const lockRows: string[] = [];
    for (let row = 0; row < rows; row++) {
      let noiseLine = '';
      let lockLine = '';
      const chars = Array.from(stageArt[row]);
      for (let col = 0; col < chars.length; col++) {
        const ch = chars[col];
        const glyphIndex = Math.floor((col - colOffset) / 8);
        const forcedScramble = scrambleGlyphIndex !== null && glyphIndex === scrambleGlyphIndex && t < scrambleUntil;
        const locked = ch !== ' ' && lockAt[row][col] >= 0 && t >= lockAt[row][col] && !forcedScramble;
        lockLine += locked ? ch : ' ';
        noiseLine += !locked && ch !== ' ' ? decryptNoiseChar() : ' ';
      }
      noiseRows.push(noiseLine);
      lockRows.push(lockLine);
    }
    noiseLayer.textContent = noiseRows.join('\n');
    lockLayer.textContent = lockRows.join('\n');
  };

  const allLocked = (t: number) => lockAt.every(row => row.every(v => v < 0 || t >= v));

  const scheduleRescramble = () => {
    if (cleanedUp) return;
    const delay = 6000 + Math.random() * 3000;
    rescrambleTimer = window.setTimeout(() => {
      if (cleanedUp) return;
      const glyphCount = Math.ceil(artWidth / 8);
      const glyphIndex = Math.floor(Math.random() * glyphCount);
      const start = performance.now();
      const until = start + 600;
      const stopTicker = runTicker(host, 30, now => {
        renderFrame(now - mountedAt, glyphIndex, (now - mountedAt) - (start - mountedAt) + 600);
        if (now >= until) {
          renderFrame(now - mountedAt, null, 0);
          stopTicker();
          scheduleRescramble();
          return false;
        }
      });
    }, delay);
  };

  const mountedAt = performance.now();
  const stopInitial = runTicker(host, 30, now => {
    const t = now - mountedAt;
    renderFrame(t, null, 0);
    if (allLocked(t)) {
      stopInitial();
      scheduleRescramble();
      return false;
    }
  });

  const replay = () => {
    renderFrame(0, null, 0);
    const start = performance.now();
    const stop = runTicker(host, 30, now => {
      const t = now - start;
      renderFrame(t, null, 0);
      if (allLocked(t)) {
        stop();
        return false;
      }
    });
  };
  host.style.cursor = 'pointer';
  host.addEventListener('click', replay);

  return () => {
    cleanedUp = true;
    if (rescrambleTimer !== null) window.clearTimeout(rescrambleTimer);
    host.removeEventListener('click', replay);
  };
}
