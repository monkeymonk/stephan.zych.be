import { actions } from '../../core/actions.js';
import { router } from '../../core/router.js';
import { DESKTOP_ACTION } from '../../features/desktop/actions.js';
import { WM_ACTION } from '../../features/window-manager/actions.js';

let browserWindowCounter = 0;

function createBrowserWindow(url: string, title: string): void {
  const wm = document.querySelector('sz-window-manager');
  if (!wm) return;

  browserWindowCounter++;
  const windowId = `browser-${browserWindowCounter}`;

  const win = document.createElement('sz-window');
  win.id = windowId;
  win.setAttribute('title', title);
  win.setAttribute('width', '60vw');
  win.setAttribute('height', '65vh');

  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.style.cssText = 'width: 100%; height: 100%; border: none; flex: 1;';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
  iframe.setAttribute('loading', 'lazy');
  win.appendChild(iframe);

  wm.appendChild(win);
  actions.dispatch(WM_ACTION.SHOW, { windowId });
}

export function wireDesktopToWM() {
  actions.on(DESKTOP_ACTION.ICON_LAUNCH, (a) => {
    const payload = a.payload as { id: string; action: string; url?: string; label?: string };

    switch (payload.action) {
      case 'terminal':
        actions.dispatch(WM_ACTION.SHOW, { windowId: 'terminal' });
        break;
      case 'link':
        if (payload.url) {
          if (payload.url.startsWith('mailto:') || payload.url.startsWith('http')) {
            window.open(payload.url, '_blank', 'noopener');
          } else {
            void router.navigate(payload.url);
            actions.dispatch(WM_ACTION.SHOW, { windowId: 'terminal' });
          }
        }
        break;
      case 'browser':
        if (payload.url) {
          createBrowserWindow(payload.url, payload.label || 'Browser');
        }
        break;
    }
  });

  actions.on(DESKTOP_ACTION.TILE_TOGGLE, () => {
    actions.dispatch(WM_ACTION.TILE_RETILE);
  });

  // Flow tile state back to desktop for FAB active indicator
  actions.on(WM_ACTION.TILE_CHANGED, (a) => {
    actions.dispatch(DESKTOP_ACTION.TILE_STATE_CHANGED, a.payload);
  });
}
