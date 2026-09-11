// Keybinding registry — one document listener for the whole site, and the
// single place that decides whether a keystroke is allowed to act.
//
// THE RULE THIS FILE EXISTS TO ENFORCE
//
// A binding belongs here when it fires with focus anywhere in the document.
// A binding belongs to its component when it only acts while focus is already
// inside that component — a roving tabindex, a Tab trap under `aria-modal`,
// `aria-activedescendant` movement. Those are ARIA Authoring Practices
// obligations of the widget and must hold even with no registry mounted, so
// they are NEVER registered here and never gated by anything.
//
// Four tiers, in resolution order:
//   1. `scope: 'overlay:<id>'` — acts only while that overlay is the current
//      modal (list navigation, zoom, close-on-`q`).
//   2. `scope: 'always'`       — above every question, including whether a
//      text field has focus. Escape, and nothing else.
//   3. `scope: 'global'`       — eligible whatever overlay is open, but still
//      silent while a text field has focus. This is what an *opener* needs:
//      `:` `/` `?` have to be able to displace the link picker, and a `page`
//      binding never can, because claiming the slot is how one overlay
//      closes another.
//   4. `scope: 'page'`         — site-wide; suppressed while any modal owns
//      the keyboard, because the overlay owns the keys then.
//   5. intrinsic widget mechanics — not in this file at all.
//
// WCAG 2.1.4 (Character Key Shortcuts, AA) requires a way to switch off
// shortcuts bound to a bare character key. `chars: true` declares that a
// binding is such a shortcut, and is the ONLY place that decision is made —
// it used to be re-made at eight callsites, one of which had it wrong.
//
// The three palette prefixes (`:` `/` `?`) are declared `chars: false` on
// purpose: they are the switch's own control surface. With them gated, a
// keyboard-only user who ran `:set keys off` could never type `:set keys on`
// again. Every letter, bracket and digit shortcut still answers to the switch.

import { isInputFocused } from './keyboard.js';
import { overlayRegistry, type OverlayRegistryApi } from './overlays.js';
import { appState } from './state.js';

/** How long a pending multi-key prefix (e.g. a lone `g`) stays live. */
export const SEQUENCE_WINDOW_MS = 600;

export type KeyScope = 'always' | 'global' | 'page' | `overlay:${string}`;

export interface KeyBinding {
  /** Stable dotted id: 'links.open', 'palette.command', 'scroll.top'. */
  readonly id: string;

  /**
   * The keystroke, as `KeyboardEvent.key` values. More than one entry is a
   * sequence: `['g', 'g']` fires on the second `g` within
   * {@link SEQUENCE_WINDOW_MS}. A lone prefix is never consumed, so other
   * handlers still see it.
   */
  readonly keys: readonly string[];

  /**
   * Required modifiers. Omitted means "no modifier" — a binding without
   * `alt` does not fire when Alt is held, and vice versa, so Alt+W can never
   * be confused with `w`. Shift is matched through `keys` itself (`'G'`).
   */
  readonly alt?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;

  readonly scope: KeyScope;

  /**
   * True when this is a bare character shortcut subject to the WCAG 2.1.4
   * switch (`appState.keyShortcuts`, `:set keys on|off`). False for modified
   * bindings, Escape, Tab, arrows, Home/End — and for the palette prefixes.
   */
  readonly chars: boolean;

  /** Extra guard: viewport, page shape, presence of a target element. */
  when?(): boolean;

  /**
   * Human-readable, surfaced in the help overlay and cross-checked against
   * `content/data/shortcuts.json`. Omit for internal bindings that should not
   * be advertised.
   */
  readonly description?: string;

  /**
   * Perform the action. Return `false` (or nothing) to signal "not consumed":
   * the keymap leaves the event entirely alone so it still reaches the browser
   * and assistive tech. Return `true` to consume it, and the keymap calls
   * `preventDefault()`.
   *
   * Declining does NOT hand the key to the next binding: first match wins,
   * and a match that declines ends the lookup. When the decision is knowable
   * without acting, put it in `when` — that keeps the binding out of the match
   * entirely and lets a lower tier answer. Returning `false` is for the case
   * you can only discover by trying, like a scroll that was already at the end
   * of the document.
   */
  run(event: KeyboardEvent): boolean | void;
}

