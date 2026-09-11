import { actions } from '../../core/actions.js';
import { keymap } from '../../core/keymap.js';
import { WM_ACTION } from '../../features/window-manager/actions.js';
import { SLIDESHOW_ACTION } from '../../components/background/slideshow-actions.js';

// Clicking the pager anchor reuses the SPA router. Scoped by presence, not by
// page type: those anchors only exist on article/project pages, so with no
// pager the key falls through untouched rather than being eaten by a binding
// that found nothing to do.
function followPager(selector: string): boolean {
  const link = document.querySelector<HTMLAnchorElement>(selector);
  if (!link) return false;
  link.click();
  return true;
}

/**
 * Site-wide keys that belong to no single component: the article pager, which
 * mirrors the on-page pager and the TUI's `[` and `]`, and the Alt shortcuts
 * for the terminal window and the wallpaper.
 *
 * All `page` scope, so a modal that owns the keyboard suppresses them — that
 * is what the old `sz-links[open]` DOM probe was hand-rolling, for one
 * overlay, by reading a reflected attribute Lit had not necessarily written
 * yet.
 */
export function wireKeyboard(): () => void {
  return keymap.register(
    {
      id: 'article.prev',
      keys: ['['],
      scope: 'page',
      // Bare punctuation, so it answers to the WCAG 2.1.4 switch; the Alt
      // bindings below never do.
      chars: true,
      description: 'Previous article',
      run: () => followPager('.sz-pager__link--prev'),
    },
    {
      id: 'article.next',
      keys: [']'],
      scope: 'page',
      chars: true,
      description: 'Next article',
      run: () => followPager('.sz-pager__link--next'),
    },
    {
      id: 'window.toggleMode',
      keys: ['w'],
      alt: true,
      scope: 'page',
      chars: false,
      description: 'Toggle windowed / full-page',
      run: () => {
        actions.dispatch(WM_ACTION.TOGGLE_MODE, { windowId: 'terminal' });
        return true;
      },
    },
    {
      id: 'window.fullscreen',
      keys: ['f'],
      alt: true,
      scope: 'page',
      chars: false,
      description: 'Toggle fullscreen',
      run: () => {
        actions.dispatch(WM_ACTION.FULLSCREEN, { windowId: 'terminal' });
        return true;
      },
    },
    {
      id: 'wallpaper.next',
      keys: ['n'],
      alt: true,
      scope: 'page',
      chars: false,
      description: 'Next wallpaper',
      run: () => {
        actions.dispatch(SLIDESHOW_ACTION.NEXT);
        return true;
      },
    },
  );
}
