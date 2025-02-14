# Window Manager Feature

Orchestrates window layout: drag, resize, tiling, z-stack, fullscreen, maximize, show/hide.

## Components

### `<sz-window-manager>`
Uses MutationObserver to detect `<sz-window>` children. Manages them via their public DOM API.

**Actions listened:**
- `wm:show` / `wm:hide` — show/hide windows
- `wm:maximize` — maximize a window
- `wm:fullscreen` — enter fullscreen
- `wm:toggle-mode` — toggle windowed/full-page
- `wm:tile-retile` — tile all visible windows (master-stack)

**Actions dispatched:**
- `wm:mode-changed` — payload: `{ mode }`

**Mobile:** Forces full-page, disables drag/resize/tiling.

## Usage
```html
<sz-window-manager>
  <sz-window id="terminal">...</sz-window>
  <sz-window id="browser">...</sz-window>
</sz-window-manager>
```
