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
// base.css carries the same forced-colors treatment for light DOM, but a
// stylesheet cannot cross a shadow boundary — this is the only hook the shadow
// components have.
export const focusRing = css`
  :focus-visible {
    outline: 2px solid var(--sz-accent, #89b4fa);
    outline-offset: 2px;
    border-radius: 3px;
  }

  /* Windows High Contrast Mode drops author colours: a var()-driven outline
     resolves to the forced palette anyway, but any component overriding this
     with a color-mix() tint or a box-shadow ring loses its indicator outright.
     Restating the outline in system colours keeps one guaranteed. */
  @media (forced-colors: active) {
    :focus-visible {
      outline: 3px solid Highlight;
      outline-offset: 2px;
    }
  }
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

  /* Print. One block here reaches sz-stats, sz-gitlog, sz-wakapi,
     sz-neofetch, sz-contact-card and sz-panel at once, because all six
     compose these styles — and each renders 100% inside its own shadow root
     from attributes, so a document sheet cannot touch any of it.

     Every widget colours its own rows from the active (dark) theme, which on
     white paper ranges from washed out to near-white on white. Flattening the
     whole subtree to ink is the only reachable fix from here, and it costs
     nothing worth keeping: greyscale printing erases those hues anyway. The
     !important is required because the rules being overridden live in each
     widget's own styles, which are later in its shadow root's cascade. */
  @media print {
    .panel {
      background: none;
      border: 0.5pt solid #ccc;
      border-radius: 0;
      margin: 8pt 0;
      break-inside: avoid;
    }
    .panel, .panel * {
      color: #1a1a1a !important;
    }
    /* The "❯ neofetch" header frames the panel as terminal output — on-site
       chrome that reads as noise once the terminal is gone. */
    .panel__cmd { display: none; }
    /* Every button inside a panel is a click affordance (sz-contact-card's
       "copy", the widgets' toggles) — the value it acts on is printed right
       beside it, so the control itself is dead ink. */
    .panel button { display: none; }
    /* Decorative ASCII art (sz-neofetch's logo block) is aria-hidden for the
       same reason it does not belong on paper: it carries no information, and
       forced to ink it prints as a solid dark rectangle. */
    .panel pre[aria-hidden="true"] { display: none; }
    .panel__body { padding: 6pt 8pt; }
  }
`;

// Reduced motion query constant (lazy for SSR/test safety)
export const reducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : mediaQueryListFallback;

// Mobile breakpoint query (lazy for SSR/test safety)
export const mobileQuery = typeof window !== 'undefined'
  ? window.matchMedia('(max-width: 768px)')
  : mediaQueryListFallback;
