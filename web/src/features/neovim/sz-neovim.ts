import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { isInputFocused, singleKeyAllowed } from '../../core/keyboard.js';
import { mobileQuery } from '../../core/styles.js';
import { scrollByLines, scrollRoot, scrollToBottom, scrollToTop } from '../../core/scroll.js';

/** How long a lone `g` stays pending before it stops completing a `gg`. */
const GG_WINDOW_MS = 600;

type ScrollIntent = 'down' | 'up' | 'top' | 'bottom';

@customElement('sz-neovim')
export class SzNeovim extends LitElement {
  @property({ type: Boolean, attribute: 'show-gutter' }) showGutter = false;

  /** Timestamp of a pending first `g`, 0 when no `gg` is in flight. */
  private lastG = 0;

  // Light DOM for SEO — content is slotted from Eleventy templates
  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    this.style.fontFamily = "'JetBrains Mono', monospace";
    this.style.fontSize = 'var(--sz-font-size, 13px)';
    this.style.lineHeight = '1.5';

    this.applyLayout();
    // #main-content is slotted light DOM: it is only queryable after the
    // template's children have been parsed into us.
    requestAnimationFrame(this.applyLayout);

    mobileQuery.addEventListener('change', this.applyLayout);
    // j/k scroll the page like ArrowDown/ArrowUp
    document.addEventListener('keydown', this.handleScrollKeys);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    mobileQuery.removeEventListener('change', this.applyLayout);
    document.removeEventListener('keydown', this.handleScrollKeys);
  }

  /**
   * Desktop: this element is the fixed-height flex column inside the window
   * and #main-content is the reading scroller. Mobile: the document scrolls,
   * so nothing here may clip and #main-content must not be a scroller at all
   * (see core/scroll.ts for why a subtree scroller breaks iOS).
   *
   * Both modes write *every* property, clearing the ones that do not apply.
   * An inline style set once at connect time never expires on its own, so a
   * live resize across the breakpoint — or a phone rotating — would otherwise
   * strand `overflow-y: auto` on #main-content and the document would never
   * scroll again.
   */
  private applyLayout = () => {
    const mobile = mobileQuery.matches;

    this.style.display = mobile ? 'block' : 'flex';
    this.style.flexDirection = mobile ? '' : 'column';
    this.style.flex = mobile ? '' : '1';
    this.style.overflow = mobile ? '' : 'hidden';
    // Only desktop needs the containing block: the palette/links overlays
    // anchor to the fixed bottom chrome with `position: fixed` on mobile.
    this.style.position = mobile ? '' : 'relative';

    const mainContent = this.querySelector('#main-content');
    if (mainContent instanceof HTMLElement) {
      mainContent.style.flex = mobile ? '' : '1';
      mainContent.style.overflowY = mobile ? '' : 'auto';
      mainContent.style.overflowX = mobile ? '' : 'hidden';
    }
  };

  private handleScrollKeys = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.defaultPrevented || isInputFocused()) return;
    // Resolve what the key means before touching the scroller, so unrelated
    // keystrokes cost nothing. Arrow/Home/End are not character keys, so the
    // WCAG 2.1.4 switch never disables them — only j/k/g/G go through it.
    const chars = singleKeyAllowed();
    let intent: ScrollIntent | null = null;

    if (e.key === 'g' && !e.shiftKey && chars) {
      const now = Date.now();
      const completesGg = this.lastG !== 0 && now - this.lastG <= GG_WINDOW_MS;
      this.lastG = completesGg ? 0 : now;
      // A lone `g` is a pending prefix, not a consumed key — never swallow it,
      // so other `g`-prefixed handlers still see it.
      if (!completesGg) return;
      intent = 'top';
    } else {
      this.lastG = 0;
      switch (e.key) {
        case 'j':
          if (!e.shiftKey && chars) intent = 'down';
          break;
        case 'ArrowDown':
          if (!e.shiftKey) intent = 'down';
          break;
        case 'k':
          if (!e.shiftKey && chars) intent = 'up';
          break;
        case 'ArrowUp':
          if (!e.shiftKey) intent = 'up';
          break;
        case 'Home':
          intent = 'top';
          break;
        case 'G':
          if (chars) intent = 'bottom';
          break;
        case 'End':
          intent = 'bottom';
          break;
      }
      if (intent === null) return;
    }

    const root = scrollRoot();
    const before = root.scrollTop;
    if (intent === 'down') scrollByLines(1);
    else if (intent === 'up') scrollByLines(-1);
    else if (intent === 'top') scrollToTop();
    else scrollToBottom();

    // Only swallow the key when it actually moved the page: at either end of
    // the document, arrows must fall through to caret browsing and to any
    // widget that handles them after us.
    if (root.scrollTop !== before) e.preventDefault();
  };
}
