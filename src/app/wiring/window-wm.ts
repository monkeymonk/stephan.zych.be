import { actions } from '../../core/actions.js';
import { WINDOW_ACTION } from '../../features/window/actions.js';
import { WM_ACTION } from '../../features/window-manager/actions.js';

export function wireWindowToWM() {
  // Close button → hide window
  actions.on(WINDOW_ACTION.CLOSE_REQUEST, (a) => {
    actions.dispatch(WM_ACTION.HIDE, a.payload);
  });

  // Maximize button → toggle maximize (windowed <-> full viewport)
  actions.on(WINDOW_ACTION.MAXIMIZE_REQUEST, (a) => {
    actions.dispatch(WM_ACTION.MAXIMIZE, a.payload);
  });

  // Fullscreen button → toggle browser fullscreen
  actions.on(WINDOW_ACTION.FULLSCREEN_REQUEST, (a) => {
    actions.dispatch(WM_ACTION.FULLSCREEN, a.payload);
  });
}
