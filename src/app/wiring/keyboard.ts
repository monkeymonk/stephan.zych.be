import { actions } from '../../core/actions.js';
import { isInputFocused } from '../../core/keyboard.js';
import { WM_ACTION } from '../../features/window-manager/actions.js';
import { DESKTOP_ACTION } from '../../features/desktop/actions.js';

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
      actions.dispatch(DESKTOP_ACTION.WALLPAPER_NEXT);
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}
