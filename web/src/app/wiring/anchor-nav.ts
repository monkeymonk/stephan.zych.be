import { actions, ROUTER_ACTION } from '../../core/actions.js';
import { scrollToAnchor } from '../../core/scroll.js';

/**
 * In-page fragment navigation: heading permalinks (headingAnchors in
 * .eleventy.js), revision-marker superscripts, and their Updates-block
 * backlinks are all `<a href="#id">` in plain article markup. A native click
 * only ever moves `location.hash` and scrolls `document`, which does nothing
 * when scrollRoot() is a subtree scroller (desktop's #main-content) — so
 * every such click is intercepted here and routed through scrollToAnchor().
 *
 * sz-toc's own outline rail is deliberately left alone: its links live behind
 * a shadow boundary and already work via its own jump(), which this must not
 * (and, matching on e.target rather than composedPath(), cannot) reach.
 *
 * One delegated listener on document, registered once: the router only ever
 * swaps children of #main-content (SpaRouter.loadPage() replaces that
 * element's children, never document's own), so document — and this
 * listener — survive every client-side navigation with nothing to re-wire.
 */
export function wireAnchorNav(): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

    const target = e.target;
    if (!(target instanceof Element)) return;
    // e.target, not e.composedPath(): a document-level listener sees a click
    // that originated inside a shadow root retargeted to the shadow host, so
    // this naturally never matches anything inside sz-toc's rail — exactly
    // the light-DOM-only scope this needs, with no extra filtering.
    const anchor = target.closest('a[href^="#"]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (anchor.target || anchor.hasAttribute('download') || anchor.hasAttribute('data-no-anchor-scroll')) return;

    const href = anchor.getAttribute('href');
    if (!href || href === '#') return;

    // Unresolved id: do nothing and let the browser's own (harmless) default
    // — setting location.hash to a fragment with no matching element — run.
    if (!scrollToAnchor(href.slice(1))) return;

    e.preventDefault();
    // Pass through the current history.state rather than null: the router
    // keys the scroll offset it saves for this entry off that state, and a
    // null replacement would orphan it (sz-toc.ts's jump(), same note).
    history.replaceState(history.state, '', href);
  };
  // Capture phase: a bubble-phase stopPropagation() elsewhere (overlays,
  // window drag handling) must not be able to keep a fragment click from
  // ever reaching this listener.
  document.addEventListener('click', onClick, true);

  // Deep link on a hard load: a hash already in the URL when the document
  // first parses hits the same dead end as a click — the browser's own native
  // jump moves `document`, not scrollRoot() — so land it explicitly, two
  // frames deep so the scroller exists and above-the-fold layout has settled.
  if (window.location.hash.length > 1) {
    const id = window.location.hash.slice(1);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToAnchor(id, false));
    });
  }

  // A hash present in the destination URL wins for a fresh (pushState)
  // client-side navigation; a Back/Forward jump instead restores the offset
  // the router saved for that history entry (SpaRouter.loadPage()'s
  // restoreTop branch) and must not be fought over it — so this only acts
  // when the navigation was not a popstate restore.
  let fromPopstate = false;
  const onPopstate = () => { fromPopstate = true; };
  window.addEventListener('popstate', onPopstate);

  const unregisterRouteChanged = actions.on(ROUTER_ACTION.ROUTE_CHANGED, () => {
    const wasPopstate = fromPopstate;
    fromPopstate = false;
    if (wasPopstate) return;
    if (window.location.hash.length <= 1) return;
    const id = window.location.hash.slice(1);
    // Two frames deep so this runs after loadPage()'s own restoreTop /
    // scrollToTop() rAF, and so wins the fight instead of losing it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToAnchor(id, false));
    });
  });

  return () => {
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('popstate', onPopstate);
    unregisterRouteChanged();
  };
}
