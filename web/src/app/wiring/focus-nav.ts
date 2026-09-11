import { deepActiveElement } from '../../core/keyboard.js';
import { keymap } from '../../core/keymap.js';
import { router } from '../../core/router.js';

// Blog posts and project detail pages have an archive to back out to
// (/blog/<slug>/ -> /blog/, /projects/<slug>/ -> /projects/); the archive
// pages themselves have none.
function archiveFor(path: string): string | null {
  const m = path.match(/^\/(blog|projects)\/[^/]+\/?$/);
  return m ? `/${m[1]}/` : null;
}

// Back out one level: to the current article/project's archive, or — with
// nothing to back out of — blur focus back to #main-content, mirroring the
// TUI's leave-focus behaviour. Returns false when neither applies, so the key
// stays unconsumed.
function backOut(): boolean {
  const archive = archiveFor(window.location.pathname);
  if (archive) {
    void router.navigate(archive);
    return true;
  }

  const el = deepActiveElement();
  if (
    el &&
    (el.tagName === 'A' || el.tagName === 'BUTTON') &&
    el !== document.body &&
    el.id !== 'main-content'
  ) {
    (el as HTMLElement).blur();
    const main = document.getElementById('main-content');
    (main as HTMLElement | null)?.focus({ preventScroll: true } as FocusOptions);
    return true;
  }

  return false;
}

// Focus movement that belongs to no single component: Space follows a focused
// anchor (anchors don't natively activate on Space, buttons do), and q/Escape
// back out. (Tab itself is left to the browser: from #main-content it lands on
// the first content focusable — e.g. the home dashboard links — and then keeps
// going out of the terminal window into the wallpaper controls and the footer.
// Nothing traps it unless a genuinely modal surface is open.)
//
// All `page` scope: while a modal owns the keyboard these are suppressed
// outright, so Escape closes the overlay and stops there instead of also
// backing out of the article behind it.
export function wireFocusNav(): () => void {
  return keymap.register(
    {
      id: 'focus.activate',
      keys: [' '],
      scope: 'page',
      chars: false,
      when: () => deepActiveElement()?.tagName === 'A',
      run: () => {
        const el = deepActiveElement();
        if (el?.tagName !== 'A') return false;
        (el as HTMLElement).click();
        return true;
      },
    },
    {
      // A bare letter, so it answers to the WCAG 2.1.4 switch; Escape below
      // does the same job and is outside the criterion, so it always works.
      id: 'nav.back',
      keys: ['q'],
      scope: 'page',
      chars: true,
      description: 'Back out to the archive',
      run: () => backOut(),
    },
    {
      id: 'nav.back.escape',
      keys: ['Escape'],
      scope: 'page',
      chars: false,
      run: () => backOut(),
    },
  );
}
