import { wireDesktopToWM } from './desktop-wm.js';
import { wireDesktopToSlideshow } from './desktop-slideshow.js';
import { wireWindowToWM } from './window-wm.js';
import { wireTmuxToRouter } from './tmux-router.js';
import { wireNeovimPalette } from './neovim-palette.js';
import { wireKeyboard } from './keyboard.js';

wireDesktopToWM();
wireDesktopToSlideshow();
wireWindowToWM();
wireTmuxToRouter();
wireNeovimPalette();
wireKeyboard();
