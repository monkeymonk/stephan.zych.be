import { actions, ROUTER_ACTION } from '../../core/actions.js';
import { appState } from '../../core/state.js';
import { router } from '../../core/router.js';
import type { RouteChangedDetail } from '../../core/router.js';
import { WINDOW_ACTION } from '../../features/window/actions.js';
import { WM_ACTION } from '../../features/window-manager/actions.js';

const TERMINAL_ID = 'terminal';

export function wireWindowToWM() {
  // Close button → hide window and reset the URL to the root.
  actions.on(WINDOW_ACTION.CLOSE_REQUEST, (a) => {
    actions.dispatch(WM_ACTION.HIDE, a.payload);
    router.navigate('/');
  });

  // Navigating to a content page must surface the terminal window — e.g. the
  // copyright footer's "Terms & Conditions" link works even when the window is
  // closed. '/' is the closed/desktop state (the close button hides the window
  // and navigates there), so it must not re-open the window. Only act when the
  // window is actually hidden, to avoid disturbing focus on in-window nav.
  actions.on(ROUTER_ACTION.ROUTE_CHANGED, (a) => {
    const { path } = a.payload as RouteChangedDetail;
    if (path === '/') return;
    const win = document.getElementById(TERMINAL_ID) as
      | (HTMLElement & { windowHidden?: boolean })
      | null;
    if (win?.windowHidden) actions.dispatch(WM_ACTION.SHOW, { windowId: TERMINAL_ID });
  });

  // Maximize button → toggle maximize (windowed <-> full viewport)
  actions.on(WINDOW_ACTION.MAXIMIZE_REQUEST, (a) => {
    actions.dispatch(WM_ACTION.MAXIMIZE, a.payload);
  });

  // Fullscreen button → toggle browser fullscreen
  actions.on(WINDOW_ACTION.FULLSCREEN_REQUEST, (a) => {
    actions.dispatch(WM_ACTION.FULLSCREEN, a.payload);
  });

  // Apply persisted / `:set transparency` value to the terminal window.
  const applyTransparency = () => {
    const win = document.getElementById('terminal') as (HTMLElement & { transparency?: number }) | null;
    if (win) win.transparency = appState.get('transparency');
  };
  requestAnimationFrame(applyTransparency);
  appState.subscribe(applyTransparency);
}
