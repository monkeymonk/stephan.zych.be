import { actions } from '../../core/actions.js';
import { router } from '../../core/router.js';
import { START_SCREEN_ACTION } from '../../features/start-screen/actions.js';
import { WM_ACTION } from '../../features/window-manager/actions.js';
import type { StartScreenItem } from '../../core/registry.js';

export function wireStartScreen() {
  actions.on(START_SCREEN_ACTION.LAUNCH, (a) => {
    const item = a.payload as StartScreenItem;

    switch (item.action) {
      case 'navigate':
        actions.dispatch(WM_ACTION.SHOW, { windowId: 'terminal' });
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
}
