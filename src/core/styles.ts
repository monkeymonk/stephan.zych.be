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

// Markdown-like rendering used by the content widgets in the code/"nvim"
// view — a "## heading" and "- key: value" lists, matching the source look.
export const mdStyles = css`
  .md { color: var(--sz-subtext0, #a6adc8); margin: 1.4em 0; line-height: 1.7; }
  .md__h { color: var(--sz-mauve, #cba6f7); font-weight: 700; margin: 0 0 6px; }
  .md__h::before { content: "## "; color: var(--sz-accent, #89b4fa); }
  .md__list { margin: 0; padding: 0; list-style: none; }
  .md__list li { padding: 0; }
  .md__list li::before { content: "- "; color: var(--sz-overlay0, #6c7086); }
  .md__key { color: var(--sz-text, #cdd6f4); }
  .md__dim { color: var(--sz-overlay1, #7f849c); }
  .md a { color: var(--sz-accent, #89b4fa); text-decoration: none; }
  .md a:hover { text-decoration: underline; }
`;

// Lightly blinking colon for clock displays (tmux footer, contact card).
export const clockStyles = css`
  .clock-colon { animation: clock-blink 1s ease-in-out infinite; }
  @keyframes clock-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) {
    .clock-colon { animation: none; }
  }
`;

// Shared "TUI panel" chrome — a bordered box framed as command output:
// a "❯ <command>" prompt header, then the result. No window chrome (we are
// already inside the terminal). Used by the content widgets.
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
