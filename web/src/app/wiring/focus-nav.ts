import { deepActiveElement, isInputFocused, singleKeyAllowed } from '../../core/keyboard.js';
import { router } from '../../core/router.js';

// Blog posts and project detail pages have an archive to back out to
// (/blog/<slug>/ -> /blog/, /projects/<slug>/ -> /projects/); the archive
// pages themselves have none.
function archiveFor(path: string): string | null {
  const m = path.match(/^\/(blog|projects)\/[^/]+\/?$/);
  return m ? `/${m[1]}/` : null;
}

// Global keyboard wiring for focus movement that doesn't belong to a single
// component: Space follows a focused anchor (anchors don't natively activate on
// Space, buttons do), and q/Escape either back out to the current
// article/project's archive or — with nothing to back out of — blur focus back
// to #main-content, mirroring the TUI's leave-focus behaviour. (Tab itself is
// left to the browser: from #main-content it lands on the first content
// focusable — e.g. the home dashboard links — and then keeps going out of the
// terminal window into the wallpaper controls and the footer. Nothing traps it
// unless a genuinely modal surface is open.)
export function wireFocusNav(): () => void {
  const handler = (e: KeyboardEvent) => {
    // An overlay that handled the key already called preventDefault. Checking
    // the reflected `[open]` attributes below is not enough on its own: Lit
    // flushes its update between two document listeners, so by the time this
    // runs the closing overlay may already have dropped the attribute — which
    // is how Escape used to both close the link picker / diagram lightbox and
    // back out to the archive behind it.
    if (e.defaultPrevented) return;
    if (isInputFocused()) return;
    if (document.querySelector('sz-links[open]')) return;
    if (document.querySelector('sz-palette[open]')) return;
    if (document.querySelector('sz-palette[help-open]')) return;

    const el = deepActiveElement();

    if (e.key === ' ') {
      if (el?.tagName === 'A') {
        e.preventDefault();
        (el as HTMLElement).click();
      }
      return;
    }

    // `q` is a bare letter and answers to the WCAG 2.1.4 switch; Escape does
    // the same job and is outside the criterion, so it always works.
    if (e.key === 'Escape' || (e.key === 'q' && singleKeyAllowed())) {
      const archive = archiveFor(window.location.pathname);
      if (archive) {
        e.preventDefault();
        void router.navigate(archive);
        return;
      }

      if (
        el &&
        (el.tagName === 'A' || el.tagName === 'BUTTON') &&
        el !== document.body &&
        el.id !== 'main-content'
      ) {
        e.preventDefault();
        (el as HTMLElement).blur();
        const main = document.getElementById('main-content');
        (main as HTMLElement | null)?.focus({ preventScroll: true } as FocusOptions);
      }
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}
