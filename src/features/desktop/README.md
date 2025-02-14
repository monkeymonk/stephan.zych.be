# Desktop Feature

Full-viewport desktop surface with app icons and floating action buttons.

## Components

### `<sz-desktop>`
Pure container — fixed position, full viewport, z-index 0.

### `<sz-desktop-icons>`
Grid of desktop app shortcuts with floating action buttons (FABs).

**Actions dispatched:**
- `desktop:icon-launch` — payload: `{ id, action, url, label, icon }`
- `desktop:tile-toggle` — request window tiling
- `desktop:wallpaper-next` / `desktop:wallpaper-prev` — slideshow control

**Mobile:** Hidden via CSS media query (max-width: 768px).

## Usage
```html
<sz-desktop>
  <sz-background>
    <sz-slideshow mode="slideshow" interval="30000"></sz-slideshow>
  </sz-background>
  <sz-desktop-icons></sz-desktop-icons>
</sz-desktop>
```
