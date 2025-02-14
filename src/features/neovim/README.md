# Neovim Feature

Neovim-inspired content container with statusbar and command palette.

## Components

### `<sz-neovim>`
Light DOM container (for SEO). Applies terminal font constraints.

### `<sz-statusbar>`
Vim-style statusbar with mode indicator, route path, branch, theme, and social links.

**Actions listened:**
- `router:route-changed` — updates displayed route

**Mobile:** Hides center segment and socials.

### `<sz-palette>`
Unified command palette with pluggable sources via PaletteRegistry.

**Actions listened:**
- `neovim:palette-open` — open with specific prefix

**Keyboard:**
- Registered prefix keys (e.g. `:`, `/`) open the palette
- `?` opens help overlay
- `Escape` closes
- Tab autocompletes / cycles suggestions
- Arrow keys navigate suggestions

## Usage
```html
<sz-neovim>
  <div id="main-content">Page content</div>
  <sz-statusbar></sz-statusbar>
</sz-neovim>
<sz-palette slot="overlay"></sz-palette>
```
