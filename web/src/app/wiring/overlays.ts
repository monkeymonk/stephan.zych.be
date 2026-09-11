import { actions } from '../../core/actions.js';
import { overlayRegistry } from '../../core/overlays.js';
import { OVERLAY_ACTION, type OverlayRequestDetail } from '../../features/overlays/actions.js';

// Action bus -> overlay registry. Keystrokes reach the registry through the
// keymap; this is the other door, for controls that cannot press a key — the
// mobile search button, the `:help` command, a diagram's enlarge control. They
// name an overlay by id and stay ignorant of which component implements it.
export function wireOverlays() {
  actions.on(OVERLAY_ACTION.OPEN, (a) => {
    const { id } = (a.payload ?? {}) as OverlayRequestDetail;
    if (id) overlayRegistry.claim(id);
  });

  actions.on(OVERLAY_ACTION.CLOSE, (a) => {
    const { id } = (a.payload ?? {}) as OverlayRequestDetail;
    // No id means "whatever owns the keyboard", which is what a close control
    // outside the overlay itself can honestly ask for.
    if (id) overlayRegistry.release(id);
    else overlayRegistry.closeCurrent('user');
  });
}
