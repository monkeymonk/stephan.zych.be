import { deepActiveElement } from '../../core/keyboard.js';

// Generic focus trap — keeps Tab/Shift+Tab cycling within a container.
// Works across shadow DOM boundaries by walking the composed tree.
//
// A trap is only ever correct for genuinely MODAL UI. Arming it because a
// container merely holds focus makes everything outside it permanently
// unreachable (WCAG 2.1.2), so callers must activate it from a real
// overlay/dialog state and release it when that state ends.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// `offsetParent` is null for every position: fixed element, so it cannot be
// the visibility test — the mobile chrome (titlebar, statusbar, tmux bar) is
// fixed and would silently drop out of the cycle. Client rects have no such
// hole: they are empty for display:none and for detached nodes.
function isFocusableNow(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) return false;
  if (el.closest('[inert]')) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

function getFocusableElements(root: HTMLElement | ShadowRoot): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const seen = new WeakSet();

  const collectFromNode = (node: HTMLElement | ShadowRoot) => {
    if (seen.has(node)) return;
    seen.add(node);

    // Check direct focusable children
    const candidates = node.querySelectorAll<HTMLElement>(FOCUSABLE);
    for (const el of candidates) {
      if (!seen.has(el) && isFocusableNow(el)) {
        seen.add(el);
        elements.push(el);
      }
    }

    // Recurse into shadow roots, slots, and slot-assigned content
    const allEls = node.querySelectorAll('*');
    for (const el of allEls) {
      if (el.shadowRoot && !seen.has(el.shadowRoot)) {
        collectFromNode(el.shadowRoot);
      }
      if (el instanceof HTMLSlotElement) {
        walkSlot(el);
      }
    }
  };

  const walkSlot = (slot: HTMLSlotElement) => {
    for (const assigned of slot.assignedElements()) {
      if (!(assigned instanceof HTMLElement) || seen.has(assigned)) continue;
      // Check the element itself
      if (assigned.matches(FOCUSABLE) && isFocusableNow(assigned)) {
        seen.add(assigned);
        elements.push(assigned);
      }
      // If the assigned element is itself a slot, walk its assignments
      if (assigned instanceof HTMLSlotElement) {
        walkSlot(assigned);
      } else {
        collectFromNode(assigned);
        // Also walk the assigned element's shadow root
        if (assigned.shadowRoot && !seen.has(assigned.shadowRoot)) {
          collectFromNode(assigned.shadowRoot);
        }
      }
    }
  };

  collectFromNode(root);
  return elements;
}

export interface FocusTrapOptions {
  /**
   * Element focus returns to when the trap releases. Defaults to whatever was
   * focused at activate() time — the thing that opened the modal.
   */
  returnFocusTo?: HTMLElement | null;
  /** Invoked when Escape releases the trap, so the owner can close its UI. */
  onEscape?: () => void;
}

export class FocusTrap {
  private root: HTMLElement;
  private active = false;
  private handleKeydown: (e: KeyboardEvent) => void;
  private cachedFocusable: HTMLElement[] | null = null;
  private observer: MutationObserver | null = null;
  private returnFocusTo: HTMLElement | null = null;
  private onEscape: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.handleKeydown = (e: KeyboardEvent) => {
      if (!this.active) return;

      // A trap without an exit is itself the 2.1.2 failure. Escape always
      // releases and hands focus back to whatever opened the modal.
      if (e.key === 'Escape') {
        e.preventDefault();
        const onEscape = this.onEscape;
        this.release();
        onEscape?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = this.getFocusable();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (this.isActiveElement(first)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (this.isActiveElement(last)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
  }

  private getFocusable(): HTMLElement[] {
    if (!this.cachedFocusable) {
      this.cachedFocusable = getFocusableElements(this.root.shadowRoot ?? this.root);
    }
    return this.cachedFocusable;
  }

  private invalidateCache = () => {
    this.cachedFocusable = null;
  };

  private isActiveElement(el: HTMLElement): boolean {
    return deepActiveElement() === el;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Arm the trap. Only legitimate while the root is a real modal surface. */
  activate(options: FocusTrapOptions = {}): void {
    if (this.active) return;
    this.active = true;
    this.cachedFocusable = null;
    const previous = options.returnFocusTo ?? deepActiveElement();
    this.returnFocusTo = previous instanceof HTMLElement ? previous : null;
    this.onEscape = options.onEscape ?? null;
    document.addEventListener('keydown', this.handleKeydown, true);
    this.observer = new MutationObserver(this.invalidateCache);
    this.observer.observe(this.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'tabindex'] });
  }

  /** Disarm without touching focus. */
  deactivate(): void {
    this.active = false;
    this.cachedFocusable = null;
    this.returnFocusTo = null;
    this.onEscape = null;
    document.removeEventListener('keydown', this.handleKeydown, true);
    this.observer?.disconnect();
    this.observer = null;
  }

  /** Disarm and return focus to the invoker. */
  release(): void {
    const target = this.returnFocusTo;
    this.deactivate();
    if (target?.isConnected) target.focus();
  }

  focusFirst(): void {
    const focusable = getFocusableElements(
      this.root.shadowRoot ?? this.root
    );
    focusable[0]?.focus();
  }

  destroy(): void {
    this.deactivate();
  }
}
