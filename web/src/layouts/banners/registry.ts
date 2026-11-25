// Static registry of home-banner variants: tiny on purpose, since sz-banner
// imports this module eagerly (it needs the list to render the switch button
// and stage dimensions on first paint). Each variant's actual implementation
// and styles live in their own module, loaded on demand via `load()` so only
// the variant currently shown is ever downloaded.

/** Fixed stage the banner occupies: every variant renders into the same
 * number of character rows, and a column count computed from the available
 * width (see sz-banner.ts), clamped between STAGE_MIN_COLS/STAGE_MAX_COLS.
 * This keeps the banner footprint identical across variants so switching
 * never shifts the tagline/links below. */
export const STAGE_ROWS = 16;
export const STAGE_MIN_COLS = 64;
export const STAGE_MAX_COLS = 112;

/** Glyph bitmap data for the "stephan" word art, loaded from
 * content/data/startScreen.json (single source of truth, shared with the
 * Go TUI). '#' marks an on pixel, any other char is off. */
export interface Banner {
  word: string;
  glyphRows: number;
  glyphCols: number;
  glyphGap: number;
  glyphs: Record<string, string[]>;
}

export interface BannerCtx {
  wordmark: string[];
  banner: Banner | null;
  cols: number;
  rows: number;
}

export interface BannerModule {
  mount(host: HTMLElement, ctx: BannerCtx): () => void;
}

export interface BannerVariant {
  id: string;
  label: string;
  load(): Promise<BannerModule>;
}

export const BANNER_VARIANTS: BannerVariant[] = [
  { id: 'current', label: 'current', load: () => import('./current.js') },
  { id: 'decrypt', label: 'decrypt', load: () => import('./decrypt.js') },
  { id: 'glitch', label: 'glitch', load: () => import('./glitch.js') },
  { id: 'rainbow', label: 'rainbow', load: () => import('./rainbow.js') },
  { id: 'spin', label: 'spin', load: () => import('./spin.js') },
  { id: 'rain', label: 'rain', load: () => import('./rain.js') },
  { id: 'plasma', label: 'plasma', load: () => import('./plasma.js') },
  { id: 'fire', label: 'fire', load: () => import('./fire.js') },
  { id: 'wave', label: 'wave', load: () => import('./wave.js') },
  { id: 'life', label: 'life', load: () => import('./life.js') },
  { id: 'stack', label: 'stack', load: () => import('./stack.js') },
  { id: 'donut', label: 'donut', load: () => import('./donut.js') },
];
