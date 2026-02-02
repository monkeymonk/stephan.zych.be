import { actions } from '../../core/actions.js';
import { isInputFocused } from '../../core/keyboard.js';
import { WM_ACTION } from '../../features/window-manager/actions.js';
import { SLIDESHOW_ACTION } from '../../components/background/slideshow-actions.js';

export function wireKeyboard(): () => void {
  const handler = (e: KeyboardEvent) => {
    if (isInputFocused()) return;

    // Prev / next article — mirrors the on-page pager and the TUI's [ and ].
    // Clicking the pager anchor reuses the SPA router; those anchors only exist
    // on article/project pages, so this is naturally reader-scoped.
    if ((e.key === '[' || e.key === ']') && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (document.querySelector('sz-links[open]')) return; // link picker owns keys
      const sel = e.key === '[' ? '.sz-pager__link--prev' : '.sz-pager__link--next';
      const link = document.querySelector<HTMLAnchorElement>(sel);
      if (link) {
        e.preventDefault();
        link.click();
      }
      return;
    }

    if (!e.altKey) return;

    const key = e.key.toLowerCase();

    if (key === 'w') {
      e.preventDefault();
      actions.dispatch(WM_ACTION.TOGGLE_MODE, { windowId: 'terminal' });
    }
    if (key === 'f') {
      e.preventDefault();
      actions.dispatch(WM_ACTION.FULLSCREEN, { windowId: 'terminal' });
    }
    if (key === 'n') {
      e.preventDefault();
      actions.dispatch(SLIDESHOW_ACTION.NEXT);
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}
