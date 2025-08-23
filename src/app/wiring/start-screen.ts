import { actions } from '../../core/actions.js';
import { router } from '../../core/router.js';
import { START_SCREEN_ACTION } from '../../features/start-screen/actions.js';
import { WM_ACTION } from '../../features/window-manager/actions.js';
import type { StartScreenItem } from '../../core/registry.js';

const TERMINAL_ID = 'terminal';

export function wireStartScreen() {
  actions.on(START_SCREEN_ACTION.LAUNCH, (a) => {
    const item = a.payload as StartScreenItem;

    switch (item.action) {
      case 'navigate':
        actions.dispatch(WM_ACTION.SHOW, { windowId: TERMINAL_ID });
        void router.navigate(item.target);
        break;
      case 'external':
        window.open(item.target, '_blank', 'noopener');
        break;
      case 'download': {
        const link = document.createElement('a');
        link.href = item.target;
        link.download = '';
        link.click();
        break;
      }
    }
  });

  // The start screen is the launcher shown only when the terminal is closed.
  // Hide it whenever the terminal window is open.
  const setStartScreenActive = (active: boolean) => {
    const startScreen = document.querySelector('sz-start-screen') as
      | (HTMLElement & { inactive?: boolean })
      | null;
    if (startScreen) startScreen.inactive = active;
  };
  const isTerminal = (payload: unknown) =>
    (payload as { windowId?: string })?.windowId === TERMINAL_ID;

  const focusFirstStartScreenItem = () => {
    requestAnimationFrame(() => {
      const item = document
        .querySelector('sz-start-screen')
        ?.shadowRoot?.querySelector<HTMLElement>('.item');
      item?.focus();
    });
  };

  actions.on(WM_ACTION.SHOW, (a) => { if (isTerminal(a.payload)) setStartScreenActive(true); });
  actions.on(WM_ACTION.HIDE, (a) => {
    if (!isTerminal(a.payload)) return;
    setStartScreenActive(false);
    // Move focus to the launcher so keyboard users aren't stranded.
    focusFirstStartScreenItem();
  });

  // Initial sync: hide the start screen if the terminal starts open.
  requestAnimationFrame(() => {
    const terminal = document.getElementById(TERMINAL_ID) as
      | (HTMLElement & { windowHidden?: boolean })
      | null;
    setStartScreenActive(terminal ? terminal.windowHidden !== true : false);
  });
}
