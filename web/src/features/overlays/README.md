# Overlays Feature

Owns "which surface owns the keyboard right now?". The registry (`core/overlays.ts`) keeps one `modal` slot — claiming it closes the incumbent with reason `superseded` — and tracks `layer` surfaces, which stack and never displace. `core/keymap.ts` reads it to scope bindings and to route Escape.

## Components

This feature ships no element. A surface joins by declaring an `OverlayController` (`core/overlay-controller.ts`), which registers on connect, releases on disconnect, and reflects `[open]` on the host for CSS only — nothing reads that attribute as state, which is what removed the `document.querySelector('sz-links[open]')` probes and sz-links' synchronous attribute write.

**Actions listened:**
- `overlay:open` — payload: `{ id }` — for controls that cannot rely on a keystroke: the mobile search button, the `:help` command, a diagram's enlarge control
- `overlay:close` — payload: `{ id? }` — closes that overlay, or the current modal when `id` is omitted

**Actions dispatched:**
- `overlay:state` — payload: `{ current }` — the current modal's id, or `null`. Dispatched on every change, deduplicated: a close that re-enters the registry cannot produce a repeat or a stale value.

`overlay:state` replaces `NEOVIM_ACTION.PALETTE_STATE`, which announced the palette specifically and nothing else, so every other overlay had to be guessed at. The tmux bar's search-button state becomes overlay-agnostic: it compares `current` against the id it opens.

**Wiring:** the registry and controller exist; no listener for `overlay:open` / `overlay:close` is installed yet, and no surface has been migrated onto the registry. That happens when the overlays move over.

## Usage
```ts
private overlay = new OverlayController(this, {
  id: 'links',
  kind: 'modal',
  onClose: (reason) => this.hide(reason),
});
```

`onClose` must not restore focus when `reason === 'superseded'`: the overlay that displaced this one already holds focus, and restoring would yank it out of the surface the user just opened.
