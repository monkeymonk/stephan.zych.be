import { actions } from '../../core/actions.js';
import { isInputFocused } from '../../core/keyboard.js';
import { WM_ACTION } from '../../features/window-manager/actions.js';
import { SLIDESHOW_ACTION } from '../../components/slideshow-actions.js';

export function wireKeyboard(): () => void {
  const handler = (e: KeyboardEvent) => {
    if (isInputFocused()) return;
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