/** Everything `resolve` needs, passed in so it stays pure and testable. */
export interface KeyContext {
  /** Current modal overlay id, or null. */
  readonly overlay: string | null;
  /**
   * Live `layer` overlays. They never own the keyboard, but they do scope
   * keys while they are up: a running effect needs `q` to dismiss it rather
   * than back out to the section archive.
   */
  readonly layers: readonly string[];
  /** Whether bare character shortcuts are currently allowed. */
  readonly charsAllowed: boolean;
  /** Keys already pending from an in-flight sequence. */
  readonly pending: readonly string[];
}

export type KeyResolution =
  | { readonly kind: 'none' }
  /** A sequence prefix matched: hold it, consume nothing. */
  | { readonly kind: 'pending'; readonly keys: readonly string[] }
  | { readonly kind: 'binding'; readonly binding: KeyBinding };

export interface KeymapApi {
  /** Register bindings; returns an unregister function for all of them. */
  register(...bindings: KeyBinding[]): () => void;

  /** Remove a single binding by id. */
  unregister(id: string): void;

  /** Every registered binding, registration order preserved. */
  bindings(): readonly KeyBinding[];

  /**
   * Attach the one and only document keydown listener. Idempotent: calling it
   * twice does not double-bind. Returns a teardown function.
   */
  install(): () => void;

  /**
   * Pure decision function: given an event and a context, which binding (if
   * any) should act. No DOM access, no side effects — this is what the
   * verification harness drives directly.
   */
  resolve(event: KeyboardEvent, context: KeyContext): KeyResolution;
}

/** True while the keys already typed are still a prefix of this binding. */
function continues(keys: readonly string[], pending: readonly string[]): boolean {
  for (let i = 0; i < pending.length; i++) {
    if (keys[i] !== pending[i]) return false;
  }
  return true;
}

class Keymap implements KeymapApi {
  private registered: KeyBinding[] = [];

  /** Set exactly while the one document listener is attached. */
  private detach: (() => void) | null = null;

  /** The in-flight sequence prefix, and the moment it stops counting. */
  private pending: readonly string[] = [];
  private pendingUntil = 0;

  register(...bindings: KeyBinding[]): () => void {
    this.registered.push(...bindings);
    // Removal is by identity, not by id: a host replacing its set with one
    // that reuses an id (KeymapController.setBindings) must not have the new
    // binding torn out by the old set's unregister.
    return () => {
      for (const binding of bindings) {
        const index = this.registered.indexOf(binding);
        if (index !== -1) this.registered.splice(index, 1);
      }
    };
  }

  unregister(id: string): void {
    const index = this.registered.findIndex(binding => binding.id === id);
    if (index !== -1) this.registered.splice(index, 1);
  }

  bindings(): readonly KeyBinding[] {
    return this.registered;
  }

  install(): () => void {
    // Idempotent: wiring installs at startup and a lazily loaded feature may
    // install again. A second listener would run every binding twice and
    // preventDefault on the first pass.
    if (this.detach) return this.detach;

    const listener = (event: KeyboardEvent): void => this.handle(event);
    // Bubble phase, like the hand-rolled listeners this replaces. Capture
    // would put the keymap ahead of the intrinsic widget mechanics (focus
    // traps, roving grids) that have to win.
    document.addEventListener('keydown', listener);

    const detach = (): void => {
      // A teardown held over from an earlier install must not unbind the
      // listener a later install put in its place.
      if (this.detach !== detach) return;
      document.removeEventListener('keydown', listener);
      this.detach = null;
      this.pending = [];
    };
    this.detach = detach;
    return detach;
  }

  resolve(event: KeyboardEvent, context: KeyContext): KeyResolution {
    return this.match(event, context, false);
  }

  private handle(event: KeyboardEvent): void {
    // Something downstream already claimed this keystroke — a focus trap, a
    // widget's own mechanics. The keymap never acts on top of that.
    if (event.defaultPrevented) return;

    const now = Date.now();
    if (this.pending.length > 0 && now > this.pendingUntil) this.pending = [];

    const resolution = this.match(
      event,
      {
        overlay: overlayRegistry.current(),
        layers: overlayRegistry.openLayers(),
        charsAllowed: appState.get('keyShortcuts'),
        pending: this.pending,
      },
      // With a text field focused only `always` bindings survive; anything
      // else would eat what the user is typing.
      isInputFocused(),
    );

    if (resolution.kind === 'pending') {
      this.pending = resolution.keys;
      this.pendingUntil = now + SEQUENCE_WINDOW_MS;
      // No preventDefault: a lone `g` is a prefix, not a consumed key, and
      // the browser and assistive tech must still see it.
      return;
    }

    // Any key that is not the next one in the sequence ends the sequence,
    // whether or not it matched something else.
    this.pending = [];
    if (resolution.kind === 'none') return;
    if (resolution.binding.run(event) === true) event.preventDefault();
  }

