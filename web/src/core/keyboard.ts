import { appState } from './state.js';

/** Deepest focused element: document.activeElement stops at a shadow host. */
export function deepActiveElement(): Element | null {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return el;
}

export function isInputFocused(): boolean {
  const el = deepActiveElement();
  if (!el) return false;
  const tag = el.tagName;
  // SELECT belongs here too: a focused dropdown consumes letter keys for its
  // own type-ahead, so a site-wide letter shortcut would fight it.
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  );
}

/**
 * Whether bare-character shortcuts are currently allowed. `core/keymap.ts`
 * consults this for every binding declared `chars: true`, and that flag is the
 * single place the decision is expressed — it used to be re-derived at eight
 * callsites, one of which had it wrong.
 *
 * WCAG 2.1.4 (Character Key Shortcuts, AA) requires a way to switch off
 * shortcuts bound to a bare letter, number or punctuation key: while they are
 * on, browser type-ahead-find and assistive-technology pass-through
 * keystrokes trigger navigation instead. The keys themselves are this site's
 * identity (the SSH TUI implements the same ones), so the remedy is this
 * switch — user setting `keyShortcuts`, flipped from `:set keys on|off` or the
 * tab-bar toggle — not their removal.
 *
 * Three keys are exempt and declared `chars: false`: the palette prefixes
 * `:`, `/` and `?`. That does narrow strict conformance, and it is still the
 * better trade: they are the switch's own control surface, so gating them left
 * a keyboard-only user who ran `:set keys off` with no way to type
 * `:set keys on` again. Everything else bound to a bare key answers to the
 * switch. Modified shortcuts (Alt+…), Escape and Tab are outside the criterion
 * and stay live in both states, so they are declared `chars: false` too and
 * never reach this function.
 *
 * False means: leave the keystroke entirely alone, so it still reaches the
 * browser and the AT.
 */
export function singleKeyAllowed(): boolean {
  if (isInputFocused()) return false;
  return appState.get('keyShortcuts');
}
