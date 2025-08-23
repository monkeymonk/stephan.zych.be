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

// Reduced motion query constant (lazy for SSR/test safety)
export const reducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : mediaQueryListFallback;

// Mobile breakpoint query (lazy for SSR/test safety)
export const mobileQuery = typeof window !== 'undefined'
  ? window.matchMedia('(max-width: 768px)')
  : mediaQueryListFallback;
