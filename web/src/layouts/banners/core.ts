// Shared helpers, types and bitmap art for the home-banner variants. Each
// variant module imports only what it needs from here; this module itself is
// never imported by sz-banner or registry.ts, so it ships only inside the
// lazy-loaded variant chunks that reference it, never in the main bundle.
import { reducedMotion } from '../../core/styles.js';
import type { Banner } from './registry.js';

export { reducedMotion };

/** True when a variant should mount its single static frame: the user asked
 * for reduced motion, or sz-banner's pause button is pressed (data-paused on
 * the stage host). */
export function staticMotion(host: HTMLElement): boolean {
  return reducedMotion.matches || host.hasAttribute('data-paused');
}

// ---------------------------------------------------------------------------
// Shared "stephan" bitmap, built from the Banner glyph data supplied by the
// template (content/data/startScreen.json, single source of truth). Unknown
// letters render blank; a missing/invalid banner yields an empty bitmap so
// variants degrade to rendering nothing instead of throwing.
// ---------------------------------------------------------------------------

/** Build a boolean grid for `word` out of `banner.glyphs`, with '.' columns
 * between glyphs. Returns an empty grid if `banner` has no usable glyph data. */
export function wordBitmap(banner: Banner | null | undefined, word: string = banner?.word ?? ''): boolean[][] {
  const glyphRows = banner?.glyphRows ?? 0;
  const glyphCols = banner?.glyphCols ?? 0;
  const glyphGap = banner?.glyphGap ?? 0;
  const glyphs = banner?.glyphs;
  if (!glyphs || glyphRows <= 0 || glyphCols <= 0) return [];
  const letters = Array.from(word);
  if (letters.length === 0) return [];
  const cols = letters.length * glyphCols + Math.max(0, letters.length - 1) * glyphGap;
  const grid: boolean[][] = Array.from({ length: glyphRows }, () => new Array(cols).fill(false));
  letters.forEach((letter, i) => {
    const glyph = glyphs[letter];
    if (!glyph) return;
    const colStart = i * (glyphCols + glyphGap);
    for (let row = 0; row < glyphRows; row++) {
      const line = glyph[row];
      if (!line) continue;
      for (let col = 0; col < glyphCols; col++) {
        if (line[col] === '#') grid[row][colStart + col] = true;
      }
    }
  });
  return grid;
}

/** Collapse row pairs of a boolean grid into half-block characters. */
export function halfBlock(bitmap: boolean[][]): string[] {
  const lines: string[] = [];
  for (let row = 0; row < bitmap.length; row += 2) {
    const top = bitmap[row];
    const bottom = bitmap[row + 1] ?? new Array(top.length).fill(false);
    let line = '';
    for (let col = 0; col < top.length; col++) {
      const t = top[col];
      const b = bottom[col];
      line += t && b ? '█' : t ? '▀' : b ? '▄' : ' ';
    }
    lines.push(line);
  }
  return lines;
}

/** Pad all lines to the same length with trailing spaces, so stacked layers align. */
export function padLines(lines: string[]): string[] {
  const width = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return lines.map(line => line.padEnd(width, ' '));
}

/** The shared "stephan" art for `banner`, memoized per banner object (the
 * template passes the same parsed object on every mount within a page
 * load). Returns an empty array if `banner` has no usable glyph data. */
const artCache = new WeakMap<Banner, string[]>();
export function artFor(banner: Banner | null | undefined): string[] {
  if (!banner) return [];
  const cached = artCache.get(banner);
  if (cached) return cached;
  const art = padLines(halfBlock(wordBitmap(banner)));
  artCache.set(banner, art);
  return art;
}

/** Offsets to centre a `width` x `height` block inside a `cols` x `rows` stage. */
export function centerOffsets(width: number, height: number, cols: number, rows: number): { colOffset: number; rowOffset: number } {
  return {
    colOffset: Math.max(0, Math.floor((cols - width) / 2)),
    rowOffset: Math.max(0, Math.floor((rows - height) / 2)),
  };
}

/** Centre character-grid `lines` inside a cols x rows stage, padding with `fill`. */
export function centerInStage(lines: string[], cols: number, rows: number, fill = ' '): string[] {
  const height = lines.length;
  const width = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const { colOffset, rowOffset } = centerOffsets(width, height, cols, rows);
  const blankRow = fill.repeat(cols);
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    const sr = r - rowOffset;
    if (sr < 0 || sr >= height) {
      out.push(blankRow);
      continue;
    }
    const line = (lines[sr] ?? '').padEnd(width, fill);
    out.push(fill.repeat(colOffset) + line + fill.repeat(Math.max(0, cols - colOffset - width)));
  }
  return out;
}

/** Centre a pixel-resolution boolean bitmap inside a `cols` x `rows * 2` pixel
 * grid (pixel rows are halved into char rows by halfBlock). */
export function centerBitmap(bitmap: boolean[][], cols: number, rows: number): boolean[][] {
  const pixelRows = rows * 2;
  const height = bitmap.length;
  const width = bitmap[0]?.length ?? 0;
  const { colOffset, rowOffset } = centerOffsets(width, height, cols, pixelRows);
  const grid: boolean[][] = Array.from({ length: pixelRows }, () => new Array(cols).fill(false));
  for (let r = 0; r < height; r++) {
    const rr = r + rowOffset;
    if (rr < 0 || rr >= pixelRows) continue;
    for (let c = 0; c < width; c++) {
      const cc = c + colOffset;
      if (cc < 0 || cc >= cols) continue;
      grid[rr][cc] = bitmap[r][c];
    }
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Frame ticker: rAF-driven, throttled to a target fps. The rAF chain is
// cancelled while hidden or off-screen and rescheduled on return, stopped
// for good when `frame` returns false. Cancelled by cleanup.
// ---------------------------------------------------------------------------

export function runTicker(host: HTMLElement, fps: number, frame: (tMs: number) => boolean | void): () => void {
  let rafId = 0;
  let lastTick = 0;
  let stopped = false;
  let visible = true;
  const interval = 1000 / fps;
  const canRun = () => !stopped && visible && !document.hidden;
  const halt = () => { if (rafId !== 0) { cancelAnimationFrame(rafId); rafId = 0; } };

  const tick = (now: number) => {
    rafId = 0;
    if (!canRun()) return;
    if (now - lastTick >= interval) {
      lastTick = now;
      if (frame(now) === false) {
        stopped = true;
        return;
      }
    }
    rafId = requestAnimationFrame(tick);
  };

  // Start or stop the rAF chain to match visibility. On resume lastTick
  // resets so the first frame back draws immediately (not skipped, not
  // doubled); the rafId guard keeps a single chain.
  const sync = () => {
    if (!canRun()) {
      halt();
      return;
    }
    if (rafId === 0) {
      lastTick = 0;
      rafId = requestAnimationFrame(tick);
    }
  };

  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(entries => {
      const entry = entries.at(-1);
      if (entry) visible = entry.isIntersecting;
      sync();
    });
    observer.observe(host);
  }

  document.addEventListener('visibilitychange', sync);
  sync();

  return () => {
    stopped = true;
    halt();
    observer?.disconnect();
    document.removeEventListener('visibilitychange', sync);
  };
}

/** Inject `cssText` as a <style> element, first child of `host`. host lives
 * inside sz-banner's shadow root, so the rules stay scoped to it. */
export function injectStyle(host: HTMLElement, cssText: string): void {
  const style = document.createElement('style');
  style.textContent = cssText;
  host.prepend(style);
}
