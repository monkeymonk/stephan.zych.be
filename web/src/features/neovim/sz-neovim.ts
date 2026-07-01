import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { isInputFocused } from '../../core/keyboard.js';

@customElement('sz-neovim')
export class SzNeovim extends LitElement {
  @property({ type: Boolean, attribute: 'show-gutter' }) showGutter = false;

  private mainContent: HTMLElement | null = null;

  // Light DOM for SEO — content is slotted from Eleventy templates
  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    this.style.display = 'flex';
    this.style.flexDirection = 'column';
    this.style.flex = '1';
    this.style.overflow = 'hidden';
    this.style.position = 'relative';
    this.style.fontFamily = "'JetBrains Mono', monospace";
    this.style.fontSize = 'var(--sz-font-size, 13px)';
    this.style.lineHeight = '1.5';

    // Make #main-content scrollable
    requestAnimationFrame(() => {
      const mainContent = this.querySelector('#main-content');
      if (mainContent instanceof HTMLElement) {
        this.mainContent = mainContent;
        mainContent.style.flex = '1';
        mainContent.style.overflowY = 'auto';
        mainContent.style.overflowX = 'hidden';
      }
    });

    // j/k scroll the page like ArrowDown/ArrowUp
    document.addEventListener('keydown', this.handleScrollKeys);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleScrollKeys);
  }

  private handleScrollKeys = (e: KeyboardEvent) => {
    const delta =
      e.key === 'j' || e.key === 'ArrowDown'
        ? 40
        : e.key === 'k' || e.key === 'ArrowUp'
          ? -40
          : null;
    if (delta === null) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.defaultPrevented || isInputFocused()) return;
    if (!this.mainContent) return;
    e.preventDefault();
    this.mainContent.scrollBy({ top: delta });
  };
}
