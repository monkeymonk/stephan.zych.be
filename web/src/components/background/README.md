# Background Components

The desktop behind everything else: a fixed, full-viewport, pointer-transparent
stack of gradient, wallpaper, grain and grid layers at `z-index: 0`.

## Components

### `<sz-background>`
The layer stack itself. No attributes.

**Slots:**
- default — rendered as the wallpaper layer, between the gradient underneath
  and the grain/grid overlays on top (this is where `<sz-slideshow>` goes)

### `<sz-slideshow>`
Cross-fades wallpapers on a timer, two layers swapping so the outgoing image
fades out while the incoming one fades in.

It knows no wallpaper list. The component exposes `SlideshowApi`
(`setImages`, `next`, `prev`) and `app/wiring/slideshow.ts` injects
`registry.wallpapers` into it and translates the actions below into API calls —
the reference example of how a component here stays agnostic and gets its
collaborators from the wiring layer.

**Attributes:**
- `interval`: number (default: `30000`) — ms between wallpapers

**Actions dispatched:**
- `slideshow:next` / `slideshow:prev` — from its own hover controls; the wiring
  is what turns them back into `next()` / `prev()`, so `Alt`+`N` and the
  buttons travel the same path
- `slideshow:change` — payload: `{ url }`, so anything tinting itself against
  the wallpaper (the start screen) can resample

## Usage
```html
<sz-background>
  <sz-slideshow interval="30000"></sz-slideshow>
</sz-background>
```
