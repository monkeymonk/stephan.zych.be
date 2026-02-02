import { actions } from '../../core/actions.js';
import { appState } from '../../core/state.js';
import { router } from '../../core/router.js';
import { WINDOW_ACTION } from '../../features/window/actions.js';
import { WM_ACTION } from '../../features/window-manager/actions.js';

export function wireWindowToWM() {
  // Close button → hide window and reset the URL to the root.
  actions.on(WINDOW_ACTION.CLOSE_REQUEST, (a) => {
    actions.dispatch(WM_ACTION.HIDE, a.payload);
    router.navigate('/');
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