  /**
   * The matcher itself. Pure, and shared: `resolve` is this with every scope
   * eligible, the listener is this with the input-focus restriction applied.
   *
   * Specificity decides before registration order. The tiers are walked
   * narrowest-first, and only inside one tier does registration order break a
   * tie. Without that, a `global` opener registered at connect time shadows
   * the `overlay:` binding for the same key: a re-pressed `:` would toggle
   * the palette shut instead of refocusing its input, and every future opener
   * would have to hand-guard itself with `when: () => !thisOverlayIsOpen`.
   * Ordering it here fixes it once, for every binding.
   */
  private match(event: KeyboardEvent, context: KeyContext, alwaysOnly: boolean): KeyResolution {
    // Escape first, whatever is open: one Escape semantic site-wide. Then the
    // surface that owns the keyboard, then any live layer (an effect painting
    // over the page still gets to own its dismiss key), then openers, then the
    // page.
    const tiers: readonly ((scope: KeyScope) => boolean)[] = [
      scope => scope === 'always',
      scope => context.overlay !== null && scope === `overlay:${context.overlay}`,
      scope => context.layers.some(id => scope === `overlay:${id}`),
      scope => scope === 'global',
      scope => scope === 'page' && context.overlay === null,
    ];

    for (const tier of tiers) {
      for (const binding of this.registered) {
        if (alwaysOnly && binding.scope !== 'always') continue;
        if (!tier(binding.scope)) continue;
        // Skipped, not consumed: with the WCAG 2.1.4 switch off, the keystroke
        // has to reach the browser and assistive tech untouched.
        if (binding.chars && !context.charsAllowed) continue;
        // An omitted modifier means "not held", so Alt+W is never confused
        // with `w`.
        if (event.altKey !== (binding.alt ?? false)) continue;
        if (event.ctrlKey !== (binding.ctrl ?? false)) continue;
        if (event.metaKey !== (binding.meta ?? false)) continue;

        const depth = context.pending.length;
        if (depth >= binding.keys.length) continue;
        if (!continues(binding.keys, context.pending)) continue;
        // Case-sensitive: `G` is its own binding, which is how Shift is
        // expressed.
        if (binding.keys[depth] !== event.key) continue;
        // `when` last: it is the one predicate allowed to read the DOM, so it
        // only runs for the binding that already matched everything cheaper.
        if (binding.when && !binding.when()) continue;

        return depth + 1 === binding.keys.length
          ? { kind: 'binding', binding }
          : { kind: 'pending', keys: binding.keys.slice(0, depth + 1) };
      }
    }
    return { kind: 'none' };
  }
}

export const keymap: KeymapApi = new Keymap();

/**
 * Escape, owned centrally so there is exactly one Escape semantic on the site:
 * close the current modal overlay. Never gated (Escape is outside WCAG 2.1.4),
 * registered by `app/wiring` at startup. Widget Tab traps keep their own
 * Escape-free mechanics; `focus-trap.ts` routes its `onEscape` here.
 *
 * The `when` guard is load-bearing, not a micro-optimisation. This binding is
 * `always`-scope, so it is the first thing the matcher considers; declining
 * inside `run` would end the lookup and make every lower-tier Escape binding
 * — `nav.back.escape`, which backs out of an article to its archive —
 * unreachable. Not matching at all is what lets the page keep its own Escape
 * when no overlay is open.
 */
export function overlayEscapeBinding(registry: OverlayRegistryApi = overlayRegistry): KeyBinding {
  return {
    id: 'overlay.escape',
    keys: ['Escape'],
    scope: 'always',
    chars: false,
    description: 'Close the open panel',
    when: () => registry.isModalOpen(),
    run: () => {
      registry.closeCurrent('user');
      return true;
    },
  };
}
