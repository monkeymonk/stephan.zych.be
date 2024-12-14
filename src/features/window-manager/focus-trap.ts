// Generic focus trap — keeps Tab/Shift+Tab cycling within a container.
// Works across shadow DOM boundaries by walking the composed tree.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(root: HTMLElement | ShadowRoot): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const seen = new WeakSet();

  const collectFromNode = (node: HTMLElement | ShadowRoot) => {
    if (seen.has(node)) return;
    seen.add(node);

    // Check direct focusable children
    const candidates = node.querySelectorAll<HTMLElement>(FOCUSABLE);
    for (const el of candidates) {
      if (!seen.has(el) && el.offsetParent !== null) {
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
      if (assigned.matches(FOCUSABLE) && assigned.offsetParent !== null) {
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

export class FocusTrap {
  private root: HTMLElement;
  private active = false;
  private handleKeydown: (e: KeyboardEvent) => void;

  constructor(root: HTMLElement) {
    this.root = root;
    this.handleKeydown = (e: KeyboardEvent) => {
      if (!this.active || e.key !== 'Tab') return;

      const focusable = getFocusableElements(
        this.root.shadowRoot ?? this.root
      );
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

  private isActiveElement(el: HTMLElement): boolean {
    let active: Element | null = document.activeElement;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active === el;
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    document.addEventListener('keydown', this.handleKeydown, true);
  }

  deactivate(): void {
    this.active = false;
    document.removeEventListener('keydown', this.handleKeydown, true);
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
