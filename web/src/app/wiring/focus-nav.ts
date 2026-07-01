import { isInputFocused } from '../../core/keyboard.js';
import { router } from '../../core/router.js';

// Walk document.activeElement through shadow roots to find the deepest
// focused element (mirrors the pattern used across the keyboard features).
function deepActive(): Element | null {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return el;
}

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
// focusable — e.g. the home dashboard links — with the per-window focus trap
// keeping the cycle inside the terminal window.)
export function wireFocusNav(): () => void {
  const handler = (e: KeyboardEvent) => {
    if (isInputFocused()) return;
    if (document.querySelector('sz-links[open]')) return;
    if (document.querySelector('sz-palette[open]')) return;
    if (document.querySelector('sz-palette[help-open]')) return;

    const el = deepActive();

    if (e.key === ' ') {
      if (el?.tagName === 'A') {
        e.preventDefault();
        (el as HTMLElement).click();
      }
      return;
    }

    if (e.key === 'q' || e.key === 'Escape') {
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
