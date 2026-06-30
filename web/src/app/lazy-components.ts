// Page-specific custom elements, defined on demand based on what's actually in
// the DOM — so a page only downloads the widgets it uses instead of every
// widget on every page. Re-scanned after each SPA navigation (the router swaps
// page content). Every target renders in light DOM, so a document-level
// querySelector finds it; esbuild code-splitting emits each as its own chunk.
const LAZY: Record<string, () => Promise<unknown>> = {
  'sz-gitlog': () => import('../components/widgets/sz-gitlog.js'),
  'sz-stats': () => import('../components/widgets/sz-stats.js'),
  'sz-wakapi': () => import('../components/widgets/sz-wakapi.js'),
  'sz-neofetch': () => import('../components/widgets/sz-neofetch.js'),
  'sz-contact-card': () => import('../components/widgets/sz-contact-card.js'),
  'sz-copy': () => import('../components/widgets/sz-copy.js'),
  'sz-toc': () => import('../components/ui/sz-toc.js'),
};

const loaded = new Set<string>();

/** Import the modules for any lazy custom element present in the document. */
export function loadPresentComponents(): void {
  for (const tag in LAZY) {
    if (loaded.has(tag)) continue;
    if (document.querySelector(tag)) {
      loaded.add(tag);
      void LAZY[tag]();
    }
  }
}
