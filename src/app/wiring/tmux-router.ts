import { actions } from '../../core/actions.js';
import { TMUX_ACTION } from '../../features/tmux/actions.js';
import { router } from '../../core/router.js';

export function wireTmuxToRouter() {
  actions.on(TMUX_ACTION.TAB_SWITCH, (a) => {
    const payload = a.payload as { path?: string; index?: number };
    if (payload.path) router.navigate(payload.path);
  });
}
