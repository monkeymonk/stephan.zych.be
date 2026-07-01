import { wireStartScreen } from './start-screen.js';
import { wireSlideshow } from './slideshow.js';
import { wireWindowToWM } from './window-wm.js';
import { wireTmuxToRouter } from './tmux-router.js';
import { wireKeyboard } from './keyboard.js';
import { wireFocusNav } from './focus-nav.js';

// wireNeovimPalette() is desktop-only — invoked from app/index.ts's
// loadDesktopOnly(), since the palette it feeds is never loaded on mobile.

wireStartScreen();
wireSlideshow();
wireWindowToWM();
wireTmuxToRouter();
wireKeyboard();
wireFocusNav();
