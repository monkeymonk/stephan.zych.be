import { css } from 'lit';

const mediaQueryListFallback: MediaQueryList = {
  matches: false,
  media: '',
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
};

// Shared scrollbar styles (Lit css tagged template for static styles)
export const scrollbarStyles = css`
  :host, * {
    scrollbar-width: thin;
    scrollbar-color: var(--sz-surface1, #45475a) transparent;
  }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--sz-surface1, #45475a); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--sz-overlay0, #6c7086); }
  ::-webkit-scrollbar-corner { background: transparent; }
`;

// Shared keyboard focus indicator for interactive elements inside a shadow root.
export const focusRing = css`
  :focus-visible {
    outline: 2px solid var(--sz-accent, #89b4fa);
    outline-offset: 2px;
    border-radius: 3px;
  }
`;

// Bare "command output" header — a "❯ <command>" prompt line with no box,
// for content that flows inline in a markdown document (about / contact).
export const cmdLine = css`
  .cmd {
    color: var(--sz-overlay1, #7f849c);
    font-size: calc(var(--sz-font-size, 13px) * 0.85);
    margin-bottom: 10px;
  }
  .cmd .sigil {
    color: var(--sz-green, #a6e3a1);
    font-weight: 700;
    margin-right: 8px;
  }
`;

// Boxed "TUI panel" chrome — a bordered box framed as command output:
// a "❯ <command>" header, then the result. Kept for *article* use (wrapping
// code snippets or other content) via <sz-panel>.
export const panelStyles = css`
  .panel {
    border: 1px solid var(--sz-surface1, #45475a);
    border-radius: 8px;
    background: color-mix(in srgb, var(--sz-mantle, #181825) 45%, transparent);
    overflow: hidden;
    margin: 1.5em 0;
  }
  .panel__cmd {
    padding: 7px 14px;
    border-bottom: 1px solid var(--sz-surface0, #313244);
    color: var(--sz-subtext0, #a6adc8);
    font-size: calc(var(--sz-font-size, 13px) * 0.85);
  }
  .panel__cmd .sigil {
    color: var(--sz-green, #a6e3a1);
    font-weight: 700;
    margin-right: 8px;
  }
  .panel__body { padding: 16px 18px; }
`;

// Reduced motion query constant (lazy for SSR/test safety)
export const reducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : mediaQueryListFallback;

// Mobile breakpoint query (lazy for SSR/test safety)
export const mobileQuery = typeof window !== 'undefined'
  ? window.matchMedia('(max-width: 768px)')
  : mediaQueryListFallback;
