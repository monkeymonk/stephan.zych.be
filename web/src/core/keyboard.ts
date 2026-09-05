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
 * The one gate every unmodified single-character shortcut consults.
 *
 * WCAG 2.1.4 (Character Key Shortcuts, AA) requires a way to switch off
 * shortcuts bound to a bare letter/number/punctuation key: while they are on,
 * browser type-ahead-find and assistive-technology pass-through keystrokes
 * trigger navigation instead. The keys themselves are this site's identity
 * (the SSH TUI implements the same ones), so the remedy is this switch — user
 * setting `keyShortcuts`, flipped from `:set keys on|off` — not their removal.
 * Modified shortcuts (Alt+…), Escape and Tab are outside the criterion and
 * stay live in both states, so they must not route through here.
 *
 * False means: leave the keystroke entirely alone, so it still reaches the
 * browser and the AT.
 */
export function singleKeyAllowed(): boolean {
  if (isInputFocused()) return false;
  return appState.get('keyShortcuts');
}
