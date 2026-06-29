// Core initialization
import { registry } from '../core/registry.js';
import { router } from '../core/router.js';
import { actions, THEME_ACTION, ROUTER_ACTION } from '../core/actions.js';
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

// UI primitives
import '../components/ui/sz-icon.js';
import '../components/ui/sz-panel.js';
import '../components/ui/sz-view-toggle.js';
import '../components/ui/sz-toc.js';
import '../components/ui/sz-links.js';
import '../components/ui/sz-diagram.js';
import '../components/ui/sz-copyright-footer.js';

// Background / ambient layer
import '../components/background/sz-background.js';
import '../components/background/sz-slideshow.js';

// Content widgets (used inside markdown pages)
import '../components/widgets/sz-neofetch.js';
import '../components/widgets/sz-gitlog.js';
import '../components/widgets/sz-stats.js';
import '../components/widgets/sz-wakapi.js';
import '../components/widgets/sz-contact-card.js';
import '../components/widgets/sz-copy.js';

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

// Apply saved view mode (code ⟷ reading) on <html> and keep it in sync.
// On mobile the code view's line-number gutter doesn't fit, so we force the
// reading view there (the toggle is hidden via CSS) and restore the saved
// preference when back on a wide viewport.
const mobile = window.matchMedia('(max-width: 768px)');
const applyViewMode = () =>
  document.documentElement.setAttribute(
    'data-view',
    mobile.matches ? 'reading' : appState.get('viewMode'),
  );
applyViewMode();
appState.subscribe(applyViewMode);
mobile.addEventListener('change', applyViewMode);

// Apply saved text-size scale (accessibility "aA" control) by setting the
// --sz-font-scale multiplier inline on <html>, which wins over the :root
// default and rescales the whole site. Kept in sync with appState.
const applyFontScale = () =>
  document.documentElement.style.setProperty('--sz-font-scale', String(appState.get('fontScale')));
applyFontScale();
appState.subscribe(applyFontScale);

// Initialize SPA router
router.init();

// Render mermaid diagrams (lazy-loaded) on first paint and after each SPA nav.
import { initMermaid } from '../features/mermaid/mermaid.js';
void initMermaid();
actions.on(ROUTER_ACTION.ROUTE_CHANGED, () => void initMermaid());

// A little something for the curious who open DevTools.
import { printConsoleGreeting, installConsoleApi } from '../core/console-greeting.js';
installConsoleApi();
printConsoleGreeting();
