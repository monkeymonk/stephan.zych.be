import { keymap, overlayEscapeBinding } from '../../core/keymap.js';
import { wireStartScreen } from './start-screen.js';
import { wireSlideshow } from './slideshow.js';
import { wireWindowToWM } from './window-wm.js';
import { wireTmuxToRouter } from './tmux-router.js';
import { wireOverlays } from './overlays.js';
import { wireKeyboard } from './keyboard.js';
import { wireFocusNav } from './focus-nav.js';
import { wireShare } from './share.js';
import { wireAnchorNav } from './anchor-nav.js';

// wireNeovimPalette() is desktop-only — invoked from app/index.ts's
// loadDesktopOnly(), since the palette it feeds is never loaded on mobile.

// The one document keydown listener, up before anything registers a binding so
// a lazily loaded feature never has to wonder whether the keymap is live, plus
// the site's single Escape semantic. The matcher walks scopes narrowest-first,
// so registering Escape here costs the page-scope `nav.back.escape` nothing.
keymap.install();
keymap.register(overlayEscapeBinding());

wireStartScreen();
wireSlideshow();
wireWindowToWM();
wireTmuxToRouter();
wireOverlays();
wireKeyboard();
wireFocusNav();
wireShare();
wireAnchorNav();

