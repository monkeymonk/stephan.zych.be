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
// The neovim shell + statusbar render on every viewport; the command palette is
// desktop-only and loaded in loadDesktopOnly() below.
import '../features/neovim/sz-neovim.js';
import '../features/neovim/sz-statusbar.js';
import '../features/notifications/index.js';
import '../features/screen-shader/index.js';

// UI primitives
import '../components/ui/sz-icon.js';
import '../components/ui/sz-glass.js';
import '../components/ui/sz-panel.js';
import '../components/ui/sz-view-toggle.js';
import '../components/ui/sz-links.js';
import '../components/ui/sz-diagram.js';
import '../components/ui/sz-copyright-footer.js';

// Background / ambient layer
import '../components/background/sz-background.js';
import '../components/background/sz-slideshow.js';

// Content widgets (sz-toc + sz-gitlog/stats/wakapi/neofetch/contact-card/copy)
// are loaded on demand by ./lazy-components — only when a page actually contains
// them (see loadPresentComponents below).

// Layouts
import '../layouts/sz-dashboard.js';
import '../layouts/sz-markdown.js';
import '../layouts/sz-portfolio.js';

// Wire features together (must run after feature imports)
import './wiring/index.js';
import { wireNeovimPalette } from './wiring/neovim-palette.js';
import { loadPresentComponents } from './lazy-components.js';

// Apply saved theme. Only the default theme's CSS is shipped render-blocking in
// the page <head>; any other theme's stylesheet is fetched on demand the first
// time it's selected (or restored from a saved preference), so the common case
// loads two fewer stylesheets.
function ensureThemeCss(theme: string) {
  const id = `theme-css-${theme}`;
  if (document.getElementById(id)) return; // default theme is already in <head>
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `/assets/themes/${theme}.css`;
  document.head.appendChild(link);
}
ensureThemeCss(appState.get('theme'));
document.documentElement.setAttribute('data-theme', appState.get('theme'));
actions.on(THEME_ACTION.SET, (a) => {
  const theme = a.payload as string;
  ensureThemeCss(theme);
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

// Desktop-only feature set: the command palette is hard-gated off on mobile
// (sz-palette ignores keydowns while the mobile query matches) and the
// matrix/confetti effects are only reachable through it — so neither is ever
// usable on a phone. Skip shipping them to mobile entirely; load if we start
// on, or later resize to, a desktop-width viewport.
let desktopLoaded = false;
function loadDesktopOnly() {
  if (desktopLoaded) return;
  desktopLoaded = true;
  wireNeovimPalette(); // register the palette's command + search sources
  void import('../features/neovim/sz-palette.js');
  void import('../features/effects/index.js');
}
if (!mobile.matches) loadDesktopOnly();
else mobile.addEventListener('change', (e) => { if (!e.matches) loadDesktopOnly(); });

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

// Define page-specific widgets present on the current page, and re-scan after
// each SPA navigation (the router swaps page content).
loadPresentComponents();
actions.on(ROUTER_ACTION.ROUTE_CHANGED, loadPresentComponents);

// A little something for the curious who open DevTools.
import { printConsoleGreeting, installConsoleApi } from '../core/console-greeting.js';
installConsoleApi();
printConsoleGreeting();
