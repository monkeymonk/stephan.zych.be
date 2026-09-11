// Overlay registry — the single owner of the answer to "which surface owns the
// keyboard right now?".
//
// Before this existed, every overlay knew only its own `open` state and global
// wiring had to DOM-probe named components for reflected attributes
// (`document.querySelector('sz-links[open]')`), which forced sz-links to write
// its `[open]` attribute synchronously because a document keydown dispatch
// reaches the next listener before Lit's microtask update runs. Both of those
// are gone: ask the registry.
//
// Layering: this module depends on nothing but the action bus (it announces
// slot changes on it). `core/keymap.ts` depends on *it* (to scope bindings and
// to route Escape), never the other way around. No DOM access lives here.

import { actions } from './actions.js';
import { OVERLAY_ACTION, type OverlayStateDetail } from '../features/overlays/actions.js';

/**
 * `modal` surfaces are mutually exclusive: they trap focus and own the
 * keyboard while open — the palette, its help overlay, the link picker, the
 * diagram lightbox. Claiming one closes the incumbent.
 *
 * They do not all declare `aria-modal` yet: only the link picker, the diagram
 * lightbox and the window do. The palette and its man page behave modally
 * without saying so, and the man page cannot be given the attribute until it
 * also takes focus — an `aria-modal` surface nothing can reach hides the
 * document behind an unusable dialog. So the invariant worth asserting is *at
 * most one visible `aria-modal`*, not exactly one.
 *
 * `layer` surfaces stack and never displace anything: windows, notifications,
 * the wallpaper, transient effects. They are registered so the keymap can
 * scope bindings to them while they are up, not to take part in exclusivity.
 */
export type OverlayKind = 'modal' | 'layer';

/**
 * Why an overlay is closing. `superseded` is load-bearing: a superseded
 * overlay must NOT restore focus to its invoker, because the overlay that
 * displaced it already holds focus. Restoring would yank focus out of the
 * surface the user just opened.
 */
export type CloseReason = 'user' | 'superseded';

/** What an overlay hands the registry when it registers. */
export interface OverlayEntry {
  /** Stable, unique: 'palette', 'palette-help', 'links', 'diagram'. */
  readonly id: string;
  readonly kind: OverlayKind;
  /** Close the surface. Must be idempotent and must not throw. */
  close(reason: CloseReason): void;
}

export interface OverlayRegistryApi {
  /** Register an overlay. Returns an unregister function (call on disconnect). */
  register(entry: OverlayEntry): () => void;

  /**
   * Make `id` the current modal. Closes the incumbent modal with
   * `'superseded'` first. A `layer` claim records the claim without
   * displacing anything. Claiming an already-current id is a no-op.
   */
  claim(id: string): void;

  /**
   * Give up the slot. Inert unless `id` actually holds something: a release
   * arriving from an already-superseded overlay must neither blank the slot
   * out from under its successor nor close anything a second time. The second
   * close would arrive with reason `'user'`, and a `'user'` close restores
   * focus to the invoker — which would yank focus straight out of the overlay
   * that displaced it.
   */
  release(id: string): void;

  /** The current modal's id, or null. Never reflects `layer` overlays. */
  current(): string | null;

  /**
   * The live `layer` overlays. A layer never owns the keyboard, but it can
   * still scope keys while it is up — a running effect wants `q` to dismiss
   * it, not to back out to the archive — and `core/keymap.ts` cannot ask this
   * registry anything from inside its pure matcher, so it takes the list as
   * context instead.
   */
  openLayers(): readonly string[];

  /** True while any modal owns the keyboard. */
  isModalOpen(): boolean;

  /** True when `id` is registered and currently open. */
  isOpen(id: string): boolean;

  /** Close the current modal, if any. Used by the keymap's Escape binding. */
  closeCurrent(reason?: CloseReason): void;
}

class OverlayRegistry implements OverlayRegistryApi {
  private entries = new Map<string, OverlayEntry>();
  private modal: string | null = null;
  private layers = new Set<string>();
  // Ids whose close() is currently running. A close() drives its host's state,
  // and a host answers state changes by calling release() again; without this
  // the two call each other until the stack runs out.
  private closing = new Set<string>();
  // Last value put on the bus. A re-entrant claim/release announces from the
  // inside out, so without this the outer call would re-announce a value the
  // inner one already sent, or send a stale one after it.
  private announced: string | null = null;

  register(entry: OverlayEntry): () => void {
    this.entries.set(entry.id, entry);
    return () => {
      // A remount registers its new instance before the old one disconnects;
      // only the instance that still holds the id may tear it down, or the
      // stale disconnect unregisters the live overlay.
      if (this.entries.get(entry.id) !== entry) return;
      if (this.modal === entry.id) this.release(entry.id);
      else this.layers.delete(entry.id);
      this.entries.delete(entry.id);
    };
  }

  claim(id: string): void {
    const entry = this.entries.get(id);
    // An unregistered id would take the slot with no close() behind it, and
    // nothing could ever clear it again — not Escape, not the next claim.
    if (!entry) return;

    if (entry.kind === 'layer') {
      this.layers.add(id);
      return;
    }

    if (this.modal === id) return;

    const incumbent = this.modal;
    // Record the new owner *before* closing the incumbent. Closing the
    // incumbent runs its host's state changes, which end in
    // release(incumbent); release only clears the slot for the id that still
    // holds it, so the new owner survives. Swapping these two lines loses it.
    this.modal = id;
    if (incumbent !== null) this.closeEntry(incumbent, 'superseded');
    this.announce();
  }

  release(id: string): void {
    if (this.modal === id) {
      this.modal = null;
    } else if (this.layers.has(id)) {
      this.layers.delete(id);
    } else {
      // Already closed — superseded, or released twice. See the interface doc:
      // closing again here is how focus gets stolen from the live overlay.
      return;
    }
    this.closeEntry(id, 'user');
    this.announce();
  }

  current(): string | null {
    return this.modal;
  }

  openLayers(): readonly string[] {
    return [...this.layers];
  }

  isModalOpen(): boolean {
    return this.modal !== null;
  }

  isOpen(id: string): boolean {
    if (!this.entries.has(id)) return false;
    return this.modal === id || this.layers.has(id);
  }

  closeCurrent(reason: CloseReason = 'user'): void {
    const id = this.modal;
    if (id === null) return;
    this.modal = null;
    this.closeEntry(id, reason);
    this.announce();
  }

  private closeEntry(id: string, reason: CloseReason): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (this.closing.has(id)) return;
    this.closing.add(id);
    try {
      entry.close(reason);
    } catch (e) {
      // The slot was already updated by the caller, so a throwing close()
      // costs a stuck surface, never a stuck registry.
      console.error(`[OverlayRegistry] close("${reason}") threw for "${id}":`, e);
    } finally {
      this.closing.delete(id);
    }
  }

  private announce(): void {
    const current = this.current();
    if (current === this.announced) return;
    this.announced = current;
    actions.dispatch(OVERLAY_ACTION.STATE, { current } satisfies OverlayStateDetail);
  }
}

export const overlayRegistry: OverlayRegistryApi = new OverlayRegistry();
