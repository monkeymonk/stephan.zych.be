# Window Feature

Thin visual window shell with titlebar and traffic-light buttons.

## Components

### `<sz-window>`
**Properties:**
- `titlebar`: `'visible' | 'integrated' | 'hidden'` (default: `'visible'`)
- `title`: string
- `buttons`: string[] (default: `['close', 'maximize', 'minimize']`)

**Slots:**
- Default — main content
- `slot="bar"` — bar area (e.g. tmux bar)
- `slot="overlay"` — absolute-positioned overlay (e.g. palette)

**DOM API:**
- `setLayout({ x, y, w, h })` — set position/size
- `getLayout()` — get current bounds
- `resetLayout()` — remove inline position/size
- `bringToFront()` — raise z-index

**Actions dispatched:**
- `window:close-request` — payload: `{ windowId }`
- `window:maximize-request` — payload: `{ windowId }`
- `window:minimize-request` — payload: `{ windowId }`

## Usage
```html
<sz-window id="my-window" titlebar="integrated">
  <div slot="bar">Bar content</div>
  Main content here
  <div slot="overlay">Overlay content</div>
</sz-window>
```
