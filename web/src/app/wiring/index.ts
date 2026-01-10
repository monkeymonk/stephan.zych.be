import { wireStartScreen } from './start-screen.js';
import { wireSlideshow } from './slideshow.js';
import { wireWindowToWM } from './window-wm.js';
import { wireTmuxToRouter } from './tmux-router.js';
import { wireNeovimPalette } from './neovim-palette.js';
import { wireKeyboard } from './keyboard.js';

wireStartScreen();
wireSlideshow();
wireWindowToWM();
wireTmuxToRouter();
wireNeovimPalette();
wireKeyboard();
