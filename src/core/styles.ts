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

// Reduced motion query constant (lazy for SSR/test safety)
export const reducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : mediaQueryListFallback;

// Mobile breakpoint query (lazy for SSR/test safety)
export const mobileQuery = typeof window !== 'undefined'
  ? window.matchMedia('(max-width: 768px)')
  : mediaQueryListFallback;

// Helper to adopt shared CSSStyleSheets on a shadow root.
// Works with Lit's CSSResult by extracting the underlying CSSStyleSheet.
export function adoptStyles(el: HTMLElement, ...styles: CSSStyleSheet[]) {
  if (el.shadowRoot) {
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, ...styles];
  }
}
