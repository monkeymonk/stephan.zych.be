// Core initialization
import { registry } from '../core/registry.js';
import { router } from '../core/router.js';
import { actions, THEME_ACTION } from '../core/actions.js';
import { appState } from '../core/state.js';

// Initialize registry before feature imports so connectedCallbacks have data available
registry.init();

// Features (side-effect imports trigger custom element registration)
import '../features/start-screen/index.js';
import '../features/window/index.js';
import '../features/window-manager/index.js';
import '../features/tmux/index.js';
import '../features/neovim/index.js';
import '../features/notifications/index.js';
import '../features/effects/index.js';
import '../features/screen-shader/index.js';

// Shared components
import '../components/sz-icon.js';
import '../components/sz-background.js';
import '../components/sz-slideshow.js';

// Content widgets (used inside markdown pages)
import '../components/sz-neofetch.js';
import '../components/sz-gitlog.js';
import '../components/sz-stats.js';
import '../components/sz-contact-card.js';

// Layouts
import '../layouts/sz-dashboard.js';
import '../layouts/sz-markdown.js';
import '../layouts/sz-portfolio.js';

// Wire features together (must run after feature imports)
import './wiring/index.js';

// Apply saved theme
document.documentElement.setAttribute('data-theme', appState.get('theme'));
actions.on(THEME_ACTION.SET, (a) => {
  const theme = a.payload as string;
  appState.set('theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
});

// Initialize SPA router
router.init();
