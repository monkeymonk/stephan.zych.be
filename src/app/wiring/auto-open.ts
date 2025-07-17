import { actions } from '../../core/actions.js';
import { readJsonData } from '../../core/data.js';
import { START_SCREEN_ACTION } from '../../features/start-screen/actions.js';
import { WM_ACTION } from '../../features/window-manager/actions.js';

interface AutoOpenConfig {
  enabled?: boolean;
  delayMs?: number;
}

const TERMINAL_ID = 'terminal';
const DEFAULT_DELAY_MS = 3500;

// On the home route the terminal starts hidden behind the start screen.
// Reveal it automatically after a short delay so visitors land in the terminal
// without having to click. Cancelled if they launch something first.
export function wireAutoOpen() {
  const config =
    readJsonData<{ autoOpen?: AutoOpenConfig }>('sz-start-screen-data', {}).autoOpen ?? {};
  if (config.enabled === false) return;

  const win = document.getElementById(TERMINAL_ID) as
    | (HTMLElement & { windowHidden?: boolean })
    | null;
  // Only arm when the terminal actually starts hidden (i.e. the home route).
  if (!win || win.windowHidden !== true) return;

  const delay = typeof config.delayMs === 'number' ? config.delayMs : DEFAULT_DELAY_MS;

  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    timer = undefined;
    unsub();
    actions.dispatch(WM_ACTION.SHOW, { windowId: TERMINAL_ID });
  }, delay);

  // If the visitor launches anything from the start screen first, stand down.
  const unsub = actions.on(START_SCREEN_ACTION.LAUNCH, () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    unsub();
  });
}
