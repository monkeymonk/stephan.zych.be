import { mobileQuery, reducedMotion } from './styles.js';

/**
 * Single source of truth for "which element scrolls page content".
 *
 * The site runs two scroll models. On desktop the UI hangs off a
 * `position: fixed` window, `html`/`body` are `overflow: hidden`, and the
 * reading scroller is `#main-content` (promoted by sz-neovim). Under 768px the
 * document itself scrolls again — iOS Safari delivers the status-bar
 * scroll-to-top tap as UIKit `scrollsToTop` to the *main frame's* scroll view
 * only and never walks into an `overflow: auto` subtree, so a subtree scroller
 * silently kills the gesture (plus pull-to-refresh and URL-bar collapse).
 *
 * Every scroll call site routes through here so that decision exists once.
 */

/** vim's `j`/`k` move by text lines; `--sz-line-px` is the site's line box. */
const FALLBACK_LINE_PX = 21;

/** The element that actually scrolls page content right now. */
export function scrollRoot(): HTMLElement {
  const doc = document.scrollingElement;
  // Measure first, and only fall back to the media query: during a viewport
  // change the layout and the query flip in either order, and a document that
  // demonstrably overflows is the scroller whatever the breakpoint says.
  if (doc instanceof HTMLElement && (doc.scrollHeight > doc.clientHeight || mobileQuery.matches)) {
    return doc;
  }
  return document.getElementById('main-content') ?? document.body;
}

/**
 * IntersectionObserver `root` for the current scroller — null when it is the
 * document, because `root: null` means "the viewport" and passing
 * `document.scrollingElement` instead is *not* equivalent.
 *
 * Doubles as the "is the document scrolling?" test for callers that must offset
 * client rects, which are already viewport-relative in that mode.
 */
export function observerRoot(): Element | null {
  const root = scrollRoot();
  return root === document.scrollingElement ? null : root;
}

/**
 * Where scroll events for the active scroller are dispatched. A document scroll
 * event fires at `document` and bubbles to `window`; it never reaches
 * documentElement, so listening on the element itself hears nothing at all.
 */
export function scrollEventTarget(): EventTarget {
  const root = scrollRoot();
  return root === document.scrollingElement ? window : root;
}

export function scrollToTop(smooth = false): void {
  // 'smooth' is a lie under prefers-reduced-motion: the JS option beats CSS.
  scrollRoot().scrollTo({
    top: 0,
    behavior: smooth && !reducedMotion.matches ? 'smooth' : 'auto',
  });
}

export function scrollToBottom(smooth = false): void {
  const root = scrollRoot();
  root.scrollTo({
    top: root.scrollHeight,
    behavior: smooth && !reducedMotion.matches ? 'smooth' : 'auto',
  });
}

/** Scroll by `delta` text lines (negative scrolls up). */
export function scrollByLines(delta: number): void {
  // Read the live value so the "aA" text-size control keeps j/k proportional
  // to the text it is moving past.
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--sz-line-px');
  const line = Number.parseFloat(raw);
  const px = Number.isFinite(line) && line > 0 ? line : FALLBACK_LINE_PX;
  scrollRoot().scrollBy({ top: delta * px, behavior: 'auto' });
}
