import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { KeymapController } from '../../core/keymap-controller.js';
import { mobileQuery } from '../../core/styles.js';
import { scrollByLines, scrollRoot, scrollToBottom, scrollToTop } from '../../core/scroll.js';

type ScrollIntent = 'down' | 'up' | 'top' | 'bottom';

@customElement('sz-neovim')
export class SzNeovim extends LitElement {
  @property({ type: Boolean, attribute: 'show-gutter' }) showGutter = false;

  /**
   * The reader's scroll keys, all `page` scope: while a modal owns the
   * keyboard its own j/k move its list, not the article behind it.
   *
   * `gg` is a real sequence now. The keymap holds a lone `g` as a pending
   * prefix and leaves it unconsumed, which is what the timestamp state machine
   * that used to live here did by hand — and only for this one component.
   * Arrow/Home/End are not character keys, so the WCAG 2.1.4 switch never
   * disables them; only j/k/gg/G go through it.
   */
  private keysCtrl = new KeymapController(this, [
    {
      id: 'scroll.down.j', keys: ['j'], scope: 'page', chars: true,
      description: 'Scroll down', run: () => this.moveScroller('down'),
    },
    {
      id: 'scroll.up.k', keys: ['k'], scope: 'page', chars: true,
      description: 'Scroll up', run: () => this.moveScroller('up'),
    },
    {
      id: 'scroll.top.gg', keys: ['g', 'g'], scope: 'page', chars: true,
      description: 'Scroll to top', run: () => this.moveScroller('top'),
    },
    {
      id: 'scroll.bottom.G', keys: ['G'], scope: 'page', chars: true,
      description: 'Scroll to bottom', run: () => this.moveScroller('bottom'),
    },
    {
      id: 'scroll.down', keys: ['ArrowDown'], scope: 'page', chars: false,
      run: () => this.moveScroller('down'),
    },
    {
      id: 'scroll.up', keys: ['ArrowUp'], scope: 'page', chars: false,
      run: () => this.moveScroller('up'),
    },
    {
      id: 'scroll.top', keys: ['Home'], scope: 'page', chars: false,
      description: 'Jump to top', run: () => this.moveScroller('top'),
    },
    {
      id: 'scroll.bottom', keys: ['End'], scope: 'page', chars: false,
      description: 'Jump to bottom', run: () => this.moveScroller('bottom'),
    },
  ]);

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
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    mobileQuery.removeEventListener('change', this.applyLayout);
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

  /**
   * Move the active scroller, and report whether it actually went anywhere.
   * Only a real movement consumes the key: at either end of the document the
   * arrows must fall through to caret browsing and to any widget that handles
   * them after us.
   *
   * Not named `scroll`: that is a public method on HTMLElement, and
   * redeclaring it private breaks this class's assignability to HTMLElement
   * (which takes `@customElement` and `createRenderRoot` down with it) while
   * shadowing a real DOM method at runtime.
   */
  private moveScroller(intent: ScrollIntent): boolean {
    const root = scrollRoot();
    const before = root.scrollTop;

    if (intent === 'down') scrollByLines(1);
    else if (intent === 'up') scrollByLines(-1);
    else if (intent === 'top') scrollToTop();
    else scrollToBottom();

    return root.scrollTop !== before;
  }
}
