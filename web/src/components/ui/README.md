# UI Components

Reusable presentation primitives and the two keyboard surfaces that are not
features of their own. Everything here is generic: no component in this
directory knows a route, a content type, or a command.

## Components

### `<sz-copyright-footer>`
Discreet copyright notice pinned bottom-left, floating over the desktop beneath
the terminal window. Only its link is interactive, so the rest of the desktop
stays clickable; the SPA router picks that link up through `composedPath()`. No
attributes.

### `<sz-diagram>`
Wraps a rendered Mermaid diagram and adds a zoom lightbox. `+`/`=`, `-` and `0`
scale and reset while it is open. The lightbox covers the page and traps focus,
so it is a modal overlay and declares itself to the overlay registry.

**Slots:** default — the `pre.mermaid` block

### `<sz-glass>`
Reusable "liquid glass" material: a refractive, tinted, specular-lit surface
behind a slot, warped through an SVG displacement filter. Knows nothing about
what it wraps.

**Attributes:**
- `scale`: number (default: `60`) — refraction strength

**Custom properties:** `--glass-radius`, `--glass-tint`, `--glass-shine-1`,
`--glass-shine-2`, `--glass-backdrop`, `--glass-shadow`

**Slots:** default — the content under glass

### `<sz-icon>`
Inline SVG from a fixed in-module set (`folder`, `folder-open`, `file`,
`git-branch`, `github`, `linkedin`, `mail`, `music`, `sun`, `moon`, `terminal`,
`search`, `x`, `coffee`, `external`). No sprite request, no icon font.

**Attributes:**
- `name`: string — one of the ids above
- `size`: number (default: `16`) — px, square

### `<sz-links>`
The `l` link picker: every link in the current article, `j`/`k` to move, `Enter`
to follow. Following clicks the real anchor, so the SPA router and new-tab
behaviour are reused as-is. A modal overlay (`aria-modal`), so it declares
itself to the overlay registry and its keys are scoped to it.

### `<sz-panel>`
Boxed panel with an optional command-line header. The only component here that
renders two ways: it extends `ViewAwareElement` (`core/view-aware.ts`), so the
box becomes plain framed text in the code view.

**Attributes:**
- `cmd`: string — the header line, e.g. `cat example.ts`. Omit for a bare box.

**Slots:** default — panel body

### `<sz-toc>`
Reading aid for articles: a sticky outline rail with scroll-spy plus a thin top
progress bar. Reads headings straight from the rendered light DOM, so it needs
no data wiring — drop it above an article body. The scroller it measures
against is viewport-dependent (`#main-content` on desktop, the document under
768px, per `core/scroll.js`). No attributes.

### `<sz-view-toggle>`
Switches an article between the line-numbered code view and the readable view.
Backed by the persisted `appState.viewMode`, applied globally via
`<html data-view>`, and also driven by `:set view`. No attributes.
